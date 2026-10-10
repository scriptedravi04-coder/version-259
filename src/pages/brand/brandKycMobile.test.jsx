import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const refreshUser = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "B1", name: "Acme Foods", email: "ops@acme.in", phone: "9999999999" }, refreshUser }),
}));

import BrandKycMobile from "./BrandKycMobile";

const read = (p) => fs.readFileSync(path.resolve(__dirname, "../../..", p), "utf8");

// Session 30: mobile brand KYC (ST-02 → KY-01 → KY-03 → KY-02) on the desktop contract.
describe("session 30: mobile brand KYC", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset(); refreshUser.mockReset(); });

  it("not submitted → status screen with Start verification", async () => {
    apiMock.get.mockResolvedValue({ data: { status: "NOT_SUBMITTED" } });
    render(<MemoryRouter><BrandKycMobile /></MemoryRouter>);
    expect(await screen.findByText("Start verification")).toBeTruthy();
    expect(screen.getAllByText("KYC not submitted").length).toBeGreaterThan(0);
  });

  it("step 1 blocks Continue until GSTIN or PAN is given, then submits the desktop payload", async () => {
    // Session 41 (Ravi): the contact person comes from onboarding (brands/me), not the account name.
    apiMock.get.mockImplementation((url) => Promise.resolve(String(url).startsWith("brands/me")
      ? { data: { representative_name: "Priya Shah", representative_designation: "Marketing head" } }
      : { data: { status: "NOT_SUBMITTED" } }));
    apiMock.post.mockResolvedValue({ data: { ok: true } });
    render(<MemoryRouter><BrandKycMobile /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Start verification"));
    fireEvent.click(screen.getByText("Continue"));
    expect(await screen.findByText("Add your GSTIN or business PAN.")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("ABCDE1234F"), { target: { value: "abcde1234f" } });
    fireEvent.click(screen.getByText("Continue"));
    expect(await screen.findByText("Step 2 of 2 · Contact")).toBeTruthy();
    fireEvent.click(screen.getByText("Submit verification"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("brand/kyc/submit", expect.objectContaining({
      companyName: "Acme Foods", panNumber: "ABCDE1234F", gstNumber: "", incorporationType: "registered_business",
      personName: "Priya Shah", designation: "Marketing head", workEmail: "ops@acme.in",
    })));
    expect(await screen.findByText("Verification submitted")).toBeTruthy();
  });

  it("approved → no submit button", async () => {
    apiMock.get.mockResolvedValue({ data: { status: "APPROVED", documents: { company_name: "Acme Foods" } } });
    render(<MemoryRouter><BrandKycMobile /></MemoryRouter>);
    expect((await screen.findAllByText("Verified brand")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Start verification")).toBeNull();
  });

  it("uses only the existing KYC endpoints", () => {
    const src = read("src/pages/brand/BrandKycMobile.jsx");
    const calls = [...src.matchAll(/api\.(get|post)\(\s*["`]([^"`]+)["`]/g)].map((m) => `${m[1]} ${m[2]}`);
    // Session 41: + read-only brands/me for the onboarding contact name and role.
    expect(new Set(calls)).toEqual(new Set(["get verifications/me", "get brands/me", "post upload?bucket=kyc-documents", "post brand/kyc/submit"]));
  });
});

describe("session 30: no sample data on brand screens", () => {
  it("brand home has no fake creators (the sample deal ticker stays on purpose, Ravi)", () => {
    const home = read("src/pages/brand/BrandHomeMobile.jsx");
    expect(home).toContain("useState([]);");
    expect(home).not.toContain("FALLBACK_FEATURED_CREATORS[i % FALLBACK_FEATURED_CREATORS.length].photo");
    expect(home).not.toContain("setFeaturedCreators(FALLBACK_FEATURED_CREATORS)");
  });
  it("admin login keeps its logic and drops the personal email placeholder", () => {
    const src = read("src/pages/admin/AdminLogin.jsx");
    expect(src).toContain("await login(email.trim(), password)");
    expect(src).toContain('navigate("/admin", { replace: true })');
    expect(src).not.toContain("voicexmedia");
  });
});

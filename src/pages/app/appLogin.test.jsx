import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const auth = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn(), setUser: vi.fn() }));
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false, ...auth }) }));

import AppContinue from "./AppContinue";
import AppWelcome from "./AppWelcome";
import { detectPlatform, installSteps } from "../../lib/installGuide";

const read = (p) => fs.readFileSync(path.resolve(__dirname, "../../..", p), "utf8");

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/app" element={<AppWelcome />} />
        <Route path="/app/continue/:role" element={<AppContinue />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        <Route path="/onboarding" element={<div>ONBOARDING</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const typeEmail = (v) => fireEvent.change(screen.getByTestId("app-email"), { target: { value: v } });

describe("Session 42 — app login (email first, OTP first, password second)", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset(); Object.values(auth).forEach((f) => f.mockReset()); localStorage.clear(); });

  it("welcome shows only two cards: Creator and Brand / Agency", () => {
    renderAt("/app");
    expect(screen.getByTestId("app-role-creator")).toBeTruthy();
    expect(screen.getByTestId("app-role-brand")).toBeTruthy();
    expect(screen.getByText(/Or an agency/)).toBeTruthy();
    expect(screen.queryByText(/Agency$/)).toBeNull();
  });

  it("existing account → Continue with OTP (big) and Use password instead (small) → code logs in", async () => {
    apiMock.post.mockImplementation((url, body) => {
      if (url === "auth/check-email") return Promise.resolve({ data: { exists: true, role: "creator", has_password: true } });
      if (url === "auth/login-otp") return Promise.resolve({ data: { success: true } });
      if (url === "auth/login") return Promise.resolve({ data: { token: "T", user: { user_id: "U1", role: "creator", onboarded: true } } });
      return Promise.reject(new Error("unexpected " + url));
    });
    renderAt("/app/continue/creator");
    typeEmail("Riya@Mail.com ");
    fireEvent.click(screen.getByTestId("app-email-continue"));
    expect(await screen.findByTestId("app-continue-otp")).toBeTruthy();
    expect(screen.getByTestId("app-use-password")).toBeTruthy();
    fireEvent.click(screen.getByTestId("app-continue-otp"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("auth/login-otp", { email: "riya@mail.com", app_role: "creator" }));
    fireEvent.change(await screen.findByTestId("app-login-code"), { target: { value: "123456" } });
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("auth/login", { email: "riya@mail.com", otp: "123456", app_role: "creator" }));
    expect(await screen.findByText("DASHBOARD")).toBeTruthy();
    expect(localStorage.getItem("ybex_token")).toBe("T");
  });

  it("no password on the account → no password link", async () => {
    apiMock.post.mockResolvedValue({ data: { exists: true, role: "brand", has_password: false } });
    renderAt("/app/continue/brand");
    typeEmail("ops@acme.in");
    fireEvent.click(screen.getByTestId("app-email-continue"));
    expect(await screen.findByTestId("app-continue-otp")).toBeTruthy();
    expect(screen.queryByTestId("app-use-password")).toBeNull();
  });

  it("email belongs to the other role → offer that role", async () => {
    apiMock.post.mockResolvedValue({ data: { exists: true, role: "brand", has_password: true } });
    renderAt("/app/continue/creator");
    typeEmail("ops@acme.in");
    fireEvent.click(screen.getByTestId("app-email-continue"));
    expect(await screen.findByText("This email is a Brand / Agency account")).toBeTruthy();
    fireEvent.click(screen.getByTestId("app-switch-role"));
    expect(await screen.findByTestId("app-continue-otp")).toBeTruthy();
  });

  it("new email → name + mobile + terms → signup → email code → onboarding", async () => {
    apiMock.post.mockImplementation((url) => {
      if (url === "auth/check-email") return Promise.resolve({ data: { exists: false } });
      if (url === "auth/verify-email") return Promise.resolve({ data: { success: true, token: "N", user: { user_id: "U2", role: "creator", onboarded: false } } });
      return Promise.reject(new Error("unexpected " + url));
    });
    auth.signup.mockResolvedValue({ requiresVerification: true });
    renderAt("/app/continue/creator");
    typeEmail("new@mail.com");
    fireEvent.click(screen.getByTestId("app-email-continue"));
    fireEvent.change(await screen.findByTestId("app-signup-name"), { target: { value: "Riya Sen" } });
    fireEvent.change(screen.getByTestId("app-signup-phone"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByTestId("app-signup-continue"));
    expect(await screen.findByTestId("app-error")).toBeTruthy(); // terms not ticked
    fireEvent.click(screen.getByTestId("app-signup-agree"));
    fireEvent.click(screen.getByTestId("app-signup-continue"));
    await waitFor(() => expect(auth.signup).toHaveBeenCalled());
    const [name, email, pass, role, phone] = auth.signup.mock.calls[0];
    expect([name, email, role, phone]).toEqual(["Riya Sen", "new@mail.com", "creator", "+919876543210"]);
    expect(String(pass).length).toBeGreaterThan(20); // OTP-only account: long random password
    fireEvent.change(await screen.findByTestId("app-verify-code"), { target: { value: "654321" } });
    expect(await screen.findByText("ONBOARDING")).toBeTruthy();
  });

  it("the installed app starts at /app and the website pages send it there", () => {
    expect(JSON.parse(read("public/manifest.json")).start_url).toBe("/app");
    const app = read("src/App.jsx");
    expect(app).toContain('<Route path="/app" ');
    expect(app).toMatch(/path="\/" element=\{<InstalledAppGoesToApp>/);
    expect(app).toMatch(/path="\/login" element=\{<InstalledAppGoesToApp>/);
  });
});

describe("Session 42 — install steps per browser", () => {
  const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
  const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const OLD_CHROME = IPHONE_CHROME.replace("17_4", "15_2");
  const INSTA = IPHONE_SAFARI + " Instagram 300.0";

  it("iPhone Chrome gets Chrome's own steps, not 'open Safari'", () => {
    const g = installSteps(detectPlatform(IPHONE_CHROME));
    expect(g.kind).toBe("steps");
    expect(g.title).toMatch(/Chrome/);
    expect(g.steps.join(" ")).toMatch(/address bar/);
  });
  it("iPhone Safari gets Safari steps", () => {
    expect(installSteps(detectPlatform(IPHONE_SAFARI)).steps[0]).toMatch(/Safari/);
  });
  it("old iOS in Chrome, or Instagram's browser → open in a real browser first", () => {
    expect(installSteps(detectPlatform(OLD_CHROME)).kind).toBe("switch");
    expect(installSteps(detectPlatform(INSTA)).kind).toBe("switch");
  });
  it("desktop gets a QR code", () => {
    expect(installSteps(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124")).kind).toBe("qr");
  });
});

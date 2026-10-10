import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(async () => ({ data: {} })) }));
vi.mock("../lib/api", () => ({ api: apiMock }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { user_id: "c1", email: "c@x.in", role: "creator" } }) }));

import UGCContractModal from "./chat/UGCContractModal";
import { summarizeCreator } from "./ugc/CreatorClaimStats";
import { referralCodeFor, referralRewardText } from "../utils/referral";
import { normalizeKycStatus } from "../utils/kycStatus";
import { orderWindowHours, deliveryHoursOf } from "../utils/ugcTerms";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const brief = { id: "b1", title: "Serum reel", budget: 3000, delivery_hours: 72, brand_name: "Glow" };

describe("UGC claim modal (session 24)", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockClear(); });

  it("no KYC → gate screen, and no OTP is sent", async () => {
    apiMock.get.mockResolvedValue({ data: { status: "NOT_SUBMITTED" } });
    render(<MemoryRouter><UGCContractModal brief={brief} onClose={() => {}} /></MemoryRouter>);
    expect(await screen.findByText("Complete KYC to claim briefs")).toBeTruthy();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("KYC pending → says under review", async () => {
    apiMock.get.mockResolvedValue({ data: { status: "PENDING" } });
    render(<MemoryRouter><UGCContractModal brief={brief} onClose={() => {}} /></MemoryRouter>);
    expect(await screen.findByText("Your KYC is under review")).toBeTruthy();
  });

  it("KYC approved → agreement with the brief's own deadline, 3 revisions and Good to know", async () => {
    apiMock.get.mockResolvedValue({ data: { status: "APPROVED" } });
    render(<MemoryRouter><UGCContractModal brief={brief} onClose={() => {}} /></MemoryRouter>);
    expect(await screen.findByTestId("good-to-know-card")).toBeTruthy();
    expect(screen.getByText("72 hours")).toBeTruthy();
    expect(screen.getByText("Up to 3")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Up to 2|OTP verify hote hi/);
    // Session 30 (Ravi): no OTP until both boxes are ticked; then it is sent once.
    await new Promise((r) => setTimeout(r, 50));
    expect(apiMock.post).not.toHaveBeenCalledWith("/otp/send", expect.anything());
    const boxes = screen.getAllByRole("checkbox");
    boxes.forEach((b) => fireEvent.click(b));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/otp/send", expect.anything()));
  });
});

describe("helpers (session 24)", () => {
  it("creator card: new creator → 'New on Ybex', never zeros; no portfolio → no thumbs", () => {
    const v = summarizeCreator({ kyc_verified: true, completed_orders: 0, rating_count: 0, on_time_pct: null, on_time_sample: 0 }, {});
    expect(v.isNew).toBe(true);
    expect(v.rating).toBeNull();
    expect(v.thumbs).toEqual([]);
    const w = summarizeCreator({ kyc_verified: true, completed_orders: 4, rating_avg: 4.5, rating_count: 2, on_time_pct: 75, on_time_sample: 4 },
      { ig_followers: 18400, portfolio: [JSON.stringify({ url: "https://x/a.jpg" }), { url: "https://x/v.mp4" }] });
    expect(w.rating).toBe("⭐ 4.5 (2)");
    expect(w.onTime).toBe("75% on time");
    expect(w.platforms).toEqual(["Instagram 18.4K"]);
    expect(w.thumbs).toEqual(["https://x/a.jpg"]);
  });
  it("referral code is the server's format; no assumed reward amount", () => {
    expect(referralCodeFor({ user_id: "1a2b3c4d-5e6f-7890-abcd-ef0123456789" })).toBe("YBEX-1A2B3C4D");
    expect(referralRewardText({ reward_amount: null })).toBeNull();
    expect(referralRewardText({ reward_amount: 750 })).toBe("₹750");
    for (const f of ["src/pages/dashboard/Refer.jsx", "src/components/profile/mobile/brand/ReferScreen.jsx", "src/pages/creator/CreatorMobileProfile.jsx"]) {
      const s = read(f);
      expect(s).toContain("referralCodeFor(user)");
      expect(s).not.toMatch(/\? 1000 : 500\)|reward_amount \|\| 500/);
    }
  });
  it("kyc + time helpers", () => {
    expect(normalizeKycStatus({ status: "NOT_SUBMITTED" })).toBe("NONE");
    expect(normalizeKycStatus({ status: "approved" })).toBe("APPROVED");
    expect(deliveryHoursOf(undefined, 24)).toBe(24);
    expect(orderWindowHours({ created_at: "2026-09-01T00:00:00Z", internal_deadline: "2026-09-03T00:00:00Z" })).toBe(48);
    expect(orderWindowHours({})).toBe(24);
  });
  it("screens: deadline picker on both brand post flows, no invented amounts, no fake Accept", () => {
    for (const f of ["src/pages/brand/BrandUGCMobile.jsx", "src/pages/brand/BrandUGCPost.jsx"]) {
      const s = read(f);
      expect(s).toContain('data-testid="delivery-hours-picker"');
      expect(s).toContain("Only KYC-verified creators can claim your brief.");
    }
    const m = read("src/pages/brand/BrandUGCMobile.jsx");
    expect(m).not.toContain("|| 2000");
    expect(m).not.toContain('toast.success("Creator assigned to brief!")');
    expect(read("src/pages/creator/CreatorUGCMobile.jsx")).not.toMatch(/budget \|\| 5000|totalHours=\{24\}/);
  });
});

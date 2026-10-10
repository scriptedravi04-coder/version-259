import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { visibleOnExplore, EXPLORE_GATE_FROM } from "./exploreGate";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("Session 43 batch 3", () => {
  it("Explore: new creators wait for waitlist approval; existing ones stay; rejected never show", () => {
    const before = new Date(EXPLORE_GATE_FROM - 86400000).toISOString();
    const after = new Date(EXPLORE_GATE_FROM + 86400000).toISOString();
    expect(visibleOnExplore({ created_at: before, profile_status: "under_review" })).toBe(true);
    expect(visibleOnExplore({ created_at: after, profile_status: "under_review" })).toBe(false);
    expect(visibleOnExplore({ created_at: after, profile_status: "approved" })).toBe(true);
    expect(visibleOnExplore({ created_at: before, profile_status: "rejected" })).toBe(false);
    expect(read("backend/server.ts")).toContain("body.filter((r: any) => visibleOnExplore(r))");
  });
  it("OTP codes lead the email subject (readable in the notification)", () => {
    expect(read("backend/session_routes.ts")).toContain("`${code} is your Ybex contract signing code`");
    expect(read("backend/auth_routes.ts")).toContain("`${otp} is your Ybex verification code`");
  });
  it("creator payout card shows what reaches the bank", () => {
    const s = read("src/components/chat/mobile/MobilePayoutCard.jsx");
    expect(s).toContain('"You receive in your bank"');
    expect(s).toContain('data-testid="payout-net-line"');
  });
  it("admin on a phone gets More (all sections + Logout)", () => {
    expect(read("src/components/layout/BottomNav.jsx")).toContain('path: "/admin?tab=more"');
    expect(read("src/components/admin/AdminMoreMobile.jsx")).toContain('data-testid="admin-more-logout"');
  });
  it("Android WebView wrappers count as in-app browsers; desktop Explore uses the full width", () => {
    expect(read("src/lib/installGuide.js")).toContain("(android && /; wv\\)/.test(s))");
    expect(read("src/pages/dashboard/Explore.jsx")).not.toContain('w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6');
  });
});

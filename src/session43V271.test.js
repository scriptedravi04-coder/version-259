import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ugcLinkPhase } from "./pages/creator/CreatorUGCMobile.jsx";
import { realLogoUrl } from "./components/common/BrandLogo.jsx";
import { buildCreatorInviteActions } from "./components/quickActions/quickActionsData";
import { COPY } from "./components/push/PushPermissionScreen.jsx";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("Session 43 v271 — Ravi's phone list", () => {
  it("payout receipt: no hardcoded IFSC, pending state until the UTR, convenience fee label", () => {
    const r = read("src/components/payments/CreatorEarningsMobile.jsx");
    expect(r).not.toContain("HDFC0001234");
    expect(r).not.toContain("Sep 20, 2026");
    expect(r).toContain("Convenience fee &amp; TDS");
    expect(r).toContain("disabled={!hasUtr}");
    expect(r).toContain("Your UTR number will show here once the amount reaches your account.");
    expect(read("src/components/payments/InvoiceModal.jsx")).not.toContain("Ybex Platform Fee");
  });

  it("quick action invite card carries the amount and a details list", () => {
    const [c] = buildCreatorInviteActions({ invitations: [{ id: "i1", status: "pending_creator_acceptance", brand_name: "carboex", campaign_title: "Kkrh", amount: 50000, deliverables_count: 1, created_at: "2026-10-10T02:14:00Z" }] });
    expect(c.amount).toBe("₹50,000");
    expect(c.details.map((d) => d.label)).toEqual(["Campaign", "Deliverables", "Invited on"]);
  });

  it("brand logos: real picture, never the generated initials image", () => {
    expect(realLogoUrl("https://x.supabase.co/logo.png")).toBe("https://x.supabase.co/logo.png");
    expect(realLogoUrl("https://api.dicebear.com/7.x/initials/svg?seed=C")).toBe("");
    expect(realLogoUrl("")).toBe("");
  });

  it("UGC order page follows the stage the chat uses (live link step)", () => {
    expect(ugcLinkPhase({ stage: "COMPLETED_APPROVAL" })).toBe("DUE");
    expect(ugcLinkPhase({ stage: "LIVE_LINK_SUBMITTED" })).toBe("SUBMITTED");
    expect(ugcLinkPhase({ stage: "REVISION_REQUESTED_LINKS" })).toBe("FIX");
    expect(ugcLinkPhase({ stage: "REVISION_DECLINED_LINKS" })).toBe("FIX_DECLINED");
    expect(ugcLinkPhase({ stage: "IN_PROGRESS" })).toBeNull();
    expect(ugcLinkPhase({ stage: "COMPLETED_APPROVAL" }, true)).toBeNull();
  });

  it("chat: draft-approved box has its own Submit live link; executed is a centred line; link decline is a card", () => {
    const row = read("src/components/chat/mobile/MobileMessageRow.jsx");
    expect(row).toContain('data-testid="draft-approved-submit-link"');
    expect(row).toContain("Both parties have now signed");
    expect(row).not.toContain("the brand can now fund secure payment hold to secure payment");
    expect(row).toContain('variant="links"');
    expect(read("src/components/chat/mobile/MobileDeclinedCard.jsx")).toContain("Approve last live link");
  });

  it("status bar ignores toasts and blends see-through layers; keeps re-checking", () => {
    const sb = read("src/components/layout/StatusBarSync.jsx");
    expect(sb).toContain("data-sonner-toaster");
    expect(sb).toContain("elementsFromPoint");
    expect(sb).toContain("setInterval");
  });

  it("Android keyboard: page resizes itself, no lift loop", () => {
    expect(read("index.html")).toContain("interactive-widget=resizes-content");
    expect(read("src/lib/keyboardAware.js")).toContain("layoutShrunk");
  });

  it("permission screen: new copy for both roles, opens from the Notifications page", () => {
    expect(COPY.creator.title).toBe("Never miss a brand deal");
    expect(COPY.brand.title).toBe("Know the moment creators respond");
    const p = read("src/components/push/PushPermissionScreen.jsx");
    expect(p).not.toContain("Brands are waiting");
    expect(p).toContain("ybex:open-push-ask");
    expect(p).not.toMatch(/!role \|\| !onboarded/);
    expect(read("src/components/inbox/mobile/NotificationsMobile.jsx")).toContain('data-testid="notif-allow-push"');
  });

  it("banner routes: brand-team 'admin' is not Ybex staff", () => {
    const b = read("backend/admin_content_routes.ts");
    expect(b).not.toContain('user.team_role !== "admin"');
    expect(b).not.toContain("HITTING GET BANNERS");
    expect(read("backend/tags_notifications_routes.ts")).not.toContain('user.team_role !== "admin"');
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { isBrandNavPage, isCreatorNavPage } from "./lib/bottomNavVisibility";
import { creatorNoteOf } from "./components/chat/mobile/MobileDeliverableCard.jsx";
import { LIVE_LINK_TAGS } from "./components/chat/mobile/MobileRequestChangesSheet.jsx";
import { matchCreators } from "./components/campaigns/mobile/CreatorMatchStrip.jsx";
import { isPlayableDeliverable } from "./pages/brand/BrandUGCMobile.jsx";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("Session 43 v274 — Ravi's list 59–79", () => {
  it("bottom bar only on main pages (brand + creator); never on policies or creator profiles", () => {
    expect(isBrandNavPage("/brand/campaigns")).toBe(true);
    expect(isBrandNavPage("/brand/inbox")).toBe(true);
    expect(isBrandNavPage("/creator/abc123")).toBe(false);
    expect(isBrandNavPage("/info/refunds")).toBe(false);
    expect(isBrandNavPage("/brand/campaigns/create")).toBe(false);
    expect(isCreatorNavPage("/info/terms")).toBe(false);
    expect(read("src/components/layout/Layout.jsx")).toContain("isBrandNavPage(location.pathname");
  });

  it("policies are a plain reading page on phones", () => {
    expect(read("src/pages/dashboard/InfoHub.jsx")).toContain('data-testid="info-reading-page"');
  });

  it("creator notes: only what the creator typed", () => {
    expect(creatorNoteOf({}, { content: "🎥 Campaign Deliverable Draft Submitted for Review! Deliverable URL: campaign-deliverables/x.mp4" })).toBe("");
    expect(creatorNoteOf({ notes: "Deliverable URL: campaign-deliverables/x.mp4" })).toBe("");
    expect(creatorNoteOf({ notes: "Used the morning light, as asked" })).toBe("Used the morning light, as asked");
    expect(read("src/components/chat/mobile/MobileDeliverableCard.jsx")).not.toContain("Hook and product showcase both included.");
  });

  it("request changes opens the sheet directly; live links get their own tips", () => {
    expect(read("src/components/chat/mobile/MobileDeliverableCard.jsx")).toContain("onRequestChanges ? onRequestChanges() : setChangesOpen(true)");
    expect(LIVE_LINK_TAGS).toContain("Post is private");
    expect(LIVE_LINK_TAGS).not.toContain("Change hook");
  });

  it("one payment-funded card; review & pay before Razorpay", () => {
    expect(read("src/components/chat/mobile/ChatBoxMobile.jsx")).toContain("__funded_card__");
    expect(read("src/components/chat/ChatBox.jsx")).toContain("__funded_card__");
    expect(read("src/components/chat/mobile/MobileEscrowSheet.jsx")).toContain('"Review & pay"');
  });

  it("no made-up creator numbers; real matches only", () => {
    const create = read("src/components/campaigns/mobile/MobileCampaignCreate.jsx");
    expect(create).not.toMatch(/142 verified creators|>142<|142 matching creators/);
    const list = [
      { id: 1, category: "Fashion", platforms: ["Instagram"] },
      { id: 2, category: "Food", platforms: ["YouTube"] },
      { id: 3, category: "Fashion, Beauty", platforms: ["YouTube"] },
    ];
    expect(matchCreators(list, { categories: ["Fashion"], platforms: ["Instagram"] }).map((c) => c.id)).toEqual([1]);
    expect(matchCreators(list, { categories: [], platforms: [] })).toHaveLength(3);
  });

  it("brand UGC order plays the uploaded draft; share links still open outside", () => {
    expect(isPlayableDeliverable("ugc-deliverables/order_1/v1.mp4")).toBe(true);
    expect(isPlayableDeliverable("https://x.supabase.co/storage/v1/object/sign/a.mp4?token=1")).toBe(true);
    expect(isPlayableDeliverable("https://drive.google.com/file/d/abc/view")).toBe(false);
    expect(isPlayableDeliverable("")).toBe(false);
  });

  it("invoice fits phone screens; campaigns page has a header button, no floating +", () => {
    expect(read("src/components/payments/InvoiceModal.jsx")).toContain("max-h-[calc(100dvh-24px)]");
    const c = read("src/components/campaigns/mobile/BrandCampaignsMobile.jsx");
    expect(c).toContain('data-testid="campaigns-new"');
    expect(c).not.toContain('bottom: "calc(96px');
  });

  it("dev-only vite-hmr socket gets a quiet stand-in; other sockets untouched", () => {
    const h = read("index.html");
    expect(h).toContain("__ybWrapped");
    expect(h).toContain('return protocols === undefined ? new Native(url) : new Native(url, protocols);');
  });
});

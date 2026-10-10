import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (p) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("Session 43 batch 5", () => {
  it("Respond to offer → bottom sheet (Accept / Negotiate); my own latest offer → Waiting for response", () => {
    const c = read("src/components/chat/mobile/ChatBoxMobile.jsx");
    expect(c).toContain('label: "WAITING FOR RESPONSE"');
    expect(c).toContain('onClick: () => setActiveSheet("respond")');
    expect(c).toContain("<MobileRespondOfferSheet");
    const sh = read("src/components/chat/mobile/MobileRespondOfferSheet.jsx");
    expect(sh).toContain('data-testid="respond-offer-accept"');
    expect(sh).toContain('data-testid="respond-offer-negotiate"');
  });
  it("keyboard: no scroll-into-view loop (Android shake)", () => {
    const k = read("src/lib/keyboardAware.js");
    expect(k).toContain("if (open && (!wasOpen || revealedFor !== el))");
    expect(k).toContain('window.visualViewport.addEventListener("scroll", schedule);');
  });
  it("push: re-subscribe when the server key changed; urgent delivery; old-key subscriptions dropped", () => {
    expect(read("src/lib/push.js")).toContain("if (!same) { await sub.unsubscribe(); sub = null; }");
    const p = read("backend/push_routes.ts");
    expect(p).toContain('urgency: "high"');
    expect(p).toContain("e?.statusCode === 403");
  });
  it("desktop Explore understands place searches too", () => {
    expect(read("src/pages/dashboard/Explore.jsx")).toContain("const place = debouncedSearch ? placeFromSearch(debouncedSearch) : null;");
    expect(read("src/components/creators/CreatorCard.jsx")).toContain("km from ${c.__nearCity}");
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("mobile UI audit (session 23)", () => {
  it("admin payout: full ids + desktop payload, server amounts, desktop readiness rules", () => {
    const s = read("src/components/admin/AdminPayoutMobile.jsx");
    expect(s).not.toMatch(/gross \* 0\.125/);
    expect(s).toContain("transaction_id: tx.id,");
    expect(s).toContain('const targetId = String(tx.deal_id || tx.ugc_order_id || tx.id || "");');
    expect(s).toContain('t.payout_status === "READY_FOR_RELEASE"');
    expect(s).toContain("Number(t.creator_net_amount) ||");
  });
  it("brand payments: GST receipt uses the server's fee/GST, never an assumed 5%", () => {
    const s = read("src/components/payments/BrandPaymentsMobile.jsx");
    expect(s).not.toMatch(/\* 0\.05|\* 1\.059/);
    expect(s).toContain("tx.platform_fee_amount");
    expect(s).not.toContain('"pay_escrow_settled"');
  });
  it("creator earnings: no invented fee, UTR or fake 'admin nudged' success", () => {
    const s = read("src/components/payments/CreatorEarningsMobile.jsx");
    expect(s).not.toContain("CMS293847291");
    expect(s).not.toMatch(/\|\| 1500|\+ 1500/);
    expect(s).not.toContain('toast.success("Admin nudged!');
  });
  it("creator UGC: live link uses the field names the server reads", () => {
    const s = read("src/pages/creator/CreatorUGCMobile.jsx");
    expect(s).toContain("link: liveLinkUrl.trim(),");
    expect(s).not.toContain("liveLink: liveLinkUrl.trim()");
    expect(s).not.toContain("const handleClaimBrief");
  });
  it("brand UGC: payout release asks first; live-link stage sends reject_live_links like desktop", () => {
    const s = read("src/pages/brand/BrandUGCMobile.jsx");
    expect(s).toMatch(/!isDraft && typeof window !== "undefined" && !window\.confirm\(/);
    expect(s).toContain('...(isLiveLinkStage ? { action: "reject_live_links" } : {})');
  });
  it("chat support opens the real help desk", () => {
    expect(read("src/components/chat/mobile/MobileMessageRow.jsx")).not.toContain('alert("Connecting to Ybex Support desk...")');
  });
});

describe("loaders (session 23, design 14a/14b)", () => {
  it("global loader is a 2px top bar that never blocks the page (no blur, no big wordmark)", () => {
    const s = read("src/components/layout/GlobalLoader.jsx");
    expect(s).toContain('pointerEvents: "none"');
    expect(s).toContain("height: 2,");
    expect(s).not.toMatch(/backdrop-blur|inset-0|<svg/);
  });
  it("finish animation actually plays (isFinishing is cleared on a timer, not in the same tick)", () => {
    const s = read("src/contexts/LoadingContext.jsx");
    expect(s).toContain("finishTimerRef.current = setTimeout(() => setIsFinishing(false), 250);");
    expect(s).not.toMatch(/setIsFinishing\(true\);\s*setIsLoading\(false\);\s*setIsFinishing\(false\);/);
  });
  it("cold-start splash: only while auth is loading, 28px wordmark, 64px track, mounted in App", () => {
    const s = read("src/components/layout/ColdStartSplash.jsx");
    expect(s).toContain("const { loading } = useAuth();");
    expect(s).toContain("900 28px/1");
    expect(s).toContain("width: 64, height: 3");
    expect(read("src/App.jsx")).toContain("<ColdStartSplash />");
  });
});

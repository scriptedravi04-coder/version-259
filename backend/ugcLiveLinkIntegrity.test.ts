import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Seven defects found by testing v155 against a live app. The most serious by far is the
 * first: the brand's declined-revision panel released the full escrow for a collaboration
 * order whose creator had published nothing. It was reachable only because REVISION_DECLINED
 * started resolving in v155 — the panel had been dead code, and its approve button had never
 * learnt the rule the other two buttons on that screen already followed.
 *
 * These are source scans. What they assert is the shape of the code — which action a button
 * sends, whether a POST is retried, which element carries a size — and no render test or type
 * check can see any of that.
 */

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");
const UGC_ROUTES = read("./ugc_routes.ts");
const UGC_LIFECYCLE = read("./services/ugcLifecycleService.ts");
const BRAND_ORDERS = read("../src/pages/brand/BrandUGCOrders.jsx");
const CREATOR_ORDERS = read("../src/pages/creator/ManageUGCOrdersView.jsx");
const CHATBOX = read("../src/components/chat/ChatBox.jsx");
const CHATBOX_MOBILE = read("../src/components/chat/mobile/ChatBoxMobile.jsx");
const SYSTEM_MESSAGE = read("../src/components/chat/SystemMessage.jsx");

describe("escrow is never released for a post that does not exist", () => {
  it("scanned the approve handler it meant to scan", () => {
    expect(UGC_ROUTES).toContain("const handleUgcOrderApprove");
    expect(UGC_ROUTES).toContain("isLiveLinkApproval");
  });

  it("requires evidence of a live link before a live-link approval counts", () => {
    expect(UGC_ROUTES).toContain("hasLiveLinkEvidence");
    expect(UGC_ROUTES).toContain("req.body?.action === 'approve_live_links' && hasLiveLinkEvidence");
  });

  it("rejects an explicit live-link approval when nothing was submitted", () => {
    expect(UGC_ROUTES).toContain("NO_LIVE_LINK_TO_APPROVE");
    const guard = UGC_ROUTES.indexOf("req.body?.action === 'approve_live_links' && !hasLiveLinkEvidence");
    const release = UGC_ROUTES.indexOf("if (requiresLiveLink && isLiveLinkApproval)");
    expect(guard).toBeGreaterThan(-1);
    // The rejection has to come first, or it protects nothing.
    expect(guard).toBeLessThan(release);
  });

  it("no longer takes the action name at face value", () => {
    expect(UGC_ROUTES).not.toContain("req.body?.action === 'approve_live_links' ||\n      (req.body?.action !== 'approve_draft'");
  });

  it("makes the declined panel's approve button collaboration-aware", () => {
    // Every approve button on this screen now routes a collaboration draft to approve_draft.
    const draftRoutes = BRAND_ORDERS.match(/handleApprove\(selectedOrder\.id, 'approve_draft'\)/g) || [];
    expect(draftRoutes.length).toBeGreaterThanOrEqual(3);
    expect(BRAND_ORDERS).toContain('? "Approve Draft"');
  });
});

describe("a live link is submitted once, not twice", () => {
  it("no longer retries the POST against the other route", () => {
    // Both URLs reach the same handler, so the "fallback" only ever resubmitted.
    expect(CREATOR_ORDERS).not.toContain("catch(e1)");
    expect(CREATOR_ORDERS).not.toContain("/submit-live-link`, payload);\n                    }");
  });

  it("guards every submit handler against a second click", () => {
    expect(CREATOR_ORDERS).toContain("const [submittingLiveLink, setSubmittingLiveLink] = useState(false)");
    const guards = CREATOR_ORDERS.match(/if \(submittingLiveLink\) return;/g) || [];
    const releases = CREATOR_ORDERS.match(/setSubmittingLiveLink\(false\)/g) || [];
    expect(guards.length).toBe(3);
    // A guard that is never released locks the form after one submission.
    expect(releases.length).toBe(guards.length);
  });
});

describe("a correction request reopens the live-link form", () => {
  it("stops treating 'ever submitted' as 'currently under review'", () => {
    expect(CHATBOX).toContain("isUgcLinksRevisionOpen");
    expect(CHATBOX).toContain("const isLiveLinksSubmitted = !isDealCompleted && !isUgcLinksRevisionOpen");
  });

  it("stays scoped to UGC so campaign threads are untouched", () => {
    const decl = CHATBOX.slice(
      CHATBOX.indexOf("const isUgcLinksRevisionOpen"),
      CHATBOX.indexOf("const isLiveLinksSubmitted")
    );
    expect(decl).toContain("isUgcOrder &&");
    expect(decl).toContain("REVISION_REQUESTED_LINKS");
    expect(decl).toContain("REVISION_DECLINED_LINKS");
  });
});

describe("the live-link forms match the chat form", () => {
  it("offers notes on every live-link form", () => {
    const fields = CREATOR_ORDERS.match(/name="notes"/g) || [];
    expect(fields.length).toBe(3);
    const payloads = CREATOR_ORDERS.match(/link: link, notes \}/g) || [];
    expect(payloads.length).toBe(3);
  });

  it("opens the resubmission box empty rather than pre-filled", () => {
    // The link being replaced is already shown above as "Previous Link".
    expect(CREATOR_ORDERS).not.toContain('defaultValue={selectedOrder.liveLink');
  });
});

describe("layout", () => {
  it("lets the video component own its own height", () => {
    // Three max-heights used to compete here, and the outer overflow-hidden clipped the
    // player's bottom edge — where the native controls are. Matched against the JSX rather
    // than a bare class name, so the comment explaining the fix does not satisfy the test.
    expect(CREATOR_ORDERS).not.toContain('border-default)] max-h-[420px] flex items-center');
    expect(CREATOR_ORDERS).not.toContain('className="w-full max-h-[400px] object-contain mx-auto"');
    expect(CREATOR_ORDERS).toContain('className="w-full mx-auto"');
  });

  it("puts the primary action on the right of the live-links card", () => {
    const card = SYSTEM_MESSAGE.slice(SYSTEM_MESSAGE.indexOf("Review the live URLs above"));
    const resubmit = card.indexOf("Ask to Resubmit</span>");
    const approve = card.indexOf("Approve & Pay</span>");
    expect(resubmit).toBeGreaterThan(-1);
    expect(approve).toBeGreaterThan(-1);
    expect(resubmit).toBeLessThan(approve);
  });

  it("reads in the same order as it is laid out", () => {
    const sentence = SYSTEM_MESSAGE.slice(
      SYSTEM_MESSAGE.indexOf("Review the live URLs above"),
      SYSTEM_MESSAGE.indexOf("Review the live URLs above") + 320
    );
    expect(sentence.indexOf("Ask to Resubmit")).toBeLessThan(sentence.indexOf("Approve & Pay"));
  });
});

describe("single message sent on approval and payout release", () => {
  it("does not insert or emit a second localPayoutMsgObj on APPROVE in ugcLifecycleService", () => {
    expect(UGC_LIFECYCLE).not.toContain("localPayoutMsgObj");
    expect(UGC_LIFECYCLE).not.toContain("const payoutMsgId = `msg_");
  });

  it("desktop ChatBox deduplicates duplicate pending payment release cards", () => {
    expect(CHATBOX).toContain("isPendingPayoutCard");
  });

  it("mobile ChatBox deduplicates duplicate pending payment release cards", () => {
    expect(CHATBOX_MOBILE).toContain("isPendingPayoutCard");
    expect(CHATBOX_MOBILE).toContain("uniqueMessages");
  });
});


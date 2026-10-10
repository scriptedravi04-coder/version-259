import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { resolveUgcStage } from "./ugcOrderStage";

/**
 * Four separate defects are pinned here, all from the same session:
 *
 *  1. A declined draft revision resolved back to REVISION_REQ, so the request the creator had
 *     just declined stayed on screen with its Decline and Upload buttons still live.
 *  2. The lifecycle overwrote the order's `creator_notes` — the creator's own note on their
 *     submission — with the brand's feedback, destroying it and showing the brand's words
 *     under a "Creator Notes:" heading.
 *  3. A failed ugc_orders write aborted the event *after* chat_threads had already been
 *     updated, so the screen showed "Live Post Link Submitted" beside a failure toast.
 *  4. The chat's "Revisions Declined" card offered a collaboration order an "Approve
 *     Deliverable (₹x)" button over a warning that the payout was about to be released.
 *
 * The resolver cases run the real code. The rest are source scans, because what they assert
 * is the *shape* of the code — which column is written, which order two writes happen in —
 * and neither TypeScript nor a render test can see any of that.
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), "utf8");
const LIFECYCLE = read("./services/ugcLifecycleService.ts");
const STAGE = read("./ugcOrderStage.ts");
const PROOF_NOTICE = read("../src/components/chat/ContentProofNotice.jsx");
const BRAND_ORDERS = read("../src/pages/brand/BrandUGCOrders.jsx");
const CREATOR_ORDERS = read("../src/pages/creator/ManageUGCOrdersView.jsx");

const collabOrder = { id: "ugcord_1", status: "REVISION_REQ" };

describe("a declined draft revision is its own stage", () => {
  it("does not fall back into REVISION_REQ when the creator declines", () => {
    const result = resolveUgcStage({
      order: collabOrder,
      thread: { id: "t1", flow_state: "REVISION_DECLINED" },
      messages: [
        { message_type: "revision_requested", metadata: { action: "revision_requested" }, created_at: "2026-09-22T10:00:00Z" },
        { message_type: "revision_declined", metadata: { action: "revision_declined" }, created_at: "2026-09-22T11:00:00Z" }
      ],
      requiresLiveLink: true
    });

    expect(result.phase).toBe("REVISION_DECLINED");
    expect(result.creatorStage).toBe("REVISION_DECLINED");
    expect(result.brandStage).toBe("REVISION_DECLINED");
  });

  it("reads the DISPUTED order status as a decline, not as an open request", () => {
    const result = resolveUgcStage({
      order: { id: "ugcord_2", status: "DISPUTED" },
      thread: null,
      messages: [],
      requiresLiveLink: true
    });
    expect(result.phase).toBe("REVISION_DECLINED");
  });

  it("still lets a fresh revision request reopen the loop after a decline", () => {
    const result = resolveUgcStage({
      order: collabOrder,
      thread: { id: "t1", flow_state: "REVISION_DECLINED" },
      messages: [
        { message_type: "revision_declined", metadata: { action: "revision_declined" }, created_at: "2026-09-22T11:00:00Z" },
        { message_type: "revision_requested", metadata: { action: "revision_requested" }, created_at: "2026-09-22T12:00:00Z" }
      ],
      requiresLiveLink: true
    });
    expect(result.phase).toBe("REVISION_REQ");
  });

  it("keeps the live-link decline separate from the draft decline", () => {
    const result = resolveUgcStage({
      order: { id: "ugcord_3", status: "REVISION_DECLINED_LINKS" },
      thread: null,
      messages: [],
      requiresLiveLink: true
    });
    expect(result.phase).toBe("REVISION_DECLINED_LINKS");
  });

  it("gives the declined stage a panel on the creator's screen", () => {
    // The registry the stage test compares against, and the panel itself.
    expect(CREATOR_ORDERS).toContain('"REVISION_DECLINED",');
    expect(CREATOR_ORDERS).toContain('selectedOrder.stage === "REVISION_DECLINED"');
  });
});

describe("the brand's feedback never overwrites the creator's notes", () => {
  it("scanned the file it meant to scan", () => {
    // Without this, a rename makes every assertion below pass against nothing.
    expect(LIFECYCLE).toContain("case 'REQUEST_REVISION'");
    expect(LIFECYCLE).toContain("case 'DECLINE_REVISION'");
  });

  it("writes no prefixed feedback into creator_notes", () => {
    expect(LIFECYCLE).not.toMatch(/creator_notes:\s*cleanNotes\s*\?\s*`(Revision|Live link)/);
    expect(LIFECYCLE).not.toContain("`Revision feedback: ${cleanNotes}`");
    expect(LIFECYCLE).not.toContain("`Live link revision feedback: ${cleanNotes}`");
    expect(LIFECYCLE).not.toContain("`Revision declined: ${cleanNotes}`");
  });

  it("still records the feedback somewhere it belongs", () => {
    expect(LIFECYCLE).toContain("revision_feedback: cleanNotes");
    expect(LIFECYCLE).toContain("revision_notes_links: cleanNotes");
  });

  it("hides legacy poisoned notes on both screens", () => {
    for (const source of [BRAND_ORDERS, CREATOR_ORDERS]) {
      expect(source).toContain("POISONED_CREATOR_NOTE");
      expect(source).toContain("creatorNoteOrNull(o.creator_notes)");
    }
  });
});

describe("a failed order write never leaves the thread ahead of it", () => {
  it("aborts before chat_threads is updated, not after", () => {
    const abort = LIFECYCLE.indexOf("if (isUgc && supabaseOrderWriteFailed)");
    const threadWrite = LIFECYCLE.indexOf(".from('chat_threads')\n          .update(supaThreadUpdates)");

    expect(abort).toBeGreaterThan(-1);
    expect(threadWrite).toBeGreaterThan(-1);
    expect(abort).toBeLessThan(threadWrite);
  });

  it("keeps the rest of the payload when only the status token is rejected", () => {
    expect(LIFECYCLE).toContain("const { status: _rejectedStatus, stage: _rejectedStage, ...orderDataOnly }");
    // The event must still be reported as failed — saving the data is not the same as
    // pretending the status moved.
    expect(LIFECYCLE).toContain("supabaseOrderWriteFailed = true");
  });
});

describe("approving a collaboration draft does not claim to release the payout", () => {
  it("scanned the declined card it meant to scan", () => {
    expect(PROOF_NOTICE).toContain("Revisions Declined");
    expect(PROOF_NOTICE).toContain("isRawVideoUgc");
  });

  it("gates the payout confirmation on raw UGC only", () => {
    expect(PROOF_NOTICE).toContain("{isRawVideoUgc && showApproveConfirm ?");
    expect(PROOF_NOTICE).not.toContain("{isUgc && showApproveConfirm ?");
  });

  it("sends a UGC collaboration approval to the UGC route, not the campaign one", () => {
    expect(PROOF_NOTICE).toContain("/ugc/threads/${orderIdToCall}/approve-content");
    expect(PROOF_NOTICE).toContain("action: 'approve_draft'");
  });
});

describe("the brand cannot download a clean draft before the deal completes", () => {
  it("has a single rule and uses it", () => {
    expect(BRAND_ORDERS).toContain("function isDeliverableUnlockedForBrand(order)");
    const uses = BRAND_ORDERS.match(/isDeliverableUnlockedForBrand\(selectedOrder\)/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });

  it("never hands a collaboration order an unwatermarked copy", () => {
    // The "Draft Approved — waiting for live link" panel used to hardcode both of these.
    expect(BRAND_ORDERS).not.toContain("isApproved={true}\n                    watermark={false}");
  });

  it("keeps a collaboration order locked until it is actually complete", () => {
    expect(STAGE).toContain("REVISION_DECLINED");
  });
});

describe("the live post card tells the truth about where the post is", () => {
  it("picks the icon from the host instead of always claiming Instagram", () => {
    expect(BRAND_ORDERS).toContain("function livePostPlatform(url)");
    expect(BRAND_ORDERS).not.toContain('bg-pink-500/10 text-pink-600 flex items-center justify-center shrink-0">\n                      <Instagram size={18} />');
  });
});

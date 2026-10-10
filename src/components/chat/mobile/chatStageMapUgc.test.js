import { describe, it, expect } from "vitest";
import { getChatStage, getInboxChip } from "./chatStageMap";

/**
 * The mobile UGC branch was written for a flow with no live-link step, and never revisited
 * when collaboration orders arrived. Three consequences, all pinned below:
 *
 *  - after a draft approval the creator was told "Approved & unlocked" with no action, and
 *    was never offered "Add live link";
 *  - every live-link state matched nothing and fell through to "In production";
 *  - worst, the inbox showed the creator a green "₹x received" for a deal where no money had
 *    moved and nothing had been posted.
 *
 * The desktop screens are deliberately untouched by these tests — mobile is its own tree.
 */

const ugcStage = (state, isBrand = false, extra = {}) =>
  getChatStage({
    thread: { id: "t1", deal_id: "ugcord_1", flow_state: state, ugc_order: { id: "ugcord_1" }, ...extra },
    isBrand,
    isUgcOrder: true,
    isMySignatureSigned: true,
    isOtherPartySigned: true,
    isDealCompleted: false,
    messages: []
  });

describe("mobile UGC stage map knows the live-link flow", () => {
  it("offers the creator the live link after a draft approval", () => {
    const s = ugcStage("CONTENT_APPROVED");
    expect(s.key).toBe("ugc_awaiting_live_link");
    expect(s.action?.key).toBe("submit_live_link");
    // The old bug in one line: this must not read as a finished deal.
    expect(s.label).not.toMatch(/unlocked/i);
  });

  it("treats AWAITING_LIVE_LINK the same way", () => {
    expect(ugcStage("AWAITING_LIVE_LINK").key).toBe("ugc_awaiting_live_link");
  });

  it("tells the brand it is waiting on the creator, not that it is done", () => {
    const s = ugcStage("CONTENT_APPROVED", true);
    expect(s.key).toBe("ugc_awaiting_live_link");
    expect(s.action).toBeNull();
  });

  it("recognises a submitted live link instead of showing 'in production'", () => {
    for (const state of ["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINK_SUBMITTED"]) {
      expect(ugcStage(state).key).toBe("ugc_links_submitted");
    }
  });

  it("recognises a live-link correction request and its decline", () => {
    expect(ugcStage("REVISION_REQUESTED_LINKS").key).toBe("ugc_links_revision");
    expect(ugcStage("REVISION_REQUESTED_LINKS").action?.key).toBe("resubmit_live_link");
    expect(ugcStage("REVISION_DECLINED_LINKS").key).toBe("ugc_links_declined");
  });

  it("recognises REVISION_REQ, the token the lifecycle actually writes", () => {
    expect(ugcStage("REVISION_REQ").key).toBe("ugc_revision");
    expect(ugcStage("REVISION_REQUESTED").key).toBe("ugc_revision");
  });

  it("separates a declined revision from an open one", () => {
    expect(ugcStage("REVISION_DECLINED").key).toBe("ugc_revision_declined");
    expect(ugcStage("DISPUTED").key).toBe("ugc_revision_declined");
    expect(ugcStage("REVISION_DECLINED").action).toBeNull();
  });

  it("still ends the deal on a real completion", () => {
    expect(ugcStage("SUBMITTED").key).toBe("ugc_submitted");
    expect(ugcStage("APPROVED").key).toBe("ugc_approved");
  });
});

describe("the inbox never claims money that has not moved", () => {
  const chip = (thread, isBrand = false) =>
    getInboxChip({ id: "t1", deal_id: "ugcord_1", agreed_amount: 15000, ...thread }, isBrand);

  it("shows no payout for a draft that was merely approved", () => {
    const c = chip({ flow_state: "CONTENT_APPROVED", ugc_order: { id: "ugcord_1", status: "AWAITING_LIVE_LINK" } });
    expect(c.label).not.toMatch(/received/i);
    expect(c.label).not.toMatch(/payout released/i);
  });

  it("shows the amount once the payout really was released", () => {
    const c = chip({
      status: "COMPLETED",
      flow_state: "COMPLETED",
      payout_status: "RELEASED",
      ugc_order: { id: "ugcord_1", status: "COMPLETED" }
    });
    expect(c.label).toMatch(/15,000/);
    expect(c.label).toMatch(/received/i);
  });

  it("does not tell the brand it received anything", () => {
    const c = chip({ status: "COMPLETED", payout_status: "RELEASED", ugc_order: { id: "ugcord_1", status: "COMPLETED" } }, true);
    expect(c.label).not.toMatch(/received/i);
  });
});

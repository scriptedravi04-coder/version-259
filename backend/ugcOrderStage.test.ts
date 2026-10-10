import { describe, it, expect } from "vitest";
import { resolveUgcStage, phaseFromMessages } from "./ugcOrderStage";

// Shape of what syncUgcLifecycleEvent actually writes, so these tests fail if the lifecycle
// and the resolver ever drift apart. Do not "simplify" these fixtures to the tokens the
// resolver happens to like — the whole bug was a resolver that only knew its own vocabulary.
const msg = (message_type: string, action: string, at: string, text = "") => ({
  message_type,
  metadata: { action },
  text,
  created_at: at
});

const collabOrder = (over: Record<string, any> = {}) => ({
  id: "ugcord_collab_1",
  status: "SUBMITTED",
  payment_status: "PENDING",
  deliverable_type: "collaboration_reel",
  video_url: "https://drive.example.com/draft.mp4",
  delivered_at: "2026-09-18T10:00:00.000Z",
  ...over
});

describe("resolveUgcStage — collaboration draft approval (the reported bug)", () => {
  it("reads AWAITING_LIVE_LINK off the order, with no thread, no messages and no draft_approved_at", () => {
    // This is the exact state the old inline chains could not see. syncUgcLifecycleEvent writes
    // status 'AWAITING_LIVE_LINK' on APPROVE_DRAFT; both list routes only listed
    // 'CONTENT_APPROVED', so the brand's Manage Orders stayed on "draft under review" and the
    // creator was never asked for the live link — while the chat showed both correctly.
    const r = resolveUgcStage({
      order: collabOrder({ status: "AWAITING_LIVE_LINK" }),
      thread: null,
      messages: [],
      requiresLiveLink: true
    });

    expect(r.phase).toBe("CONTENT_APPROVED");
    expect(r.status).toBe("CONTENT_APPROVED");
    expect(r.brandStage).toBe("AWAITING_LIVE_LINK");
    expect(r.creatorStage).toBe("COMPLETED_APPROVAL");
    expect(r.isContentApproved).toBe(true);
    expect(r.isCompleted).toBe(false);
    expect(r.source).toBe("order_status");
  });

  it("recovers the stage from the chat timeline alone when the order row is stale", () => {
    // The failure mode that made this a sync bug rather than a display bug: the ugc_orders
    // write did not land (column whitelist, 0 matched rows, lost local state) but the chat
    // message did. Chat was right, Manage Orders was wrong. Now they agree.
    const r = resolveUgcStage({
      order: collabOrder({ status: "SUBMITTED" }),
      thread: null,
      messages: [
        msg("content_proof_submitted", "deliverable_submitted", "2026-09-18T10:00:00.000Z"),
        msg("content_approved", "draft_approved", "2026-09-18T12:00:00.000Z")
      ],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("AWAITING_LIVE_LINK");
    expect(r.creatorStage).toBe("COMPLETED_APPROVAL");
    expect(r.source).toBe("message");
  });

  it("recovers the stage from the thread flow_state when order and chat are both silent", () => {
    const r = resolveUgcStage({
      order: collabOrder({ status: "SUBMITTED" }),
      thread: { id: "ugcord_collab_1", flow_state: "CONTENT_APPROVED", status: "ACTIVE" },
      messages: [],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("AWAITING_LIVE_LINK");
    expect(r.source).toBe("thread");
  });

  it("does not claim a draft approval when nothing says so", () => {
    // The revert check: if AWAITING_LIVE_LINK handling were deleted, the first test above would
    // land here instead. A submitted-but-unapproved draft must stay in review.
    const r = resolveUgcStage({
      order: collabOrder({ status: "SUBMITTED" }),
      thread: { flow_state: "SUBMITTED" },
      messages: [],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("IN_REVIEW");
    expect(r.creatorStage).toBe("IN_REVIEW");
    expect(r.isContentApproved).toBe(false);
  });
});

describe("resolveUgcStage — the rest of the collaboration flow", () => {
  it("shows the live link as awaiting review once the creator submits it", () => {
    const r = resolveUgcStage({
      order: collabOrder({ status: "LINKS_UNDER_REVIEW", live_link: "https://instagram.com/p/abc" }),
      thread: { flow_state: "PROOF_SUBMITTED" },
      messages: [msg("live_links_submitted", "live_link_submitted", "2026-09-19T09:00:00.000Z")],
      requiresLiveLink: true
    });

    expect(r.status).toBe("PROOF_SUBMITTED");
    expect(r.brandStage).toBe("LIVE_LINK_SUBMITTED");
    expect(r.creatorStage).toBe("LIVE_LINK_SUBMITTED");
    expect(r.isLiveLinkSubmitted).toBe(true);
  });

  it("completes on live link approval", () => {
    const r = resolveUgcStage({
      order: collabOrder({ status: "COMPLETED", payment_status: "RELEASED" }),
      thread: { flow_state: "COMPLETED" },
      messages: [msg("live_links_approved", "live_links_approved", "2026-09-20T09:00:00.000Z")],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("COMPLETED");
    expect(r.isCompleted).toBe(true);
  });

  it("lets a live-link revision request overturn the earlier approval (latest wins, not furthest)", () => {
    // A revision is a step backwards. Picking the furthest-along signal instead of the latest
    // would leave the brand looking at "live link submitted" with nothing to do.
    const r = resolveUgcStage({
      order: collabOrder({ status: "REVISION_REQUESTED_LINKS", live_link: "https://instagram.com/p/abc" }),
      thread: { flow_state: "REVISION_REQUESTED_LINKS" },
      messages: [
        msg("live_links_submitted", "live_link_submitted", "2026-09-19T09:00:00.000Z"),
        msg("live_links_resubmit_request", "live_links_resubmit_requested", "2026-09-19T11:00:00.000Z")
      ],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("REVISION_REQUESTED_LINKS");
    expect(r.creatorStage).toBe("REVISION_REQUESTED_LINKS");
    expect(r.isLiveLinkSubmitted).toBe(false);
  });

  it("surfaces a declined live-link resubmission", () => {
    const r = resolveUgcStage({
      order: collabOrder({ status: "REVISION_DECLINED_LINKS" }),
      thread: { flow_state: "REVISION_DECLINED_LINKS" },
      messages: [],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("REVISION_DECLINED_LINKS");
  });

  it("surfaces an ordinary draft revision as REVISION_REQUESTED", () => {
    // The lifecycle writes 'REVISION_REQ', not 'REVISION_REQUESTED'. Both must map.
    const r = resolveUgcStage({
      order: collabOrder({ status: "REVISION_REQ" }),
      thread: { flow_state: "REVISION_REQ" },
      messages: [],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("REVISION_REQUESTED");
    expect(r.creatorStage).toBe("REVISION_REQUESTED");
  });
});

describe("resolveUgcStage — raw UGC must never grow a live-link step", () => {
  it("completes a raw UGC order on approval instead of waiting for a link", () => {
    const r = resolveUgcStage({
      order: {
        id: "ugcord_raw_1",
        status: "COMPLETED",
        payment_status: "RELEASED",
        deliverable_type: "ugc_video_raw"
      },
      thread: { flow_state: "COMPLETED" },
      messages: [msg("content_approved", "approved", "2026-09-20T09:00:00.000Z")],
      requiresLiveLink: false
    });

    expect(r.brandStage).toBe("COMPLETED");
    expect(r.creatorStage).toBe("COMPLETED");
  });

  it("never parks a non-collaboration order on 'awaiting live link', even if the status says so", () => {
    // Money safety in the recoverable direction: a raw order that somehow carries
    // AWAITING_LIVE_LINK would otherwise sit there forever and its payout would never release.
    const r = resolveUgcStage({
      order: { id: "ugcord_raw_2", status: "AWAITING_LIVE_LINK", deliverable_type: "ugc_video_edited" },
      thread: null,
      messages: [],
      requiresLiveLink: false
    });

    expect(r.brandStage).not.toBe("AWAITING_LIVE_LINK");
    expect(r.creatorStage).not.toBe("COMPLETED_APPROVAL");
    expect(r.phase).toBe("COMPLETED");
  });

  it("does not read a final 'content_approved' message as a pending live-link step", () => {
    // 'content_approved' is used for BOTH the collaboration draft approval and the raw UGC
    // final approval. Only metadata.action tells them apart.
    expect(phaseFromMessages([msg("content_approved", "approved", "2026-09-20T09:00:00.000Z")])).toBe("COMPLETED");
    expect(phaseFromMessages([msg("content_approved", "draft_approved", "2026-09-20T09:00:00.000Z")])).toBe("CONTENT_APPROVED");
  });

  it("falls back to the message text when metadata.action is missing", () => {
    const draft = {
      message_type: "content_approved",
      text: "🎉 Video Draft Approved by Brand!\n\nPlease publish your content and submit the live post link.",
      created_at: "2026-09-20T09:00:00.000Z"
    };
    const final = {
      message_type: "content_approved",
      text: "🎉 UGC Deliverable Approved! Escrow payout has been released to your account.",
      created_at: "2026-09-20T09:00:00.000Z"
    };
    expect(phaseFromMessages([draft])).toBe("CONTENT_APPROVED");
    expect(phaseFromMessages([final])).toBe("COMPLETED");
  });
});

describe("resolveUgcStage — terminal states and defaults", () => {
  it("keeps a released payout terminal even if an older chat message says draft approved", () => {
    const r = resolveUgcStage({
      order: collabOrder({ status: "COMPLETED", payment_status: "RELEASED", escrow_released_at: "2026-09-20T09:00:00.000Z" }),
      thread: { flow_state: "CONTENT_APPROVED" },
      messages: [msg("content_approved", "draft_approved", "2026-09-18T12:00:00.000Z")],
      requiresLiveLink: true
    });

    expect(r.isCompleted).toBe(true);
    expect(r.source).toBe("terminal");
  });

  it("reports a cancelled order as cancelled", () => {
    const r = resolveUgcStage({
      order: collabOrder({ status: "CANCELLED", payment_status: "REFUNDED" }),
      thread: { flow_state: "CANCELLED" },
      messages: [],
      requiresLiveLink: true
    });

    expect(r.isCancelled).toBe(true);
    expect(r.brandStage).toBe("CANCELLED");
  });

  it("falls back to IN_PROGRESS for a freshly claimed order", () => {
    const r = resolveUgcStage({
      order: { id: "ugcord_new", status: "ACCEPTED", deliverable_type: "collaboration_reel" },
      thread: { flow_state: "ACTIVE" },
      messages: [],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("IN_PROGRESS");
    expect(r.creatorStage).toBe("IN_PROGRESS");
    expect(r.isContentApproved).toBe(false);
  });

  it("treats a submitted draft as in review", () => {
    const r = resolveUgcStage({
      order: collabOrder(),
      thread: { flow_state: "SUBMITTED" },
      messages: [msg("content_proof_submitted", "deliverable_submitted", "2026-09-18T10:00:00.000Z")],
      requiresLiveLink: true
    });

    expect(r.brandStage).toBe("IN_REVIEW");
    expect(r.status).toBe("SUBMITTED");
  });

  it("ignores chat messages that carry no lifecycle action", () => {
    expect(phaseFromMessages([{ message_type: "text", text: "bhai kab tak ho jayega?", created_at: "2026-09-18T10:00:00.000Z" }])).toBe(null);
    expect(phaseFromMessages([])).toBe(null);
    expect(phaseFromMessages(null)).toBe(null);
  });
});

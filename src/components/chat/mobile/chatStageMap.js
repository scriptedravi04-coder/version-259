import { isUgcThread as sharedIsUgcThread } from "../../../utils/dealFlow";

// Central place that turns a thread's real backend state (status / flow_state /
// ugc_order.status / signature flags) into what the mobile stage bar shows.
// Mirrors the same fields ChatBox.jsx already reads — nothing new is invented here,
// this just classifies the existing state machine for the mobile UI's "one grammar" spec.

export function getChatStage({ thread, isBrand, isUgcOrder, isMySignatureSigned, isOtherPartySigned, isDealCompleted, messages }) {
  const hasCompletedMsg = (messages || []).some(m => {
    const type = (m.message_type || m.type || '').toLowerCase();
    const content = (m.content || m.text || '').toLowerCase();
    const action = (m.metadata?.action || '').toLowerCase();
    const status = (m.metadata?.status || '').toLowerCase();
    return (
      type === 'payment_trigger' || 
      type === 'payout_released' || 
      type === 'payment_released' ||
      type === 'live_links_approved' ||
      type === 'chat_closed' ||
      action === 'live_links_approved' ||
      action === 'payout_released' ||
      status === 'completed' ||
      content.includes('escrow payment released') ||
      content.includes('payout has been released') ||
      content.includes('payment released') ||
      content.includes('payout released') ||
      content.includes('deliverables & live links approved') ||
      content.includes('collaboration completed') ||
      content.includes('ugc deliverable approved') ||
      content.includes('invoice generated and payment has been processed')
    );
  });

  const completed = Boolean(
    isDealCompleted ||
    hasCompletedMsg ||
    thread?.isDealCompleted ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED", "RESOLVED"].includes(String(thread?.status || "").toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(String(thread?.flow_state || "").toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(String(thread?.payout_status || "").toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(String(thread?.ugc_order?.status || "").toUpperCase()) ||
    Boolean(thread?.utr_number || thread?.payout_utr)
  );

  if (completed) {
    const alreadyRated = Boolean(thread?.rating_submitted || thread?.review_submitted || (isBrand ? thread?.reviewed_by_brand : thread?.reviewed_by_creator));
    return {
      key: "completed",
      label: "Deal completed · Payout released",
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      action: alreadyRated ? null : { label: "Rate partner", key: "rate" },
    };
  }

  const status = String(thread?.status || thread?.ugc_order?.status || "").toUpperCase();
  const flow = String(thread?.flow_state || "").toUpperCase();
  const s = flow || status; // prefer flow_state when present, same precedence ChatBox uses

  // --- UGC order flow ---
  //
  // This branch was written when a UGC order had no live-link step and approval was the end
  // of the deal, and it was never revisited when collaboration orders arrived. The result:
  // after a draft approval, CONTENT_APPROVED matched the "approved" case and the creator was
  // told "Approved & unlocked" with no action — never offered "Add live link" — while every
  // live-link state below matched nothing at all and fell through to "In production".
  //
  // The order of these checks mirrors backend/ugcOrderStage.ts. Live-link states come first
  // because they are the later, more specific part of the flow.
  if (isUgcOrder) {
    if (["REVISION_DECLINED_LINKS"].includes(s)) {
      return {
        key: "ugc_links_declined",
        label: isBrand ? "Live link correction declined" : "You declined · discuss in chat",
        dot: "#E11D48",
        bg: "#FFF1F2",
        text: "#9F1239",
        action: null,
      };
    }
    if (["REVISION_REQUESTED_LINKS", "LIVE_LINK_REVISION_REQ"].includes(s)) {
      return {
        key: "ugc_links_revision",
        label: isBrand ? "Awaiting corrected live link" : "Your turn · fix live link",
        dot: "#D97706",
        bg: "#FFFBEB",
        text: "#92400E",
        action: isBrand ? null : { label: "Resubmit live link", key: "resubmit_live_link" },
      };
    }
    if (["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINK_SUBMITTED", "LINKS_SUBMITTED"].includes(s)) {
      return {
        key: "ugc_links_submitted",
        label: isBrand ? "Live link submitted · verify it" : "Live link submitted · under review",
        dot: "#7C3AED",
        bg: "#F5F0FF",
        text: "#5B21B6",
        action: isBrand ? { label: "Review live link", key: "review_live_link" } : null,
      };
    }
    if (["CONTENT_APPROVED", "DRAFT_APPROVED", "AWAITING_LIVE_LINK", "COMPLETED_APPROVAL"].includes(s)) {
      // Draft approved, escrow still held, nothing published yet. Calling this "approved"
      // hid the one step the creator still had to take, and hid from the brand that it was
      // waiting on the creator.
      return {
        key: "ugc_awaiting_live_link",
        label: isBrand ? "Waiting for live link" : "Draft approved · post it",
        dot: "#0891B2",
        bg: "#ECFEFF",
        text: "#155E75",
        action: isBrand ? null : { label: "Add live link", key: "submit_live_link" },
      };
    }
    if (["REVISION_DECLINED", "DISPUTED"].includes(s)) {
      return {
        key: "ugc_revision_declined",
        label: isBrand ? "Revision declined by creator" : "You declined · discuss in chat",
        dot: "#E11D48",
        bg: "#FFF1F2",
        text: "#9F1239",
        action: null,
      };
    }
    if (["REVISION_REQUESTED", "REVISION_REQ", "IN_REVISION"].includes(s)) {
      // The lifecycle writes REVISION_REQ. Only REVISION_REQUESTED was listed here, so a
      // real revision request fell through to "In production".
      return {
        key: "ugc_revision",
      label: isBrand ? "Revision requested" : "Revision requested · resubmit",
        dot: "#D97706",
        bg: "#FFFBEB",
        text: "#92400E",
        action: isBrand ? null : { label: "Upload revised draft", key: "reupload" },
      };
    }
    if (["SUBMITTED", "CONTENT_SUBMITTED", "IN_REVIEW"].includes(s)) {
      return {
        key: "ugc_submitted",
      label: isBrand ? "Draft submitted · review it" : "Submitted · awaiting review",
        dot: "#7C3AED",
        bg: "#F5F0FF",
        text: "#5B21B6",
        action: isBrand ? { label: "Review draft", key: "review" } : null,
      };
    }
    if (["APPROVED", "COMPLETED", "PAID", "RELEASED"].includes(s)) {
      // CONTENT_APPROVED is deliberately no longer in this list — it is a draft approval,
      // not the end of the deal.
      return {
        key: "ugc_approved",
      label: "Approved & unlocked",
        dot: "#059669",
        bg: "#ECFDF5",
        text: "#065F46",
        action: null,
      };
    }
    // claimed / in progress / default
    return {
      key: "ugc_active",
      label: isBrand ? "In production" : "Claimed · working on it",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: null,
    };
  }

  // --- Campaign Deal flow ---
  if (["NEGOTIATING", "NEGOTIATING_COUNTER"].includes(s) || (!isMySignatureSigned && !isOtherPartySigned && s !== "ACTIVE")) {
    const otherHasCountered = s === "NEGOTIATING_COUNTER";
    return {
      key: "negotiating",
      label: "Negotiating · no payment yet",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: otherHasCountered ? { label: "Respond to counter", key: "respond_counter", pulse: true } : null,
    };
  }
  if (["AI_AGREEMENT_READY", "AGREEMENT_SIGNED", "SIGNED"].includes(s) && !(isMySignatureSigned && isOtherPartySigned)) {
    return {
      key: "contract",
      label: isMySignatureSigned ? "Waiting for the other party to sign" : "Contract ready · sign to continue",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: isMySignatureSigned ? null : { label: "Sign contract", key: "sign" },
    };
  }
  if (["ESCROW_FUNDED", "ESCROW_HELD", "ESCROW_PAID", "ACTIVE", "IN_PROGRESS"].includes(s)) {
    return {
      key: "escrow_active",
      label: "Secure payment hold secured · deal active",
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      action: null,
    };
  }
  if (["CONTENT_SUBMITTED", "IN_REVIEW", "SUBMITTED", "DELIVERED_APPROVAL", "COMPLETED_APPROVAL"].includes(s)) {
    return {
      key: "draft_submitted",
      label: isBrand ? "Draft submitted · review it" : "Draft sent · awaiting review",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: isBrand ? { label: "Review draft", key: "review" } : null,
    };
  }
  if (["REVISION_REQUESTED", "REVISION_REQ", "CHANGES_REQUESTED", "REVISION_DECLINED", "CHANGES_DECLINED"].includes(s)) {
    return {
      key: "changes_requested",
      label: isBrand ? "Changes requested · awaiting revision" : "Changes requested · resubmit",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: isBrand ? null : { label: "Upload revised draft", key: "reupload" },
    };
  }
  if (["CONTENT_APPROVED", "APPROVED"].includes(s)) {
    return {
      key: "content_approved",
      label: isBrand ? "Approved · waiting on live link" : "Approved · submit your live link",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: !isBrand ? { label: "Add live link", key: "live_link" } : null,
    };
  }
  if (["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINK_SUBMITTED", "LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED"].includes(s)) {
    return {
      key: "live_link_submitted",
      label: isBrand ? "Live link submitted · approve it" : "Live link sent · awaiting approval",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: isBrand ? { label: "Approve & release", key: "approve_live_link" } : null,
    };
  }
  if (["LIVE_LINK_REVISION", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS"].includes(s)) {
    return {
      key: "live_link_revision",
      label: isBrand ? "Live link revision requested" : "Fix live link · resubmit",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: !isBrand ? { label: "Resubmit link", key: "live_link" } : null,
    };
  }
  if (["LIVE_LINKS_APPROVED", "RELEASED", "PAID"].includes(s)) {
    const hasUtr = Boolean(thread?.payout_utr || thread?.utr_number);
    return {
      key: "paid",
      label: hasUtr ? "Payment completed · UTR shared" : "Payout released · processing",
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      action: null,
    };
  }
  if (["CLOSED", "RESOLVED", "COMPLETED"].includes(s)) {
    const alreadyRated = Boolean(thread?.rating_submitted || thread?.review_submitted);
    return {
      key: "completed",
      label: "Collaboration completed",
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      action: alreadyRated ? null : { label: "Rate collaboration", key: "rate" },
    };
  }

  // Fallback — don't guess, just show a neutral chat state
  return { key: "chat", label: "Chat", dot: "#6B7280", bg: "#F2F2F7", text: "#6B7280", action: null };
}

// Same signature-flag derivation useChatThreadMobile.js uses. Kept here so the inbox
// list (which never mounts the chat hook) classifies a thread exactly like the chat
// screen does — one grammar, one source.
export function getSignatureFlags(thread, isBrand) {
  const isCreatorSigned = Boolean(
    thread?.agreement_signed_creator ||
    thread?.is_signed_creator ||
    thread?.creator_signed ||
    thread?.contract_signed_creator
  );
  const isBrandSigned = Boolean(
    thread?.agreement_signed_brand ||
    thread?.is_signed_brand ||
    thread?.brand_signed ||
    thread?.contract_signed_brand
  );
  return {
    isMySignatureSigned: isBrand ? isBrandSigned : isCreatorSigned,
    isOtherPartySigned: isBrand ? isCreatorSigned : isBrandSigned,
  };
}

// Same fields populateThreadData() sets on every thread in GET /chat/v2/threads.
export function getIsUgcThread(thread) {
  // Kept as a named export because the mobile inbox already imports it, but the decision
  // itself now comes from the shared detector so mobile can never disagree with desktop.
  return sharedIsUgcThread(thread);
}

// Short forms of the chat stage labels, for the inbox list row where the chip sits
// next to a name, a campaign title and a timestamp. Keyed off getChatStage()'s `key`
// so the two can't drift: if a stage is added to the map above and no short label is
// listed here, the chip falls back to the full stage label rather than a raw enum.
const INBOX_LABELS = {
  ugc_awaiting_live_link: { brand: "Waiting for live link", creator: "Draft approved · post it" },
  ugc_links_submitted: { brand: "Verify live link",    creator: "Live link under review" },
  ugc_links_revision:  { brand: "Awaiting corrected link", creator: "Your turn · fix live link" },
  ugc_links_declined:  { brand: "Correction declined", creator: "You declined" },
  ugc_revision_declined: { brand: "Revision declined", creator: "You declined" },
  ugc_revision:        { brand: "Awaiting revision",   creator: "Your turn · reupload" },
  ugc_submitted:       { brand: "Awaiting your review", creator: "Waiting on brand" },
  ugc_approved:        { brand: "Approved",            creator: "Approved" },
  ugc_active:          { brand: "In production",       creator: "In production" },
  negotiating:         { brand: "Negotiating",         creator: "Offer received" },
  escrow_active:       { brand: "In production",       creator: "In production" },
  draft_submitted:     { brand: "Awaiting your review", creator: "Waiting on brand" },
  changes_requested:   { brand: "Awaiting revision",   creator: "Your turn · reupload" },
  content_approved:    { brand: "Awaiting live link",  creator: "Add live link" },
  live_link_submitted: { brand: "Review live link",    creator: "Waiting on brand" },
  live_link_revision:  { brand: "Revision requested",  creator: "Fix live link" },
  completed:           { brand: "Payout released",     creator: "Payout released" },
  chat:                { both: "Active" },
};

export function getInboxChip(thread, isBrand) {
  const isUgcOrder = getIsUgcThread(thread);
  const { isMySignatureSigned, isOtherPartySigned } = getSignatureFlags(thread, isBrand);
  const stage = getChatStage({ thread, isBrand, isUgcOrder, isMySignatureSigned, isOtherPartySigned });

  let label;
  let bg = stage.bg;
  let text = stage.text;
  let dot = stage.dot;

  const statusStr = String(thread?.status || thread?.ugc_order?.status || thread?.flow_state || "").toUpperCase();

  if (statusStr.includes("EXPIRED")) {
    label = "Expired";
    dot = "#9CA3AF";
    bg = "#F3F4F6";
    text = "#4B5563";
  } else if (statusStr.includes("DECLINED") || statusStr.includes("REJECTED")) {
    label = isBrand ? "Declined by creator" : "Declined";
    dot = "#9CA3AF";
    bg = "#F3F4F6";
    text = "#4B5563";
  } else if (stage.key === "contract") {
    label = isMySignatureSigned ? "Waiting on brand" : (isBrand ? "Sign contract" : "Sign contract");
    dot = isMySignatureSigned ? "#7C3AED" : "#EF4444";
    bg = isMySignatureSigned ? "#F5F3FF" : "#FEE2E2";
    text = isMySignatureSigned ? "#6D28D9" : "#DC2626";
  } else if (stage.key === "paid" || stage.key === "completed" || stage.key === "ugc_approved") {
    // "₹x received" is a claim about money, so it needs evidence that money actually moved.
    // ugc_approved used to be reached by a mere draft approval, and the creator's inbox then
    // showed a green "₹15,000 received" for a deal where nothing had been paid and nothing
    // had even been posted yet. The stage no longer includes draft approvals, and this line
    // no longer takes the stage's word for it either.
    const payoutAmt = thread?.agreed_amount || thread?.amount_fixed || thread?.ugc_order?.amount || thread?.amount;
    const payoutReleased = Boolean(
      thread?.utr_number ||
      thread?.payout_utr ||
      ["RELEASED", "PAID", "COMPLETED"].includes(String(thread?.payout_status || "").toUpperCase()) ||
      ["COMPLETED", "PAID", "RELEASED"].includes(String(thread?.status || "").toUpperCase()) ||
      ["COMPLETED", "PAID", "RELEASED"].includes(String(thread?.ugc_order?.status || "").toUpperCase())
    );
    label = !isBrand && payoutAmt && payoutReleased
      ? `₹${Number(payoutAmt).toLocaleString("en-IN")} received`
      : (payoutReleased ? "Payout released" : "Approved");
    dot = "#10B981";
    bg = "#ECFDF5";
    text = "#059669";
  } else if (stage.key === "changes_requested" || stage.key === "ugc_revision") {
    if (!isBrand) {
      label = "Your turn · reupload";
      dot = "#EF4444";
      bg = "#FEE2E2";
      text = "#DC2626";
    } else {
      label = "Awaiting revision";
      dot = "#F59E0B";
      bg = "#FEF3C7";
      text = "#B45309";
    }
  } else if (stage.key === "draft_submitted" || stage.key === "ugc_submitted") {
    if (isBrand) {
      label = "Awaiting your review";
      dot = "#F59E0B";
      bg = "#FEF3C7";
      text = "#B45309";
    } else {
      label = "Waiting on brand";
      dot = "#7C3AED";
      bg = "#F5F3FF";
      text = "#6D28D9";
    }
  } else {
    const entry = INBOX_LABELS[stage.key];
    label = entry ? (entry.both || (isBrand ? entry.brand : entry.creator)) : stage.label;
  }

  return {
    key: stage.key,
    label,
    bg,
    text,
    dot,
    needsAction: (stage.key === "completed" || stage.key === "paid") ? false : (Boolean(stage.action) || (!isBrand && label.includes("Your turn")) || (isBrand && label.includes("review"))),
  };
}

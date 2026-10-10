// Session 23 — one source of truth for "where is this deal", for the MOBILE chat.
//
// Mobile used to keep its own, different copy of these flags. It did not read `payment_funded`
// (so a paid deal still showed "Make payment"), treated ANY old revision message as an open
// revision, and showed "Sign agreement" while the price was still being negotiated. Every
// expression below is copied from desktop ChatBox.jsx (same fields, same order) so both screens
// agree. If desktop logic changes, change it here too (guard: session23.test.ts).

import { resolveReviewFlags } from "./chatFlowState";

const up = (v) => String(v || "").toUpperCase();

export function getDealAmount(t) {
  return t?.agreed_amount || t?.amount_fixed || t?.campaign?.budget || t?.campaign_budget || t?.ugc_order?.amount || t?.ugc_order?.creator_payout || t?.ugc_order?.agreed_amount || 0;
}

export function deriveDealState({ thread: currentThread, messages = [], isBrand = false }) {
  const msgs = messages || [];

  const isCreatorSigned = Boolean(
    currentThread?.agreement_signed_creator || currentThread?.is_signed_creator ||
    currentThread?.creator_signed || currentThread?.contract_signed_creator
  );
  const isBrandSigned = Boolean(
    currentThread?.agreement_signed_brand || currentThread?.is_signed_brand ||
    currentThread?.brand_signed || currentThread?.contract_signed_brand
  );
  const isMySignatureSigned = isBrand ? isBrandSigned : isCreatorSigned;
  const isOtherPartySigned = isBrand ? isCreatorSigned : isBrandSigned;

  const rawStatus = up(currentThread?.status || currentThread?.ugc_order?.status);
  const ugcStatus = up(currentThread?.ugc_order?.status);
  const flowState = up(currentThread?.flow_state);

  const isUgcOrder = Boolean(
    currentThread?.is_ugc || currentThread?.ugc_order_id || currentThread?.ugc_brief_id ||
    currentThread?.ugc_order || currentThread?.deal_type === "UGC" || currentThread?.type === "ugc" ||
    currentThread?.ugc_title ||
    currentThread?.campaign_title?.toLowerCase()?.includes("ugc") ||
    currentThread?.title?.toLowerCase()?.includes("ugc") ||
    currentThread?.id?.startsWith("ugcord_") || currentThread?.deal_id?.startsWith("ugcord_") ||
    currentThread?.id?.startsWith("thread_ugc_")
  );

  const isAgreementSigned = isUgcOrder ? true : (currentThread ? (isBrandSigned && isCreatorSigned) : false);
  const isDealFixed = isUgcOrder ? true : (currentThread ? Boolean(
    (currentThread?.status && up(currentThread.status) !== "NEGOTIATING") ||
    currentThread?.flow_state === "AI_AGREEMENT_READY" ||
    currentThread?.is_ugc
  ) : false);

  const hasCompletedMessage = msgs.some((m) => {
    const type = (m.message_type || m.type || "").toLowerCase();
    const content = (m.content || m.text || "").toLowerCase();
    const action = (m.metadata?.action || "").toLowerCase();
    const status = (m.metadata?.status || "").toLowerCase();
    return (
      type === "payment_trigger" || type === "payout_released" || type === "payment_released" ||
      type === "live_links_approved" || type === "chat_closed" ||
      action === "live_links_approved" || action === "payout_released" || status === "completed" ||
      content.includes("escrow payment released") || content.includes("payout has been released") ||
      content.includes("payment released") || content.includes("payout released") ||
      content.includes("deliverables & live links approved") || content.includes("collaboration completed") ||
      content.includes("ugc deliverable approved") ||
      content.includes("invoice generated and payment has been processed")
    );
  });

  const deliverableTypeStr = String(
    currentThread?.deliverable_type || currentThread?.ugc_order?.deliverable_type ||
    currentThread?.ugc_brief?.deliverable_type || currentThread?.brief?.deliverable_type || ""
  ).toLowerCase();

  const isCollabOrder = currentThread?.requires_live_link !== undefined
    ? Boolean(currentThread.requires_live_link)
    : (currentThread?.is_collaboration !== undefined
      ? Boolean(currentThread.is_collaboration)
      : (isUgcOrder ? (!deliverableTypeStr.includes("raw") && !deliverableTypeStr.includes("edited") && !deliverableTypeStr.startsWith("ugc_video") && (deliverableTypeStr.includes("collab") || deliverableTypeStr.includes("reel"))) : true));

  const DONE = ["COMPLETED", "CLOSED", "PAID", "RELEASED"];
  const isDealCompleted = currentThread ? Boolean(
    hasCompletedMessage ||
    [...DONE, "RESOLVED"].includes(up(currentThread?.status)) ||
    DONE.includes(up(currentThread?.ugc_order?.status)) ||
    DONE.includes(up(currentThread?.ugc_order?.payment_status)) ||
    DONE.includes(up(currentThread?.payout_status)) ||
    DONE.includes(up(currentThread?.flow_state)) ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number) ||
    (isUgcOrder && !isCollabOrder && (
      Boolean(currentThread?.ugc_order?.draft_approved_at || currentThread?.draft_approved_at) ||
      ["APPROVED", "CONTENT_APPROVED"].includes(up(currentThread?.ugc_order?.status)) ||
      ["APPROVED", "CONTENT_APPROVED"].includes(up(currentThread?.status)) ||
      ["APPROVED", "CONTENT_APPROVED"].includes(up(currentThread?.flow_state))
    ))
  ) : false;

  const FUNDED_PAY = ["ESCROW_HELD", "PAID", "RELEASED", "COMPLETED"];
  const FUNDED_STATE = ["SUBMITTED", "CONTENT_SUBMITTED", "COMPLETED", "APPROVED", "IN_PROGRESS", "ACCEPTED", "REVISION_REQUESTED", "REVISION_REQ", "CHANGES_DECLINED", "CONTENT_APPROVED", "LIVE_LINKS_SUBMITTED", "LIVE_LINK_REVISION", "LIVE_LINKS_APPROVED"];
  const isPaymentFunded = Boolean(
    currentThread?.payment_funded === true || currentThread?.escrow_funded === true ||
    currentThread?.escrow_hold === true || currentThread?.deal?.escrow_hold === true ||
    currentThread?.ugc_order?.escrow_hold === true ||
    Boolean(currentThread?.escrow_held_at || currentThread?.deal?.escrow_hold_at || currentThread?.ugc_order?.escrow_held_at) ||
    FUNDED_PAY.includes(up(currentThread?.payment_status)) ||
    FUNDED_PAY.includes(up(currentThread?.deal?.payment_status)) ||
    FUNDED_PAY.includes(up(currentThread?.ugc_order?.payment_status)) ||
    FUNDED_STATE.includes(rawStatus) || FUNDED_STATE.includes(flowState) ||
    hasCompletedMessage ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number) ||
    (isUgcOrder && currentThread?.ugc_brief_id && currentThread?.payment_funded !== false) ||
    msgs.some((m) => {
      const type = (m.message_type || "").toLowerCase();
      const text = (m.text || m.content || "").toLowerCase();
      const meta = m.metadata || {};
      return (
        type === "payment_funded" || type === "payment_secured" ||
        meta.action === "escrow_funded" || meta.action === "payment_secured" ||
        meta.isPayment === true || meta.payment_funded === true ||
        text.includes("escrow payment secured") || text.includes("secured into ybex escrow") ||
        text.includes("deposited into ybex escrow") || text.includes("payment secured")
      );
    })
  );

  const relevantActions = msgs.filter((m) =>
    m.message_type === "content_proof_submitted" || m.message_type === "CHANGES_REQUESTED" ||
    m.message_type === "revision_requested" || m.message_type === "revision_declined" ||
    m.message_type === "live_links_submitted"
  );
  const latestActionMsg = relevantActions.length ? relevantActions[relevantActions.length - 1] : null;

  const dealStatus = up(currentThread?.deal?.status || currentThread?.status);
  const APPROVED = ["APPROVED", "CONTENT_APPROVED", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "COMPLETED_APPROVAL"];
  const isContentApproved = !isDealCompleted && (
    APPROVED.includes(rawStatus) || APPROVED.includes(ugcStatus) || APPROVED.includes(flowState) ||
    APPROVED.includes(dealStatus) || currentThread?.content_approved === true ||
    currentThread?.deal?.status === "CONTENT_APPROVED" || currentThread?.flow_state === "CONTENT_APPROVED" ||
    msgs.some((m) => m.message_type === "content_approved" || (m.metadata && (m.metadata.action === "draft_approved" || m.metadata.status === "CONTENT_APPROVED")))
  );

  const { isRevisionRequested, isRevisionDeclined, isContentSubmitted } = resolveReviewFlags({
    isDealCompleted, isContentApproved, rawStatus, ugcStatus, flowState,
    latestActionType: latestActionMsg?.message_type || null,
  });

  const isCampaignThread = !isUgcOrder;
  const isNegotiationLocked = isCampaignThread && Boolean(
    currentThread?.agreement_signed_brand || currentThread?.agreement_signed_creator ||
    ["AI_AGREEMENT_READY", "AWAITING_SIGNATURE", "AGREEMENT_PENDING", "CONTRACT_READY", "CONTRACT_SIGNED", "PROOF_SUBMITTED", "ACTIVE", "COMPLETED"].includes(flowState)
  );

  const linkMsgs = msgs.filter((m) => {
    const type = (m.message_type || m.type || "").toLowerCase();
    const action = (m.metadata?.action || "").toLowerCase();
    return (
      type === "live_links_resubmit_request" || type === "live_links_resubmit_declined" ||
      type === "live_links_submitted" || type === "live_links_approved" ||
      action === "live_links_resubmit_requested" || action === "live_links_resubmit_declined" ||
      action === "live_link_submitted" || action === "live_links_approved"
    );
  });
  const latestLinkActionMsg = linkMsgs.length ? linkMsgs[linkMsgs.length - 1] : null;
  const lt = (latestLinkActionMsg?.message_type || "").toLowerCase();
  const la = (latestLinkActionMsg?.metadata?.action || "").toLowerCase();
  const linkReopenedByMsg = Boolean(latestLinkActionMsg && (
    lt === "live_links_resubmit_request" || la === "live_links_resubmit_requested" ||
    lt === "live_links_resubmit_declined" || la === "live_links_resubmit_declined"
  ));
  const LINK_REV = ["REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "LIVE_LINK_REVISION_REQ", "LIVE_LINK_REVISION"];
  const isUgcLinksRevisionOpen = isUgcOrder && isCollabOrder && (
    LINK_REV.some((s) => s === rawStatus || s === ugcStatus || s === flowState || s === dealStatus) || linkReopenedByMsg
  );
  const isCampaignLinksRevisionOpen = !isUgcOrder && (
    LINK_REV.some((s) => s === rawStatus || s === flowState || s === dealStatus) || linkReopenedByMsg
  );
  const isLiveLinksRevisionOpen = isUgcOrder ? isUgcLinksRevisionOpen : isCampaignLinksRevisionOpen;

  const linkSubmittedByMsg = lt === "live_links_submitted" || la === "live_link_submitted";
  const isLiveLinksSubmitted = !isDealCompleted && !isUgcLinksRevisionOpen && !isCampaignLinksRevisionOpen && (
    isUgcOrder
      ? (isCollabOrder && (["LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED", "LINKS_UNDER_REVIEW"].includes(ugcStatus) || Boolean(currentThread?.ugc_order?.live_links_submitted) || linkSubmittedByMsg))
      : (["LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED", "LINKS_UNDER_REVIEW", "PROOF_SUBMITTED"].includes(rawStatus) ||
        ["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINKS_SUBMITTED"].includes(flowState) ||
        Boolean(currentThread?.live_links_submitted) || Boolean(currentThread?.deal?.live_links_submitted) ||
        linkSubmittedByMsg)
  );

  return {
    isUgcOrder, isCollabOrder, isCreatorSigned, isBrandSigned, isMySignatureSigned, isOtherPartySigned,
    isAgreementSigned, isDealFixed, isNegotiationLocked, isPaymentFunded, isDealCompleted,
    isContentApproved, isRevisionRequested, isRevisionDeclined, isContentSubmitted,
    isLiveLinksRevisionOpen, isLiveLinksSubmitted, amount: getDealAmount(currentThread),
  };
}

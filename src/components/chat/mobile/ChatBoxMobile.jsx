import React, { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  MoreVertical,
  Plus,
  Send,
  ShieldCheck,
  Lock,
  MessageSquare,
  Shield,
  Upload,
  CheckCircle2,
  FileSignature,
  Link2,
  Star,
  AlertCircle,
  Loader2,
  Clock,
  Video,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useChatThreadMobile from "./useChatThreadMobile";
import { checkComprehensiveDisallowedContent, splitNumberAcrossMessages } from "../../../utils/contactSecurityFilter";
import { deriveDealState } from "../dealState";
import NegotiationTable from "../NegotiationTable";
import MobileRespondOfferSheet from "./MobileRespondOfferSheet";
import { getChatStage } from "./chatStageMap";
import MobileMessageRow, { supersededReviewCards } from "./MobileMessageRow";
import MobileRequestChangesSheet, { LIVE_LINK_TAGS } from "./MobileRequestChangesSheet";
import MobileEscrowSheet from "./MobileEscrowSheet";
import MobileRatingSheet from "./MobileRatingSheet";
import MobileLiveLinkSheet from "./MobileLiveLinkSheet";
import MobileUploadSheet from "./MobileUploadSheet";
import { MobileShortlistedCard, MobileBriefCard, MobileClaimedCard } from "./MobileBriefCards";
import MobileContractSheet from "./MobileContractSheet";
import CreatorCodeDealCard from "../../referral/CreatorCodeDealCard";
import BurgerMenuSupport from "../BurgerMenuSupport";
import MobileOrderSupportSheet from "./MobileOrderSupportSheet";

const getPartnerPic = (partner, partnerIsBrand) => {
  if (!partner) return "";
  if (partnerIsBrand) {
    return (
      partner.profile?.logo ||
      partner.logo ||
      partner.logo_url ||
      partner.profile?.logo_url ||
      partner.photo ||
      partner.picture ||
      partner.avatar ||
      partner.avatar_url ||
      partner.profile_picture_url ||
      partner.profile?.photo ||
      partner.profile?.picture ||
      partner.profile?.avatar ||
      ""
    );
  }
  return (
    // Session 43 (Ravi: creator showed only "B"): creators keep their photo in profile_photo_url.
    partner.profile_photo_url ||
    partner.profile?.profile_photo_url ||
    partner.photo ||
    partner.picture ||
    partner.avatar ||
    partner.avatar_url ||
    partner.profile_picture_url ||
    partner.profile?.photo ||
    partner.profile?.picture ||
    partner.profile?.avatar ||
    partner.logo ||
    partner.logo_url ||
    partner.profile?.logo ||
    partner.profile?.logo_url ||
    ""
  );
};

const getDealAmount = (t) =>
  t?.agreed_amount ||
  t?.amount_fixed ||
  t?.campaign?.budget ||
  t?.campaign_budget ||
  t?.ugc_order?.amount ||
  t?.ugc_order?.creator_payout ||
  t?.ugc_order?.agreed_amount ||
  0;

export default function ChatBoxMobile({ thread, user, onlineUsers = [], onBack }) {
  const {
    currentThread,
    messages,
    isBrand,
    isUgcOrder: _hookIsUgc,
    isMySignatureSigned: _hookMySigned,
    isOtherPartySigned: _hookOtherSigned,
    isDealCompleted: _hookDealCompleted,
    isEscrowFunded: _hookEscrowFunded,
    sendText,
    acceptCounter,
    sendCounter,
    payIntoEscrow,
    paying,
    loadMessages,
    refreshThread,
    approveDeliverable,
    requestChanges,
    declineRevisions,
    declineLinkResubmission,
    submitLiveLink,
    approveLiveLinks,
    rejectLiveLinks,
    uploadDeliverable,
    submitReview,
    sendSignOtp,
    signAgreement,
  } = useChatThreadMobile(thread, user);

  // Session 23: the SAME deal-state flags as desktop ChatBox (src/components/chat/dealState.js).
  // Mobile used to compute its own, and they disagreed: a funded deal still said "Make payment",
  // any old revision kept the chat in "revisions required", and "Sign agreement" showed while
  // the price was still being negotiated.
  const {
    isUgcOrder, isMySignatureSigned, isOtherPartySigned, isDealCompleted,
    isAgreementSigned, isDealFixed, isNegotiationLocked, isPaymentFunded,
    isContentApproved, isRevisionRequested, isRevisionDeclined, isContentSubmitted,
    isLiveLinksRevisionOpen, isLiveLinksSubmitted,
  } = useMemo(() => deriveDealState({ thread: currentThread, messages, isBrand }), [currentThread, messages, isBrand]);
  const isEscrowFunded = isPaymentFunded;
  const [showNegotiation, setShowNegotiation] = useState(false);

  const [text, setText] = useState("");
  const [activeSheet, setActiveSheet] = useState(null);
  const listEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 120);
    return () => clearTimeout(timer);
  }, [messages.length, currentThread?.id]);

  const uniqueMessages = useMemo(() => {
    const confirmed = (messages || []).filter((m) => m && !String(m.id).startsWith("temp_"));
    const seen = new Set();
    const result = [];
    for (const msg of messages || []) {
      if (!msg) continue;
      const key = msg.id || (msg.created_at ? `${msg.created_at}_${msg.content || msg.text}` : null);
      if (String(msg.id).startsWith("temp_")) {
        const alreadyConfirmed = confirmed.some((c) => (c.content || c.text) === (msg.content || msg.text));
        if (alreadyConfirmed) continue;
      }

      // Deduplicate pending payment release / live links approved notices in the same thread
      const msgType = (msg.message_type || msg.type || '').toLowerCase();
      const msgAction = (msg.metadata?.action || '').toLowerCase();
      const hasUtr = Boolean(msg.metadata?.utr_number || msg.metadata?.utr || msg.utr_number);
      const isPendingPayoutCard = !hasUtr && (
        msgType === 'live_links_approved' ||
        msgAction === 'live_links_approved' ||
        msgType === 'payout_released' ||
        msgAction === 'payout_released' ||
        msgType === 'payment_released' ||
        msgAction === 'payment_released'
      );

      if (isPendingPayoutCard) {
        const existingIdx = result.findIndex((r) => {
          const rType = (r.message_type || r.type || '').toLowerCase();
          const rAction = (r.metadata?.action || '').toLowerCase();
          const rUtr = Boolean(r.metadata?.utr_number || r.metadata?.utr || r.utr_number);
          return !rUtr && (
            rType === 'live_links_approved' ||
            rAction === 'live_links_approved' ||
            rType === 'payout_released' ||
            rAction === 'payout_released' ||
            rType === 'payment_released' ||
            rAction === 'payment_released'
          );
        });
        if (existingIdx !== -1) {
          result[existingIdx] = {
            ...result[existingIdx],
            metadata: {
              ...(msg.metadata || {}),
              ...(result[existingIdx].metadata || {})
            }
          };
          continue;
        }
      }

      // Session 43 (Ravi: the "Secure payment hold status" card came twice — the payment check and
      // the bank's confirmation each post one). One deal is funded once: keep the first card only.
      const isFundedCard = msgType === 'payment_secured' || msgType === 'payment_funded' ||
        msgAction === 'payment_secured' || msgAction === 'payment_funded' ||
        String(msg.content || msg.text || '').toLowerCase().includes('escrow funded');
      if (isFundedCard) {
        if (seen.has('__funded_card__')) continue;
        seen.add('__funded_card__');
      }

      if (key) {
        if (!seen.has(key)) {
          seen.add(key);
          result.push(msg);
        }
      } else {
        result.push(msg);
      }
    }
    return result;
  }, [messages]);
  // Old review cards lose their buttons once a newer card or a later step exists.
  const supersededIdx = useMemo(() => supersededReviewCards(uniqueMessages), [uniqueMessages]);
  // Session 24: the one "Brand needs some changes" card that still takes an answer — the latest
  // one, while the deal is actually waiting on that revision (desktop isStateActive).
  const latestChangesIdx = useMemo(() => {
    for (let i = uniqueMessages.length - 1; i >= 0; i--) {
      const t = String(uniqueMessages[i]?.message_type || uniqueMessages[i]?.type || uniqueMessages[i]?.metadata?.action || "").toLowerCase();
      if (t === "changes_requested" || t === "revision_requested") return i;
    }
    return -1;
  }, [uniqueMessages]);

  // Session 31: the latest "send corrected live links" request — the only one that takes an answer.
  const latestLinkFixIdx = useMemo(() => {
    for (let i = uniqueMessages.length - 1; i >= 0; i--) {
      const m = uniqueMessages[i];
      const t = String(m?.message_type || m?.type || "").toLowerCase();
      if (t === "live_links_resubmit_request" || m?.metadata?.action === "live_links_resubmit_requested") return i;
    }
    return -1;
  }, [uniqueMessages]);

  // Session 39: hooks above run on every render; the early return comes after them.
  if (!thread) return null;

  const partner = isBrand ? currentThread?.creator || thread.creator : currentThread?.brand || thread.brand;
  const partnerName = isBrand
    ? partner?.profile?.full_name || partner?.profile?.name || partner?.full_name || partner?.name || "Creator" /* session 40: was a made-up person "Aarav Mehta" */
    : partner?.profile?.company_name || partner?.company_name || partner?.name || "Brand"; // session 40: was a made-up brand "Lumen Skincare"
  const partnerPic = getPartnerPic(partner, !isBrand);
  const partnerId = isBrand ? currentThread?.creator_id : currentThread?.brand_id;
  const isPartnerOnline = partnerId ? onlineUsers.includes(partnerId) : false; // session 40: unknown is not "online"
  const campaignTitle =
    currentThread?.campaign_title || currentThread?.ugc_order?.title || thread?.campaign_title || "Collaboration"; // session 40: was "Winter Glow Reel"
  const isVerified = Boolean(partner?.profile?.is_verified || partner?.is_verified || false);
  const amount = getDealAmount(currentThread);

  const stage = getChatStage({
    thread: currentThread,
    isBrand,
    isUgcOrder,
    isMySignatureSigned,
    isOtherPartySigned,
    isDealCompleted,
    messages,
  });

  const hasReviewed = Boolean(
    currentThread?.rating_submitted ||
      currentThread?.review_submitted ||
      (isBrand ? currentThread?.reviewed_by_brand : currentThread?.reviewed_by_creator)
  );


  const hasSubmission = messages.some((m) =>
    ["content_proof_submitted", "CHANGES_REQUESTED", "revision_requested", "revision_declined"].includes(
      m.message_type || m.type
    )
  );

  const showPinnedBrief = isUgcOrder && !hasSubmission && !isDealCompleted;
  const brief = currentThread?.ugc_order?.brief || currentThread?.brief || null;

  // Session 43 (Ravi: "Reach me at 931" → "509" → "9117"): checked here against this chat's own
  // history too, so a number sent in pieces is stopped even when the server instances differ.
  const myRecentTexts = () => {
    const ids = [user?.user_id, user?.id, user?._id].filter(Boolean).map(String);
    const cutoff = Date.now() - 15 * 60 * 1000;
    return (messages || [])
      .filter((m) => {
        const type = String(m?.message_type || m?.type || "text").toLowerCase();
        if (type !== "text" && type !== "message") return false;
        if (!ids.includes(String(m?.sender_id || m?.metadata?.sender_id || ""))) return false;
        const at = new Date(m?.created_at || 0).getTime();
        return !at || at >= cutoff;
      })
      .map((m) => String(m.content || m.text || ""))
      .slice(-6);
  };

  const handleSend = () => {
    if (!text.trim() || isDealCompleted) return;
    const single = checkComprehensiveDisallowedContent(text, { threadId: currentThread?.id, senderId: user?.user_id || user?.id });
    if (single.blocked || splitNumberAcrossMessages(text, myRecentTexts())) {
      toast.error(single.message || "For your safety, phone numbers can't be shared in chat — not even in pieces. Keep talks on Ybex so your payment stays protected.");
      return;
    }
    sendText(text);
    setText("");
  };

  // Session 43: the newest price offer in this chat and whether I sent it.
  const latestOffer = (() => {
    const offers = (messages || []).filter((m) => m && (m.message_type === "negotiation_offer" || m.message_type === "offer" || m.message_type === "creator_application_offer" || m.metadata?.is_counter));
    const m = offers[offers.length - 1];
    if (!m) return null;
    const meta = m.metadata || {};
    const role = m.sender_role || meta.sender_role || (m.message_type === "creator_application_offer" ? "creator" : "");
    const ids = [user?.user_id, user?.id, user?._id].filter(Boolean).map(String);
    const sid = String(m.sender_id || meta.sender_id || "");
    const mine = (sid && ids.includes(sid)) || (role && ((isBrand && role === "brand") || (!isBrand && role === "creator")));
    return { mine: Boolean(mine), amount: Number(meta.amount || meta.proposed_amount || meta.offer_amount || 0), note: meta.note || meta.message || "", fromName: partnerName };
  })();

  // Dynamic task option matching desktop color palette & red-dot indicator system
  const getDynamicTaskOption = () => {
    if (isDealCompleted) {
      return {
        label: "DEAL COMPLETED",
        icon: <CheckCircle2 size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "solid-emerald",
        onClick: () => (!hasReviewed ? setActiveSheet("rating") : setActiveSheet("escrow")),
      };
    }

    // Stage 0 (campaign): price not fixed yet.
    // Session 43 (Ravi): like desktop — my offer is the latest → "Waiting for response"; theirs →
    // "Respond to offer", which opens a bottom sheet (Accept / Negotiate), not a whole page.
    if (!isUgcOrder && !isDealFixed) {
      if (latestOffer?.mine) {
        return {
          label: "WAITING FOR RESPONSE",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#D97706",
          dotType: "solid-amber",
          onClick: () => {},
        };
      }
      return {
        label: latestOffer ? "RESPOND TO OFFER" : "NEGOTIATE PRICE",
        icon: <FileSignature size={13} className="text-amber-500" />,
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: latestOffer ? "ping-amber" : "solid-amber",
        onClick: () => setActiveSheet("respond"),
      };
    }

    // Stage 1: Agreement Signature Workflow
    if (!isAgreementSigned) {
      if (isMySignatureSigned) {
        return {
          label: isOtherPartySigned ? "AGREEMENT SIGNED" : "WAITING SIGNATURE",
          icon: <CheckCircle2 size={13} className="text-emerald-500" />,
          bg: isOtherPartySigned ? "#ECFDF5" : "#FFFBEB",
          color: isOtherPartySigned ? "#059669" : "#D97706",
          dotType: isOtherPartySigned ? "solid-emerald" : "ping-amber",
          // Session 43 (Ravi): I already signed — show that, never the sign + OTP sheet again.
          onClick: () => setActiveSheet("signedInfo"),
        };
      }
      return {
        label: "SIGN AGREEMENT",
        icon: <FileSignature size={13} className="text-rose-500" />,
        bg: "#FFF1F2",
        color: "#F43F5E",
        dotType: "ping-rose",
        onClick: () => setActiveSheet("contract"),
      };
    }

    // Stage 2: Brand Workflow (Desktop Parity)
    if (isBrand) {
      if (!isPaymentFunded) {
        return {
          label: "MAKE PAYMENT",
          icon: <Shield size={13} className="text-rose-500" />,
          bg: "#FFF1F2",
          color: "#F43F5E",
          dotType: "ping-rose",
          onClick: () => setActiveSheet("escrow"),
        };
      }
      if (isDealCompleted) {
        return {
          label: "DEAL COMPLETED",
          icon: <CheckCircle2 size={13} className="text-emerald-500" />,
          bg: "#ECFDF5",
          color: "#059669",
          dotType: "solid-emerald",
          onClick: () => (!hasReviewed ? setActiveSheet("rating") : setActiveSheet("escrow")),
        };
      }
      if (isLiveLinksRevisionOpen) {
        return {
          label: "WAITING FOR LINK CORRECTION",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#B45309",
          dotType: "solid-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isLiveLinksSubmitted) {
        return {
          label: "REVIEW LIVE LINKS",
          icon: <ExternalLink size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#D97706",
          dotType: "ping-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isContentApproved) {
        return {
          label: "WAITING FOR LIVE LINK",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#B45309",
          dotType: "solid-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isRevisionDeclined) {
        return {
          label: "CHANGES DECLINED",
          icon: <AlertCircle size={13} className="text-rose-500" />,
          bg: "#FFF1F2",
          color: "#F43F5E",
          dotType: "ping-rose",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isRevisionRequested) {
        return {
          label: "WAITING FOR CHANGES",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#B45309",
          dotType: "solid-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isContentSubmitted) {
        return {
          label: "REVIEW CONTENT",
          icon: <Video size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#D97706",
          dotType: "ping-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      return {
        label: "SECURE PAYMENT HOLD SECURED",
        icon: <ShieldCheck size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "solid-emerald",
        onClick: () => setActiveSheet("escrow"),
      };
    }

    // Stage 3: Creator Workflow
    if (isDealCompleted) {
      return {
        label: "COMPLETED",
        icon: <CheckCircle2 size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "solid-emerald",
        onClick: () => (!hasReviewed ? setActiveSheet("rating") : setActiveSheet("escrow")),
      };
    }

    if (isLiveLinksRevisionOpen) {
      return {
        label: "RESUBMIT LIVE LINK",
        icon: <Link2 size={13} className="text-amber-500" />,
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: "ping-amber",
        onClick: () => setActiveSheet("liveLink"),
      };
    }

    if (isLiveLinksSubmitted) {
      return {
        label: "WAITING FOR APPROVAL",
        icon: <Clock size={13} className="text-amber-500 animate-pulse" />,
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: "ping-amber",
        onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      };
    }

    if (isContentApproved) {
      return {
        label: "SUBMIT LIVE LINK",
        icon: <Link2 size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "ping-rose",
        onClick: () => setActiveSheet("liveLink"),
      };
    }

    if (isRevisionRequested) {
      return {
        label: "REVISIONS REQUIRED",
        icon: <Upload size={13} className="text-rose-500" />,
        bg: "#FFF1F2",
        color: "#F43F5E",
        dotType: "ping-rose",
        onClick: () => setActiveSheet("upload"),
      };
    }

    if (isRevisionDeclined) {
      return {
        label: "REVISIONS DECLINED",
        icon: <AlertCircle size={13} className="text-rose-500" />,
        bg: "#FFF1F2",
        color: "#F43F5E",
        dotType: "ping-rose",
        onClick: () => setActiveSheet("upload"),
      };
    }

    if (isContentSubmitted) {
      return {
        label: "AWAITING APPROVAL",
        icon: <Clock size={13} className="text-amber-600" />,
        bg: "#FFFBEB",
        color: "#B45309",
        dotType: "ping-amber",
        onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      };
    }

    if (!isPaymentFunded) {
      return {
        label: "WAITING FOR SECURE PAYMENT HOLD",
        icon: <Loader2 size={13} className="text-amber-500 animate-spin" />,
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: "ping-amber",
        onClick: () => setActiveSheet("escrow"),
      };
    }

    // Escrow funded and creator needs to upload initial draft
    return {
      label: "UPLOAD CONTENT",
      icon: <Upload size={13} className="text-rose-500" />,
      bg: "#FFF1F2",
      color: "#F43F5E",
      dotType: "ping-rose",
      onClick: () => setActiveSheet("upload"),
    };
  };

  const taskOption = getDynamicTaskOption();
  // What "+" may open: the same upload / live-link sheet the task button offers this user.
  const plusSheet = !isBrand && !isDealCompleted && isPaymentFunded && isAgreementSigned
    ? (isLiveLinksRevisionOpen || (isContentApproved && !isLiveLinksSubmitted)
        ? "liveLink"
        : (!isContentSubmitted || isRevisionRequested || isRevisionDeclined) && !isContentApproved
          ? "upload"
          : null)
    : null;
  const closeSheet = () => setActiveSheet(null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#F7F7FA",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top Header - Redesigned with clean avatar & full collaboration suite */}
      <div
        style={{
          flexShrink: 0,
          background: "#fff",
          padding: "8px 16px",
          borderBottom: "1px solid #EFEFF3",
          zIndex: 10,
        }}
      >
        <div style={{ height: 48, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              background: "#F2F2F7",
              border: "none",
              flexShrink: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Go back"
          >
            <ChevronLeft size={18} color="#101014" strokeWidth={2.2} />
          </button>

          {/* Clean Avatar Container without yellowish gradient artifact */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              flexShrink: 0,
              background: "#F3F4F6",
              border: "2px solid #E5E7EB",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {partnerPic ? (
              <img src={partnerPic} alt={partnerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span
                style={{
                  font: "700 15px 'DM Sans',sans-serif",
                  color: "#6B7280",
                }}
              >
                {(partnerName || "P").charAt(0).toUpperCase()}
              </span>
            )}
            {isPartnerOnline && (
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: "#10B981",
                  border: "2px solid #fff",
                }}
              />
            )}
          </div>

          {/* Partner & Campaign Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  font: "700 14.5px/1.2 'DM Sans',sans-serif",
                  letterSpacing: "-.3px",
                  color: "#101014",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {partnerName}
              </div>
              {isVerified && (
                <ShieldCheck size={13} color="#0F9D58" fill="#0F9D58" style={{ flexShrink: 0 }} />
              )}
            </div>
            <div
              style={{
                marginTop: 2,
                font: "500 11.5px/1.2 'DM Sans',sans-serif",
                color: "#6E6E7C",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {campaignTitle}
            </div>
          </div>

          {/* Header Right Actions: Quick Escrow Pill + Full Burger Collaboration Suite */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            <button
              onClick={() => setActiveSheet("escrow")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 9px",
                borderRadius: 10,
                background: isPaymentFunded ? "#ECFDF5" : "#FFFBEB",
                border: isPaymentFunded ? "1px solid #A7F3D0" : "1px solid #FDE68A",
                cursor: "pointer",
              }}
              title="Secure payment hold status"
            >
              <ShieldCheck size={13} color={isPaymentFunded ? "#059669" : "#D97706"} />
              <span style={{ font: "700 11px 'DM Sans',sans-serif", color: isPaymentFunded ? "#059669" : "#D97706" }}>
                ₹{Number(amount).toLocaleString()}
              </span>
            </button>

            {/* Desktop Collaboration Parity Menu */}
            <BurgerMenuSupport thread={currentThread} user={user} />
          </div>
        </div>
      </div>

      {/* Messages Stream */}
      <div
        style={{
          flex: 1,
          padding: "14px 14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
        }}
      >
        {/* Only show fallback shortlisted card if there are zero messages in the thread */}
        {messages.length === 0 && !isUgcOrder && (
          <MobileShortlistedCard
            campaignTitle={campaignTitle}
            budget={amount}
            isBrand={isBrand}
          />
        )}

        {showPinnedBrief && (
          isBrand ? (
            <MobileBriefCard brief={brief} timeText="" />
          ) : (
            <MobileClaimedCard
              brief={brief}
              deadlineIso={currentThread?.ugc_order?.internal_deadline}
              onOpenUpload={() => setActiveSheet("upload")}
            />
          )
        )}

        {uniqueMessages.map((m, idx) => {
          const effectiveMyId =
            user?.user_id ||
            user?.id ||
            user?._id ||
            user?.uid ||
            (isBrand ? (currentThread?.brand_id || thread?.brand_id) : (currentThread?.creator_id || thread?.creator_id));

          const myUserIds = [
            user?.user_id,
            user?.id,
            user?._id,
            user?.uid,
            isBrand ? (currentThread?.brand_id || thread?.brand_id) : (currentThread?.creator_id || thread?.creator_id)
          ].filter(Boolean).map(String);

          const msgSenderId = String(
            m.sender_user_id ||
            m.sender_id ||
            m.metadata?.sender_id ||
            m.metadata?.creator_id ||
            ""
          );
          const isTemp = String(m.id).startsWith("temp_");
          const isPayoutAction =
            m.message_type === "payment_trigger" ||
            m.message_type === "payment_released" ||
            m.message_type === "payout_released" ||
            m.metadata?.action === "PAYOUT_RELEASED" ||
            m.metadata?.action === "payment_released";

          const msgSenderRole =
            (m.message_type === "creator_signed" || m.message_type === "brand_signed" || m.message_type === "agreement_executed")
              ? "system"
              : (m.sender_role ||
                 m.metadata?.sender_role ||
                 (m.message_type === "campaign_approved"
                   ? "brand"
                   : m.message_type === "creator_application_offer"
                   ? "creator"
                   : m.message_type === "live_links_submitted" ||
                     m.message_type === "content_proof_submitted"
                   ? "creator"
                   : m.message_type === "live_links_approved" ||
                     m.message_type === "revision_requested" ||
                     isPayoutAction
                   ? "brand"
                   : undefined));

          const isMine =
            isTemp ||
            Boolean(
              (msgSenderId && myUserIds.includes(msgSenderId)) ||
              (isPayoutAction && isBrand) ||
              (msgSenderRole &&
                msgSenderRole !== "system" &&
                ((isBrand && msgSenderRole === "brand") ||
                  (!isBrand && msgSenderRole === "creator")))
            );

          return (
            <MobileMessageRow
              key={m.id || m.message_id || idx}
              message={m}
              isMine={isMine}
              isBrand={isBrand}
              isUgcOrder={isUgcOrder}
              thread={currentThread}
              amount={amount}
              campaignTitle={campaignTitle}
              isDealCompleted={isDealCompleted}
              isSuperseded={supersededIdx.has(idx)}
              allMessages={uniqueMessages}
              onAcceptOffer={acceptCounter}
              onCounterOffer={sendCounter}
              onApproveDeliverable={approveDeliverable}
              onOpenRequestChanges={() => setActiveSheet("requestChanges")}
              onOpenReupload={() => setActiveSheet("upload")}
              onApproveLiveLinks={approveLiveLinks}
              onOpenRejectLiveLinks={() => setActiveSheet("rejectLiveLinks")}
              onOpenContract={() => setActiveSheet("contract")}
              onOpenRating={() => setActiveSheet("rating")}
              onDeclineChanges={declineRevisions}
              isChangesActive={idx === latestChangesIdx && isRevisionRequested && !isRevisionDeclined && !isDealCompleted}
              onOpenLiveLink={() => setActiveSheet("liveLink")}
              isLiveLinkDue={!isBrand && isContentApproved && !isLiveLinksSubmitted && !isLiveLinksRevisionOpen && !isDealCompleted}
              onDeclineLinkResubmission={declineLinkResubmission}
              isLinkFixActive={idx === latestLinkFixIdx && isLiveLinksRevisionOpen && !isDealCompleted}
              onOpenOrderSupport={() => setActiveSheet("orderSupport")}
            />
          );
        })}
        {/* Session 43 (Ravi): creator code — after both signed, before the brand pays. */}
        {!isBrand && !isUgcOrder && isAgreementSigned && !isPaymentFunded && !isDealCompleted && (
          <CreatorCodeDealCard dealKey={`thread:${currentThread?.id}`} amount={amount} />
        )}
        <div ref={listEndRef} style={{ height: 2, flexShrink: 0 }} />
      </div>

      {/* Bottom Controls (Two Buttons + Message Bar) */}
      <div
        style={{
          flexShrink: 0,
          background: "#fff",
          borderTop: "1px solid #EFEFF3",
          padding: "10px 16px 18px",
        }}
      >
        {/* The Two Bottom Buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {/* Button 1: Chat Toggle */}
          <button
            onClick={() => {
              listEndRef.current?.scrollIntoView({ behavior: "smooth" });
              inputRef.current?.focus();
            }}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 11,
              background: "#F7F5FF",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              cursor: "pointer",
            }}
          >
            <MessageSquare size={13} color="#5B21B6" strokeWidth={2} />
            <span
              style={{
                font: "700 11px 'DM Sans',sans-serif",
                letterSpacing: ".6px",
                textTransform: "uppercase",
                color: "#5B21B6",
              }}
            >
              Chat
            </span>
          </button>

          {/* Button 2: Dynamic Task Option with Desktop-parity Colors & Red Dot */}
          <button
            onClick={taskOption.onClick}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 11,
              background: taskOption.bg,
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: "pointer",
              transition: "all .15s ease",
            }}
          >
            {taskOption.icon}
            <span
              style={{
                font: "700 10.5px 'DM Sans',sans-serif",
                letterSpacing: ".6px",
                textTransform: "uppercase",
                color: taskOption.color,
                whiteSpace: "nowrap",
              }}
            >
              {taskOption.label}
            </span>
            {taskOption.dotType === "ping-rose" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
            {taskOption.dotType === "ping-amber" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
            {taskOption.dotType === "solid-emerald" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
            {taskOption.dotType === "solid-amber" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </button>
        </div>

        {/* Message Input / Deal Lock State */}
        {isDealCompleted ? (
          <div
            style={{
              height: 42,
              borderRadius: 14,
              background: "#ECFDF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Lock size={14} color="#059669" />
              <span style={{ font: "600 12px 'DM Sans',sans-serif", color: "#065F46" }}>
                Deal Completed · Chat Closed
              </span>
            </div>
            {!hasReviewed && (
              <button
                onClick={() => setActiveSheet("rating")}
                style={{
                  border: "none",
                  background: "#059669",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "5px 10px",
                  font: "600 11px 'DM Sans',sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                }}
              >
                <Star size={11} fill="#fff" />
                <span>Rate</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {/* "+" used to open the deliverable upload for everyone, in every stage — a brand could
                open "Upload deliverable", and a creator could upload before the escrow was funded.
                Now it offers only what the bottom task button offers this user right now. */}
            {plusSheet && (
            <button
              onClick={() => setActiveSheet(plusSheet)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                background: "#F2F2F7",
                border: "none",
                flexShrink: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Add attachment"
            >
              <Plus size={18} color="#5C5C6B" strokeWidth={2.2} />
            </button>
            )}

            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Message"
              style={{
                flex: 1,
                height: 40,
                borderRadius: 23,
                background: "#F2F2F7",
                border: "none",
                padding: "0 18px",
                font: "400 14px 'DM Sans',sans-serif",
                color: "#101014",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <button
              disabled={!text.trim()}
              onClick={handleSend}
              style={{
                width: 46,
                height: 40,
                borderRadius: 23,
                background: "#7C3AED",
                border: "none",
                flexShrink: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: !text.trim() ? 0.4 : 1,
                transition: "opacity .15s",
              }}
              aria-label="Send message"
            >
              <Send size={16} color="#fff" strokeWidth={2} style={{ transform: "rotate(45deg) translate(-1px, 1px)" }} />
            </button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Sheets for Actions with smooth spring & fade animations */}
      <AnimatePresence>
        {activeSheet === "requestChanges" && (
          <MobileRequestChangesSheet key="sheet-changes" onClose={closeSheet} onSubmit={requestChanges} />
        )}
        {activeSheet === "rejectLiveLinks" && (
          <MobileRequestChangesSheet
            key="sheet-reject-links"
            onClose={closeSheet}
            onSubmit={rejectLiveLinks}
            title="What's wrong with the link?"
            subtitle="This asks the creator to resubmit their live link."
            placeholder="e.g., The YouTube link is set to private."
            submitLabel="Request resubmission"
            tags={LIVE_LINK_TAGS}
          />
        )}
        {activeSheet === "orderSupport" && (
          <MobileOrderSupportSheet
            key="sheet-order-support"
            thread={currentThread}
            threadId={currentThread?.id || thread?.id}
            isBrand={isBrand}
            onClose={closeSheet}
            onCreated={() => loadMessages()}
          />
        )}
        {activeSheet === "signedInfo" && (
          <div key="sheet-signed" className="fixed inset-0 z-[80] flex flex-col justify-end" data-testid="signed-info-sheet">
            <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
            <div className="relative bg-white rounded-t-[24px] px-5 pt-4" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif" }}>
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-[#ECFDF5] flex items-center justify-center shrink-0"><CheckCircle2 size={22} color="#059669" /></span>
                <div className="min-w-0">
                  <div className="text-[16px] font-bold text-[#0A0A0A]">You've signed this agreement</div>
                  <div className="text-[13px] text-[#6B7280] mt-0.5">
                    {isOtherPartySigned ? "Both sides have signed. The deal is active." : `Waiting for ${partnerName || (isBrand ? "the creator" : "the brand")} to sign. We'll notify you.`}
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeSheet} className="mt-5 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white font-bold text-[14.5px]">Got it</button>
            </div>
          </div>
        )}

        {activeSheet === "contract" && (
          <MobileContractSheet
            key="sheet-contract"
            thread={currentThread}
            user={user}
            isBrand={isBrand}
            amount={amount}
            campaignTitle={campaignTitle}
            onSendOtp={sendSignOtp}
            onSign={signAgreement}
            onClose={closeSheet}
          />
        )}
        {activeSheet === "escrow" && (
          <MobileEscrowSheet
            key="sheet-escrow"
            onClose={closeSheet}
            amount={amount}
            isBrand={isBrand}
            isFunded={isPaymentFunded}
            isDealCompleted={isDealCompleted}
            paying={paying}
            campaignTitle={campaignTitle}
            partnerName={partnerName}
            onPay={async () => { const ok = await payIntoEscrow(); if (ok) closeSheet(); }}
          />
        )}
        {activeSheet === "respond" && (
          <MobileRespondOfferSheet key="sheet-respond" onClose={closeSheet} offer={latestOffer && !latestOffer.mine ? latestOffer : null}
            onAccept={acceptCounter} onCounter={sendCounter} />
        )}
        {activeSheet === "rating" && (
          <MobileRatingSheet key="sheet-rating" onClose={closeSheet} onSubmit={submitReview} partnerName={partnerName} partnerPic={partnerPic} />
        )}
        {activeSheet === "liveLink" && (
          <MobileLiveLinkSheet key="sheet-live-link" onClose={closeSheet} onSubmit={submitLiveLink} />
        )}
        {activeSheet === "upload" && (
          <MobileUploadSheet
            key="sheet-upload"
            onClose={closeSheet}
            onSubmit={uploadDeliverable}
            title={isUgcOrder ? "Upload deliverable" : "Upload content draft"}
          />
        )}
      </AnimatePresence>

      {showNegotiation && (
        <NegotiationTable
          thread={currentThread}
          role={isBrand ? "brand" : "creator"}
          locked={isNegotiationLocked}
          onClose={() => setShowNegotiation(false)}
          onActionComplete={() => { loadMessages(); refreshThread(); }}
        />
      )}
    </div>
  );
}

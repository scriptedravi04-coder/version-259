import React, { useState, useEffect, useMemo, useRef } from "react";
import OfferStrip from "../../components/referral/OfferStrip";
import CreatorCancelOrderSheet from "../../components/ugc/CreatorCancelOrderSheet";
import { creatorCancelInfo } from "../../utils/ugcOrderCancel";
import GoodToKnowCard from "../../components/ugc/GoodToKnowCard";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Search, Video, PlayCircle, Clock, ShieldCheck, Check, CheckCircle2, ArrowRight, ArrowLeft, MessageCircle, Upload, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Lock, ChevronRight, Film, LayoutGrid, Radio, FileVideo, Mail, X } from "lucide-react";
import BottomNav from "../../components/layout/BottomNav";
import { UGCCardsListSkeleton, UGCOrderListSkeleton } from "../../components/common/MobileSkeletons";
import MobileOrderSupportSheet from "../../components/chat/mobile/MobileOrderSupportSheet";
import { normalizeKycStatus } from "../../utils/kycStatus";
import { deliveryHoursOf, orderWindowHours, UGC_REVISION_LIMIT } from "../../utils/ugcTerms";
import { agreementFields, AGREEMENT_VERSIONS } from "../../lib/agreementCapture";
import { ugcAgreement, asCaptureSource } from "../../lib/agreementTerms";
import AgreementTermsPanel from "../../components/chat/AgreementTermsPanel";

import { Presence, PopupBackdrop, PopupPanel } from "../../components/common/Popup";
import { useHideBottomNav } from "../../lib/bottomNavVisibility";
import BrandLogo from "../../components/common/BrandLogo";
import { useLiveRefresh } from "../../lib/liveRefresh";
// Format helper
const formatCurrency = (amount) => {
  return "₹" + Number(amount || 0).toLocaleString("en-IN");
};

// Compute SLA urgency & remaining time
function computeTimeRemaining(deadlineStr, totalHours = 24) {
  if (!deadlineStr) {
    return {
      hoursLeft: totalHours,
      minutesLeft: 0,
      text: `${totalHours}h left`,
      pct: 100,
      urgency: "green",
      badgeText: "ON TRACK",
      badgeBg: "#DCFCE7",
      badgeColor: "#047857",
      cardBg: "#F0FDF4",
      accentColor: "#059669",
      subtext: "More than 6h · keep filming",
      deadlineFormatted: "Tomorrow"
    };
  }

  const deadline = new Date(deadlineStr).getTime();
  const now = Date.now();
  const diffMs = deadline - now;

  if (diffMs <= 0) {
    return {
      hoursLeft: 0,
      minutesLeft: 0,
      text: "0h 0m left",
      pct: 0,
      urgency: "red",
      badgeText: "OVERDUE",
      badgeBg: "#FEE2E2",
      badgeColor: "#B91C1C",
      cardBg: "#FEF2F2",
      accentColor: "#DC2626",
      subtext: "Deadline exceeded · upload immediately",
      deadlineFormatted: "Overdue"
    };
  }

  const totalMs = totalHours * 3600 * 1000;
  const pct = Math.max(0, Math.min(100, Math.round((diffMs / totalMs) * 100)));
  const hoursLeft = Math.floor(diffMs / (3600 * 1000));
  const minutesLeft = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  const text = `${hoursLeft}h ${minutesLeft}m left`;

  const d = new Date(deadline);
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isToday = d.toDateString() === new Date().toDateString();
  const dayStr = isToday ? "today" : "tomorrow";

  if (hoursLeft > 6) {
    return {
      hoursLeft,
      minutesLeft,
      text,
      pct,
      urgency: "green",
      badgeText: "ON TRACK",
      badgeBg: "#DCFCE7",
      badgeColor: "#047857",
      cardBg: "#F0FDF4",
      accentColor: "#059669",
      subtext: `Submit before ${timeStr} ${dayStr} · of ${totalHours}h`,
      timerStateDesc: "More than 6h · keep filming",
      deadlineFormatted: `${timeStr} ${dayStr}`
    };
  } else if (hoursLeft >= 2) {
    return {
      hoursLeft,
      minutesLeft,
      text,
      pct,
      urgency: "amber",
      badgeText: "GETTING TIGHT",
      badgeBg: "#FEF3C7",
      badgeColor: "#B45309",
      cardBg: "#FFFBEB",
      accentColor: "#D97706",
      subtext: `Re-upload before ${timeStr} ${dayStr}`,
      timerStateDesc: "2–6h left · start editing now",
      deadlineFormatted: `${timeStr} ${dayStr}`
    };
  } else {
    return {
      hoursLeft,
      minutesLeft,
      text,
      pct,
      urgency: "red",
      badgeText: "FINAL HOURS",
      badgeBg: "#FEE2E2",
      badgeColor: "#B91C1C",
      cardBg: "#FEF2F2",
      accentColor: "#DC2626",
      subtext: `Under 2h · miss it and secure payment hold returns`,
      timerStateDesc: "Under 2h · miss it and secure payment hold returns",
      deadlineFormatted: `${timeStr} ${dayStr}`
    };
  }
}

// Compact Ring Timer Component (Spec: 04 · Timer states)
/** Session 43: live-link step of a UGC collaboration order, from the stage the server resolved
 *  (same resolver the chat agrees with). null = no live-link step right now. */
export function ugcLinkPhase(o, isCompleted = false) {
  if (!o || isCompleted) return null;
  const st = String(o.stage || "").toUpperCase();
  const status = String(o.status || "").toUpperCase();
  if (st === "REVISION_REQUESTED_LINKS") return "FIX";
  if (st === "REVISION_DECLINED_LINKS") return "FIX_DECLINED";
  if (st === "LIVE_LINK_SUBMITTED" || status === "LINKS_UNDER_REVIEW" || status === "LIVE_LINK_SUBMITTED") return "SUBMITTED";
  if (st === "COMPLETED_APPROVAL" || st === "AWAITING_LIVE_LINK" || status === "AWAITING_LIVE_LINK") return "DUE";
  return null;
}

const LINK_PHASE_COPY = {
  DUE: { tone: "#047857", bg: "#ECFDF5", border: "#A7F3D0", title: "Draft approved 🎉", text: "Post the video and submit your live post link.", cta: "Submit live link" },
  FIX: { tone: "#B45309", bg: "#FFFBEB", border: "#FDE68A", title: "Brand asked for corrected links", text: "Fix the post and send the corrected live link.", cta: "Resubmit live link" },
  SUBMITTED: { tone: "#6D28D9", bg: "#F5F0FF", border: "#DDD6FE", title: "Live link sent", text: "Waiting for the brand to approve your live link.", cta: "Open chat" },
  FIX_DECLINED: { tone: "#B91C1C", bg: "#FEF2F2", border: "#FECACA", title: "You declined the link changes", text: "Waiting for the brand to respond.", cta: "Open chat" },
};

/** Card shown instead of "Submit deliverable" once the order is past the draft. The live link
 *  itself is sent from the chat (its Submit live link sheet) — no second way to send it. */
export function UGCLinkPhaseCard({ phase, onOpenChat }) {
  const c = LINK_PHASE_COPY[phase];
  if (!c) return null;
  return (
    <div className="rounded-[18px] p-3.5 border" style={{ background: c.bg, borderColor: c.border }} data-testid={`ugc-link-phase-${phase.toLowerCase()}`}>
      <div className="font-bold text-[14px]" style={{ color: c.tone }}>{c.title}</div>
      <div className="mt-1 text-[12.5px] leading-[1.5] text-[#374151]">{c.text}</div>
      <button
        type="button"
        onClick={onOpenChat}
        className="mt-3 w-full h-[46px] rounded-[13px] text-white font-bold text-[13.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
        style={{ background: c.tone }}
      >
        {phase === "DUE" || phase === "FIX" ? <ExternalLink size={15} /> : <MessageCircle size={15} />}
        <span>{c.cta}</span>
      </button>
    </div>
  );
}

// Session 43 (Ravi): clock face whose hands keep turning, so the deadline feels live.
export function TickingClock({ color = "#059669", size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-testid="ugc-ticking-clock">
      <circle cx="12" cy="12" r="9.5" fill="#fff" stroke={color} strokeWidth="2" />
      <g className="ybex-clock-hour"><line x1="12" y1="12" x2="12" y2="7.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></g>
      <g className="ybex-clock-min"><line x1="12" y1="12" x2="12" y2="5" stroke={color} strokeWidth="1.6" strokeLinecap="round" /></g>
      <circle cx="12" cy="12" r="1.5" fill={color} />
    </svg>
  );
}

export function UGCTimerRing({ deadline, totalHours = 24, variant = "card", customSubtext = null, customBadge = null }) {
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTicker((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const info = useMemo(() => computeTimeRemaining(deadline, totalHours), [deadline, totalHours, ticker]);

  if (variant === "ring-only") {
    return (
      <div className="relative w-[38px] h-[38px] shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="w-[38px] h-[38px] -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#F1F1F5" strokeWidth="4" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={info.accentColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="94"
            strokeDashoffset={94 - (94 * info.pct) / 100}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <TickingClock color={info.accentColor} size={20} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-[14px] p-[10px_11px] transition-colors"
      style={{ background: info.cardBg }}
    >
      <div className="flex items-center gap-[10px]">
        {/* Ring gauge with conic-gradient & pulse dot */}
        <div
          className="w-[38px] h-[38px] rounded-[19px] shrink-0 flex items-center justify-center relative shadow-xs"
          style={{
            background: `conic-gradient(${info.accentColor} 0% ${info.pct}%, #ffffff ${info.pct}% 100%)`
          }}
        >
          <div
            className="w-[30px] h-[30px] rounded-[15px] flex items-center justify-center"
            style={{ background: info.cardBg }}
          >
            {/* Session 43 (Ravi): a small running clock instead of a still dot. */}
            <TickingClock color={info.accentColor} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[17px] leading-none tracking-[-0.5px] text-[#0A0A0A]">
            {info.text}
          </div>
          <div className="mt-1 font-normal text-[10.5px] text-[#6B7280] whitespace-nowrap overflow-hidden text-ellipsis">
            {customSubtext || info.subtext}
          </div>
        </div>

        <div
          className="h-[21px] px-2 rounded-[7px] flex items-center font-bold text-[9.5px] tracking-[0.4px] shrink-0 whitespace-nowrap uppercase"
          style={{
            background: customBadge?.bg || info.badgeBg,
            color: customBadge?.color || info.badgeColor
          }}
        >
          {customBadge?.text || info.badgeText}
        </div>
      </div>
    </div>
  );
}

// Status Stepper Component (Signed -> Filming -> Brand review -> Paid)
export function UGCStatusStepper({ stage = "IN_PROGRESS" }) {
  // Determine active step index
  // 0: Signed, 1: Filming, 2: Brand review, 3: Paid
  let activeIndex = 1; // Default is Filming

  if (stage === "PENDING_SIGNATURE") {
    activeIndex = 0;
  } else if (stage === "IN_PROGRESS" || stage === "REVISION_REQUESTED") {
    activeIndex = 1;
  } else if (stage === "IN_REVIEW" || stage === "LIVE_LINK_SUBMITTED") {
    activeIndex = 2;
  } else if (stage === "COMPLETED" || stage === "COMPLETED_APPROVAL") {
    activeIndex = 3;
  }

  const steps = [
    { label: "Signed", id: 0 },
    { label: "Filming", id: 1 },
    { label: "Brand review", id: 2 },
    { label: "Paid", id: 3 }
  ];

  return (
    <div className="flex items-center justify-between mt-3 px-1">
      {steps.map((s, idx) => {
        const isDone = idx < activeIndex || (activeIndex === 3 && idx === 3);
        const isCurrent = idx === activeIndex && activeIndex !== 3;

        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5 min-w-[55px]">
              {isDone ? (
                <div className="w-4 h-4 rounded-full bg-[#059669] flex items-center justify-center text-white shadow-xs">
                  <Check size={10} strokeWidth={3.5} />
                </div>
              ) : isCurrent ? (
                <div className="w-4 h-4 rounded-full bg-white border-[3.5px] border-[#7C3AED] box-border shadow-xs animate-pulse" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-white border-2 border-[#E5E7EB] box-border" />
              )}
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isDone
                    ? "text-[#047857] font-semibold"
                    : isCurrent
                    ? "text-[#7C3AED] font-bold"
                    : "text-[#9CA3AF]"
                }`}
              >
                {s.label}
              </span>
            </div>

            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-[2px] -mt-5 rounded-full transition-colors ${
                  idx < activeIndex ? "bg-[#059669]" : "bg-[#E5E7EB]"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Deliverable Format Config Helper
export function getDeliverableBadgeMeta(type = "") {
  const t = String(type || "").toLowerCase();
  if (t.includes("collab")) {
    return {
      label: "Collaboration",
      cleanLabel: "Collaboration",
      bg: "#EEF2FF",
      color: "#4F46E5",
      border: "#C7D2FE",
      icon: null,
      tag: "collab"
    };
  }
  if (t.includes("raw") || t.includes("draft")) {
    return {
      label: "UGC Raw",
      cleanLabel: "UGC Raw",
      bg: "#FFFBEB",
      color: "#D97706",
      border: "#FDE68A",
      icon: null,
      tag: "raw"
    };
  }
  return {
    label: "UGC Edited",
    cleanLabel: "UGC Edited",
    bg: "#EFF6FF",
    color: "#2563EB",
    border: "#BFDBFE",
    icon: null,
    tag: "edited"
  };
}

// MAIN MOBILE CREATOR UGC VIEW
export default function CreatorUGCMobile({ defaultTab = "explore", initialOrderId = null }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // Primary tab: 'explore' | 'manage'
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "orders" || tabParam === "manage" || defaultTab === "orders" || defaultTab === "manage") {
      return "manage";
    }
    return "explore";
  });

  // Active view: 'main' | 'claim' | 'workspace'
  const [activeView, setActiveView] = useState("main");
  // Session 39 (M13): brief details, agreement and the order workspace are pages of their own — no bottom bar.
  useHideBottomNav(activeView !== "main");
  const [selectedBrief, setSelectedBrief] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Data states
  const [briefs, setBriefs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("payout"); // 'payout' | 'newest' | 'duration'
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [formatFilter, setFormatFilter] = useState("all"); // 'all' | 'collab' | 'edited' | 'raw'
  const [manageFilter, setManageFilter] = useState("all"); // 'all' | 'production' | 'review' | 'completed'

  // Workspace upload form states
  const [videoFile, setVideoFile] = useState(null);
  const [videoDriveUrl, setVideoDriveUrl] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [liveLinkUrl, setLiveLinkUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [briefSpecsOpen, setBriefSpecsOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Tracking just claimed order to pin at the top with badge
  const [justClaimedOrderId, setJustClaimedOrderId] = useState(null);

  // OTP & Agreement states for M02 Sign Agreement (Step 2 of 2)
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);
  const agreementRef = useRef(null); // session 28: the text on screen goes into the signature record
  // Session 30 (Ravi): nothing pre-ticked; the OTP goes out only after both boxes are ticked.
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedDeadline, setAgreedDeadline] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [signingOrder, setSigningOrder] = useState(false);
  // Session 24: decline changes / cancel claim / order ticket (desktop ManageUGCOrdersView parity).
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [cancellingClaim, setCancellingClaim] = useState(false);
  const [showCancelOrder, setShowCancelOrder] = useState(false); // session 25: signed-order cancel
  const [supportOpen, setSupportOpen] = useState(false);
  // Session 24: only KYC-approved creators can claim (the server enforces it too).
  // "APPROVED" | "PENDING" | "REJECTED" | "NONE" | null (not loaded yet)
  const [kycStatus, setKycStatus] = useState(null);
  // Deep link (?orderId=): open the MAPPED order once the list is mapped. It used to open the
  // raw order, so stage, payout and flags were missing in the workspace.
  const [pendingOpenOrderId, setPendingOpenOrderId] = useState(null);
  const selectedOrderKey = selectedOrder?.id;
  useEffect(() => {
    setDeclineOpen(false);
    setDeclineReason("");
    setSupportOpen(false);
  }, [selectedOrderKey]);

  const userEmail = user?.email || "";
  // Session 30: the v1 agreement for a brief — the same object the screen shows and the record stores.
  const buildUgcAgreement = (b) => ugcAgreement({
    brandName: b?.brand_name || "Verified Brand", creatorName: user?.name || user?.full_name, briefTitle: b?.title,
    payout: Number(b?.budget) || 0, hours: deliveryHoursOf(b?.delivery_hours, 24), revisions: UGC_REVISION_LIMIT,
  });
  // The user's OWN registered email, shown in full so they know which inbox to check
  // (session 23: it used to be masked to "ra***@gmail.com").
  const maskedEmail = userEmail || "your registered email";

  // Session 30: send the OTP once, only after both boxes are ticked on M02 (was: on opening M02).
  const termsAccepted = agreedTerms && agreedDeadline;
  useEffect(() => {
    if (activeView === "agreement" && termsAccepted && userEmail && !otpSent && !sendingOtp) {
      handleSendMobileOTP(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, termsAccepted, userEmail]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  const handleSendMobileOTP = async (isAuto = false) => {
    if (!userEmail || !userEmail.includes("@")) {
      if (!isAuto) toast.error("Registered account email not found.");
      return;
    }
    setSendingOtp(true);
    try {
      const res = await api.post("/otp/send", {
        value: userEmail,
        target: "email",
        purpose: "contract_sign",
        recipientName: user?.name || "Creator Partner",
        brandName: selectedBrief?.brand_name || "Brand Partner",
        creatorName: user?.name || "Creator Partner",
        campaignTitle: selectedBrief?.title || "UGC Video Deliverable Agreement",
        dealAmount: selectedBrief?.budget || ""
      });
      setOtpSent(true);
      setResendCooldown(60);
      // Never show the code on screen — it's in the email (session 23). Only when test mode
      // could NOT deliver the email is it shown, like every other signing screen does.
      if (res.data?.code && String(res.data?.message || "").startsWith("Test mode")) {
        toast.warning(`${res.data.message} Test code: ${res.data.code}`, { duration: 15000 });
      } else {
        toast.success(`Code sent to ${maskedEmail}. Use the code from the latest email.`);
      }
    } catch (e) {
      if (!isAuto) toast.error("Failed to send OTP. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleDigitChange = (index, value) => {
    if (value.length > 1) {
      const clean = value.replace(/\D/g, "").slice(0, 6);
      if (clean) {
        const newDigits = [...otpDigits];
        clean.split("").forEach((char, i) => {
          if (index + i < 6) newDigits[index + i] = char;
        });
        setOtpDigits(newDigits);
        const nextFocus = Math.min(5, index + clean.length);
        inputRefs.current[nextFocus]?.focus();
      }
      return;
    }

    const cleanChar = value.replace(/\D/g, "");
    const newDigits = [...otpDigits];
    newDigits[index] = cleanChar;
    setOtpDigits(newDigits);

    if (cleanChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyAndSignMobile = async () => {
    const fullOtp = otpDigits.join("");
    if (!agreedTerms || !agreedDeadline) {
      toast.error("Please agree to all agreement terms.");
      return;
    }
    if (fullOtp.length < 6) {
      toast.error("Please enter the complete 6-digit verification code.");
      return;
    }
    if (!selectedBrief) return;

    setSigningOrder(true);
    toast.loading("Verifying OTP & creating order...", { id: "mobile-sign" });

    try {
      // 1. Verify OTP code
      const verified = await api.post("/otp/verify", { value: userEmail, code: fullOtp });

      // 2. Claim brief and execute agreement (starts 24h timer in backend)
      const { data } = await api.post("ugc/orders/claim", {
        brief_id: selectedBrief.id,
        signature: `OTP Verified: ${userEmail}`,
        sign_token: verified?.data?.sign_token,
        ...agreementFields(asCaptureSource(buildUgcAgreement(selectedBrief)), AGREEMENT_VERSIONS.ugcMobile)
      });

      const newOrderId = data?.order_id || data?.order?.id;
      setJustClaimedOrderId(newOrderId);

      toast.success(`✓ Agreement signed · brief claimed — Your ${deliveryHoursOf(selectedBrief?.delivery_hours, 24)}h timer has started`, {
        id: "mobile-sign",
        duration: 4000
      });

      // Reload fresh data from backend
      await loadData();

      // Reset state and transition to Manage Orders list
      setSelectedBrief(null);
      setOtpDigits(["", "", "", "", "", ""]);
      setActiveTab("manage");
      setActiveView("main");
      setSearchParams({ tab: "manage" });
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || e?.response?.data?.error || "Failed to verify OTP or sign agreement.", {
        id: "mobile-sign"
      });
      if (e?.response?.data?.code === "KYC_REQUIRED") {
        setKycStatus(normalizeKycStatus({ status: e.response.data.kyc_status }));
        setActiveView("main");
      }
    } finally {
      setSigningOrder(false);
    }
  };

  // Fetch briefs & orders from backend APIs
  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [briefsRes, ordersRes, kycRes] = await Promise.all([
        api.get("ugc/briefs/available").catch(() => ({ data: [] })),
        api.get("ugc/orders/creator").catch(() => ({ data: [] })),
        api.get("verifications/me").catch(() => ({ data: null }))
      ]);
      setKycStatus(normalizeKycStatus(kycRes?.data));

      const availableBriefs = briefsRes.data || [];
      const creatorOrders = ordersRes.data || [];

      setBriefs(availableBriefs);
      setOrders(creatorOrders);

      // If initialOrderId was passed, open its workspace
      if (initialOrderId) setPendingOpenOrderId(String(initialOrderId));
    } catch (e) {
      console.error("[CreatorUGCMobile] loadData error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Session 43 (Ravi): the order page kept asking for the video after the draft was approved in
  // chat — it only loaded once. Same GET calls, re-run quietly on deal events, on return to the
  // tab and every 30 s.
  useLiveRefresh(() => loadData({ silent: true }), { types: ["ugc", "deal", "chat"], intervalMs: 30000 });

  // Map & resolve orders into operational stages
  const mappedOrders = useMemo(() => {
    return (orders || []).map((o) => {
      const rawStatus = (o.status || "").toUpperCase();
      const creatorStatus = (o.creator_status || o.status || "").toUpperCase();
      const paymentStatus = (o.payment_status || "").toUpperCase();
      const thrStatus = (o.thread_status || "").toUpperCase();
      const thrFlow = (o.thread_flow_state || "").toUpperCase();
      const orderStage = (o.stage || "").toUpperCase();

      // Session 24: an order the deadline system EXPIRED leaves the creator's active list
      // (they're told by notification/email; desktop shows it under completed with a note).
      if (creatorStatus === "CANCELLED" || rawStatus === "CANCELLED" || creatorStatus === "EXPIRED" || rawStatus === "EXPIRED" || o.expired_at || o.brand_id === "archived_deleted_brand") {
        return null;
      }

      const isCompleted =
        creatorStatus === "COMPLETED" ||
        creatorStatus === "APPROVED" ||
        creatorStatus === "PAID" ||
        creatorStatus === "RELEASED" ||
        rawStatus === "COMPLETED" ||
        rawStatus === "APPROVED" ||
        paymentStatus === "RELEASED" ||
        paymentStatus === "PAID" ||
        thrStatus === "COMPLETED" ||
        thrFlow === "COMPLETED" ||
        orderStage === "COMPLETED";

      const isRevision =
        creatorStatus === "REVISION_REQUESTED" ||
        creatorStatus === "REVISION_REQ" ||
        creatorStatus === "IN_REVISION" ||
        rawStatus === "REVISION_REQUESTED" ||
        thrFlow === "REVISION_REQUESTED";

      const isUnderReview =
        !isCompleted &&
        !isRevision &&
        (creatorStatus === "SUBMITTED" ||
          creatorStatus === "DELIVERED" ||
          creatorStatus === "IN_REVIEW" ||
          creatorStatus === "CONTENT_SUBMITTED" ||
          rawStatus === "SUBMITTED" ||
          o.video_url ||
          o.submission_link);

      // Session 24. Declining the brand's changes (or a dispute) is the creator's answer to the
      // request; it must not look like a fresh revision to do.
      const revisionDeclined =
        !isCompleted &&
        (creatorStatus === "REVISION_DECLINED" || creatorStatus === "DISPUTED" ||
          rawStatus === "REVISION_DECLINED" || rawStatus === "DISPUTED" ||
          thrFlow === "REVISION_DECLINED" || orderStage === "REVISION_DECLINED");
      // A reservation whose agreement was never signed (claimed on desktop, where claim and sign
      // are two steps). Only an explicit false/null counts — a missing field is not "unsigned".
      const isUnsigned =
        !isCompleted &&
        (o.agreement_signed_creator === false || o.agreement_signed_creator === null) &&
        !(o.video_url || o.submission_link || o.drive_url);

      // Session 43 (Ravi): after the draft is approved the chat asks for the live link, but this
      // page still asked for the video. The server already resolves the same stage the chat uses
      // (o.stage: COMPLETED_APPROVAL = live link due, LIVE_LINK_SUBMITTED, …) — read it.
      const linkPhase = ugcLinkPhase(o, isCompleted);

      let stage = "IN_PROGRESS";
      if (isCompleted) stage = "COMPLETED";
      else if (linkPhase === "DUE" || linkPhase === "FIX") stage = "IN_PROGRESS";
      else if (linkPhase) stage = "IN_REVIEW";
      else if (isRevision && !revisionDeclined) stage = "REVISION_REQUESTED";
      else if (isUnderReview) stage = "IN_REVIEW";

      const deadline = o.internal_deadline || o.deadline || o.sla_expires_at;
      const orderNumber = o.order_number || `#ORD-${String(o.id).slice(-4).toUpperCase()}`;
      const title = o.brief?.title || o.title || o.brief?.product_name || "UGC Video Deliverable";
      const brandName = o.brief?.brand_name || o.brand_name || "Verified Brand";
      const brandLetter = (brandName || "B").charAt(0).toUpperCase();
      const brandLogo = o.brief?.brand_logo || o.brand_logo || o.brand?.logo || o.brief?.brand?.logo || "";
      // No invented ₹5,000 when the order carries no amount (a money claim must match the server).
      const payout = o.creator_payout || o.agreed_amount || o.brief?.budget || 0;
      const revisionCount = o.revision_count || 3;
      const revisionsUsed = o.revisions_used || 0;
      const revisionsLeft = Math.max(0, revisionCount - revisionsUsed);
      const revisionNotes =
        o.revision_notes ||
        o.revision_feedback ||
        o.brand_feedback ||
        "";
      const realUtr =
        o.utr_number ||
        o.payout_utr ||
        o.payout_reference ||
        o.utr ||
        o.transaction?.utr_number ||
        o.payment_reference ||
        "";

      return {
        ...o,
        stage,
        orderNumber,
        title,
        brandName,
        brandLetter,
        brandLogo,
        payout,
        deadline,
        revisionsLeft,
        revisionNotes,
        realUtr,
        revisionDeclined,
        isUnsigned,
        linkPhase
      };
    }).filter(Boolean);
  }, [orders]);

  // An open order follows fresh data (stage, links) instead of the copy taken when it was opened.
  useEffect(() => {
    if (!selectedOrder) return;
    const fresh = mappedOrders.find((o) => String(o.id) === String(selectedOrder.id));
    if (fresh && (fresh.stage !== selectedOrder.stage || fresh.linkPhase !== selectedOrder.linkPhase)) setSelectedOrder(fresh);
  }, [mappedOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingOpenOrderId) return;
    const found = mappedOrders.find(
      (o) => String(o.id) === pendingOpenOrderId || String(o.brief_id) === pendingOpenOrderId
    );
    if (found) {
      setSelectedOrder(found);
      setActiveView("workspace");
      setActiveTab("manage");
      setPendingOpenOrderId(null);
    }
  }, [pendingOpenOrderId, mappedOrders]);

  // Manage orders filter count metrics
  const orderCounts = useMemo(() => {
    return {
      all: mappedOrders.length,
      production: mappedOrders.filter((o) => o.stage === "IN_PROGRESS").length,
      review: mappedOrders.filter((o) => o.stage === "IN_REVIEW").length,
      completed: mappedOrders.filter((o) => o.stage === "COMPLETED").length
    };
  }, [mappedOrders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    let list = mappedOrders.filter((o) => {
      if (manageFilter === "production") return o.stage === "IN_PROGRESS" || o.stage === "REVISION_REQUESTED";
      if (manageFilter === "review") return o.stage === "IN_REVIEW";
      if (manageFilter === "completed") return o.stage === "COMPLETED";
      return true;
    });

    if (justClaimedOrderId) {
      list = [...list].sort((a, b) => {
        if (a.id === justClaimedOrderId) return -1;
        if (b.id === justClaimedOrderId) return 1;
        return 0;
      });
    }

    return list;
  }, [mappedOrders, manageFilter, justClaimedOrderId]);

  // Filtered briefs list
  const filteredBriefs = useMemo(() => {
    let list = (briefs || []).filter((b) => {
      // Filter out fully claimed briefs
      if ((b.claimed_count || 0) >= (b.max_creators || 1)) return false;

      // Format filter
      if (formatFilter !== "all") {
        const dt = (b.deliverable_type || "").toLowerCase();
        if (formatFilter === "collab" && !dt.includes("collab")) return false;
        if (formatFilter === "edited" && !dt.includes("edited") && !dt.includes("ugc_video")) return false;
        if (formatFilter === "raw" && !dt.includes("raw")) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (b.title || "").toLowerCase().includes(q);
        const matchBrand = (b.brand_name || "").toLowerCase().includes(q);
        const matchProduct = (b.product_name || "").toLowerCase().includes(q);
        if (!matchTitle && !matchBrand && !matchProduct) return false;
      }

      return true;
    });

    // Sorting
    if (sortOption === "payout") {
      list.sort((a, b) => (b.budget || 0) - (a.budget || 0));
    } else if (sortOption === "newest") {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return list;
  }, [briefs, formatFilter, searchQuery, sortOption]);

  // (session 23) A second, token-less claim handler lived here. Unused, and the server rejects
  // claims without the email-OTP sign token — claims go through handleVerifyAndSignMobile only.

  // Same endpoint and body as desktop ManageUGCOrdersView.handleDeclineChanges.
  const handleDeclineChanges = async () => {
    if (!selectedOrder || declining) return;
    if (!declineReason.trim()) {
      toast.error("Please give a reason for declining.");
      return;
    }
    setDeclining(true);
    try {
      await api.post(`/ugc/orders/${selectedOrder.id}/decline-revisions`, { feedback: declineReason.trim() });
      toast.success("Changes declined. The brand has been told.");
      setDeclineOpen(false);
      setDeclineReason("");
      setSelectedOrder((prev) => (prev ? { ...prev, stage: "IN_REVIEW", revisionDeclined: true } : prev));
      await loadData();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "Failed to decline the changes");
    } finally {
      setDeclining(false);
    }
  };

  // Desktop offers "Cancel Claim" only on an unsigned reservation — same here.
  const handleCancelClaim = async () => {
    if (!selectedOrder || cancellingClaim) return;
    if (typeof window !== "undefined" && !window.confirm("Cancel this brief reservation? The brief goes back to other creators.")) return;
    setCancellingClaim(true);
    try {
      await api.post(`/ugc/orders/${selectedOrder.id}/cancel-claim`);
      toast.success("Brief reservation released.");
      setActiveView("main");
      setSelectedOrder(null);
      await loadData();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to cancel the claim.");
    } finally {
      setCancellingClaim(false);
    }
  };

  const handleSubmitDeliverable = async () => {
    if (!selectedOrder) return;
    if (!videoFile && !videoDriveUrl.trim() && !liveLinkUrl.trim()) {
      toast.error("Please select a video file or paste a drive/cloud link first.");
      return;
    }

    setSubmitting(true);
    toast.loading("Submitting deliverable for brand review...", { id: "ugc-submit" });

    try {
      let finalVideoUrl = videoDriveUrl.trim();

      // Handle direct file upload if selected
      if (videoFile) {
        setUploadProgress(20);
        const fileExt = videoFile.name.split(".").pop();
        const fileName = `${selectedOrder.id}-${Date.now()}.${fileExt}`;
        const filePath = `ugc-videos/${selectedOrder.id}/${fileName}`;

        try {
          const { data: signedData } = await api.post("/upload/signed-url", {
            bucket: "content-submissions",
            path: filePath,
            contentType: videoFile.type || "video/mp4"
          });

          setUploadProgress(60);
          const { error: uploadError } = await supabase.storage
            .from("content-submissions")
            .uploadToSignedUrl(signedData.path, signedData.token, videoFile);

          if (uploadError) {
            throw new Error(uploadError.message || "Failed to upload video to storage bucket");
          }
          finalVideoUrl = filePath;
        } catch (uploadErr) {
          console.error("Storage upload error:", uploadErr);
          toast.error(uploadErr?.message || "File upload failed. Please try again or provide a Google Drive / Dropbox link.", { id: "ugc-submit" });
          setSubmitting(false);
          setUploadProgress(0);
          return;
        }
      }

      // Validate that at least one valid video URL or live link is present
      if (!finalVideoUrl && !videoDriveUrl.trim() && !liveLinkUrl.trim()) {
        toast.error("Please upload a video file or paste a valid link.", { id: "ugc-submit" });
        setSubmitting(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(90);

      // If this is a live link submission for collaboration
      if (liveLinkUrl.trim()) {
        await api.post(`/ugc/orders/${selectedOrder.id}/submit-live-link`, {
          // The server reads link / links / live_link (ugc_routes handleUgcLiveLinkSubmit). The
          // old liveLink / liveLinks keys were ignored, so every mobile submission failed.
          link: liveLinkUrl.trim(),
          links: [liveLinkUrl.trim()],
          live_link: liveLinkUrl.trim()
        });
      } else {
        // Standard video deliverable submit with real url (no mock fallback)
        await api.post(`/ugc/orders/${selectedOrder.id}/submit`, {
          videoUrl: finalVideoUrl || videoDriveUrl.trim(),
          driveUrl: videoDriveUrl.trim() || undefined,
          notes: creatorNotes.trim() || undefined
        });
      }

      setUploadProgress(100);
      toast.success("Deliverable submitted! Brand notified for review.", { id: "ugc-submit" });

      // Refresh orders
      await loadData();

      // Update selected order view state
      setSelectedOrder((prev) => ({
        ...prev,
        stage: "IN_REVIEW",
        status: "SUBMITTED"
      }));

      setVideoFile(null);
      setVideoDriveUrl("");
      setCreatorNotes("");
      setLiveLinkUrl("");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || "Failed to submit deliverable. Please try again.", {
        id: "ugc-submit"
      });
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  // =========================================================================
  // VIEW: 03 · PRODUCTION WORKSPACE · UPLOAD
  // =========================================================================
  if (activeView === "workspace" && selectedOrder) {
    const brief = selectedOrder.brief || {};
    const badgeMeta = getDeliverableBadgeMeta(selectedOrder.deliverable_type || brief.deliverable_type);
    const hasVideoInput = Boolean(videoFile || videoDriveUrl.trim() || liveLinkUrl.trim());
    const isCollab = Boolean(selectedOrder.is_collaboration || brief.is_collaboration);

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-32">
        {/* Top App Bar */}
        <div className="bg-white border-b border-[#ECECF0] sticky top-0 z-30">
          <div className="h-11 px-4 flex items-center gap-3">
            <button
              onClick={() => {
                setActiveView("main");
                setSelectedOrder(null);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F2F2F7] transition-colors cursor-pointer"
            >
              <ArrowLeft size={19} strokeWidth={2.2} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[14.5px] leading-tight tracking-[-0.3px] text-[#0A0A0A] truncate">
                {selectedOrder.title || "Deliverable Workspace"}
              </div>
              <div className="text-[11px] text-[#6B7280] truncate mt-0.5">
                {selectedOrder.orderNumber} · {selectedOrder.brandName}
              </div>
            </div>

            {/* Chat Action Button */}
            <div className="relative shrink-0">
              <button
                onClick={() => {
                  const targetThreadId = selectedOrder.thread_id || selectedOrder.id;
                  navigate(`/chat/${targetThreadId}`);
                }}
                className="h-[34px] px-3 rounded-[11px] bg-[#F5F0FF] flex items-center gap-1.5 text-[#7C3AED] font-bold text-[12px] hover:bg-[#EDE4FF] transition-colors cursor-pointer"
              >
                <MessageCircle size={14} strokeWidth={2.2} />
                <span>Chat</span>
              </button>
              {Boolean(selectedOrder.unread_count && selectedOrder.unread_count > 0) && (
                <div className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#DC2626] border-2 border-white text-white font-extrabold text-[9px] flex items-center justify-center">
                  {selectedOrder.unread_count}
                </div>
              )}
            </div>
          </div>

          {/* Subheader Bar: Secure payment hold & Signed Date */}
          <div className="px-4 py-2.5 flex items-center justify-between border-t border-[#F1F1F5] bg-[#FAFAFC]">
            <div className="h-7 px-2.5 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0]/60 flex items-center gap-1.5 text-[#047857] font-bold text-[11.5px]">
              <Lock size={12} strokeWidth={2.4} />
              <span>{formatCurrency(selectedOrder.payout)} in a secure payment hold</span>
            </div>
            <div className={`text-[11px] font-medium text-right ${selectedOrder.isUnsigned ? "text-[#B45309]" : "text-[#9CA3AF]"}`}>
              {selectedOrder.isUnsigned ? "Agreement not signed" : "Agreement signed"}
            </div>
          </div>
        </div>

        {/* Workspace Body */}
        <div className="p-4 flex flex-col gap-3">
          {/* 1. Timer & Stepper Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs">
            <UGCTimerRing deadline={selectedOrder.deadline} totalHours={orderWindowHours(selectedOrder)} />

            {/* Progress bar line */}
            <div className="mt-3 h-[3px] rounded-[2px] bg-[#F1F1F5] relative overflow-hidden">
              <div
                className="absolute left-0 top-0 bottom-0 rounded-[2px] transition-all duration-500"
                style={{
                  width: `${computeTimeRemaining(selectedOrder.deadline).pct}%`,
                  background: computeTimeRemaining(selectedOrder.deadline).accentColor
                }}
              />
            </div>

            {/* Status Stepper */}
            <div className="mt-2">
              <UGCStatusStepper stage={selectedOrder.linkPhase ? "LIVE_LINK_SUBMITTED" : selectedOrder.stage} />
            </div>
          </div>

          {/* 2. Revision Notice Card (if Revision Requested) */}
          {selectedOrder.stage === "REVISION_REQUESTED" && (
            <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-[18px] p-3.5">
              <div className="flex items-start gap-2.5 text-[#B91C1C]">
                <AlertTriangle size={18} strokeWidth={2.2} className="shrink-0 mt-0.5 text-[#DC2626]" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px]">Revision requested by brand</div>
                  {selectedOrder.revisionNotes && (
                    <div className="mt-1 text-[11.5px] leading-relaxed text-[#991B1B] italic bg-white/70 p-2 rounded-[10px] border border-[#FECACA]">
                      “{selectedOrder.revisionNotes}”
                    </div>
                  )}
                  <div className="mt-2 text-[10.5px] font-semibold text-[#B91C1C]">
                    Remaining revisions: {selectedOrder.revisionsLeft}
                  </div>
                </div>
              </div>

              {/* Session 24: decline the changes (desktop "Decline Changes"). */}
              {declineOpen ? (
                <div className="mt-3 bg-white rounded-[14px] border border-[#FECACA] p-3 flex flex-col gap-2">
                  <div className="font-bold text-[10px] tracking-[0.8px] uppercase text-[#6B7280]">Reason for declining</div>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g. This change is outside the agreed brief."
                    className="h-[70px] w-full border border-[#E4E4EC] rounded-[12px] p-2.5 text-[12.5px] resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setDeclineOpen(false); setDeclineReason(""); }}
                      className="h-10 px-4 rounded-[12px] border border-[#E4E4EC] bg-white text-[#5C5C6B] font-bold text-[12.5px] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeclineChanges}
                      disabled={declining || !declineReason.trim()}
                      className={`flex-1 h-10 rounded-[12px] font-bold text-[12.5px] text-white ${declining || !declineReason.trim() ? "bg-[#FDA4AF] cursor-not-allowed" : "bg-[#E11D48] cursor-pointer"}`}
                    >
                      {declining ? "Sending…" : "Decline changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeclineOpen(true)}
                  className="mt-3 w-full h-10 rounded-[12px] border border-[#FCA5A5] bg-white text-[#E11D48] font-bold text-[12.5px] cursor-pointer"
                >
                  Decline changes
                </button>
              )}
            </div>
          )}

          {/* Session 24: the creator declined the changes — waiting on the brand or support. */}
          {selectedOrder.revisionDeclined && (
            <div className="bg-[#FFF1F2] border border-[#FECDD3] rounded-[18px] p-3.5">
              <div className="font-bold text-[13px] text-[#9F1239]">You declined the requested changes</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-[#9F1239]">
                The brand can approve your last submission or ask support to step in.
              </div>
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="mt-2.5 w-full h-10 rounded-[12px] border border-[#E4E4EC] bg-white text-[#374151] font-bold text-[12px] cursor-pointer"
              >
                🛡 Raise with support
              </button>
            </div>
          )}

          {/* Session 24: unsigned reservation — desktop "Cancel Claim". */}
          {selectedOrder.isUnsigned && (
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[18px] p-3.5">
              <div className="font-bold text-[13px] text-[#92400E]">Agreement not signed yet</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-[#92400E]">
                This brief is reserved for you but the agreement was never signed. Sign it on desktop — your timer starts the moment you sign — or release it.
              </div>
              <button
                type="button"
                onClick={handleCancelClaim}
                disabled={cancellingClaim}
                className="mt-2.5 w-full h-10 rounded-[12px] border border-[#E4E4EC] bg-white text-[#374151] font-bold text-[12px] cursor-pointer disabled:opacity-60"
              >
                {cancellingClaim ? "Releasing…" : "Cancel claim"}
              </button>
            </div>
          )}

          {/* Session 25 (rule 51): creator cancels a signed order before the first draft. */}
          {!selectedOrder.isUnsigned && selectedOrder.stage === "IN_PROGRESS" && creatorCancelInfo(selectedOrder).allowed && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowCancelOrder(true)}
                className="text-[12px] font-semibold text-[#B91C1C] underline cursor-pointer bg-transparent border-0"
              >
                Can't do this order? Cancel
              </button>
            </div>
          )}
          <Presence>{showCancelOrder && (
            <CreatorCancelOrderSheet key="creatorcancelordersheet"
              mobile
              order={selectedOrder}
              onClose={() => setShowCancelOrder(false)}
              onCancelled={async () => {
                setShowCancelOrder(false);
                setActiveView("main");
                setSelectedOrder(null);
                await loadData();
              }}
            />
          )}</Presence>

          {/* 3. Brief Specifications Accordion */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs">
            <button
              onClick={() => setBriefSpecsOpen(!briefSpecsOpen)}
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280]">
                Brief specifications
              </div>
              {briefSpecsOpen ? (
                <ChevronUp size={16} className="text-[#9CA3AF]" />
              ) : (
                <ChevronDown size={16} className="text-[#9CA3AF]" />
              )}
            </button>

            <div className="mt-2 text-[12px] leading-relaxed text-[#4B5563]">
              {brief.product_description || brief.detailed_requirements || selectedOrder.title}
            </div>

            {/* Specs Pills */}
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="h-[22px] px-2 rounded-[7px] bg-[#ECFDF5] text-[#047857] font-bold text-[10.5px] flex items-center">
                {(brief.dos || []).length || 2} do’s
              </span>
              <span className="h-[22px] px-2 rounded-[7px] bg-[#FEF2F2] text-[#B91C1C] font-bold text-[10.5px] flex items-center">
                {(brief.donts || []).length || 2} don’ts
              </span>
              <span className="h-[22px] px-2 rounded-[7px] bg-[#F2F2F7] text-[#4B5563] font-bold text-[10.5px] flex items-center">
                {brief.video_duration || "30-60s · 1080p"}
              </span>
            </div>

            {briefSpecsOpen && (
              <div className="mt-3 pt-3 border-t border-[#F1F1F5] flex flex-col gap-2.5 text-[11.5px]">
                {brief.dos && brief.dos.length > 0 && (
                  <div>
                    <div className="font-bold text-[#047857] mb-1">Must Do:</div>
                    <ul className="list-disc pl-4 text-[#374151] space-y-1">
                      {brief.dos.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.donts && brief.donts.length > 0 && (
                  <div>
                    <div className="font-bold text-[#B91C1C] mb-1">Must Not Do:</div>
                    <ul className="list-disc pl-4 text-[#374151] space-y-1">
                      {brief.donts.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {brief.sample_content_url && (
              <a
                href={brief.sample_content_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center gap-1.5 text-[#7C3AED] font-bold text-[12px] hover:underline"
              >
                <PlayCircle size={14} />
                <span>View sample reference video</span>
              </a>
            )}
          </div>

          {selectedOrder.linkPhase && (
            <UGCLinkPhaseCard
              phase={selectedOrder.linkPhase}
              onOpenChat={() => navigate(`/chat/${selectedOrder.thread_id || selectedOrder.id}`)}
            />
          )}

          {/* 4. Submit Deliverable Section */}
          {!selectedOrder.linkPhase && (
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs flex flex-col gap-2.5">
            <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280]">
              Submit deliverable
            </div>

            {/* Drop MP4/MOV File Picker */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-[1.5px] border-dashed border-[#DDD0FF] rounded-[14px] bg-[#FBF9FF] p-[11px_12px] flex items-center gap-3 cursor-pointer hover:border-[#7C3AED] transition-colors"
            >
              <div className="w-[38px] h-[38px] rounded-[12px] bg-[#F5F0FF] flex items-center justify-center text-[#7C3AED] shrink-0">
                <Upload size={17} strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12.5px] text-[#0A0A0A] truncate">
                  {videoFile ? videoFile.name : "Drop MP4 / MOV"}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[#9CA3AF]">
                  {videoFile
                    ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to upload`
                    : "Up to 50MB · 1080p+"}
                </div>
              </div>
              <div className="h-[32px] px-3.5 rounded-[10px] bg-[#7C3AED] flex items-center font-bold text-[12px] text-white shrink-0">
                {videoFile ? "Change" : "Browse"}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setVideoFile(e.target.files[0]);
                  }
                }}
              />
            </div>

            {/* Paste Drive Link Input */}
            <div className="h-[46px] rounded-[13px] border border-[#E2E8F0] bg-[#FBFBFD] flex items-center gap-2.5 px-3 focus-within:border-[#7C3AED] transition-colors">
              <ExternalLink size={15} className="text-[#ABABAB] shrink-0" />
              <input
                type="url"
                placeholder="Paste Google Drive / Dropbox link"
                value={videoDriveUrl}
                onChange={(e) => setVideoDriveUrl(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[12.5px] text-[#0A0A0A] placeholder-[#ABABAB]"
              />
            </div>

            {/* Paste Live Link (if collaboration) */}
            {isCollab && (
              <div className="h-[46px] rounded-[13px] border border-[#E2E8F0] bg-[#FBFBFD] flex items-center gap-2.5 px-3 focus-within:border-[#7C3AED] transition-colors">
                <PlayCircle size={15} className="text-[#7C3AED] shrink-0" />
                <input
                  type="url"
                  placeholder="Paste live Instagram Reel link (https://...)"
                  value={liveLinkUrl}
                  onChange={(e) => setLiveLinkUrl(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-[12.5px] text-[#0A0A0A] placeholder-[#ABABAB]"
                />
              </div>
            )}

            {/* Creator Notes Input */}
            <div className="h-[46px] rounded-[13px] border border-[#E2E8F0] bg-[#FBFBFD] flex items-center gap-2.5 px-3 focus-within:border-[#7C3AED] transition-colors">
              <span className="text-[#ABABAB] font-bold text-base leading-none shrink-0">+</span>
              <input
                type="text"
                placeholder="Add creator notes (optional)"
                value={creatorNotes}
                onChange={(e) => setCreatorNotes(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[12.5px] text-[#0A0A0A] placeholder-[#ABABAB]"
              />
            </div>

            {uploadProgress > 0 && (
              <div className="mt-1">
                <div className="flex justify-between text-[11px] font-bold text-[#7C3AED] mb-1">
                  <span>Uploading video...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#EDE4FF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#7C3AED] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {supportOpen && (
          <MobileOrderSupportSheet
            fixed
            isBrand={false}
            threadId={selectedOrder.thread_id || selectedOrder.id}
            thread={{
              id: selectedOrder.thread_id || selectedOrder.id,
              deal_id: selectedOrder.id,
              title: selectedOrder.title,
              amount_fixed: selectedOrder.payout,
              brand_id: selectedOrder.brand_id,
              brand_name: selectedOrder.brandName,
              creator_id: selectedOrder.creator_id,
            }}
            onClose={() => setSupportOpen(false)}
          />
        )}

        {/* Sticky Submit Bar at Bottom (Spec 03 / Dev Note 1) — not on an unsigned reservation */}
        {!selectedOrder.isUnsigned && !selectedOrder.linkPhase && (
        <div className="fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-[#ECECF0] p-[12px_16px_22px] z-40">
          <div className="mb-2 font-medium text-[11px] text-[#9CA3AF] text-center">
            {hasVideoInput
              ? "Ready for submission · 100% Secure Payment Hold Protected"
              : "Add a video file or link to submit"}
          </div>

          <button
            onClick={handleSubmitDeliverable}
            disabled={!hasVideoInput || submitting}
            className={`w-full h-[52px] rounded-[15px] flex items-center justify-center gap-2 font-bold text-[15px] transition-all cursor-pointer ${
              hasVideoInput && !submitting
                ? "bg-[#7C3AED] text-white shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] active:scale-[0.98]"
                : "bg-[#E9E3F8] text-[#A89BCB] cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <span>Submitting...</span>
            ) : (
              <>
                <span>Submit video for brand review</span>
                <ArrowRight size={17} strokeWidth={2.2} />
              </>
            )}
          </button>
        </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW: M01 · BRIEF DETAILS (Step 1 of 2)
  // =========================================================================
  if (activeView === "brief_details" && selectedBrief) {
    const badgeMeta = getDeliverableBadgeMeta(selectedBrief.deliverable_type);
    const brandName = selectedBrief.brand_name || "Verified Brand";
    const brandLetter = brandName.charAt(0).toUpperCase();
    const budget = Number(selectedBrief.budget) || 0; // no invented ₹5,000
    const briefHours = deliveryHoursOf(selectedBrief.delivery_hours, 24);
    const duration = selectedBrief.video_duration || "30–60s";

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-32">
        {/* Top Header */}
        <div className="bg-white border-b border-[#ECECF0] sticky top-0 z-30">
          <div className="h-12 px-4 flex items-center justify-between">
            <button
              onClick={() => {
                setActiveView("main");
                setSelectedBrief(null);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F2F2F7] transition-colors cursor-pointer"
            >
              <ArrowLeft size={19} strokeWidth={2.2} />
            </button>
            <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A]">
              Brief details
            </div>
            <span className="text-[11px] font-semibold text-[#6B7280]">Step 1 of 2</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-3.5">
          {/* Brand Row Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <BrandLogo src={selectedBrief.brand_logo || selectedBrief.brand?.logo} name={brandName} size={44} radius={14} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[14px] text-[#0A0A0A] truncate">{brandName}</span>
                  <div className="h-4 px-1.5 rounded bg-emerald-50 border border-emerald-200 text-[#047857] flex items-center gap-0.5 text-[9.5px] font-semibold shrink-0">
                    <Check size={8} strokeWidth={3} />
                    <span>Verified brand</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#6B7280] mt-0.5">
                  {selectedBrief.category || "Lifestyle & Apparel"} · Direct on Ybex
                </div>
              </div>
            </div>

            <h1 className="mt-3.5 font-bold text-[18px] leading-snug tracking-[-0.4px] text-[#0A0A0A]">
              {selectedBrief.title}
            </h1>

            {/* Chips row */}
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <span
                className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] whitespace-nowrap border"
                style={{
                  background: badgeMeta.bg,
                  color: badgeMeta.color,
                  borderColor: badgeMeta.border
                }}
              >
                {badgeMeta.cleanLabel || badgeMeta.label}
              </span>
              <span className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB] whitespace-nowrap">
                {duration} · 9:16 vertical
              </span>
              <span className="px-2.5 py-1 rounded-[7px] font-medium text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB] whitespace-nowrap">
                {selectedBrief.deliverable_type?.includes("collab") ? "Instagram collab post" : "Brand posts it"}
              </span>
            </div>
          </div>

          {/* Green Guaranteed Payout & Deadline Card */}
          <div className="bg-[#EDFAF1] border border-[#C6F0D3] rounded-[18px] p-4 flex items-center justify-between shadow-2xs">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#047857]">
                Guaranteed Payout
              </div>
              <div className="font-extrabold text-[24px] text-[#059669] tracking-[-0.6px] leading-tight mt-0.5">
                {formatCurrency(budget)}
              </div>
              <div className="text-[10.5px] text-[#047857] flex items-center gap-1 mt-0.5">
                <Lock size={10} className="stroke-[2.5]" />
                <span>In secure payment hold · paid on approval</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#047857]">
                Delivery SLA
              </div>
              <div className="font-bold text-[18px] text-[#0A0A0A] mt-0.5">
                {briefHours} hours
              </div>
              <div className="text-[10.5px] text-[#6B7280] mt-0.5">
                from signing agreement
              </div>
            </div>
          </div>

          {/* Product Description */}
          {selectedBrief.product_description && (
            <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 shadow-xs">
              <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280] mb-1.5">
                About the product
              </div>
              <div className="text-[12.5px] leading-relaxed text-[#374151] whitespace-pre-line">
                {selectedBrief.product_description}
              </div>
            </div>
          )}

          {/* What to Create */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 shadow-xs">
            <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280] mb-1.5">
              What to create
            </div>
            <div className="text-[12.5px] leading-relaxed text-[#374151] whitespace-pre-line">
              {selectedBrief.detailed_requirements || "High-energy 9:16 vertical video. Clear hook in the first 2 seconds, authentic styling, brand handle tagged."}
            </div>

            {/* Do's & Don'ts */}
            <div className="mt-3.5 grid grid-cols-1 gap-2.5">
              <div className="p-3.5 rounded-[14px] bg-[#F7FBF8] border border-[#DDF1E4]">
                <div className="font-bold text-[12px] text-[#047857] mb-2 flex items-center gap-1.5">
                  <Check size={14} className="stroke-[3]" /> Must Do:
                </div>
                <div className="space-y-1.5 text-[11.5px] text-[#374151]">
                  {selectedBrief.dos?.[0] ? (
                    selectedBrief.dos.map((d, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check size={13} className="text-[#059669] shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>{d}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <Check size={13} className="text-[#059669] shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>Show the product clearly in use</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check size={13} className="text-[#059669] shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>Record in bright natural daylight</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-[14px] bg-[#FEF8F8] border border-[#FEE4E2]">
                <div className="font-bold text-[12px] text-rose-700 mb-2 flex items-center gap-1.5">
                  <X size={14} className="stroke-[3]" /> Must Not Do:
                </div>
                <div className="space-y-1.5 text-[11.5px] text-[#374151]">
                  {selectedBrief.donts?.[0] ? (
                    selectedBrief.donts.map((d, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <X size={13} className="text-rose-500 shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>{d}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <X size={13} className="text-rose-500 shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>Low-light or shaky handheld footage</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <X size={13} className="text-rose-500 shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>Competitor tags or products in frame</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sample Reference - Only shown if brand provided a sample URL */}
          {Boolean(selectedBrief.sample_content_url && selectedBrief.sample_content_url.trim()) && (
            <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs flex items-center gap-3">
              <div className="w-12 h-14 rounded-[12px] bg-gradient-to-br from-[#D6D3E8] to-[#4C4666] flex items-center justify-center shrink-0 text-white">
                <PlayCircle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13px] text-[#0A0A0A]">Sample reference reel</div>
                <div className="text-[11px] text-[#6B7280] mt-0.5">Style and pacing guidance</div>
              </div>
              <a
                href={selectedBrief.sample_content_url}
                target="_blank"
                rel="noreferrer"
                className="h-8 px-3 rounded-[10px] border border-[#E2E4EA] text-[11.5px] font-bold text-[#7C3AED] hover:bg-[#F5F0FF] flex items-center gap-1 transition-colors"
              >
                Watch <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* Terms summary specs */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] divide-y divide-gray-100 overflow-hidden shadow-xs">
            <div className="p-3 flex items-center justify-between text-[11.5px]">
              <span className="text-[#6B7280]">Revisions allowed</span>
              <span className="font-bold text-[#0A0A0A]">Up to {UGC_REVISION_LIMIT}</span>
            </div>
            <div className="p-3 flex items-center justify-between text-[11.5px]">
              <span className="text-[#6B7280]">Payment release</span>
              <span className="font-bold text-[#0A0A0A]">Within 48h of approval</span>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Bar for M01 */}
        <div className="fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-[#ECECF0] p-[10px_16px_20px] z-40 flex flex-col gap-2">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#78350F]">
            <Clock size={12} className="text-amber-600 shrink-0" />
            <span>{briefHours}h timer starts when you sign in Step 2. Missing it cancels the order.</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Secondary button on Left per AGENTS_md */}
            <button
              onClick={() => {
                setActiveView("main");
                setSelectedBrief(null);
              }}
              className="h-[48px] px-4 rounded-[14px] bg-[#F2F2F7] text-[#4B5563] font-bold text-[13.5px] cursor-pointer hover:bg-[#E5E5EA] transition-colors"
            >
              Cancel
            </button>

            {/* Primary button on Right per AGENTS_md: Advances to Step 2 (NO order created yet!)
                Session 24: only KYC-approved creators can claim — others can read the brief. */}
            {kycStatus === "APPROVED" || kycStatus === null ? (
              <button
                onClick={() => setActiveView("agreement")}
                disabled={kycStatus === null}
                className="flex-1 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
              >
                <span>I commit · claim for {formatCurrency(budget)}</span>
                <ArrowRight size={15} strokeWidth={2.4} />
              </button>
            ) : kycStatus === "PENDING" ? (
              <button
                disabled
                className="flex-1 h-[48px] rounded-[14px] bg-[#FEF3C7] text-[#92400E] font-bold text-[12.5px] px-3 cursor-not-allowed"
              >
                KYC under review · you can claim once approved
              </button>
            ) : (
              <button
                onClick={() => navigate("/creator/kyc")}
                className="flex-1 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[13.5px] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{kycStatus === "REJECTED" ? "Update KYC to claim" : "Complete KYC to claim"}</span>
                <ArrowRight size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: M02 · SIGN AGREEMENT (Step 2 of 2)
  // =========================================================================
  if (activeView === "agreement" && selectedBrief) {
    const brandName = selectedBrief.brand_name || "Verified Brand";
    const budget = Number(selectedBrief.budget) || 0; // no invented ₹5,000
    const briefHours = deliveryHoursOf(selectedBrief.delivery_hours, 24);
    const agreementV1 = buildUgcAgreement(selectedBrief);
    const fullOtpCode = otpDigits.join("");
    const isFormValid = agreedTerms && agreedDeadline && fullOtpCode.length === 6;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-32">
        {/* Top Header */}
        <div className="bg-white border-b border-[#ECECF0] sticky top-0 z-30">
          <div className="h-12 px-4 flex items-center justify-between">
            <button
              onClick={() => setActiveView("brief_details")}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F2F2F7] transition-colors cursor-pointer"
            >
              <ArrowLeft size={19} strokeWidth={2.2} />
            </button>
            <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A]">
              Sign agreement
            </div>
            <span className="text-[11px] font-bold text-[#7C3AED]">Step 2 of 2</span>
          </div>

          {/* Full purple progress line */}
          <div className="w-full h-[2.5px] bg-[#7C3AED]" />
        </div>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-3.5">
          {/* Subtitle card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs">
            <div className="font-bold text-[14px] text-[#0A0A0A] truncate">
              {selectedBrief.title}
            </div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">
              Brand Partner: <strong>{brandName}</strong>
            </div>
          </div>

          <div ref={agreementRef} className="flex flex-col gap-3.5">
          <AgreementTermsPanel agreement={agreementV1} compact pdfName="ybex-ugc-agreement.pdf" pdfSubtitle={`${selectedBrief.title || "UGC brief"} · ${brandName}`} />
          </div>
          <GoodToKnowCard />

          {/* 2 Agreement Checkboxes */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
              />
              <span className="text-[11.5px] text-[#374151] leading-tight font-medium">
                I agree to the creator agreement and brief requirements.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedDeadline}
                onChange={(e) => setAgreedDeadline(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
              />
              <span className="text-[11.5px] text-[#374151] leading-tight font-medium">
                I understand missing the {briefHours}h deadline cancels this order.
              </span>
            </label>
          </div>

          {/* Sign with OTP Box */}
          <div className={`rounded-[18px] border border-[#D8B4FE]/70 bg-[#FAF7FF] p-4 space-y-3 shadow-2xs transition ${termsAccepted ? "" : "opacity-50 pointer-events-none"}`} aria-disabled={!termsAccepted}>
            {!termsAccepted && <div className="text-[11.5px] font-semibold text-[#7C3AED]">Tick both boxes above to get your code.</div>}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[13px] text-[#0A0A0A]">
                <Lock size={14} className="text-[#7C3AED]" />
                <span>Sign with OTP</span>
              </div>
              {/* Full address on its own line so it never gets cut (session 23). */}
              <div className="text-[12px] text-[#6B7280] flex items-start gap-1.5 min-w-0">
                <Mail size={12} className="mt-[2px] shrink-0" />
                <span className="min-w-0 break-all">
                  Code sent to <strong className="text-[#0A0A0A]">{maskedEmail}</strong>
                </span>
              </div>
            </div>

            {/* 6 Digit Inputs */}
            <div>
              <div className="flex justify-between gap-1.5">
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-11 h-12 text-center text-lg font-bold font-mono bg-white border border-[#DDD0FF] rounded-xl text-[#0A0A0A] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 outline-none transition-all shadow-2xs"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between mt-2.5 text-[11px] text-[#6B7280]">
                <span>Registered email · cannot be changed</span>
                {resendCooldown > 0 ? (
                  <span className="font-semibold text-[#7C3AED]">
                    Resend in 0:{resendCooldown < 10 ? `0${resendCooldown}` : resendCooldown}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendMobileOTP(false)}
                    disabled={sendingOtp}
                    className="font-bold text-[#7C3AED] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {sendingOtp ? "Sending..." : "Resend OTP"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Bar for M02 */}
        <div className="fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-[#ECECF0] p-[10px_16px_20px] z-40">
          <div className="flex items-center gap-2.5">
            {/* Secondary button on Left per AGENTS_md */}
            <button
              type="button"
              onClick={() => setActiveView("brief_details")}
              className="h-[48px] px-4 rounded-[14px] bg-[#F2F2F7] text-[#4B5563] font-bold text-[13.5px] cursor-pointer hover:bg-[#E5E5EA] transition-colors"
            >
              Back
            </button>

            {/* Primary button on Right per AGENTS_md */}
            <button
              type="button"
              onClick={handleVerifyAndSignMobile}
              disabled={signingOrder || !isFormValid}
              className="flex-1 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {signingOrder ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Verify OTP & sign</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: 01 · EXPLORE UGC & 02 · MANAGE ORDERS
  // =========================================================================
  return (
    <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-24">
      {/* Top Header Section */}
      <div className="bg-white flex-shrink-0 border-b border-[#ECECF0]">
        <div className="px-4 pt-3 pb-1">
          <div className="font-semibold text-[22px] leading-[1.1] tracking-[-0.7px] text-[#0A0A0A]">
            {activeTab === "explore" ? "Explore UGC" : "Manage UGC orders"}
          </div>
          {activeTab === "explore" && <OfferStrip className="mt-1.5" />}
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-[#059669] flex items-center justify-center text-white shrink-0">
              <Check size={8} strokeWidth={3} />
            </div>
            <div className="font-normal text-[11.5px] text-[#6B7280]">
              {activeTab === "explore"
                ? "Instant UGC marketplace · 100% secure payment hold"
                : "Upload deliverables, track review, get paid"}
            </div>
          </div>
        </div>

        {/* Segmented Control Pill Toggle (Explore vs Manage Orders) */}
        <div className="px-4 pt-3 pb-1">
          <div className="h-[40px] rounded-[13px] bg-[#F2F2F7] p-[3px] flex gap-[3px] relative">
            <button
              onClick={() => {
                setActiveTab("explore");
                setSearchParams({ tab: "explore" });
              }}
              className={`flex-1 rounded-[11px] font-semibold text-[13px] flex items-center justify-center transition-colors cursor-pointer relative z-10 ${
                activeTab === "explore"
                  ? "text-white"
                  : "text-[#6B7280] hover:text-[#0A0A0A]"
              }`}
            >
              {activeTab === "explore" && (
                <motion.div
                  layoutId="creatorMobileUgcPill"
                  className="absolute inset-0 bg-[#7C3AED] rounded-[11px] shadow-[0_6px_14px_-8px_rgba(124,58,237,0.9)] z-0"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">Explore</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("manage");
                setSearchParams({ tab: "manage" });
              }}
              className={`flex-1 rounded-[11px] font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer relative z-10 ${
                activeTab === "manage"
                  ? "text-white"
                  : "text-[#6B7280] hover:text-[#0A0A0A]"
              }`}
            >
              {activeTab === "manage" && (
                <motion.div
                  layoutId="creatorMobileUgcPill"
                  className="absolute inset-0 bg-[#7C3AED] rounded-[11px] shadow-[0_6px_14px_-8px_rgba(124,58,237,0.9)] z-0"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">Manage orders</span>
              <div
                className={`relative z-10 min-w-[18px] h-[18px] px-1.5 rounded-[9px] box-border flex items-center justify-center font-bold text-[10px] ${
                  activeTab === "manage"
                    ? "bg-white/30 text-white"
                    : "bg-[#EDE4FF] text-[#7C3AED]"
                }`}
              >
                {mappedOrders.length}
              </div>
            </button>
          </div>
        </div>

        {/* Filters specific to tab */}
        {activeTab === "explore" ? (
          <>
            {/* Search Bar & Sort Button */}
            <div className="px-4 pt-3 flex gap-[9px]">
              <div className="flex-1 h-[42px] rounded-[13px] bg-[#F2F2F7] flex items-center gap-2.5 px-3 focus-within:ring-1 focus-within:ring-[#7C3AED]">
                <Search size={15} className="text-[#ABABAB] shrink-0" />
                <input
                  type="text"
                  placeholder="Title, product or brand"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none font-normal text-[13px] text-[#0A0A0A] placeholder-[#ABABAB]"
                />
              </div>

              <button
                onClick={() => setShowSortSheet(true)}
                className="h-[42px] px-3 rounded-[13px] bg-[#F2F2F7] flex items-center gap-1.5 shrink-0 font-semibold text-[12px] text-[#374151] cursor-pointer hover:bg-[#E5E5EA]"
              >
                <span>Sort</span>
              </button>
            </div>

            {/* Format Filter Pills (Spec 01) */}
            <div className="px-4 py-3 flex gap-[7px] overflow-x-auto hide-scrollbar">
              {[
                { id: "all", label: "All formats" },
                { id: "collab", label: "Collaboration" },
                { id: "edited", label: "UGC edited" },
                { id: "raw", label: "Draft / raw" }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormatFilter(f.id)}
                  className={`h-[32px] px-3 rounded-[10px] flex items-center font-semibold text-[12px] shrink-0 whitespace-nowrap transition-colors cursor-pointer ${
                    formatFilter === f.id
                      ? "bg-[#7C3AED] text-white shadow-xs"
                      : "bg-[#F2F2F7] text-[#4B5563] hover:bg-[#E5E5EA]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Manage Orders Filter Pills (Spec 02: All · 3, In production · 1, In review · 1, Completed · 1) */
          <div className="px-4 py-3 flex gap-[7px] overflow-x-auto hide-scrollbar">
            {[
              { id: "all", label: `All · ${orderCounts.all}` },
              { id: "production", label: `In production · ${orderCounts.production}` },
              { id: "review", label: `In review · ${orderCounts.review}` },
              { id: "completed", label: `Completed · ${orderCounts.completed}` }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setManageFilter(f.id)}
                className={`h-[32px] px-3 rounded-[10px] flex items-center font-semibold text-[12px] shrink-0 whitespace-nowrap transition-colors cursor-pointer ${
                  manageFilter === f.id
                    ? "bg-[#7C3AED] text-white shadow-xs"
                    : "bg-[#F2F2F7] text-[#4B5563] hover:bg-[#E5E5EA]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main List Container */}
      <div className="flex-1 px-4 pt-3.5 flex flex-col gap-[11px]">
        {/* ======================= TAB: EXPLORE UGC ======================= */}
        {activeTab === "explore" && (
          <>
            {loading ? (
              <UGCCardsListSkeleton count={4} />
            ) : filteredBriefs.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-[18px] border border-[#E2E8F0] p-6">
                <div className="w-12 h-12 rounded-full bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center mx-auto mb-3">
                  <Film size={22} />
                </div>
                <div className="font-bold text-[15px] text-[#0A0A0A]">No briefs matching search</div>
                <div className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">
                  Try switching filters or search terms to discover active brand UGC campaigns.
                </div>
              </div>
            ) : (
              filteredBriefs.map((b) => {
                const badgeMeta = getDeliverableBadgeMeta(b.deliverable_type);
                const brandName = b.brand_name || "Verified Brand";
                const isNew = b.created_at
                  ? Date.now() - new Date(b.created_at).getTime() < 48 * 3600 * 1000
                  : true;

                return (
                  <div
                    key={b.id}
                    className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] shadow-xs flex flex-col"
                  >
                    {/* Brand Row + NEW tag */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandLogo src={b.brand_logo || b.brand?.logo} name={brandName} size={34} radius={11} testId="ugc-brief-logo" />
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="font-semibold text-[12.5px] text-[#0A0A0A] truncate">
                            {brandName}
                          </span>
                          <div className="w-3 h-3 rounded-full bg-[#059669] flex items-center justify-center text-white shrink-0">
                            <Check size={7} strokeWidth={3} />
                          </div>
                        </div>
                      </div>

                      {b.is_priority ? (
                        <div className="h-[18px] px-2 rounded-[9px] bg-amber-100 text-amber-800 border border-amber-300 flex items-center font-bold text-[9px] tracking-tight shrink-0">
                          Urgent · relisted
                        </div>
                      ) : null}
                    </div>

                    {/* Brief Title & Description */}
                    <div className="mt-2.5 font-semibold text-[15px] leading-[1.3] tracking-[-0.3px] text-[#0A0A0A]">
                      {b.title}
                    </div>
                    <div className="mt-1.5 font-normal text-[12px] leading-[1.5] text-[#6B7280] line-clamp-2">
                      {b.product_description || b.detailed_requirements || "Authentic UGC creator video deliverable."}
                    </div>

                    {/* Pills Row below description matching reference: [Coloured box: Format only] [Duration] [⚡ 24h delivery] */}
                    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                      {/* 1. Coloured box with video format only - NO emoji or icon! */}
                      <span
                        className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] whitespace-nowrap border"
                        style={{
                          background: badgeMeta.bg,
                          color: badgeMeta.color,
                          borderColor: badgeMeta.border
                        }}
                      >
                        {badgeMeta.cleanLabel || badgeMeta.label}
                      </span>

                      {/* 2. Duration */}
                      <span className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB] whitespace-nowrap">
                        {b.video_duration || "30–60s"}
                      </span>

                      {/* 3. 24h delivery */}
                      {/* Session 43 (Ravi): the small shining "NEW" sits on the delivery chip now. */}
                      <span className="relative px-2.5 py-1 rounded-[7px] font-medium text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB] inline-flex items-center gap-1 whitespace-nowrap">
                        <Zap size={10} className="text-gray-500 fill-gray-500" />
                        <span>{deliveryHoursOf(b.delivery_hours, 24)}h delivery</span>
                        {isNew && (
                          <span className="ybex-shine absolute -top-[7px] -right-[6px] h-[13px] px-[5px] rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EC4899] text-white text-[7.5px] font-extrabold tracking-[0.4px] leading-[13px] shadow-sm" data-testid="ugc-new-badge">
                            <span className="relative z-[2]">NEW</span>
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="mt-3 h-[1px] bg-[#EEF1F5]" />

                    {/* Payout & escrow row */}
                    <div className="mt-3 flex items-end justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="font-bold text-[19px] leading-none tracking-[-0.5px] text-[#059669]">
                          {formatCurrency(b.budget)}
                        </div>
                        <div className="mt-1 font-normal text-[10.5px] text-[#6B7280]">
                          Guaranteed in secure payment hold
                        </div>
                      </div>
                    </div>

                    {/* Action Button: View brief & claim -> (Step 1 of 2: M01 Brief Details) */}
                    <button
                      onClick={() => {
                        setSelectedBrief(b);
                        setActiveView("brief_details");
                      }}
                      className="mt-3 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] flex items-center justify-center gap-2 shadow-[0_10px_20px_-12px_rgba(124,58,237,0.95)] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <span className="font-semibold text-[14px] text-white">View brief &amp; claim</span>
                      <ArrowRight size={15} strokeWidth={2.2} className="text-white" />
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ======================= TAB: MANAGE UGC ORDERS ======================= */}
        {activeTab === "manage" && (
          <>
            {loading ? (
              <UGCOrderListSkeleton count={3} />
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-[18px] border border-[#E2E8F0] p-6">
                <div className="w-12 h-12 rounded-full bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center mx-auto mb-3">
                  <Film size={22} />
                </div>
                <div className="font-bold text-[15px] text-[#0A0A0A]">No orders in this tab</div>
                <div className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">
                  Claim active briefs from the Explore tab to start earning with fast 24h delivery!
                </div>
                <button
                  onClick={() => setActiveTab("explore")}
                  className="mt-4 h-10 px-4 rounded-[12px] bg-[#7C3AED] text-white font-bold text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Explore open briefs</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isJustClaimed = order.id === justClaimedOrderId;

                if (order.linkPhase) {
                  return (
                    <div key={order.id} className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] shadow-xs flex flex-col gap-3">
                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">{order.title}</div>
                          <div className="mt-1 font-normal text-[11px] text-[#6B7280]">{order.brandName} · {order.orderNumber}</div>
                        </div>
                        <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A] shrink-0">{formatCurrency(order.payout)}</div>
                      </div>
                      <UGCLinkPhaseCard phase={order.linkPhase} onOpenChat={() => navigate(`/chat/${order.thread_id || order.id}`)} />
                    </div>
                  );
                }

                // Card A: In Production / Filming (Spec 02)
                if (order.stage === "IN_PROGRESS") {
                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-[18px] p-[13px] flex flex-col transition-all ${
                        isJustClaimed
                          ? "border-[2px] border-[#7C3AED] shadow-[0_10px_25px_-10px_rgba(124,58,237,0.45)]"
                          : "border-[1.5px] border-[#FDE2B8] shadow-[0_16px_34px_-30px_rgba(180,83,9,0.9)]"
                      }`}
                    >
                      {isJustClaimed && (
                        <div className="mb-2 flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#7C3AED] text-white">
                            JUST CLAIMED
                          </span>
                          <span className="text-[10px] text-[#7C3AED] font-bold">
                            {orderWindowHours(order)}h Timer Active
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                            {order.title}
                          </div>
                          <div className="mt-1 font-normal text-[11px] text-[#6B7280]">
                            {order.brandName} · {order.orderNumber}
                          </div>
                        </div>
                        <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A] shrink-0">
                          {formatCurrency(order.payout)}
                        </div>
                      </div>

                      {/* Timer box */}
                      <div className="mt-3">
                        <UGCTimerRing deadline={order.deadline} totalHours={orderWindowHours(order)} />
                      </div>

                      {/* Upload deliverable button */}
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setActiveView("workspace");
                        }}
                        className="mt-3 h-[46px] rounded-[13px] bg-[#7C3AED] flex items-center justify-center gap-2 shadow-[0_10px_20px_-12px_rgba(124,58,237,0.95)] active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <Upload size={15} strokeWidth={2.2} className="text-white" />
                        <span className="font-semibold text-[13.5px] text-white">
                          Upload video deliverable
                        </span>
                      </button>
                    </div>
                  );
                }

                // Card B: Revision Requested by Brand (Spec 02)
                if (order.stage === "REVISION_REQUESTED") {
                  return (
                    <div
                      key={order.id}
                      className="bg-white border-[1.5px] border-[#FCA5A5] rounded-[18px] p-[13px] shadow-xs flex flex-col"
                    >
                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                            {order.title}
                          </div>
                          <div className="mt-1 font-normal text-[11px] text-[#6B7280]">
                            {order.brandName} · {order.orderNumber}
                          </div>
                        </div>
                        <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A] shrink-0">
                          {formatCurrency(order.payout)}
                        </div>
                      </div>

                      {/* Brand revision quote box */}
                      {order.revisionNotes ? (
                        <div className="mt-2.5 flex items-start gap-2 p-[11px_12px] rounded-[13px] bg-[#FEF2F2]">
                          <AlertTriangle size={15} strokeWidth={2.1} className="text-[#DC2626] shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[12px] text-[#B91C1C]">
                              Revision requested by brand
                            </div>
                            <div className="mt-1 font-normal text-[11px] leading-[1.45] text-[#991B1B]">
                              “{order.revisionNotes}”
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {/* Revision Timer Box */}
                      <div className="mt-2.5">
                        <UGCTimerRing deadline={order.deadline} totalHours={orderWindowHours(order)} />
                      </div>

                      {/* Re-upload revision button */}
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setActiveView("workspace");
                        }}
                        className="mt-2.5 h-[44px] rounded-[13px] bg-[#7C3AED] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <span className="font-semibold text-[13px] text-white">Re-upload revision</span>
                        <span className="h-[20px] px-2 rounded-[7px] bg-white/20 flex items-center font-semibold text-[10.5px] text-white">
                          {order.revisionsLeft} revision{order.revisionsLeft === 1 ? "" : "s"} left
                        </span>
                      </button>
                    </div>
                  );
                }

                // Card C: In Review / Delivered (Brand Review)
                if (order.stage === "IN_REVIEW") {
                  return (
                    <div
                      key={order.id}
                      onClick={() => {
                        setSelectedOrder(order);
                        setActiveView("workspace");
                      }}
                      className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] shadow-xs flex flex-col cursor-pointer hover:border-[#7C3AED] transition-colors"
                    >
                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                            {order.title}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-[20px] px-2 rounded-[6px] bg-[#EEF2FF] flex items-center gap-1 text-[#4F46E5] font-semibold text-[10px]">
                              <Clock size={10} strokeWidth={2.4} />
                              <span>Brand review in progress</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A]">
                            {formatCurrency(order.payout)}
                          </div>
                          <ChevronRight size={16} className="text-[#C4C4CC]" />
                        </div>
                      </div>
                    </div>
                  );
                }

                // Card D: Completed & Payment Cleared (Spec 02)
                return (
                  <div
                    key={order.id}
                    onClick={() => {
                      setSelectedOrder(order);
                      setActiveView("workspace");
                    }}
                    className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] flex items-center gap-[11px] shadow-xs cursor-pointer hover:border-[#059669] transition-colors"
                  >
                    <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                        {order.title}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-[20px] px-2 rounded-[6px] bg-[#ECFDF5] flex items-center gap-1 text-[#059669] font-semibold text-[10px]">
                          <Check size={10} strokeWidth={3} />
                          <span>Payment cleared</span>
                        </div>
                        {order.realUtr ? (
                          <span className="font-mono font-medium text-[10px] text-[#059669] bg-[#ECFDF5] px-1.5 py-0.5 rounded">
                            UTR: {order.realUtr}
                          </span>
                        ) : (
                          <span className="font-normal text-[10px] text-[#9CA3AF]">
                            Disbursed to bank
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="font-bold text-[15px] tracking-[-0.3px] text-[#059669]">
                        {formatCurrency(order.payout)}
                      </div>
                      <ChevronRight size={16} className="text-[#C4C4CC]" />
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* Sort Sheet Modal */}
      <Presence>{showSortSheet && (
        <PopupBackdrop className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs">
          <PopupPanel kind="sheet" onClose={() => setShowSortSheet(false)} className="w-full max-w-md bg-white rounded-t-[24px] p-5 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#F1F1F5]">
              <span className="font-bold text-[15px] text-[#0A0A0A]">Sort UGC Briefs</span>
              <button
                onClick={() => setShowSortSheet(false)}
                className="text-xs font-bold text-[#6B7280] p-1 cursor-pointer"
              >
                Close
              </button>
            </div>

            {[
              { id: "payout", label: "Highest payout" },
              { id: "newest", label: "Newest briefs" }
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSortOption(s.id);
                  setShowSortSheet(false);
                }}
                className={`w-full h-11 px-4 rounded-[12px] flex items-center justify-between text-[13.5px] font-semibold transition-colors cursor-pointer ${
                  sortOption === s.id
                    ? "bg-[#F5F0FF] text-[#7C3AED]"
                    : "bg-[#FBFBFD] text-[#374151] hover:bg-[#F2F2F7]"
                }`}
              >
                <span>{s.label}</span>
                {sortOption === s.id && <Check size={16} strokeWidth={2.5} />}
              </button>
            ))}
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </div>
  );
}

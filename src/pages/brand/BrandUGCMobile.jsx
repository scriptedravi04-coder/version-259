import React, { useState, useEffect, useMemo, useRef } from "react";
import { APPROVE_NOTICE, retentionLine } from "../../lib/fileRetention";
import PayConsentLine from "../../components/legal/PayConsentLine";
import BriefRefundStatus from "../../components/brand/BriefRefundStatus";
import BriefSafetyExplainer, { useBriefExplainer, HowItWorksLink } from "../../components/ugc/BriefSafetyExplainer";
import CreatorCard from "../../components/ugc/CreatorCard";
import { orderWindowHours } from "../../utils/ugcTerms";
import { formatAmount } from "../../utils/safeFormat";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { processRazorpayPayment } from "../../lib/razorpay";
import { getPaidBriefOrder, savePaidBriefOrder, clearPaidBriefOrder, FINAL_ORDER_CODES, goToPostedBriefs, watchPaidOrder, checkBriefOrderPaid } from "../../lib/briefPaymentRetry";
import { DELIVERY_OPTIONS, DEFAULT_DELIVERY_HOURS, deliveryHoursOf } from "../../utils/ugcTerms";
import { Lightbulb, 
  Video, CheckCircle2, Clock, PlayCircle, Star, MessageCircle, AlertTriangle, 
  ShieldCheck, ArrowRight, RefreshCw, User, Check, X, Search, 
  Filter, Plus, ExternalLink, RotateCcw, Lock, Zap, ChevronRight, ChevronLeft, AlertCircle, Eye, Share2, Camera, Film, 
  Download, Maximize2, FileText, Send, Info
} from "lucide-react";
import { toast } from "sonner";
import OrderSupportModal from "../../components/chat/OrderSupportModal";
import { BrandBriefListSkeleton, UGCOrderListSkeleton } from "../../components/common/MobileSkeletons";
import { mediaHref } from "../../lib/mediaUrl";
import { ignored } from "../../utils/ignored";
import CancelBriefModal from "../../components/brand/CancelBriefModal";
import BrandCancelOrderModal, { BrandCancelOrderButton } from "../../components/ugc/BrandCancelOrderModal";
import { draftGet, draftRemove, draftSet } from "../../lib/userDraft";

import { Presence } from "../../components/common/Popup";
import BrandLogo from "../../components/common/BrandLogo";
import { resolveMediaUrl, YbexWatermarkOverlay } from "../../components/shared/VideoEmbedPreview";

/** Session 43: an uploaded draft (storage path or direct video file) plays inline; share links
 *  from Drive / Dropbox / OneDrive can't be played here and keep their "open" button. */
export function isPlayableDeliverable(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (/drive\.google|dropbox\.com|1drv\.ms|onedrive|wetransfer|icloud\.com/i.test(u)) return false;
  if (!/^https?:/i.test(u)) return true; // our own storage path
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(u) || /\/(storage|media|api\/media)\//i.test(u);
}
// SLA Calculation helper
// totalHours = the order's own first-draft window (24/48/72h), not a fixed 24h.
function getSlaTimeLeft(deadline, totalHours = 24) {
  if (!deadline) return { text: "Deadline pending", isUrgent: false, percent: 100 };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: "SLA Exceeded", isUrgent: true, percent: 0 };
  const totalSlaMs = totalHours * 60 * 60 * 1000;
  const percent = Math.max(0, Math.min(100, (diff / totalSlaMs) * 100));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return {
    text: `${hours}h ${minutes}m left`,
    isUrgent: diff < 6 * 60 * 60 * 1000,
    percent
  };
}

// Format Label Helper
function getFormatLabel(type) {
  const dt = String(type || "").toLowerCase();
  if (dt === 'ugc_video_raw' || dt === 'ugc_raw_video' || dt.includes('raw')) return 'UGC Raw';
  if (dt === 'ugc_video_edited' || dt === 'ugc_video' || dt.includes('edited')) return 'UGC Edited';
  if (dt === 'collaboration_reel' || dt.includes('collab') || dt.includes('reel')) return 'Collaboration Video';
  return 'Collaboration Video';
}

// Minimum budget calculation
function getMinBudget(type) {
  const isProd = typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && 
    !window.location.hostname.includes('run.app');
  if (!isProd) return 1;
  switch (type) {
    case 'ugc_video_raw': return 1500;
    case 'ugc_video_edited': return 2500;
    case 'collaboration_reel': return 2000;
    default: return 2000;
  }
}

const SUGGESTED_DOS = [
  "Show product texture clearly in natural daylight",
  "Include strong hook in the first 3 seconds",
  "Demonstrate product in actual daily use",
  "Include clear call-to-action (where to buy)",
  "Highlight unboxing & key benefits"
];

const SUGGESTED_DONTS = [
  "Do not mention competitor brand names or prices",
  "Do not use heavy artificial beauty filters",
  "Avoid noisy background or distracting clutter",
  "Do not show damaged shipping boxes",
  "Do not publish without prior brand review approval"
];

export default function BrandUGCMobile({ initialTab = "briefs", initialView = "main" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Primary State
  const [activeTab, setActiveTab] = useState(initialTab); // 'briefs' | 'orders'
  const [view, setView] = useState(initialView); // 'main' | 'post' | 'order-detail'
  
  // Data State
  const [briefs, setBriefs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filters
  const [searchOpen, setSearchOpen] = useState(false);
  const [briefSearch, setBriefSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("all"); // 'all' | 'review' | 'in_progress' | 'done'

  // Selected Order for Detail View
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // FAB Menu State (Screen 01b)
  const [fabOpen, setFabOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // Post Brief Wizard State (Screens 03-07)
  const [postStep, setPostStep] = useState(1);
  const [postData, setPostData] = useState({
    title: "",
    product_name: "",
    product_description: "",
    detailed_requirements: "",
    product_url: "",
    sample_content_url: "",
    deliverable_type: "collaboration_reel",
    video_duration: "30s",
    budget: 2000,
    max_creators: 1,
    delivery_hours: DEFAULT_DELIVERY_HOURS,
    dos: [],
    donts: []
  });

  // Modals & Bottom Sheets
  const [showLivePreview, setShowLivePreview] = useState(false); // Screen 08
  // Session 24: "Your money stays safe" — first time the brand opens the post flow.
  const [explainerOpen, openExplainer, closeExplainer, explainerReopened] = useBriefExplainer(user?.user_id, view === "post");
  const [showApprovedModal, setShowApprovedModal] = useState(false); // Screen 11
  const [approvedOrderData, setApprovedOrderData] = useState(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [approvingOrder, setApprovingOrder] = useState(false);
  const [showApplicantsSheet, setShowApplicantsSheet] = useState(false);
  const [activeBriefForApplicants, setActiveBriefForApplicants] = useState(null);
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showCancelOrder, setShowCancelOrder] = useState(false); // session 25: brand cancels one order
  const [selectedBriefForCancel, setSelectedBriefForCancel] = useState(null);

  // Check LocalStorage for draft on mount & auto-restore if in post view
  useEffect(() => {
    try {
      const draft = draftGet("ugc_draft");
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed) {
          const loaded = parsed.formData || parsed;
          if (loaded && (loaded.title || loaded.product_name || loaded.deliverable_type)) {
            setHasDraft(true);
            if (initialView === "post") {
              setPostData(prev => ({
                ...prev,
                ...loaded,
                dos: Array.isArray(loaded.dos) ? loaded.dos : [],
                donts: Array.isArray(loaded.donts) ? loaded.donts : []
              }));
              if (parsed.step) {
                setPostStep(parsed.step);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [initialView]);

  // Sync draft to LocalStorage
  useEffect(() => {
    if (view === "post" && (postData.title || postData.product_name || postStep > 1)) {
      try {
        draftSet("ugc_draft", JSON.stringify({
          formData: postData,
          step: postStep,
          updated_at: Date.now()
        }));
        setHasDraft(true);
      } catch (e) { ignored("BrandUGCMobile:174", e); }
    }
  }, [postData, postStep, view]);

  // Fetch Briefs and Orders from real APIs
  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [briefsRes, ordersRes] = await Promise.allSettled([
        api.get("ugc/briefs/my"),
        api.get("ugc/orders/brand")
      ]);

      if (briefsRes.status === "fulfilled") {
        setBriefs(briefsRes.value?.data || []);
      }
      if (ordersRes.status === "fulfilled") {
        const rawOrders = ordersRes.value?.data?.orders || ordersRes.value?.data || [];
        setOrders(Array.isArray(rawOrders) ? rawOrders : []);
      }
    } catch (err) {
      console.error("Error fetching mobile UGC data:", err);
      toast.error("Failed to load UGC data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Keep selected order synchronized with orders list
  useEffect(() => {
    if (selectedOrderId && orders.length > 0) {
      const found = orders.find(o => String(o.id) === String(selectedOrderId));
      if (found) setSelectedOrder(found);
    }
  }, [selectedOrderId, orders]);

  // Filtered Briefs
  const filteredBriefs = useMemo(() => {
    if (!briefSearch.trim()) return briefs;
    const q = briefSearch.toLowerCase();
    return briefs.filter(b => 
      (b.title || "").toLowerCase().includes(q) ||
      (b.product_name || "").toLowerCase().includes(q)
    );
  }, [briefs, briefSearch]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Stage mapping
      const stage = (o.stage || o.status || "").toUpperCase();
      if (orderFilter === "review" && stage !== "IN_REVIEW" && stage !== "SUBMITTED" && stage !== "REVISION_DECLINED") return false;
      if (orderFilter === "in_progress" && stage !== "IN_PROGRESS" && stage !== "ACCEPTED") return false;
      if (orderFilter === "done" && stage !== "COMPLETED" && stage !== "PAID") return false;

      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        const matches = 
          (o.title || o.campaign_title || "").toLowerCase().includes(q) ||
          (o.creator_name || o.creatorName || "").toLowerCase().includes(q) ||
          (o.order_number || o.id || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [orders, orderFilter, orderSearch]);

  // Handle Resume Draft
  const handleResumeDraft = () => {
    try {
      const draft = draftGet("ugc_draft");
      if (draft) {
        const parsed = JSON.parse(draft);
        const loaded = parsed.formData || parsed;
        setPostData(prev => ({
          ...prev,
          ...loaded,
          dos: Array.isArray(loaded.dos) ? loaded.dos : [],
          donts: Array.isArray(loaded.donts) ? loaded.donts : []
        }));
        if (parsed.step) {
          setPostStep(parsed.step);
        }
        toast.success("Resumed saved draft");
      }
    } catch (e) {
      console.error(e);
    }
    setFabOpen(false);
    setView("post");
  };

  // Handle New Brief Start
  const handleStartNewBrief = () => {
    draftRemove("ugc_draft");
    setHasDraft(false);
    setPostData({
      title: "",
      product_name: "",
      product_description: "",
      detailed_requirements: "",
      product_url: "",
      sample_content_url: "",
      deliverable_type: "collaboration_reel",
      video_duration: "30s",
      budget: getMinBudget("collaboration_reel"),
      max_creators: 1,
      delivery_hours: DEFAULT_DELIVERY_HOURS,
      dos: [],
      donts: []
    });
    setPostStep(1);
    setFabOpen(false);
    setView("post");
  };

  // AI Brief Generator / Enhancer
  const handleGenerateWithAi = async (customPrompt = "") => {
    setAiGenerating(true);
    toast.loading("Generating high-converting UGC brief with AI...", { id: "ai-brief" });
    try {
      const res = await api.post("/ugc/ai-generate-brief", {
        product_name: postData.product_name || customPrompt || "D2C Product",
        focus_area: customPrompt || "Authentic viral conversion",
        current_title: postData.title,
        current_requirements: postData.detailed_requirements
      });

      if (res.data?.ok && res.data?.data) {
        const ai = res.data.data;
        setPostData(prev => ({
          ...prev,
          title: ai.title || prev.title,
          product_name: prev.product_name || ai.product_name || prev.product_name,
          product_description: ai.product_description || prev.product_description,
          detailed_requirements: ai.detailed_requirements || prev.detailed_requirements,
          dos: Array.isArray(ai.dos) && ai.dos.length > 0 ? ai.dos : prev.dos,
          donts: Array.isArray(ai.donts) && ai.donts.length > 0 ? ai.donts : prev.donts,
          deliverable_type: ai.recommended_format || prev.deliverable_type,
          video_duration: ai.recommended_duration || prev.video_duration
        }));
        toast.success("AI brief generated! Review and tweak below.", { id: "ai-brief" });
        setShowAiAssist(false);
      } else {
        toast.error("AI response format error, please try again.", { id: "ai-brief" });
      }
    } catch (err) {
      console.error("AI Generation error:", err);
      toast.error("Could not reach AI generator. Default template applied.", { id: "ai-brief" });
    } finally {
      setAiGenerating(false);
    }
  };

  const postingRef = React.useRef(false);
  const stopWatchRef = React.useRef(null);
  React.useEffect(() => () => { if (stopWatchRef.current) stopWatchRef.current(); }, []);

  // Submit Brief and Process Payment (Step 5 -> Screen 08 -> Pay)
  // Posts the brief against a PAID order. Returns true when the brief exists.
  const postBriefWithOrder = async (orderId, paymentId, finalBudget, totalEscrow) => {
    // Session 26: one post per payment even if the checkout callback and the safety net both fire.
    if (postingRef.current) return false;
    postingRef.current = true;
    if (stopWatchRef.current) { stopWatchRef.current(); stopWatchRef.current = null; }
    const cleanDos = (postData.dos || []).filter(d => typeof d === 'string' && d.trim().length > 0);
    const cleanDonts = (postData.donts || []).filter(d => typeof d === 'string' && d.trim().length > 0);
    toast.loading("Securing brief & placing funds in secure payment hold...", { id: "ugc-pay" });
    try {
      await api.post("ugc/briefs", {
        ...postData,
        title: postData.title || `Review of ${postData.product_name || "Product"}`,
        dos: cleanDos,
        donts: cleanDonts,
        budget: finalBudget,
        total_budget: totalEscrow,
        // The server creates the brief only against this PAID order — no invented payment id.
        razorpay_order_id: orderId || null,
        payment_id: paymentId || null
      });
      clearPaidBriefOrder();
      draftRemove("ugc_draft");
      setHasDraft(false);
      toast.success("Brief posted successfully! Certified creators notified.", { id: "ugc-pay" });
      setView("main");
      setActiveTab("briefs");
      fetchData();
      // Session 31: move the URL to My Briefs too (it stayed on /brand/ugc/post, so the checkout's
      // "back" or a refresh showed an empty Create brief form).
      if (location.pathname.startsWith("/brand/ugc/post")) goToPostedBriefs(navigate);
      return true;
    } catch (err) {
      postingRef.current = false;
      console.error("Failed to save brief after payment:", err);
      const code = err?.response?.data?.code;
      if (FINAL_ORDER_CODES.includes(code)) {
        clearPaidBriefOrder();
        toast.error(`${err?.response?.data?.error || "This payment can't be used for the brief."} Contact support if you were charged.`, { id: "ugc-pay", duration: 10000 });
      } else {
        savePaidBriefOrder(orderId, totalEscrow);
        toast.error("Payment received, but the brief couldn't be saved. Tap “Secure brief & pay” again to retry — you won't be charged again.", { id: "ugc-pay", duration: 10000 });
      }
      return false;
    }
  };

  const handleProceedPayment = async () => {
    const minBudget = getMinBudget(postData.deliverable_type);
    const finalBudget = Math.max(postData.budget, minBudget);
    const totalEscrow = finalBudget * postData.max_creators;

    setShowLivePreview(false);

    // Already paid on this device but the brief wasn't saved → post it, don't charge again.
    const paid = getPaidBriefOrder();
    if (paid) {
      await postBriefWithOrder(paid.order_id, null, finalBudget, totalEscrow);
      return;
    }

    toast.loading("Opening secure secure payment hold checkout...", { id: "ugc-pay" });
    postingRef.current = false;

    try {
      await processRazorpayPayment({
        onOrderCreated: (orderId) => {
          // Safety net: payment done but the success callback never came → post anyway.
          stopWatchRef.current = watchPaidOrder(checkBriefOrderPaid, orderId, (paidId) => {
            savePaidBriefOrder(paidId, totalEscrow);
            postBriefWithOrder(paidId, null, finalBudget, totalEscrow);
          });
        },
        grossAmount: totalEscrow,
        amount: totalEscrow,
        description: `Ybex UGC Secure payment hold: ${postData.title || postData.product_name || "Brief"}`,
        notes: {
          product_name: postData.product_name,
          format: postData.deliverable_type,
          creators: postData.max_creators
        },
        user: {
          name: user?.name || user?.company_name || "Brand Partner",
          email: user?.email || "",
          phone: user?.phone || ""
        },
        onSuccess: async (paymentData) => {
          const orderId = paymentData?.order_id || paymentData?.razorpay_order_id || null;
          // Keep it before posting, so a crash or closed tab can still recover it.
          savePaidBriefOrder(orderId, totalEscrow);
          await postBriefWithOrder(orderId, paymentData?.razorpay_payment_id || paymentData?.payment_id || null, finalBudget, totalEscrow);
        },
        onError: (err) => {
          toast.error(err?.message || "Payment cancelled or failed", { id: "ugc-pay" });
        }
      });
    } catch (e) {
      console.error(e);
      toast.error("Payment initialization failed", { id: "ugc-pay" });
    }
  };

  // Approve Order (draft or live link escrow release)
  const handleApproveOrder = async (orderId, action = null) => {
    if (approvingOrder) return;
    const isDraft = action === 'approve_draft';
    // A final approval releases the creator's payout from escrow — ask first (session 23).
    if (!isDraft && typeof window !== "undefined" && !window.confirm(`Approve and release the payment from the secure payment hold to the creator? This can't be undone.\n\n${APPROVE_NOTICE}`)) {
      return;
    }
    setApprovingOrder(true);
    toast.loading(isDraft ? "Approving video draft..." : "Releasing secure payment hold payout to creator...", { id: "ugc-approve" });
    try {
      const payload = action ? { action } : {};
      const res = await api.post(`/ugc/orders/${orderId}/approve`, payload);
      if (isDraft || res.data?.message?.includes("Awaiting live links")) {
        toast.success("Video draft approved! Creator notified to post live link.", { id: "ugc-approve" });
      } else {
        toast.success("Payout released! Order completed.", { id: "ugc-approve" });
        setApprovedOrderData(selectedOrder);
        setShowApprovedModal(true);
      }
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || "Failed to approve order", { id: "ugc-approve" });
    } finally {
      setApprovingOrder(false);
    }
  };

  // Submit Revision
  const handleSubmitRevision = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    if (!revisionNotes.trim()) {
      toast.error("Please enter revision instructions.");
      return;
    }

    setSubmittingRevision(true);
    toast.loading("Sending revision request...", { id: "ugc-rev" });
    try {
      // Same rule as desktop BrandUGCOrders: in the live-link stage this is a LINK correction,
      // not a draft revision. Without the action the server spent a draft revision and asked
      // the creator to re-upload a video the brand had already approved (session 23).
      const st = String(selectedOrder.brand_status || selectedOrder.stage || selectedOrder.status || "").toUpperCase();
      const fl = String(selectedOrder.flow_state || selectedOrder.thread_flow_state || "").toUpperCase();
      const isLiveLinkStage =
        ["LIVE_LINK_SUBMITTED", "PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "AWAITING_LIVE_LINK", "REVISION_REQUESTED_LINKS"].includes(st) ||
        fl === "PROOF_SUBMITTED";
      await api.post(`/ugc/orders/${selectedOrder.id}/revision`, {
        notes: revisionNotes.trim(),
        ...(isLiveLinkStage ? { action: "reject_live_links" } : {})
      });
      toast.success("Revision requested! Creator notified.", { id: "ugc-rev" });
      setShowRevisionModal(false);
      setRevisionNotes("");
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || "Failed to submit revision", { id: "ugc-rev" });
    } finally {
      setSubmittingRevision(false);
    }
  };

  // ----------------------------------------------------
  // RENDER: SUB-VIEWS
  // ----------------------------------------------------

  // SCREEN 10: Order Detail View
  if (view === "order-detail" && selectedOrder) {
    const rawStatus = (selectedOrder.brand_status || selectedOrder.stage || selectedOrder.status || "IN_PROGRESS").toUpperCase();
    const thrFlow = (selectedOrder.flow_state || selectedOrder.thread_flow_state || selectedOrder.thread_status || '').toUpperCase();
    const isLiveLinkRevision = rawStatus === 'REVISION_REQUESTED_LINKS' || thrFlow === 'REVISION_REQUESTED_LINKS';
    const isLiveLinkDeclined = rawStatus === 'REVISION_DECLINED_LINKS' || thrFlow === 'REVISION_DECLINED_LINKS';
    const liveLink = selectedOrder.live_link || (Array.isArray(selectedOrder.live_links) ? selectedOrder.live_links[0] : selectedOrder.live_links) || (selectedOrder.proof && (selectedOrder.proof.live_link || selectedOrder.proof.link)) || null;
    const deliverableType = String(selectedOrder.deliverable_type || selectedOrder.brief?.deliverable_type || "collaboration_reel").toLowerCase();
    const isCollabOrder = selectedOrder.requires_live_link !== undefined
      ? Boolean(selectedOrder.requires_live_link)
      : (selectedOrder.is_collaboration !== undefined
        ? Boolean(selectedOrder.is_collaboration)
        : (!deliverableType.includes('raw') && !deliverableType.includes('edited') && !deliverableType.startsWith('ugc_video')));

    const hasLiveLink = isCollabOrder && Boolean(liveLink || selectedOrder.live_links_submitted);
    const isContentApproved = isCollabOrder && (Boolean(selectedOrder.draft_approved_at) || rawStatus === 'CONTENT_APPROVED' || rawStatus === 'COMPLETED_APPROVAL' || rawStatus === 'AWAITING_LIVE_LINK' || thrFlow === 'CONTENT_APPROVED' || selectedOrder.content_approved === true || selectedOrder.isApproved === true || isLiveLinkRevision || isLiveLinkDeclined);
    const isLiveLinkSubmitted = isCollabOrder && !isLiveLinkRevision && !isLiveLinkDeclined && Boolean(hasLiveLink || rawStatus === 'PROOF_SUBMITTED' || rawStatus === 'LIVE_LINK_SUBMITTED' || rawStatus === 'LINKS_UNDER_REVIEW' || thrFlow === 'PROOF_SUBMITTED');
    const isAwaitingLiveLink = isCollabOrder && isContentApproved && !isLiveLinkSubmitted && !isLiveLinkRevision && !isLiveLinkDeclined;
    const isCompleted = rawStatus === "COMPLETED" || rawStatus === "PAID" || rawStatus === "RELEASED" || thrFlow === "COMPLETED" || Boolean(selectedOrder.utr_number || selectedOrder.utrNumber) || (!isCollabOrder && (Boolean(selectedOrder.draft_approved_at) || rawStatus === 'CONTENT_APPROVED' || selectedOrder.content_approved === true));
    const isInReview = !isCompleted && !isAwaitingLiveLink && !isLiveLinkSubmitted && !isLiveLinkRevision && (rawStatus === "IN_REVIEW" || rawStatus === "SUBMITTED" || rawStatus === "CONTENT_SUBMITTED" || rawStatus === "DELIVERED" || selectedOrder.submission_link || selectedOrder.video_url);

    const sla = getSlaTimeLeft(selectedOrder.deadline || selectedOrder.sla_deadline, orderWindowHours(selectedOrder));
    // Server amounts only — this figure is shown in the "release payout" confirmation.
    const amount = Number(selectedOrder.amount || selectedOrder.agreed_amount || selectedOrder.creator_payout || selectedOrder.budget || 0);
    const orderNumber = selectedOrder.order_number || selectedOrder.orderNumber || `#ORD-${String(selectedOrder.id).slice(-6).toUpperCase()}`;
    const deliverableUrl = selectedOrder.deliverable_url || selectedOrder.submission_url || selectedOrder.video_url || selectedOrder.submission_link;

    return (
      <div className="min-h-screen bg-[#F2F2F7] text-[#0A0A0A] font-['DM_Sans'] pb-28 relative">
        {/* Top App Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E5EA] px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setSelectedOrderId(null);
                setView("main");
                setActiveTab("orders");
              }}
              className="w-9 h-9 rounded-full bg-[#F2F2F7] active:bg-[#E5E5EA] flex items-center justify-center text-[#0A0A0A] transition-all cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6D28D9] bg-[#F1E8FF] px-2 py-0.5 rounded-md">
                  {orderNumber}
                </span>
              </div>
              <h2 className="text-sm font-bold text-[#0A0A0A] line-clamp-1 max-w-[200px]">
                {selectedOrder.title || selectedOrder.campaign_title || "UGC Order"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSupportModal(true)}
              className="w-9 h-9 rounded-full bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center active:scale-95 transition-all shadow-xs cursor-pointer"
              title="Open Chat"
            >
              <MessageCircle size={18} />
            </button>
          </div>
        </header>

        <div className="p-4 space-y-4">
          {/* Progress Stage Tracker (4 steps) */}
          <div className="bg-white rounded-[20px] p-4 border border-[#E5E5EA] shadow-xs">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                {isCompleted ? "Order Completed" : isLiveLinkSubmitted ? "Live Post Review" : isAwaitingLiveLink ? "Draft Approved • Waiting for Live Link" : isInReview ? "Draft Video Review" : "In Production"}
              </span>
              <span className="text-[11px] font-bold text-[#7C3AED]">
                {isCompleted ? "Step 4 of 4" : isLiveLinkSubmitted ? "Step 3 of 4" : isAwaitingLiveLink ? "Step 2 of 4" : isInReview ? "Step 2 of 4" : "Step 1 of 4"}
              </span>
            </div>
            
            {/* 4 Steps progress bar */}
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              <div className={`h-1.5 rounded-full ${rawStatus !== 'CANCELLED' ? 'bg-[#7C3AED]' : 'bg-gray-200'}`} />
              <div className={`h-1.5 rounded-full ${isInReview || isAwaitingLiveLink || isLiveLinkSubmitted || isCompleted ? 'bg-[#7C3AED]' : 'bg-[#E5E5EA]'}`} />
              <div className={`h-1.5 rounded-full ${isLiveLinkSubmitted || isCompleted ? 'bg-[#7C3AED]' : 'bg-[#E5E5EA]'}`} />
              <div className={`h-1.5 rounded-full ${isCompleted ? 'bg-[#10B981]' : 'bg-[#E5E5EA]'}`} />
            </div>

            <div className="flex justify-between text-[9.5px] font-bold text-[#9CA3AF] uppercase tracking-wider">
              <span className="text-[#7C3AED]">Draft</span>
              <span className={isInReview || isAwaitingLiveLink || isLiveLinkSubmitted || isCompleted ? "text-[#7C3AED]" : ""}>Approve</span>
              <span className={isLiveLinkSubmitted || isCompleted ? "text-[#7C3AED]" : ""}>Live Link</span>
              <span className={isCompleted ? "text-[#10B981]" : ""}>Payout</span>
            </div>
          </div>

          {/* Creator Info Card — session 24 designed card (real stats only) */}
          <CreatorCard
            variant="mobile"
            creatorId={selectedOrder.creator_id || selectedOrder.creator_user_id}
            name={selectedOrder.creator_name || selectedOrder.creatorName}
            avatar={selectedOrder.creator_avatar}
            status={`Held with Ybex SafePay · ₹${amount.toLocaleString()}`}
            onChat={() => navigate(`/brand/inbox?thread=${selectedOrder.thread_id || selectedOrder.id}`)}
          />
          <button
            onClick={() => setShowSupportModal(true)}
            className="-mt-1 self-start text-[12px] font-semibold text-[#6B7280] underline underline-offset-2"
          >
            Need help with this order?
          </button>

          {/* SLA Countdown Banner */}
          <div className="bg-white rounded-[20px] p-4 border border-[#E5E5EA] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A0A0A]">
                <Clock size={15} className="text-[#7C3AED]" />
                <span>Time left for the draft</span>
              </div>
              <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                sla.isUrgent ? 'bg-rose-50 text-rose-600 border border-rose-200 animate-pulse' : 'bg-[#F1E8FF] text-[#6D28D9]'
              }`}>
                {sla.text}
              </span>
            </div>
            <div className="w-full bg-[#E5E5EA] h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${sla.isUrgent ? 'bg-rose-500' : 'bg-[#7C3AED]'}`}
                style={{ width: `${sla.percent}%` }}
              />
            </div>
          </div>

          {/* Session 25 (rule 52): cancel one order — only 24h+ after the claim, no draft, no fee. */}
          {!isInReview && !isCompleted && !isAwaitingLiveLink && !isLiveLinkSubmitted && (
            <BrandCancelOrderButton order={selectedOrder} onOpen={() => setShowCancelOrder(true)} />
          )}
          <Presence>{showCancelOrder && (
            <BrandCancelOrderModal key="brandcancelordermodal"
              mobile
              order={selectedOrder}
              amount={selectedOrder.brief?.budget || amount}
              onClose={() => setShowCancelOrder(false)}
              onCancelled={() => {
                setShowCancelOrder(false);
                setSelectedOrderId(null);
                setView("main");
                setActiveTab("orders");
                fetchData(true);
              }}
            />
          )}</Presence>

          {/* Deliverable Video Preview Card */}
          <div className="bg-white rounded-[20px] p-4 border border-[#E5E5EA] shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#7C3AED] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                  Protected Draft
                </span>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                isCompleted ? 'bg-[#E9F9EF] text-[#16A34A]' : 'bg-[#FEF7E0] text-[#B45309]'
              }`}>
                {isCompleted ? "Approved" : "Unapproved"}
              </span>
            </div>

            {/* Video Player Container */}
            <div className="relative w-full aspect-[9/16] max-h-[380px] bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner group">
              {/* Session 43 (Ravi): the draft was a storage path (not "http…") so the brand got
                  "Open Cloud Link" instead of the video. Any uploaded file now plays here (through
                  the access-checked media proxy), with the Ybex watermark until approval; only a
                  Drive / Dropbox style link still opens outside. */}
              {deliverableUrl && isPlayableDeliverable(deliverableUrl) ? (
                <>
                  <video 
                    src={resolveMediaUrl(deliverableUrl) || mediaHref(deliverableUrl)} 
                    controls 
                    playsInline 
                    preload="metadata"
                    controlsList={isCompleted ? "nodownload" : "nodownload nofullscreen noremoteplayback"}
                    disablePictureInPicture={!isCompleted}
                    className="w-full h-full object-contain"
                    data-testid="brand-ugc-draft-video"
                  />
                  {!isCompleted && <YbexWatermarkOverlay label="Ybex Protected Draft" />}
                </>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto text-white shadow-xl">
                    <PlayCircle size={38} className="text-white fill-white/20" />
                  </div>
                  <div>
                    <h5 className="text-white text-sm font-bold">{deliverableUrl ? "Draft shared as a link" : "No draft yet"}</h5>
                    <p className="text-white/60 text-xs mt-1">Shared as a link — opens outside Ybex</p>
                  </div>
                  {deliverableUrl && (
                    <a 
                      href={deliverableUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-[#7C3AED] text-white px-4 py-2 rounded-xl text-xs font-bold"
                    >
                      <ExternalLink size={13} /> Open link
                    </a>
                  )}
                </div>
              )}

              {/* Watermark Tag Overlay */}
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white/90 text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1">
                <Lock size={10} /> Watermarked Preview
              </div>
            </div>

            {/* Deliverable Metadata */}
            <div className="flex justify-between items-center text-xs text-[#6B7280] pt-1">
              <span>Reel · {selectedOrder.duration || "30s"} · v1</span>
              <span>Submitted recently</span>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] p-4 z-30 shadow-lg space-y-2">
          {!isCompleted ? (
            isLiveLinkRevision ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span>Live link revision requested. Waiting for creator to submit updated link...</span>
                </div>
                <button 
                  onClick={() => setShowSupportModal(true)}
                  className="bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs shrink-0"
                >
                  Chat
                </button>
              </div>
            ) : isAwaitingLiveLink ? (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping shrink-0" />
                  <span>Waiting for live link from creator...</span>
                </div>
                <button 
                  onClick={() => setShowSupportModal(true)}
                  className="bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs shrink-0"
                >
                  Chat
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowRevisionModal(true)}
                  className="flex-1 bg-[#FEF7E0] hover:bg-[#FDE68A] text-[#92400E] border border-[#F7E3AE] font-bold py-3.5 px-4 rounded-xl text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={14} /> Request Revision
                </button>

                {isCollabOrder && !isLiveLinkSubmitted ? (
                  <button 
                    disabled={approvingOrder}
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to approve this video draft? The creator will be notified to publish the post and submit their live link.\n\n${APPROVE_NOTICE}`)) {
                        handleApproveOrder(selectedOrder.id, 'approve_draft');
                      }
                    }}
                    className="flex-1 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold py-3.5 px-4 rounded-xl text-xs active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {approvingOrder ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Check size={16} strokeWidth={3} /> Approve Video Draft
                      </>
                    )}
                  </button>
                ) : (
                  <button 
                    disabled={approvingOrder}
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to approve and release the secure payment hold payout of ₹${amount.toLocaleString()} to ${selectedOrder.creator_name || selectedOrder.creatorName || "the creator"}? This action cannot be reversed.\n\n${APPROVE_NOTICE}`)) {
                        handleApproveOrder(selectedOrder.id, isCollabOrder ? 'approve_live_links' : null);
                      }
                    }}
                    className="flex-1 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold py-3.5 px-4 rounded-xl text-xs active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {approvingOrder ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Check size={16} strokeWidth={3} /> Approve & Release ₹{amount.toLocaleString()}
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="flex items-center justify-between p-3 bg-[#E9F9EF] rounded-xl border border-[#BBF7D0] text-[#16A34A]">
              <div className="flex items-center gap-2 text-xs font-bold">
                <CheckCircle2 size={16} />
                <span>Order Approved & Secure Payment Hold Released</span>
              </div>
              {deliverableUrl && (
                <a 
                  href={deliverableUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bg-[#16A34A] text-white px-3 py-1 rounded-lg text-xs font-bold"
                >
                  Download
                </a>
              )}
            </div>
          )}
        </div>

        {/* Revision Modal */}
        <AnimatePresence>
          {showRevisionModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setShowRevisionModal(false)} 
                className="fixed inset-0 bg-black/50 backdrop-blur-xs" 
              />
              <motion.div 
                initial={{ y: "100%" }} 
                animate={{ y: 0 }} 
                exit={{ y: "100%" }} 
                className="relative bg-white w-full max-w-lg rounded-t-[26px] sm:rounded-[26px] p-6 z-10 space-y-4 max-h-[85vh] overflow-y-auto"
              >
                <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-2" />
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-[#0A0A0A]">Request Free Revision</h3>
                  <button onClick={() => setShowRevisionModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-xs text-[#6B7280]">
                  Be specific about required adjustments (e.g. cut length, caption placement, lighting).
                </p>
                <textarea 
                  rows={4}
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="e.g. Please show the texture at 0:08 for 2 more seconds, and update the link CTA overlay."
                  className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-3.5 text-xs text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
                />
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowRevisionModal(false)} 
                    className="flex-1 py-3 bg-[#F2F2F7] rounded-xl text-xs font-bold text-[#0A0A0A]"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={submittingRevision}
                    onClick={handleSubmitRevision}
                    className="flex-1 py-3 bg-[#7C3AED] hover:bg-[#6D28D9] rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-50"
                  >
                    {submittingRevision ? "Submitting..." : "Send Request"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Screen 11: Approved Payout Modal */}
        <AnimatePresence>
          {showApprovedModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }} 
                className="relative bg-white w-full max-w-md rounded-[28px] p-6 z-10 text-center space-y-4 shadow-2xl"
              >
                <div className="w-16 h-16 rounded-full bg-[#E9F9EF] text-[#16A34A] flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 size={36} strokeWidth={2.5} />
                </div>
                
                <div>
                  <h3 className="text-xl font-black text-[#0A0A0A]">Payout Released</h3>
                  <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                    ₹{amount.toLocaleString()} has been sent to {selectedOrder.creator_name || "the creator"}. The watermark-free master file is now unlocked in your assets.
                  </p>
                </div>

                <div className="bg-[#F9F9FB] border border-[#ECECF0] rounded-2xl p-4 text-left space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Deliverable</span>
                    <span className="font-bold text-[#0A0A0A]">Reel · {selectedOrder.duration || "30s"} · Master v1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Released from Payment Hold</span>
                    <span className="font-bold text-[#16A34A]">₹{amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Usage Rights</span>
                    <span className="font-bold text-[#0A0A0A]">Paid Ads & Social · 6 Months</span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  {deliverableUrl && (
                    <a 
                      href={deliverableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      <Download size={14} /> Download Master File
                    </a>
                  )}
                  <button 
                    onClick={() => {
                      setShowApprovedModal(false);
                      setSelectedOrderId(null);
                      setView("main");
                      setActiveTab("orders");
                    }}
                    className="w-full py-3 bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#0A0A0A] rounded-xl font-bold text-xs"
                  >
                    Back to Orders
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Support/Chat Modal */}
        {showSupportModal && (
          <OrderSupportModal 
            isOpen={showSupportModal} 
            onClose={() => setShowSupportModal(false)} 
            orderId={selectedOrder.id} 
          />
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // SCREEN 03 - 07: Post UGC Brief Wizard (Mobile)
  // ----------------------------------------------------
  if (view === "post") {
    const minBudget = getMinBudget(postData.deliverable_type);
    const wordCountDesc = (postData.product_description || "").trim().split(/\s+/).filter(Boolean).length;
    const wordCountReq = (postData.detailed_requirements || "").trim().split(/\s+/).filter(Boolean).length;

    return (
      <div className="min-h-screen bg-[#F2F2F7] text-[#0A0A0A] font-['DM_Sans'] pb-28">
        {/* Post Wizard Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E5EA] px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (postStep > 1) setPostStep(s => s - 1);
                else setView("main");
              }}
              className="w-9 h-9 rounded-full bg-[#F2F2F7] active:bg-[#E5E5EA] flex items-center justify-center text-[#0A0A0A] transition-all cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-sm font-bold text-[#0A0A0A]">Post UGC Brief</h2>
              <p className="text-[10px] text-[#6B7280]">Step {postStep} of 5</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Session 41 (Ravi): icons only — ⓘ how it works, 👁 preview */}
            <button
              type="button"
              onClick={openExplainer}
              aria-label="How it works"
              title="How it works"
              className="w-9 h-9 rounded-full bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            >
              <Info size={17} />
            </button>
            <button 
              type="button"
              onClick={() => setShowLivePreview(true)}
              aria-label="Preview"
              title="Preview"
              className="w-9 h-9 rounded-full bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            >
              <Eye size={17} />
            </button>
          </div>
        </header>
        <BriefSafetyExplainer open={explainerOpen} onClose={closeExplainer} reopened={explainerReopened} />

        {/* 5-Step Stepper Bar */}
        <div className="px-5 py-3 bg-white border-b border-[#E5E5EA] flex items-center justify-between">
          {[1, 2, 3, 4, 5].map(num => (
            <React.Fragment key={num}>
              <div 
                onClick={() => {
                  // Only allow jumping back, not forward past filled steps
                  if (num < postStep) setPostStep(num);
                }}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  postStep === num 
                    ? 'bg-[#7C3AED] text-white shadow-sm ring-2 ring-[#7C3AED]/20' 
                    : postStep > num 
                      ? 'bg-[#10B981] text-white' 
                      : 'bg-[#F2F2F7] text-[#9CA3AF]'
                }`}
              >
                {postStep > num ? <Check size={13} strokeWidth={3} /> : num}
              </div>
              {num < 5 && (
                <div className={`h-0.5 flex-1 mx-1.5 rounded-full ${postStep > num ? 'bg-[#10B981]' : 'bg-[#E5E5EA]'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Wizard Step Content */}
        <div className="p-4 space-y-5">
          {/* STEP 1: Campaign Title & Detailed Requirements */}
          {postStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Campaign Title *
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setShowAiAssist(true)}
                    className="text-[10px] font-bold text-[#7C3AED] flex items-center gap-1 bg-[#F1E8FF] px-2 py-0.5 rounded-md hover:bg-[#E9D5FF] transition-all cursor-pointer"
                  >
                    AI Assist
                  </button>
                </div>

                <input 
                  type="text"
                  placeholder="e.g. Summer Skincare Unboxing & Routine"
                  value={postData.title}
                  onChange={(e) => setPostData({ ...postData, title: e.target.value })}
                  className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-4 py-3 text-xs text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED] transition-colors"
                />

                {/* AI Quick preset tags */}
                <div className="pt-1">
                  <p className="text-[10px] text-[#9CA3AF] mb-1.5 font-bold uppercase tracking-wider">Quick Suggestions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Honest 30s Review", "Routine / How-to", "Unboxing & First Look", "Problem vs Solution"].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPostData({ ...postData, title: `${preset} - ${postData.product_name || "Product"}` })}
                        className="text-[10px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#3F3F46] font-medium px-2.5 py-1 rounded-lg border border-[#E5E5EA]"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Detailed Requirements *
                    </label>
                    <span className={`text-[10px] font-bold ${wordCountReq > 200 ? 'text-rose-500' : 'text-[#9CA3AF]'}`}>
                      {wordCountReq} / 200 words
                    </span>
                  </div>
                  <textarea 
                    rows={4}
                    placeholder="Describe what you expect from the creator: tone, key product benefits to highlight, call to action (Min 10 chars, Max 200 words)..."
                    value={postData.detailed_requirements}
                    onChange={(e) => setPostData({ ...postData, detailed_requirements: e.target.value })}
                    className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-3.5 text-xs text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED] transition-colors"
                  />
                </div>
              </div>

              <button 
                onClick={() => {
                  if (postData.title.trim().length < 5) {
                    toast.error("Campaign Title must be at least 5 characters");
                    return;
                  }
                  if (postData.detailed_requirements.trim().length < 10) {
                    toast.error("Requirements must be at least 10 characters");
                    return;
                  }
                  if (wordCountReq > 200) {
                    toast.error("Requirements exceed 200 words");
                    return;
                  }
                  setPostStep(2);
                }}
                className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Next: Product Info
              </button>
            </div>
          )}

          {/* STEP 2: Product Info */}
          {postStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1.5">
                    Product Name *
                  </label>
                  <input 
                    type="text"
                    placeholder="e.g. Hydrating Barrier Repair Serum"
                    value={postData.product_name}
                    onChange={(e) => setPostData({ ...postData, product_name: e.target.value })}
                    className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-4 py-3 text-xs text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1.5">
                    Sample Content URL (Optional)
                  </label>
                  <input 
                    type="url"
                    placeholder="https://instagram.com/reel/... (Reference Reel)"
                    value={postData.sample_content_url}
                    onChange={(e) => setPostData({ ...postData, sample_content_url: e.target.value })}
                    className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-4 py-3 text-xs text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Product Description *
                    </label>
                    <span className={`text-[10px] font-bold ${wordCountDesc > 100 ? 'text-rose-500' : 'text-[#9CA3AF]'}`}>
                      {wordCountDesc} / 100 words
                    </span>
                  </div>
                  <textarea 
                    rows={3}
                    placeholder="Briefly describe what the product does and why buyers love it..."
                    value={postData.product_description}
                    onChange={(e) => setPostData({ ...postData, product_description: e.target.value })}
                    className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-3.5 text-xs text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPostStep(1)} 
                  className="flex-1 py-4 bg-[#F2F2F7] text-[#0A0A0A] rounded-2xl font-bold text-xs"
                >
                  Back
                </button>
                <button 
                  onClick={() => {
                    if (postData.product_name.trim().length < 2) {
                      toast.error("Product name is required");
                      return;
                    }
                    if (postData.product_description.trim().length < 10) {
                      toast.error("Product description must be at least 10 characters");
                      return;
                    }
                    if (wordCountDesc > 100) {
                      toast.error("Product description exceeds 100 words");
                      return;
                    }
                    setPostStep(3);
                  }} 
                  className="flex-[2] py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
                >
                  Next: Deliverables
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Format, Duration & Rules */}
          {postStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Select Campaign Format
                </label>

                {/* Format selection — Session 41 (Ravi): two boxes side by side, like desktop. */}
                {(() => {
                  const isReel = postData.deliverable_type === "collaboration_reel";
                  const isUgc = String(postData.deliverable_type || "").startsWith("ugc_video");
                  const box = (on) => `relative p-3.5 rounded-2xl border-2 transition-colors cursor-pointer text-left flex flex-col gap-2 min-h-[132px] ${on ? "border-[#7C3AED] bg-[#F8F4FF]" : "border-[#E5E5EA] bg-white"}`;
                  const tick = (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#7C3AED] text-white flex items-center justify-center">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  );
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-2.5" data-testid="ugc-format-grid">
                        <button type="button" className={box(isReel)} onClick={() => setPostData({ ...postData, deliverable_type: "collaboration_reel" })}>
                          {isReel && tick}
                          <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${isReel ? "bg-[#7C3AED] text-white" : "bg-purple-50 text-[#7C3AED]"}`}>
                            <Film size={20} />
                          </span>
                          <span className="text-[13.5px] font-bold text-[#0A0A0A] leading-tight">Collaboration Reel</span>
                          <span className="text-[11px] text-[#6B7280] leading-snug">Posted on the creator's Instagram with your brand tag.</span>
                        </button>
                        <button type="button" className={box(isUgc)} onClick={() => { if (!isUgc) setPostData({ ...postData, deliverable_type: "ugc_video_edited" }); }}>
                          {isUgc && tick}
                          <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${isUgc ? "bg-[#7C3AED] text-white" : "bg-blue-50 text-blue-600"}`}>
                            <Camera size={20} />
                          </span>
                          <span className="text-[13.5px] font-bold text-[#0A0A0A] leading-tight">UGC Video</span>
                          <span className="text-[11px] text-[#6B7280] leading-snug">Files via Google Drive. You review before payout.</span>
                        </button>
                      </div>

                      {isUgc && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPostData({ ...postData, deliverable_type: "ugc_video_raw" })}
                            className={`py-2 rounded-xl text-xs font-bold border transition-colors ${postData.deliverable_type === "ugc_video_raw" ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-white text-[#6B7280] border-[#E5E5EA]"}`}
                          >
                            Completely Raw
                          </button>
                          <button
                            type="button"
                            onClick={() => setPostData({ ...postData, deliverable_type: "ugc_video_edited" })}
                            className={`py-2 rounded-xl text-xs font-bold border transition-colors ${postData.deliverable_type === "ugc_video_edited" ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-white text-[#6B7280] border-[#E5E5EA]"}`}
                          >
                            Fully Edited
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Duration Pills */}
                {postData.deliverable_type !== 'ugc_video_raw' && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">
                      Video Duration
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {['15s', '30s', '60s', '90s'].map(dur => (
                        <button 
                          key={dur}
                          type="button"
                          onClick={() => setPostData({ ...postData, video_duration: dur })}
                          className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                            postData.video_duration === dur
                              ? 'border-[#7C3AED] bg-[#F1E8FF] text-[#7C3AED]'
                              : 'border-[#E5E5EA] bg-[#F9F9FB] text-[#3F3F46]'
                          }`}
                        >
                          {dur}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rules: Must DO & Must NOT DO */}
                <div className="pt-2 space-y-4">
                  {/* Must Do */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 size={13} /> Must Do
                      </label>
                      <span className="text-[10px] text-gray-400">Creator guidelines</span>
                    </div>

                    {postData.dos?.map((rule, idx) => (
                      <div key={idx} className="flex gap-2 mb-2">
                        <input 
                          type="text"
                          value={rule}
                          placeholder="e.g. Show product texture in natural daylight"
                          onChange={(e) => {
                            const newDos = [...postData.dos];
                            newDos[idx] = e.target.value;
                            setPostData({ ...postData, dos: newDos });
                          }}
                          className="flex-1 bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-3 py-2.5 text-xs text-[#0A0A0A] focus:border-emerald-500 outline-none"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newDos = postData.dos.filter((_, i) => i !== idx);
                            setPostData({ ...postData, dos: newDos });
                          }}
                          className="text-gray-400 hover:text-red-500 px-1 transition-colors"
                          title="Remove rule"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between mb-2">
                      <button 
                        type="button"
                        onClick={() => setPostData({ ...postData, dos: [...(postData.dos || []), ""] })}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                      >
                        + Add Custom Rule
                      </button>
                    </div>

                    {/* Suggestions for Must DO */}
                    <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-2.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                        💡 Suggested Do's (tap to add):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_DOS.map((sug, idx) => {
                          const isAdded = postData.dos?.includes(sug);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                if (isAdded) {
                                  setPostData({
                                    ...postData,
                                    dos: postData.dos.filter(d => d !== sug)
                                  });
                                } else {
                                  const emptyIdx = postData.dos?.findIndex(d => !d.trim());
                                  if (emptyIdx !== -1 && emptyIdx !== undefined) {
                                    const updated = [...postData.dos];
                                    updated[emptyIdx] = sug;
                                    setPostData({ ...postData, dos: updated });
                                  } else {
                                    setPostData({ ...postData, dos: [...(postData.dos || []), sug] });
                                  }
                                }
                              }}
                              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all text-left ${
                                isAdded
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold'
                                  : 'border-dashed border-gray-300 bg-white text-gray-600 hover:border-emerald-400'
                              }`}
                            >
                              {isAdded ? "✓ " : "+ "} {sug}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Must Not Do */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1">
                        <AlertCircle size={13} /> Must Not Do
                      </label>
                      <span className="text-[10px] text-gray-400">Strict restrictions</span>
                    </div>

                    {postData.donts?.map((rule, idx) => (
                      <div key={idx} className="flex gap-2 mb-2">
                        <input 
                          type="text"
                          value={rule}
                          placeholder="e.g. Do not mention competitor brand names"
                          onChange={(e) => {
                            const newDonts = [...postData.donts];
                            newDonts[idx] = e.target.value;
                            setPostData({ ...postData, donts: newDonts });
                          }}
                          className="flex-1 bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-3 py-2.5 text-xs text-[#0A0A0A] focus:border-rose-500 outline-none"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newDonts = postData.donts.filter((_, i) => i !== idx);
                            setPostData({ ...postData, donts: newDonts });
                          }}
                          className="text-gray-400 hover:text-red-500 px-1 transition-colors"
                          title="Remove restriction"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between mb-2">
                      <button 
                        type="button"
                        onClick={() => setPostData({ ...postData, donts: [...(postData.donts || []), ""] })}
                        className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        + Add Custom Restriction
                      </button>
                    </div>

                    {/* Suggestions for Must NOT DO */}
                    <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-2.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                        💡 Suggested Don'ts (tap to add):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_DONTS.map((sug, idx) => {
                          const isAdded = postData.donts?.includes(sug);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                if (isAdded) {
                                  setPostData({
                                    ...postData,
                                    donts: postData.donts.filter(d => d !== sug)
                                  });
                                } else {
                                  const emptyIdx = postData.donts?.findIndex(d => !d.trim());
                                  if (emptyIdx !== -1 && emptyIdx !== undefined) {
                                    const updated = [...postData.donts];
                                    updated[emptyIdx] = sug;
                                    setPostData({ ...postData, donts: updated });
                                  } else {
                                    setPostData({ ...postData, donts: [...(postData.donts || []), sug] });
                                  }
                                }
                              }}
                              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all text-left ${
                                isAdded
                                  ? 'border-rose-500 bg-rose-50 text-rose-700 font-semibold'
                                  : 'border-dashed border-gray-300 bg-white text-gray-600 hover:border-rose-400'
                              }`}
                            >
                              {isAdded ? "✓ " : "+ "} {sug}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPostStep(2)} 
                  className="flex-1 py-4 bg-[#F2F2F7] text-[#0A0A0A] rounded-2xl font-bold text-xs"
                >
                  Back
                </button>
                <button 
                  onClick={() => setPostStep(4)} 
                  className="flex-[2] py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
                >
                  Next: Budget
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Budget & Quantity */}
          {postStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Budget per Video (₹)
                  </label>
                  <span className="text-[10px] font-bold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-full">
                    Min: ₹{minBudget.toLocaleString()}
                  </span>
                </div>

                {/* Editable Manual Input with Currency Sign */}
                <div className="text-center py-2">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-3xl font-black text-[#7C3AED]">₹</span>
                    <input 
                      type="number"
                      min={minBudget}
                      max={500000}
                      value={postData.budget === 0 ? '' : postData.budget}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        setPostData({ ...postData, budget: val });
                      }}
                      onBlur={() => {
                        if (!postData.budget || postData.budget < minBudget) {
                          setPostData({ ...postData, budget: minBudget });
                        }
                      }}
                      placeholder={String(minBudget)}
                      className="text-4xl font-black text-[#0A0A0A] tracking-tight text-center bg-transparent border-b-2 border-dashed border-[#E5E5EA] focus:border-[#7C3AED] outline-none max-w-[200px]"
                    />
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-2">
                    Minimum required for {getFormatLabel(postData.deliverable_type)} is ₹{minBudget.toLocaleString()} (Tap amount to type)
                  </p>
                </div>

                {/* Slider with smooth step */}
                <input 
                  type="range"
                  min={minBudget}
                  max={30000}
                  step={100}
                  value={postData.budget < minBudget ? minBudget : postData.budget}
                  onChange={(e) => setPostData({ ...postData, budget: Math.max(minBudget, Number(e.target.value)) })}
                  className="w-full accent-[#7C3AED]"
                />

                {/* Quick Add Pills */}
                <div className="flex justify-center gap-2 pt-1">
                  {[500, 1000, 2500, 5000].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setPostData({ ...postData, budget: (postData.budget || minBudget) + inc })}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#F2F2F7] text-[#3F3F46] hover:bg-[#E5E5EA] active:scale-95 transition-all cursor-pointer"
                    >
                      +₹{inc.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* Creator Count Selector */}
                <div className="pt-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">
                    Number of Creators Needed
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 5, 10].map(cnt => (
                      <button 
                        key={cnt}
                        type="button"
                        onClick={() => setPostData({ ...postData, max_creators: cnt })}
                        className={`py-2.5 rounded-xl border text-xs font-black transition-all ${
                          postData.max_creators === cnt
                            ? 'border-[#7C3AED] bg-[#F1E8FF] text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-xs'
                            : 'border-[#E5E5EA] bg-[#F9F9FB] text-[#3F3F46]'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Session 24: first-draft deadline the creator gets after claiming */}
                <div className="pt-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">
                    When do you need the video?
                  </label>
                  <div className="grid grid-cols-3 gap-2" data-testid="delivery-hours-picker">
                    {DELIVERY_OPTIONS.map(opt => {
                      const active = deliveryHoursOf(postData.delivery_hours) === opt.hours;
                      return (
                        <button
                          key={opt.hours}
                          type="button"
                          onClick={() => setPostData({ ...postData, delivery_hours: opt.hours })}
                          className={`relative py-2.5 rounded-xl border text-center transition-all ${
                            active
                              ? 'border-[#7C3AED] bg-[#F1E8FF] text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-xs'
                              : 'border-[#E5E5EA] bg-[#F9F9FB] text-[#3F3F46]'
                          }`}
                        >
                          {/* Session 41 (Ravi): Express costs nothing extra for now. */}
                          {opt.hours === 24 && (
                            <span className="ybex-shine absolute -top-2 -right-1.5 px-1.5 py-[1px] rounded-full bg-[#16A34A] text-white text-[9px] font-black tracking-wide shadow-sm" data-testid="express-free-badge">
                              FREE
                            </span>
                          )}
                          <span className="block text-xs font-black">{opt.label}</span>
                          <span className="block text-[10px] font-semibold opacity-80">{opt.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-[#6B7280]">The first draft is due this long after a creator claims.</p>
                </div>

                {/* Escrow total card */}
                <div className="bg-[#F8F4FF] border border-[#7C3AED]/20 rounded-xl p-3.5 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold text-[#7C3AED] uppercase tracking-wider">Total Payment Hold</span>
                    <p className="text-xs text-[#6B7280]">{postData.max_creators} creator(s) × ₹{formatAmount(postData.budget)}</p>
                  </div>
                  <span className="text-lg font-black text-[#7C3AED]">
                    ₹{(postData.budget * postData.max_creators).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPostStep(3)} 
                  className="flex-1 py-4 bg-[#F2F2F7] text-[#0A0A0A] rounded-2xl font-bold text-xs"
                >
                  Back
                </button>
                <button 
                  onClick={() => setPostStep(5)} 
                  className="flex-[2] py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
                >
                  Review & Pay
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Review & Secure Escrow */}
          {postStep === 5 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-black text-[#0A0A0A] leading-tight">
                    {postData.title || `Review of ${postData.product_name}`}
                  </h3>
                  <p className="text-xs text-[#6B7280] mt-0.5">{postData.product_name}</p>
                </div>

                <div className="space-y-2.5 text-xs text-[#6B7280] pb-4 border-b border-[#E5E5EA]">
                  <div className="flex justify-between">
                    <span className="uppercase text-[10px] font-bold">Format</span>
                    <span className="font-bold text-[#7C3AED]">{getFormatLabel(postData.deliverable_type)} · {postData.video_duration}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="uppercase text-[10px] font-bold">Quantity</span>
                    <span className="font-bold text-[#0A0A0A]">{postData.max_creators} Creator(s)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="uppercase text-[10px] font-bold">First draft</span>
                    <span className="font-bold text-[#0A0A0A]">Within {deliveryHoursOf(postData.delivery_hours)} hours</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-1">
                    <span className="uppercase text-[10px] font-bold text-[#0A0A0A]">Total Budget in Payment Hold</span>
                    <span className="text-[#7C3AED] font-black">₹{(postData.budget * postData.max_creators).toLocaleString()}</span>
                  </div>
                </div>

                {/* Delivery Promise */}
                <div className="bg-[#F8F4FF] border border-[#7C3AED]/20 rounded-xl p-3.5 flex gap-3 text-xs text-[#6D28D9]">
                  <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-[#7C3AED]" />
                  <div>
                    <h5 className="font-bold text-[11px] uppercase tracking-wider text-[#7C3AED]">⚡ Delivery Promise</h5>
                    <p className="text-[#6D28D9]/80 text-[11px] mt-0.5 leading-relaxed">
                      {postData.deliverable_type === 'collaboration_reel'
                        ? "Creator publishes directly with live link submission. The payment is released after the live link is verified."
                        : `Creator delivers the video within ${deliveryHoursOf(postData.delivery_hours)} hours of claiming. You approve before any payment is released.`}
                    </p>
                    <p className="text-[#6D28D9]/80 text-[11px] mt-1 font-semibold">✓ Only KYC-verified creators can claim your brief.</p>
                  </div>
                </div>
              </div>

              <PayConsentLine />
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setPostStep(4)} 
                  className="flex-1 py-4 bg-[#F2F2F7] text-[#0A0A0A] rounded-2xl font-bold text-xs"
                >
                  Back
                </button>
                <button 
                  type="button"
                  onClick={() => setShowLivePreview(true)}
                  className="px-4 py-4 bg-[#F2F2F7] text-[#7C3AED] hover:bg-[#F1E8FF] rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Preview Card"
                >
                  <Eye size={16} />
                  <span className="hidden sm:inline">Preview</span>
                </button>
                <button 
                  type="button"
                  onClick={handleProceedPayment}
                  className="flex-[2] py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Lock size={13} /> Secure Brief & Pay
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Screen 08: Live Preview Bottom Sheet (Confirm before pay / preview button) */}
        <AnimatePresence>
          {showLivePreview && (
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setShowLivePreview(false)} 
                className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
              />
              <motion.div 
                initial={{ y: "100%" }} 
                animate={{ y: 0 }} 
                exit={{ y: "100%" }} 
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative bg-white w-full rounded-t-[28px] p-6 z-10 space-y-4 max-h-[90vh] overflow-y-auto"
              >
                <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto" />
                
                <div className="text-center">
                  <span className="text-[10px] font-bold text-[#7C3AED] uppercase tracking-widest bg-[#F1E8FF] px-2.5 py-1 rounded-full">
                    How creators will see it
                  </span>
                </div>

                {/* Session 43 (Ravi: "the black preview — make it look like our app"): the exact card a
                    creator sees in Explore UGC, then what the brand pays and gets. */}
                <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-4 shadow-[0_14px_30px_-24px_rgba(16,16,20,.5)]" data-testid="ugc-brief-preview-card">
                  <div className="flex items-center gap-2.5">
                    <BrandLogo src={user?.logo || user?.picture} name={user?.company_name || user?.name || "Brand"} size={34} radius={11} />
                    <div className="text-[14px] font-semibold text-[#0A0A0A] truncate">{user?.company_name || user?.name || "Your brand"}</div>
                  </div>
                  <div className="mt-3 text-[16px] font-bold leading-snug text-[#0A0A0A] line-clamp-2">{postData.title || "Your brief title"}</div>
                  <div className="mt-1 text-[12.5px] leading-[1.5] text-[#6B7280] line-clamp-3">{postData.product_description || "Product description shows here."}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 rounded-[7px] text-[10.5px] font-semibold bg-[#F1E8FF] text-[#6D28D9] border border-[#DDD6FE]">{getFormatLabel(postData.deliverable_type)}</span>
                    {postData.video_duration && <span className="px-2.5 py-1 rounded-[7px] text-[10.5px] font-medium bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">{postData.video_duration}</span>}
                    <span className="px-2.5 py-1 rounded-[7px] text-[10.5px] font-medium bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">⚡ {deliveryHoursOf(postData.delivery_hours, 24)}h delivery</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#F0F0F4]">
                    <div className="text-[22px] font-bold tracking-[-.5px] text-[#047857]">₹{formatAmount(postData.budget)}</div>
                    <div className="text-[11.5px] text-[#6B7280]">Guaranteed in secure payment hold</div>
                  </div>
                  <div className="mt-3 h-11 rounded-[13px] bg-[#7C3AED] text-white text-[13.5px] font-semibold flex items-center justify-center opacity-90">View brief &amp; claim →</div>
                </div>

                <div className="rounded-[16px] bg-[#F9F9FB] border border-[#ECECF0] p-3.5 flex flex-col gap-2 text-[13px]" data-testid="ugc-brief-preview-summary">
                  <div className="flex justify-between"><span className="text-[#6B7280]">Per creator</span><span className="font-semibold">₹{formatAmount(postData.budget)}</span></div>
                  <div className="flex justify-between"><span className="text-[#6B7280]">Creators</span><span className="font-semibold">{postData.max_creators || 1}</span></div>
                  <div className="flex justify-between"><span className="text-[#6B7280]">Delivery</span><span className="font-semibold">within {deliveryHoursOf(postData.delivery_hours, 24)} hours of claiming</span></div>
                  <div className="h-px bg-[#E5E5EA]" />
                  <div className="flex justify-between items-baseline"><span className="font-bold">You pay now</span><span className="text-[18px] font-extrabold">₹{(Number(postData.budget || 0) * Number(postData.max_creators || 1)).toLocaleString("en-IN")}</span></div>
                  <div className="text-[11.5px] leading-snug text-[#6B7280]">Held safely by Ybex. A creator is paid only after you approve their video. Unclaimed slots follow the Refund Policy.</div>
                </div>

                {/* Bottom Buttons */}
                <div className="space-y-2 pt-2">
                  <PayConsentLine />
                  <button 
                    onClick={handleProceedPayment}
                    className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Lock size={14} /> Proceed & Pay ₹{(postData.budget * postData.max_creators).toLocaleString()}
                  </button>
                  <button 
                    onClick={() => setShowLivePreview(false)}
                    className="w-full py-3 bg-[#F2F2F7] text-[#0A0A0A] rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Back to editing
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* AI Prompt Assistant Sheet */}
        <AnimatePresence>
          {showAiAssist && (
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setShowAiAssist(false)} 
                className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
              />
              <motion.div 
                initial={{ y: "100%" }} 
                animate={{ y: 0 }} 
                exit={{ y: "100%" }} 
                className="relative bg-white w-full max-w-lg rounded-t-[28px] p-6 z-10 space-y-4 max-h-[85vh] overflow-y-auto"
              >
                <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto" />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center">
                      <Lightbulb size={16} />
                    </div>
                    <h3 className="text-base font-bold text-[#0A0A0A]">AI UGC Brief Generator</h3>
                  </div>
                  <button onClick={() => setShowAiAssist(false)} className="text-gray-400">
                    <X size={20} />
                  </button>
                </div>

                <p className="text-xs text-[#6B7280]">
                  Pick a niche template or generate custom requirements powered by Gemini AI.
                </p>

                {/* Category Preset chips */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Skincare Glow Routine", prompt: "Skincare serum hydrating detan" },
                    { label: "D2C Snack / Drink", prompt: "Healthy organic energy beverage" },
                    { label: "Fitness & Gym Wear", prompt: "Athleisure gym compression activewear" },
                    { label: "Tech / App Review", prompt: "Mobile app fintech productivity tool" }
                  ].map(cat => (
                    <button
                      key={cat.label}
                      disabled={aiGenerating}
                      onClick={() => handleGenerateWithAi(cat.prompt)}
                      className="p-3 rounded-xl border border-[#E5E5EA] bg-[#F9F9FB] text-left hover:border-[#7C3AED] hover:bg-[#F8F4FF] transition-all disabled:opacity-50"
                    >
                      <span className="text-xs font-bold text-[#0A0A0A] block">{cat.label}</span>
                      <span className="text-[10px] text-[#7C3AED] font-semibold">Generate →</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <button
                    disabled={aiGenerating}
                    onClick={() => handleGenerateWithAi(postData.product_name || postData.title)}
                    className="w-full py-3.5 bg-[#7C3AED] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {aiGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                    Generate from Current Form
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ----------------------------------------------------
  // SCREEN 01 & 09: Main Mobile UGC Tabs (My Briefs / Orders)
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-[#F2F2F7] text-[#0A0A0A] font-['DM_Sans'] pb-28 relative">
      {/* SCREEN 01 HEADER: Instant UGC BETA + Search + Refresh */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E5EA] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-black text-[#0A0A0A] tracking-tight">Instant UGC</h1>
              <span className="bg-[#F1E8FF] text-[#6D28D9] font-bold text-[8.5px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#7C3AED]/20">
                BETA
              </span>
            </div>
            <p className="text-[11px] text-[#6B7280] font-medium mt-0.5">
              Recruit certified creators & track 24-hour UGC orders.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setSearchOpen(!searchOpen)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                searchOpen ? 'bg-[#7C3AED] text-white' : 'bg-[#F2F2F7] text-[#0A0A0A] active:bg-[#E5E5EA]'
              }`}
              title="Search"
            >
              <Search size={16} />
            </button>
            <button 
              onClick={() => fetchData(true)}
              className="w-9 h-9 rounded-full bg-[#F2F2F7] active:bg-[#E5E5EA] flex items-center justify-center text-[#0A0A0A] transition-all cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin text-[#7C3AED]" : ""} />
            </button>
          </div>
        </div>

        {/* Collapsible Search Input */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: "auto", opacity: 1 }} 
              exit={{ height: 0, opacity: 0 }} 
              className="overflow-hidden pt-2"
            >
              <input 
                type="text"
                autoFocus
                placeholder={activeTab === 'briefs' ? "Search by brief or product title..." : "Search by title or creator..."}
                value={activeTab === 'briefs' ? briefSearch : orderSearch}
                onChange={(e) => activeTab === 'briefs' ? setBriefSearch(e.target.value) : setOrderSearch(e.target.value)}
                className="w-full bg-[#F2F2F7] border border-[#E5E5EA] rounded-xl px-3.5 py-2 text-xs text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Segmented Tabs: My Briefs vs Orders */}
        <div className="mt-3 bg-[#F4F4F7] p-1 rounded-xl flex items-center">
          <button 
            onClick={() => setActiveTab("briefs")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "briefs" 
                ? 'bg-[#7C3AED] text-white shadow-xs' 
                : 'text-[#6B7280] hover:text-[#0A0A0A]'
            }`}
          >
            <span>My Briefs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeTab === "briefs" ? 'bg-white/20 text-white' : 'bg-[#E5E5EA] text-[#6B7280]'
            }`}>
              {briefs.length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab("orders")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "orders" 
                ? 'bg-[#7C3AED] text-white shadow-xs' 
                : 'text-[#6B7280] hover:text-[#0A0A0A]'
            }`}
          >
            <span>Orders</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeTab === "orders" ? 'bg-white/20 text-white' : 'bg-[#E5E5EA] text-[#6B7280]'
            }`}>
              {orders.length}
            </span>
          </button>
        </div>
      </header>

      {/* TAB CONTENT */}
      <div className="p-4 space-y-3.5">
        {/* ======================================================== */}
        {/* TAB: MY BRIEFS */}
        {/* ======================================================== */}
        {activeTab === "briefs" && (
          <div className="space-y-3.5">
            {loading && briefs.length === 0 ? (
              <BrandBriefListSkeleton count={3} />
            ) : filteredBriefs.length === 0 ? (
              <div className="bg-white rounded-[20px] p-8 text-center border border-[#E5E5EA] shadow-xs space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center mx-auto">
                  <Film size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0A0A0A]">No Briefs Found</h3>
                  <p className="text-xs text-[#6B7280] mt-1 max-w-xs mx-auto">
                    {briefSearch ? "No briefs match your search query." : "Post your first brief to recruit top creators and get 24-hour UGC delivery."}
                  </p>
                </div>
                <button 
                  onClick={handleStartNewBrief}
                  className="inline-flex items-center gap-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer active:scale-95 transition-all"
                >
                  <Plus size={14} /> Post First Brief
                </button>
              </div>
            ) : (
              filteredBriefs.map(brief => {
                const claimed = brief.claimed_count || 0;
                const max = brief.max_creators || 1;
                const isAssigned = claimed >= max;
                const formatLabel = getFormatLabel(brief.deliverable_type);
                const budgetAmount = Number(brief.total_budget || brief.budget * max || brief.budget || 0);
                const applicantsCount = brief.applications_count || brief.applicants?.length || 0;

                return (
                  <div 
                    key={brief.id}
                    className="bg-white rounded-[18px] p-4 border border-[#E5E5EA] shadow-xs space-y-3"
                  >
                    {/* Status badge & format tag */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          String(brief.status || '').toUpperCase() === 'COMPLETED' 
                            ? 'bg-teal-500' 
                            : isAssigned 
                              ? 'bg-[#7C3AED]' 
                              : 'bg-[#10B981] animate-pulse'
                        }`} />
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          String(brief.status || '').toUpperCase() === 'COMPLETED'
                            ? 'bg-teal-50 text-teal-700'
                            : isAssigned 
                              ? 'bg-[#F1E8FF] text-[#6D28D9]' 
                              : 'bg-[#E9F9F1] text-[#047857]'
                        }`}>
                          {String(brief.status || '').toUpperCase() === 'COMPLETED' ? "Completed" : isAssigned ? "Creator Assigned" : "Finding Creator"}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#6D28D9] bg-[#F1E8FF] px-2 py-0.5 rounded-md">
                        {formatLabel}
                      </span>
                    </div>

                    {/* Brief Title & Product Name */}
                    <div>
                      <h3 className="text-sm font-bold text-[#0A0A0A] leading-snug">
                        {brief.title || `Review of ${brief.product_name}`}
                      </h3>
                      {brief.product_name && (
                        <p className="text-xs text-[#6B7280] mt-0.5 font-medium">
                          Product: <span className="text-[#0A0A0A]">{brief.product_name}</span>
                        </p>
                      )}
                    </div>

                    {/* Budget & Escrow Block */}
                    <div className="bg-[#F9F9FB] border border-[#ECECF0] rounded-[13px] p-3 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider block">Budget & Payment Hold</span>
                          <span className="text-sm font-black text-[#0A0A0A]">₹{budgetAmount.toLocaleString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-[#7C3AED]">
                            Recruited ({claimed}/{max})
                          </span>
                          <p className="text-[9.5px] text-[#6B7280] font-medium">24h SLA Guarantee</p>
                        </div>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="w-full bg-[#E5E5EA] h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#7C3AED] rounded-full transition-all"
                          style={{ width: `${Math.min(100, (claimed / max) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button 
                        onClick={() => {
                          setActiveBriefForApplicants(brief);
                          setShowApplicantsSheet(true);
                        }}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-white border border-[#E5E5EA] text-[#3F3F46] font-bold text-xs flex items-center justify-center gap-1.5 active:bg-[#F2F2F7] transition-all cursor-pointer"
                      >
                        <Eye size={13} /> Applicants ({applicantsCount})
                      </button>

                      <button 
                        onClick={() => {
                          // Switch to orders tab or filter by this brief
                          setOrderSearch(brief.title || brief.product_name || "");
                          setActiveTab("orders");
                        }}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                      >
                        <span>Manage Orders</span> <ChevronRight size={13} />
                      </button>
                    </div>

                    {/* Cancel Brief / Refund Status */}
                    <div className="pt-2 flex items-center justify-between">
                      {brief.status === "CANCELLED" || brief.status === "PARTIALLY_CANCELLED" ? (
                        <BriefRefundStatus briefId={brief.id} compact />
                      ) : (max - claimed) > 0 ? (
                        <button
                          onClick={() => setSelectedBriefForCancel(brief)}
                          className="text-[11px] font-bold text-red-500 hover:text-red-600 active:underline flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          Cancel brief ({max - claimed} open)
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB: ORDERS (SCREEN 02 & SCREEN 09) */}
        {/* ======================================================== */}
        {activeTab === "orders" && (
          <div className="space-y-3.5">
            {loading && orders.length === 0 ? (
              <UGCOrderListSkeleton count={3} />
            ) : orders.length === 0 ? (
              /* SCREEN 02: Orders Empty State */
              <div className="bg-white rounded-[20px] p-8 text-center border border-[#E5E5EA] shadow-xs space-y-3.5 my-4">
                <div className="w-14 h-14 rounded-2xl bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center mx-auto">
                  <Video size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0A0A0A]">No UGC Orders Found</h3>
                  <p className="text-xs text-[#6B7280] mt-1 max-w-xs mx-auto leading-relaxed">
                    Create your first brief to recruit top creators and get 24-hour UGC video delivery.
                  </p>
                </div>
                <button 
                  onClick={handleStartNewBrief}
                  className="inline-flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Plus size={15} /> Post First Brief
                </button>
              </div>
            ) : (
              /* SCREEN 09: Manage Orders List */
              <>
                {/* Search & Filter pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {[
                    { id: "all", label: "All" },
                    { id: "review", label: "Review" },
                    { id: "in_progress", label: "In Production" },
                    { id: "done", label: "Done" }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setOrderFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                        orderFilter === tab.id
                          ? 'bg-[#7C3AED] text-white shadow-xs'
                          : 'bg-white border border-[#E5E5EA] text-[#6B7280] hover:text-[#0A0A0A]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Orders List */}
                <div className="space-y-3">
                  {filteredOrders.length === 0 ? (
                    <div className="bg-white rounded-[18px] p-6 text-center border border-[#E5E5EA] text-xs text-[#6B7280]">
                      No orders match the selected filter.
                    </div>
                  ) : (
                    filteredOrders.map(order => {
                      const stage = (order.stage || order.brand_status || order.status || "IN_PROGRESS").toUpperCase();
                      const thrFlow = (order.flow_state || order.thread_flow_state || '').toUpperCase();
                      const isCompleted = stage === "COMPLETED" || stage === "PAID" || thrFlow === "COMPLETED";
                      const isAwaitingLiveLink = stage === "AWAITING_LIVE_LINK" || stage === "COMPLETED_APPROVAL" || stage === "CONTENT_APPROVED" || thrFlow === "CONTENT_APPROVED" || order.content_approved === true;
                      const isLiveLinkSubmitted = stage === "LIVE_LINK_SUBMITTED" || stage === "PROOF_SUBMITTED" || thrFlow === "PROOF_SUBMITTED";
                      const isInReview = !isCompleted && !isAwaitingLiveLink && !isLiveLinkSubmitted && (stage === "IN_REVIEW" || stage === "SUBMITTED");
                      const sla = getSlaTimeLeft(order.deadline || order.sla_deadline, orderWindowHours(order));
                      const amount = Number(order.amount || order.agreed_amount || order.creator_payout || order.budget || 0);
                      const orderNumber = order.order_number || order.orderNumber || `#ORD-${String(order.id).slice(-6).toUpperCase()}`;

                      return (
                        <div 
                          key={order.id}
                          className="bg-white rounded-[18px] p-4 border border-[#E5E5EA] shadow-xs space-y-3"
                        >
                          {/* Top Row: Creator Avatar + Title + Status */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#A78BFA] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                                {(order.creator_name || order.creatorName || "C")[0].toUpperCase()}
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-[#0A0A0A] line-clamp-1">
                                  {order.title || order.campaign_title || "UGC Deliverable"}
                                </h3>
                                <p className="text-[10px] text-[#6B7280] font-medium">
                                  {order.creator_name || order.creatorName || "Verified UGC Creator"} · <span className="font-mono">{orderNumber}</span>
                                </p>
                              </div>
                            </div>

                            {/* Badge */}
                            <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                              isCompleted 
                                ? 'bg-[#E9F9EF] text-[#16A34A]' 
                                : isLiveLinkSubmitted
                                  ? 'bg-[#F3E8FF] text-[#7C3AED] border border-[#DDD6FE]'
                                  : isAwaitingLiveLink
                                    ? 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]'
                                    : isInReview 
                                      ? 'bg-[#FFF7E6] text-[#B45309] border border-[#FDE68A]' 
                                      : 'bg-[#EFF6FF] text-[#1D4ED8]'
                            }`}>
                              {isCompleted ? "Done" : isLiveLinkSubmitted ? "Live Review" : isAwaitingLiveLink ? "Waiting Live Link" : isInReview ? "Review" : "In Production"}
                            </span>
                          </div>

                          {/* Progress & SLA */}
                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-[11px] font-medium text-[#6B7280]">
                                {isCompleted ? "Delivered & Approved" : isLiveLinkSubmitted ? "Live post submitted • Under review" : isAwaitingLiveLink ? "Draft approved • Waiting for live link" : isInReview ? "Waiting for approval" : "In production"}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-[#6D28D9] flex items-center gap-1">
                                <Clock size={11} /> {sla.text}
                              </span>
                            </div>
                            <div className="w-full bg-[#E5E5EA] h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${isCompleted ? 'bg-[#10B981]' : 'bg-[#7C3AED]'}`}
                                style={{ width: `${isCompleted ? 100 : sla.percent}%` }}
                              />
                            </div>
                          </div>

                          {/* Escrow Held & Manage Button */}
                          <div className="flex items-center justify-between pt-2 border-t border-[#E5E5EA]">
                            <div>
                              <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider block">Payment Hold</span>
                              <span className="text-xs font-black text-[#0A0A0A]">₹{amount.toLocaleString()}</span>
                            </div>

                            <button 
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setSelectedOrder(order);
                                setView("order-detail");
                              }}
                              className="px-3.5 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <span>Manage order</span> <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Escrow Policy Notice Card */}
                <div className="bg-[#EFF6FF] border border-[#DBEAFE] rounded-xl p-3.5 flex gap-2.5 text-xs text-[#1E3A8A]">
                  <ShieldCheck size={18} className="shrink-0 text-[#2563EB]" />
                  <p className="text-[11px] leading-relaxed">
                    Secure payment hold releases only after you approve the deliverable, or automatically if the SLA timer runs out.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SCREEN 01b: Floating Action Button (FAB) & Menu */}
      {/* ======================================================== */}
      {view === "main" && (
        <>
          {/* FAB Backdrop */}
          <AnimatePresence>
            {fabOpen && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setFabOpen(false)} 
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" 
              />
            )}
          </AnimatePresence>

          {/* FAB Popup Menu */}
          <AnimatePresence>
            {fabOpen && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0, y: 20 }} 
                animate={{ scale: 1, opacity: 1, y: 0 }} 
                exit={{ scale: 0.8, opacity: 0, y: 20 }} 
                className="fixed bottom-[164px] right-5 z-50 flex flex-col items-end gap-2.5"
              >
                {hasDraft && (
                  <button 
                    onClick={handleResumeDraft}
                    className="bg-white text-[#0A0A0A] font-bold text-xs px-4 py-3 rounded-2xl shadow-xl border border-[#E5E5EA] flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Clock size={14} />
                    </div>
                    <span>Resume draft</span>
                  </button>
                )}

                <button 
                  onClick={handleStartNewBrief}
                  className="bg-white text-[#0A0A0A] font-bold text-xs px-4 py-3 rounded-2xl shadow-xl border border-[#E5E5EA] flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center">
                    <Plus size={14} />
                  </div>
                  <span>New brief</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Floating Action Button (Raised cleanly above 84px bottom navbar) */}
          <button 
            onClick={() => setFabOpen(!fabOpen)}
            className="fixed bottom-[96px] right-5 z-40 w-14 h-14 rounded-[19px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white flex items-center justify-center shadow-[0_14px_28px_-12px_rgba(124,58,237,.65)] active:scale-95 transition-all cursor-pointer"
            aria-label="Create Brief"
          >
            <motion.div animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
              <Plus size={24} strokeWidth={2.5} />
            </motion.div>
          </button>
        </>
      )}

      {/* Applicants Bottom Sheet Modal */}
      <AnimatePresence>
        {showApplicantsSheet && activeBriefForApplicants && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowApplicantsSheet(false)} 
              className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
            />
            <motion.div 
              initial={{ y: "100%" }} 
              animate={{ y: 0 }} 
              exit={{ y: "100%" }} 
              className="relative bg-white w-full max-w-lg rounded-t-[28px] p-6 z-10 space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto" />
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-[#0A0A0A]">Claimed by</h3>
                  <p className="text-xs text-[#6B7280]">{activeBriefForApplicants.title}</p>
                </div>
                <button onClick={() => setShowApplicantsSheet(false)} className="text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 pt-1">
                {activeBriefForApplicants.applicants && activeBriefForApplicants.applicants.length > 0 ? (
                  activeBriefForApplicants.applicants.map((app, idx) => (
                    <CreatorCard
                      key={app.creator_id || idx}
                      variant="mobile"
                      creatorId={app.creator_id || app.creator_user_id || app.creator?.id}
                      name={app.creator_name}
                      avatar={app.creator_avatar}
                      status={app.status || "Claimed"}
                      onNavigate={() => setShowApplicantsSheet(false)}
                      onManage={() => {
                        const cid = app.creator_id || app.creator_user_id || app.creator?.id;
                        const o = (orders || []).find((x) => x.brief_id === activeBriefForApplicants.id && x.creator_id === cid);
                        setShowApplicantsSheet(false);
                        if (o) { setSelectedOrder(o); setView("order-detail"); }
                      }}
                    />
                  ))
                ) : (
                  <div className="text-center py-8 text-[#6B7280] text-xs">
                    <p>No creator has claimed this brief yet.</p>
                    <p className="text-[11px] text-[#9CA3AF] mt-1">
                      KYC-verified creators can see it now. They'll appear here once they claim.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Presence>{selectedBriefForCancel && (
        <CancelBriefModal key="cancelbriefmodal"
          isOpen={Boolean(selectedBriefForCancel)}
          brief={selectedBriefForCancel}
          onClose={() => setSelectedBriefForCancel(null)}
          onSuccess={() => fetchData(true)}
        />
      )}</Presence>
    </div>
  );
}

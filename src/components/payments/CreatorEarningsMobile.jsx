import React, { useState, useMemo } from "react";
import CreatorCodeCard from "./CreatorCodeCard";
import { 
  Check, 
  Copy, 
  Clock, 
  ShieldCheck, 
  X, 
  Download, 
  MessageSquare,
  Lock,
  ArrowUpRight,
  Eye,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import InvoiceModal from "./InvoiceModal";
import BrandLogo from "../common/BrandLogo";
import { CreatorEarningsSkeleton } from "../common/MobileSkeletons";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import MobileBackButton from "../common/MobileBackButton";
// Session 43: real dates only (the sheet showed made-up "Sep 18 / Sep 19 / 18h 32m").
const shortDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
};
const timeLeftText = (v) => {
  const ms = v ? new Date(v).getTime() - Date.now() : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return `${h}h ${m}m`;
};

export default function CreatorEarningsMobile({
  totalEarned = 0,
  inEscrow = 0,
  transactions = [],
  eligibleDeals = [],
  paymentMethods = [],
  kycObj = null,
  growthPercent = null,
  past28DaysEarned = 0,
  onNudgeAdmin = null,
  onOpenPayoutSettings = null,
  loading = false,
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'escrow' (in hold) | 'queue' (ready)
  const [selectedActiveDeal, setSelectedActiveDeal] = useState(null);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(null);
  const [showProofModal, setShowProofModal] = useState(null);

  // Derive default payment destination
  const primaryMethod = paymentMethods && paymentMethods.length > 0 ? paymentMethods[0] : null;
  const disbursingText = primaryMethod
    ? primaryMethod.upi_id
      ? `UPI · ${primaryMethod.upi_id}`
      : `Bank ••${primaryMethod.account_last4 || ""}`
    : "No payout account added";

  // Normalize transactions into unified feed
  const feedItems = useMemo(() => {
    const list = [];

    // Eligible deals in payout queue
    (eligibleDeals || []).forEach((deal) => {
      list.push({
        id: deal.id || deal.deal_id,
        type: "queue",
        title: deal.deal_title || deal.campaign_title || deal.deliverable_type || "Brand Collaboration",
        brandName: deal.brand_name || deal.brand?.company_name || "Brand partner",
        brandLogo: deal.brand_logo || deal.brand?.logo || "",
        threadId: deal.thread_id || deal.id || deal.deal_id || null,
        // null = the server has no net figure yet; the row then shows no amount (never a guess).
        amount: deal.creator_net_amount ?? deal.net_amount ?? null,
        grossAmount: Number(deal.gross_amount || deal.amount || 0),
        status: "queue",
        statusLabel: "Approved · in payout queue",
        timeAgo: "Approved recently",
        dealObj: deal,
        date: deal.approved_at || deal.updated_at || deal.created_at || new Date().toISOString(),
        monthLabel: new Date(deal.approved_at || deal.updated_at || deal.created_at || Date.now())
          .toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase()
      });
    });

    // Transactions (in escrow or disbursed). Session 43: a held transaction whose deal is already in
    // the payout queue above was listed twice (once "in hold", once "ready") — it now shows once, as Ready.
    const queuedDealIds = new Set((eligibleDeals || []).map((d) => String(d.deal_id || d.id || "")).filter(Boolean));
    (transactions || []).forEach((tx) => {
      const isPaid = tx.payout_status === "PAID" || tx.payout_status === "RELEASED" || Boolean(tx.utr_number || tx.payout_reference);
      if (!isPaid && tx.deal_id && queuedDealIds.has(String(tx.deal_id))) return;
      const amount = Number(tx.creator_net_amount || tx.net_amount || tx.amount || tx.gross_amount || 0);
      const txDate = new Date(tx.created_at || tx.payout_completed_at || Date.now());
      const monthStr = txDate.toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();

      list.push({
        id: tx.id || tx.transaction_id,
        type: isPaid ? "disbursed" : "escrow",
        title: tx.campaign_title || tx.deliverable_type || tx.deal_title || "UGC Deliverable",
        // Session 43 (Ravi): tx.users is the CREATOR — "B Cool" showed as the brand. Brand only.
        brandName: tx.brand_name || tx.brand?.company_name || tx.brand?.name || "Brand partner",
        brandLogo: tx.brand_logo || tx.brand?.logo || tx.brand?.logo_url || "",
        fundedAt: tx.paid_at || tx.escrow_funded_at || tx.created_at || null,
        submittedAt: tx.content_submitted_at || tx.submitted_at || null,
        autoApproveAt: tx.auto_approve_at || null,
        threadId: tx.thread_id || tx.deal_id || tx.ugc_order_id || null,
        amount: amount,
        grossAmount: Number(tx.gross_amount || tx.amount || amount),
        feeAmount: Number(tx.platform_fee_amount || tx.fee_amount || 0) + Number(tx.gst_amount || 0), // fee + GST, both deducted from gross
        status: isPaid ? "disbursed" : "escrow",
        statusLabel: isPaid ? "Disbursed to bank" : "In secure payment hold · brand reviewing",
        utr: tx.utr_number || tx.payout_reference || null,
        disbursedAt: tx.payout_completed_at || tx.payout_released_at || tx.updated_at,
        txObj: tx,
        date: tx.created_at || tx.updated_at || new Date().toISOString(),
        monthLabel: monthStr
      });
    });

    return list;
  }, [transactions, eligibleDeals]);

  // Counts + totals (Session 43 design: All · In hold · Ready)
  const countEscrow = feedItems.filter((i) => i.type === "escrow").length;
  const countQueue = feedItems.filter((i) => i.type === "queue").length;
  const readyTotal = feedItems.filter((i) => i.type === "queue").reduce((a, i) => a + (Number(i.amount) || 0), 0);
  // inEscrow is every unpaid deal (Earnings-page rule); the ready ones are shown in their own tile.
  const holdTotal = Math.max(0, Number(inEscrow || 0) - readyTotal);

  const filteredFeed = useMemo(() => {
    const list = activeTab === "all" ? feedItems : feedItems.filter((i) => i.type === activeTab);
    return [...list].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [feedItems, activeTab]);

  const copyToClipboard = (text, label = "UTR") => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const kycStatus = String(kycObj?.status || "").toUpperCase();
  const isKycVerified = kycStatus === "VERIFIED" || kycStatus === "APPROVED";
  const isKycPending = kycStatus === "PENDING" || kycStatus === "IN_REVIEW" || kycStatus === "SUBMITTED";

  // Session 39: the loading screen comes after every hook (hooks must run in the same order).
  if (loading) {
    return <CreatorEarningsSkeleton />;
  }

  const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
  const openPayoutSettings = () => (onOpenPayoutSettings ? onOpenPayoutSettings() : navigate("/earnings"));
  const BADGE = {
    escrow: { label: "In hold", color: "#7C3AED", bg: "#F2EAFF" },
    queue: { label: "Ready", color: "#0E7A55", bg: "#E3F7EE" },
    requested: { label: "Requested", color: "#B45309", bg: "#FFFBEB" },
    disbursed: { label: "Paid", color: "#6B6578", bg: "#F2F0F6" },
  };
  const openRow = (item) => {
    if (item.type === "escrow") return setSelectedActiveDeal(item);
    if (item.type === "disbursed") return setSelectedReceiptTx(item);
    // Ready: the same per-deal payout request as before (PayoutRequestSheet on the Earnings page).
    return onNudgeAdmin
      ? onNudgeAdmin(item.id)
      : toast.error("Couldn't reach the admin desk from here. Please use Help → Tickets.");
  };
  const tabs = [
    ["all", "All", feedItems.length],
    ["escrow", "In hold", countEscrow],
    ["queue", "Ready", countQueue],
  ];
  const emptyTitle = activeTab === "all" ? "No deal payments yet" : activeTab === "escrow" ? "Nothing in secure hold" : "Nothing ready to disburse";

  return (
    <div className="w-full min-h-screen bg-[#F5F4F8] flex flex-col pb-16" data-testid="creator-earnings-mobile">
      {/* Session 43 — Ravi's Earnings design (Earnings_dc.html). Numbers are the same server figures as before. */}
      <header data-statusbar="#FFFFFF" className="bg-white border-b border-[#ECEAF1] px-4 pt-2 pb-3.5 sticky top-0 z-20 flex items-center gap-3">
        <MobileBackButton className="!w-10 !h-10 !bg-[#F2F0F6]" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#14111C] leading-tight">Earnings</h1>
          {isKycVerified ? (
            <div className="flex items-center gap-1 text-[12px] font-semibold text-[#0E9F6E] mt-px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#0E9F6E" className="shrink-0"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z" /><path d="M8.5 12l2.3 2.3 4.7-4.7" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              KYC verified
            </div>
          ) : isKycPending ? (
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 mt-px">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />KYC in review
            </div>
          ) : (
            <button type="button" onClick={() => navigate("/creator/kyc")} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#6B6578] mt-px">
              <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />KYC not submitted · <span className="text-[#7C3AED]">Start</span>
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Payout settings"
          onClick={openPayoutSettings}
          className="w-10 h-10 rounded-full bg-[#F2F0F6] flex items-center justify-center shrink-0 active:scale-95 transition-transform"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#14111C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
        </button>
      </header>

      <div className="flex-1 px-4 pt-4 pb-8 flex flex-col gap-3.5">
        {/* HERO */}
        <div
          className="shrink-0 rounded-[24px] p-5 text-white flex flex-col gap-4 shadow-[0_14px_30px_rgba(91,0,200,.28)]"
          style={{ background: "linear-gradient(160deg,#9B00FF 0%,#5A00C8 55%,#2E0066 100%)" }}
        >
          <div>
            <div className="text-[13px] font-semibold text-[#E9DBFF]">Total paid to your bank</div>
            <div className="text-[40px] font-extrabold tracking-[-1px] leading-[1.1] mt-1" data-testid="earnings-total">{inr(totalEarned)}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="inline-flex px-2.5 py-1 rounded-full bg-white/[.16] text-[12px] font-semibold gap-1">
                <span>{inr(past28DaysEarned)}</span><span>in the last 28 days</span>
              </span>
              {growthPercent ? (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-white/[.16] text-[12px] font-bold text-[#EAFBF2]">
                  <ArrowUpRight className="w-3 h-3 stroke-[2.8]" />{growthPercent}
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white/[.12] rounded-[16px] p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#E9DBFF]">
                <Lock className="w-[13px] h-[13px] stroke-[2.2]" />In secure hold
              </div>
              <div className="text-[20px] font-extrabold mt-1.5 truncate" data-testid="earnings-hold">{inr(holdTotal)}</div>
              <div className="text-[11px] text-[#E9DBFF] mt-0.5">Guaranteed by brand</div>
            </div>
            <div className="bg-white/[.12] rounded-[16px] p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#E9DBFF]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E9DBFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                Ready to disburse
              </div>
              <div className="text-[20px] font-extrabold mt-1.5 truncate" data-testid="earnings-ready">{inr(readyTotal)}</div>
              <div className="text-[11px] text-[#E9DBFF] mt-0.5">
                {countQueue > 0 ? "Tap a Ready deal to get paid" : "After the brand approves"}
              </div>
            </div>
          </div>
        </div>

        {/* PAYOUT DESTINATION */}
        {primaryMethod ? (
          <div className="shrink-0 bg-white rounded-[20px] p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#F2EAFF] flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-[#6B6578]">Payouts go to</div>
              <div className="text-[14px] font-bold text-[#14111C] mt-px truncate">
                {primaryMethod.upi_id ? `UPI · ${primaryMethod.upi_id}` : `Bank •••• ${primaryMethod.account_last4 || ""}`}
              </div>
            </div>
            <button type="button" onClick={openPayoutSettings} className="h-9 px-3.5 rounded-full bg-[#F2F0F6] text-[#14111C] text-[13px] font-bold shrink-0 active:scale-95 transition-transform">
              Change
            </button>
          </div>
        ) : (
          <button type="button" onClick={openPayoutSettings} className="shrink-0 bg-white rounded-[20px] p-3.5 flex items-center gap-3 text-left border-[1.5px] border-dashed border-[#D9BFFF]">
            <div className="w-10 h-10 rounded-[12px] bg-[#F2EAFF] flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#14111C]">Add a payout account</div>
              <div className="text-[12px] text-[#6B6578] mt-px">Bank or UPI — where your money is sent</div>
            </div>
            <span className="h-9 px-3.5 rounded-full text-white text-[13px] font-bold shrink-0 flex items-center" style={{ background: "linear-gradient(135deg,#9B00FF,#5A00C8)" }}>Add</span>
          </button>
        )}

        {/* CREATOR CODE */}
        <CreatorCodeCard />

        {/* DEAL PAYMENTS */}
        <div className="shrink-0 flex flex-col gap-2.5 mt-1.5">
          <div className="text-[16px] font-extrabold text-[#14111C] px-1">Deal payments</div>
          <div className="grid grid-cols-3 bg-[#E9E6F0] rounded-[14px] p-1 gap-1" role="tablist">
            {tabs.map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`h-9 rounded-[10px] text-[13px] font-bold transition-colors ${
                  activeTab === id ? "bg-white text-[#14111C] shadow-[0_1px_3px_rgba(20,17,28,.12)]" : "bg-transparent text-[#6B6578]"
                }`}
              >
                {n ? `${label} · ${n}` : label}
              </button>
            ))}
          </div>

          {filteredFeed.length === 0 ? (
            <div className="bg-white rounded-[20px] px-5 py-6 flex flex-col gap-[18px]">
              <div className="text-center">
                <div className="text-[15px] font-bold text-[#14111C]">{emptyTitle}</div>
                <div className="text-[13px] text-[#6B6578] mt-1">Here's how you get paid for a deal</div>
              </div>
              <div className="flex flex-col gap-3.5">
                {[
                  ["Brand pays upfront", "Money is locked in a secure hold"],
                  ["You deliver the content", "Brand approves your work"],
                  ["Payment hits your bank", "Ybex sends it to your bank / UPI"],
                ].map(([t, d], i) => (
                  <div key={t} className="flex gap-3 items-start">
                    <div className="w-[26px] h-[26px] rounded-full bg-[#F2EAFF] text-[#7C3AED] text-[13px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</div>
                    <div>
                      <div className="text-[14px] font-bold text-[#14111C]">{t}</div>
                      <div className="text-[12px] text-[#6B6578] mt-px">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate("/campaigns")}
                className="h-[46px] rounded-[14px] text-white text-[15px] font-bold active:scale-[0.99] transition-transform"
                style={{ background: "linear-gradient(135deg,#9B00FF,#5A00C8)" }}
              >
                Find deals
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-[20px] px-3.5 py-1">
              {filteredFeed.map((item, i) => {
                const b = item.type === "queue" && item.dealObj?.payout_requested ? BADGE.requested : BADGE[item.type];
                const when = shortDate(item.type === "disbursed" ? item.disbursedAt || item.date : item.date);
                const hasAmount = item.amount !== null && item.amount !== undefined;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => openRow(item)}
                    data-testid={`earnings-row-${item.type}`}
                    className={`w-full flex items-center gap-3 py-3 text-left ${i ? "border-t border-[#F0EEF4]" : ""}`}
                  >
                    <BrandLogo src={item.brandLogo} name={item.brandName} size={40} radius={12} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-[#14111C] truncate">{item.brandName}</div>
                      <div className="text-[12px] text-[#6B6578] mt-px truncate">{when ? `${item.title} · ${when}` : item.title}</div>
                    </div>
                    <div className="text-right shrink-0">
                      {hasAmount && <div className="text-[14px] font-extrabold text-[#14111C]">{inr(item.amount)}</div>}
                      <div className="inline-block mt-[3px] px-2 py-0.5 rounded-[10px] text-[11px] font-bold" style={{ color: b.color, background: b.bg }}>
                        {b.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SCREEN 02: ACTIVE DEAL · ESCROW MILESTONES BOTTOM SHEET */}
      <Presence>{selectedActiveDeal && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedActiveDeal(null)} className="bg-white rounded-t-[24px] p-5 max-h-[85vh] overflow-y-auto shadow-2xl">
            {/* Grab Handle */}
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            {/* Deal Header */}
            <div className="flex items-center gap-3">
              <BrandLogo src={selectedActiveDeal.brandLogo} name={selectedActiveDeal.brandName} size={44} radius={13} />
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-[#0A0A0A] leading-tight truncate">
                  {selectedActiveDeal.title}
                </h3>
                <p className="text-[11.5px] text-[#6B7280] mt-0.5">
                  {selectedActiveDeal.brandName} · Deal #{String(selectedActiveDeal.id || "").slice(0, 8)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[18px] font-bold text-[#0A0A0A]">
                  ₹{selectedActiveDeal.amount.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-[#9CA3AF]">deal value</div>
              </div>
            </div>

            {/* Stepper Milestones */}
            <div className="mt-5 flex flex-col">
              {/* Step 1: Funded */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#A7F3D0] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Secure payment hold funded by brand</div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                    {shortDate(selectedActiveDeal.fundedAt) ? `${shortDate(selectedActiveDeal.fundedAt)} · ` : ""}₹{selectedActiveDeal.amount.toLocaleString("en-IN")} held safely
                  </div>
                </div>
              </div>

              {/* Step 2: Content Submitted */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Content submitted by you</div>
                  {shortDate(selectedActiveDeal.submittedAt) && <div className="text-[11.5px] text-[#6B7280] mt-0.5">{shortDate(selectedActiveDeal.submittedAt)}</div>}
                </div>
              </div>

              {/* Step 3: Brand Review */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#FFFBEB] border-2 border-[#F59E0B]" />
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">Brand QC &amp; approval</span>
                    <span className="h-4 px-1.5 rounded-[4px] bg-[#FFFBEB] text-[#B45309] text-[9px] font-bold flex items-center">
                      NOW
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#B45309] mt-0.5">
                    {timeLeftText(selectedActiveDeal.autoApproveAt) ? `Auto-approves in ${timeLeftText(selectedActiveDeal.autoApproveAt)} if no changes are asked` : "The brand is reviewing your content"}
                  </div>
                </div>
              </div>

              {/* Step 4: Disbursal */}
              <div className="flex gap-3">
                <div className="w-5 shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#9CA3AF]">
                    <Lock className="w-2.5 h-2.5" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-[#9CA3AF]">Direct disbursal to bank / UPI</div>
                  {primaryMethod ? (
                    <div className="text-[11.5px] text-[#9CA3AF] mt-0.5">Ybex sends it to {disbursingText} and posts the UTR here</div>
                  ) : (
                    <button type="button" onClick={() => { setSelectedActiveDeal(null); onOpenPayoutSettings ? onOpenPayoutSettings() : navigate("/earnings"); }}
                      className="mt-1 text-[12px] font-semibold text-[#7C3AED] underline">Add a payout account to receive this money</button>
                  )}
                </div>
              </div>
            </div>

            {/* Escrow Guarantee Banner */}
            <div className="mt-3 p-3 rounded-[14px] bg-[#ECFDF5] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-[#047857] leading-relaxed">
                <strong className="font-semibold">100% secure payment hold protected.</strong> The brand cannot cancel this brief without admin mediation.
              </p>
            </div>

            {/* Actions: View Proof & Chat With Brand */}
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => {
                  setShowProofModal(selectedActiveDeal);
                }}
                className="flex-1 h-12 rounded-[14px] border border-[#E2E8F0] bg-[#F8F8FB] text-[#0A0A0A] font-semibold text-[13px] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#4B5563]" />
                View proof
              </button>
              <button
                onClick={() => {
                  const tid = selectedActiveDeal.threadId;
                  setSelectedActiveDeal(null);
                  navigate(tid ? `/chat/${tid}` : "/chat");
                }}
                className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                Chat with brand
              </button>
            </div>

            <button
              onClick={() => setSelectedActiveDeal(null)}
              className="mt-2.5 w-full h-10 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* SCREEN 03: DISBURSAL RECEIPT & UTR PROOF BOTTOM SHEET */}
      <Presence>{selectedReceiptTx && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedReceiptTx(null)} className="bg-white rounded-t-[24px] p-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Grab handle */}
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />

            {(() => {
              // Session 43 (Ravi): until finance posts the UTR the payout is still on its way, so the
              // whole receipt says "pending" in yellow and the bank details stay hidden.
              const tx = selectedReceiptTx;
              const hasUtr = Boolean(tx.utr);
              const raw = tx.txObj || {};
              const upi = raw.payout_upi_id || primaryMethod?.upi_id || null;
              const last4 = raw.payout_account_last4 || primaryMethod?.account_last4 || (primaryMethod?.bank_account_number ? String(primaryMethod.bank_account_number).slice(-4) : null);
              const ifsc = String(raw.payout_ifsc || raw.ifsc || primaryMethod?.bank_ifsc || primaryMethod?.ifsc || primaryMethod?.ifsc_code || "").trim().toUpperCase();
              const destination = upi ? `UPI · ${upi}` : last4 ? `Bank ••${last4}` : null;
              const channel = upi ? "UPI transfer" : "IMPS · direct bank transfer";
              return (
                <>
                  <div className="flex flex-col items-center text-center">
                    {hasUtr ? (
                      <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[#059669]">
                        <Check className="w-6 h-6 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#B45309]" data-testid="receipt-pending-icon">
                        <Clock className="w-6 h-6 stroke-[2.5]" />
                      </div>
                    )}
                    <div className={`text-[13px] font-semibold mt-2 ${hasUtr ? "text-[#047857]" : "text-[#B45309]"}`}>
                      {hasUtr ? "Disbursed to bank account" : "Transfer pending"}
                    </div>
                    <div className="text-[34px] font-bold tracking-tight text-[#0A0A0A] mt-1 leading-none">
                      ₹{tx.amount.toLocaleString("en-IN")}
                    </div>
                    <div className="text-[11.5px] text-[#6B7280] mt-1">
                      {tx.title} · {tx.brandName}
                    </div>
                    {!hasUtr && (
                      <div className="mt-2.5 px-3 py-2 rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A] text-[11.5px] leading-snug text-[#92400E]">
                        The amount will reach your bank account in 1–2 working days.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-[16px] bg-[#F8F8FB] p-3.5 flex flex-col gap-2">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">Gross deal value</span>
                      <span className="font-semibold text-[#0A0A0A]">
                        ₹{(tx.grossAmount || tx.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">Convenience fee &amp; TDS</span>
                      <span className="font-semibold text-[#0A0A0A]">
                        −₹{(tx.feeAmount || 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="h-[1px] bg-[#EAEAF0]" />
                    <div className="flex justify-between text-[13px]">
                      <span className="font-semibold text-[#0A0A0A]">{hasUtr ? "Final amount disbursed" : "Amount you will receive"}</span>
                      <span className={`font-bold ${hasUtr ? "text-[#059669]" : "text-[#B45309]"}`}>
                        ₹{tx.amount.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  <div className={`mt-3 rounded-[16px] border overflow-hidden ${hasUtr ? "border-[#E2E8F0]" : "border-[#FDE68A]"}`}>
                    <div className={`p-3 flex items-center justify-between gap-3 ${hasUtr ? "bg-[#FBFBFD] border-b border-[#EEF1F5]" : "bg-[#FFFBEB]"}`}>
                      <div className="min-w-0">
                        <div className={`text-[9.5px] font-medium tracking-wider uppercase ${hasUtr ? "text-[#9CA3AF]" : "text-[#B45309]"}`}>
                          UTR / Reference no.
                        </div>
                        {hasUtr ? (
                          <div className="text-[14px] font-bold text-[#0A0A0A] mt-0.5 break-all">{tx.utr}</div>
                        ) : (
                          <div className="text-[12px] font-medium text-[#92400E] mt-1 leading-snug" data-testid="receipt-utr-pending">
                            Your UTR number will show here once the amount reaches your account.
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!hasUtr}
                        onClick={() => hasUtr && copyToClipboard(tx.utr)}
                        className={`h-8 px-3 rounded-[8px] text-[11.5px] font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                          hasUtr ? "bg-[#7C3AED] text-white active:scale-95 cursor-pointer" : "bg-[#FDE68A]/60 text-[#B45309]/60 cursor-not-allowed"
                        }`}
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>

                    {hasUtr && (
                      <div className="p-3 flex flex-col gap-2 text-[12px]">
                        {destination && (
                          <div className="flex justify-between gap-3">
                            <span className="text-[#6B7280]">Destination</span>
                            <span className="font-semibold text-[#0A0A0A] text-right">{destination}</span>
                          </div>
                        )}
                        {!upi && ifsc && (
                          <div className="flex justify-between gap-3">
                            <span className="text-[#6B7280]">IFSC</span>
                            <span className="font-semibold text-[#0A0A0A]">{ifsc}</span>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <span className="text-[#6B7280]">Channel</span>
                          <span className="font-semibold text-[#0A0A0A]">{channel}</span>
                        </div>
                        {tx.disbursedAt && (
                          <div className="flex justify-between gap-3">
                            <span className="text-[#6B7280]">Disbursed at</span>
                            <span className="font-semibold text-[#0A0A0A] text-right">
                              {new Date(tx.disbursedAt).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Actions: Download GST invoice & Discrepancy Support */}
            <button
              onClick={() => {
                setShowInvoiceModal(selectedReceiptTx.txObj || selectedReceiptTx);
              }}
              className="mt-4 w-full h-12 rounded-[14px] border-[1.5px] border-[#DDD0FF] bg-white text-[#7C3AED] font-semibold text-[13.5px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              Download GST invoice / voucher
            </button>

            <button
              onClick={() => {
                navigate("/help/tickets");
              }}
              className="mt-2.5 w-full h-10 rounded-[12px] bg-[#F2F2F7] text-[#4B5563] text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Discrepancy? Contact finance support
            </button>

            <button
              onClick={() => setSelectedReceiptTx(null)}
              className="mt-2 w-full h-9 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close receipt
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Deliverable Proof Preview Modal */}
      <Presence>{showProofModal && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-white rounded-[20px] p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                                <h4 className="text-[14px] font-bold text-[#0A0A0A]">Deliverable Proof</h4>
              </div>
              <button
                onClick={() => setShowProofModal(null)}
                className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6B7280]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center">
              <div className="w-full h-44 rounded-[14px] bg-slate-950 flex flex-col items-center justify-center text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" />
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white z-20">
                  <Eye className="w-6 h-6" />
                </div>
                <div className="absolute bottom-3 left-3 z-20 text-[11px] font-medium text-white/90">
                  {showProofModal.title}
                </div>
              </div>

              <div className="mt-3 w-full p-3 rounded-[12px] bg-[#F8F8FB] text-[12px] text-[#4B5563] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>Uploaded:</span>
                  <span className="font-semibold text-[#0A0A0A]">{shortDate(showProofModal.submittedAt) || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-[#059669]">Brand in Review</span>
                </div>
              </div>

              <button
                onClick={() => {
                  toast.success("Deliverable link opened in preview");
                  setShowProofModal(null);
                }}
                className="mt-4 w-full h-11 rounded-[12px] bg-[#7C3AED] text-white font-semibold text-[13px] active:scale-95 transition-all cursor-pointer"
              >
                Open Full Asset
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Tax Invoice Modal */}
      <Presence>{showInvoiceModal && (
        <InvoiceModal key="invoicemodal"
          transaction={showInvoiceModal}
          isBrand={false}
          creatorName="You"
          brandName={showInvoiceModal.brandName || "Brand Partner"}
          onClose={() => setShowInvoiceModal(null)}
        />
      )}</Presence>
    </div>
  );
}

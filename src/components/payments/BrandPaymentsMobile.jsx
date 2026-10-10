import React, { useState, useMemo } from "react";
import BrandRefundsCard from "./BrandRefundsCard";
import { Check, Copy, Clock, ShieldCheck, Building2, X, ChevronRight, ChevronLeft, Download, Lock, ArrowUpRight, FileText, RotateCcw, HelpCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import InvoiceModal from "./InvoiceModal";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 33: the escrow sheet sent every payment (campaign too) to the UGC page. A UGC payment
// opens Manage UGC orders; a campaign payment opens its deal chat (approve / changes live there).
export function reviewTargetFor(item) {
  const tx = item?.rawObj || item || {};
  if (tx.ugc_order_id || tx.order_id) return "/brand/ugc/orders";
  const thread = tx.thread_id || tx.contract_id || tx.deal_id;
  return thread ? `/brand/inbox?thread=${encodeURIComponent(thread)}` : "/brand/inbox";
}

export default function BrandPaymentsMobile({
  activeEscrowAmount = 0,
  settledPayoutsAmount = 0,
  activeProtectionsCount = 0,
  past28DaysFunded = 0,
  growthPercent = null,
  transactions = [],
  companyName = "",
  gstin = "",
  onBack = null,
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'escrow' | 'released' | 'refunded'
  const [selectedEscrowTx, setSelectedEscrowTx] = useState(null);
  const [selectedGstTx, setSelectedGstTx] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(null);

  const hasRealGstin = Boolean(
    gstin && 
    typeof gstin === "string" && 
    gstin.trim().length >= 8 && 
    !gstin.includes("1234F1Z5") && 
    gstin.toUpperCase() !== "N/A"
  );

  // Normalize transactions into unified feed
  const brandFeed = useMemo(() => {
    const list = [];

    (transactions || []).forEach((tx) => {
      const isPaid = tx.status === "released" || tx.payout_status === "PAID" || tx.payout_status === "RELEASED" || Boolean(tx.payout_reference || tx.utr_number);
      const isRefunded = tx.status === "refunded" || tx.status === "REFUNDED";
      const isEscrow = !isPaid && !isRefunded;

      const txDate = new Date(tx.created_at || Date.now());
      const monthStr = txDate.toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();

      list.push({
        id: tx.id || tx.transaction_id || tx.contract_id,
        dealId: String(tx.contract_id || tx.deal_id || tx.ugc_order_id || tx.id || "").slice(-7) || "—",
        title: tx.campaign_title || tx.deliverable_type || (tx.brief && tx.brief.title) || (tx.ugc_order_id ? "UGC order" : "Campaign payment"),
        creatorName: tx.creator_name || (tx.users && tx.users.name) || (tx.creator && tx.creator.name) || "Creator",
        amount: Number(tx.gross_amount || tx.amount || 0),
        type: isPaid ? "released" : isRefunded ? "refunded" : "escrow",
        statusLabel: isPaid ? "Released to creator" : isRefunded ? "Refunded to source" : "Secure payment hold locked · in review",
        razorpayId: tx.razorpay_payment_id || tx.payout_reference || tx.utr_number || "—",
        // Server numbers for the receipt (session 23: it used to assume a 5% fee).
        grossAmount: Number(tx.gross_amount || tx.amount || 0),
        feeAmount: tx.platform_fee_amount != null ? Number(tx.platform_fee_amount) : null,
        gstAmount: tx.gst_amount != null ? Number(tx.gst_amount) : null,
        creatorNet: tx.creator_net_amount != null ? Number(tx.creator_net_amount) : null,
        date: tx.created_at || new Date().toISOString(),
        monthLabel: monthStr || "",
        rawObj: tx
      });
    });

    return list;
  }, [transactions]);

  // Tab counts
  const countEscrow = brandFeed.filter((i) => i.type === "escrow").length;
  const countReleased = brandFeed.filter((i) => i.type === "released").length;
  const countRefunded = brandFeed.filter((i) => i.type === "refunded").length;

  const filteredFeed = useMemo(() => {
    if (activeTab === "escrow") return brandFeed.filter((i) => i.type === "escrow");
    if (activeTab === "released") return brandFeed.filter((i) => i.type === "released");
    if (activeTab === "refunded") return brandFeed.filter((i) => i.type === "refunded");
    return brandFeed;
  }, [brandFeed, activeTab]);

  // Group by Month
  const groupedFeed = useMemo(() => {
    const groups = {};
    filteredFeed.forEach((item) => {
      const groupKey = item.monthLabel || "EARLIER";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });
    return groups;
  }, [filteredFeed]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-16">
      {/* 01 TOP HEADER */}
      <header className="bg-white border-b border-[#E5E7EB] px-4 pt-3 pb-3.5 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              type="button"
              className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-[#0A0A0A] shrink-0 cursor-pointer"
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-bold tracking-tight text-[#0A0A0A] leading-tight">
              Payouts
            </h1>
            {hasRealGstin ? (
              <div className="flex items-center gap-1.5 mt-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#059669" className="shrink-0">
                  <path d="M12 2l2.4 1.6 2.9-.2 1 2.7 2.3 1.8-.9 2.8.9 2.8-2.3 1.8-1 2.7-2.9-.2L12 22l-2.4-1.6-2.9.2-1-2.7L3.4 15l.9-2.8-.9-2.8 2.3-1.8 1-2.7 2.9.2z" />
                  <path d="M10.6 15.4l-2.8-2.8 1.2-1.2 1.6 1.6 4-4 1.2 1.2z" fill="#fff" />
                </svg>
                <span className="text-[11px] font-semibold text-[#059669]">
                  GSTIN verified · {gstin}
                </span>
              </div>
            ) : null /* Session 41 (Ravi): short title "Payouts", no "256-bit" badge under it */}
          </div>
        </div>
      </header>

      {/* Session 36: campaign / deal refunds (status, UTR, refund account) */}
      <div className="px-4 pt-3"><BrandRefundsCard /></div>

      {/* 01 HERO METRICS CARD WITH 28-DAY SPEND FLOW GRAPH */}
      <div className="p-4">
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#9061F9] via-[#7C3AED] to-[#4C1D95] p-[18px] text-white shadow-xl shadow-purple-900/30">
          {/* Ambient blur lighting */}
          <div className="absolute -top-[70px] -right-[50px] w-[190px] h-[190px] rounded-full bg-white/20 blur-xl pointer-events-none" />
          <div className="absolute -bottom-[60px] -left-[40px] w-[170px] h-[170px] rounded-full bg-sky-400/20 blur-xl pointer-events-none" />

          {/* BACKGROUND 28-DAY SPEND CURVE (LOW OPACITY BLEND) */}
          <div className="absolute left-0 right-0 bottom-0 h-[105px] pointer-events-none overflow-hidden select-none">
            <svg
              viewBox="0 0 360 100"
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              <defs>
                <linearGradient id="brandCurveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
                  <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                </linearGradient>
                <filter id="brandGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Grid guide lines */}
              <line x1="0" y1="85" x2="360" y2="85" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" strokeWidth="1" />
              <line x1="0" y1="52" x2="360" y2="52" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" strokeWidth="1" />

              {past28DaysFunded > 0 || activeEscrowAmount > 0 ? (
                <>
                  {/* Shaded Area Fill */}
                  <path
                    d="M0,82 C25,78 45,84 70,68 C95,54 115,70 140,56 C165,42 185,52 210,38 C235,24 255,34 280,20 C305,11 325,18 355,8 L360,8 L360,100 L0,100 Z"
                    fill="url(#brandCurveGrad)"
                  />

                  {/* Glowing Stroke Curve */}
                  <path
                    d="M0,82 C25,78 45,84 70,68 C95,54 115,70 140,56 C165,42 185,52 210,38 C235,24 255,34 280,20 C305,11 325,18 355,8"
                    fill="none"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    filter="url(#brandGlow)"
                  />

                  {/* Peak 28-day indicator point */}
                  <circle cx="355" cy="8" r="7" fill="#FFFFFF" opacity="0.25" />
                  <circle cx="355" cy="8" r="3.5" fill="#FFFFFF" />
                </>
              ) : null}
            </svg>
          </div>

          {/* HERO CONTENT */}
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10.5px] font-medium tracking-wider uppercase text-white/75">
                  In secure payment hold
                </div>
                <div className="text-[32px] font-bold tracking-tight text-white mt-1 leading-none">
                  ₹{Number(activeEscrowAmount || 0).toLocaleString("en-IN")}
                </div>
              </div>

              {growthPercent ? (
                <div className="h-[26px] px-2.5 rounded-[9px] bg-white/20 backdrop-blur-md flex items-center gap-1 shrink-0">
                  <ArrowUpRight className="w-3 h-3 text-[#D9FBE9] stroke-[2.8]" />
                  <span className="text-[11px] font-bold text-[#EAFBF2]">{growthPercent}</span>
                </div>
              ) : null}
            </div>

            <div className="text-[10.5px] text-white/70 mt-1 font-normal">
              ₹{Number(past28DaysFunded || 0).toLocaleString("en-IN")} funded in the past 28 days
            </div>

            {/* Split Metrics: Total Spend & Briefs Funded */}
            <div className="mt-3.5 flex gap-2.5">
              <div className="flex-1 p-2.5 rounded-[14px] bg-white/15 border border-white/20 backdrop-blur-sm">
                <div className="text-[9.5px] text-white/75">Total spend (YTD)</div>
                <div className="text-[14px] font-bold text-white mt-0.5">
                  ₹{Number(settledPayoutsAmount || 0).toLocaleString("en-IN")}
                </div>
              </div>
              <div className="flex-1 p-2.5 rounded-[14px] bg-white/15 border border-white/20 backdrop-blur-sm">
                <div className="text-[9.5px] text-white/75">Briefs funded</div>
                <div className="text-[14px] font-bold text-white mt-0.5">
                  {activeProtectionsCount || 0} active
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("all")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "all" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab("secure payment hold")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "escrow" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Locked in a secure payment hold · {countEscrow}
        </button>
        <button
          onClick={() => setActiveTab("released")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "released" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Released · {countReleased}
        </button>
        <button
          onClick={() => setActiveTab("refunded")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "refunded" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Refunded · {countRefunded}
        </button>
      </div>

      {/* FEED GROUPED BY MONTH */}
      <div className="px-4 pt-2 flex-1 flex flex-col gap-4">
        {Object.keys(groupedFeed).length === 0 ? (
          <div className="bg-white rounded-[16px] border border-[#E2E8F0] p-8 text-center text-[#6B7280]">
            <p className="text-sm font-medium">No transactions in this category</p>
          </div>
        ) : (
          Object.entries(groupedFeed).map(([month, items]) => (
            <div key={month} className="flex flex-col gap-2.5">
              <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#6B7280] px-0.5">
                {month}
              </div>

              {items.map((item) => {
                // ESCROW HELD CARD
                if (item.type === "escrow") {
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedEscrowTx(item)}
                      className="bg-white border border-[#E2E8F0] rounded-[16px] p-3 flex items-center gap-3 cursor-pointer hover:border-purple-300 transition-all active:scale-[0.99] shadow-xs"
                    >
                      <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#D9C4E8] to-[#3F2C58] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#0A0A0A] truncate">
                          {item.title}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="h-5 px-1.5 rounded-[5px] bg-[#FFFBEB] flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5 text-[#B45309]" />
                            <span className="text-[10px] font-semibold text-[#B45309]">
                              {item.statusLabel}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-[#9CA3AF]">#{item.dealId}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-[14px] font-bold text-[#0A0A0A]">
                          ₹{item.amount.toLocaleString("en-IN")}
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#C4C4CC]" />
                      </div>
                    </div>
                  );
                }

                // COMPLETED / RELEASED CARD (WITH RAZORPAY ID & GST RECEIPT TRIGGER)
                if (item.type === "released") {
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedGstTx(item)}
                      className="bg-white border border-[#E2E8F0] rounded-[16px] p-3 cursor-pointer hover:border-emerald-300 transition-all active:scale-[0.99] shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#C9DFD2] to-[#2C4438] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-[#0A0A0A] truncate">
                            {item.title}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <div className="h-5 px-1.5 rounded-[5px] bg-[#ECFDF5] flex items-center gap-1">
                              <Check className="w-2.5 h-2.5 text-[#059669] stroke-[3]" />
                              <span className="text-[10px] font-semibold text-[#059669]">
                                Released to creator
                              </span>
                            </div>
                            <span className="text-[10.5px] text-[#9CA3AF]">#{item.dealId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="text-[14px] font-bold text-[#0A0A0A]">
                            ₹{item.amount.toLocaleString("en-IN")}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#C4C4CC]" />
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-[#F8F8FB] border border-[#EEF1F5] w-fit">
                        <span className="text-[9.5px] font-medium tracking-wider text-[#9CA3AF]">RAZORPAY</span>
                        <span className="text-[10px] font-semibold text-[#4B5563]">{item.razorpayId}</span>
                      </div>
                    </div>
                  );
                }

                // REFUNDED CARD
                return (
                  <div
                    key={item.id}
                    className="bg-white border border-[#E2E8F0] rounded-[16px] p-3 flex items-center gap-3 shadow-xs"
                  >
                    <div className="w-10 h-10 rounded-[12px] bg-[#EEF2FF] flex items-center justify-center shrink-0">
                      <RotateCcw className="w-4 h-4 text-[#4F46E5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-[#0A0A0A] truncate">
                        {item.title}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="h-5 px-1.5 rounded-[5px] bg-[#EEF2FF] text-[#4F46E5] text-[10px] font-semibold flex items-center">
                          100% refunded to source
                        </div>
                        <span className="text-[10.5px] text-[#9CA3AF]">Sep 12</span>
                      </div>
                    </div>
                    <div className="text-[14px] font-bold text-[#4F46E5] shrink-0">
                      ₹{item.amount.toLocaleString("en-IN")}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* SCREEN 02: BRAND ESCROW PROTECTION & DECISION SHEET */}
      <Presence>{selectedEscrowTx && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedEscrowTx(null)} className="bg-white rounded-t-[24px] p-5 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-[13px] bg-gradient-to-br from-[#D9C4E8] to-[#3F2C58] shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-[#0A0A0A] leading-tight truncate">
                  {selectedEscrowTx.title}
                </h3>
                <p className="text-[11.5px] text-[#6B7280] mt-0.5">
                  {selectedEscrowTx.creatorName}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[18px] font-bold text-[#0A0A0A]">
                  ₹{selectedEscrowTx.amount.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-[#9CA3AF]">locked</div>
              </div>
            </div>

            {/* Stepper */}
            <div className="mt-5 flex flex-col">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#A7F3D0] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Upfront secure payment hold funded</div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                    Paid via Razorpay · ₹{selectedEscrowTx.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Creator deliverable submitted</div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">2h ago · awaiting your review</div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="w-5 shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#F5F0FF] border-2 border-[#7C3AED]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">Payout release</span>
                    <span className="h-4 px-1.5 rounded-[4px] bg-[#F5F0FF] text-[#7C3AED] text-[9px] font-bold flex items-center">
                      YOUR MOVE
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                    Money stays in the secure payment hold until you approve.
                  </div>
                </div>
              </div>
            </div>

            {/* Decision Actions */}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  const target = reviewTargetFor(selectedEscrowTx);
                  setSelectedEscrowTx(null);
                  navigate(target);
                }}
                className="h-[52px] rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-[0.99] transition-all cursor-pointer"
              >
                Review content &amp; approve payout
              </button>

              <button
                onClick={() => {
                  const target = reviewTargetFor(selectedEscrowTx);
                  setSelectedEscrowTx(null);
                  navigate(target);
                }}
                className="h-12 rounded-[14px] border-[1.5px] border-[#DDD0FF] bg-white text-[#7C3AED] font-semibold text-[14px] active:scale-[0.99] transition-all cursor-pointer"
              >
                Request a revision
              </button>
            </div>

            <div className="mt-3.5 p-3 rounded-[14px] bg-[#ECFDF5] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-[#047857] leading-relaxed">
                Creator ghosted or work unusable? Dispute resolution returns the held amount to your source account within 30 hours.
              </p>
            </div>

            <button
              onClick={() => setSelectedEscrowTx(null)}
              className="mt-2 w-full h-10 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* SCREEN 03: BRAND GST TAX INVOICE & RAZORPAY AUDIT RECEIPT */}
      <Presence>{selectedGstTx && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedGstTx(null)} className="bg-white rounded-t-[24px] p-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />

            <div className="flex flex-col items-center text-center">
              <div className="h-6 px-2.5 rounded-[8px] bg-[#ECFDF5] text-[#047857] text-[11px] font-semibold flex items-center gap-1.5">
                <Check className="w-3 h-3 stroke-[3]" />
                Payment completed &amp; settled
              </div>

              <div className="text-[34px] font-bold tracking-tight text-[#0A0A0A] mt-2 leading-none">
                ₹{selectedGstTx.grossAmount.toLocaleString("en-IN")}
              </div>
              <div className="text-[11.5px] text-[#6B7280] mt-1">
                {selectedGstTx.title} · #{selectedGstTx.dealId}
              </div>
            </div>

            {/* GST Tax Breakdown */}
            <div className="mt-4 rounded-[16px] bg-[#F8F8FB] p-3.5 flex flex-col gap-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Creator payout</span>
                <span className="font-semibold text-[#0A0A0A]">
                  {selectedGstTx.creatorNet != null ? `₹${selectedGstTx.creatorNet.toLocaleString("en-IN")}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Ybex platform fee</span>
                <span className="font-semibold text-[#0A0A0A]">
                  {selectedGstTx.feeAmount != null ? `₹${selectedGstTx.feeAmount.toLocaleString("en-IN")}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">GST on platform fee</span>
                <span className="font-semibold text-[#0A0A0A]">
                  {selectedGstTx.gstAmount != null ? `₹${selectedGstTx.gstAmount.toLocaleString("en-IN")}` : "—"}
                </span>
              </div>
              <div className="h-[1px] bg-[#EAEAF0]" />
              <div className="flex justify-between text-[13px]">
                <span className="font-semibold text-[#0A0A0A]">Total paid</span>
                <span className="font-bold text-[#0A0A0A]">
                  ₹{selectedGstTx.grossAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Billed To Box */}
            <div className="mt-3 rounded-[16px] border border-[#E2E8F0] overflow-hidden">
              <div className="p-3 bg-[#FBFBFD] border-b border-[#EEF1F5]">
                <div className="text-[9.5px] font-medium tracking-wider uppercase text-[#9CA3AF]">
                  Billed to
                </div>
                <div className="text-[13.5px] font-semibold text-[#0A0A0A] mt-0.5">
                  {companyName || "Verified Brand"}
                </div>
                {hasRealGstin ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] font-semibold text-[#4B5563]">GSTIN {gstin}</span>
                    <span className="h-4 px-1.5 rounded-[4px] bg-[#ECFDF5] text-[#047857] text-[9.5px] font-semibold flex items-center">
                      ITC eligible
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-[#6B7280] mt-0.5">
                    Unregistered / Individual Brand
                  </div>
                )}
              </div>

              <div className="p-3 flex flex-col gap-2 text-[12px]">
                <div className="flex justify-between items-center">
                  <span className="text-[#6B7280]">Razorpay ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#0A0A0A]">{selectedGstTx.razorpayId}</span>
                    <button onClick={() => copyToClipboard(selectedGstTx.razorpayId)} className="cursor-pointer">
                      <Copy className="w-3.5 h-3.5 text-[#7C3AED]" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Secure payment hold status</span>
                  <span className="font-semibold text-[#0A0A0A]">Settled &amp; Transferred</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Paid with</span>
                  <span className="font-semibold text-[#0A0A0A]">{selectedGstTx.payment_mode || "Secure Secure Payment Hold Gateway (UPI/Card)"}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => {
                setShowInvoiceModal(selectedGstTx.rawObj || selectedGstTx);
              }}
              className="mt-4 w-full h-[52px] rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-[0.99] transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download GST tax invoice (PDF)
            </button>

            <button
              onClick={() => {
                navigate("/help/tickets");
              }}
              className="mt-2.5 w-full h-10 rounded-[12px] bg-[#F2F2F7] text-[#4B5563] text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Need invoice amended? Contact billing support
            </button>

            <button
              onClick={() => setSelectedGstTx(null)}
              className="mt-2 w-full h-9 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Full PDF invoice modal portal */}
      <Presence>{showInvoiceModal && (
        <InvoiceModal key="invoicemodal"
          transaction={showInvoiceModal}
          isBrand={true}
          creatorName={showInvoiceModal.creatorName || "Content Creator"}
          brandName={companyName}
          onClose={() => setShowInvoiceModal(null)}
        />
      )}</Presence>
    </div>
  );
}

import React, { useState, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { isPaidOut, isRefunded as isRefundedTx } from "../../../backend/adminMoney";
import { Check, Copy, Search, Clock, ShieldCheck, X, ChevronRight, Zap, RotateCcw, ExternalLink, ArrowUpRight, QrCode, CheckCircle2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
/** Session 43 (Ravi: "QR galat hai, apni marzi se generate mat karo"): a real UPI payment QR /
 *  link built ONLY from the creator's registered UPI ID and the exact net amount. No valid UPI ID
 *  → no QR (bank transfer instead). */
export function upiPayUrl(deal) {
  const vpa = String(deal?.upiId || "").trim();
  if (!/^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i.test(vpa)) return null;
  const amount = Number(deal?.netAmount);
  if (!(amount > 0)) return null;
  const q = new URLSearchParams({ pa: vpa, pn: String(deal?.creatorName || "Creator").slice(0, 40), am: amount.toFixed(2), cu: "INR", tn: "Ybex payout" });
  return `upi://pay?${q.toString()}`;
}

export default function AdminPayoutMobile({
  transactions = [],
  vaultHeld = 0,
  readyToPayAmount = 0,
  paidTodayAmount = 0,
  growthPercent = null,
  onPayoutCompleted = null,
}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("ready"); // 'ready' | 'production' | 'transferred' | 'refunds'
  const [selectedDisbursalDeal, setSelectedDisbursalDeal] = useState(null);
  const [paidIds, setPaidIds] = useState([]); // server said "already paid" — move them out at once
  const [utrInput, setUtrInput] = useState("");
  const [disbursalNote, setDisbursalNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSettlement, setCompletedSettlement] = useState(null);
  const [showQrModal, setShowQrModal] = useState(null);

  // Normalize queue items
  const queueItems = useMemo(() => {
    const list = [];

    (transactions || []).forEach((t, index) => {
      // Same lifecycle rules as the desktop escrow desk (EscrowDashboard.jsx isTxDisbursed /
      // isTxRefunded / isTxApprovedByBrand). Mobile used statuses the server never writes, so
      // real brand-approved payouts never showed as "ready" here (session 23).
      // Session 43 (Ravi: paid payouts still in "Ready to release", every tap said "already marked
      // paid"): the SAME rule the server uses to refuse a second payout (backend/adminMoney.ts).
      // Mobile needed UTR *and* a status, so anything with only one of them stayed "ready".
      const isPaid = isPaidOut(t) || paidIds.includes(String(t.id));
      const isRefunded = isRefundedTx(t);
      const isReady = !isPaid && !isRefunded && (
        t.payout_requested === true || t.is_brand_approved === true ||
        t.payout_status === "READY_FOR_RELEASE" || t.payout_status === "PAYOUT_PENDING_ADMIN" ||
        ["COMPLETED", "APPROVED", "CONTENT_APPROVED", "PAYOUT_REQUESTED"].includes(t.deal_status)
      );
      const isProduction = !isPaid && !isRefunded && !isReady;

      // The server's own numbers. The old fallback invented a 12.5% fee and left GST out of the
      // creator's net — the admin could transfer the wrong amount.
      const gross = Number(t.gross_amount || t.amount || 0);
      const fee = Number(t.platform_fee_amount || t.fee_amount || 0);
      const gst = Number(t.gst_amount || 0);
      const net = Number(t.creator_net_amount) || Math.max(0, gross - fee - gst);

      list.push({
        id: t.id,
        // dealId is for DISPLAY only (last 7 chars). It used to be sent to release-payout too —
        // a truncated id matches no deal. The full ids travel in rawObj.
        dealId: String(t.deal_id || t.ugc_order_id || t.contract_id || t.id || "").slice(-7) || "—",
        creatorName: t.creator_name || (t.users && t.users.name) || "Creator Partner",
        brandName: t.brand_name || "Brand Partner",
        deliverableType: t.deliverable_type || t.campaign_title || "UGC edited",
        grossAmount: gross,
        feeAmount: fee,
        netAmount: net,
        type: isPaid ? "transferred" : isRefunded ? "refunds" : isReady ? "ready" : "production",
        timeNotice: isPaid 
          ? `Disbursed · UTR ${t.utr_number || t.payout_reference || 'Confirmed'}` 
          : "Ready for disbursal",
        utr: t.utr_number || t.payout_reference,
        upiId: t.upi_id || t.creator_upi || (t.payment_details && t.payment_details.upi_id) || "",
        bankInfo: t.bank_info || (t.payment_details && t.payment_details.account_number ? `${t.payment_details.bank_name || 'Bank'} ${t.payment_details.account_number} · ${t.payment_details.ifsc || ''}` : ""),
        rawObj: t
      });
    });

    return list;
  }, [transactions, paidIds]);

  const countReady = queueItems.filter((i) => i.type === "ready").length;
  const countProd = queueItems.filter((i) => i.type === "production").length;
  const countTransferred = queueItems.filter((i) => i.type === "transferred").length;
  const countRefunds = queueItems.filter((i) => i.type === "refunds").length;

  const filteredItems = useMemo(() => {
    let res = queueItems;
    if (activeTab === "ready") res = res.filter((i) => i.type === "ready");
    if (activeTab === "production") res = res.filter((i) => i.type === "production");
    if (activeTab === "transferred") res = res.filter((i) => i.type === "transferred");
    if (activeTab === "refunds") res = res.filter((i) => i.type === "refunds");

    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(
        (i) =>
          i.creatorName.toLowerCase().includes(q) ||
          i.brandName.toLowerCase().includes(q) ||
          i.dealId.toLowerCase().includes(q) ||
          (i.utr && i.utr.toLowerCase().includes(q))
      );
    }
    return res;
  }, [queueItems, activeTab, search]);

  const copyDetails = (item) => {
    const text = `Beneficiary: ${item.creatorName}\nAmount: ₹${item.netAmount}\nUPI ID: ${item.upiId}\nBank: ${item.bankInfo}`;
    navigator.clipboard.writeText(text);
    toast.success("Payout beneficiary details copied!");
  };

  const handlePasteUtr = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUtrInput(text.trim().toUpperCase());
        toast.success("UTR pasted!");
      }
    } catch (e) {
      toast.error("Please enter or paste the UTR manually.");
    }
  };

  const handleConfirmDisbursal = async () => {
    if (!utrInput || utrInput.trim().length < 6) {
      toast.error("Please enter a valid 12-digit bank UTR / Reference ID.");
      return;
    }

    try {
      setIsSubmitting(true);
      const deal = selectedDisbursalDeal;

      // Records the payout on the same route the desktop secure payment hold desk uses. The mobile screen used
      // to call admin/payouts/mark-disbursed (no such route), swallow the 404 and announce
      // "disbursed successfully" anyway — nothing was recorded.
      // Same payload as the desktop secure payment hold desk (EscrowDashboard.jsx), with the FULL ids.
      const tx = deal.rawObj || {};
      const targetId = String(tx.deal_id || tx.ugc_order_id || tx.id || "");
      if (!targetId) {
        toast.error("This payout has no deal reference. Use the desktop secure payment hold desk.");
        return;
      }
      const payload = {
        utr_number: utrInput.trim(),
        reason: disbursalNote || "Payout released by admin (mobile)",
        transaction_id: tx.id,
        deal_id: tx.deal_id,
        ugc_order_id: tx.ugc_order_id,
        creator_id: tx.creator_id,
        creator_net_amount: tx.creator_net_amount,
        gross_amount: tx.gross_amount,
      };
      try {
        await api.post(`admin/escrow/${encodeURIComponent(targetId)}/release-payout`, payload);
      } catch (err) {
        if (err?.response?.data?.code === "ALREADY_PAID") {
          toast.info(err.response.data.error || "This payout was already paid. Moved to Transferred.");
          setPaidIds((ids) => [...new Set([...ids, String(tx.id)])]);
          setSelectedDisbursalDeal(null);
          setUtrInput("");
          if (onPayoutCompleted) onPayoutCompleted();
          return;
        }
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not record this payout. Nothing was marked as paid.");
        return;
      }

      toast.success(`₹${deal.netAmount.toLocaleString("en-IN")} disbursed successfully to ${deal.creatorName}!`);
      
      setCompletedSettlement({
        ...deal,
        recordedUtr: utrInput.trim()
      });
      setSelectedDisbursalDeal(null);
      setUtrInput("");
      setDisbursalNote("");

      if (onPayoutCompleted) onPayoutCompleted();
    } catch (e) {
      toast.error("Failed to complete disbursal record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-16">
      {/* 01 ADMIN TOP HEADER */}
      <header className="bg-white border-b border-[#ECECF0] px-4 pt-3 pb-3 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[19px] font-bold tracking-tight text-[#0A0A0A] leading-tight">
            Payout operations
          </h1>
          <div className="h-[26px] px-2.5 rounded-[8px] bg-[#7C3AED] flex items-center gap-1.5 shrink-0">
            <ShieldCheck className="w-3 h-3 text-white stroke-[2.2]" />
            <span className="text-[10px] font-bold tracking-wider text-white">FINANCE</span>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-[#ABABAB] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Creator, brand, UTR or deal ID"
            className="w-full h-[42px] rounded-[13px] bg-[#F2F2F7] pl-10 pr-3 text-[13px] text-[#0A0A0A] placeholder-[#ABABAB] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
          />
        </div>
      </header>

      {/* 01 ADMIN HERO CARD WITH VAULT 28-DAY FLOW CURVE */}
      <div className="p-4">
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#9061F9] via-[#7C3AED] to-[#4C1D95] p-[18px] text-white shadow-xl shadow-purple-900/30">
          <div className="absolute -top-[70px] -right-[50px] w-[190px] h-[190px] rounded-full bg-white/20 blur-xl pointer-events-none" />
          <div className="absolute -bottom-[60px] -left-[40px] w-[170px] h-[170px] rounded-full bg-sky-400/20 blur-xl pointer-events-none" />

          {/* BACKGROUND 28-DAY VAULT CURVE (LOW OPACITY BLEND) */}
          <div className="absolute left-0 right-0 bottom-0 h-[105px] pointer-events-none overflow-hidden select-none">
            <svg
              viewBox="0 0 360 100"
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              <defs>
                <linearGradient id="adminCurveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
                  <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                </linearGradient>
                <filter id="adminGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Grid guide lines */}
              <line x1="0" y1="85" x2="360" y2="85" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" strokeWidth="1" />
              <line x1="0" y1="52" x2="360" y2="52" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" strokeWidth="1" />

              {/* Shaded Area Fill */}
              <path
                d="M0,82 C25,78 45,84 70,68 C95,54 115,70 140,56 C165,42 185,52 210,38 C235,24 255,34 280,20 C305,11 325,18 355,8 L360,8 L360,100 L0,100 Z"
                fill="url(#adminCurveGrad)"
              />

              {/* Glowing Stroke Curve */}
              <path
                d="M0,82 C25,78 45,84 70,68 C95,54 115,70 140,56 C165,42 185,52 210,38 C235,24 255,34 280,20 C305,11 325,18 355,8"
                fill="none"
                stroke="rgba(255,255,255,0.65)"
                strokeWidth="2.2"
                strokeLinecap="round"
                filter="url(#adminGlow)"
              />

              {/* Peak 28-day indicator point */}
              <circle cx="355" cy="8" r="7" fill="#FFFFFF" opacity="0.25" />
              <circle cx="355" cy="8" r="3.5" fill="#FFFFFF" />
            </svg>
          </div>

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10.5px] font-medium tracking-wider uppercase text-white/75">
                  Vault held
                </div>
                <div className="text-[30px] font-bold tracking-tight text-white mt-0.5 leading-none">
                  ₹{Number(vaultHeld || 0).toLocaleString("en-IN")}
                </div>
                <div className="text-[10.5px] text-white/60 mt-1">
                  Across {transactions?.length || 0} briefs · 28-day flow
                </div>
              </div>

              {growthPercent ? (
                <div className="h-[26px] px-2.5 rounded-[9px] bg-white/20 backdrop-blur-md flex items-center gap-1 shrink-0">
                  <ArrowUpRight className="w-3 h-3 text-[#D9FBE9] stroke-[2.8]" />
                  <span className="text-[11px] font-bold text-[#EAFBF2]">{growthPercent}</span>
                </div>
              ) : null}
            </div>

            {/* Sub metrics */}
            <div className="mt-3.5 flex gap-2.5">
              <div className="flex-1 p-2.5 rounded-[14px] bg-white/15 border border-white/20 backdrop-blur-sm">
                <div className="text-[9.5px] text-white/70">Ready to pay · {countReady}</div>
                <div className="text-[14px] font-bold text-white mt-0.5">
                  ₹{Number(readyToPayAmount || 0).toLocaleString("en-IN")}
                </div>
              </div>
              <div className="flex-1 p-2.5 rounded-[14px] bg-slate-950/25">
                <div className="text-[9.5px] text-white/70">Paid today</div>
                <div className="text-[14px] font-bold text-white mt-0.5">
                  ₹{Number(paidTodayAmount || 0).toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("ready")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "ready" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Ready to release · {countReady}
        </button>
        <button
          onClick={() => setActiveTab("production")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "production" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          In production · {countProd}
        </button>
        <button
          onClick={() => setActiveTab("transferred")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "transferred" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Transferred · {countTransferred}
        </button>
        <button
          onClick={() => setActiveTab("refunds")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "refunds" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Refunds · {countRefunds}
        </button>
      </div>

      {/* ADMIN QUEUE LIST */}
      <div className="px-4 pt-2 flex-1 flex flex-col gap-3">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-[18px] border border-[#E2E8F0] p-8 text-center text-[#6B7280]">
            <p className="text-sm font-medium">No payouts matching filter</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-[#E2E8F0] rounded-[18px] overflow-hidden shadow-xs"
            >
              {/* Top row */}
              <div className="p-3 bg-[#FBFBFD] border-b border-[#EEF1F5] flex items-center gap-2">
                <span className="font-bold text-[11px] text-[#0A0A0A]">#{item.dealId}</span>
                <span className="w-1 h-1 rounded-full bg-[#C4C4CC]" />
                <span className="text-[11px] text-[#6B7280] truncate flex-1">{item.brandName}</span>
                <div className="h-5 px-2 rounded-[6px] bg-[#F2F2F7] text-[10px] font-semibold text-[#4B5563] flex items-center">
                  {item.deliverableType}
                </div>
              </div>

              {/* Middle row */}
              <div className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#CBD3E8] to-[#2B3348] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[14px] text-[#0A0A0A]">{item.creatorName}</span>
                      <Check className="w-3 h-3 text-[#059669] stroke-[3]" />
                    </div>
                    <div className="text-[11px] font-medium text-[#6B7280] truncate mt-0.5">
                      UPI {item.upiId}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[16px] font-bold text-[#059669]">
                      ₹{item.netAmount.toLocaleString("en-IN")}
                    </div>
                    <div className="text-[10px] text-[#9CA3AF]">fee ₹{item.feeAmount}</div>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-[#B45309]">
                  <Clock className="w-3 h-3" />
                  <span>{item.timeNotice}</span>
                </div>

                {/* Action Buttons */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => copyDetails(item)}
                    className="h-11 px-3.5 rounded-[13px] bg-[#F2F2F7] hover:bg-[#E5E7EB] text-[#0A0A0A] font-semibold text-[12.5px] flex items-center gap-1.5 shrink-0 active:scale-95 transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy details
                  </button>

                  {item.type === "ready" ? (
                    <button
                      onClick={() => {
                        setSelectedDisbursalDeal(item);
                        setUtrInput("");
                      }}
                      className="flex-1 h-11 rounded-[13px] bg-[#059669] hover:bg-[#047857] text-white font-semibold text-[13.5px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-700/20 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 fill-white" />
                      Pay &amp; release ₹{item.netAmount.toLocaleString("en-IN")}
                    </button>
                  ) : (
                    <div className="flex-1 h-11 rounded-[13px] bg-[#F2F2F7] text-[#6B7280] font-semibold text-[12px] flex items-center justify-center">
                      {item.type === "transferred" ? `Settled (${item.utr || 'UTR saved'})` : "In Production"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* SCREEN 02: DISBURSAL SHEET & UTR ENTRY BOTTOM SHEET */}
      <Presence>{selectedDisbursalDeal && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedDisbursalDeal(null)} className="bg-white rounded-t-[24px] p-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />

            {/* Creator and Amount Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#CBD3E8] to-[#2B3348] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-bold text-[#0A0A0A]">
                    {selectedDisbursalDeal.creatorName}
                  </h3>
                  <Check className="w-3.5 h-3.5 text-[#059669] stroke-[3]" />
                </div>
                <p className="text-[11px] text-[#6B7280]">
                  #{selectedDisbursalDeal.dealId} · KYC verified
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[22px] font-bold text-[#059669]">
                  ₹{selectedDisbursalDeal.netAmount.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-[#7C3AED] font-medium">Fee ₹{selectedDisbursalDeal.feeAmount}</div>
              </div>
            </div>

            {/* Registered Destination */}
            <div className="mt-3.5 rounded-[14px] border border-[#E2E8F0] p-3 flex items-center justify-between">
              <div>
                <div className="text-[9.5px] font-medium tracking-wider uppercase text-[#9CA3AF]">
                  Registered Destination
                </div>
                <div className="text-[12.5px] font-semibold text-[#0A0A0A] mt-0.5">
                  {selectedDisbursalDeal.upiId}
                </div>
                <div className="text-[11px] text-[#6B7280] mt-0.5 truncate">
                  {selectedDisbursalDeal.bankInfo}
                </div>
              </div>
              <button
                onClick={() => copyDetails(selectedDisbursalDeal)}
                className="w-9 h-9 rounded-[11px] bg-[#F2F2F7] flex items-center justify-center text-[#0A0A0A] shrink-0 cursor-pointer"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            {/* 1-Tap UPI Launch / Scan */}
            <div className="mt-3.5 flex gap-3">
              <div
                onClick={() => setShowQrModal(selectedDisbursalDeal)}
                className="w-[94px] h-[94px] rounded-[14px] border border-[#E2E8F0] bg-white p-1.5 flex flex-col items-center justify-center shrink-0 cursor-pointer hover:border-purple-300"
              >
                <div className="w-full h-full rounded-[8px] bg-slate-900 flex flex-col items-center justify-center text-white p-2">
                  <QrCode className="w-9 h-9" />
                  <span className="text-[8.5px] font-semibold text-slate-300 mt-0.5">TAP QR</span>
                </div>
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="text-[9.5px] font-medium tracking-wider uppercase text-[#9CA3AF]">
                  Scan or launch · ₹{selectedDisbursalDeal.netAmount.toLocaleString("en-IN")} pre-filled
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <a
                    href={upiPayUrl(selectedDisbursalDeal) || undefined}
                    className="h-8.5 rounded-[10px] border border-[#E2E8F0] flex items-center justify-center text-[11.5px] font-semibold text-[#0A0A0A] hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    GPay
                  </a>
                  <a
                    href={upiPayUrl(selectedDisbursalDeal) || undefined}
                    className="h-8.5 rounded-[10px] border border-[#E2E8F0] flex items-center justify-center text-[11.5px] font-semibold text-[#0A0A0A] hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    PhonePe
                  </a>
                  <a
                    href={upiPayUrl(selectedDisbursalDeal) || undefined}
                    className="h-8.5 rounded-[10px] border border-[#E2E8F0] flex items-center justify-center text-[11.5px] font-semibold text-[#0A0A0A] hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    Paytm
                  </a>
                  <a
                    href={upiPayUrl(selectedDisbursalDeal) || undefined}
                    className="h-8.5 rounded-[10px] border border-[#E2E8F0] flex items-center justify-center text-[11.5px] font-semibold text-[#0A0A0A] hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    BHIM
                  </a>
                </div>
              </div>
            </div>

            {/* 12-digit UTR Input */}
            <div className="mt-4">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-[#0A0A0A]">
                  12-digit bank UTR / reference ID
                </span>
                <span className="text-[#DC2626] font-bold">*</span>
              </div>

              <div className="mt-2 h-[50px] rounded-[14px] border-[1.5px] border-[#7C3AED] bg-white flex items-center px-3 gap-2">
                <input
                  type="text"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value.toUpperCase())}
                  placeholder="CMS000000000"
                  className="flex-1 font-bold text-[14px] tracking-wider text-[#0A0A0A] placeholder-[#C4C4CC] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handlePasteUtr}
                  className="h-[38px] px-3 rounded-[11px] bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-bold flex items-center gap-1.5 active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Paste
                </button>
              </div>

              <input
                type="text"
                value={disbursalNote}
                onChange={(e) => setDisbursalNote(e.target.value)}
                placeholder="Disbursal note — e.g. IMPS HDFC"
                className="mt-2.5 w-full h-11 rounded-[14px] border border-[#E2E8F0] bg-[#FBFBFD] px-3.5 text-[12.5px] text-[#0A0A0A] placeholder-[#ABABAB] focus:outline-none"
              />
            </div>

            {/* Actions */}
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => {
                  toast.info("Refund review initiated.");
                  setSelectedDisbursalDeal(null);
                }}
                className="h-[52px] px-4 rounded-[14px] border-[1.5px] border-[#FCA5A5] text-[#DC2626] font-semibold text-[13px] shrink-0 cursor-pointer"
              >
                Refund brand
              </button>

              <button
                disabled={!utrInput || utrInput.trim().length < 6 || isSubmitting}
                onClick={handleConfirmDisbursal}
                className={`flex-1 h-[52px] rounded-[14px] font-semibold text-[14.5px] flex items-center justify-center transition-all cursor-pointer ${
                  !utrInput || utrInput.trim().length < 6 || isSubmitting
                    ? "bg-[#D1D5DB] text-white cursor-not-allowed"
                    : "bg-[#059669] text-white shadow-lg shadow-emerald-700/30 active:scale-[0.99]"
                }`}
              >
                {isSubmitting ? "Recording..." : `Confirm & disburse ₹${selectedDisbursalDeal.netAmount.toLocaleString("en-IN")}`}
              </button>
            </div>

            <div className="mt-2 text-center text-[10.5px] text-[#9CA3AF]">
              Enter the UTR to enable disbursal
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* SCREEN 03: SETTLEMENT & AUDIT TRAIL CONFIRMATION */}
      <Presence>{completedSettlement && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setCompletedSettlement(null)} className="bg-white rounded-t-[24px] p-5 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />

            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-[#ECFDF5] flex items-center justify-center">
                <div className="w-11 h-11 rounded-full bg-[#059669] flex items-center justify-center text-white">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
              </div>
              <div className="text-[22px] font-bold text-[#0A0A0A] mt-3 leading-tight">
                ₹{completedSettlement.netAmount.toLocaleString("en-IN")} disbursed
              </div>
              <div className="text-[11.5px] text-[#6B7280] mt-1">
                {completedSettlement.creatorName} · #{completedSettlement.dealId} · IMPS HDFC
              </div>
            </div>

            {/* Locked UTR Card */}
            <div className="mt-4 rounded-[16px] border border-[#E2E8F0] overflow-hidden">
              <div className="p-3 bg-[#FBFBFD] border-b border-[#EEF1F5] flex items-center justify-between">
                <div>
                  <div className="text-[9.5px] font-medium tracking-wider uppercase text-[#9CA3AF]">
                    UTR recorded &amp; locked
                  </div>
                  <div className="text-[14px] font-bold text-[#0A0A0A] mt-0.5">
                    {completedSettlement.recordedUtr}
                  </div>
                </div>
                <Lock className="w-4 h-4 text-[#059669]" />
              </div>

              <div className="p-3 flex flex-col gap-2.5 text-[11.5px] text-[#4B5563]">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#059669] stroke-[3] shrink-0 mt-0.5" />
                  <span>Creator notified — chat message and push sent</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#059669] stroke-[3] shrink-0 mt-0.5" />
                  <span>
                    Escrow vault debited ₹{completedSettlement.netAmount.toLocaleString("en-IN")} · ₹{completedSettlement.feeAmount.toLocaleString("en-IN")} fee moved to revenue
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#059669] stroke-[3] shrink-0 mt-0.5" />
                  <span>Tax invoice auto-generated · #INV-2026-904</span>
                </div>
              </div>
            </div>

            {/* Next Payout button */}
            <button
              onClick={() => {
                setCompletedSettlement(null);
                const nextDeal = queueItems.find((i) => i.type === "ready" && i.id !== completedSettlement.id);
                if (nextDeal) {
                  setSelectedDisbursalDeal(nextDeal);
                  setUtrInput("");
                }
              }}
              className="mt-4 w-full h-[52px] rounded-[14px] bg-[#059669] text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/30 active:scale-[0.99] transition-all cursor-pointer"
            >
              <span>Next payout · {Math.max(0, countReady - 1)} remaining</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCompletedSettlement(null)}
              className="mt-2.5 w-full h-11 rounded-[14px] bg-[#F2F2F7] text-[#0A0A0A] font-semibold text-[13.5px] cursor-pointer"
            >
              Close
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* QR Code Pop-up Modal */}
      <Presence>{showQrModal && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-white rounded-[20px] p-5 w-full max-w-xs text-center shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <span className="text-[13px] font-bold text-gray-900">Scan &amp; Pay UPI</span>
              <button onClick={() => setShowQrModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="my-4 flex justify-center">
              {upiPayUrl(showQrModal) ? (
                <div className="p-3 bg-white rounded-[14px] border border-gray-200" data-testid="payout-upi-qr">
                  <QRCodeSVG value={upiPayUrl(showQrModal)} size={192} level="M" includeMargin={false} />
                </div>
              ) : (
                <div className="w-48 rounded-[14px] bg-amber-50 border border-amber-200 p-4 text-[12px] text-amber-800">
                  No valid UPI ID on this creator's payout account. Pay by bank transfer.
                </div>
              )}
            </div>
            <div className="text-[14px] font-bold text-gray-900">₹{showQrModal.netAmount.toLocaleString("en-IN")}</div>
            <div className="text-[11.5px] text-gray-500 mt-0.5">{showQrModal.upiId}</div>
            <button
              onClick={() => setShowQrModal(null)}
              className="mt-4 w-full h-10 rounded-[12px] bg-[#7C3AED] text-white text-[12px] font-semibold cursor-pointer"
            >
              Done
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </div>
  );
}

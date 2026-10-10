import React, { useState, useEffect } from "react";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../contexts/AuthContext";
import BrandPaymentsMobile from "../../../payments/BrandPaymentsMobile";

const HELD_STATUSES = [
  "deposited", "held", "in_escrow", "video_submitted", "pending", "escrow_held", "active", "approved"
];
const SETTLED_STATUSES = ["released", "completed", "paid", "success"];

export default function PaymentsScreen({ onBack }) {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [brandGstin, setBrandGstin] = useState("");
  const [brandCompanyName, setBrandCompanyName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadEscrowDetails = async () => {
      try {
        setLoading(true);

        // 1. Fetch brand KYC / GST info
        try {
          const { data: kycRes } = await api.get("verifications/me").catch(() => ({ data: null }));
          if (!cancelled && kycRes?.documents) {
            const g = (kycRes.documents.gstin || kycRes.documents.gst_cert || "").trim();
            if (g) setBrandGstin(g);
            if (kycRes.documents.company_name) setBrandCompanyName(kycRes.documents.company_name);
          }
        } catch (e) {
          console.warn("Could not retrieve KYC verification in PaymentsScreen:", e);
        }

        // 2. Fetch brand profile
        try {
          const { data: bProfile } = await api.get("brand-profile").catch(() => ({ data: null }));
          if (!cancelled && bProfile) {
            if (bProfile.company_name || bProfile.name) {
              setBrandCompanyName((prev) => prev || bProfile.company_name || bProfile.name);
            }
            if (bProfile.gstin || bProfile.gst_number) {
              setBrandGstin((prev) => prev || (bProfile.gstin || bProfile.gst_number).trim());
            }
          }
        } catch (e) {
          console.warn("Could not retrieve brand profile in PaymentsScreen:", e);
        }

        // 3. Fetch escrow transactions
        const { data } = await api.get("escrow-transactions", { bypassCache: true }).catch(() => ({ data: null }));
        if (!cancelled) {
          setTxns(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.warn("Failed to load escrow transactions in PaymentsScreen:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadEscrowDetails();

    return () => {
      cancelled = true;
    };
  }, []);

  const amountOf = (t) => Number(t.amount || t.gross_amount || 0);
  const statusOf = (t) => String(t.status || "").toLowerCase();

  const activeEscrowAmount = txns
    .filter((t) => HELD_STATUSES.includes(statusOf(t)))
    .reduce((a, t) => a + amountOf(t), 0);

  const settledPayoutsAmount = txns
    .filter((t) => SETTLED_STATUSES.includes(statusOf(t)))
    .reduce((a, t) => a + amountOf(t), 0);

  const activeProtectionsCount = new Set(
    txns
      .filter((t) => !SETTLED_STATUSES.includes(statusOf(t)))
      .map((t) => t.contract_id || t.id || t.transaction_id)
  ).size;

  const now = Date.now();
  const twentyEightDaysAgo = now - 28 * 24 * 60 * 60 * 1000;
  const past28DaysFunded = txns
    .filter((t) => {
      const tTime = new Date(t.created_at || 0).getTime();
      return tTime >= twentyEightDaysAgo;
    })
    .reduce((acc, curr) => acc + amountOf(curr), 0);

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-sans">
        <header className="bg-white border-b border-[#E5E7EB] px-4 pt-3 pb-3.5 flex items-center gap-3">
          <button
            onClick={onBack}
            type="button"
            className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-[#0A0A0A] shrink-0 cursor-pointer"
          >
            <span className="text-xl">‹</span>
          </button>
          <div>
            <h1 className="text-[20px] font-bold text-[#0A0A0A]">Payouts</h1>
            <p className="text-xs text-slate-400">Loading ledger...</p>
          </div>
        </header>
        <div className="p-4 space-y-4">
          <div className="h-44 bg-slate-200/70 rounded-[24px] animate-pulse" />
          <div className="h-10 bg-slate-200/70 rounded-[12px] animate-pulse" />
          <div className="h-28 bg-slate-200/70 rounded-[18px] animate-pulse" />
          <div className="h-28 bg-slate-200/70 rounded-[18px] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <BrandPaymentsMobile
      activeEscrowAmount={activeEscrowAmount}
      settledPayoutsAmount={settledPayoutsAmount}
      activeProtectionsCount={activeProtectionsCount}
      past28DaysFunded={past28DaysFunded}
      growthPercent={null /* was a hardcoded "+100%" */}
      transactions={txns}
      companyName={brandCompanyName || user?.company_name || user?.name || ""}
      gstin={brandGstin}
      onBack={onBack}
    />
  );
}

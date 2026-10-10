import React, { useEffect, useState } from "react";
import { formatAmount } from "../../utils/safeFormat";
import { api } from "../../lib/api";
import { useLoading } from "../../contexts/LoadingContext";
import { Wallet, Download, Activity } from "lucide-react";
import { toast } from "sonner";
import InvoiceModal from "../../components/payments/InvoiceModal";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";
import CreatorEarningsMobile from "../../components/payments/CreatorEarningsMobile";

import { Presence } from "../../components/common/Popup";
export default function CreatorUGCEarnings() {
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const { user } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const isMobile = useIsMobile();

  useEffect(() => {
    setLoading(true);
    startLoading();
    api.get("ugc/earnings").then(res => {
      setEarnings(res.data);
    }).catch((err) => {
      console.error(err);
      toast.error("Failed to load your earnings. Please try again.");
    }).finally(() => {
      setLoading(false);
      stopLoading();
    });
  }, []);

  // What the creator actually receives: the server attaches creator_net_amount (after the
  // platform fee). creator_payout is the gross order amount and used to be shown as earnings.
  const netOf = (o) => Number(o?.creator_net_amount ?? o?.creator_payout) || 0;
  const grossOf = (o) => Number(o?.gross_amount ?? o?.creator_payout) || 0;

  const handleDownloadCSV = () => {
    if (!earnings.length) {
      toast.error("No earnings data to download.");
      return;
    }
    const headers = ["Brief Title,Completed Date,Gross,Platform Fee,Net Payout"];
    const rows = earnings.map(o => {
      const title = `"${(o.brief?.title || "UGC Order").replace(/"/g, '""')}"`;
      const date = `"${new Date(o.approved_at || o.created_at).toLocaleDateString()}"`;
      return `${title},${date},${grossOf(o)},${Number(o.platform_fee_amount) || 0},${netOf(o)}`;
    });
    const csvContent = headers.concat(rows).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "creator_ugc_earnings.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const total = earnings.reduce((acc, o) => acc + netOf(o), 0);
  const inEscrowOrders = earnings
    .filter((o) => o.payment_status !== "RELEASED" && o.payment_status !== "PAID")
    .reduce((acc, o) => acc + netOf(o), 0);

  const twentyEightDaysAgo = Date.now() - 28 * 24 * 60 * 60 * 1000;
  const ugcPast28Days = earnings
    .filter((o) => new Date(o.approved_at || o.created_at || 0).getTime() >= twentyEightDaysAgo)
    .reduce((acc, o) => acc + netOf(o), 0);

  if (isMobile) {
    return (
      <CreatorEarningsMobile
        loading={loading}
        totalEarned={total}
        inEscrow={inEscrowOrders}
        transactions={earnings.map((e, idx) => ({
          id: e.id || `ugc-${idx}`,
          deal_title: e.brief?.title || "UGC Fast Turnaround Order",
          brand_name: e.brief?.brand_name || "Brand Partner",
          gross_amount: grossOf(e),
          creator_net_amount: netOf(e),
          status: e.approved_at ? "approved" : "video_submitted",
          payout_status: e.payment_status || "HELD",
          created_at: e.approved_at || e.created_at
        }))}
        growthPercent={null /* was a hardcoded "+100%" whenever anything was earned */}
        past28DaysEarned={ugcPast28Days}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-[var(--text-primary)] mb-2">UGC Earnings</h1>
          <p className="text-[var(--text-tertiary)] font-medium">Track your fast payouts from 22-hour turnaround orders.</p>
        </div>
        <button onClick={handleDownloadCSV} className="bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors cursor-pointer">
          <Download size={16} /> Download CSV
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-6 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
          <Wallet className="text-emerald-400 mb-4" size={28}/>
          <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-widest block mb-2">Total UGC Earnings</span>
          <span className="text-5xl font-black num-black text-[var(--text-primary)]">₹{total.toLocaleString()}</span>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-6 rounded-3xl relative overflow-hidden flex flex-col justify-center">
          <Activity className="text-[var(--violet)] mb-4" size={28}/>
          <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-widest block mb-2">Completed Orders</span>
          <span className="text-5xl font-black num-black text-[var(--text-primary)]">{earnings.length}</span>
        </div>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl overflow-hidden mt-8">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[var(--text-secondary)]">
            <thead className="bg-[var(--bg-elevated)] text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">
              <tr>
                <th className="px-6 py-4">Brief</th>
                <th className="px-6 py-4">Completed Date</th>
                <th className="px-6 py-4">Payout</th>
                <th className="px-6 py-4">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {earnings.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-[var(--text-secondary)]">No earnings yet. Start claiming briefs!</td>
                </tr>
              ) : earnings?.map((o) => {
                 const txData = {
                   ...o,
                   id: o.id || `txn-${o.brief_id}`,
                   amount: grossOf(o),
                   created_at: o.approved_at || o.created_at,
                   brand_name: o.brief?.brand_name || "Brand",
                   // RELEASED ≠ PAID: the admin payout desk marks PAID once money reaches the bank.
                   payout_status: o.payment_status || 'RELEASED'
                 };
                 return (
                <tr key={o.id} className="hover:bg-[var(--bg-elevated)] transition-colors">
                  <td className="px-6 py-5 font-bold text-[var(--text-primary)] max-w-[200px] truncate">{o.brief?.title || "UGC Order"}</td>
                  <td className="px-6 py-5">{new Date(o.approved_at || o.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-5 font-black num-black text-[#027A48]">₹{formatAmount(netOf(o))}</td>
                  <td className="px-6 py-5">
                    <button onClick={() => setSelectedInvoice(txData)} className="text-[var(--violet)] hover:text-[var(--text-primary)] transition-colors font-bold text-xs uppercase tracking-widest border border-[var(--violet)]/20 px-3 py-1 rounded-md bg-[var(--violet)]/10 cursor-pointer">View</button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
      
      <Presence>{selectedInvoice && (
        <InvoiceModal key="invoicemodal"
          transaction={selectedInvoice}
          isBrand={false}
          creatorName={user?.name || "Creator Pro"}
          brandName={selectedInvoice.brand_name || "Brand"}
          onClose={() => setSelectedInvoice(null)}
        />
      )}</Presence>
    </div>
  );
}

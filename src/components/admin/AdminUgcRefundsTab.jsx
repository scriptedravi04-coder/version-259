import React, { useState, useEffect } from "react";
import { 
  RotateCcw, Search, CheckCircle2, AlertCircle, Clock, 
  Copy, ExternalLink, ShieldAlert, Check, X, Building2, Smartphone 
} from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import ButtonSpinner from "../common/ButtonSpinner";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
export default function AdminUgcRefundsTab() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "PENDING" | "PROCESSED" | "FAILED"
  
  // Action Modals
  const [processingRefund, setProcessingRefund] = useState(null);
  const [utrInput, setUtrInput] = useState("");
  const [submittingProcess, setSubmittingProcess] = useState(false);

  const [failingRefund, setFailingRefund] = useState(null);
  const [failureReasonInput, setFailureReasonInput] = useState("");
  const [submittingFail, setSubmittingFail] = useState(false);

  const fetchRefunds = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/ugc-refunds");
      setRefunds(res.data || []);
    } catch (err) {
      console.error("Failed to load UGC refunds:", err);
      toast.error("Failed to load UGC refunds");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefunds();
  }, []);

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label || "Details"} copied to clipboard!`);
  };

  const calculateAgeDays = (requestedAt) => {
    if (!requestedAt) return 0;
    const diffMs = Date.now() - new Date(requestedAt).getTime();
    return Math.floor(diffMs / (24 * 3600 * 1000));
  };

  const handleProcessSubmit = async (e) => {
    e?.preventDefault();
    const cleanUtr = utrInput.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      toast.error("Please enter a valid UTR / bank reference number (min 6 characters)");
      return;
    }

    try {
      setSubmittingProcess(true);
      const res = await api.post(`/admin/ugc-refunds/${processingRefund.id}/process`, { utr: cleanUtr });
      toast.success(`Refund of ₹${processingRefund.amount} marked as processed (UTR: ${cleanUtr})`);
      setProcessingRefund(null);
      setUtrInput("");
      fetchRefunds();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.detail || err?.message || "Failed to process refund";
      toast.error(msg);
    } finally {
      setSubmittingProcess(false);
    }
  };

  const handleFailSubmit = async (e) => {
    e?.preventDefault();
    const cleanReason = failureReasonInput.trim();
    if (!cleanReason || cleanReason.length < 4) {
      toast.error("Please enter a clear reason for the failure");
      return;
    }

    try {
      setSubmittingFail(true);
      await api.post(`/admin/ugc-refunds/${failingRefund.id}/fail`, { reason: cleanReason });
      toast.success("Refund marked as failed; brand notified to update details.");
      setFailingRefund(null);
      setFailureReasonInput("");
      fetchRefunds();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.detail || err?.message || "Failed to mark refund as failed";
      toast.error(msg);
    } finally {
      setSubmittingFail(false);
    }
  };

  const pendingRefunds = refunds.filter((r) => r.status === "PENDING");
  const processedRefunds = refunds.filter((r) => r.status === "PROCESSED");
  const failedRefunds = refunds.filter((r) => r.status === "FAILED");

  const totalPendingAmount = pendingRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalProcessedAmount = processedRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const filteredRefunds = refunds.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchBrand = (r.brand_name || "").toLowerCase().includes(q) || (r.brand_email || "").toLowerCase().includes(q);
      const matchBrief = (r.brief_title || "").toLowerCase().includes(q) || (r.brief_id || "").toLowerCase().includes(q);
      const matchUtr = (r.utr || "").toLowerCase().includes(q);
      const snap = r.refund_account_snapshot || {};
      const matchAcc = (snap.bank_account_number || "").includes(q) || (snap.upi_id || "").toLowerCase().includes(q);
      if (!matchBrand && !matchBrief && !matchUtr && !matchAcc) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1 flex items-center justify-between">
            <span>Pending Refunds</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="font-display text-2xl font-black text-amber-600">
            ₹{totalPendingAmount.toLocaleString("en-IN")}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {pendingRefunds.length} brand refunds awaiting payout
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1 flex items-center justify-between">
            <span>Processed Refunds</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="font-display text-2xl font-black text-emerald-600">
            ₹{totalProcessedAmount.toLocaleString("en-IN")}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {processedRefunds.length} refunds completed with UTR
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1 flex items-center justify-between">
            <span>Action Overdue (&gt; 2 days)</span>
            <ShieldAlert size={16} className="text-red-500" />
          </div>
          <div className="font-display text-2xl font-black text-red-600">
            {pendingRefunds.filter((r) => calculateAgeDays(r.requested_at) >= 2).length}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Requires immediate bank transfer
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1 flex items-center justify-between">
            <span>Failed Transfers</span>
            <AlertCircle size={16} className="text-rose-500" />
          </div>
          <div className="font-display text-2xl font-black text-rose-600">
            {failedRefunds.length}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Awaiting brand account update
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-card)] p-3 rounded-2xl border border-[var(--border-default)]">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search by brief, brand, account or UTR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: "all", label: `All (${refunds.length})` },
            { id: "PENDING", label: `Pending (${pendingRefunds.length})` },
            { id: "PROCESSED", label: `Processed (${processedRefunds.length})` },
            { id: "FAILED", label: `Failed (${failedRefunds.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-[var(--violet,#7c3aed)] text-white shadow-xs"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--border-default)]">
              <tr>
                <th className="py-3 px-4">Brief & Brand</th>
                <th className="py-3 px-4">Refund Amount</th>
                <th className="py-3 px-4">Requested & Age</th>
                <th className="py-3 px-4">Beneficiary Account</th>
                <th className="py-3 px-4">Status & Reference</th>
                <th className="py-3 px-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-tertiary)]">
                    Loading refunds queue...
                  </td>
                </tr>
              ) : filteredRefunds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-tertiary)]">
                    No refunds match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRefunds.map((refund) => {
                  const snap = refund.refund_account_snapshot || {};
                  const isUpi = snap.method_type === "UPI" || Boolean(snap.upi_id);
                  const ageDays = calculateAgeDays(refund.requested_at);
                  const isOverdue = refund.status === "PENDING" && ageDays >= 2;

                  return (
                    <tr key={refund.id} className="hover:bg-[var(--bg-elevated)]/50 transition-colors">
                      {/* Brief & Brand */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-[var(--text-primary)]">
                          {refund.brief_title || "UGC Brief"}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {refund.brand_name || "Brand Partner"}
                        </div>
                        {refund.brand_email && (
                          <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
                            {refund.brand_email}
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-sm text-[var(--text-primary)]">
                          ₹{Number(refund.amount || 0).toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          {refund.slots || 1} open slot{Number(refund.slots) === 1 ? "" : "s"}
                        </div>
                      </td>

                      {/* Requested & Age */}
                      <td className="py-3 px-4">
                        <div className="text-[var(--text-secondary)]">
                          {refund.requested_at ? new Date(refund.requested_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </div>
                        <div className="mt-1">
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20">
                              <ShieldAlert size={10} /> {ageDays} days overdue
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {ageDays === 0 ? "Today" : `${ageDays} day${ageDays === 1 ? "" : "s"} ago`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Destination Details */}
                      <td className="py-3 px-4">
                        {snap.missing || (!snap.upi_id && !snap.bank_account_number) ? (
                          <span className="text-[11px] font-semibold text-red-600">No refund account yet — brand has been asked to add one</span>
                        ) : isUpi ? (
                          <div className="flex items-center gap-1.5">
                            <Smartphone size={13} className="text-violet-600 shrink-0" />
                            <span className="font-mono font-bold text-[11px] text-[var(--text-primary)]">
                              {snap.upi_id || "No UPI"}
                            </span>
                            {snap.upi_id && (
                              <button
                                onClick={() => copyToClipboard(snap.upi_id, "UPI ID")}
                                className="p-1 hover:bg-[var(--bg-base)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                title="Copy UPI ID"
                              >
                                <Copy size={11} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <Building2 size={13} className="text-blue-600 shrink-0" />
                              <span className="font-bold text-[11px] text-[var(--text-primary)]">
                                {snap.account_holder_name || "Account Holder"}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                              <span>A/C: {snap.bank_account_number || "••••"}</span>
                              {snap.bank_account_number && (
                                <button
                                  onClick={() => copyToClipboard(snap.bank_account_number, "Account Number")}
                                  className="p-0.5 hover:bg-[var(--bg-base)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                  title="Copy Account Number"
                                >
                                  <Copy size={10} />
                                </button>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                              <span>IFSC: {snap.bank_ifsc || "—"}</span>
                              {snap.bank_ifsc && (
                                <button
                                  onClick={() => copyToClipboard(snap.bank_ifsc, "IFSC")}
                                  className="p-0.5 hover:bg-[var(--bg-base)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                  title="Copy IFSC"
                                >
                                  <Copy size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {refund.status === "PROCESSED" ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              <CheckCircle2 size={11} /> PROCESSED
                            </span>
                            {refund.utr && (
                              <div className="font-mono text-[10px] text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                                <span>UTR: {refund.utr}</span>
                                <button
                                  onClick={() => copyToClipboard(refund.utr, "UTR")}
                                  className="p-0.5 hover:bg-[var(--bg-base)] rounded"
                                >
                                  <Copy size={10} />
                                </button>
                              </div>
                            )}
                          </div>
                        ) : refund.status === "FAILED" ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20">
                              <AlertCircle size={11} /> FAILED
                            </span>
                            {refund.failure_reason && (
                              <div className="text-[10px] text-red-500 mt-1 max-w-xs truncate" title={refund.failure_reason}>
                                {refund.failure_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            <Clock size={11} /> PENDING
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {refund.status === "PENDING" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setFailingRefund(refund);
                                setFailureReasonInput("");
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-red-600 hover:border-red-300 transition-colors cursor-pointer"
                            >
                              Fail
                            </button>
                            <button
                              onClick={() => {
                                setProcessingRefund(refund);
                                setUtrInput("");
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[var(--violet,#7c3aed)] hover:bg-[var(--violet-hover,#6d28d9)] text-white text-[11px] font-bold transition-all shadow-xs cursor-pointer"
                            >
                              Process (UTR)
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-tertiary)]">Complete</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Process UTR Modal */}
      <Presence>{processingRefund && (
        <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <PopupPanel kind="modal" className="bg-[var(--bg-card,#ffffff)] border border-[var(--border-default,#e5e7eb)] rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-[var(--text-primary,#111827)] mb-1">
              Mark Refund as Processed
            </h3>
            <p className="text-xs text-[var(--text-secondary,#6b7280)] mb-4">
              Enter the bank transaction reference (UTR) for ₹{processingRefund.amount} sent to {processingRefund.brand_name || "the brand"}.
            </p>

            <form onSubmit={handleProcessSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary,#6b7280)] uppercase mb-1">
                  Bank Reference (UTR Number)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 427819028471"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-xs font-mono font-bold text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                  autoFocus
                />
              </div>

              {/* AGENTS.md button placement: Secondary on Left, Primary on Right */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-default,#e5e7eb)]">
                <button
                  type="button"
                  onClick={() => setProcessingRefund(null)}
                  disabled={submittingProcess}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default,#e5e7eb)] text-xs font-bold text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProcess || !utrInput.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submittingProcess ? <ButtonSpinner /> : <Check size={14} />}
                  <span>Confirm Payout</span>
                </button>
              </div>
            </form>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Fail Refund Modal */}
      <Presence>{failingRefund && (
        <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <PopupPanel kind="modal" className="bg-[var(--bg-card,#ffffff)] border border-[var(--border-default,#e5e7eb)] rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-red-600 mb-1">
              Mark Refund as Failed
            </h3>
            <p className="text-xs text-[var(--text-secondary,#6b7280)] mb-4">
              State why the bank or UPI transfer could not be completed. The brand will be notified with this message.
            </p>

            <form onSubmit={handleFailSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary,#6b7280)] uppercase mb-1">
                  Failure Reason
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Beneficiary bank account is closed / Invalid IFSC code provided"
                  value={failureReasonInput}
                  onChange={(e) => setFailureReasonInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-red-500"
                  autoFocus
                />
              </div>

              {/* AGENTS.md button placement: Secondary on Left, Primary on Right */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-default,#e5e7eb)]">
                <button
                  type="button"
                  onClick={() => setFailingRefund(null)}
                  disabled={submittingFail}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default,#e5e7eb)] text-xs font-bold text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFail || !failureReasonInput.trim()}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submittingFail ? <ButtonSpinner /> : <X size={14} />}
                  <span>Mark Failed & Notify</span>
                </button>
              </div>
            </form>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </div>
  );
}

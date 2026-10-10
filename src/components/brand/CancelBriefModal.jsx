import React, { useState, useEffect } from "react";
import { X, AlertCircle, Building2, Smartphone, ShieldCheck, Check } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import ButtonSpinner from "../common/ButtonSpinner";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
function CancelBriefModalBody({ isOpen, onClose, brief, onSuccess }) {
  const [methodType, setMethodType] = useState("UPI"); // "UPI" | "BANK"
  const [upiId, setUpiId] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountConfirm, setBankAccountConfirm] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [savedAccount, setSavedAccount] = useState(null);
  const [useSaved, setUseSaved] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Session 24: amount and slots come from the server (same calculation as the cancel itself).
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);

  useEffect(() => {
    if (!isOpen || !brief) return;

    // Fetch saved brand refund account
    const loadSaved = async () => {
      try {
        setLoadingSaved(true);
        const res = await api.get("/brand/refund-account");
        if (res.data?.refund_account) {
          setSavedAccount(res.data.refund_account);
          setUseSaved(true);
        }
      } catch (err) {
        // Ignored, brand will type details
      } finally {
        setLoadingSaved(false);
      }
    };
    loadSaved();
    setQuote(null);
    setQuoteError(null);
    api.get(`/ugc/briefs/${brief.id}/cancel-quote`)
      .then((r) => setQuote(r.data))
      .catch((e) => setQuoteError(e?.response?.data?.error || "Couldn't load the refund amount."));
  }, [isOpen, brief]);

  if (!isOpen || !brief) return null;

  const openSlots = Number(quote?.open_slots) || 0;
  const perCreatorBudget = Number(quote?.per_slot) || 0;
  const refundAmount = Number(quote?.amount) || 0;
  const workingSlots = Number(quote?.working_slots) || 0;

  const cancelAtMs = quote?.can_cancel_at ? Date.parse(quote.can_cancel_at) : Date.parse(brief.created_at || 0) + 24 * 3600 * 1000;
  const isWithin24h = Date.now() < cancelAtMs;
  const hoursLeft = Math.max(1, Math.ceil((cancelAtMs - Date.now()) / (3600 * 1000)));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!quote) {
      toast.error(quoteError || "Loading the refund amount…");
      return;
    }
    if (isWithin24h) {
      toast.error(`Brief can be cancelled 24 hours after posting. (${hoursLeft}h remaining)`);
      return;
    }

    if (openSlots <= 0) {
      toast.error("No open slots available to cancel on this brief.");
      return;
    }

    let payload = {};
    if (useSaved && savedAccount) {
      // Server will use saved brand refund account
      payload = {};
    } else if (methodType === "UPI") {
      const trimmedUpi = upiId.trim();
      if (!trimmedUpi || !trimmedUpi.includes("@")) {
        toast.error("Please enter a valid UPI ID (e.g. name@okhdfcbank)");
        return;
      }
      payload = {
        method_type: "UPI",
        upi_id: trimmedUpi
      };
    } else {
      const cleanAcc = bankAccount.replace(/\s+/g, "");
      const cleanConfirm = bankAccountConfirm.replace(/\s+/g, "");
      const cleanIfsc = bankIfsc.trim().toUpperCase();
      const cleanHolder = accountHolder.trim();

      if (!cleanAcc || cleanAcc.length < 9 || cleanAcc.length > 18) {
        toast.error("Account number should be 9 to 18 digits");
        return;
      }
      if (cleanAcc !== cleanConfirm) {
        toast.error("Bank account numbers do not match");
        return;
      }
      if (!cleanIfsc || cleanIfsc.length !== 11) {
        toast.error("Enter a valid 11-character IFSC code");
        return;
      }
      if (!cleanHolder || cleanHolder.length < 2) {
        toast.error("Enter the account holder name");
        return;
      }

      payload = {
        method_type: "BANK",
        bank_account_number: cleanAcc,
        bank_account_confirm: cleanConfirm,
        bank_ifsc: cleanIfsc,
        account_holder_name: cleanHolder
      };
    }

    try {
      setSubmitting(true);
      const res = await api.post(`/ugc/briefs/${brief.id}/cancel`, payload);
      toast.success(res.data?.message || `Brief cancelled. Refund of ₹${refundAmount} requested.`);
      if (onSuccess) onSuccess(res.data);
      onClose();
    } catch (err) {
      console.error("Cancel brief error:", err);
      const msg = err?.response?.data?.error || err?.response?.data?.detail || err?.message || "Failed to cancel brief";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <PopupPanel kind="modal" className="bg-[var(--bg-card,#ffffff)] border border-[var(--border-default,#e5e7eb)] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-default,#e5e7eb)] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center">
              <AlertCircle size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary,#111827)]">
                Cancel Brief & Request Refund
              </h3>
              <p className="text-xs text-[var(--text-secondary,#6b7280)]">
                {brief.title || "UGC Brief"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-tertiary,#9ca3af)] hover:text-[var(--text-primary,#111827)] hover:bg-[var(--bg-elevated,#f3f4f6)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 24-hour rule warning if not eligible */}
        {isWithin24h ? (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs mb-4 flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Cancellation window opens 24 hours after posting</p>
              <p className="mt-1 leading-relaxed">
                As part of the Ybex SafePay guarantee, creators have the initial 24 hours to discover and claim your brief. You can cancel and claim a 100% refund for open slots in approximately <strong>{hoursLeft} hours</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs mb-4 flex items-center gap-2">
            <ShieldCheck size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <span className="font-bold">Ybex SafePay Refund: </span>
              <span>100% refundable for all {openSlots} open slots.</span>
            </div>
          </div>
        )}

        {/* Slot & Amount Summary */}
        <div className="bg-[var(--bg-elevated,#f9fafb)] rounded-xl p-4 border border-[var(--border-default,#e5e7eb)] mb-5">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-[var(--text-secondary,#6b7280)] font-medium">Open Unclaimed Slots:</span>
            <span className="font-bold text-[var(--text-primary,#111827)]">{openSlots} of {openSlots + workingSlots}</span>
          </div>
          {workingSlots > 0 && (
            <div className="flex justify-between items-center text-xs mb-2 text-amber-600 dark:text-amber-400">
              <span>Slots In Progress:</span>
              <span className="font-bold">{workingSlots} (creators actively delivering)</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm pt-2 border-t border-[var(--border-default,#e5e7eb)]">
            <span className="font-bold text-[var(--text-primary,#111827)]">Total Refund Amount:</span>
            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
              ₹{refundAmount.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Refund Account Selection */}
        {!isWithin24h && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {savedAccount && (
              <div className="p-3.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)]">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSaved}
                    onChange={(e) => setUseSaved(e.target.checked)}
                    className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[var(--text-primary,#111827)]">Use Saved Refund Account</span>
                    <p className="text-[var(--text-secondary,#6b7280)]">
                      {savedAccount.method_type === "UPI" 
                        ? `UPI: ${savedAccount.upi_id}`
                        : `Bank: •••• ${savedAccount.account_last4} (${savedAccount.bank_ifsc || ""})`}
                    </p>
                  </div>
                </label>
              </div>
            )}

            {(!useSaved || !savedAccount) && (
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary,#6b7280)] uppercase tracking-wider mb-2">
                  Refund Destination
                </label>
                
                {/* Method selector */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setMethodType("UPI")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      methodType === "UPI"
                        ? "border-[var(--violet,#7c3aed)] bg-[var(--violet,#7c3aed)]/10 text-[var(--violet,#7c3aed)]"
                        : "border-[var(--border-default,#e5e7eb)] text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)]"
                    }`}
                  >
                    <Smartphone size={14} /> UPI ID
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethodType("BANK")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      methodType === "BANK"
                        ? "border-[var(--violet,#7c3aed)] bg-[var(--violet,#7c3aed)]/10 text-[var(--violet,#7c3aed)]"
                        : "border-[var(--border-default,#e5e7eb)] text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)]"
                    }`}
                  >
                    <Building2 size={14} /> Bank Account
                  </button>
                </div>

                {methodType === "UPI" ? (
                  <div>
                    <input
                      type="text"
                      placeholder="e.g. yourname@okhdfcbank"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary,#9ca3af)] mt-1">
                      Direct instant IMPS/UPI refund. Ensure your VPA is active.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      placeholder="Account Holder Name (as in bank records)"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <input
                      type="password"
                      placeholder="Bank Account Number"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <input
                      type="text"
                      placeholder="Confirm Bank Account Number"
                      value={bankAccountConfirm}
                      onChange={(e) => setBankAccountConfirm(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <input
                      type="text"
                      placeholder="IFSC Code (e.g. HDFC0001234)"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-xs text-[var(--text-primary,#111827)] uppercase focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions - Following AGENTS.md button placement: Secondary on Left, Primary on Right */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--border-default,#e5e7eb)]">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] text-xs font-bold text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)] transition-colors cursor-pointer"
              >
                Keep Brief Active
              </button>

              <button
                type="submit"
                disabled={submitting || !quote || isWithin24h || openSlots <= 0}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <ButtonSpinner />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Cancel & Request ₹{refundAmount.toLocaleString("en-IN")}</span>
                )}
              </button>
            </div>
          </form>
        )}

        {isWithin24h && (
          <div className="flex items-center justify-end pt-4 border-t border-[var(--border-default,#e5e7eb)]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-[var(--bg-elevated,#f3f4f6)] text-xs font-bold text-[var(--text-primary,#111827)] hover:bg-[var(--border-default,#e5e7eb)] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </PopupPanel>
    </PopupBackdrop>
  );
}

// Session 37: stays mounted for its closing animation.
export default function CancelBriefModal(props) {
  return <Presence>{props.isOpen && props.brief && <CancelBriefModalBody key="cancelbriefmodal" {...props} />}</Presence>;
}


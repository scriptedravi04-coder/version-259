import React, { useEffect, useState } from "react";
import { RotateCcw, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 24. The real refund state of a cancelled brief (it used to say "Refund in process"
// forever): processing → refunded (with UTR) → or failed with "update your refund account",
// which re-queues the refund on the server (POST /brand/refund-account).

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

function FixAccount({ onClose, onSaved }) {
  const [type, setType] = useState("UPI");
  const [f, setF] = useState({ upi: "", acc: "", acc2: "", ifsc: "", holder: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const body = type === "UPI"
        ? { method_type: "UPI", upi_id: f.upi.trim() }
        : { method_type: "BANK", bank_account_number: f.acc.replace(/\s+/g, ""), bank_account_confirm: f.acc2.replace(/\s+/g, ""), bank_ifsc: f.ifsc.trim().toUpperCase(), account_holder_name: f.holder.trim() };
      await api.post("/brand/refund-account", body);
      toast.success("Refund account updated. We'll send your refund to it.");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't save the account.");
    } finally {
      setBusy(false);
    }
  };
  const input = "w-full h-10 px-3 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-card,#fff)] text-sm";
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <PopupBackdrop className="absolute inset-0 bg-black/50" onClick={onClose} />
      <PopupPanel kind="modal" className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-card,#fff)] p-5 shadow-2xl space-y-3" role="dialog" aria-label="Update refund account">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[var(--text-primary,#111827)]">Update refund account</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-black/5"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-elevated,#f3f4f6)]">
          {["UPI", "BANK"].map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`h-9 rounded-lg text-sm font-semibold ${type === t ? "bg-white shadow-sm" : "text-[var(--text-secondary,#6b7280)]"}`}>
              {t === "UPI" ? "UPI" : "Bank account"}
            </button>
          ))}
        </div>
        {type === "UPI" ? (
          <input className={input} placeholder="yourname@bank" value={f.upi} onChange={set("upi")} autoCapitalize="none" />
        ) : (
          <>
            <input className={input} placeholder="Account holder name" value={f.holder} onChange={set("holder")} />
            <input className={input} placeholder="Account number" inputMode="numeric" value={f.acc} onChange={set("acc")} />
            <input className={input} placeholder="Re-enter account number" inputMode="numeric" value={f.acc2} onChange={set("acc2")} />
            <input className={`${input} uppercase`} placeholder="IFSC" value={f.ifsc} onChange={set("ifsc")} />
          </>
        )}
        <button onClick={save} disabled={busy} className="w-full h-11 rounded-xl bg-[#7C3AED] text-white font-bold text-sm disabled:opacity-60">
          {busy ? "Saving…" : "Save & resend refund"}
        </button>
      </PopupPanel>
    </div>
  );
}

export default function BriefRefundStatus({ briefId, compact = false }) {
  const [refund, setRefund] = useState(undefined);
  const [fixing, setFixing] = useState(false);
  const load = () => {
    api.get(`/ugc/briefs/${briefId}/refund`)
      .then((r) => setRefund(r.data?.refund || null))
      .catch(() => setRefund(null));
  };
  useEffect(() => { if (briefId) load(); }, [briefId]);

  const size = compact ? "text-[11px]" : "text-xs";
  if (refund === undefined) return <span className={`${size} text-[var(--text-tertiary,#9ca3af)]`}>Checking refund…</span>;
  if (!refund) return <span className={`${size} font-semibold text-slate-500`}>Brief cancelled</span>;

  if (refund.status === "PROCESSED") {
    return (
      <span className={`${size} font-semibold text-emerald-600 inline-flex items-center gap-1`} data-testid="brief-refund-status">
        <CheckCircle2 size={13} /> Refunded {fmt(refund.amount)} on {fmtDate(refund.processed_at)}{refund.utr ? ` · UTR ${refund.utr}` : ""}
      </span>
    );
  }
  if (refund.status === "FAILED") {
    return (
      <span className={`${size} font-semibold text-red-600 inline-flex items-center gap-1.5 flex-wrap`} data-testid="brief-refund-status">
        <AlertTriangle size={13} /> Refund couldn't be sent{refund.failure_reason ? `: ${refund.failure_reason}` : ""}.
        <button type="button" onClick={() => setFixing(true)} className="underline font-bold cursor-pointer">Update account</button>
        <Presence>{fixing && <FixAccount key="fixaccount" onClose={() => setFixing(false)} onSaved={load} />}</Presence>
      </span>
    );
  }
  return (
    <span className={`${size} font-semibold text-amber-600 inline-flex items-center gap-1`} data-testid="brief-refund-status">
      <RotateCcw size={13} /> Refund of {fmt(refund.amount)} processing — within 1–2 working days
    </span>
  );
}

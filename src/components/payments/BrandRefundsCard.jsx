import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, CheckCircle2, Clock } from "lucide-react";
import { api } from "../../lib/api";

// Session 36 (Ravi): campaign / deal refunds, like UGC. Shows every refund with its status and UTR, and
// asks once for a refund account (UPI or bank — the same one UGC uses) when a refund is waiting.
// Renders nothing when the brand has no refunds.
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

export function RefundAccountForm({ onSaved, compact = false }) {
  const [type, setType] = useState("UPI");
  const [f, setF] = useState({ upi_id: "", account_no: "", confirm_account_no: "", ifsc: "", holder_name: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      await api.post("/brand/refund-account", { method_type: type, account_details: f, upi_id: type === "UPI" ? f.upi_id : undefined });
      toast.success("Refund account saved.");
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not save the refund account.");
    } finally { setBusy(false); }
  };
  const input = "w-full px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-sm";
  return (
    <div className={compact ? "space-y-2" : "space-y-3"} data-testid="refund-account-form">
      <div className="flex gap-2">
        {["UPI", "BANK"].map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${type === t ? "bg-[var(--violet)] text-white border-transparent" : "border-[var(--border-default)]"}`}>
            {t === "UPI" ? "UPI ID" : "Bank account"}
          </button>
        ))}
      </div>
      {type === "UPI" ? (
        <input className={input} placeholder="name@bank" value={f.upi_id} onChange={set("upi_id")} />
      ) : (
        <>
          <input className={input} placeholder="Account holder name" value={f.holder_name} onChange={set("holder_name")} />
          <input className={input} placeholder="Account number" inputMode="numeric" value={f.account_no} onChange={set("account_no")} />
          <input className={input} placeholder="Confirm account number" inputMode="numeric" value={f.confirm_account_no} onChange={set("confirm_account_no")} />
          <input className={input} placeholder="IFSC" value={f.ifsc} onChange={set("ifsc")} />
        </>
      )}
      <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-[var(--violet)] text-white text-sm font-semibold disabled:opacity-50">
        {busy ? "Saving…" : "Save refund account"}
      </button>
      <p className="text-[11px] text-[var(--text-secondary)]">Used only to send you refunds. The same account is used for UGC refunds.</p>
    </div>
  );
}

export default function BrandRefundsCard({ className = "" }) {
  const [data, setData] = useState(null);
  const load = () => api.get("/brand/refunds").then((r) => setData(r.data)).catch(() => setData({ refunds: [] }));
  useEffect(() => { load(); }, []);
  const refunds = data?.refunds || [];
  if (refunds.length === 0) return null;
  const waiting = refunds.some((r) => r.status === "PENDING");

  return (
    <div className={`rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 ${className}`} data-testid="brand-refunds">
      <div className="flex items-center gap-2 mb-3">
        <RotateCcw size={16} className="text-[var(--violet)]" />
        <h3 className="font-bold text-[var(--text-primary)] text-sm">Refunds</h3>
      </div>
      {waiting && !data.has_refund_account && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-2">A refund is waiting. Add where we should send it:</p>
          <RefundAccountForm compact onSaved={load} />
        </div>
      )}
      <ul className="divide-y divide-[var(--border-default)]">
        {refunds.map((r) => (
          <li key={r.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)]">{inr(r.amount)}</div>
              {r.reason && <div className="text-xs text-[var(--text-secondary)] truncate">{r.reason}</div>}
              {r.reference && <div className="text-xs font-mono text-emerald-700 mt-0.5">UTR {r.reference}</div>}
            </div>
            <div className="text-right shrink-0">
              {r.status === "PROCESSED" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} /> Sent {fmt(r.refunded_at)}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock size={13} /> Processing</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

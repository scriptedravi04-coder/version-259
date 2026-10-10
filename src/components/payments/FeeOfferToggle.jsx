import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { api } from "../../lib/api";

// Session 36 (Ravi): "₹0 platform fee + convenience fee" switch. Needs the admin's password every time.
// Applies to deals paid while it is ON; already-paid deals keep their fee (stamped at payment).
export default function FeeOfferToggle() {
  const [cfg, setCfg] = useState(null);
  const [pct, setPct] = useState(2);
  const [label, setLabel] = useState("Festive offer");
  const [line, setLine] = useState("");
  const [until, setUntil] = useState("");
  const PRESETS = ["🪔 Diwali offer", "🎨 Holi special", "🎉 Festive offer", "🚀 Launch offer"];
  const [ask, setAsk] = useState(null); // true = turning on, false = turning off
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("admin/fee-config").then((r) => {
    const c = r.data || {};
    setCfg(c); setPct(Number(c.offer_fee_pct ?? 2)); setLabel(c.offer_label || "Festive offer");
    setLine(c.offer_promo_line || ""); setUntil(c.offer_line_until ? String(c.offer_line_until).slice(0, 10) : "");
  }).catch(() => setCfg({}));
  useEffect(() => { load(); }, []);
  const on = cfg?.offer_mode === true;

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post("admin/fee-offer", { on: ask, pct: Number(pct), label, password, promo_line: line, line_until: until || null });
      toast.success(ask ? `Offer ON: ₹0 platform fee + ${pct}% convenience fee for new payments.` : "Offer OFF: normal fee for new payments.");
      setAsk(null); setPassword(""); load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not change the offer.");
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 mb-6" data-testid="fee-offer-toggle">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-bold text-sm">Offer: ₹0 platform fee + convenience fee</h4>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xl">
            While ON, deals paid by brands get only the convenience fee below instead of the normal fee. Users see it before signing.
            Deals already paid keep their fee, even after you switch this off.
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${on ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{on ? `ON · ${cfg?.offer_fee_pct ?? pct}%` : "OFF"}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">Convenience fee %
          <input type="number" min="0" max="15" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} disabled={on}
            className="block mt-1 w-24 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm" />
        </label>
        <label className="text-xs font-semibold">Name shown to users
          <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={on} maxLength={40}
            className="block mt-1 w-48 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm" />
        </label>
        <div className="w-full">
          <label className="text-xs font-semibold block">Promotional line (shown to creators while the offer is on)
            <input value={line} onChange={(e) => setLine(e.target.value)} disabled={on} maxLength={90} placeholder="🪔 Diwali offer — till 31 Oct"
              className="block mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm" />
          </label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {PRESETS.map((p) => <button key={p} type="button" disabled={on} onClick={() => setLine(p)} className="px-2 py-1 rounded-lg border border-[var(--border-default)] text-[11px]">{p}</button>)}
          </div>
          <label className="text-xs font-semibold block mt-2">Hide the line after (optional)
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} disabled={on}
              className="block mt-1 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm" />
          </label>
          <p className="text-[11px] text-[var(--text-secondary)] mt-2">Preview: <b>🎉 {(line || label || "Offer").replace(/\d+(\.\d+)?\s*%/g, "").trim()} · ₹0 platform fee, {pct}% convenience fee</b> — the % is added from the real setting.</p>
        </div>
        <button type="button" onClick={() => setAsk(!on)} className={`px-4 py-2 rounded-xl text-sm font-semibold text-white ${on ? "bg-gray-700" : "bg-[#9D7CFF]"}`}>
          {on ? "Turn offer OFF" : "Turn offer ON"}
        </button>
      </div>
      {ask !== null && (
        <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1"><Lock size={13} /> Confirm with your password</p>
          <p className="text-xs text-amber-900 mt-1">
            {ask ? `All NEW payments will have ₹0 platform fee + ${pct}% convenience fee ("${label}").` : "All NEW payments will go back to the normal fee."}
          </p>
          <div className="mt-2 flex gap-2">
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password"
              className="flex-1 px-3 py-2 rounded-xl border border-amber-300 bg-white text-sm" />
            <button type="button" disabled={busy || !password} onClick={confirm} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? "…" : "Confirm"}</button>
            <button type="button" onClick={() => { setAsk(null); setPassword(""); }} className="px-3 py-2 rounded-xl border border-amber-300 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

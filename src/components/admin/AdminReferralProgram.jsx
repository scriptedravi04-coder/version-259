import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";

// Session 36: referral programme — settings, creator numbers (for investors), referrals, withdrawals.
const FIELDS = [
  ["signups_per_reward", "Joins needed per reward"],
  ["free_deals_per_reward", "0% fee deals per reward"],
  ["free_deals_valid_days", "Free deals valid (days)"],
  ["featured_days", "Featured (days)"],
  ["share_pct_of_earnings", "Share of friend's earnings after fee (%)"],
  ["share_cap_per_creator", "Share cap per invited creator (₹)"],
  ["min_withdraw", "Minimum withdrawal (₹)"],
  ["monthly_cap_per_user", "Max joins counted per month"],
];
const NUMBERS = [
  ["creator_accounts", "Creator accounts"], ["creator_accounts_last_30_days", "New in 30 days"],
  ["approved_creator_profiles", "Approved creator profiles"], ["applications_total", "Applications"],
  ["applications_pending", "Applications pending"], ["referral_joins", "Joins via referral"],
  ["referral_joins_last_30_days", "Referral joins (30 days)"], ["creators_from_referral_pct", "% creators from referral"],
];

export default function AdminReferralProgram() {
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState({});
  const [list, setList] = useState([]);
  const [wd, setWd] = useState([]);
  const load = async () => {
    try {
      const [p, l, w] = await Promise.all([api.get("admin/referral-program"), api.get("admin/referral-list"), api.get("admin/referral-withdrawals")]);
      setData(p.data); setCfg(p.data?.config || {}); setList(l.data?.referrals || []); setWd(w.data?.withdrawals || []);
    } catch { toast.error("Could not load the referral programme."); }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    try { await api.put("admin/referral-program", cfg); toast.success("Saved."); load(); }
    catch (e) { toast.error(e?.response?.data?.error || "Could not save."); }
  };
  const act = async (id, action) => {
    const body = {};
    if (action === "paid") { const utr = window.prompt("UTR / bank reference"); if (!utr) return; body.utr = utr; }
    try { await api.post(`admin/referral-withdrawals/${id}/${action}`, body); load(); } catch (e) { toast.error(e?.response?.data?.error || "Failed"); }
  };
  const reject = async (id) => { if (!window.confirm("Do not count this referral?")) return; await api.post(`admin/referrals/${id}/reject`).catch(() => {}); load(); };
  if (!data) return <div className="p-4 text-sm">Loading…</div>;
  const input = "w-full px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm";
  return (
    <div className="space-y-6" data-testid="admin-referral-program">
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <h4 className="font-bold text-sm mb-3">Creator numbers</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {NUMBERS.map(([k, l]) => <div key={k} className="rounded-xl bg-[var(--bg-elevated)] p-3"><div className="text-xl font-bold">{data.numbers?.[k] ?? 0}{k.endsWith("_pct") ? "%" : ""}</div><div className="text-[11px] text-[var(--text-secondary)]">{l}</div></div>)}
        </div>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-sm">Rewards</h4>
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={cfg.is_active !== false} onChange={(e) => setCfg({ ...cfg, is_active: e.target.checked })} /> Programme on</label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FIELDS.map(([k, l]) => <label key={k} className="text-[11px] font-semibold">{l}<input type="number" className={input} value={cfg[k] ?? ""} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></label>)}
        </div>
        <button onClick={save} className="mt-4 px-4 py-2 rounded-xl bg-[#9D7CFF] text-white text-sm font-semibold">Save</button>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <h4 className="font-bold text-sm mb-3">Withdrawal requests</h4>
        {wd.length === 0 ? <p className="text-xs text-[var(--text-secondary)]">None yet.</p> : (
          <table className="w-full text-xs"><tbody>{wd.map((w) => (
            <tr key={w.id} className="border-t border-[var(--border-default)]">
              <td className="p-2 font-mono">{w.user_id}</td><td className="p-2">₹{w.amount}</td><td className="p-2">{w.status}{w.utr ? ` · ${w.utr}` : ""}</td>
              <td className="p-2 text-right">{w.status === "requested" && <><button onClick={() => act(w.id, "paid")} className="px-2 py-1 rounded-lg border mr-1">Mark paid</button><button onClick={() => act(w.id, "reject")} className="px-2 py-1 rounded-lg border">Reject</button></>}</td>
            </tr>))}</tbody></table>
        )}
        <p className="text-[11px] text-[var(--text-secondary)] mt-2">Send to the creator's payout UPI/bank (Admin → user → payout method), then mark paid with the UTR.</p>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <h4 className="font-bold text-sm mb-3">Latest referrals</h4>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs"><tbody>{list.map((r) => (
            <tr key={r.id} className="border-t border-[var(--border-default)]">
              <td className="p-2 font-mono">{r.referrer_id}</td><td className="p-2 font-mono">{r.referred_id}</td><td className="p-2">{r.status}</td>
              <td className="p-2">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
              <td className="p-2 text-right">{r.status !== "rejected" && <button onClick={() => reject(r.id)} className="px-2 py-1 rounded-lg border">Don't count</button>}</td>
            </tr>))}</tbody></table>
        </div>
      </div>
    </div>
  );
}

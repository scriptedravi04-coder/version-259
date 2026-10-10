import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Share2, Gift, Wallet, Users, X } from "lucide-react";
import { api } from "../../lib/api";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import { publicOrigin } from "../../lib/publicUrl";
// Session 36 (Ravi): creator referral programme. Rewards come from the server (/referrals/me); every
// number here is real. "How it works" carries the full rules (incl. the withdrawal minimum, small print).
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const date = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export function referralShareText(link) {
  return `I get brand deals on Ybex — brands pay into a secure payment hold before you start. Join with my link: ${link}`;
}

function ReferralHowItWorksBody({ open, onClose, data }) {
  if (!open) return null;
  const n = data?.signups_per_reward || 3, f = data?.free_deals_per_reward || 2;
  return (
    <PopupBackdrop className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" data-testid="referral-howto">
      <PopupPanel kind="auto" below={640} onClose={onClose} className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">How inviting works</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100"><X size={17} /></button>
        </div>
        <ol className="mt-3 space-y-3 text-[13px] text-gray-800 list-decimal pl-5">
          <li>Share your link. Creators who join Ybex through it (sign up or apply) count for you.</li>
          <li>Every {n} creators who join → your next {f} deals at <b>0% fee</b> (use them within {Math.round((data?.free_deals_valid_days || 180) / 30)} months), and your profile is <b>Featured</b> to brands for {data?.featured_days || 7} days.</li>
          {/* Session 39 (Ravi, M17a): one simple line — no numbers about who gets how much. */}
          <li>You also get a share of what your friend earns.</li>
        </ol>
        <p className="mt-3 text-[11.5px] text-gray-500">Not counted: inviting yourself, the same email/phone, accounts older than 7 days, more than {data?.monthly_cap_per_user || 20} a month. Ybex may change or end the programme; earned rewards stay.</p>
        <p className="mt-2 text-[10.5px] text-gray-400">Share balance can be withdrawn to your payout UPI/bank from {inr(data?.min_withdraw ?? 200)}.</p>
        <button onClick={onClose} className="mt-4 w-full h-11 rounded-xl bg-[#4f46e5] text-white text-sm font-semibold">Got it</button>
      </PopupPanel>
    </PopupBackdrop>
  );
}

// Session 37: stays mounted for its closing animation.
export function ReferralHowItWorks(props) {
  return <Presence>{props.open && <ReferralHowItWorksBody key="referralhowitworks" {...props} />}</Presence>;
}


export default function ReferralHub({ compact = false }) {
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  const [howto, setHowto] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("referrals/me").then((r) => setD(r.data)).catch(() => setD({ error: true }));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  if (d.error) return <div className="p-6 text-sm text-gray-500">Could not load your invite details. Please try again.</div>;

  const link = `${publicOrigin()}${d.link_path}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Copy failed"); } };
  const share = async () => {
    const text = referralShareText(link);
    if (navigator.share) { try { await navigator.share({ title: "Join me on Ybex", text, url: link }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const withdraw = async () => {
    setBusy(true);
    try { await api.post("referrals/withdraw", {}); toast.success("Withdrawal requested. It goes to your payout UPI/bank."); load(); }
    catch (e) { toast.error(e?.response?.data?.error || "Could not request a withdrawal."); }
    finally { setBusy(false); }
  };
  const step = d.signups_per_reward - d.to_next_reward;

  return (
    <div className={`space-y-4 ${compact ? "" : "max-w-2xl"}`} data-testid="referral-hub">
      <div className="rounded-2xl p-5 text-white bg-gradient-to-br from-[#4f46e5] to-[#7c3aed]">
        <div className="flex items-center gap-2 text-white/80 text-xs font-semibold"><Gift size={14} /> Invite creators</div>
        <h2 className="mt-1 text-xl font-bold leading-snug">Invite {d.signups_per_reward} creators → your next {d.free_deals_per_reward} deals at 0% fee</h2>
        <p className="mt-1 text-sm text-white/90">+ get Featured to brands, and a share of what your friends earn</p>
        <p className="mt-0.5 text-[11px] text-white/60">up to {inr(d.share_cap_per_creator)}</p>
        <div className="mt-4 flex items-center gap-2 bg-white/15 rounded-xl p-2">
          <span className="flex-1 truncate text-sm font-mono">{link.replace(/^https?:\/\//, "")}</span>
          <button onClick={copy} className="px-3 py-1.5 rounded-lg bg-white text-[#4f46e5] text-xs font-bold flex items-center gap-1">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={share} className="flex-1 h-10 rounded-xl bg-[#25D366] text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Share2 size={15} /> Share on WhatsApp</button>
          <button onClick={() => setHowto(true)} className="px-3 h-10 rounded-xl bg-white/15 text-white text-sm font-semibold">How it works</button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm"><span className="font-bold text-gray-900">Next reward</span><span className="text-gray-500">{step} of {d.signups_per_reward} joined</span></div>
        <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[#4f46e5]" style={{ width: `${(step / d.signups_per_reward) * 100}%` }} /></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-gray-50 p-2.5"><div className="text-lg font-bold">{d.joined}</div><div className="text-[11px] text-gray-500 flex items-center justify-center gap-1"><Users size={11} />joined</div></div>
          <div className="rounded-xl bg-emerald-50 p-2.5"><div className="text-lg font-bold text-emerald-700">{d.free_deals_left}</div><div className="text-[11px] text-emerald-700">0% fee deals{d.free_deals_expire_at ? ` · till ${date(d.free_deals_expire_at)}` : ""}</div></div>
          <div className="rounded-xl bg-amber-50 p-2.5"><div className="text-lg font-bold text-amber-700 flex items-center justify-center gap-1">{d.featured_until ? date(d.featured_until) : "—"}</div><div className="text-[11px] text-amber-700">Featured till</div></div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900"><Wallet size={15} /> Your referral earnings</div>
          <div className="text-lg font-bold">{inr(d.balance)}</div>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">Earned {inr(d.earned)} · withdrawn {inr(d.withdrawn)}</p>
        <button onClick={withdraw} disabled={busy || d.balance <= 0} className="mt-3 w-full h-10 rounded-xl border border-gray-300 text-sm font-semibold disabled:opacity-50">{busy ? "…" : "Withdraw"}</button>
        {d.withdrawals?.length > 0 && (
          <ul className="mt-3 space-y-1 text-[12px] text-gray-600">
            {d.withdrawals.map((w) => <li key={w.id} className="flex justify-between"><span>{inr(w.amount)} · {date(w.created_at)}</span><span>{w.status === "paid" ? `Paid · UTR ${w.utr}` : w.status}</span></li>)}
          </ul>
        )}
      </div>

      {d.people?.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-bold text-gray-900 mb-2">People you invited</div>
          <ul className="divide-y divide-gray-100 text-sm">
            {d.people.map((p, i) => <li key={i} className="py-2 flex justify-between"><span>{p.name} <span className="text-gray-400 text-xs">· {date(p.joined_at)}</span></span><span className="text-xs text-gray-500">{p.earned ? inr(p.earned) : p.status}</span></li>)}
          </ul>
        </div>
      )}
      <ReferralHowItWorks open={howto} onClose={() => setHowto(false)} data={d} />
    </div>
  );
}

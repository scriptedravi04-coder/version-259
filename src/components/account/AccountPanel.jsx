import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Mail, Phone, MonitorSmartphone, FileText, Trash2, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { safeStorage } from "../../utils/storage";

// Session 43 (Ravi): Settings → Account. Shown inside the creator/brand profile's own back-header.
// onOpen(screen) switches to the existing "sessions" / "legal" screens. onDeleted() is called after a
// successful account deletion (the caller logs out + leaves).
export default function AccountPanel({ onOpen, onDeleted }) {
  const { logout, setUser } = useAuth();
  const [info, setInfo] = useState({ email: "", phone: "", email_verified: false });
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // 'email' | 'phone' | null
  const [del, setDel] = useState(null);    // 'intro' | 'otp' | null

  useEffect(() => {
    api.get("account/overview", { bypassCache: true })
      .then((r) => setInfo(r.data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (edit === "email") return <ChangeEmail current={info.email} onDone={(email) => { setInfo((s) => ({ ...s, email })); setEdit(null); }} onCancel={() => setEdit(null)} />;
  if (edit === "phone") return <ChangePhone current={info.phone} onDone={(phone) => { setInfo((s) => ({ ...s, phone })); setEdit(null); }} onCancel={() => setEdit(null)} />;
  if (del) return <DeleteFlow step={del} setStep={setDel} email={info.email} onDeleted={() => { onDeleted ? onDeleted() : logout?.(); }} />;

  const Row = ({ icon, title, value, onClick, danger }) => (
    <button type="button" onClick={onClick} className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>{icon}</div>
        <div className="min-w-0">
          <span className={`text-[15px] font-semibold block ${danger ? "text-rose-600" : "text-slate-900"}`}>{title}</span>
          {value ? <span className="text-[12px] text-slate-400 font-medium truncate block">{value}</span> : null}
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-400 shrink-0" />
    </button>
  );

  return (
    <div className="p-4 space-y-5" data-testid="account-panel">
      <div className="space-y-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Login details</span>
        <div className="divide-y divide-slate-100">
          <Row icon={<Mail size={16} />} title="Email" value={loading ? "…" : info.email || "Add email"} onClick={() => setEdit("email")} />
          <Row icon={<Phone size={16} />} title="Phone" value={loading ? "…" : info.phone || "Add number"} onClick={() => setEdit("phone")} />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Security &amp; privacy</span>
        <div className="divide-y divide-slate-100">
          <Row icon={<MonitorSmartphone size={16} />} title="Devices &amp; sessions" onClick={() => onOpen?.("sessions")} />
          <Row icon={<FileText size={16} />} title="Privacy &amp; terms" onClick={() => onOpen?.("legal")} />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Danger zone</span>
        <div className="divide-y divide-slate-100">
          <Row icon={<Trash2 size={16} />} title="Delete account" danger onClick={() => setDel("intro")} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[12px] font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "mt-1.5 w-full h-12 rounded-2xl border-[1.5px] border-slate-200 focus:border-[#7C3AED] px-4 text-[15px] font-semibold text-slate-900 outline-none bg-white";
const primaryCls = "w-full h-12 rounded-2xl text-white text-[15px] font-bold active:scale-[0.99] transition disabled:opacity-50";
const primaryStyle = { background: "linear-gradient(135deg,#9B00FF,#5A00C8)" };

function ChangePhone({ current, onDone, onCancel }) {
  const [phone, setPhone] = useState(current || "");
  const [busy, setBusy] = useState(false);
  const ok = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ""));
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("account/phone", { phone: phone.replace(/\D/g, "") });
      toast.success("Phone updated");
      onDone(data?.phone || phone);
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't update your number."); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4 space-y-4" data-testid="change-phone">
      <Field label="Mobile number">
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10-digit number" className={inputCls} />
      </Field>
      <p className="text-[12px] text-slate-400">No code needed — your number updates right away.</p>
      <button type="button" onClick={save} disabled={!ok || busy} className={primaryCls} style={primaryStyle}>{busy ? "Saving…" : "Save number"}</button>
      <button type="button" onClick={onCancel} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Cancel</button>
    </div>
  );
}

function ChangeEmail({ current, onDone, onCancel }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await api.post("account/email/send-otp", { email: email.trim().toLowerCase() });
      setSent(true);
      toast.success("Code sent to the new email");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't send the code."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (otp.trim().length < 4 || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("account/email/verify", { email: email.trim().toLowerCase(), otp: otp.trim() });
      toast.success("Email updated");
      onDone(data?.email || email.trim().toLowerCase());
    } catch (e) { toast.error(e?.response?.data?.detail || "That code didn't work."); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4 space-y-4" data-testid="change-email">
      <p className="text-[12px] text-slate-400">Current: <span className="font-semibold text-slate-600">{current || "—"}</span></p>
      <Field label="New email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} inputMode="email" placeholder="you@email.com" className={inputCls} />
      </Field>
      {!sent ? (
        <button type="button" onClick={send} disabled={!ok || busy} className={primaryCls} style={primaryStyle}>{busy ? "Sending…" : "Send code"}</button>
      ) : (
        <>
          <Field label="Enter the 6-digit code">
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="______" className={`${inputCls} tracking-[6px] text-center`} />
          </Field>
          <button type="button" onClick={verify} disabled={otp.trim().length < 4 || busy} className={primaryCls} style={primaryStyle}>{busy ? "Checking…" : "Update email"}</button>
          <button type="button" onClick={() => setSent(false)} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Use a different email</button>
        </>
      )}
      <button type="button" onClick={onCancel} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Cancel</button>
    </div>
  );
}

function DeleteFlow({ step, setStep, email, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(null); // {blocked, reasons}
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (step !== "intro") return;
    api.get("account/delete/preflight", { bypassCache: true })
      .then((r) => setBlocked(r.data || { blocked: false, reasons: [] }))
      .catch(() => setBlocked({ blocked: false, reasons: [] }));
  }, [step]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("account/delete/send-otp", {});
      setStep("otp");
      toast.success("Confirmation code emailed");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't start deletion."); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (otp.trim().length < 4 || busy) return;
    setBusy(true);
    try {
      await api.post("account/delete/confirm", { otp: otp.trim() });
      try { safeStorage.removeItem("ybex_token"); safeStorage.removeItem("ybex_user"); } catch { /* ignore */ }
      toast.success("Your account has been deleted.");
      onDeleted?.();
    } catch (e) {
      const d = e?.response?.data;
      if (d?.code === "ACTIVE_MONEY") setBlocked({ blocked: true, reasons: d.reasons || [] });
      toast.error(d?.detail || "Couldn't delete the account.");
      if (d?.code === "ACTIVE_MONEY") setStep("intro");
    } finally { setBusy(false); }
  };

  if (step === "otp") {
    return (
      <div className="p-4 space-y-4" data-testid="delete-otp">
        <p className="text-[13px] text-slate-600">We emailed a code to <span className="font-semibold">{email || "your email"}</span>. Enter it to permanently delete your account.</p>
        <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="______" className={`${inputCls} tracking-[6px] text-center`} />
        <button type="button" onClick={confirm} disabled={otp.trim().length < 4 || busy} className="w-full h-12 rounded-2xl bg-rose-600 text-white text-[15px] font-bold active:scale-[0.99] transition disabled:opacity-50">{busy ? "Deleting…" : "Delete my account"}</button>
        <button type="button" onClick={() => setStep(null)} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Cancel</button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" data-testid="delete-intro">
      <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl p-4">
        <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
        <div className="text-[13px] text-rose-900 leading-relaxed">
          Deleting is permanent. You have 30 days to recover by contacting support, after which it's gone for good.
        </div>
      </div>
      <div className="text-[13px] text-slate-700 leading-relaxed space-y-2">
        <p className="font-bold text-slate-900">What gets removed</p>
        <p>Your profile, photos, portfolio, chats, social links and saved bank / UPI details.</p>
        <p className="font-bold text-slate-900 pt-1">What we keep</p>
        <p>Payment and invoice records, as the law requires for tax. Your name is removed from them.</p>
      </div>
      {blocked?.blocked ? (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-[13px] text-amber-900">
          <p className="font-bold mb-1">Finish these first</p>
          <ul className="list-disc pl-5 space-y-0.5">{(blocked.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p className="mt-2">You can delete once no money is on hold.</p>
        </div>
      ) : null}
      <button type="button" onClick={start} disabled={busy || blocked == null || blocked?.blocked} className="w-full h-12 rounded-2xl bg-rose-600 text-white text-[15px] font-bold active:scale-[0.99] transition disabled:opacity-50">
        {blocked == null ? "Checking…" : busy ? "Please wait…" : "Continue to delete"}
      </button>
      <button type="button" onClick={() => setStep(null)} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Keep my account</button>
    </div>
  );
}

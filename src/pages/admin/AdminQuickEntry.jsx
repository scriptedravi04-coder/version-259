import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { safeStorage } from "../../utils/storage";
import { useAuth } from "../../contexts/AuthContext";

// Session 43 (Ravi): hidden admin entrance. Not linked anywhere — only someone who types /admin/ybx
// reaches it. Tap the Ybex mark 6 times to reveal a PIN box; the PIN is checked on the server against
// ADMIN_QUICK_PIN (unset = this door stays shut). No public demo / bypass buttons involved.
const NEED_TAPS = 6;

export default function AdminQuickEntry() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const knock = () => {
    const n = taps + 1;
    setTaps(n);
    if (n >= NEED_TAPS) setOpen(true);
  };

  const enter = async () => {
    const p = pin.trim();
    if (p.length < 6 || busy) return;
    setBusy(true);
    setErr("");
    const prev = safeStorage.getItem("ybex_token");
    try {
      safeStorage.setItem("ybex_token", `dev_bypass_admin|${p}`);
      const { data } = await api.get("auth/me", { bypassCache: true });
      const u = data?.user || (data?.user_id ? data : null);
      if (u && u.role === "admin") {
        safeStorage.setItem("ybex_user", JSON.stringify(u));
        setUser(u);
        navigate("/admin", { replace: true });
        return;
      }
      throw new Error("not admin");
    } catch {
      if (prev) safeStorage.setItem("ybex_token", prev);
      else safeStorage.removeItem("ybex_token");
      setErr("Wrong PIN, or quick entry is off on the server.");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-statusbar="#2E0066"
      className="min-h-screen flex flex-col items-center justify-center px-6 select-none"
      style={{ background: "linear-gradient(180deg,#9B00FF 0%,#6200B4 60%,#2E0066 100%)" }}
    >
      <button
        type="button"
        aria-label="Ybex"
        onClick={knock}
        className="w-28 h-28 rounded-[32px] flex items-center justify-center active:scale-95 transition-transform"
        style={{ background: "linear-gradient(160deg,rgba(255,255,255,.18),rgba(255,255,255,.06))", boxShadow: "0 18px 40px rgba(0,0,0,.25)" }}
      >
        <span className="text-white text-[34px] font-extrabold tracking-tight">Ybex<span style={{ color: "#C9A3FF" }}>.</span></span>
      </button>

      {!open ? (
        <div className="mt-8 text-[13px] font-medium text-white/50">Ybex</div>
      ) : (
        <div className="mt-8 w-full max-w-[280px] flex flex-col gap-3">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
            placeholder="Admin PIN"
            className="w-full h-12 rounded-2xl bg-white/95 px-4 text-[16px] font-semibold text-[#14111C] outline-none text-center tracking-[6px] placeholder:tracking-normal placeholder:text-[#A19BB0]"
          />
          {err ? <div className="text-[12px] text-rose-200 text-center">{err}</div> : null}
          <button
            type="button"
            onClick={enter}
            disabled={pin.trim().length < 6 || busy}
            className="w-full h-12 rounded-2xl font-bold text-[15px] text-[#2E0066] bg-white disabled:opacity-50 active:scale-[0.99] transition"
          >
            {busy ? "Checking…" : "Enter"}
          </button>
        </div>
      )}
    </div>
  );
}

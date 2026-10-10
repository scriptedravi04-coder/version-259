import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { pushSupported, pushServerKey, askPushPermission, savePushSubscription } from "../../lib/push";
import { ignored } from "../../utils/ignored";

// Session 41 (Ravi) — ask for notifications at the start, with our own screen first (sticker +
// emotional/funny line + one big button). Only the tap on "Yes, keep me posted" opens the phone's
// real popup — iPhone allows it only after a tap, and a phone never asks again after "Don't allow".
// "Not now" → asked again after 3 days. No on/off setting anywhere else (Ravi).
const NOT_NOW_KEY = "ybex_push_not_now_at";
const HIDE_ON = ["/login", "/signup", "/onboarding", "/verify", "/admin", "/reset-password"];

// Session 43 (Ravi: "ye lines achi nahi hai") — plain, useful copy + what you will actually get.
export const COPY = {
  creator: {
    title: "Never miss a brand deal",
    text: "Get a ping the moment a brand invites you, sends an offer, or your payment arrives.",
    perks: [["🤝", "Brand invites & new offers"], ["💸", "Payment released to your bank"], ["💬", "Replies in your chats"]],
  },
  brand: {
    title: "Know the moment creators respond",
    text: "Get a ping when creators apply, send their drafts, or reply to your offers.",
    perks: [["✨", "New creator applications"], ["🎬", "Drafts ready for your review"], ["💬", "Replies in your chats"]],
  },
};

function Sticker() {
  // Our own sticker (not copied): a lavender blob, a pleading face, folded hands and sparkles.
  return (
    <div style={{ position: "relative", width: 260, height: 180, margin: "0 auto" }} aria-hidden="true">
      <svg viewBox="0 0 260 180" width="260" height="180" style={{ position: "absolute", inset: 0 }}>
        <path d="M24 40 Q40 8 120 14 Q210 6 236 36 Q252 92 232 140 Q200 176 120 170 Q40 176 20 138 Q6 92 24 40Z" fill="#EDE7FE" />
        <circle cx="46" cy="52" r="20" fill="#DCD0FD" />
        <circle cx="222" cy="140" r="16" fill="#DCD0FD" />
        <path d="M70 26 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z" fill="#C9B8FB" />
        <path d="M196 30 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z" fill="#C9B8FB" />
        <path d="M92 150 q8 -10 16 0 q8 -10 16 0 q-16 18 -16 18 q0 0 -16 -18z" fill="#D8CCFD" />
      </svg>
      <div style={{ position: "absolute", left: 22, top: 62, fontSize: 52, transform: "rotate(-10deg)" }}>🙏</div>
      <div style={{ position: "absolute", left: "50%", top: 30, transform: "translateX(-50%)", fontSize: 96, lineHeight: 1, filter: "drop-shadow(0 6px 10px rgba(91,33,182,.18))" }}>🥺</div>
      <div style={{ position: "absolute", right: 20, top: 62, fontSize: 52, transform: "rotate(10deg) scaleX(-1)" }}>🙏</div>
      <div style={{ position: "absolute", right: 58, top: 18, fontSize: 30 }}>🔔</div>
    </div>
  );
}

export default function PushPermissionScreen() {
  const { user } = useAuth() || {};
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const role = user?.role === "brand" ? "brand" : user?.role === "creator" ? "creator" : null;
  const [blocked, setBlocked] = useState(false); // phone settings say "don't allow"

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Session 43 (v271): no "onboarding finished" check any more — brands who picked "finish
      // later" never got asked (0 brand phones subscribed). Onboarding pages stay excluded below.
      if (!role || !pushSupported()) return;
      // Already allowed on this phone → just make sure the server has this device.
      if (Notification.permission === "granted") {
        savePushSubscription().catch((e) => ignored("Push:resync", e));
        return;
      }
      if (Notification.permission !== "default") return; // blocked in phone settings
      try {
        const at = Number(localStorage.getItem(NOT_NOW_KEY) || 0);
        if (at && Date.now() - at < 3 * 24 * 3600e3) return;
      } catch (e) { ignored("Push:notNow", e); }
      const key = await pushServerKey();
      if (!cancelled && key) setShow(true);
    })();
    return () => { cancelled = true; };
  }, [role]);

  // Session 43 (Ravi): the small "Allow notifications" button on the Notifications page opens this
  // same screen. If the phone already blocked us, the screen explains how to turn it on in Settings.
  useEffect(() => {
    const open = () => {
      if (!role) return;
      if (!pushSupported()) { setBlocked("install"); setShow(true); return; }
      let perm = "default";
      try { perm = typeof Notification !== "undefined" ? Notification.permission : "default"; } catch (e) { ignored("Push:perm", e); }
      if (perm === "granted") { savePushSubscription().catch((e) => ignored("Push:resync2", e)); return; }
      setBlocked(perm === "denied" ? "denied" : false);
      setShow(true);
    };
    window.addEventListener("ybex:open-push-ask", open);
    return () => window.removeEventListener("ybex:open-push-ask", open);
  }, [role]);

  const hiddenHere = location.pathname === "/" || HIDE_ON.some((p) => location.pathname.startsWith(p));
  const visible = show && !hiddenHere;
  // Session 43 (Ravi): "Missed Notifications" popped up on top of this screen. Tell the toasts to wait.
  useEffect(() => {
    try {
      window.__ybFullScreenAsk = visible;
      window.dispatchEvent(new CustomEvent("ybex:fullscreen-ask", { detail: visible }));
    } catch (e) { ignored("Push:announce", e); }
  }, [visible]);
  const copy = COPY[role] || COPY.creator;

  const allow = async () => {
    setBusy(true);
    try { await askPushPermission(); } catch (e) { ignored("Push:ask", e); }
    setBusy(false);
    setShow(false);
    try { window.dispatchEvent(new Event("ybex:push-permission-changed")); } catch (e) { ignored("Push:changed", e); }
  };
  const notNow = () => {
    try { localStorage.setItem(NOT_NOW_KEY, String(Date.now())); } catch (e) { ignored("Push:notNowSave", e); }
    setShow(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="push-ask"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[180] bg-white flex flex-col"
          style={{ fontFamily: "'DM Sans', sans-serif", paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          role="dialog" aria-modal="true" data-testid="push-permission"
        >
          <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
            <Sticker />
            <h2 className="mt-7 text-[25px] leading-[1.2] font-bold tracking-tight text-[#0A0A0A]">{copy.title}</h2>
            <p className="mt-2.5 text-[15px] leading-[1.55] text-[#4B5563] max-w-sm">{copy.text}</p>
            {blocked ? (
              <div className="mt-6 w-full max-w-sm rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] p-4 text-left text-[13.5px] leading-[1.5] text-[#78350F]" data-testid="push-blocked-help">
                {blocked === "install" ? (
                  <>On iPhone, notifications work only in the installed app. In Safari tap <b>Share → Add to Home Screen</b>, open Ybex from your home screen, then turn them on.</>
                ) : (
                  <>Notifications are turned off for Ybex on this phone. Open <b>Settings → Ybex → Notifications</b> (Android: <b>Settings → Apps → Ybex → Notifications</b>) and switch them on.</>
                )}
              </div>
            ) : (
              <ul className="mt-6 w-full max-w-sm flex flex-col gap-2.5 text-left">
                {copy.perks.map(([icon, label]) => (
                  <li key={label} className="flex items-center gap-3 rounded-2xl bg-[#F7F5FF] px-4 py-3">
                    <span className="text-[20px] leading-none" aria-hidden="true">{icon}</span>
                    <span className="text-[14px] font-semibold text-[#1F1F29]">{label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="px-6 pb-6 pt-2 w-full max-w-md mx-auto">
            {blocked ? (
              <button type="button" onClick={() => setShow(false)} data-testid="push-blocked-ok"
                className="w-full h-[54px] rounded-[16px] bg-[#7C3AED] text-white text-[16px] font-bold active:scale-[0.99] transition-transform">
                Got it
              </button>
            ) : (
              <>
                <button type="button" onClick={allow} disabled={busy} data-testid="push-allow"
                  className="w-full h-[54px] rounded-[16px] bg-[#7C3AED] text-white text-[16px] font-bold active:scale-[0.99] transition-transform disabled:opacity-70">
                  {busy ? "One sec…" : "Turn on notifications"}
                </button>
                <button type="button" onClick={notNow} data-testid="push-not-now"
                  className="mt-2 w-full h-11 text-[14px] font-semibold text-[#8E8E93]">
                  Not now
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

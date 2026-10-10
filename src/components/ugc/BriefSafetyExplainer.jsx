import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Lock, BadgeCheck, Scale, RotateCcw, Info } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 24 (design: "Secure Payment Hold Explainer Sheet"). Shown the first time a brand starts a brief;
// reopened any time from "How it works". Copy approved by Ravi:
//   - no jargon: the protected hold is called "Ybex SafePay", not "escrow";
//   - point 4 = the refund promise (replaces the optional deadline point).
// Numbers are plain text so they can change with the rules (REVIEW_WINDOW, CANCEL_AFTER).

export const REVIEW_WINDOW = "24–48 hours";
export const CANCEL_AFTER = "24 hours";
const SEEN_KEY = "ybex_brief_explainer_seen_v1";

const seenKeyFor = (userId) => `${SEEN_KEY}:${userId || "anon"}`;

export function hasSeenBriefExplainer(userId) {
  try { return localStorage.getItem(seenKeyFor(userId)) === "1"; } catch { return false; }
}
export function markBriefExplainerSeen(userId) {
  try { localStorage.setItem(seenKeyFor(userId), "1"); } catch { /* storage unavailable */ }
}

/**
 * Opens by itself the first time (autoOpen) and stays reopenable.
 * Returns [open, openAgain, close, reopened] for the page that hosts the "How it works" link.
 */
export function useBriefExplainer(userId, autoOpen = true) {
  const [state, setState] = useState({ open: false, reopened: false });
  useEffect(() => {
    if (autoOpen && !hasSeenBriefExplainer(userId)) setState({ open: true, reopened: false });
  }, [autoOpen, userId]);
  const openAgain = useCallback(() => setState({ open: true, reopened: true }), []);
  const close = useCallback(() => {
    markBriefExplainerSeen(userId);
    setState((s) => ({ ...s, open: false }));
  }, [userId]);
  return [state.open, openAgain, close, state.reopened];
}

const POINTS = [
  { Icon: Lock, body: <>Your payment is <b>held safely with Ybex SafePay</b>. The creator is paid only after you approve the video.</> },
  { Icon: BadgeCheck, body: <>Only <b>KYC-verified creators</b> can claim your brief.</> },
  { Icon: Scale, body: <>If the video doesn't match your brief and the creator declines changes, <b>Ybex reviews it within {REVIEW_WINDOW}</b>. If the creator is at fault, you get your money back.</> },
  { Icon: RotateCcw, body: <><b>100% refundable.</b> Any slot no creator is working on can be cancelled after the first {CANCEL_AFTER}, and the full amount comes back to your bank or UPI.</> },
];

function SafeIllustration() {
  return (
    <svg viewBox="0 0 280 170" className="w-[230px] h-[140px]" aria-hidden="true">
      <defs>
        <linearGradient id="bse-card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C4B5FD" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient>
        <linearGradient id="bse-shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#6D28D9" /></linearGradient>
        <filter id="bse-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#7C3AED" floodOpacity="0.25" /></filter>
      </defs>
      <path d="M46 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#A78BFA" />
      <circle cx="232" cy="112" r="3" fill="#C4B5FD" /><circle cx="38" cy="140" r="4" fill="#DDD6FE" />
      <g transform="rotate(-8 95 95)" filter="url(#bse-shadow)">
        <rect x="52" y="40" width="92" height="118" rx="14" fill="#F5F3FF" />
        <rect x="58" y="46" width="80" height="90" rx="10" fill="url(#bse-card)" />
        <circle cx="98" cy="91" r="14" fill="#fff" /><path d="M94 84l12 7-12 7z" fill="#7C3AED" />
        <rect x="62" y="142" width="54" height="5" rx="2.5" fill="#8B5CF6" />
      </g>
      <g filter="url(#bse-shadow)">
        <path d="M162 22l48 16v38c0 32-21 52-48 62-27-10-48-30-48-62V38z" fill="url(#bse-shield)" />
        <circle cx="162" cy="78" r="23" fill="#EDE9FE" /><circle cx="162" cy="78" r="17" fill="#fff" />
        <text x="162" y="86" textAnchor="middle" fontSize="22" fontWeight="700" fill="#7C3AED" fontFamily="DM Sans, sans-serif">₹</text>
      </g>
      <circle cx="212" cy="36" r="18" fill="#fff" /><circle cx="212" cy="36" r="14" fill="#16A34A" />
      <path d="M205 36l5 5 9-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="222" cy="122" r="11" fill="#F5F3FF" /><text x="222" y="127" textAnchor="middle" fontSize="12" fontWeight="700" fill="#7C3AED" fontFamily="DM Sans, sans-serif">₹</text>
    </svg>
  );
}

function Body({ onClose, reopened }) {
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 w-10 h-10 rounded-full bg-white shadow-sm border border-[#EEEAF6] flex items-center justify-center text-[#0A0A0A] cursor-pointer"
      >
        <X size={18} />
      </button>
      <div className="pt-7 pb-3 flex justify-center bg-gradient-to-b from-[#F3EEFF] to-white">
        <SafeIllustration />
      </div>
      <div className="px-6 pb-6">
        <h2 className="text-center text-[24px] font-bold tracking-tight text-[#0A0A0A]">Your money stays safe</h2>
        <ul className="mt-5 space-y-4">
          {POINTS.map(({ Icon, body }, i) => (
            <li key={i} className="flex gap-3.5 items-start">
              <span className="w-11 h-11 rounded-2xl bg-[#F3EEFF] text-[#7C3AED] flex items-center justify-center shrink-0">
                <Icon size={19} strokeWidth={2} />
              </span>
              <p className="text-[14.5px] leading-[1.55] text-[#1F1F24] pt-1 [&_b]:font-bold [&_b]:text-[#0A0A0A]">{body}</p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full h-[52px] rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[16px] shadow-[0_12px_24px_-12px_rgba(124,58,237,0.8)] active:scale-[0.99] transition-all cursor-pointer"
        >
          {reopened ? "Got it" : "Got it, create brief"}
        </button>
      </div>
    </>
  );
}

function BriefSafetyExplainerBody({ open, onClose, reopened = false }) {
  const isMobile = useIsMobile();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;

  const panel = isMobile ? (
    <PopupPanel kind="sheet" onClose={onClose} className="fixed inset-x-0 bottom-0 z-[121] max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-white shadow-[0_-12px_40px_rgba(10,10,10,.18)]" role="dialog" aria-modal="true" aria-label="Your money stays safe" data-testid="brief-safety-explainer">
      <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-[#DAD8E3]" />
      <div className="relative"><Body onClose={onClose} reopened={reopened} /></div>
    </PopupPanel>
  ) : (
    <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
      <PopupPanel kind="modal" className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto rounded-[28px] bg-white shadow-2xl pointer-events-auto" role="dialog" aria-modal="true" aria-label="Your money stays safe" data-testid="brief-safety-explainer">
        <Body onClose={onClose} reopened={reopened} />
      </PopupPanel>
    </div>
  );

  return createPortal(
    <>
      <PopupBackdrop className="fixed inset-0 z-[120] bg-[rgba(10,10,10,.48)]" onClick={onClose} />
      {panel}
    </>,
    document.body
  );
}

// Session 37: stays mounted for its closing animation.
export default function BriefSafetyExplainer(props) {
  return <Presence>{props.open && <BriefSafetyExplainerBody key="briefsafetyexplainer" {...props} />}</Presence>;
}


/** The "ⓘ How it works" link that reopens the explainer. */
export function HowItWorksLink({ onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-9 px-2 text-[13px] font-semibold text-[#7C3AED] whitespace-nowrap cursor-pointer ${className}`}
    >
      <Info size={15} /> How it works
    </button>
  );
}

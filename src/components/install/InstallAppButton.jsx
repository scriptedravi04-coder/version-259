import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { usePWAInstall } from "../../hooks/usePWAInstall";
import InstallGuideSheet from "./InstallGuideSheet";
import { detectPlatform } from "../../lib/installGuide";
import { QRCodeSVG } from "qrcode.react";
import { publicOrigin } from "../../lib/publicUrl";

// Session 42 (Ravi: "landing page par bhi Install now lagao, best UX ke hisaab se").
// Android Chrome with an install prompt → the real install popup in one tap. Everything else
// (iPhone, other browsers) → the right steps for that browser. Already installed → nothing.

function useInstall() {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const start = async () => {
    if (isInstallable) {
      await install(); // Android Chrome: the phone's own install popup
      return;
    }
    setGuideOpen(true);
  };
  return { isInstalled, start, guideOpen, closeGuide: () => setGuideOpen(false) };
}

/** Hero button next to "Get Started" — phones only. */
export function InstallAppButton({ className = "" }) {
  const { isInstalled, start, guideOpen, closeGuide } = useInstall();
  const { desktop } = detectPlatform();
  if (isInstalled || desktop) return null;
  return (
    <>
      <button type="button" onClick={start} data-testid="landing-install-app"
        className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full border border-[var(--violet-border)] bg-white text-[var(--violet)] text-sm font-bold active:scale-[0.98] transition-transform ${className}`}>
        <Download size={16} /> Install the app
      </button>
      <InstallGuideSheet open={guideOpen} onClose={closeGuide} />
    </>
  );
}

const DISMISS_KEY = "ybex_install_bar_dismissed_at";

/** Slim bar at the bottom of the landing page, after the visitor scrolls past the hero. Phones only. */
export function InstallAppBar() {
  const { isInstalled, start, guideOpen, closeGuide } = useInstall();
  const { desktop } = detectPlatform();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 7 * 24 * 60 * 60 * 1000; } catch { return false; }
  });
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (isInstalled || desktop || dismissed) return <InstallGuideSheet open={guideOpen} onClose={closeGuide} />;
  const close = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } };
  return (
    <>
      <div
        className={`fixed left-3 right-3 z-[60] transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "translate-y-[140%] opacity-0 pointer-events-none"}`}
        style={{ bottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
        data-testid="landing-install-bar"
      >
        <div className="flex items-center gap-3 rounded-2xl bg-[#17122B] text-white pl-4 pr-2 py-2.5 shadow-[0_12px_32px_rgba(23,18,43,0.35)]">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold leading-tight">Get the Ybex app</p>
            <p className="text-[12px] text-white/70 leading-tight mt-0.5">Deal alerts and chats, one tap away</p>
          </div>
          <button type="button" onClick={start} className="h-9 px-4 rounded-xl bg-white text-[#17122B] text-[13px] font-bold">Install</button>
          <button type="button" onClick={close} aria-label="Close" className="w-8 h-8 flex items-center justify-center text-white/60"><X size={16} /></button>
        </div>
      </div>
      <InstallGuideSheet open={guideOpen} onClose={closeGuide} />
    </>
  );
}

/** Desktop only: scan to open Ybex on the phone. */
export function InstallQrCard() {
  const { desktop } = detectPlatform();
  if (!desktop || typeof window === "undefined") return null;
  return (
    <section className="max-w-5xl mx-auto px-6 -mt-8 mb-20 hidden md:block" data-testid="landing-install-qr">
      <div className="rounded-3xl border border-[var(--border-default)] bg-white p-8 flex items-center gap-8">
        <div className="p-3 rounded-2xl border border-[var(--border-default)] shrink-0">
          <QRCodeSVG value={`${publicOrigin()}/app`} size={128} />
        </div>
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Ybex on your phone</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-md">
            Scan with your phone camera and tap Install. Deal alerts, chat and payments, straight from your Home Screen. Works on iPhone and Android.
          </p>
        </div>
      </div>
    </section>
  );
}

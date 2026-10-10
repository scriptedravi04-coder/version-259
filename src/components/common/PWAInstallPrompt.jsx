import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { ignored } from '../../utils/ignored';
import { Download, X, Smartphone } from 'lucide-react';
import InstallGuideSheet from '../install/InstallGuideSheet';

export default function PWAInstallPrompt({ className = "" }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  // Closed banner stays away for 7 days (it used to come back every new tab).
  const [dismissed, setDismissed] = useState(() => {
    try {
      const at = Number(localStorage.getItem('pwa_prompt_dismissed_at') || 0);
      return at > 0 && Date.now() - at < 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });

  if (isInstalled || dismissed) {
    return null;
  }

  // Only show if browser emitted install prompt or if on iOS Safari
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('pwa_prompt_dismissed_at', String(Date.now()));
    } catch (e) { ignored("PWAInstallPrompt:dismiss", e); }
  };

  const handleAction = () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      install();
    }
  };

  return (
    <>
      <div className={`w-full bg-gradient-to-r from-violet-900 via-[#7C3AED] to-purple-800 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm z-40 ${className}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Smartphone size={16} className="text-white" />
          </div>
          <div className="truncate">
            <div className="font-bold tracking-tight">Install Ybex Mobile App</div>
            <div className="text-[11px] text-white/80 truncate">Opens full-screen, straight from your home screen</div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAction}
            className="px-3.5 py-1.5 rounded-lg bg-white text-[#7C3AED] font-bold text-xs hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={13} className="stroke-[2.5]" />
            <span>Install</span>
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Session 42: browser-aware steps (iPhone Chrome too) — src/lib/installGuide.js */}
      <InstallGuideSheet open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </>
  );
}

import { useEffect, useState } from 'react';

// Session 41 — "Install app". Android Chrome gives us a beforeinstallprompt event (caught early in
// index.jsx and kept on window.__ybexInstallPrompt). iPhone Safari never does: Apple only allows
// Share → Add to Home Screen, so on iOS we show a short guide instead.
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(() =>
    typeof window !== 'undefined' ? window.__ybexInstallPrompt || null : null
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
    setIsInstalled(Boolean(isStandalone));
    setIsIOS(/iphone|ipad|ipod/.test((navigator.userAgent || '').toLowerCase()));

    const onReady = () => setDeferredPrompt(window.__ybexInstallPrompt || null);
    const onPrompt = (e) => { e.preventDefault(); window.__ybexInstallPrompt = e; setDeferredPrompt(e); };
    const onInstalled = () => { setIsInstalled(true); setDeferredPrompt(null); window.__ybexInstallPrompt = null; };

    window.addEventListener('ybex-install-ready', onReady);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('ybex-install-ready', onReady);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      // A prompt can only be used once.
      window.__ybexInstallPrompt = null;
      setDeferredPrompt(null);
      if (choice?.outcome === 'accepted') { setIsInstalled(true); return true; }
    } catch (err) {
      console.warn('Install prompt error:', err);
    }
    return false;
  };

  return { isInstallable: Boolean(deferredPrompt), isInstalled, isIOS, install };
}

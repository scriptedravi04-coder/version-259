// Session 42: is Ybex running as the installed app (added to the Home Screen / installed from
// Chrome), not as a normal browser tab? The installed app opens /app (public/manifest.json →
// start_url): login → dashboard, logged out → the app welcome screen, never the website landing.
export function isStandalone() {
  try {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

/** A long random password for accounts made with an email code only (the person never sees it;
 *  they log in with codes, or set their own later with "Forgot password"). */
export function randomPassword() {
  const bytes = new Uint8Array(24);
  try { window.crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
  return "Yb!" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32) + "9a";
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

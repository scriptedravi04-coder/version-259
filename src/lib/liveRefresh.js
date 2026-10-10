// Session 28 (Ravi: "KYC approved / a creator applied — the page only updates after a refresh").
//
// Every notification the server stores is pushed to the user's socket room (server.ts notifications
// insert proxy). NotificationPopup (mounted once, app-wide) re-announces each one as a window
// event. Pages that show live data subscribe with useLiveRefresh and reload quietly when:
//   • a matching notification arrives (seconds, like chat),
//   • the tab comes back into focus,
//   • every `intervalMs` while the tab is visible (safety net if a socket event was missed).
import { useEffect, useRef } from "react";

export const LIVE_EVENT = "ybex:live";

export function announceLive(notif) {
  try {
    window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: notif || {} }));
  } catch { /* old browsers: pages still refresh on focus / interval */ }
}

/** true when `notif.type` contains one of `types` (case-insensitive). No types → every notification. */
export function liveTypeMatches(notif, types) {
  if (!types || types.length === 0) return true;
  const t = String(notif?.type || notif?.notification_type || "").toLowerCase();
  if (!t) return false;
  return types.some((x) => t.includes(String(x).toLowerCase()));
}

/**
 * `reload` is called with `{ silent: true }` — pages must not show a full-page spinner for it.
 * Several triggers close together run one reload (debounced).
 */
export function useLiveRefresh(reload, { types = null, intervalMs = 60000, focusMinGapMs = 15000, enabled = true } = {}) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const typesKey = types ? types.join("|") : "";

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    let lastRun = Date.now();
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        lastRun = Date.now();
        try {
          const p = reloadRef.current?.({ silent: true });
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch { /* a failed background reload must never break the page */ }
      }, 600);
    };
    const onLive = (e) => { if (liveTypeMatches(e?.detail, types)) run(); };
    const onFocus = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastRun >= focusMinGapMs) run();
    };
    window.addEventListener(LIVE_EVENT, onLive);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const poll = intervalMs > 0
      ? setInterval(() => { if (!document.hidden) run(); }, intervalMs)
      : null;
    return () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      window.removeEventListener(LIVE_EVENT, onLive);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, focusMinGapMs, typesKey]);
}

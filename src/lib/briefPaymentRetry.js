import { api } from "./api";
// Session 24. A brand pays for a UGC brief, then the app posts the brief with that paid order.
// If the post fails (network, server error), the money is already taken — pressing "Secure brief
// & pay" again used to open a NEW checkout and charge a second time. Now the paid order is kept
// on this device and the next tap posts the brief with it (the server checks it is paid, covers
// the escrow and funds nothing else).
const KEY = "ugc_paid_order";

export function getPaidBriefOrder() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && typeof v.order_id === "string" && v.order_id ? v : null;
  } catch {
    return null;
  }
}

export function savePaidBriefOrder(orderId, amount) {
  try {
    if (orderId) localStorage.setItem(KEY, JSON.stringify({ order_id: orderId, amount: Number(amount) || 0, at: Date.now() }));
  } catch { /* storage unavailable */ }
}

export function clearPaidBriefOrder() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

/** Server codes after which the saved order must not be tried again. */
export const FINAL_ORDER_CODES = ["PAYMENT_ALREADY_USED", "PAYMENT_TOO_LOW", "PAYMENT_NOT_COMPLETED"];

// Session 26. Where the brand lands after a paid brief is posted: My Briefs.
export const BRIEF_POSTED_PATH = "/brand/ugc/briefs?tab=briefs";

// Session 31 (Ravi): after paying, the brand saw an EMPTY "Create brief" form. Razorpay Checkout
// adds a browser-history entry and goes "back" when it closes; that pops My Briefs back to the post
// page, which remounts empty (the draft is already removed). Three guards:
//   1. a flag in sessionStorage says "a brief was just posted" (60 s);
//   2. the post page, if it mounts while that flag is fresh, goes straight to My Briefs (replace);
//   3. a short while after leaving, if the URL is back on the post page, replace it with My Briefs.
const POSTED_FLAG = "ugc_brief_posted_at";
export const RECENT_POST_MS = 60000;

export function markBriefPosted(now = Date.now()) {
  try { sessionStorage.setItem(POSTED_FLAG, String(now)); } catch { /* storage unavailable */ }
}

/** true (once) when a brief was posted in the last `windowMs`; the flag is cleared when read. */
export function takeRecentBriefPost(windowMs = RECENT_POST_MS, now = Date.now()) {
  try {
    const at = Number(sessionStorage.getItem(POSTED_FLAG) || 0);
    if (!at) return false;
    sessionStorage.removeItem(POSTED_FLAG);
    return now - at >= 0 && now - at <= windowMs;
  } catch {
    return false;
  }
}

const onPostPage = () => {
  try { return window.location.pathname.startsWith("/brand/ugc/post"); } catch { return false; }
};

/**
 * Leave the post page for My Briefs. Uses the router first; once the checkout has closed (and may
 * have gone "back"), puts My Briefs in place of the post page; if a lazy page never finished loading
 * (the old "stuck on Processing…" report) it does a full page load instead.
 */
export function goToPostedBriefs(navigate, { fallbackMs = 2500, settleMs = 800 } = {}) {
  markBriefPosted();
  try { navigate(BRIEF_POSTED_PATH); } catch { /* fall through to the hard redirect */ }
  if (typeof window === "undefined") return;
  setTimeout(() => {
    try { if (onPostPage()) navigate(BRIEF_POSTED_PATH, { replace: true }); } catch { /* ignore */ }
  }, settleMs);
  setTimeout(() => {
    try { if (onPostPage()) window.location.replace(BRIEF_POSTED_PATH); } catch { /* ignore */ }
  }, fallbackMs);
}

/**
 * Safety net while the checkout is open: if the payment for `orderId` completes but the normal
 * success callback never arrives, call `onPaid(orderId)` once. Returns a stop function.
 * The brief post is idempotent per order on the server, so a double call is harmless.
 */
export function watchPaidOrder(checkStatus, orderId, onPaid, { startAfterMs = 15000, intervalMs = 5000, maxMs = 300000 } = {}) {
  if (!orderId || typeof checkStatus !== "function") return () => {};
  let stopped = false;
  let timer = null;
  const began = Date.now();
  const tick = async () => {
    if (stopped) return;
    if (Date.now() - began > maxMs) { stopped = true; return; }
    try {
      const paid = await checkStatus(orderId);
      if (!stopped && paid) { stopped = true; onPaid(orderId); return; }
    } catch { /* transient — try again */ }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, startAfterMs);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/** true when Razorpay / the server say this order is paid. */
export async function checkBriefOrderPaid(orderId) {
  const { data } = await api.post("payments/razorpay/check-status", { order_id: orderId });
  return Boolean(data?.paid);
}

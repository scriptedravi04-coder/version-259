// Session 23 — shared chat helpers.

/**
 * Oldest first. Rows without a usable time (e.g. an optimistic message) go last.
 * Stable: equal times keep their arrival order.
 */
export function sortChronologically(list) {
  const t = (m) => {
    const v = new Date(m?.created_at || m?.timestamp || 0).getTime();
    return Number.isFinite(v) && v > 0 ? v : Number.POSITIVE_INFINITY;
  };
  return (list || [])
    .map((m, i) => ({ m, i, k: t(m) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1))
    .map((x) => x.m);
}

/**
 * One refresh for a burst of socket events. A single action can send new_message +
 * thread_updated + agreement_signed (some twice); each used to start its own
 * messages + thread download, and the answers arrived out of order — buttons flickered.
 * Now: the first event schedules a refresh `delayMs` later; anything that arrives while one
 * is running queues exactly one more.
 */
export function createCoalescedRunner(run, delayMs = 80) {
  let timer = null;
  let running = false;
  let again = false;
  let stopped = false;

  const fire = async () => {
    timer = null;
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    try { await run(); } catch { /* next event or poll retries */ }
    running = false;
    if (again && !stopped) { again = false; schedule(); }
  };
  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(fire, delayMs);
  };
  schedule.cancel = () => { stopped = true; if (timer) clearTimeout(timer); timer = null; };
  return schedule;
}

/** Last activity of a thread: a local bump, its newest message, else its update/creation time. */
export function threadActivityTime(t) {
  const cands = [t?._activity_at, t?.last_message?.created_at, t?.last_message_at, t?.updated_at, t?.created_at];
  let best = 0;
  for (const c of cands) {
    const v = new Date(c || 0).getTime();
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best;
}

/** Inbox order: newest activity first (stable for equal times). */
export function sortThreadsByActivity(list) {
  return (list || [])
    .map((t, i) => ({ t, i, k: threadActivityTime(t) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : b.k - a.k))
    .map((x) => x.t);
}

/** Tell the inbox list that a thread just had a message (open chat → list moves it to the top). */
export function announceChatActivity(threadId, at) {
  if (typeof window === "undefined" || !threadId) return;
  try {
    window.dispatchEvent(new CustomEvent("chat_activity", { detail: { threadId, at: at || new Date().toISOString() } }));
  } catch { /* old browsers: the next list refresh sorts it anyway */ }
}

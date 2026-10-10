import { logIgnored } from "./logIgnored";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import { inspectContactLeakage } from "./helpers";
import { checkAbusiveContent } from "./abuseFilter";
import { chatModeration, newModerationEvent } from "./chatModeration";

// Core chat/messaging routes: listing a user's threads, fetching a single
// thread, fetching/sending messages, and admin chat-moderation endpoints.
//
// NOTE: this deliberately covers only the "generic chat infrastructure"
// routes. UGC-order-specific and Campaign-Deal-specific chat ACTIONS (sign,
// negotiate, approve, submit-live-link, etc.) still live in server.ts for
// now, because they're tightly coupled to large UGC/Deals lifecycle
// handler functions (syncUgcLifecycleEvent and friends) that would need
// their own careful, separate extraction pass — moving them together with
// this file risked a much larger, riskier change. This split is
// intentionally incremental.
// Inbox cache (session 23). Short on purpose: it only merges bursts; any write clears it.
export const INBOX_TTL_MS = 5000;
const inboxCache = new Map<string, { at: number; data: any; gen: number }>();
const inboxInflight = new Map<string, Promise<any>>();
let inboxGen = 0;
/** Called after every successful non-GET API request (server.ts), and usable by tests. */
export function clearInboxCache() {
  inboxGen += 1;
  inboxCache.clear();
}

/** Last activity of a thread: its newest message, else its own update/creation time. */
export function threadActivityTime(t: any): number {
  const cands = [t?.last_message?.created_at, t?.last_message_at, t?.updated_at, t?.created_at];
  let best = 0;
  for (const c of cands) {
    const v = new Date(c || 0).getTime();
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best;
}

/** Newest activity first; stable for equal times. */
export function sortThreadsByActivity<T>(list: T[]): T[] {
  return (list || [])
    .map((t, i) => ({ t, i, k: threadActivityTime(t) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : b.k - a.k))
    .map((x) => x.t);
}

/** Oldest first; rows without a usable time go last. Stable for equal times. */
export function sortMessagesChronologically<T extends { created_at?: any }>(list: T[]): T[] {
  const t = (m: any) => {
    const v = new Date(m?.created_at || 0).getTime();
    return Number.isFinite(v) && v > 0 ? v : Number.POSITIVE_INFINITY;
  };
  return list
    .map((m, i) => ({ m, i, k: t(m) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1))
    .map((x) => x.m);
}

export function setupChatCoreRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    ensureUGCChatThread,
    populateThreadData,
    insertChatMessageToSupabase,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    ensureUGCChatThread: (order: any, brief: any, user: any, io: any) => Promise<any>;
    populateThreadData: (threads: any[], userId: string) => Promise<any[]>;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
  }
) {

  // Session 38: blocked / flagged chat messages are kept in Supabase (backend/chatModeration.ts).
  const moderation = chatModeration({ getClient: () => privilegedSupabase || null, getDb, saveDb });

  // Bounded parallelism for per-row Supabase work. Serial `for … await` over every UGC order was
  // the single largest cost of opening the inbox: two round trips per order, one after another.
  const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
    const out: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try { out[i] = await fn(items[i]); } catch (e) { out[i] = undefined as any; }
      }
    });
    await Promise.all(workers);
    return out;
  };

  // Threads for this user, Supabase + local store merged (newest copy of each wins).
  const loadUserThreads = async (userId: string) => {
    let threads: any[] = [];
    if (supabase) {
      try {
        const { data: dbThreads } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`creator_id.eq.${userId},brand_id.eq.${userId}`)
          .order('updated_at', { ascending: false });
        if (dbThreads) threads = dbThreads;
      } catch (e) {
        console.error("[GET /chat/v2/threads] Supabase fetch error:", e);
      }
    }
    const db = getDb();
    const localThreads = (db.chat_threads || []).filter((t: any) => t.creator_id === userId || t.brand_id === userId);
    threads = threads.map(st => {
      const lt = localThreads.find((l: any) => l.id === st.id || (st.deal_id && st.deal_id === l.deal_id));
      if (lt) {
        const stUpdated = new Date(st.updated_at || st.created_at || 0).getTime();
        const ltUpdated = new Date(lt.updated_at || lt.created_at || 0).getTime();
        if (ltUpdated > stUpdated) {
          return { ...st, ...lt, flow_state: lt.flow_state || st.flow_state || st.status, status: lt.status || st.status };
        } else {
          return { ...lt, ...st, flow_state: st.flow_state || lt.flow_state || st.status, status: st.status || lt.status };
        }
      }
      return st;
    });
    localThreads.forEach((lt: any) => {
      if (!threads.some(t => t.id === lt.id || (t.deal_id && t.deal_id === lt.deal_id))) {
        threads.push(lt);
      }
    });
    return threads;
  };

  // Lightweight count for the nav badge. Layout used to fetch the ENTIRE populated thread list
  // every 30 seconds on every page just to read `.length` — the heaviest request in the app, run
  // continuously in the background for every signed-in user. Registered before /:threadId so
  // "count" is not read as a thread id.
  router.get("/chat/v2/threads/count", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const threads = await loadUserThreads(user.user_id);
    // Session 23: the nav badge shows UNREAD messages. Layout used to fetch the whole populated
    // inbox every 30 s to add them up (the heaviest request in the app). One head-count query now.
    let unread = 0;
    try {
      const ids = threads.map((t: any) => t.id).filter(Boolean);
      const client = privilegedSupabase || supabase;
      if (client && ids.length) {
        const { count } = await client.from('chat_messages')
          .select('message_id', { count: 'exact', head: true })
          .in('thread_id', ids)
          .eq('read', false)
          .neq('sender_user_id', user.user_id);
        unread = Number(count) || 0;
      }
    } catch (e) { logIgnored("chat_routes:threads-count-unread", e); }
    return res.json({ count: threads.length, unread });
  });

  router.get("/chat/v2/threads", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const t0 = Date.now();

    // Session 23: the inbox is the heaviest request (threads + heal + profiles + orders + deals +
    // message windows). The dashboard, the inbox, the chat and a socket event often ask for it
    // within the same second. Same user at the same moment → one computation (in-flight share);
    // an answer is reused for INBOX_TTL_MS; ANY write request clears it (see clearInboxCache).
    const uid = String(user.user_id);
    const hit = inboxCache.get(uid);
    if (hit && Date.now() - hit.at < INBOX_TTL_MS && hit.gen === inboxGen) {
      res.setHeader("X-Inbox-Cache", "hit");
      return res.json(hit.data);
    }
    const running = inboxInflight.get(uid);
    if (running) {
      try { const data = await running; res.setHeader("X-Inbox-Cache", "shared"); return res.json(data); }
      catch { /* the first computation failed — compute our own below */ }
    }
    const myGen = inboxGen;
    let settle: (v: any) => void = () => {};
    let fail: (e: any) => void = () => {};
    const shared = new Promise<any>((ok, no) => { settle = ok; fail = no; });
    shared.catch(() => {});
    inboxInflight.set(uid, shared);
    const sendJson = res.json.bind(res);
    res.json = (body: any) => {
      if (inboxInflight.get(uid) === shared) inboxInflight.delete(uid);
      if (res.statusCode < 400) {
        if (myGen === inboxGen) inboxCache.set(uid, { at: Date.now(), data: body, gen: myGen });
        settle(body);
      } else {
        fail(new Error("inbox failed"));
      }
      return sendJson(body);
    };
    res.on("close", () => {
      if (inboxInflight.get(uid) === shared) { inboxInflight.delete(uid); fail(new Error("closed")); }
    });

    // 1. Threads first.
    let threads: any[] = await loadUserThreads(user.user_id);
    const tThreads = Date.now();

    // 2. Auto-heal: every UGC order must have a thread. This used to run ensureUGCChatThread for
    //    EVERY order, serially, on every inbox load (and every 10 s poll on mobile) — even for
    //    orders whose thread already existed. Now only orders with no thread are healed, in
    //    parallel, and the healed threads are added to the list.
    try {
      let userOrders: any[] = [];
      if (supabase) {
        const { data: ords } = await (privilegedSupabase || supabase).from('ugc_orders')
          .select('*')
          .or(`creator_id.eq.${user.user_id},brand_id.eq.${user.user_id}`);
        if (ords) userOrders = ords;
      }
      const db = getDb();
      const localOrds = (db.ugc_orders || []).filter((o: any) => o.creator_id === user.user_id || o.brand_id === user.user_id);
      const combinedOrders = [...userOrders];
      localOrds.forEach((lo: any) => {
        if (!combinedOrders.some(o => o.id === lo.id)) combinedOrders.push(lo);
      });

      const known = new Set<string>();
      threads.forEach((t: any) => { if (t.id) known.add(t.id); if (t.deal_id) known.add(t.deal_id); if (t.ugc_order_id) known.add(t.ugc_order_id); });
      // A thread that exists but is behind a COMPLETED order is also healed (status sync).
      const needsHeal = combinedOrders.filter((o: any) => {
        if (!o?.id) return false;
        if (!known.has(o.id)) return true;
        if (o.status === 'COMPLETED') {
          const t = threads.find((x: any) => x.id === o.id || x.deal_id === o.id);
          return t && t.status !== 'COMPLETED';
        }
        return false;
      });
      if (needsHeal.length > 0) {
        const healed = await mapLimit(needsHeal, 5, (ord: any) => ensureUGCChatThread(ord, null, user, req.app.get("io")));
        healed.forEach((ht: any) => {
          if (!ht || !ht.id) return;
          const i = threads.findIndex((t: any) => t.id === ht.id || (ht.deal_id && t.deal_id === ht.deal_id));
          if (i >= 0) threads[i] = { ...threads[i], ...ht };
          else threads.unshift(ht);
        });
      }
    } catch (e) {
      console.error("[GET /chat/v2/threads] Auto-heal UGC orders error:", e);
    }
    const tHeal = Date.now();

    const db = getDb();

    // If dedicated test thread exists, ensure it is available for easy manual browser testing
    const dedicatedTestThread = (db.chat_threads || []).find((t: any) => t.id === 'thread_test_live_link_flow_v2');
    if (dedicatedTestThread && !threads.some(t => t.id === 'thread_test_live_link_flow_v2')) {
      threads.unshift(dedicatedTestThread);
    }

    // 3. Populate full thread metadata
    const populated = await populateThreadData(threads, user.user_id);
    const tEnd = Date.now();
    // Stage timings, so the next "inbox is slow" report can be answered from the logs instead of
    // by reading code.
    res.setHeader('Server-Timing', `threads;dur=${tThreads - t0}, heal;dur=${tHeal - tThreads}, populate;dur=${tEnd - tHeal}`);
    if (tEnd - t0 > 3000) {
      console.warn(`[GET /chat/v2/threads] slow: ${tEnd - t0}ms (threads ${tThreads - t0}ms, heal ${tHeal - tThreads}ms, populate ${tEnd - tHeal}ms, n=${threads.length})`);
    }
    // Newest activity first. The list used to follow chat_threads.updated_at (changes on status
    // updates, not on every message) and healed threads were unshifted to the top — so a thread
    // with a day-old message could sit above one messaged a minute ago (session 23).
    return res.json(sortThreadsByActivity(populated));
  });


  router.get("/chat/v2/threads/:threadId", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;

    // Check if this threadId is a UGC order or deal ID and ensure thread
    if (threadId.startsWith('ugcord_')) {
      let ord: any = null;
      if (supabase) {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', threadId).maybeSingle();
        if (data) ord = data;
      }
      if (!ord) {
        const db = getDb();
        ord = (db.ugc_orders || []).find((o: any) => o.id === threadId);
      }
      if (ord) {
        await ensureUGCChatThread(ord, null, user, req.app.get("io"));
      }
    }

    let thread: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`id.eq.${threadId},deal_id.eq.${threadId}`)
          .maybeSingle();
        if (data) thread = data;
      } catch (e) { logIgnored("chat_routes:209", e); }
    }
    const db = getDb();
    const localT = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId);
    if (!thread && localT) {
      thread = localT;
    } else if (thread) {
      // Trust Supabase data, but map agreed_amount back to counter_amount if negotiating
      if (thread.flow_state === 'NEGOTIATING_COUNTER' && thread.agreed_amount && !thread.counter_amount) {
        thread.counter_amount = thread.agreed_amount;
      }
    }
    
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    // WHO (session 27): the two parties and admins only.
    {
      const isStaff = ["admin", "sub_admin"].includes(String(user.role || "")) || user.team_role === "sub_admin";
      const me = new Set([String(user.user_id), String(user.parent_brand_id || user.user_id)]);
      if (!isStaff && !me.has(String(thread.creator_id)) && !me.has(String(thread.brand_id))) {
        return res.status(403).json({ detail: "You are not part of this chat.", code: "NOT_A_PARTICIPANT" });
      }
    }

    const [populated] = await populateThreadData([thread], user.user_id);
    return res.json(populated);
  });


  router.get("/chat/v2/threads/:threadId/messages", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const client = privilegedSupabase || supabase;

    // Thread and messages are fetched in parallel (they were two round trips in a row).
    // Messages are asked for by both ids the caller might use; the thread row tells us the real one.
    const threadP = client
      ? Promise.resolve(client.from('chat_threads').select('id, creator_id, brand_id')
          .or(`id.eq.${threadId},deal_id.eq.${threadId}`).limit(1))
          .then((r: any) => (Array.isArray(r?.data) ? r.data[0] : r?.data) || null, () => null)
      : Promise.resolve(null);
    const msgsP = client
      ? Promise.resolve(client.from('chat_messages').select('*').eq('thread_id', threadId)
          .order('created_at', { ascending: true }).limit(2000))
          .then((r: any) => r?.data || [], (e: any) => { logIgnored("chat_routes:261", e); return []; })
      : Promise.resolve([]);

    const db = getDb();
    let thrRecord: any = await threadP;
    let targetThreadId = thrRecord?.id || threadId;
    if (!thrRecord) {
      thrRecord = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId) || null;
      if (thrRecord?.id) targetThreadId = thrRecord.id;
    }

    // WHO (session 27): only the two parties (a brand team member acts for the brand) and admins
    // read a chat. Before, any logged-in user could read any thread's messages by its id.
    const isStaff = ["admin", "sub_admin"].includes(String(user.role || "")) || user.team_role === "sub_admin";
    const me = new Set([String(user.user_id), String(user.parent_brand_id || user.user_id)]);
    if (!isStaff && thrRecord && !me.has(String(thrRecord.creator_id)) && !me.has(String(thrRecord.brand_id))) {
      return res.status(403).json({ detail: "You are not part of this chat.", code: "NOT_A_PARTICIPANT" });
    }
    if (!isStaff && !thrRecord) return res.json([]);

    let messages: any[] = await msgsP;
    if (client && targetThreadId !== threadId) {
      try {
        const { data: more } = await client.from('chat_messages').select('*').eq('thread_id', targetThreadId)
          .order('created_at', { ascending: true }).limit(2000);
        const have = new Set(messages.map((m: any) => String(m.message_id || m.id)));
        for (const m of more || []) if (!have.has(String(m.message_id || m.id))) messages.push(m);
      } catch (e) { logIgnored("chat_routes:msgs-by-real-id", e); }
    }
    const localMsgs = (db.chat_messages || []).filter((m: any) => m.thread_id === targetThreadId || m.thread_id === threadId);
    localMsgs.forEach((lm: any) => {
      const mid = lm.message_id || lm.id;
      const lContent = (lm.content || lm.text || "").trim();
      const alreadyExists = messages.some(m => {
        const mId = m.message_id || m.id;
        if (mId && mid && mId === mid) return true;
        const mContent = (m.content || m.text || "").trim();
        if (mContent && lContent && mContent === lContent) {
          return true;
        }
        return false;
      });
      if (!alreadyExists) {
        messages.push(lm);
      }
    });
    // Local-only rows were pushed at the END, whatever their time — a card from 18:54 then sat
    // below messages from 18:57 for ever. One chronological order for everything (stable, so
    // equal timestamps keep their original order).
    messages = sortMessagesChronologically(messages);

    // Mark as read if user is receiver
    // In the background: the reply does not wait for this write any more.
    if (supabase && messages.some((m: any) => m.read === false && String(m.receiver_user_id) === String(user.user_id))) {
      Promise.resolve((privilegedSupabase || supabase).from('chat_messages')
        .update({ read: true })
        .eq('thread_id', targetThreadId)
        .eq('receiver_user_id', user.user_id)
        .eq('read', false)).catch((e: any) => logIgnored("chat_routes:289", e));
    }

    return res.json(messages.map(m => {
      const mid = m.message_id || m.id;
      const localMatch = localMsgs.find((lm: any) => (lm.message_id || lm.id) === mid);
      let meta = m.metadata || localMatch?.metadata || {};
      let mType = m.message_type || localMatch?.message_type;
      let mUrl = m.media_url || m.content_url || meta.content_url || 
        meta.video_url || meta.media_url || 
        localMatch?.media_url || localMatch?.content_url;
      const txt = m.text || m.content || "";

      if (!mType || mType === "system") {
        if (txt.includes("Deliverables Approved & Payment Released") || txt.includes("Payment Released & Approved") || txt.includes("payout is being processed via Escrow")) {
          mType = "live_links_approved";
        } else if (txt.includes("Live Post Link Submitted") || txt.includes("Live link submitted")) {
          mType = "live_links_submitted";
        } else if (txt.includes("Creator has signed the partnership agreement")) {
          mType = "creator_signed";
        } else if (txt.includes("Brand has signed the partnership agreement")) {
          mType = "brand_signed";
        } else if (txt.includes("Agreement Executed! Both parties have signed") || txt.includes("Agreement Executed")) {
          mType = "agreement_executed";
        } else if (txt.includes("Payment Secured!") || txt.includes("Payment Secured") || txt.includes("Escrow Payment Secured") || txt.includes("held safely in escrow")) {
          mType = "payment_secured";
          if (!meta.action) {
            meta = { ...meta, action: 'payment_secured' };
          }
        } else if (txt.includes("Brand requested a revision") || txt.includes("Revision feedback:") || txt.includes("CHANGES_REQUESTED")) {
          mType = "revision_requested";
          if (!meta.feedback && txt.includes("revision: ")) {
            const fb = txt.split("revision: ")[1]?.trim();
            meta = {
              ...meta,
              feedback: fb,
              notes: fb,
              revision_notes: fb,
              action: 'revision_requested'
            };
          }
        } else if (txt.includes("UGC Deliverable Draft Submitted") || txt.includes("Deliverable URL:")) {
          mType = "content_proof_submitted";
          if (!mUrl && txt.includes("Deliverable URL: ")) {
            mUrl = txt.split("Deliverable URL: ")[1]?.split("\n")[0]?.trim();
          }
        } else if (txt.includes("Creator declined revision") || txt.includes("declined the revision") || txt.includes("Declined Revision Request")) {
          mType = "revision_declined";
        } else if (txt.includes("UGC Deliverable Approved") || txt.includes("Deliverable Approved") || txt.includes("Content Approved") || txt.includes("Content Draft Approved")) {
          mType = "content_approved";
        } else if (txt.includes("UGC Order Cancelled") || txt.includes("Order Cancelled")) {
          mType = "order_cancelled";
        }
      }

      let senderUid = m.sender_user_id || m.sender_id || meta.sender_id;
      const sRole = (mType === 'brand_signed' || mType === 'creator_signed' || mType === 'agreement_executed')
        ? 'system'
        : (m.sender_role || meta.sender_role || (
          mType === 'live_links_submitted' || mType === 'content_proof_submitted' || mType === 'live_links_resubmit_declined'
            ? 'creator'
            : (mType === 'live_links_approved' || mType === 'live_links_resubmit_request' || mType === 'revision_requested'
              ? 'brand'
              : (thrRecord ? (String(thrRecord.creator_id) === String(senderUid) ? 'creator' : (String(thrRecord.brand_id) === String(senderUid) ? 'brand' : undefined)) : undefined))
        ));

      if (!senderUid && sRole === 'creator' && thrRecord?.creator_id) {
        senderUid = thrRecord.creator_id;
      } else if (!senderUid && sRole === 'brand' && thrRecord?.brand_id) {
        senderUid = thrRecord.brand_id;
      }

      if (mUrl) {
        if (!meta.content_url) meta.content_url = mUrl;
        if (!meta.video_url) meta.video_url = mUrl;
      }

      return {
        ...m,
        id: mid,
        message_id: mid,
        sender_id: senderUid,
        receiver_id: m.receiver_user_id || m.receiver_id,
        sender_user_id: senderUid,
        receiver_user_id: m.receiver_user_id || m.receiver_id,
        sender_role: sRole,
        message_type: mType,
        metadata: meta,
        media_url: mUrl,
        content_url: mUrl,
        video_url: mUrl,
        content: txt,
        text: txt
      };
    }));
  });


  router.post("/chat/v2/threads/:threadId/messages", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const { content, text, message_type } = req.body;
    const msgText = (content || text || "").trim();
    if (!msgText) return res.status(400).json({ error: "Message content cannot be empty" });
    // threadId + sender are what let the filter reassemble a number split across several
    // messages; without them only single-message detection works.
    if (message_type !== 'system') {
      // Both checks run HERE, on the server. The frontend copies exist only for instant
      // feedback — a client-side block is bypassed by posting to this route directly, which
      // is exactly what someone determined to share a number will do.
      // Session 38: saved to Supabase (chat_moderation_events) instead of this instance's local
      // file only. Not awaited: recording must never slow down or stop the block itself.
      const recordAttempt = (code: string, reason: string, matched?: string, blocked = true) => {
        moderation.record(newModerationEvent({
          threadId, senderId: user.user_id, senderRole: user.role || null,
          code, reason, matched: matched || null, content: String(msgText), blocked,
        })).catch((e: any) => console.warn("[chat] could not record blocked attempt:", e?.message || e));
      };

      // Harassment first: it is the more serious of the two, and a message can trip both.
      const abuse = checkAbusiveContent(msgText);
      if (abuse.blocked) {
        recordAttempt(abuse.code || "ABUSE", abuse.severity || "harassment", abuse.matched);
        return res.status(400).json({
          blocked: true,
          error: abuse.message || "This message was blocked. Please keep the conversation professional.",
          code: abuse.code || "ABUSE_BLOCKED"
        });
      }
      if (abuse.severity === "profanity" && abuse.matched) {
        // Not blocked, but recorded so admin can see a pattern building up.
        recordAttempt("PROFANITY_FLAGGED", "profanity", abuse.matched, false);
      }

      const leak = inspectContactLeakage(msgText, { threadId, senderId: user.user_id });
      if (leak.blocked) {
        recordAttempt(leak.code || "CONTACT_INFO_BLOCKED", "contact_leak");
        return res.status(400).json({
          blocked: true,
          error: leak.message || "Contact details cannot be shared in chat. Please keep all communications on-platform.",
          code: leak.code || "CONTACT_INFO_BLOCKED"
        });
      }
    }

    // 1. Find thread in Supabase or local DB
    let thread: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`id.eq.${threadId},deal_id.eq.${threadId}`)
          .maybeSingle();
        if (data) thread = data;
      } catch (e) { logIgnored("chat_routes:457", e); }
    }
    if (!thread) {
      const db = getDb();
      thread = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId);
    }

    // If still not found and looks like a UGC order, auto-heal thread creation
    if (!thread && threadId.startsWith('ugcord_')) {
      let ord: any = null;
      if (supabase) {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', threadId).maybeSingle();
        if (data) ord = data;
      }
      if (!ord) {
        const db = getDb();
        ord = (db.ugc_orders || []).find((o: any) => o.id === threadId);
      }
      if (ord) {
        thread = await ensureUGCChatThread(ord, null, user, req.app.get("io"));
      }
    }

    if (!thread) return res.status(404).json({ error: "Thread not found" });

    const senderRole = req.body.sender_role || (
      (user.role === 'creator' || user.user_type === 'creator') ? 'creator' :
      (user.role === 'brand' || user.user_type === 'brand') ? 'brand' :
      (thread && String(thread.creator_id) === String(user.user_id) ? 'creator' : 'brand')
    );
    const receiverId = (senderRole === 'creator') ? thread.brand_id : thread.creator_id;
    const nowIso = new Date().toISOString();
    const msgId = crypto.randomUUID();

    // 2. Insert into Supabase chat_messages (matching exact table schema)
    const dbMsg = {
      message_id: msgId,
      thread_id: thread.id,
      sender_user_id: user.user_id,
      receiver_user_id: receiverId,
      sender_role: senderRole,
      text: msgText,
      from_name: user.name,
      message_type: message_type || 'text',
      created_at: nowIso,
      read: false
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(dbMsg);

        // Update updated_at on thread
        await (privilegedSupabase || supabase).from('chat_threads').update({ 
          updated_at: nowIso 
        }).eq('id', thread.id);
      } catch (err) {
        console.warn("[POST /chat/v2/threads/:threadId/messages] Supabase notice:", err);
      }
    }

    // 3. Update local DB
    const db = getDb();
    if (!db.chat_messages) db.chat_messages = [];
    const localMsg = {
      ...dbMsg,
      id: msgId,
      sender_id: user.user_id,
      sender_user_id: user.user_id,
      receiver_id: receiverId,
      receiver_user_id: receiverId,
      sender_role: senderRole,
      content: msgText,
      message_type: message_type || 'text'
    };
    db.chat_messages.push(localMsg);
    const localThr = (db.chat_threads || []).find((t: any) => t.id === thread.id || t.deal_id === thread.id);
    if (localThr) {
      localThr.updated_at = nowIso;
      localThr.last_message = localMsg;
    }
    saveDb(db);

    // 4. Socket notifications
    const io = req.app.get("io");
    if (io) {
      io.to(thread.id).emit("new_message", localMsg);
      io.to(threadId).emit("new_message", localMsg);
      emitThreadEvent(io, "thread_updated", { threadId: thread.id, last_message: localMsg });
    }

    return res.json(localMsg);
  });


  router.get("/admin/chat/all", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    // Session 38: all chats from Supabase (newest first, up to 1000) with both names, instead of
    // the threads this one server instance happened to have in its local file.
    const client = privilegedSupabase || null;
    if (client) {
      try {
        const { data: threads, error } = await client.from('chat_threads').select('*').order('updated_at', { ascending: false }).limit(1000);
        if (error) throw error;
        const ids = Array.from(new Set((threads || []).flatMap((t: any) => [t.brand_id, t.creator_id]).filter(Boolean).map(String)));
        const people = new Map<string, any>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await client.from('users').select('user_id, name, email, role, picture').in('user_id', ids.slice(i, i + 200));
          for (const u of data || []) people.set(String(u.user_id), u);
        }
        return res.json((threads || []).map((t: any) => ({
          ...t,
          status: t.status || t.flow_state || null,
          creator: t.creator || people.get(String(t.creator_id)) || null,
          brand: t.brand || people.get(String(t.brand_id)) || null,
        })));
      } catch (e: any) {
        console.error("[admin/chat/all]", e?.message || e);
        return res.status(502).json({ error: "Could not load chats. Please try again." });
      }
    }
    const db = getDb();
    res.json(db.chat_threads || []);
  });


  router.get("/admin/chat/flagged", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    const db = getDb();
    res.json(db.message_flags || []);
  });


  // Session 38: both lists come from chat_moderation_events (Supabase). "Guard violations" are
  // the blocked messages only; "chat violations" are all rows (blocked + profanity logged).
  router.get("/admin/chat_guard_violations", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    try {
      const all = await moderation.list();
      res.json(all.filter((v: any) => v.violation_type === "hard_number"));
    } catch (e: any) {
      res.status(502).json({ error: "Could not load blocked messages." });
    }
  });


  router.get("/admin/chat_violations", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    try {
      res.json(await moderation.list());
    } catch (e: any) {
      res.status(502).json({ error: "Could not load chat violations." });
    }
  });


  router.post("/admin/chat/flagged/:id/resolve", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    const db = getDb();
    const flag = (db.message_flags || []).find((f: any) => f.id === req.params.id);
    if (flag) {
      flag.status = req.body.action;
      saveDb(db);
    }
    res.json({ success: true });
  });


  router.post("/admin/chat_violations/:id/resolve", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    try {
      const found = await moderation.resolve(req.params.id, String(req.body?.action || ""), admin.user_id);
      if (!found) return res.status(404).json({ error: "This entry was not found. Refresh the list." });
      res.json({ success: true });
    } catch (e: any) {
      res.status(502).json({ error: `Couldn't save: ${e?.message || "database error"}` });
    }
  });


  router.post([
    // The frontend posts reviews on the split namespaces; only the legacy path existed.
    "/ugc/threads/:threadId/submit-review",
    "/campaign/threads/:threadId/submit-review",
    "/chat/v2/threads/:threadId/submit-review"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });
    const { threadId } = req.params;
    const { rating, communication_rating, timeliness_rating, quality_rating, comment } = req.body;

    // Ratings are 1–5 and the server says so; the UI was the only check.
    const inRange = (v: any) => v === undefined || v === null || (Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5);
    if (!Number.isFinite(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 ||
        !inRange(communication_rating) || !inRange(timeliness_rating) || !inRange(quality_rating)) {
      return res.status(400).json({ error: "Ratings must be between 1 and 5." });
    }

    try {
      if (supabase) {
        // Find the thread
        const { data: thread } = await (privilegedSupabase || supabase).from('chat_threads').select('*').eq('id', threadId).maybeSingle();
        if (!thread) return res.status(404).json({ error: "Thread not found" });
        
        // Only the two parties review each other. Anyone could post a review before, with no
        // target; and the same person could review the same deal any number of times.
        const uid = user.user_id || user.id;
        let targetId = null;
        if (uid === thread.creator_id) targetId = thread.brand_id;
        else if (uid === thread.brand_id || (user.parent_brand_id && user.parent_brand_id === thread.brand_id)) targetId = thread.creator_id;
        if (!targetId) return res.status(403).json({ error: "Only the brand and creator on this deal can review it." });

        try {
          const { data: existing } = await (privilegedSupabase || supabase)
            .from('reviews')
            .select('id')
            .eq('thread_id', threadId)
            .eq('reviewer_id', uid)
            .limit(1);
          if (Array.isArray(existing) && existing.length > 0) {
            return res.status(409).json({ error: "You have already reviewed this collaboration." });
          }
        } catch (e) { logIgnored("chat_routes:652", e); }

        const reviewData = {
          reviewer_id: user.user_id || user.id,
          target_id: targetId,
          thread_id: threadId,
          deal_id: thread?.deal_id,
          ugc_order_id: thread?.ugc_order_id,
          rating,
          communication_rating,
          timeliness_rating,
          quality_rating,
          comment,
          created_at: new Date().toISOString()
        };
        const { error: insErr } = await (privilegedSupabase || supabase).from('reviews').insert(reviewData).select();
        // A failed insert used to answer { success: true }.
        if (insErr) {
          console.error("[submit-review] insert failed:", insErr.message || insErr);
          return res.status(500).json({ error: "Failed to submit review" });
        }
      }

      res.json({ success: true });
    } catch (e) {
      console.error("[POST /chat/v2/threads/:threadId/submit-review] Error:", e);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
}

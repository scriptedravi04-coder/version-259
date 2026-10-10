import express from "express";
import crypto from "crypto";
import webpush from "web-push";

// Session 41 (Ravi) — push notifications (phone notifications, even when the app is closed).
//
// 1. Deal pushes — automatic. Every row the app already writes to `notifications` (new message,
//    invite, application, counter, contract, UGC, payment, KYC…) is also sent to the user's phone.
//    A small loop reads new rows every 20 s, so not one locked deal/chat/payment file was changed.
// 2. Promo pushes — the admin writes them (any language) in Admin → Push notifications:
//    audience = everyone / creators / brands / creators of chosen niches (city: Phase 2);
//    send now or schedule. No daily limit (Session 43, Ravi: marketing pushes are unlimited).
// No on/off setting in the app (Ravi). Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT —
// without them everything here just stays quiet. Tables: scripts/sql/session41.sql.

/** Session 43 (Ravi): promo pushes have no daily cap any more. null = no limit. */
export const PROMO_DAILY_LIMIT: number | null = null;

/** Why a push reached nobody — shown to the admin instead of a bare "Sent to 0 phones". */
export function zeroSendReason(audienceUsers: number, devices: number, enabled = true): string | null {
  if (!enabled) return "Push is switched off on the server (VAPID keys missing).";
  if (audienceUsers === 0) return "Nobody matches this audience.";
  if (devices === 0) return "Nobody in this audience has turned on notifications on their phone yet.";
  return null;
}
const AUDIENCES = new Set(["all", "creator", "brand", "niche"]);

/** Cleans what the admin typed for a promo push. */
export function cleanPushInput(body: any): { item?: any; error?: string } {
  const title = String(body?.title || "").trim().slice(0, 80);
  const message = String(body?.message || "").trim().slice(0, 240);
  if (!title) return { error: "Add a title." };
  if (!message) return { error: "Add a message." };
  const audience = AUDIENCES.has(String(body?.audience)) ? String(body.audience) : "all";
  const niches = audience === "niche"
    ? (Array.isArray(body?.niches) ? body.niches : []).map((n: any) => String(n || "").trim()).filter(Boolean).slice(0, 20)
    : [];
  if (audience === "niche" && niches.length === 0) return { error: "Pick at least one niche." };
  const url = String(body?.url || "").trim();
  if (url && !/^\/[A-Za-z0-9/_\-?=&.]*$/.test(url)) return { error: "The page must be inside the app, like /campaigns." };
  let sendAt: string | null = null;
  if (body?.send_at) {
    const t = Date.parse(body.send_at);
    if (Number.isNaN(t)) return { error: "Pick a valid date and time." };
    sendAt = new Date(t).toISOString();
  }
  return { item: { title, message, url: url || null, audience, niches, send_at: sendAt } };
}

/** Does this creator profile match any of the chosen niches? (niche / primary_niche / categories) */
export function creatorMatchesNiches(cp: any, niches: string[]): boolean {
  const want = new Set((niches || []).map((n) => String(n).toLowerCase()));
  if (want.size === 0) return false;
  const have = [cp?.niche, cp?.primary_niche, ...(Array.isArray(cp?.categories) ? cp.categories : []),
    ...(Array.isArray(cp?.niches) ? cp.niches : [])]
    .flatMap((v: any) => String(v || "").split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return have.some((h) => want.has(h));
}

/** Push payload from an in-app notification row. Links are kept inside the app. */
export function payloadFromNotification(n: any) {
  const link = typeof n?.link === "string" && n.link.startsWith("/") ? n.link : "/notifications";
  return {
    title: String(n?.title || "Ybex").slice(0, 80),
    body: String(n?.message || n?.body || "").slice(0, 240),
    url: link,
    tag: n?.id ? `n-${n.id}` : undefined,
  };
}

const isAdmin = (u: any) => Boolean(u && (u.role === "admin" || u.is_admin === true));

export function setupPushRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, parseAuthUser }: {
    supabase: any; privilegedSupabase: any; parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {
  const sb = () => privilegedSupabase || supabase;
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  const priv = process.env.VAPID_PRIVATE_KEY || "";
  const enabled = Boolean(pub && priv && sb());
  if (enabled) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@ybex.in", pub, priv);
  } else {
    console.warn("[push] off — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set (or no database).");
  }

  async function subsFor(userIds: string[]) {
    if (!enabled || userIds.length === 0) return [];
    const out: any[] = [];
    for (let i = 0; i < userIds.length; i += 300) {
      const { data, error } = await sb().from("push_subscriptions").select("*").in("user_id", userIds.slice(i, i + 300));
      if (error) { console.error("[push] read subscriptions:", error.message); break; }
      out.push(...(data || []));
    }
    return out;
  }

  /** Sends to every phone of these users. Dead subscriptions (404/410) are removed. */
  async function sendToUsers(userIds: string[], payload: any): Promise<number> {
    const subs = await subsFor([...new Set(userIds)]);
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "high" }); // Session 43: Android delivers 'high' at once, even in battery saver
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410 || e?.statusCode === 403) { // 403 = made with an old key; the phone re-subscribes on next open (Session 43)
          await sb().from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("[push] send failed:", e?.statusCode || e?.message || e);
        }
      }
    }
    return sent;
  }

  router.get("/push/public-key", (_req, res) => res.json({ key: enabled ? pub : null }));

  router.post("/push/subscribe", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (!enabled) return res.json({ ok: false, reason: "push_off" });
    const s = req.body?.subscription || {};
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return res.status(400).json({ error: "Bad subscription" });
    const row = {
      user_id: user.user_id, endpoint: String(s.endpoint), p256dh: String(s.keys.p256dh), auth: String(s.keys.auth),
      user_agent: String(req.headers["user-agent"] || "").slice(0, 300), last_used_at: new Date().toISOString(),
    };
    const { error } = await sb().from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (error) { console.error("[push] save subscription:", error.message); return res.status(500).json({ error: "Could not save" }); }
    return res.json({ ok: true });
  });

  router.post("/push/unsubscribe", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (enabled && req.body?.endpoint) await sb().from("push_subscriptions").delete().eq("endpoint", String(req.body.endpoint)).eq("user_id", user.user_id);
    return res.json({ ok: true });
  });

  // ---------- Admin: promo pushes ----------
  router.get("/admin/push", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.json({ enabled, items: [] });
    const { data, error } = await sb().from("push_campaigns").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) return res.status(500).json({ enabled, error: "Could not load. Did you run scripts/sql/session41.sql?" });
    const { count } = await sb().from("push_subscriptions").select("endpoint", { count: "exact", head: true });
    return res.json({ enabled, devices: count || 0, items: data || [] });
  });

  router.post("/admin/push", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const { item, error } = cleanPushInput(req.body);
    if (error) return res.status(400).json({ error });
    const row = { id: crypto.randomUUID(), ...item, created_by: user.user_id, created_at: new Date().toISOString() };
    const { error: e } = await sb().from("push_campaigns").insert(row);
    if (e) return res.status(500).json({ error: "Could not save. Did you run scripts/sql/session41.sql?" });
    const report = !row.send_at ? await runCampaign(row) : null; // send now
    return res.json({ ok: true, id: row.id, report });
  });

  router.delete("/admin/push/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    // Only a scheduled push that has not gone out can be cancelled.
    await sb().from("push_campaigns").delete().eq("id", req.params.id).is("sent_at", null);
    return res.json({ ok: true });
  });

  async function audienceIds(c: any): Promise<string[]> {
    if (c.audience === "niche") {
      const { data } = await sb().from("creator_profiles").select("user_id, niche, primary_niche, categories");
      return (data || []).filter((cp: any) => creatorMatchesNiches(cp, c.niches || [])).map((cp: any) => cp.user_id);
    }
    let q = sb().from("users").select("user_id, role");
    if (c.audience === "creator" || c.audience === "brand") q = q.eq("role", c.audience);
    else q = q.in("role", ["creator", "brand"]);
    const { data } = await q;
    return (data || []).map((u: any) => u.user_id);
  }

  async function runCampaign(c: any) {
    // Claim it first so two servers / two loops never send the same push twice.
    const nowIso = new Date().toISOString();
    const { data: claimed } = await sb().from("push_campaigns").update({ sent_at: nowIso }).eq("id", c.id).is("sent_at", null).select("id");
    if (!claimed || claimed.length === 0) return;
    const ids = await audienceIds(c);
    const devices = (await subsFor([...new Set(ids)])).length;
    const sent = await sendToUsers(ids, { title: c.title, body: c.message, url: c.url || "/", tag: `promo-${c.id}` });
    if (ids.length) {
      const rows = ids.map((id) => ({ user_id: id, kind: "promo", ref: c.id, sent_at: nowIso }));
      for (let i = 0; i < rows.length; i += 500) await sb().from("push_log").insert(rows.slice(i, i + 500));
    }
    await sb().from("push_campaigns").update({ sent_count: sent }).eq("id", c.id);
    return { audience: ids.length, devices, sent, reason: sent === 0 ? zeroSendReason(ids.length, devices, enabled) : null };
  }

  // ---------- Loops: scheduled promos + deal pushes from new notifications ----------
  if (enabled && process.env.NODE_ENV !== "test") {
    let cursor = new Date().toISOString(); // only notifications created after the server started
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const now = new Date().toISOString();
        const { data: due } = await sb().from("push_campaigns").select("*").is("sent_at", null).not("send_at", "is", null).lte("send_at", now).limit(5);
        for (const c of due || []) await runCampaign(c);

        const { data: fresh, error } = await sb().from("notifications").select("id, user_id, title, message, link, created_at")
          .gt("created_at", cursor).order("created_at", { ascending: true }).limit(200);
        if (!error && fresh && fresh.length) {
          cursor = fresh[fresh.length - 1].created_at;
          for (const n of fresh) {
            if (!n.user_id || !n.id) continue;
            // One push per notification even if the app runs on more than one server: the first
            // server to write the log row sends it, the others get nothing back and skip.
            const { data: mine } = await sb().from("push_log")
              .upsert({ user_id: n.user_id, kind: "deal", ref: String(n.id), sent_at: new Date().toISOString() },
                { onConflict: "kind,ref,user_id", ignoreDuplicates: true })
              .select("ref");
            if (mine && mine.length) await sendToUsers([n.user_id], payloadFromNotification(n));
          }
        }
      } catch (e: any) {
        console.error("[push] loop:", e?.message || e);
      } finally {
        busy = false;
      }
    };
    setInterval(tick, 20000).unref?.();
  }
}

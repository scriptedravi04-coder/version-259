import express from "express";
import crypto from "crypto";

// Session 41 (Ravi) — "What's new" popup. The admin writes a short update (title + a few points,
// for creators, brands or everyone) and publishes it; every user of that group sees it once,
// like the Terms popup but without blocking the app. Tables: scripts/sql/session41.sql.
//
//   GET  /whats-new/latest          → newest published update for my role that I have not closed
//   POST /whats-new/:id/seen        → I closed it (never shown again)
//   GET  /admin/whats-new           → admin list
//   POST /admin/whats-new           → admin create / edit (id in body = edit)
//   POST /admin/whats-new/:id/publish  { published: true|false }
//   DELETE /admin/whats-new/:id

export type WhatsNewItem = {
  id: string;
  title: string;
  points: string[];
  audience: "all" | "creator" | "brand";
  cta_label?: string | null;
  cta_url?: string | null;
  published: boolean;
  published_at?: string | null;
  created_at?: string;
};

const AUDIENCES = new Set(["all", "creator", "brand"]);

/** Cleans what the admin typed. Returns { item } or { error }. */
export function cleanWhatsNewInput(body: any): { item?: Partial<WhatsNewItem>; error?: string } {
  const title = String(body?.title || "").trim().slice(0, 120);
  if (!title) return { error: "Add a title." };
  const raw = Array.isArray(body?.points) ? body.points : String(body?.points || "").split("\n");
  const points = raw.map((p: any) => String(p || "").trim()).filter(Boolean).slice(0, 6).map((p: string) => p.slice(0, 220));
  if (points.length === 0) return { error: "Add at least one point." };
  const audience = AUDIENCES.has(String(body?.audience)) ? body.audience : "all";
  const ctaUrl = String(body?.cta_url || "").trim();
  // Only links inside the app ("/campaigns", "/creator/ugc") — never an outside site.
  if (ctaUrl && !/^\/[A-Za-z0-9/_\-?=&.]*$/.test(ctaUrl)) return { error: "The button link must be a page inside the app, like /campaigns." };
  const ctaLabel = String(body?.cta_label || "").trim().slice(0, 30);
  return { item: { title, points, audience, cta_label: ctaUrl ? (ctaLabel || "Try it") : null, cta_url: ctaUrl || null } };
}

/** Newest published item for this role that the user has not seen. */
export function pickLatestForUser(items: WhatsNewItem[], role: string, seenIds: Set<string>): WhatsNewItem | null {
  const r = role === "brand" ? "brand" : role === "creator" ? "creator" : null;
  const list = (items || [])
    .filter((i) => i && i.published && !seenIds.has(i.id))
    .filter((i) => i.audience === "all" || (r && i.audience === r))
    .sort((a, b) => String(b.published_at || b.created_at || "").localeCompare(String(a.published_at || a.created_at || "")));
  return list[0] || null;
}

const isAdmin = (u: any) => Boolean(u && (u.role === "admin" || u.is_admin === true));

export function setupWhatsNewRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser }: {
    supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {
  const sb = () => privilegedSupabase || supabase;

  async function allItems(): Promise<WhatsNewItem[]> {
    if (sb()) {
      const { data, error } = await sb().from("whats_new").select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) return data;
      if (error) console.error("whats_new read failed:", error.message || error);
    }
    return getDb().whats_new || [];
  }

  router.get("/whats-new/latest", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    try {
      const items = await allItems();
      let seen: string[] = [];
      if (sb()) {
        const { data } = await sb().from("whats_new_seen").select("item_id").eq("user_id", user.user_id);
        seen = (data || []).map((r: any) => r.item_id);
      } else {
        seen = (getDb().whats_new_seen || []).filter((r: any) => r.user_id === user.user_id).map((r: any) => r.item_id);
      }
      return res.json({ item: pickLatestForUser(items, user.role, new Set(seen)) });
    } catch (e: any) {
      console.error("whats-new latest failed:", e?.message || e);
      return res.json({ item: null });
    }
  });

  router.post("/whats-new/:id/seen", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const row = { user_id: user.user_id, item_id: String(req.params.id), seen_at: new Date().toISOString() };
    if (sb()) {
      const { error } = await sb().from("whats_new_seen").upsert(row, { onConflict: "user_id,item_id" });
      if (error) return res.status(500).json({ error: "Could not save." });
    } else {
      const db = getDb();
      db.whats_new_seen = db.whats_new_seen || [];
      if (!db.whats_new_seen.some((r: any) => r.user_id === row.user_id && r.item_id === row.item_id)) db.whats_new_seen.push(row);
      saveDb(db);
    }
    return res.json({ ok: true });
  });

  router.get("/admin/whats-new", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    return res.json(await allItems());
  });

  router.post("/admin/whats-new", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const { item, error } = cleanWhatsNewInput(req.body);
    if (error) return res.status(400).json({ error });
    const id = req.body?.id ? String(req.body.id) : crypto.randomUUID();
    const row: any = { id, ...item };
    if (!req.body?.id) { row.published = false; row.created_at = new Date().toISOString(); }
    if (sb()) {
      const { data, error: e } = await sb().from("whats_new").upsert(row, { onConflict: "id" }).select().maybeSingle();
      if (e) return res.status(500).json({ error: "Could not save. Did you run scripts/sql/session41.sql?" });
      return res.json(data || row);
    }
    const db = getDb();
    db.whats_new = db.whats_new || [];
    const i = db.whats_new.findIndex((x: any) => x.id === id);
    if (i >= 0) db.whats_new[i] = { ...db.whats_new[i], ...row }; else db.whats_new.unshift(row);
    saveDb(db);
    return res.json(i >= 0 ? db.whats_new[i] : row);
  });

  router.post("/admin/whats-new/:id/publish", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const published = req.body?.published !== false;
    const patch = { published, published_at: published ? new Date().toISOString() : null };
    if (sb()) {
      const { error } = await sb().from("whats_new").update(patch).eq("id", req.params.id);
      if (error) return res.status(500).json({ error: "Could not update." });
    } else {
      const db = getDb();
      const it = (db.whats_new || []).find((x: any) => x.id === req.params.id);
      if (!it) return res.status(404).json({ error: "Not found" });
      Object.assign(it, patch);
      saveDb(db);
    }
    return res.json({ ok: true, ...patch });
  });

  router.delete("/admin/whats-new/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (sb()) {
      const { error } = await sb().from("whats_new").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ error: "Could not delete." });
    } else {
      const db = getDb();
      db.whats_new = (db.whats_new || []).filter((x: any) => x.id !== req.params.id);
      saveDb(db);
    }
    return res.json({ ok: true });
  });
}

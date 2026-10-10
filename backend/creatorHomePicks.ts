// Session 39 (Ravi, M35 + M41): "Creators like you, winning on YBEX" on the creator Home (and the
// small rotating photos on the onboarding photo step) show ONLY the 3–4 creators the admin ticks:
// Admin → Users → creator → "Show on creator home" (creator_profiles.show_on_creator_home,
// scripts/sql/session39.sql). Nobody ticked → the section hides; nothing is made up.
import express from "express";

type Deps = {
  supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void;
  parseAuthUser: (req: express.Request) => Promise<any>;
  logAdminAction?: (user: any, action: string, type: string, id: string, detail: any) => Promise<any>;
};

export const HOME_PICKS_MAX = 4;
const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");

/** Public-safe card fields only (no email, phone, rates). */
export function toHomePick(p: any) {
  const followers = Number(p.followers_instagram || p.ig_followers || p.instagram_followers || p.follower_count || 0) + Number(p.followers_youtube || 0);
  return {
    id: p.user_id,
    name: String(p.name || "Creator").trim(),
    picture: p.picture || p.photo || "",
    category: p.category || "",
    city: p.city || "",
    followers,
    avg_reach: Number(p.avg_views_30d || p.average_reach || p.instagram_avg_reach || 0),
  };
}

export function setupCreatorHomePicks(router: express.Router, deps: Deps) {
  const c = () => deps.privilegedSupabase || deps.supabase;

  router.get("/creators/home-picks", async (req, res) => {
    const viewer = await deps.parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    let rows: any[] = [];
    const db = c();
    if (db) {
      try {
        const { data, error } = await db.from("creator_profiles").select("*").eq("show_on_creator_home", true).limit(HOME_PICKS_MAX);
        if (!error && Array.isArray(data)) rows = data;
      } catch { rows = []; }
    } else {
      rows = (deps.getDb().creator_profiles || []).filter((p: any) => p.show_on_creator_home === true).slice(0, HOME_PICKS_MAX);
    }
    rows = rows.filter((p) => !p.is_deleted);
    res.set("Cache-Control", "private, max-age=120");
    return res.json({ picks: rows.map(toHomePick) });
  });

  router.post("/admin/creators/:userId/home-pick", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const userId = String(req.params.userId || "");
    const on = Boolean(req.body?.on);
    const db = c();
    if (db) {
      if (on) {
        const { count } = await db.from("creator_profiles").select("user_id", { count: "exact", head: true }).eq("show_on_creator_home", true).neq("user_id", userId);
        if ((count || 0) >= HOME_PICKS_MAX) return res.status(400).json({ error: `Only ${HOME_PICKS_MAX} creators can be on the creator home. Untick one first.`, code: "HOME_PICKS_FULL" });
      }
      const { error } = await db.from("creator_profiles").update({ show_on_creator_home: on }).eq("user_id", userId);
      if (error) return res.status(502).json({ error: "Could not save. Has scripts/sql/session39.sql been run?", code: "HOME_PICK_SAVE_FAILED" });
    } else {
      const local = deps.getDb() || {};
      if (!local.creator_profiles) local.creator_profiles = [];
      const list = local.creator_profiles;
      if (on && list.filter((p: any) => p.show_on_creator_home && (p.user_id !== userId && p.id !== userId)).length >= HOME_PICKS_MAX) {
        return res.status(400).json({ error: `Only ${HOME_PICKS_MAX} creators can be on the creator home. Untick one first.`, code: "HOME_PICKS_FULL" });
      }
      let p = list.find((x: any) => x.user_id === userId || x.id === userId);
      if (!p) {
        const u = (local.users || []).find((x: any) => x.user_id === userId || x.id === userId);
        if (u) {
          p = { user_id: userId, id: userId, name: u.name, show_on_creator_home: on };
          list.push(p);
        } else {
          return res.status(404).json({ error: "Creator profile not found" });
        }
      } else {
        p.show_on_creator_home = on;
      }
      deps.saveDb(local);
    }
    try { await deps.logAdminAction?.(user, on ? "home_pick_on" : "home_pick_off", "creator", userId, {}); } catch { /* log only */ }
    return res.json({ ok: true, on });
  });
}

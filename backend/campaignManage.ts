import express from "express";

// Session 30 (Ravi: "inka backend bhi bana do"): the campaign actions from the brand mobile design
// (MG-05 / MG-06) that had no server side yet. New file — the locked campaign logic
// (campaigns_routes.ts) is NOT edited. The apply guard runs BEFORE the locked apply route and only
// adds a refusal for paused / closed campaigns; everything else falls through unchanged.
//
// WHO: only the brand that owns the campaign (or its acting team member), or an admin.
// WHEN: every change stamps *_at + *_by on the campaign row.
// DB: needs two columns — scripts/sql/session30_campaign_manage.sql (Ravi runs it in Supabase).

export const CLOSED_STATUS = "completed"; // the same token the brand's "Completed" tab reads

export function applyBlockReason(c: any): string | null {
  if (!c) return null;
  if (String(c.status || "").toLowerCase() === CLOSED_STATUS || c.closed_at) return "This campaign is closed and no longer takes applications.";
  if (c.applications_paused) return "The brand has paused new applications for this campaign.";
  return null;
}

const norm = (v: any): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.map((x: any) => String(x || "").trim().toLowerCase()).filter(Boolean);
};

/** Creators whose categories overlap the campaign's. Pure, for tests. */
export function countMatchingCreators(campaign: any, creators: any[]): number {
  const want = new Set([...norm(campaign?.categories), ...norm(campaign?.niche), ...norm(campaign?.category)]);
  if (!want.size) return 0;
  return (creators || []).filter((p) => {
    const have = [...norm(p.categories), ...norm(p.niche), ...norm(p.category)];
    return have.some((h) => want.has(h));
  }).length;
}

const missingColumn = (err: any) => /column .* does not exist|could not find the .* column/i.test(String(err?.message || ""));

export function setupCampaignManageRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, getActingBrandId }: {
    supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db?: any) => void;
    parseAuthUser: (req: any) => Promise<any>; getActingBrandId: (u: any) => string;
  }
) {
  const client = () => privilegedSupabase || supabase;

  async function loadOwned(req: any, res: any) {
    const user = await parseAuthUser(req);
    if (!user) { res.status(403).json({ detail: "Not authenticated" }); return null; }
    const id = String(req.params.id || "");
    let camp: any = null;
    if (client()) {
      const { data } = await client().from("campaigns").select("*").eq("campaign_id", id).maybeSingle();
      camp = data;
    } else {
      camp = (getDb()?.campaigns || []).find((c: any) => String(c.campaign_id) === id) || null;
    }
    if (!camp) { res.status(404).json({ error: "Campaign not found" }); return null; }
    const isAdmin = String(user.role || "").toLowerCase() === "admin";
    if (!isAdmin && String(camp.brand_user_id) !== String(getActingBrandId(user))) {
      res.status(403).json({ error: "Only the brand that owns this campaign can change it." });
      return null;
    }
    return { user, camp, id };
  }

  async function write(id: string, patch: any, res: any) {
    if (client()) {
      const { data, error } = await client().from("campaigns").update(patch).eq("campaign_id", id).select("*").maybeSingle();
      if (error) {
        if (missingColumn(error)) {
          res.status(503).json({ error: "This action needs a one-time database update. Please contact support.", code: "SETUP_NEEDED" });
        } else {
          res.status(500).json({ error: error.message || "Could not update the campaign." });
        }
        return null;
      }
      return data;
    }
    const db = getDb();
    const c = (db.campaigns || []).find((x: any) => String(x.campaign_id) === id);
    Object.assign(c, patch);
    saveDb(db);
    return c;
  }

  // Pause / resume new applications. Existing applicants and deals are not touched.
  router.post("/campaigns/:id/applications-paused", async (req: any, res: any) => {
    const ctx = await loadOwned(req, res);
    if (!ctx) return;
    if (applyBlockReason({ ...ctx.camp, applications_paused: false })) {
      return res.status(409).json({ error: "This campaign is closed." });
    }
    const paused = Boolean(req.body?.paused);
    const now = new Date().toISOString();
    const row = await write(ctx.id, { applications_paused: paused, applications_paused_at: paused ? now : null, applications_paused_by: paused ? ctx.user.user_id : null }, res);
    if (!row) return;
    return res.json({ ok: true, campaign: row, applications_paused: paused });
  });

  // Close: no new pitches; hired creators keep their deals (deals are not touched here).
  router.post("/campaigns/:id/close", async (req: any, res: any) => {
    const ctx = await loadOwned(req, res);
    if (!ctx) return;
    if (String(ctx.camp.status || "").toLowerCase() === "draft") {
      return res.status(409).json({ error: "A draft is not live — delete or edit it instead." });
    }
    const row = await write(ctx.id, { status: CLOSED_STATUS, closed_at: new Date().toISOString(), closed_by: ctx.user.user_id }, res);
    if (!row) return;
    return res.json({ ok: true, campaign: row });
  });

  // "N creators match this brief" — category overlap with creator profiles. Count only, no names.
  router.get("/campaigns/:id/matching-creators", async (req: any, res: any) => {
    const ctx = await loadOwned(req, res);
    if (!ctx) return;
    let creators: any[] = [];
    if (client()) {
      const { data, error } = await client().from("creator_profiles").select("user_id, categories, niche, category");
      if (error) return res.status(500).json({ error: "Could not count creators." });
      creators = data || [];
    } else {
      creators = getDb()?.creator_profiles || [];
    }
    return res.json({ count: countMatchingCreators(ctx.camp, creators), categories: norm(ctx.camp.categories) });
  });

  // Guard in front of the locked apply route: refuse paused / closed campaigns, else continue.
  router.post("/campaigns/apply", async (req: any, res: any, next: any) => {
    try {
      const id = String(req.body?.campaign_id || "");
      if (!id) return next();
      let camp: any = null;
      if (client()) {
        const { data, error } = await client().from("campaigns").select("*").eq("campaign_id", id).maybeSingle();
        if (error) return next(); // never block applying because this check failed
        camp = data;
      } else {
        camp = (getDb()?.campaigns || []).find((c: any) => String(c.campaign_id) === id);
      }
      const why = applyBlockReason(camp);
      if (why) return res.status(409).json({ error: why, detail: why, code: "APPLICATIONS_CLOSED" });
      return next();
    } catch {
      return next();
    }
  });
}

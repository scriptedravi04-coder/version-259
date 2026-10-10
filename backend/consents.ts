// Session 34 (Ravi + legal draft Part E): record WHAT a user agreed to, WHICH version and WHEN —
// a tick box proves nothing later without this. Table public.user_consents
// (scripts/sql/user_consents.sql), one row per decision; the latest row per kind wins.
// Saving a consent never blocks signup or onboarding: a failed write is logged (and kept in the
// server's local store) instead.
import express from "express";

export const CONSENT_KINDS = ["terms", "privacy", "marketing", "creator_terms", "brand_terms"] as const;
export const TERMS_VERSION = "1.1"; // session 36 (15-day files, clause 2.3, convenience fee). Keep in step with src/lib/legal/legalContent.js LEGAL.termsVersion

let missingLogged = false;

export async function recordConsents(
  deps: { getClient: () => any; getDb: () => any; saveDb: (db: any) => void },
  userId: string,
  items: Array<{ kind: string; granted: boolean; version?: string; source?: string }>,
  meta: { ip?: string; ua?: string } = {},
) {
  const rows = items
    .filter((i) => (CONSENT_KINDS as readonly string[]).includes(i.kind))
    .map((i) => ({
      user_id: String(userId),
      kind: i.kind,
      granted: Boolean(i.granted),
      version: i.version || TERMS_VERSION,
      source: String(i.source || "app").slice(0, 40),
      ip: String(meta.ip || "").slice(0, 64),
      user_agent: String(meta.ua || "").slice(0, 300),
      created_at: new Date().toISOString(),
    }));
  if (!rows.length) return { ok: true, saved: 0 };
  const client = deps.getClient();
  let stored = false;
  if (client) {
    try {
      const { error } = await client.from("user_consents").insert(rows);
      if (!error) stored = true;
      else if (/relation .* does not exist|could not find the table|PGRST205|42P01/i.test(`${error.message}${error.code}`)) {
        if (!missingLogged) { missingLogged = true; console.warn("[consents] table user_consents missing — run scripts/sql/user_consents.sql"); }
      } else console.warn("[consents] save failed:", error.message || error);
    } catch (e: any) { console.warn("[consents] save failed:", e?.message || e); }
  }
  try {
    const db = deps.getDb();
    if (!db.user_consents) db.user_consents = [];
    db.user_consents.push(...rows);
    deps.saveDb(db);
  } catch { /* local cache only */ }
  return { ok: true, saved: rows.length, stored: stored ? "server" : "server_local" };
}

/** Latest decision per kind for one user. */
export async function latestConsents(deps: { getClient: () => any; getDb: () => any }, userId: string) {
  let rows: any[] = [];
  const client = deps.getClient();
  if (client) {
    try {
      const { data, error } = await client.from("user_consents").select("kind, granted, version, created_at").eq("user_id", String(userId)).order("created_at", { ascending: false }).limit(50);
      if (!error && Array.isArray(data)) rows = data;
    } catch { /* fall back to local */ }
  }
  if (!rows.length) rows = (deps.getDb().user_consents || []).filter((r: any) => r.user_id === String(userId)).slice().reverse();
  const out: Record<string, any> = {};
  for (const r of rows) if (!out[r.kind]) out[r.kind] = { granted: r.granted, version: r.version, at: r.created_at };
  return out;
}

export function setupConsentRoutes(router: express.Router, deps: {
  parseAuthUser: (req: any) => Promise<any>; getClient: () => any; getDb: () => any; saveDb: (db: any) => void;
}) {
  router.get("/consents/me", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    return res.json({ consents: await latestConsents(deps, user.user_id), terms_version: TERMS_VERSION });
  });

  // Body: { items: [{ kind, granted }], source }
  router.post("/consents", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 5) : [];
    const valid = items.filter((i: any) => (CONSENT_KINDS as readonly string[]).includes(i?.kind) && typeof i?.granted === "boolean");
    if (!valid.length) return res.status(400).json({ detail: "Nothing to save.", code: "BAD_CONSENT" });
    const r = await recordConsents(deps, user.user_id, valid.map((i: any) => ({ kind: i.kind, granted: i.granted, source: req.body?.source })), {
      ip: String(req.headers?.["x-forwarded-for"] || req.ip || "").split(",")[0].trim(),
      ua: String(req.headers?.["user-agent"] || ""),
    });
    return res.json({ ...r, consents: await latestConsents(deps, user.user_id) });
  });
}

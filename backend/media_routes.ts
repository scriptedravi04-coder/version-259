import express from "express";
import { parseStorageRef, canViewMedia, verifyMediaKey, MEDIA_URL_TTL_SECONDS } from "./mediaAccess";
import { isStaffUser, actingIds, canAccessThread } from "./socketAccess";

// GET /api/media?src=<stored file reference>[&k=<media key>][&json=1]
// See backend/mediaAccess.ts for why this exists.
export function setupMediaRoutes(
  router: express.Router,
  deps: {
    parseAuthUser: (req: any) => Promise<any>;
    getDb: () => any;
    getClient: () => any;
  }
) {
  async function loadUser(userId: string) {
    const db = deps.getDb();
    const local = (db.users || []).find((u: any) => u.user_id === userId);
    if (local) return local;
    const client = deps.getClient();
    if (!client) return null;
    try {
      const { data } = await client.from("users").select("*").eq("user_id", userId).maybeSingle();
      return data || null;
    } catch (e) {
      return null;
    }
  }

  async function viewerFor(req: any) {
    const user = await deps.parseAuthUser(req); // Bearer header or session cookie
    if (user) return user;
    const uid = verifyMediaKey(req.query?.k);
    if (!uid) return null;
    const u = await loadUser(uid);
    if (!u || u.is_deleted || u.banned || u.suspended) return null;
    return u;
  }

  async function sharesDealWith(user: any, otherId: string): Promise<boolean> {
    const mine = actingIds(user);
    const pair = (row: any) => {
      const ids = ["brand_id", "creator_id", "brand_user_id", "creator_user_id"].map((k) => row?.[k]).filter(Boolean).map(String);
      return ids.includes(String(otherId)) && ids.some((i) => mine.includes(i));
    };
    const db = deps.getDb();
    if ((db.chat_threads || []).some(pair) || (db.ugc_orders || []).some(pair) || (db.deals || []).some(pair)) return true;
    const client = deps.getClient();
    if (!client) return false;
    const safeOther = String(otherId).replace(/[^A-Za-z0-9_\-]/g, "");
    const safeMine = mine.map((m) => m.replace(/[^A-Za-z0-9_\-]/g, "")).filter(Boolean);
    if (!safeOther || !safeMine.length) return false;
    try {
      for (const table of ["chat_threads", "ugc_orders"]) {
        const { data } = await client
          .from(table)
          .select("brand_id, creator_id")
          .or(`and(brand_id.eq.${safeOther},creator_id.in.(${safeMine.join(",")})),and(creator_id.eq.${safeOther},brand_id.in.(${safeMine.join(",")}))`)
          .limit(1);
        if (data && data.length) return true;
      }
    } catch (e: any) {
      console.warn("[media] shared-deal lookup failed:", e?.message || e);
    }
    return false;
  }

  router.get("/media", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const ref = parseStorageRef(req.query?.src);
    if (!ref) return res.status(400).json({ error: "Not a file this route serves.", code: "MEDIA_BAD_SOURCE" });

    const user = await viewerFor(req);
    if (!user) return res.status(401).json({ error: "Please log in to view this file.", code: "MEDIA_LOGIN_REQUIRED" });

    const allowed = await canViewMedia(user, ref, {
      isStaff: isStaffUser,
      actingIds,
      isThreadParty: canAccessThread,
      sharesDealWith,
    });
    if (!allowed) return res.status(403).json({ error: "You don't have access to this file.", code: "MEDIA_FORBIDDEN" });

    const client = deps.getClient();
    if (!client) return res.status(503).json({ error: "Storage is not configured.", code: "MEDIA_UNAVAILABLE" });
    try {
      const { data, error } = await client.storage.from(ref.bucket).createSignedUrl(ref.path, MEDIA_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        const missing = /not.?found|does not exist/i.test(String(error?.message || ""));
        return res.status(missing ? 404 : 502).json({ error: missing ? "File not found." : "Could not open the file.", code: missing ? "MEDIA_NOT_FOUND" : "MEDIA_SIGN_FAILED" });
      }
      if (req.query?.json) return res.json({ url: data.signedUrl, expires_in: MEDIA_URL_TTL_SECONDS });
      return res.redirect(302, data.signedUrl);
    } catch (e: any) {
      console.warn("[media] sign failed:", e?.message || e);
      return res.status(502).json({ error: "Could not open the file.", code: "MEDIA_SIGN_FAILED" });
    }
  });
}

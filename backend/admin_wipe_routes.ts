import express from "express";
import bcrypt from "bcryptjs";
import { logIgnored } from "./logIgnored";
import { wipePlan, activeMoney, wipeLocal } from "./accountWipe";

// Session 27, rule 56. POST /admin/users/:id/wipe — "Complete wipe out" (see accountWipe.ts).
//   WHO:  a full admin (role "admin"), re-entering their own password. Not a sub-admin.
//         Never yourself, never another admin.
//   Money in flight: allowed (testing tool), but only after the admin confirms it (`force`).
// The normal delete (bin, restorable) stays at POST /admin/users/:id/delete.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failures = new Map<string, number[]>();
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export async function passwordMatches(password: string, row: any): Promise<boolean> {
  const hash = String(row?.password_hash || "");
  const pw = String(password || "");
  if (!pw) return false;
  if (hash.startsWith("$2")) {
    try { return await bcrypt.compare(pw, hash); } catch { return false; }
  }
  if (hash.startsWith("mock_hash_")) return hash === "mock_hash_" + pw;
  return Boolean((hash && hash === pw) || (row?.password && row.password === pw));
}

export function setupAdminWipeRoutes(
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAction,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
  }
) {
  router.post("/admin/users/:id/wipe", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || admin.role !== "admin" || admin.team_role === "sub_admin") {
      return res.status(403).json({ error: "Only a full admin can wipe an account.", code: "ADMIN_ONLY" });
    }
    const targetParam = String(req.params.id || "").trim();
    const password = String(req.body?.password || "");
    if (!targetParam) return res.status(400).json({ error: "Which account?" });
    if (!password) return res.status(400).json({ error: "Enter your admin password to confirm.", code: "PASSWORD_REQUIRED" });

    // Brute-force guard on the password prompt.
    const key = String(admin.user_id);
    const now = Date.now();
    const recent = (failures.get(key) || []).filter((t) => now - t < FAIL_WINDOW_MS);
    if (recent.length >= 5) return res.status(429).json({ error: "Too many wrong passwords. Try again in 15 minutes.", code: "TOO_MANY_ATTEMPTS" });

    const client = privilegedSupabase || null;
    if (supabase && !client) {
      return res.status(503).json({ error: "The service key is not set on the server, so a full wipe is not possible.", code: "SERVICE_KEY_MISSING" });
    }
    const db = getDb();

    // 1. The admin's own password.
    let adminRow: any = (db.users || []).find((u: any) => u.user_id === admin.user_id) || null;
    if (client) {
      try {
        const { data } = await client.from("users").select("*").eq("user_id", admin.user_id).limit(1);
        if (data?.[0]) adminRow = data[0];
      } catch (e) { logIgnored("admin_wipe:admin-row", e); }
    }
    if (!(await passwordMatches(password, adminRow))) {
      recent.push(now);
      failures.set(key, recent);
      return res.status(401).json({ error: "Wrong admin password.", code: "WRONG_PASSWORD" });
    }
    failures.delete(key);

    // 2. The target — an account (users) or an unclaimed creator profile.
    let targetUser: any = (db.users || []).find((u: any) => u.user_id === targetParam) || null;
    let profile: any = (db.creator_profiles || []).find((p: any) => p.user_id === targetParam || String(p.id) === targetParam) || null;
    if (client) {
      try {
        const { data } = await client.from("users").select("*").eq("user_id", targetParam).limit(1);
        if (data?.[0]) targetUser = data[0];
        const { data: p1 } = await client.from("creator_profiles").select("*").eq("user_id", targetParam).limit(1);
        if (p1?.[0]) profile = p1[0];
        else if (UUID_RE.test(targetParam)) {
          const { data: p2 } = await client.from("creator_profiles").select("*").eq("id", targetParam).limit(1);
          if (p2?.[0]) profile = p2[0];
        }
        if (!targetUser && profile?.user_id) {
          const { data: u2 } = await client.from("users").select("*").eq("user_id", profile.user_id).limit(1);
          if (u2?.[0]) targetUser = u2[0];
        }
      } catch (e) { logIgnored("admin_wipe:target", e); }
    }
    if (!targetUser && !profile) return res.status(404).json({ error: "Account not found.", code: "NOT_FOUND" });
    const uid = String(targetUser?.user_id || profile?.user_id || targetParam);
    if (uid === String(admin.user_id)) return res.status(400).json({ error: "You cannot wipe your own account.", code: "SELF" });
    if (["admin", "sub_admin"].includes(String(targetUser?.role || "")) || targetUser?.team_role === "sub_admin") {
      return res.status(403).json({ error: "Admin accounts cannot be wiped here.", code: "TARGET_IS_ADMIN" });
    }
    const userIds = Array.from(new Set([uid, targetParam].filter(Boolean)));
    const email = String(targetUser?.email || profile?.email || "").trim().toLowerCase();

    // 3. Everything tied to the user.
    const pick = async (table: string, cols: string[], values: string[]) => {
      const rows: any[] = [];
      if (client) {
        for (const c of cols) {
          try {
            const { data, error } = await client.from(table).select("*").in(c, values).limit(5000);
            if (!error) rows.push(...(data || []));
          } catch (e) { logIgnored(`admin_wipe:pick-${table}`, e); }
        }
      }
      for (const r of db[table] || []) if (cols.some((c) => values.includes(String(r?.[c])))) rows.push(r);
      const seen = new Set<string>();
      return rows.filter((r) => { const k = String(r?.id ?? r?.campaign_id ?? JSON.stringify(r)); if (seen.has(k)) return false; seen.add(k); return true; });
    };
    const threads = await pick("chat_threads", ["creator_id", "brand_id"], userIds);
    const deals = await pick("deals", ["creator_id", "brand_id"], userIds);
    const campaigns = await pick("campaigns", ["brand_user_id"], userIds);
    const briefs = await pick("ugc_briefs", ["brand_id"], userIds);
    const ordersDirect = await pick("ugc_orders", ["creator_id", "brand_id"], userIds);
    const briefIds = briefs.map((b) => String(b.id)).filter(Boolean);
    const ordersOfBriefs = briefIds.length ? await pick("ugc_orders", ["brief_id"], briefIds) : [];
    const orders = [...ordersDirect, ...ordersOfBriefs.filter((o) => !ordersDirect.some((d) => d.id === o.id))];

    // 4. Money in flight (Ravi, session 27: the wipe is a testing tool, so it is NOT blocked).
    //    The admin is told once and must send `force: true` to go ahead; the log records it.
    const blocking = activeMoney(deals, orders);
    const forced = req.body?.force === true;
    if (blocking.length && !forced) {
      return res.status(409).json({
        error: "This account has money in escrow. Tick \"Wipe anyway\" to delete it together with those deals.",
        code: "WIPE_HAS_ACTIVE_MONEY",
        items: blocking.slice(0, 20),
      });
    }

    const ids = {
      userIds,
      threadIds: threads.map((t) => String(t.id)).filter(Boolean),
      dealIds: deals.map((d) => String(d.id)).filter(Boolean),
      campaignIds: campaigns.map((c) => String(c.campaign_id || c.id)).filter(Boolean),
      orderIds: orders.map((o) => String(o.id)).filter(Boolean),
      email,
    };

    // 5. Supabase, children first. A table or column that does not exist is only reported.
    const report: Record<string, number> = {};
    const errors: string[] = [];
    if (client) {
      // Session 28: signed agreement records can only be removed through this database function
      // (the table blocks normal deletes). Done first, while the thread/order ids are known.
      if (typeof client.rpc === "function") try {
        const { data: n, error } = await client.rpc("wipe_agreement_signatures", {
          p_user_id: uid, p_thread_ids: [...ids.threadIds, ...ids.orderIds], p_order_ids: ids.orderIds,
        });
        if (error) errors.push(`agreement_signatures: ${error.message || error}`);
        else report.agreement_signatures = Number(n) || 0;
      } catch (e: any) { errors.push(`agreement_signatures: ${e?.message || e}`); }
      for (const step of wipePlan(ids)) {
        for (let i = 0; i < step.values.length; i += 100) {
          const chunk = step.values.slice(i, i + 100);
          try {
            const { error, count } = await client.from(step.table).delete({ count: "exact" }).in(step.column, chunk);
            if (error) { errors.push(`${step.table}.${step.column}: ${error.message || error}`); break; }
            report[step.table] = (report[step.table] || 0) + (count || 0);
          } catch (e: any) { errors.push(`${step.table}.${step.column}: ${e?.message || e}`); break; }
        }
      }
      if (profile?.id && UUID_RE.test(String(profile.id))) {
        try { await client.from("creator_profiles").delete().eq("id", profile.id); } catch (e) { logIgnored("admin_wipe:profile-id", e); }
      }
      // Payment records stay (accounting); only the wiped person's name/email are blanked.
      for (const col of ["user_id", "creator_id", "brand_id"]) {
        for (const f of ["user_email", "email", "creator_name", "brand_name", "name"]) {
          try { await client.from("transactions").update({ [f]: null }).in(col, userIds); } catch { /* column may not exist */ }
        }
      }
      // The login itself, so the same email can sign up fresh.
      let authDeleted = false;
      const authIds = [targetUser?.auth_id, targetUser?.auth_user_id, targetUser?.supabase_uid, targetUser?.id, uid]
        .map((v) => String(v || "")).filter((v) => UUID_RE.test(v));
      for (const aid of Array.from(new Set(authIds))) {
        try {
          const { error } = await client.auth.admin.deleteUser(aid);
          if (!error) { authDeleted = true; break; }
        } catch (e) { logIgnored("admin_wipe:auth-id", e); }
      }
      if (!authDeleted && email && client.auth?.admin?.listUsers) {
        try {
          for (let page = 1; page <= 10 && !authDeleted; page++) {
            const { data } = await client.auth.admin.listUsers({ page, perPage: 1000 });
            const hit = (data?.users || []).find((u: any) => String(u.email || "").toLowerCase() === email);
            if (hit) { const { error } = await client.auth.admin.deleteUser(hit.id); authDeleted = !error; }
            if (!data?.users || data.users.length < 1000) break;
          }
        } catch (e) { logIgnored("admin_wipe:auth-email", e); }
      }
      report.auth_user = authDeleted ? 1 : 0;
    }

    // 6. Local store.
    const localCounts = wipeLocal(db, ids);
    saveDb(db);

    await logAdminAction(admin, "wipe_user", "user", uid, {
      email, name: targetUser?.name || profile?.name || "", forced_with_money: blocking.length ? blocking.slice(0, 20) : undefined, supabase: report, local: localCounts, errors: errors.slice(0, 20),
      at: new Date().toISOString(),
    }).catch(() => {});

    return res.json({ ok: true, wiped: uid, supabase: report, local: localCounts, errors });
  });
}

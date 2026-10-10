// Session 25 — admin account creation (Ravi's screenshot: "violates row-level security policy
// for table users") and the admin-role holes found while checking it.
import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { setupAdminUsersEnforcementRoutes } from "./admin_users_enforcement_routes";
import { neutralizeStaffTeamRole, newPasswordProblem, isFullAdmin, isRlsError } from "./authSecurity";

const SUPER = { user_id: "u_super", role: "admin", team_role: "admin" };
const SUB = { user_id: "u_sub", role: "admin", team_role: "sub_admin" };

function fakeClient(opts: { rls?: boolean } = {}) {
  const inserted: any[] = [];
  const updated: any[] = [];
  const from = (table: string) => {
    const q: any = {};
    q.insert = (rows: any) => {
      const r = { error: opts.rls ? { code: "42501", message: 'new row violates row-level security policy for table "users"' } : null };
      if (!opts.rls) inserted.push({ table, rows });
      const p: any = Promise.resolve(r);
      p.select = () => p; p.maybeSingle = () => p;
      return p;
    };
    q.update = (v: any) => { updated.push({ table, v }); const p: any = Promise.resolve({ error: null }); p.eq = () => p; return p; };
    return q;
  };
  return { from, inserted, updated };
}

function mk(actor: any, client: any, privileged = true) {
  const routes: Record<string, any> = {};
  const router: any = new Proxy({}, { get: (_t, m: string) => (p: any, fn: any) => { routes[`${m.toUpperCase()} ${p}`] = fn; } });
  const db: any = { users: [] };
  setupAdminUsersEnforcementRoutes({} as any, router, {
    supabase: client, privilegedSupabase: privileged ? client : null, getDb: () => db, saveDb: () => {},
    parseAuthUser: async () => actor, logAdminAction: async () => {}, sendNotification: async () => {},
    sendActivityNotificationEmail: async () => {}, sendSuperAdminAlertEmail: async () => {},
    checkAdminPerm: async () => true, getUserPassword: () => null, recordUserPassword: () => {}, DEFAULT_WARNING_TEMPLATES: [],
  } as any);
  const call = async (key: string, body: any, id = "x") => {
    let status = 200; let json: any;
    const res: any = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; } };
    await routes[key]({ params: { id }, body, query: {}, headers: {} }, res);
    return { status, json };
  };
  return { call, db };
}

const CREATE = "POST /admin/users/create";
const GOOD = { email: "new.admin@ybex.io", password: "Blue-River-2026", role: "admin", team_role: "admin" };

describe("create admin account", () => {
  it("stores a bcrypt hash, never the password", async () => {
    const c = fakeClient();
    const { call } = mk(SUPER, c);
    const r = await call(CREATE, GOOD);
    expect(r.status).toBe(200);
    const row = c.inserted.find((i) => i.table === "users").rows[0];
    expect(row.password_hash).not.toContain("Blue-River-2026");
    expect(await bcrypt.compare("Blue-River-2026", row.password_hash)).toBe(true);
    expect(row.team_role).toBe("admin");
  });
  it("refuses 123456789 and other weak passwords", async () => {
    const c = fakeClient();
    const { call } = mk(SUPER, c);
    const r = await call(CREATE, { ...GOOD, password: "123456789" });
    expect(r.status).toBe(400);
    expect(c.inserted.length).toBe(0);
  });
  it("a sub-admin cannot create a Super Admin (or any admin)", async () => {
    const c = fakeClient();
    const { call } = mk(SUB, c);
    expect((await call(CREATE, GOOD)).status).toBe(403);
    expect((await call(CREATE, { ...GOOD, team_role: "sub_admin" })).status).toBe(403);
    expect(c.inserted.length).toBe(0);
  });
  it("an RLS refusal says the service key is missing, in plain words", async () => {
    const { call } = mk(SUPER, fakeClient({ rls: true }));
    const r = await call(CREATE, GOOD);
    expect(r.status).toBe(503);
    expect(r.json.code).toBe("SERVICE_KEY_MISSING");
    expect(r.json.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
  it("without the service-role client it stops before writing", async () => {
    const c = fakeClient();
    const { call } = mk(SUPER, c, false);
    const r = await call(CREATE, GOOD);
    expect(r.json.code).toBe("SERVICE_KEY_MISSING");
    expect(c.inserted.length).toBe(0);
  });
});

describe("team roles", () => {
  it("only a Super Admin changes admin roles", async () => {
    const c = fakeClient();
    expect((await mk(SUB, c).call("POST /admin/users/:id/team_role", { team_role: "admin" })).status).toBe(403);
    expect(c.updated.length).toBe(0);
    expect((await mk(SUPER, c).call("POST /admin/users/:id/team_role", { team_role: "admin" })).status).toBe(200);
  });
  it("a brand member called 'sub_admin' is not admin staff", () => {
    const brandMember = { user_id: "m1", role: "brand", team_role: "sub_admin" };
    expect(neutralizeStaffTeamRole(brandMember).team_role).toBe(null);
    expect(neutralizeStaffTeamRole(SUB).team_role).toBe("sub_admin");
    expect(neutralizeStaffTeamRole({ role: "brand", team_role: "admin" }).team_role).toBe("admin"); // brand admin stays
  });
  it("every route gets the neutralised user", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "server.ts"), "utf8");
    expect(src).toMatch(/async function parseAuthUser\(req: any\) \{\s*return neutralizeStaffTeamRole\(await parseAuthUserRaw\(req\)\);/);
  });
  it("brand team members get bcrypt too and no staff team role", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "brands_routes.ts"), "utf8");
    expect(src).not.toMatch(/password_hash:\s*"mock_hash_"/);
    expect(src).toContain("STAFF_TEAM_ROLES.includes");
  });
});

describe("helpers", () => {
  it("passwords", () => {
    expect(newPasswordProblem("123456789")).toBeTruthy();
    expect(newPasswordProblem("abcdefghij")).toBeTruthy();
    expect(newPasswordProblem("Blue-River-2026")).toBe(null);
  });
  it("full admin / rls", () => {
    expect(isFullAdmin(SUPER)).toBe(true);
    expect(isFullAdmin(SUB)).toBe(false);
    expect(isRlsError({ code: "42501" })).toBe(true);
  });
  it("the FAQ admin page no longer writes the table from the browser", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/pages/admin/AdminFAQManager.jsx"), "utf8");
    expect(src).not.toMatch(/from\("faq_articles"\)\s*\.(insert|update|delete)/);
    expect(src).toContain("/admin/faq");
  });
  it("the brand dashboard counts applicants through the server", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/components/dashboard/BrandDashboard.jsx"), "utf8");
    expect(src).not.toMatch(/from\(['"]campaign_applications['"]\)/);
    expect(src).toContain("/brands/me/application-stats");
    const routes = fs.readFileSync(path.resolve(__dirname, "browserDbRoutes.ts"), "utf8");
    expect(routes).toMatch(/application-stats[\s\S]{0,600}eq\("brand_user_id", acting\)/);
  });
});

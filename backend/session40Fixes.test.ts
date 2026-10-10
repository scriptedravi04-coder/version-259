// Session 40 — Ravi's admin + mobile screenshot list.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { platformLabel, platformMatches } from "./waitlistPlatform";
import { roleUpdateFor, standardRoleFor } from "./adminRoleChange";
import { isFullAdmin, neutralizeStaffTeamRole } from "./authSecurity";
import { setupAdminUsersEnforcementRoutes } from "./admin_users_enforcement_routes";

describe("questionnaire platform label", () => {
  it("Instagram handle + link is Instagram even when the stored label says YouTube (Ravi's 'llak (YouTube)')", () => {
    expect(platformLabel({ stored: "YouTube", instagram: ["llak", "https://instagram.com/llak"], youtube: [] })).toBe("Instagram");
  });
  it("both given → both; only YouTube → YouTube; nothing → stored / Instagram", () => {
    expect(platformLabel({ instagram: ["llak"], youtube: ["https://youtube.com/@llak"] })).toBe("Instagram · YouTube");
    expect(platformLabel({ instagram: ["", null], youtube: ["https://youtube.com/@x"] })).toBe("YouTube");
    expect(platformLabel({ stored: "youtube", instagram: [], youtube: [] })).toBe("YouTube");
    expect(platformLabel({ instagram: [], youtube: [] })).toBe("Instagram");
  });
  it("a YouTube link typed in the Instagram box is not Instagram", () => {
    expect(platformLabel({ instagram: ["https://youtube.com/@x"], youtube: ["https://youtube.com/@x"] })).toBe("YouTube");
  });
  it("filter: 'Instagram · YouTube' shows under both", () => {
    expect(platformMatches("Instagram · YouTube", "YouTube")).toBe(true);
    expect(platformMatches("Instagram · YouTube", "Instagram")).toBe(true);
    expect(platformMatches("Instagram", "YouTube")).toBe(false);
  });
});

describe("admin role change", () => {
  it("Standard User puts the account back to its own role — it is no longer a Super Admin", () => {
    const plan: any = roleUpdateFor("", { creatorProfile: { user_id: "c1" } });
    expect(plan.ok).toBe(true);
    expect(plan.fields).toEqual({ role: "creator", team_role: null });
    expect(isFullAdmin({ user_id: "c1", ...plan.fields })).toBe(false);
  });
  it("brand / agency go back to brand / agency", () => {
    expect(standardRoleFor({ brandProfile: { is_agency: false } })).toBe("brand");
    expect(standardRoleFor({ brandProfile: { is_agency: true } })).toBe("agency");
  });
  it("an account with no profile is refused instead of guessing", () => {
    const plan: any = roleUpdateFor("", {});
    expect(plan.ok).toBe(false);
    expect(plan.status).toBe(400);
  });
  it("Sub-Admin gets role admin, so the auth layer keeps the sub_admin team role (a creator promotion used to do nothing)", () => {
    const plan: any = roleUpdateFor("sub_admin", {});
    const u = { user_id: "x", ...plan.fields };
    expect(neutralizeStaffTeamRole(u).team_role).toBe("sub_admin");
    expect(isFullAdmin(u)).toBe(false);
  });
});

// Route-level: fake Supabase client with the calls the route makes.
function fakeClient(opts: { failUpdate?: boolean; creator?: boolean; brand?: any } = {}) {
  const updated: any[] = [];
  const deleted: any[] = [];
  const from = (table: string) => {
    const q: any = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = async () => ({ data: table === "creator_profiles" && opts.creator ? { user_id: "t1" } : table === "brand_profiles" ? opts.brand || null : null, error: null });
    q.update = (v: any) => { updated.push({ table, v }); const p: any = Promise.resolve({ error: opts.failUpdate ? { message: "boom" } : null }); p.eq = () => p; return p; };
    q.delete = () => { deleted.push(table); const p: any = Promise.resolve({ error: null }); p.eq = () => p; return p; };
    q.insert = async () => ({ error: null });
    return q;
  };
  return { from, updated, deleted };
}
function mk(actor: any, client: any) {
  const routes: Record<string, any> = {};
  const router: any = new Proxy({}, { get: (_t, m: string) => (p: any, fn: any) => { routes[`${m.toUpperCase()} ${p}`] = fn; } });
  const db: any = { users: [{ user_id: "t1", role: "admin", team_role: "admin" }], admin_permissions: [] };
  setupAdminUsersEnforcementRoutes({} as any, router, {
    supabase: client, privilegedSupabase: client, getDb: () => db, saveDb: () => {},
    parseAuthUser: async () => actor, logAdminAction: async () => {}, sendNotification: async () => {},
    sendActivityNotificationEmail: async () => {}, sendSuperAdminAlertEmail: async () => {},
    checkAdminPerm: async () => true, getUserPassword: () => null, recordUserPassword: () => {}, DEFAULT_WARNING_TEMPLATES: [],
  } as any);
  const call = async (key: string, body: any, id = "t1") => {
    let status = 200; let json: any;
    const res: any = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; } };
    await routes[key]({ params: { id }, body, query: {}, headers: {} }, res);
    return { status, json };
  };
  return { call, db };
}
const SUPER = { user_id: "u_super", role: "admin", team_role: "admin" };
const SUB = { user_id: "u_sub", role: "admin", team_role: "sub_admin" };

describe("team_role / permissions routes", () => {
  it("Super Admin → Standard User writes role creator + team_role null and clears modules", async () => {
    const c = fakeClient({ creator: true });
    const { call, db } = mk(SUPER, c);
    const r = await call("POST /admin/users/:id/team_role", { team_role: "" });
    expect(r.status).toBe(200);
    expect(c.updated[0].v).toEqual({ role: "creator", team_role: null });
    expect(c.deleted).toContain("admin_permissions");
    expect(db.users[0]).toMatchObject({ role: "creator", team_role: null });
  });
  it("a failed save is an error, not 'saved'", async () => {
    const r = await mk(SUPER, fakeClient({ failUpdate: true })).call("POST /admin/users/:id/team_role", { team_role: "sub_admin" });
    expect(r.status).toBe(500);
  });
  it("a Sub-Admin can't change module permissions (could give itself everything)", async () => {
    const r = await mk(SUB, fakeClient()).call("POST /admin/users/:id/permissions", { permissions: ["manage_users"] }, "u_sub");
    expect(r.status).toBe(403);
  });
});

describe("no variable reads itself while being declared", () => {
  // `const panDocUrl = panDocUrl || …` crashes the screen the moment it renders; the crash guard
  // only looks for undefined names, so it missed four of these in UserEnforcementPanel.jsx.
  it("src has no `const x = x …`", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) { if (f.name !== "node_modules") walk(p); continue; }
        if (!/\.(jsx?|tsx?)$/.test(f.name) || f.name === "session40Fixes.test.ts") continue;
        fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return; // comments
          const m = line.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\1\b(?!\s*[.(\[])/);
          if (m) hits.push(`${p}:${i + 1}`);
        });
      }
    };
    walk(path.resolve(__dirname, "../src"));
    walk(path.resolve(__dirname));
    expect(hits).toEqual([]);
  });
});

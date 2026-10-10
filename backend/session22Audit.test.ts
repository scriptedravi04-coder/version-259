// @vitest-environment node
// Session 22 audit fixes. If one of these fails, a protected fix was undone — see ARCHITECTURE.md
// "PROTECTED CHANGES" before changing the test.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { demoLoginEnabled } from "./admin_system_maintenance_routes";
import { stripPrivateProfileFields } from "./profilePrivacy";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("session 22 audit", () => {
  it("demo admin login is OFF unless DEMO_LOGIN=true — also on run.app / test mode", () => {
    expect(demoLoginEnabled({ APP_URL: "https://x.run.app", NODE_ENV: "production" })).toBe(false);
    expect(demoLoginEnabled({ PAYMENTS_TEST_MODE: "true" })).toBe(false);
    expect(demoLoginEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(demoLoginEnabled({ DEMO_LOGIN: "true" })).toBe(true);
    expect(read("backend/server.ts")).not.toMatch(/isDemoLoginEnabled = \(\): boolean => \{[\s\S]{0,300}getIsTestMode\(\)/);
  });

  it("no fake demo data is written for real users unless DEMO_SEED=true", () => {
    const s = read("backend/auth_routes.ts");
    expect(s).toContain('if (DEMO_SEED_ENABLED() && user.role === "creator") {');
    expect(s).toContain('} else if (DEMO_SEED_ENABLED() && user.role === "brand") {');
  });

  it("/auth/sync is gone", () => {
    const s = read("backend/auth_routes.ts");
    const route = s.slice(s.indexOf('router.post("/auth/sync"'), s.indexOf('router.post("/auth/signup"'));
    expect(route).toContain("status(410)");
    expect(route).not.toContain("user.role = role");
  });

  it("formerly open write routes now check who is calling", () => {
    const landing = read("backend/admin_content_routes.ts");
    for (const r of ['router.post("/admin/landing-brands"', 'router.delete("/admin/landing-brands/:id"', 'router.post("/admin/landing-reviews"', 'router.delete("/admin/landing-reviews/:id"']) {
      const i = landing.indexOf(r);
      expect(landing.slice(i, i + 500)).toContain("const actor = await parseAuthUser(req);");
    }
    const cs = read("backend/content_submissions_routes.ts");
    const d = cs.indexOf('router.post("/collabs/:dealId/deliverable"');
    expect(cs.slice(d, d + 1500)).toContain("Only this collab's creator can submit its deliverable.");
    const pc = read("backend/public_creator_routes.ts");
    const b = pc.indexOf('router.post("/public/creators/bulk-import"');
    expect(pc.slice(b, b + 500)).toContain("Admin privileges required.");
    const mi = read("backend/market_intelligence_routes.ts");
    const m = mi.indexOf('router.post("/market-intelligence/performance/:id/record"');
    expect(mi.slice(m, m + 400)).toContain("Not authenticated");
    const files = read("backend/misc_routes.ts");
    expect(files).toContain("if (isPrivateBucket(bucketName)) {");
  });

  it("public creator profiles hide contact, bank and ID fields", () => {
    const out = stripPrivateProfileFields({
      name: "A", instagram_handle: "a", company_name: "C", rate_card: {}, email: "a@b.c", phone: "9", bank_account: "1",
      ifsc_code: "X", upi_id: "u@p", pan_number: "P", aadhaar_number: "1", gstin: "G", address: "addr", whatsapp_number: "9", contact_email: "x",
    } as any);
    expect(Object.keys(out).sort()).toEqual(["company_name", "instagram_handle", "name", "rate_card"]);
    expect(read("backend/creators_routes.ts")).toContain("res.json(ownerOrStaff ? mapped : stripPrivateProfileFields(mapped));");
  });
});

describe("admin users table", () => {
  it("shows the role (not the industry) in the role column, following the selected filter", () => {
    const s = read("src/components/admin/AdminUsersTab.jsx");
    expect(s).toContain("{['creator', 'unclaimed'].includes(activeRole) ? 'Social & Followers' : 'Role'}");
    expect(s).not.toContain("'Industry / Type'");
    expect(s).toContain("{label || 'Role missing'}");
    expect(s).not.toContain("includes(initialRole)");
  });
});

describe("database access goes through the server", () => {
  it("the server uses the service-role client for everything when the key is set", () => {
    expect(read("backend/server.ts")).toContain("supabase = privilegedSupabase;");
  });
  it("the browser does not read or write sensitive tables directly (anon key)", () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(process.cwd(), d), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    const files = walk("src").filter((f) => /\.(js|jsx|ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const bad = /supabase\s*\.from\(\s*['"](users|user_sessions|transactions|files|deals|brand_kyc|creator_kyc|user_violations)['"]\s*\)/;
    const hits = files.filter((f) => bad.test(read(f)) && !f.endsWith("src/pages/brand/BrandPayments.jsx"));
    expect(hits).toEqual([]);
    expect(fs.existsSync(path.join(process.cwd(), "src/middleware/chatSecurity.ts"))).toBe(false);
  });
});

describe("own-row profile writes go through the server", () => {
  it("no direct browser writes to profile tables; server forces the owner and strips staff columns", () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(process.cwd(), d), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    const files = walk("src").filter((f) => /\.(js|jsx|ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const bad = /supabase\s*\.from\(\s*['"](brand_profiles|creator_profiles|creator_portfolio_items|creator_social_channels|notifications)['"]\s*\)\s*\.(upsert|insert|update|delete)\b/;
    expect(files.filter((f) => bad.test(read(f)))).toEqual([]);
    const s = read("backend/browserDbRoutes.ts");
    expect(s).toContain("out[rule.owner] = ownerId; // always the caller's own row");
    expect(s).toContain("q = q.eq(rule.owner, ownerId);");
    expect(s).toMatch(/STAFF_ONLY = \/\^\(id\|verified\|is_verified/);
  });
});

describe("notifications are private", () => {
  it("the browser never reads notifications from Supabase directly or via realtime", () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(process.cwd(), d), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    const files = walk("src").filter((f) => /\.(js|jsx|ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const bad = /supabase\s*\.from\(\s*['"]notifications['"]\s*\)|table:\s*['"]notifications['"]/;
    expect(files.filter((f) => bad.test(read(f)))).toEqual([]);
  });
  it("live notifications go to the user's socket room (user_<id>), which sockets actually join", () => {
    const s = read("backend/server.ts");
    expect(s).toContain('ioInstance.to(`user_${notif.user_id}`).emit("new_notification", notif);');
    expect(s).not.toContain('ioInstance.to(notif.user_id)');
    expect(read("backend/socketServer.ts")).toContain("socket.join(`user_${id}`)");
  });
});

describe("helpdesk tables are server-only", () => {
  it("the browser never touches support_tickets / ticket_messages directly or via realtime", () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(process.cwd(), d), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    const files = walk("src").filter((f) => /\.(js|jsx|ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const bad = /supabase\s*\.from\(\s*['"](support_tickets|ticket_messages)['"]\s*\)|table:\s*['"](support_tickets|ticket_messages)['"]/;
    expect(files.filter((f) => bad.test(read(f)))).toEqual([]);
  });
  it("staff endpoints exist and ticket messages check the owner", () => {
    const s = read("backend/support_routes.ts");
    expect(s).toContain('router.get("/admin/support/tickets"');
    expect(s).toContain('router.patch("/admin/support/tickets/:id/status"');
    const m = s.indexOf('router.get("/support/tickets/:id/messages"');
    expect(s.slice(m, m + 700)).toContain('return res.status(403).json({ error: "Not your ticket." })');
  });
});

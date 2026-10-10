import { describe, it, expect, vi } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { setupCreatorsRoutes } from "./creators_routes";
import { setupAdminWipeRoutes, passwordMatches } from "./admin_wipe_routes";
import { activeMoney, wipeLocal, wipePlan } from "./accountWipe";
import { resolveSigningEmails } from "./signingEmail";

// Session 27: contract signing email, invites reaching the creator, Explore via the server,
// chat WHO, and the admin "Complete wipe out" (ARCHITECTURE.md rule 56).

/** A tiny in-memory stand-in for the Supabase query builder (only what these routes use). */
function fakeClient(tables: Record<string, any[]>) {
  const from = (table: string) => {
    let rows = () => tables[table] || [];
    const filters: ((r: any) => boolean)[] = [];
    let lim = Infinity;
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    const run = () => {
      const all = rows();
      const hit = all.filter((r) => filters.every((f) => f(r)));
      if (op === "insert") { (tables[table] = tables[table] || []).push(...(Array.isArray(payload) ? payload : [payload])); return { data: payload, error: null }; }
      if (op === "update") { hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null }; }
      if (op === "delete") { tables[table] = all.filter((r) => !hit.includes(r)); return { data: hit, error: null, count: hit.length }; }
      return { data: hit.slice(0, lim), error: null };
    };
    const b: any = {
      select: () => b,
      insert: (p: any) => { op = "insert"; payload = p; return b; },
      update: (p: any) => { op = "update"; payload = p; return b; },
      delete: () => { op = "delete"; return b; },
      eq: (c: string, v: any) => { filters.push((r) => String(r[c]) === String(v)); return b; },
      in: (c: string, vs: any[]) => { filters.push((r) => vs.map(String).includes(String(r[c]))); return b; },
      or: () => b,
      order: () => b,
      range: (a: number, z: number) => { lim = z - a + 1; return b; },
      limit: (n: number) => { lim = n; return b; },
      maybeSingle: () => Promise.resolve({ data: run().data?.[0] || null, error: null }),
      then: (ok: any, no: any) => Promise.resolve(run()).then(ok, no),
    };
    return b;
  };
  return { from, auth: { admin: { deleteUser: vi.fn(async () => ({ error: null })), listUsers: vi.fn(async () => ({ data: { users: [] } })) } } };
}

function callRoute(router: express.Router, routePath: string, req: any) {
  const layer: any = router.stack.find((l: any) =>
    Array.isArray(l.route?.path) ? l.route.path.includes(routePath) : l.route?.path === routePath);
  let status = 200;
  let json: any = null;
  const res: any = {
    status: vi.fn((c: number) => { status = c; return res; }),
    json: vi.fn((d: any) => { json = d; return d; }),
    setHeader: vi.fn(),
  };
  return Promise.resolve(layer.route.stack[0].handle({ app: { get: () => null }, query: {}, ...req }, res, () => {})).then(() => ({ status, json }));
}

function creatorsCtx(who: any, db: any, client: any) {
  const app = express();
  const router = express.Router();
  setupCreatorsRoutes(app, router, {
    supabase: client, privilegedSupabase: client, getDb: () => db, saveDb: () => {},
    parseAuthUser: vi.fn(async () => who), syncEntityTags: vi.fn(), processBase64Image: vi.fn(),
    getSettings: () => ({}), markupForRole: () => 0, getActingBrandId: (u: any) => u.user_id,
    logTeamActivity: vi.fn(), sanitizeCreatorProfile: (p: any) => p, fetchCreatorReviews: vi.fn(),
    broadcastAdminNotification: vi.fn(), insertChatMessageToSupabase: vi.fn(),
  } as any);
  return router;
}

describe("session 27: contract signing email", () => {
  it("a brand signs with the verified POC email from Settings; the login email stays allowed", async () => {
    const client = fakeClient({ brand_profiles: [{ user_id: "b1", poc_email: "Deepak@Gmail.com" }], creator_profiles: [] });
    const r = await resolveSigningEmails({ user_id: "b1", role: "brand", email: "collabs@palmons.com" }, { client, getDb: () => ({}) });
    expect(r.preferred).toBe("deepak@gmail.com");
    expect(r.allowed).toEqual(expect.arrayContaining(["collabs@palmons.com", "deepak@gmail.com"]));
  });

  it("without a POC email the login email is used", async () => {
    const r = await resolveSigningEmails({ user_id: "b1", role: "brand", email: "a@b.com" }, { client: null, getDb: () => ({}) });
    expect(r.preferred).toBe("a@b.com");
  });

  it("signing no longer overwrites the login email", () => {
    const src = fs.readFileSync(path.join(__dirname, "session_routes.ts"), "utf8");
    expect(src).not.toMatch(/usr\.email\s*=\s*inputEmail/);
    expect(src).toContain('"/api/contract/signing-email"');
  });

  it("both contract screens ask the server for the signing email", () => {
    for (const f of ["../src/components/chat/ContractModal.jsx", "../src/components/chat/mobile/MobileContractSheet.jsx"]) {
      expect(fs.readFileSync(path.join(__dirname, f), "utf8")).toContain("contract/signing-email");
    }
  });
});

describe("session 27: invites reach the creator", () => {
  it("an invite sent to the creator's PROFILE id is listed for the creator", async () => {
    const client = fakeClient({
      creator_profiles: [{ id: "11111111-1111-4111-8111-111111111111", user_id: "c1" }],
      brief_requests: [{ id: "br1", brand_id: "b1", creator_id: "11111111-1111-4111-8111-111111111111", status: "pending_creator_acceptance", created_at: "2026-09-01" }],
    });
    const router = creatorsCtx({ user_id: "c1", role: "creator", email: "c1@x.in" }, { creator_profiles: [], brief_requests: [] }, client);
    const { json } = await callRoute(router, "/creators/invitations", { params: {} });
    expect(json.pending.map((i: any) => i.id)).toEqual(["br1"]);
  });

  it("with Supabase but no service key, sending an invite fails loudly", async () => {
    const app = express();
    const router = express.Router();
    setupCreatorsRoutes(app, router, {
      supabase: fakeClient({}), privilegedSupabase: null, getDb: () => ({ brief_requests: [] }), saveDb: () => {},
      parseAuthUser: vi.fn(async () => ({ user_id: "b1", role: "brand" })), syncEntityTags: vi.fn(), processBase64Image: vi.fn(),
      getSettings: () => ({}), markupForRole: () => 0, getActingBrandId: (u: any) => u.user_id, logTeamActivity: vi.fn(),
      sanitizeCreatorProfile: (p: any) => p, fetchCreatorReviews: vi.fn(), broadcastAdminNotification: vi.fn(), insertChatMessageToSupabase: vi.fn(),
    } as any);
    const { status, json } = await callRoute(router, "/creators/:id/send-brief", { params: { id: "c1" }, body: { message: "Hi", budget_range: "5000" } });
    expect(status).toBe(503);
    expect(json.code).toBe("SERVICE_KEY_MISSING");
  });

  it("the dashboard loads invites on its own and reloads on a live event", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/components/dashboard/CreatorDashboard.jsx"), "utf8");
    expect(src).toContain("loadInvitations");
    expect(src).toContain('"ybex:invitation"');
    expect(fs.readFileSync(path.join(__dirname, "../src/components/shared/NotificationBell.jsx"), "utf8")).toContain("invitation_received");
  });
});

describe("session 27: Explore Creators via the server", () => {
  it("sends public fields only and drops stuck base64 photos", async () => {
    const big = "data:image/png;base64," + "A".repeat(10000);
    const client = fakeClient({ creator_profiles: [
      { user_id: "c1", name: "Riya", email: "riya@x.in", phone: "999", picture: big, city: "Delhi" },
      { user_id: "c2", name: "Gone", is_deleted: true },
    ] });
    const router = creatorsCtx(null, { creator_profiles: [] }, client);
    const { json } = await callRoute(router, "/creators/explore", { params: {} });
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("Riya");
    expect(json[0].email).toBeUndefined();
    expect(json[0].phone).toBeUndefined();
    expect(json[0].picture).toBe("");
  });
});

describe("session 27: chat WHO", () => {
  it("messages and thread reads check that the caller is a party", () => {
    const src = fs.readFileSync(path.join(__dirname, "chat_routes.ts"), "utf8");
    expect((src.match(/NOT_A_PARTICIPANT/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("session 27: complete wipe out", () => {
  const admin = { user_id: "adm1", role: "admin", email: "ravi@ybex.in" };

  function wipeCtx(who: any, db: any) {
    const router = express.Router();
    const logAdminAction = vi.fn(async () => {});
    setupAdminWipeRoutes(router, { supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {}, parseAuthUser: vi.fn(async () => who), logAdminAction });
    return { router, logAdminAction };
  }

  const baseDb = async () => ({
    users: [
      { user_id: "adm1", role: "admin", password_hash: await bcrypt.hash("secret123", 4) },
      { user_id: "b9", role: "brand", email: "brand9@x.in", name: "Brand Nine" },
      { user_id: "c7", role: "creator", email: "c7@x.in" },
    ],
    brand_profiles: [{ user_id: "b9", company_name: "Nine" }],
    campaigns: [{ campaign_id: "camp1", brand_user_id: "b9" }],
    campaign_applications: [{ id: "app1", campaign_id: "camp1", creator_id: "c7" }],
    deals: [{ id: "d1", brand_id: "b9", creator_id: "c7", status: "COMPLETED", escrow_hold: true }],
    chat_threads: [{ id: "t1", brand_id: "b9", creator_id: "c7" }, { id: "t2", brand_id: "bX", creator_id: "c7" }],
    chat_messages: [{ message_id: "m1", thread_id: "t1" }, { message_id: "m2", thread_id: "t2" }],
    notifications: [{ user_id: "b9" }, { user_id: "c7" }],
    transactions: [{ id: "tx1", brand_id: "b9", brand_name: "Nine", amount: 5000 }],
    deleted_user_emails: ["brand9@x.in"],
  });

  it("only a full admin with the right password can wipe", async () => {
    const db = await baseDb();
    let r = await callRoute(wipeCtx({ user_id: "s1", role: "sub_admin" }, db).router, "/admin/users/:id/wipe", { params: { id: "b9" }, body: { password: "x" } });
    expect(r.status).toBe(403);
    r = await callRoute(wipeCtx(admin, db).router, "/admin/users/:id/wipe", { params: { id: "b9" }, body: { password: "wrong" } });
    expect(r.status).toBe(401);
    expect(r.json.code).toBe("WRONG_PASSWORD");
    r = await callRoute(wipeCtx(admin, db).router, "/admin/users/:id/wipe", { params: { id: "adm1" }, body: { password: "secret123" } });
    expect(r.status).toBe(400);
  });

  it("wipes the brand's campaigns, chats, deals and notifications; keeps other people's data and payment records", async () => {
    const db: any = await baseDb();
    const { router, logAdminAction } = wipeCtx(admin, db);
    const r = await callRoute(router, "/admin/users/:id/wipe", { params: { id: "b9" }, body: { password: "secret123" } });
    expect(r.status).toBe(200);
    expect(db.users.map((u: any) => u.user_id)).toEqual(["adm1", "c7"]);
    expect(db.campaigns).toHaveLength(0);
    expect(db.campaign_applications).toHaveLength(0);
    expect(db.deals).toHaveLength(0);
    expect(db.chat_threads.map((t: any) => t.id)).toEqual(["t2"]);
    expect(db.chat_messages.map((m: any) => m.message_id)).toEqual(["m2"]);
    expect(db.notifications).toEqual([{ user_id: "c7" }]);
    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0].brand_name).toBe("");
    expect(db.deleted_user_emails).toEqual([]);
    expect(logAdminAction).toHaveBeenCalledWith(admin, "wipe_user", "user", "b9", expect.any(Object));
  });

  it("with money in escrow it asks once, then wipes when the admin confirms (testing tool)", async () => {
    const db: any = await baseDb();
    db.deals[0].status = "ESCROW_HELD";
    let r = await callRoute(wipeCtx(admin, db).router, "/admin/users/:id/wipe", { params: { id: "b9" }, body: { password: "secret123" } });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("WIPE_HAS_ACTIVE_MONEY");
    expect(db.users).toHaveLength(3);
    r = await callRoute(wipeCtx(admin, db).router, "/admin/users/:id/wipe", { params: { id: "b9" }, body: { password: "secret123", force: true } });
    expect(r.status).toBe(200);
    expect(db.users.map((u: any) => u.user_id)).toEqual(["adm1", "c7"]);
    expect(db.deals).toHaveLength(0);
    expect(db.transactions).toHaveLength(1);
  });

  it("money rules", () => {
    expect(activeMoney([{ id: "d", escrow_hold: true, status: "NEGOTIATING" }], [])).toEqual(["deal d"]);
    expect(activeMoney([{ id: "d", escrow_hold: true, status: "RELEASED" }], [])).toEqual([]);
    expect(activeMoney([], [{ id: "o", payment_status: "ESCROW_HELD", status: "IN_PROGRESS" }])).toEqual(["UGC order o"]);
    expect(activeMoney([], [{ id: "o", payment_status: "ESCROW_HELD", status: "COMPLETED" }])).toEqual([]);
  });

  it("the Supabase plan deletes children before parents and the user last", () => {
    const plan = wipePlan({ userIds: ["u"], threadIds: ["t"], dealIds: ["d"], campaignIds: ["c"], orderIds: [], email: "u@x.in" });
    const order = plan.map((s) => s.table);
    expect(order.indexOf("chat_messages")).toBeLessThan(order.indexOf("chat_threads"));
    expect(order.indexOf("campaign_applications")).toBeLessThan(order.indexOf("campaigns"));
    expect(order[order.length - 1]).toBe("users");
    expect(order).not.toContain("transactions");
  });

  it("password check handles bcrypt and rejects empty", async () => {
    expect(await passwordMatches("", { password_hash: "x" })).toBe(false);
    expect(await passwordMatches("p", { password_hash: await bcrypt.hash("p", 4) })).toBe(true);
  });

  it("the admin panel offers both delete modes", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/components/admin/DeleteAccountPanel.jsx"), "utf8");
    expect(src).toContain("/wipe");
    expect(src).toContain("/delete");
    for (const f of ["../src/components/admin/UserEnforcementPanel.jsx", "../src/components/admin/AdminUsersTab.jsx"]) {
      expect(fs.readFileSync(path.join(__dirname, f), "utf8")).toContain("DeleteAccountPanel");
    }
  });

  it("wipeLocal clears the deleted-email block so the same email can sign up again", () => {
    const db: any = { users: [{ user_id: "u", email: "u@x.in" }], deleted_user_ids: ["u"], deleted_user_emails: ["u@x.in"] };
    wipeLocal(db, { userIds: ["u"], threadIds: [], dealIds: [], campaignIds: [], orderIds: [], email: "u@x.in" });
    expect(db.users).toEqual([]);
    expect(db.deleted_user_ids).toEqual([]);
    expect(db.deleted_user_emails).toEqual([]);
  });
});

describe("session 27: normal delete keeps data, bin restore undoes it all", () => {
  it("normal delete only marks rows; restore clears the marks and the deleted lists", async () => {
    const { restoreFromBin } = await import("./binRestore");
    const { setupAdminCampaignsSettingsRoutes } = await import("./admin_campaigns_settings_routes");
    const db: any = {
      users: [{ user_id: "c5", email: "c5@x.in", role: "creator" }],
      creator_profiles: [{ id: "p5", user_id: "c5", email: "c5@x.in" }],
      brand_profiles: [], waitlist: [{ id: "w5", user_id: "c5" }], campaigns: [],
    };
    const router = express.Router();
    setupAdminCampaignsSettingsRoutes(express(), router, {
      supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {},
      parseAuthUser: vi.fn(async () => ({ user_id: "adm1", role: "admin" })), logAdminAction: vi.fn(async () => {}),
      sendNotification: vi.fn(), getSettings: () => ({}), getFullFeeAndReferralConfig: vi.fn(),
    } as any);
    await callRoute(router, "/admin/users/:user_id/delete", { params: { user_id: "c5" }, body: {} });
    expect(db.creator_profiles).toHaveLength(1);
    expect(db.creator_profiles[0].is_deleted).toBe(true);
    expect(db.waitlist).toHaveLength(1);
    expect(db.users[0].is_deleted).toBe(true);
    expect(db.deleted_user_emails).toContain("c5@x.in");
    await restoreFromBin("c5", { db, client: null });
    expect(db.users[0].is_deleted).toBe(false);
    expect(db.creator_profiles[0].is_deleted).toBe(false);
    expect(db.deleted_user_ids).toEqual([]);
    expect(db.deleted_user_emails).toEqual([]);
  });

  it("the admin users list keeps binned accounts (marked) so the Recycle Bin can show them", () => {
    const src = fs.readFileSync(path.join(__dirname, "admin_users_enforcement_routes.ts"), "utf8");
    expect(src).toContain("isBinned");
    expect(src).not.toMatch(/finalUsers = mapped\.filter/);
    const tab = fs.readFileSync(path.join(__dirname, "../src/components/admin/AdminUsersTab.jsx"), "utf8");
    expect(tab).toContain("/restore");
  });
});

describe("session 27: invite accept shows two cards", () => {
  it("the creator's thank-you (invite_greeting) renders as a card on desktop and mobile", () => {
    const bubble = fs.readFileSync(path.join(__dirname, "../src/components/chat/MessageBubble.jsx"), "utf8");
    expect(bubble).toContain("invite_greeting");
    expect(bubble).toContain("InviteThanksCard");
    const row = fs.readFileSync(path.join(__dirname, "../src/components/chat/mobile/MobileMessageRow.jsx"), "utf8");
    expect(row).toContain("MobileInviteThanksCard");
    const server = fs.readFileSync(path.join(__dirname, "creators_routes.ts"), "utf8");
    expect(server).toContain('action: "invite_greeting"');
  });
});

describe("session 27: admin audit — no fake numbers, no dead buttons", () => {
  const rd = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");

  it("admin reads use the service-role client", () => {
    for (const f of ["admin_users_enforcement_routes.ts", "admin_system_maintenance_routes.ts", "admin_logs_creators_routes.ts", "admin_kyc_verification_routes.ts"]) {
      expect(rd(f)).not.toMatch(/(?<![\w.|(])(?<!\|\| )supabase\s*\.from\(/);
    }
  });

  it("dashboard and campaign review show no invented claims", () => {
    const dash = rd("../src/components/admin/AdminAnalytics.jsx");
    expect(dash).not.toContain("100% Escrow Fully Funded");
    expect(dash).not.toContain("Platform Revenue (10%)");
    const q = rd("../src/components/admin/CampaignReviewQueue.jsx");
    expect(q).not.toContain("99.4%");
    expect(q).not.toContain("100% Funded");
    expect(q).not.toContain("Guaranteed on approval");
  });

  it("a dispute decision queues the money instead of claiming it was sent", () => {
    const s = rd("admin_system_maintenance_routes.ts");
    const i = s.indexOf('"/admin/system-collabs/:id/resolve"');
    const body = s.slice(i, i + 4000);
    expect(body).not.toMatch(/refund_status: 'PROCESSED'/);
    expect(body).not.toMatch(/payout_status: 'RELEASED'/);
    expect(body).toContain("refund_status: 'PENDING'");
  });

  it("no stock photos, invented rates or fake testimonials/brands from the server", () => {
    expect(rd("admin_waitlist_routes.ts")).not.toContain("images.unsplash.com");
    expect(rd("admin_waitlist_routes.ts")).not.toMatch(/\|\| 2500;/);
    const c = rd("admin_content_routes.ts");
    expect(c).not.toContain("Aarav Sharma");
    expect(c).not.toContain("free-nike-logo");
    expect(rd("../src/components/admin/AdminUgcManager.jsx")).not.toContain("images.unsplash.com");
  });

  it("the creator dashboard fallback banner is not a made-up brand campaign", () => {
    const s = rd("../src/components/dashboard/CreatorDashboard.jsx");
    expect(s).not.toContain("Nike Pegasus");
    expect(s).not.toContain("boAt Rockerz");
  });

  it("the landing brand grid/globe have no hardcoded logos", () => {
    for (const f of ["../src/components/landing/BrandGridSection.jsx", "../src/components/landing/BrandGlobeSection.jsx"]) {
      const s = rd(f);
      expect(s).not.toContain("BRAND_LOGOS");
      expect(s).not.toContain("Salesforce");
    }
  });

  it("performance metrics are real only: no invented series on server or client", () => {
    const s = rd("market_intelligence_routes.ts");
    const i = s.indexOf('"/market-intelligence/performance/:id"');
    const body = s.slice(i, i + 3000);
    expect(body).not.toContain("Math.random");
    expect(body).toContain("available: false");
    const chart = rd("../src/components/analytics/InfluencerMetricsChart.jsx");
    expect(chart).not.toContain("reach: 35000");
    expect(chart).not.toContain("|| 14.2");
    expect(chart).toContain("No performance data recorded yet.");
  });

  it("chat moderation's view button opens the chat", () => {
    expect(rd("../src/components/chat/AdminChatDashboard.jsx")).toContain("openThread(t)");
  });
});

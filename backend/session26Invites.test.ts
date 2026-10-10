import { describe, it, expect, vi } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import { setupCreatorsRoutes } from "./creators_routes";
import { parseInviteBudget, formatInviteTimeline, inviteAmount, isInvitedCreator, MIN_INVITE_AMOUNT } from "./directInvites";

// Session 26 — direct brand invitation = a normal campaign deal with a different start
// (ARCHITECTURE.md rule 54).

const brand = { user_id: "brand_101", name: "Acme Corp", role: "brand", email: "brand@acme.com" };
const creator = { user_id: "creator_202", name: "Pooja Sharma", role: "creator", email: "pooja@creator.in" };

function ctx(currentUser: any, extra: any = {}) {
  const app = express();
  const router = express.Router();
  const db: any = {
    users: [brand, creator],
    creator_profiles: [{ user_id: "creator_202", name: "Pooja Sharma", email: "pooja@creator.in", is_claimed: true }],
    brand_profiles: [{ user_id: "brand_101", company_name: "Acme Corp" }],
    brief_requests: [],
    chat_threads: [],
    chat_messages: [],
    notifications: [],
    ...extra,
  };
  let who = currentUser;
  setupCreatorsRoutes(app, router, {
    supabase: null,
    privilegedSupabase: null,
    getDb: () => db,
    saveDb: (u: any) => Object.assign(db, u),
    parseAuthUser: vi.fn(async () => who),
    syncEntityTags: vi.fn(),
    processBase64Image: vi.fn(),
    getSettings: () => ({}),
    markupForRole: () => 0,
    getActingBrandId: (u: any) => u.user_id,
    logTeamActivity: vi.fn(),
    sanitizeCreatorProfile: (p: any) => p,
    fetchCreatorReviews: vi.fn(),
    broadcastAdminNotification: vi.fn(),
    insertChatMessageToSupabase: vi.fn(),
  } as any);
  const call = async (routePath: string, params: any, body: any = {}) => {
    const layer: any = router.stack.find((l: any) =>
      Array.isArray(l.route?.path) ? l.route.path.includes(routePath) : l.route?.path === routePath
    );
    let status = 200;
    let json: any = null;
    const res: any = {
      status: vi.fn((c: number) => { status = c; return res; }),
      json: vi.fn((d: any) => { json = d; return d; }),
    };
    await layer.route.stack[0].handle({ params, body, app: { get: () => null } }, res, () => {});
    return { status, json };
  };
  return { db, call, setUser: (u: any) => { who = u; } };
}

const pendingInvite = (over: any = {}) => ({
  id: "inv_1",
  brand_id: "brand_101",
  brand_name: "Acme Corp",
  creator_id: "creator_202",
  creator_name: "Pooja Sharma",
  campaign_title: "Winter Launch",
  proposed_budget: "₹45,000",
  deliverables: "2 Reels",
  timeline: "5 days",
  message: "",
  status: "pending_creator_acceptance",
  created_at: new Date().toISOString(),
  ...over,
});

describe("session 26: direct invite helpers", () => {
  it("reads the fee and never invents one", () => {
    expect(parseInviteBudget("₹45,000")).toBe(45000);
    expect(parseInviteBudget("Negotiable")).toBe(0);
    expect(inviteAmount({ budget_range: "Barter Friendly" })).toBe(0);
    expect(MIN_INVITE_AMOUNT).toBe(3000);
  });
  it("adds the days unit to a bare number", () => {
    expect(formatInviteTimeline("76")).toBe("76 days");
    expect(formatInviteTimeline("1")).toBe("1 day");
    expect(formatInviteTimeline("by next Friday")).toBe("by next Friday");
    expect(formatInviteTimeline("")).toBeNull();
  });
  it("only the invited creator counts", () => {
    const inv = pendingInvite();
    expect(isInvitedCreator(inv, creator)).toBe(true);
    expect(isInvitedCreator(inv, brand)).toBe(false);
    expect(isInvitedCreator(inv, { user_id: "x", role: "creator", email: "other@x.in" })).toBe(false);
  });
});

describe("session 26: sending an invite", () => {
  it("refuses an invite without a real fee", async () => {
    const { call, db } = ctx(brand);
    const r = await call("/creators/:id/send-brief", { id: "creator_202" }, { message: "Hi", budget_range: "Negotiable" });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("INVITE_AMOUNT_REQUIRED");
    expect(db.brief_requests.length).toBe(0);
  });
  it("stores the fee as a number and the timeline with days", async () => {
    const { call, db } = ctx(brand);
    const r = await call("/creators/:id/send-brief", { id: "creator_202" }, { message: "Hi", budget_range: "4500", timeline: "7" });
    expect(r.json.success).toBe(true);
    expect(db.brief_requests[0].amount).toBe(4500);
    expect(db.brief_requests[0].proposed_budget).toBe("₹4,500");
    expect(db.brief_requests[0].timeline).toBe("7 days");
  });
});

describe("session 26: accepting an invite", () => {
  it("opens a NEW campaign deal and chat every time — never an old thread", async () => {
    const oldThread = { id: "thread_camp_old", brand_id: "brand_101", creator_id: "creator_202", status: "COMPLETED", flow_state: "COMPLETED" };
    const { call, db } = ctx(creator, { brief_requests: [pendingInvite()], chat_threads: [oldThread] });
    const r = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    expect(r.json.success).toBe(true);
    expect(r.json.thread_id).toMatch(/^thread_camp_[0-9a-f-]{36}$/);
    expect(r.json.thread_id).not.toBe("thread_camp_old");
    // The finished deal is untouched.
    expect(oldThread.status).toBe("COMPLETED");
    expect(oldThread.flow_state).toBe("COMPLETED");
    const t = db.chat_threads.find((x: any) => x.id === r.json.thread_id);
    expect(t.deal_id).toBe(r.json.deal_id);
    expect(t.agreed_amount).toBe(45000);
    expect(t.status).toBe("NEGOTIATING");
    expect(db.deals.find((d: any) => d.id === r.json.deal_id)).toBeTruthy();
  });

  it("a second invite to the same creator gets its own chat", async () => {
    const { call } = ctx(creator, { brief_requests: [pendingInvite(), pendingInvite({ id: "inv_2" })] });
    const a = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    const b = await call("/creators/invitations/:id/accept", { id: "inv_2" });
    expect(a.json.thread_id).not.toBe(b.json.thread_id);
  });

  it("the offer card is the brand's; no note in the creator's name unless written", async () => {
    const { call, db } = ctx(creator, { brief_requests: [pendingInvite()] });
    await call("/creators/invitations/:id/accept", { id: "inv_1" });
    const offer = db.chat_messages.find((m: any) => m.message_type === "brand_invitation_offer");
    expect(offer.sender_user_id).toBe("brand_101");
    expect(offer.metadata.pitch).toBeNull();
    expect(JSON.stringify(db.chat_messages)).not.toContain("Ready to deliver");
    expect(JSON.stringify(db.chat_messages)).not.toContain("1 Dedicated Instagram Reel");
  });

  it("accepting twice returns the same chat (no second deal)", async () => {
    const { call, db } = ctx(creator, { brief_requests: [pendingInvite()] });
    const a = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    const b = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    expect(b.json.thread_id).toBe(a.json.thread_id);
    expect(db.deals.length).toBe(1);
  });

  it("WHO: the brand or another creator cannot accept", async () => {
    const { call, setUser } = ctx(brand, { brief_requests: [pendingInvite()] });
    expect((await call("/creators/invitations/:id/accept", { id: "inv_1" })).status).toBe(403);
    setUser({ user_id: "creator_999", role: "creator", email: "x@y.in" });
    expect((await call("/creators/invitations/:id/accept", { id: "inv_1" })).status).toBe(403);
  });

  it("WHEN: a declined invite cannot be accepted, an accepted one cannot be declined", async () => {
    const { call } = ctx(creator, { brief_requests: [pendingInvite({ status: "creator_declined" }), pendingInvite({ id: "inv_2" })] });
    const r = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("INVITE_CLOSED");
    await call("/creators/invitations/:id/accept", { id: "inv_2" });
    const d = await call("/creators/invitations/:id/decline", { id: "inv_2" }, { reason: "Busy" });
    expect(d.status).toBe(409);
  });

  it("an invite with no fee cannot become a deal", async () => {
    const { call } = ctx(creator, { brief_requests: [pendingInvite({ proposed_budget: "Negotiable" })] });
    const r = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("INVITE_NO_AMOUNT");
  });
});

describe("session 26: cards and login", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  it("the creator (not the brand) answers the brand's invitation offer, on desktop and mobile", () => {
    expect(read("src/components/chat/ShortlistCards.jsx")).toContain("!isUserBrand ? actionButtons : waitingNote");
    expect(read("src/components/chat/mobile/MobileShortlistCards.jsx")).toContain("const canAct = isInviteOffer ? !isBrand : isBrand;");
  });
  it("mobile Accept on an opening offer opens the contract (not brand-accept-counter)", () => {
    expect(read("src/components/chat/mobile/MobileMessageRow.jsx")).toContain("onAcceptOffer={onOpenContract || onAcceptOffer}");
  });
  it("mobile offer card invents no amount", () => {
    const s = read("src/components/chat/mobile/MobileShortlistCards.jsx");
    expect(s).not.toMatch(/\|\|\s*10000/);
    expect(s).not.toMatch(/delivery_days \|\| 7/);
  });
  it("login says the service key is missing instead of 'No account found' (v211, re-applied)", () => {
    const s = read("backend/auth_routes.ts");
    const login = s.slice(s.indexOf('router.post("/auth/login"'), s.indexOf('router.post("/auth/login"') + 4000);
    expect(login).toContain("if (!privilegedSupabase) return res.status(503).json(LOGIN_NO_SERVICE_KEY)");
    expect(login).toContain("LOGIN_LOOKUP_FAILED");
    expect(s).toContain('code: "SERVICE_KEY_MISSING"');
  });
});

// ---- Supabase path (brief_requests is server-only; the service-role client is used) ----------
function fakeSupabase() {
  const tables: Record<string, any[]> = { brief_requests: [], deals: [], chat_threads: [], notifications: [] };
  const from = (table: string) => {
    const rows = (tables[table] = tables[table] || []);
    const filters: Array<(r: any) => boolean> = [];
    let op: "select" | "update" | "delete" = "select";
    let patch: any = null;
    const exec = () => {
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      if (op === "delete") hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return hit;
    };
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return q; },
      in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      order: () => q,
      limit: () => q,
      update: (p: any) => { op = "update"; patch = p; return q; },
      delete: () => { op = "delete"; return q; },
      insert: async (row: any) => { rows.push({ ...row }); return { error: null }; },
      // Like real Supabase: callers get copies, never the stored row itself.
      maybeSingle: async () => { const r = exec()[0]; return { data: r ? { ...r } : null, error: null }; },
      then: (ok: any, bad: any) => Promise.resolve({ data: exec().map((r) => ({ ...r })), error: null }).then(ok, bad),
    };
    return q;
  };
  return { from, tables };
}

function ctxSupabase(currentUser: any) {
  const sb = fakeSupabase();
  const app = express();
  const router = express.Router();
  const db: any = { users: [brand, creator], creator_profiles: [], brand_profiles: [], brief_requests: [], chat_threads: [], chat_messages: [], notifications: [] };
  let who = currentUser;
  setupCreatorsRoutes(app, router, {
    supabase: sb, privilegedSupabase: sb, getDb: () => db, saveDb: () => {},
    parseAuthUser: vi.fn(async () => who), syncEntityTags: vi.fn(), processBase64Image: vi.fn(),
    getSettings: () => ({}), markupForRole: () => 0, getActingBrandId: (u: any) => u.user_id,
    logTeamActivity: vi.fn(), sanitizeCreatorProfile: (p: any) => p, fetchCreatorReviews: vi.fn(),
    broadcastAdminNotification: vi.fn(), insertChatMessageToSupabase: vi.fn(async () => ({ error: null })),
  } as any);
  const call = async (routePath: string, params: any, body: any = {}) => {
    const layer: any = router.stack.find((l: any) =>
      Array.isArray(l.route?.path) ? l.route.path.includes(routePath) : l.route?.path === routePath);
    let status = 200; let json: any = null;
    const res: any = { status: vi.fn((c: number) => { status = c; return res; }), json: vi.fn((d: any) => { json = d; return d; }) };
    await layer.route.stack[0].handle({ params, body, app: { get: () => null } }, res, () => {});
    return { status, json };
  };
  return { sb, db, call, setUser: (u: any) => { who = u; } };
}

describe("session 26: invites live in Supabase brief_requests", () => {
  it("send → saved in Supabase with an explicit status (the column default is 'NEW')", async () => {
    const { sb, call } = ctxSupabase(brand);
    const r = await call("/creators/:id/send-brief", { id: "creator_202" }, { message: "Hi", budget_range: "₹5,000" });
    expect(r.json.success).toBe(true);
    const row = sb.tables.brief_requests[0];
    expect(row.status).toBe("pending_creator_acceptance");
    expect(row.amount).toBe(5000);
    expect(row).not.toHaveProperty("brand_email"); // not a column
  });

  it("a creator sees an invite that exists only in Supabase (another server instance)", async () => {
    const { sb, call, setUser } = ctxSupabase(creator);
    sb.tables.brief_requests.push(pendingInvite({ id: "inv_remote" }));
    const r = await call("/creators/invitations", {});
    expect(r.json.invitations.map((i: any) => i.id)).toContain("inv_remote");
    setUser(creator);
  });

  it("accept writes the deal + thread and marks the Supabase row accepted", async () => {
    const { sb, call } = ctxSupabase(creator);
    sb.tables.brief_requests.push(pendingInvite());
    const r = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    expect(r.json.success).toBe(true);
    expect(sb.tables.deals.length).toBe(1);
    expect(sb.tables.chat_threads[0].id).toBe(r.json.thread_id);
    const row = sb.tables.brief_requests[0];
    expect(row.status).toBe("accepted");
    expect(row.thread_id).toBe(r.json.thread_id);
    expect(row.deal_id).toBe(r.json.deal_id);
  });

  it("two accepts at once open ONE deal", async () => {
    const { sb, call } = ctxSupabase(creator);
    sb.tables.brief_requests.push(pendingInvite());
    const [a, b] = await Promise.all([
      call("/creators/invitations/:id/accept", { id: "inv_1" }),
      call("/creators/invitations/:id/accept", { id: "inv_1" }),
    ]);
    expect(sb.tables.deals.length).toBe(1);
    expect([a.json?.success, b.json?.success].filter(Boolean).length).toBeGreaterThanOrEqual(1);
  });

  it("decline is saved in Supabase; an accepted invite cannot be declined", async () => {
    const { sb, call } = ctxSupabase(creator);
    sb.tables.brief_requests.push(pendingInvite(), pendingInvite({ id: "inv_2", status: "accepted", thread_id: "thread_camp_x" }));
    const d = await call("/creators/invitations/:id/decline", { id: "inv_1" }, { reason: "Busy" });
    expect(d.json.status).toBe("creator_declined");
    expect(sb.tables.brief_requests[0].status).toBe("creator_declined");
    const d2 = await call("/creators/invitations/:id/decline", { id: "inv_2" }, { reason: "Busy" });
    expect(d2.status).toBe(409);
  });

  it("an accept that crashed half-way does not lock the invite forever", async () => {
    const { sb, call } = ctxSupabase(creator);
    sb.tables.brief_requests.push(pendingInvite({ status: "accepting", updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }));
    const r = await call("/creators/invitations/:id/accept", { id: "inv_1" });
    expect(r.json.success).toBe(true);
  });
});

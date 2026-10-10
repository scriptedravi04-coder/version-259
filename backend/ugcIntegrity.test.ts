import { issueSignToken } from "./signTokens";
import { describe, it, expect } from "vitest";
import { createUgcLifecycleHandlers, setupUgcOrderRoutes, setupUgcBrowseRoutes } from "./ugc_routes";
import { createUgcLifecycleService } from "./services/ugcLifecycleService";
import { createCampaignLifecycleHandlers, setupCampaignsRoutes } from "./campaigns_routes";

// Session 19c — UGC lifecycle integrity. Every case below was reproduced against v164 by
// running the real handlers before it was fixed.

const BRAND = "b0000000-0000-4000-8000-000000000001";
const CREATOR = "c0000000-0000-4000-8000-000000000002";
const STRANGER = "d0000000-0000-4000-8000-000000000003";
const CREATOR2 = "e0000000-0000-4000-8000-000000000004";
const OID = "ugcord_t_1";
const B = { user_id: BRAND, role: "brand" };
const C = { user_id: CREATOR, role: "creator" };
const S = { user_id: STRANGER, role: "creator" };
const ADMIN = { user_id: "admin1", role: "admin" };

function mk(orderExtra: any = {}, briefExtra: any = {}) {
  const db: any = {
    ugc_briefs: [{ id: "brief_1", brand_id: BRAND, brand_name: "Acme", budget: 5000, max_creators: 3, claimed_count: 0, status: "OPEN", deliverable_type: "ugc_video_raw", is_collaboration: false, requires_live_link: false, detailed_requirements: "secret brief", ...briefExtra }],
    ugc_orders: [{ id: OID, brief_id: "brief_1", brand_id: BRAND, creator_id: CREATOR, status: "ACCEPTED", creator_payout: 5000, escrow_amount: 5000, deliverable_type: "ugc_video_raw", is_collaboration: false, requires_live_link: false, revision_count: 5, revisions_used: 0, payment_status: "ESCROW_HELD", ...orderExtra }],
    chat_threads: [{ id: `thread_ugc_${OID}`, deal_id: OID, ugc_order_id: OID, brand_id: BRAND, creator_id: CREATOR, is_ugc: true, status: "ACTIVE", flow_state: "ACTIVE" }],
    chat_messages: [], transactions: [], notifications: [], content_submissions: [], campaigns: [],
  };
  let actor: any;
  const getDb = () => db, saveDb = () => {};
  const parseAuthUser = async () => actor;
  const svc = createUgcLifecycleService({ supabase: null, privilegedSupabase: null, getDb, saveDb, getIsoNow: () => new Date().toISOString(), ensureUGCChatThread: async (o: any) => db.chat_threads.find((t: any) => t.deal_id === o.id) || { id: o.id }, insertChatMessageToSupabase: async () => {} } as any);
  const camp = createCampaignLifecycleHandlers({ supabase: null, privilegedSupabase: null, getDb, saveDb, parseAuthUser, insertChatMessageToSupabase: async () => ({}) } as any);
  const h = createUgcLifecycleHandlers({ supabase: null, privilegedSupabase: null, getDb, parseAuthUser, syncUgcLifecycleEvent: svc, handleThreadApproveLiveLinks: camp.handleThreadApproveLiveLinks, handleThreadApproveContent: camp.handleThreadApproveContent, handleCampaignRevision: camp.handleCampaignRevision } as any);
  const routes: Record<string, any> = {};
  const router: any = {
    post: (p: any, fn: any) => (Array.isArray(p) ? p : [p]).forEach((x: string) => (routes["POST " + x] = fn)),
    get: (p: any, fn: any) => (Array.isArray(p) ? p : [p]).forEach((x: string) => (routes["GET " + x] = fn)),
  };
  setupUgcOrderRoutes({} as any, router, { handleThreadApproveContent: camp.handleThreadApproveContent, ...h } as any);
  setupUgcBrowseRoutes({} as any, router, { supabase: null, privilegedSupabase: null, getDb, saveDb, parseAuthUser, ensureUGCChatThread: async () => ({}), enrichBriefsWithBrandProfiles: async (b: any) => b } as any);
  setupCampaignsRoutes({} as any, router, { supabase: null, privilegedSupabase: null, getDb, saveDb, parseAuthUser, sendNotification: async () => {}, serializeChatMessage: (t: any) => t, insertChatMessageToSupabase: async () => {}, syncEntityTags: async () => {}, getActingBrandId: (u: any) => u?.parent_brand_id || u?.user_id, createEscrowTransaction: async () => null, isCreatorKycVerified: async () => true } as any);
  const call = async (key: string, user: any, body: any = {}, id = OID) => {
    actor = user; let status = 200; let json: any;
    const res: any = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; }, setHeader() {} };
    await routes[key]({ params: { id, orderId: id, threadId: id }, body, query: {}, originalUrl: key, app: { get: () => null } }, res);
    return { status, json };
  };
  return { db, call };
}

describe("money", () => {
  it("a cancelled, refunded order is never approved (was: refund AND payout)", async () => {
    const { db, call } = mk({ status: "CANCELLED", payment_status: "REFUNDED", video_url: "https://x/v.mp4" });
    const r = await call("POST /ugc/orders/:id/approve", B);
    expect(r.status).toBe(409);
    expect(db.ugc_orders[0].payment_status).toBe("REFUNDED");
  });
  it("nothing is paid out before a delivery", async () => {
    const { db, call } = mk({ status: "ACCEPTED" });
    const r = await call("POST /ugc/orders/:id/approve", B);
    expect(r.status).toBe(409);
    expect(db.ugc_orders[0].status).toBe("ACCEPTED");
  });
  it("a delivered raw order is approved and paid normally", async () => {
    const { db, call } = mk({ status: "SUBMITTED", video_url: "https://x/v.mp4" });
    const r = await call("POST /ugc/orders/:id/approve", B);
    expect(r.status).toBe(200);
    expect(db.ugc_orders[0].status).toBe("COMPLETED");
  });
  it("the brand cannot cancel for a refund after the creator delivered", async () => {
    const { db, call } = mk({ status: "SUBMITTED", video_url: "https://x/v.mp4" });
    const r = await call("POST /ugc/orders/:id/cancel", B, { reason: "changed mind" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DELIVERED_USE_DISPUTE");
    expect(db.ugc_orders[0].payment_status).toBe("ESCROW_HELD");
  });
  it("a second cancel does not write a second refund", async () => {
    // Session 25 (rule 52): a brand may cancel one order only 24h+ after the creator's timer
    // started and before any draft, and the refund goes to the manual queue (ugc_refunds), not
    // Razorpay. The fixture is set up so the first cancel is allowed; the point is unchanged.
    const start = Date.now() - 30 * 3600000;
    const { db, call } = mk({ created_at: new Date(start).toISOString(), internal_deadline: new Date(start + 48 * 3600000).toISOString() }, { delivery_hours: 48 });
    db.brand_refund_accounts = [{ brand_id: BRAND, method_type: "UPI", upi_id: "acme@upi" }];
    const r1 = await call("POST /ugc/orders/:id/cancel", B, { reason: "x" });
    expect(r1.status).toBe(200);
    const r2 = await call("POST /ugc/orders/:id/cancel", B, { reason: "x" });
    expect(r2.json.already_cancelled).toBe(true);
    expect(db.transactions.filter((t: any) => t.refund_amount).length).toBeLessThanOrEqual(1);
    expect((db.ugc_refunds || []).length).toBe(1);
  });
  it("only a brand posts a brief", async () => {
    const { call } = mk();
    const r = await call("POST /ugc/briefs", C, { title: "t", budget: 99999, max_creators: 1 });
    expect(r.status).toBe(403);
  });
});

describe("who", () => {
  it("a stranger cannot cancel someone's order", async () => {
    const { db, call } = mk();
    expect((await call("POST /ugc/orders/:id/cancel", S, { reason: "x" })).status).toBe(403);
    expect(db.ugc_orders[0].status).toBe("ACCEPTED");
  });
  it("only the brand asks for a revision", async () => {
    const a = mk({ status: "SUBMITTED", video_url: "v" });
    expect((await a.call("POST /ugc/orders/:id/revision", S, { feedback: "x" })).status).toBe(403);
    const b = mk({ status: "SUBMITTED", video_url: "v" });
    expect((await b.call("POST /ugc/orders/:id/revision", C, { feedback: "x" })).status).toBe(403);
    const c = mk({ status: "SUBMITTED", video_url: "v" });
    expect((await c.call("POST /ugc/orders/:id/revision", B, { feedback: "x" })).status).toBe(200);
  });
  it("no revision when nothing is under review", async () => {
    const { call } = mk({ status: "ACCEPTED" });
    expect((await call("POST /ugc/orders/:id/revision", B, { feedback: "x" })).status).toBe(409);
  });
  it("only the creator declines, and only an open request", async () => {
    const a = mk({ status: "REVISION_REQ", video_url: "v" });
    expect((await a.call("POST /ugc/orders/:id/decline-revisions", S, { feedback: "no" })).status).toBe(403);
    const b = mk({ status: "ACCEPTED" });
    expect((await b.call("POST /ugc/orders/:id/decline-revisions", C, { feedback: "no" })).status).toBe(409);
  });
  it("sign cannot reset a completed order", async () => {
    const a = mk({ status: "COMPLETED", payment_status: "RELEASED" });
    expect((await a.call("POST /ugc/orders/:id/sign", S)).status).toBe(403);
    const b = mk({ status: "COMPLETED", payment_status: "RELEASED" });
    await b.call("POST /ugc/orders/:id/sign", C);
    expect(b.db.ugc_orders[0].status).toBe("COMPLETED");
  });
  it("no upload onto a completed order", async () => {
    const { db, call } = mk({ status: "COMPLETED", payment_status: "RELEASED" });
    expect((await call("POST /ugc/orders/:id/submit", C, { videoUrl: "https://x/v2.mp4" })).status).toBe(409);
    expect(db.ugc_orders[0].status).toBe("COMPLETED");
  });
  it("one creator, one claim per brief; brands do not claim", async () => {
    const a = mk();
    // Each attempt has its own verified-OTP sign token (session 21); still only one order.
    for (let i = 0; i < 3; i++) await a.call("POST /ugc/orders/claim", { user_id: CREATOR2, role: "creator" }, { brief_id: "brief_1", sign_token: await issueSignToken(CREATOR2) });
    expect(a.db.ugc_orders.filter((o: any) => o.creator_id === CREATOR2).length).toBe(1);
    const c = mk();
    expect((await c.call("POST /ugc/orders/claim", { user_id: CREATOR2, role: "creator" }, { brief_id: "brief_1" })).status).toBe(403); // no token
    const b = mk();
    expect((await b.call("POST /ugc/orders/claim", { user_id: STRANGER, role: "brand" }, { brief_id: "brief_1" })).status).toBe(403);
  });
  it("order detail is for the parties", async () => {
    const { call } = mk();
    expect((await call("GET /ugc/orders/:id", S)).status).toBe(403);
    expect((await call("GET /ugc/orders/:id", C)).status).toBe(200);
  });
});

describe("unauthenticated routes are closed", () => {
  it("admin order list", async () => {
    const { call } = mk();
    expect((await call("GET /admin/ugc/orders", null)).status).toBe(401);
    expect((await call("GET /admin/ugc/orders", B)).status).toBe(403);
    expect((await call("GET /admin/ugc/orders", ADMIN)).status).toBe(200);
  });
  it("team upload", async () => {
    const { db, call } = mk();
    expect((await call("POST /admin/ugc/orders/:id/team-upload", null, { videoUrl: "https://evil/x.mp4" })).status).toBe(401);
    expect(db.ugc_orders[0].video_url).toBeUndefined();
  });
  it("in-house override", async () => {
    const { db, call } = mk();
    expect((await call("POST /ugc-orders/:orderId/in-house", null)).status).toBe(401);
    expect((await call("POST /ugc-orders/:orderId/in-house", S)).status).toBe(403);
    expect(db.ugc_orders[0].status).toBe("ACCEPTED");
  });
  it("legacy submit", async () => {
    const { db, call } = mk();
    expect((await call("POST /ugc-orders/:orderId/submit", S, { video_url: "https://evil/y.mp4" })).status).toBe(403);
    expect(db.ugc_orders[0].video_url).toBeUndefined();
  });
});

describe("public preview (logged out can look, not act)", () => {
  it("live UGC orders list works logged out, without order/creator/video data", async () => {
    const { call } = mk({ status: "SUBMITTED", video_url: "https://x/secret.mp4" }, { claimed_count: 1 });
    const r = await call("GET /ugc-orders", null);
    expect(r.status).toBe(200);
    expect(r.json.length).toBe(1);
    expect(r.json[0].is_public_preview).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain("secret");
  });
  it("signed-in users no longer receive other brands' delivered videos", async () => {
    const { call } = mk({ status: "SUBMITTED", video_url: "https://x/secret.mp4" });
    const r = await call("GET /ugc-orders", { user_id: "other_brand", role: "brand" });
    expect(JSON.stringify(r.json)).not.toContain("secret.mp4");
    const own = await call("GET /ugc-orders", B);
    expect(JSON.stringify(own.json)).toContain("secret.mp4");
  });
  it("available briefs logged out = listing fields only", async () => {
    const { call } = mk();
    const r = await call("GET /ugc/briefs/available", null);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toContain("secret brief");
  });
  it("live campaigns list works logged out, without applicants", async () => {
    const { db, call } = mk();
    db.campaigns.push({ campaign_id: "c1", title: "Live one", status: "live", applicants: [{ creator_user_id: "x", pitch: "private" }] });
    const r = await call("GET /campaigns", null);
    expect(r.status).toBe(200);
    expect(r.json[0].title).toBe("Live one");
    expect(r.json[0].applicants).toBeUndefined();
  });
});

describe("service-level money guards hold on every path (not just the order page)", () => {
  it("APPROVE via the lifecycle service directly: refunded order refused, undelivered order refused", async () => {
    const { createUgcLifecycleService: mkSvc } = await import("./services/ugcLifecycleService");
    const db: any = { ugc_orders: [{ id: "ugcord_s1", brand_id: BRAND, creator_id: CREATOR, status: "CANCELLED", payment_status: "REFUNDED", video_url: "v" }, { id: "ugcord_s2", brand_id: BRAND, creator_id: CREATOR, status: "ACCEPTED" }], chat_threads: [], chat_messages: [], transactions: [], notifications: [] };
    const svc = mkSvc({ supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {}, getIsoNow: () => new Date().toISOString(), ensureUGCChatThread: async () => null, insertChatMessageToSupabase: async () => {} } as any);
    const r1: any = await svc({ rawId: "ugcord_s1", action: "APPROVE", actorUser: B, notes: "" });
    expect(r1.code).toBe("ORDER_CANCELLED");
    const r2: any = await svc({ rawId: "ugcord_s2", action: "APPROVE", actorUser: B, notes: "" });
    expect(r2.code).toBe("NOTHING_DELIVERED");
    expect(db.ugc_orders[1].status).toBe("ACCEPTED");
  });
});

// Session 25 — creator self-cancel of a signed UGC order (protected rule 51).
// WHO: the order's creator only. WHEN: before the first draft. No refund; slot relisted at the top;
// counts like a missed deadline except within 1 hour of the timer starting / never signed.
import { describe, it, expect } from "vitest";
import { createUgcLifecycleHandlers, setupUgcOrderRoutes } from "./ugc_routes";
import { createUgcLifecycleService } from "./services/ugcLifecycleService";
import { createCampaignLifecycleHandlers } from "./campaigns_routes";
import {
  cancelUgcOrderByCreator, creatorCancelReasonToken, CREATOR_CANCEL_REASONS,
} from "./services/ugcDeadlineService";
import { computeCreatorStats } from "./creatorStats";

const BRAND = "b0000000-0000-4000-8000-000000000001";
const CREATOR = "c0000000-0000-4000-8000-000000000002";
const STRANGER = "d0000000-0000-4000-8000-000000000003";
const OID = "ugcord_sc_1";
const B = { user_id: BRAND, role: "brand" };
const C = { user_id: CREATOR, role: "creator" };
const S = { user_id: STRANGER, role: "creator" };
const HOUR = 3600000;

/** Order whose 48h timer started `hoursAgo` hours ago. */
function orderAt(hoursAgo: number, extra: any = {}) {
  const start = Date.now() - hoursAgo * HOUR;
  return {
    id: OID, brief_id: "brief_1", brand_id: BRAND, creator_id: CREATOR, status: "ACCEPTED",
    creator_payout: 5000, escrow_amount: 5000, payment_status: "ESCROW_HELD",
    agreement_signed_creator: true, created_at: new Date(start).toISOString(),
    internal_deadline: new Date(start + 48 * HOUR).toISOString(), ...extra,
  };
}

function mk(order: any = orderAt(5), briefExtra: any = {}) {
  const db: any = {
    ugc_briefs: [{ id: "brief_1", brand_id: BRAND, title: "Serum reel", budget: 5000, max_creators: 1, claimed_count: 1, status: "CLAIMED", delivery_hours: 48, relist_count: 0, is_priority: false, ...briefExtra }],
    ugc_orders: [order],
    chat_threads: [{ id: `thread_ugc_${OID}`, deal_id: OID, ugc_order_id: OID, brand_id: BRAND, creator_id: CREATOR, is_ugc: true, status: "ACTIVE", flow_state: "ACTIVE" }],
    users: [{ user_id: BRAND, email: "b@test.com" }, { user_id: CREATOR, email: "c@test.com", missed_deadlines_count: 0 }],
    chat_messages: [], transactions: [], notifications: [], content_submissions: [], campaigns: [], ugc_refunds: [], admin_logs: [],
  };
  let actor: any;
  const getDb = () => db, saveDb = () => {};
  const parseAuthUser = async () => actor;
  const svc = createUgcLifecycleService({ supabase: null, privilegedSupabase: null, getDb, saveDb, getIsoNow: () => new Date().toISOString(), ensureUGCChatThread: async (o: any) => db.chat_threads.find((t: any) => t.deal_id === o.id) || { id: o.id }, insertChatMessageToSupabase: async () => {} } as any);
  const camp = createCampaignLifecycleHandlers({ supabase: null, privilegedSupabase: null, getDb, saveDb, parseAuthUser, insertChatMessageToSupabase: async () => ({}) } as any);
  const h = createUgcLifecycleHandlers({ supabase: null, privilegedSupabase: null, getDb, saveDb, parseAuthUser, syncUgcLifecycleEvent: svc, handleThreadApproveLiveLinks: camp.handleThreadApproveLiveLinks, handleThreadApproveContent: camp.handleThreadApproveContent, handleCampaignRevision: camp.handleCampaignRevision } as any);
  const routes: Record<string, any> = {};
  const router: any = {
    post: (p: any, fn: any) => (Array.isArray(p) ? p : [p]).forEach((x: string) => (routes["POST " + x] = fn)),
    get: (p: any, fn: any) => (Array.isArray(p) ? p : [p]).forEach((x: string) => (routes["GET " + x] = fn)),
  };
  setupUgcOrderRoutes({} as any, router, { handleThreadApproveContent: camp.handleThreadApproveContent, ...h } as any);
  const call = async (key: string, user: any, body: any = {}, id = OID) => {
    actor = user; let status = 200; let json: any;
    const res: any = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; }, setHeader() {} };
    await routes[key]({ params: { id, orderId: id, threadId: id }, body, query: {}, originalUrl: key, app: { get: () => null } }, res);
    return { status, json };
  };
  return { db, call };
}

const CANCEL = "POST /ugc/orders/:id/cancel";

describe("creator self-cancel — who and when", () => {
  it("a stranger cannot cancel", async () => {
    const { db, call } = mk();
    expect((await call(CANCEL, S, { reason: "Not feeling well" })).status).toBe(403);
    expect(db.ugc_orders[0].status).toBe("ACCEPTED");
  });
  it("needs one of the reason chips on a signed order", async () => {
    const { db, call } = mk();
    const r = await call(CANCEL, C, { reason: "whatever" });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("REASON_REQUIRED");
    const o = await call(CANCEL, C, { reason: "Other" });
    expect(o.json.code).toBe("NOTE_REQUIRED");
    expect(db.ugc_orders[0].status).toBe("ACCEPTED");
  });
  it("is refused once a draft was sent", async () => {
    const { db, call } = mk(orderAt(5, { status: "SUBMITTED", video_url: "https://x/v.mp4" }));
    const r = await call(CANCEL, C, { reason: "Not feeling well" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DRAFT_SUBMITTED");
    expect(db.ugc_orders[0].status).toBe("SUBMITTED");
  });
  it("the server accepts exactly the four chips", () => {
    expect([...CREATOR_CANCEL_REASONS]).toEqual(["Not feeling well", "Brief is not what I expected", "Product not received", "Other"]);
  });
});

describe("creator self-cancel — effect", () => {
  it("cancels with no refund, relists the brief at the top and tells the brand", async () => {
    const { db, call } = mk();
    const r = await call(CANCEL, C, { reason: "Product not received" });
    expect(r.status).toBe(200);
    const o = db.ugc_orders[0];
    expect(o.status).toBe("CANCELLED");
    expect(o.expiry_reason).toBe("CREATOR_CANCELLED");
    // No refund: no refund row, escrow untouched, nothing queued.
    expect(o.payment_status).toBe("ESCROW_HELD");
    expect(db.transactions.filter((t: any) => t.refund_amount).length).toBe(0);
    expect(db.ugc_refunds.length).toBe(0);
    // Slot back, relisted at the top.
    const b = db.ugc_briefs[0];
    expect(b.claimed_count).toBe(0);
    expect(b.status).toBe("OPEN");
    expect(b.is_priority).toBe(true);
    expect(b.relist_count).toBe(1);
    // Brand in-app (link stays in the app), chat system message, thread closed.
    const n = db.notifications.find((x: any) => x.user_id === BRAND && x.type === "UGC_CREATOR_STEPPED_AWAY");
    expect(n?.title).toBe("Your creator stepped away — brief back at the top");
    expect(n?.redirect_path).toBe("/brand/ugc");
    expect(db.chat_messages.some((m: any) => m.is_system_message && /cancelled this order/.test(m.text))).toBe(true);
    expect(db.chat_threads[0].flow_state).toBe("CANCELLED");
    // WHO + WHEN.
    const log = db.admin_logs.find((l: any) => l.action === "UGC_CREATOR_CANCELLED");
    expect(log.actor_id).toBe(CREATOR);
    expect(log.created_at).toBeTruthy();
    // Counts like a missed deadline.
    expect(db.users.find((u: any) => u.user_id === CREATOR).missed_deadlines_count).toBe(1);
    expect(r.json.counts_on_profile).toBe(true);
  });
  it("the creator's reason is not shown to the brand", async () => {
    const { db, call } = mk();
    await call(CANCEL, C, { reason: "Other", note: "private family thing" });
    const brandFacing = [...db.notifications.filter((n: any) => n.user_id === BRAND), ...db.chat_messages];
    expect(JSON.stringify(brandFacing)).not.toMatch(/private family thing/);
  });
  it("a second tap is harmless", async () => {
    const { db, call } = mk();
    await call(CANCEL, C, { reason: "Not feeling well" });
    const r2 = await call(CANCEL, C, { reason: "Not feeling well" });
    expect(r2.json.already_cancelled).toBe(true);
    expect(db.ugc_briefs[0].relist_count).toBe(1);
    expect(db.users.find((u: any) => u.user_id === CREATOR).missed_deadlines_count).toBe(1);
  });
  it("on a brief the brand already cancelled, the slot goes to the refund queue instead", async () => {
    const { db, call } = mk(orderAt(5), { status: "PARTIALLY_CANCELLED" });
    const r = await call(CANCEL, C, { reason: "Not feeling well" });
    expect(r.status).toBe(200);
    expect(r.json.relisted).toBe(false);
    expect(db.ugc_refunds.length).toBe(1);
    expect(db.ugc_refunds[0].status).toBe("PENDING");
    expect(db.ugc_refunds[0].amount).toBe(5000);
    expect(db.ugc_briefs[0].is_priority).toBe(false);
  });
});

describe("creator self-cancel — profile", () => {
  it("within 1 hour of the timer starting it does not count", async () => {
    const { db, call } = mk(orderAt(0.5));
    const r = await call(CANCEL, C, { reason: "Brief is not what I expected" });
    expect(r.json.expiry_reason).toBe("CREATOR_CANCELLED_GRACE");
    expect(r.json.counts_on_profile).toBe(false);
    expect(db.users.find((u: any) => u.user_id === CREATOR).missed_deadlines_count).toBe(0);
  });
  it("a never-signed reservation is released without a reason and does not count", async () => {
    const { db, call } = mk(orderAt(10, { agreement_signed_creator: false }));
    const r = await call("POST /ugc/orders/:id/cancel-claim", C, {});
    expect(r.status).toBe(200);
    expect(r.json.expiry_reason).toBe("CREATOR_CANCELLED_UNSIGNED");
    expect(db.users.find((u: any) => u.user_id === CREATOR).missed_deadlines_count).toBe(0);
    expect(db.transactions.filter((t: any) => t.refund_amount).length).toBe(0);
  });
  it("reason tokens", () => {
    const now = Date.now();
    expect(creatorCancelReasonToken(orderAt(0.2), 48, now)).toBe("CREATOR_CANCELLED_GRACE");
    expect(creatorCancelReasonToken(orderAt(2), 48, now)).toBe("CREATOR_CANCELLED");
    expect(creatorCancelReasonToken(orderAt(2, { agreement_signed_creator: null }), 48, now)).toBe("CREATOR_CANCELLED_UNSIGNED");
    // A missing field is not "unsigned".
    expect(creatorCancelReasonToken(orderAt(2, { agreement_signed_creator: undefined }), 48, now)).toBe("CREATOR_CANCELLED");
  });
  it("stats count CREATOR_CANCELLED as late, not the grace cancel", () => {
    const orders = [
      { creator_id: CREATOR, status: "CANCELLED", expiry_reason: "CREATOR_CANCELLED" },
      { creator_id: CREATOR, status: "CANCELLED", expiry_reason: "CREATOR_CANCELLED_GRACE" },
      { creator_id: CREATOR, status: "COMPLETED", internal_deadline: "2026-01-02T00:00:00Z", delivered_at: "2026-01-01T00:00:00Z" },
    ];
    const s = computeCreatorStats(CREATOR, orders, [], true);
    expect(s.on_time_sample).toBe(2);
    expect(s.on_time_pct).toBe(50);
  });
});

describe("creator self-cancel — race with a draft (Supabase guarded write)", () => {
  it("does nothing when the draft landed first", async () => {
    // Minimal fake client: the guarded update matches no row; a fresh read shows the draft.
    const calls: string[] = [];
    const chain = (table: string) => {
      const q: any = { _op: "select" };
      q.select = () => q; q.eq = () => q; q.in = () => q; q.is = () => q;
      q.update = () => { q._op = "update"; calls.push(`update:${table}`); return q; };
      q.maybeSingle = async () => ({ data: table === "ugc_orders" ? { id: OID, status: "SUBMITTED", video_url: "https://x/v.mp4" } : null });
      q.then = (ok: any) => ok({ data: [], error: null });
      return q;
    };
    const client = { from: chain };
    const db: any = { ugc_orders: [], ugc_briefs: [], users: [], notifications: [], chat_messages: [], chat_threads: [] };
    let released = 0;
    const out = await cancelUgcOrderByCreator(
      { supabase: client, privilegedSupabase: client, getDb: () => db, saveDb: () => {}, releaseBriefSlot: async () => { released++; } },
      { order: orderAt(5), user: C, reason: "Not feeling well" }
    );
    expect(out.status).toBe(409);
    expect(out.json.code).toBe("DRAFT_SUBMITTED");
    expect(released).toBe(0);
    expect(calls).toEqual(["update:ugc_orders"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Session 25 — brand cancels ONE order (rule 52, Ravi): only 24h+ after the creator's timer
// started and only while there is no draft. No fee. Money → manual UGC Refunds queue.
// ---------------------------------------------------------------------------------------------
import { brandCanCancelOrderAtMs } from "./services/ugcDeadlineService";

function mkBrand(hoursAgo: number, extra: any = {}, briefExtra: any = {}) {
  const t = mk(orderAt(hoursAgo, extra), briefExtra);
  t.db.brand_refund_accounts = [{ brand_id: BRAND, method_type: "UPI", upi_id: "acme@upi" }];
  return t;
}

describe("brand cancels one order", () => {
  it("is refused in the first 24 hours after the creator claimed", async () => {
    const { db, call } = mkBrand(10);
    const r = await call(CANCEL, B, { reason: "changed plans" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("CANCEL_WITHIN_24H");
    expect(r.json.can_cancel_at).toBeTruthy();
    expect(db.ugc_orders[0].status).toBe("ACCEPTED");
    expect(db.ugc_refunds.length).toBe(0);
  });
  it("is refused after 24 hours when a draft was uploaded", async () => {
    const { db, call } = mkBrand(30, { status: "SUBMITTED", video_url: "https://x/v.mp4" });
    const r = await call(CANCEL, B, {});
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DELIVERED_USE_DISPUTE");
    expect(db.ugc_refunds.length).toBe(0);
  });
  it("after 24 hours with no draft: cancelled, no fee, refund queued, slot removed, creator not blamed", async () => {
    const { db, call } = mkBrand(30);
    const r = await call(CANCEL, B, { reason: "campaign dates moved" });
    expect(r.status).toBe(200);
    const o = db.ugc_orders[0];
    expect(o.status).toBe("CANCELLED");
    expect(o.expiry_reason).toBe("BRAND_CANCELLED");
    // Full amount (no fee), manual queue, never Razorpay.
    expect(db.ugc_refunds.length).toBe(1);
    expect(db.ugc_refunds[0]).toMatchObject({ amount: 5000, status: "PENDING", slots: 1 });
    expect(db.transactions.filter((t: any) => t.refund_amount).length).toBe(0);
    // Slot leaves the brief (refunded, not relisted).
    expect(db.ugc_briefs[0].max_creators).toBe(0);
    expect(db.ugc_briefs[0].is_priority).toBe(false);
    // Creator told, not penalised.
    expect(db.notifications.some((n: any) => n.user_id === CREATOR && n.type === "UGC_ORDER_CANCELLED_BY_BRAND")).toBe(true);
    expect(db.users.find((u: any) => u.user_id === CREATOR).missed_deadlines_count).toBe(0);
    expect(computeCreatorStats(CREATOR, db.ugc_orders, [], true).on_time_sample).toBe(0);
    // WHO + WHEN.
    expect(db.admin_logs.find((l: any) => l.action === "UGC_BRAND_CANCELLED_ORDER")?.actor_id).toBe(BRAND);
  });
  it("needs a refund account first", async () => {
    const { db, call } = mk(orderAt(30));
    const r = await call(CANCEL, B, {});
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("REFUND_ACCOUNT_REQUIRED");
    expect(db.ugc_orders[0].status).toBe("ACCEPTED");
  });
  it("the creator whose order the brand cancelled is not blocked from the brief", async () => {
    const { UGC_NO_RECLAIM_REASONS } = await import("./statusTokens");
    expect(UGC_NO_RECLAIM_REASONS).not.toContain("BRAND_CANCELLED");
    expect(UGC_NO_RECLAIM_REASONS).toContain("CREATOR_CANCELLED");
  });
  it("cancel time is 24h after the timer started (48h brief)", () => {
    const o = orderAt(0);
    const at = brandCanCancelOrderAtMs(o, 48)!;
    expect(Math.round((at - Date.parse(o.created_at)) / HOUR)).toBe(24);
  });
});

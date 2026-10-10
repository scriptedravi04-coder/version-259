import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { runUgcDeadlineChecks, PRE_DRAFT_STATUSES, escapeHtml } from "./services/ugcDeadlineService";
import { scrubSecrets, loginLockedFor, recordLoginFailure, _resetLoginBuckets, LOGIN_MAX_FAILS, newSessionToken, escapeLike, pickLoginUser } from "./authSecurity";

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");

describe("security review of v204 (session 24)", () => {
  it("no master password, no seeded admins, no Supabase-Auth login fallback", () => {
    const all = ["auth_routes.ts", "server.ts"].map(read).join("\n");
    expect(all).not.toContain("123456789");
    expect(all).not.toContain("recognizedAdmins");
    expect(all).not.toContain("ADMIN_DEFAULT_BCRYPT");
    expect(all).not.toContain("signInWithPassword");
    expect(read("auth_routes.ts")).not.toContain("plain_passwords registry");
  });
  it("local db ships without admin seeds or saved passwords", () => {
    const db = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "db_mock.json"), "utf8"));
    expect(Object.keys(db.user_plain_passwords || {})).toEqual([]);
    expect((db.users || []).some((u: any) => String(u.user_id).startsWith("user_admin_"))).toBe(false);
  });
  it("login: strong tokens, exact email, lockout after repeated failures", () => {
    expect(newSessionToken()).toMatch(/^token_[0-9a-f]{64}$/);
    expect(escapeLike("a%b_c")).toBe("a\\%b\\_c");
    expect(pickLoginUser([{ email: "x@y.in" }, { email: "X@Y.in", password_hash: "h" }], "x@y.in").password_hash).toBe("h");
    _resetLoginBuckets();
    for (let i = 0; i < LOGIN_MAX_FAILS; i++) recordLoginFailure("k");
    expect(loginLockedFor("k")).toBeGreaterThan(0);
  });
  it("API answers never carry passwords (copy, not mutation)", () => {
    const row = { user_id: "u", password_hash: "h", nested: [{ password: "p", ok: 1 }] };
    const out = scrubSecrets(row);
    expect(out).toEqual({ user_id: "u", nested: [{ ok: 1 }] });
    expect(row.password_hash).toBe("h");
  });
  it("market-intelligence needs sign-in; search/audit are admin-only", () => {
    const s = read("market_intelligence_routes.ts");
    expect(s).toContain('router.use("/market-intelligence"');
    expect(s).toContain("/market-intelligence/kyc-grounded-audit");
  });
});

describe("deadline system review (session 24)", () => {
  const H = 3600e3;
  const base = (now: number, over: any = {}) => ({
    ugc_orders: [{ id: "o1", brief_id: "b1", brand_id: "br", creator_id: "c1", status: "ACCEPTED", created_at: new Date(now - 7 * H).toISOString(), internal_deadline: new Date(now + 17 * H).toISOString(), ...over.order }],
    ugc_briefs: [{ id: "b1", brand_id: "br", title: "T", budget: 2000, max_creators: 2, status: "OPEN", ...over.brief }],
    users: [], notifications: [], ugc_refunds: [], brand_refund_accounts: [],
  });
  const deps = (db: any, now: number) => ({ supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {}, releaseBriefSlot: async () => {}, now: () => new Date(now) });

  it("quiet hours: the reminder is NOT counted, so the 8 am run sends it", async () => {
    const night = Date.parse("2026-09-27T18:30:00Z"); // 00:00 IST
    const db = base(night);
    await runUgcDeadlineChecks(deps(db, night) as any);
    expect(db.ugc_orders[0].reminders_sent || 0).toBe(0);
    const morning = Date.parse("2026-09-28T03:00:00Z"); // 08:30 IST, still before deadline
    db.ugc_orders[0].internal_deadline = new Date(morning + 5 * H).toISOString();
    await runUgcDeadlineChecks(deps(db, morning) as any);
    expect(db.ugc_orders[0].reminders_sent).toBe(1);
  });

  it("an expired slot on a cancelled brief goes to the refund queue, not back to creators", async () => {
    const now = Date.parse("2026-09-28T06:00:00Z");
    const db = base(now, { order: { internal_deadline: new Date(now - H).toISOString() }, brief: { status: "PARTIALLY_CANCELLED", max_creators: 1 } });
    await runUgcDeadlineChecks(deps(db, now) as any);
    expect(db.ugc_orders[0].status).toBe("EXPIRED");
    expect(db.ugc_refunds).toHaveLength(1);
    expect(db.ugc_refunds[0]).toMatchObject({ amount: 2000, slots: 1, status: "PENDING" });
    expect(db.ugc_briefs[0].is_priority).toBeFalsy();
    await runUgcDeadlineChecks(deps(db, now) as any);
    expect(db.ugc_refunds).toHaveLength(1); // idempotent
  });

  it("expiry only touches orders still waiting for a first draft; emails escape user text", () => {
    const s = read("services/ugcDeadlineService.ts");
    expect(s).toContain('.in("status", PRE_DRAFT_STATUSES)');
    expect(s).toContain('.is("video_url", null)');
    expect(PRE_DRAFT_STATUSES).toContain("ACCEPTED");
    expect(PRE_DRAFT_STATUSES).not.toContain("SUBMITTED");
    expect(escapeHtml('<b>"x"</b>')).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    expect(s).not.toContain("commonuseforpro@gmail.com");
  });

  it("cancel/refund routes: lock, conditional brief update, refund saved first, pending-only admin actions", () => {
    const s = read("ugc_routes.ts");
    expect(s).toContain("briefCancelLocks.has(id)");
    expect(s).toContain('code: "REFUND_NOT_SAVED"');
    expect(s).toContain('code: "BRIEF_CHANGED"');
    expect(s).toContain("computeBriefCancelQuote(brief)");
    expect(s).toContain('router.get("/ugc/briefs/:id/cancel-quote"');
    expect(s).toContain(".eq('status', 'PENDING')");
    expect(s).toContain("The brand hasn't added a refund account yet");
    expect(s).toContain('Only brands have a refund account.');
    expect(s).not.toContain('app.post("/internal/cron/ugc-deadlines"');
    expect(fs.readFileSync(path.join(__dirname, "..", "scripts/sql/ugc_deadlines_relist_refunds.sql"), "utf8")).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_refund_accounts_brand_id");
  });
});

describe("strict rule: no order without an OTP signature; timer starts at signing (Ravi)", () => {
  const s = read("ugc_routes.ts");
  it("claim needs the OTP sign token and sets the deadline at claim time", () => {
    const i = s.indexOf("const handleUgcBriefClaim");
    const body = s.slice(i, i + 9000);
    expect(body).toContain("consumeSignToken(user.user_id, req.body?.sign_token)");
    expect(body).toContain("agreement_signed_creator: true");
    expect(body).toContain("internal_deadline: new Date(Date.now() + normalizeDeliveryHours(brief.delivery_hours, 24)");
  });
  it("the legacy accept path can no longer hand over an order without signing", () => {
    expect(s).toContain('code: "CLAIM_WITH_SIGNATURE"');
  });
  it("signing an old unsigned reservation checks KYC and starts the timer then", () => {
    expect(s).toContain("internal_deadline: signedDeadline");
    expect(s).toContain("Complete your KYC to sign and start this order.");
  });
});

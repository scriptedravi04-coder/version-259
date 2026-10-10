import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { resolveKycStatus, getCreatorKycStatus } from "./creatorKyc";
import { normalizeDeliveryHours, isMissingColumnError, isBriefFullyDelivered, UGC_REVISION_LIMIT } from "./ugcTerms";
import { computeCreatorStats } from "./creatorStats";

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");

describe("creator KYC (session 24)", () => {
  it("approved only by the admin's KYC decision; onboarding auto-rows don't count", () => {
    expect(resolveKycStatus({ status: "APPROVED" }, [])).toBe("APPROVED");
    expect(resolveKycStatus(null, [{ status: "approved", note: "Auto-submitted during onboarding" }])).toBe("NONE");
    expect(resolveKycStatus(null, [{ status: "approved", documents: ["Onboarding Profile"] }])).toBe("NONE");
    expect(resolveKycStatus(null, [{ status: "approved", documents: { pan: "x" } }])).toBe("APPROVED");
    expect(resolveKycStatus({ status: "PENDING" }, [])).toBe("PENDING");
    expect(resolveKycStatus({ status: "rejected" }, [])).toBe("REJECTED");
    expect(resolveKycStatus(null, [])).toBe("NONE");
  });
  it("reads creator_kyc by creator_id and reports UNKNOWN when the lookup fails", async () => {
    const calls: string[] = [];
    const ok = {
      from: (t: string) => ({
        select: () => ({
          eq: (col: string) => { calls.push(`${t}.${col}`); return t === "creator_kyc"
            ? { maybeSingle: async () => ({ data: { status: "APPROVED" }, error: null }) }
            : { order: async () => ({ data: [], error: null }) }; },
        }),
      }),
    };
    expect(await getCreatorKycStatus(ok, {}, "c1")).toBe("APPROVED");
    expect(calls).toContain("creator_kyc.creator_id");
    const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "down" } }) }) }) }) };
    expect(await getCreatorKycStatus(broken, {}, "c1")).toBe("UNKNOWN");
  });
  it("UGC claim checks KYC before the OTP token is used and before a slot is reserved", () => {
    const s = read("ugc_routes.ts");
    const kyc = s.indexOf("getCreatorKycStatus(privilegedSupabase || supabase, db, user.user_id)");
    const token = s.indexOf("consumeSignToken(user.user_id, req.body?.sign_token)");
    const slot = s.indexOf("await reserveBriefSlot(brief, user.user_id)");
    expect(kyc).toBeGreaterThan(0);
    expect(kyc).toBeLessThan(token);
    expect(kyc).toBeLessThan(slot);
    expect(s).toContain("code: 'KYC_REQUIRED'");
    expect(s).toContain("code: 'KYC_CHECK_FAILED'");
  });
  it("campaign KYC gate no longer reads creator_kyc by user_id or trusts users.verified", () => {
    const s = read("server.ts");
    const a = s.indexOf("async function isCreatorKycVerified");
    const body = s.slice(a, a + 800);
    expect(body).toContain("getCreatorKycStatus(");
    expect(body).not.toContain(".eq('user_id', id)");
  });
});

describe("UGC terms (session 24)", () => {
  it("delivery hours: 24/48/72 only, default 48, old briefs 24", () => {
    expect(normalizeDeliveryHours(72)).toBe(72);
    expect(normalizeDeliveryHours("24")).toBe(24);
    expect(normalizeDeliveryHours(12)).toBe(48);
    expect(normalizeDeliveryHours(undefined, 24)).toBe(24);
  });
  it("claim uses the brief's hours and the 3-revision rule; brief insert survives a missing column", () => {
    const s = read("ugc_routes.ts");
    expect(s).toContain("normalizeDeliveryHours(brief.delivery_hours, 24) * 3600 * 1000");
    expect(s).toContain("revision_count: UGC_REVISION_LIMIT");
    expect(s).not.toMatch(/revision_count: 5,/);
    expect(s).toContain("isMissingColumnError(error, 'delivery_hours')");
    expect(UGC_REVISION_LIMIT).toBe(3);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'delivery_hours' column" }, "delivery_hours")).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" }, "delivery_hours")).toBe(false);
  });
  it("a brief is complete only when every slot is delivered", () => {
    expect(isBriefFullyDelivered(1, 2)).toBe(false);
    expect(isBriefFullyDelivered(2, 2)).toBe(true);
    expect(isBriefFullyDelivered(1, undefined)).toBe(true);
    expect(read("ugc_routes.ts")).toContain("isBriefFullyDelivered(doneCount, b.max_creators)");
  });
});

describe("creator stats (session 24)", () => {
  const now = Date.parse("2026-09-01T00:00:00Z");
  const iso = (h: number) => new Date(now + h * 3600e3).toISOString();
  it("real numbers only; nothing to base it on → null", () => {
    const empty = computeCreatorStats("c1", [], [], true);
    expect(empty).toMatchObject({ completed_orders: 0, on_time_pct: null, rating_avg: null, rating_count: 0, kyc_verified: true });
  });
  it("on-time uses first drafts only; expired counts late; ratings from others only", () => {
    const orders = [
      { id: "1", creator_id: "c1", status: "COMPLETED", internal_deadline: iso(24), delivered_at: iso(10), revisions_used: 0 },
      { id: "2", creator_id: "c1", status: "COMPLETED", internal_deadline: iso(24), delivered_at: iso(30), revisions_used: 0 },
      { id: "3", creator_id: "c1", status: "COMPLETED", internal_deadline: iso(24), delivered_at: iso(40), revisions_used: 1 },
      { id: "4", creator_id: "c1", status: "EXPIRED" },
      { id: "5", creator_id: "other", status: "COMPLETED", internal_deadline: iso(24), delivered_at: iso(1) },
    ];
    const reviews = [{ target_id: "c1", reviewer_id: "b1", rating: 5 }, { target_id: "c1", reviewer_id: "b2", rating: 4 }, { target_id: "c1", reviewer_id: "c1", rating: 1 }];
    const s = computeCreatorStats("c1", orders, reviews, false);
    expect(s.completed_orders).toBe(3);
    expect(s.on_time_sample).toBe(3); // #1, #2, #4 (expired); #3 skipped (revised)
    expect(s.on_time_pct).toBe(33);
    expect(s.rating_avg).toBe(4.5);
    expect(s.rating_count).toBe(2);
  });
});

describe("notifications + referral (session 24)", () => {
  it("mark read / ack only for the owner, with a safe id", () => {
    const s = read("tags_notifications_routes.ts");
    expect((s.match(/\.in\("user_id", owners\)/g) || []).length).toBe(2);
    expect((s.match(/SAFE_NOTIF_ID\.test/g) || []).length).toBe(2);
  });
  it("signup accepts the code every Refer screen shows (YBEX- + 8 id chars)", () => {
    const s = read("auth_routes.ts");
    expect((s.match(/replace\(\/-\/g, ""\)\.slice\(0, 8\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

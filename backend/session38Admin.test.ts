// Session 38 (Ravi: "PHELE YE SAB THEEK KRO") — admin audit fixes.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  isPaidOut, isRefunded, isEscrowHeld, isPayoutRequested, payoutReleaseBlock, refundBlock,
  pickPayoutAccount, fetchAllRows,
} from "./adminMoney";
import { requiredAdminPermission, isSubAdmin, adminPermissionGate } from "./adminPermissions";
import { pickMarkupSettings, createPlatformSettingsStore, DEFAULT_PLATFORM_SETTINGS } from "./platformSettings";

const read = (f: string) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

describe("money rules", () => {
  it("paid out / refunded / held", () => {
    expect(isPaidOut({ payout_status: "PAID" })).toBe(true);
    expect(isPaidOut({ payout_status: "PROCESSING", payout_reference: "UTR1" })).toBe(true);
    expect(isPaidOut({ payout_status: "PROCESSING" })).toBe(false);
    expect(isRefunded({ status: "REFUNDED" })).toBe(true);
    expect(isRefunded({ refund_status: "PROCESSED" })).toBe(true);
    expect(isEscrowHeld({ status: "SUCCESS" })).toBe(true);
    // a released payout keeps status SUCCESS — must no longer count as held
    expect(isEscrowHeld({ status: "SUCCESS", payout_status: "PAID", payout_reference: "U" })).toBe(false);
    expect(isEscrowHeld({ status: "REFUNDED" })).toBe(false);
  });
  it("payout requests: PROCESSING or the chat nudge, while unpaid", () => {
    expect(isPayoutRequested({ payout_status: "PROCESSING" })).toBe(true);
    expect(isPayoutRequested({ payout_requested: true })).toBe(true);
    expect(isPayoutRequested({ payout_requested: true, payout_status: "PAID" })).toBe(false);
    expect(isPayoutRequested({ payout_status: "PENDING" })).toBe(false);
  });
  it("no second payout, no payout of refunded money", () => {
    expect(payoutReleaseBlock(null)).toBeNull();
    expect(payoutReleaseBlock({ status: "SUCCESS", payout_status: "PROCESSING" })).toBeNull();
    expect(payoutReleaseBlock({ payout_status: "PAID", payout_reference: "X" })?.code).toBe("ALREADY_PAID");
    expect(payoutReleaseBlock({ status: "REFUNDED" })?.code).toBe("ALREADY_REFUNDED");
  });
  it("refund never above what was paid, never after payout, never twice", () => {
    expect(refundBlock({ status: "SUCCESS", gross_amount: 1000 }, 1000, "PROCESSED")).toBeNull();
    expect(refundBlock({ status: "SUCCESS", gross_amount: 1000 }, 1500, "PROCESSED")?.code).toBe("REFUND_TOO_HIGH");
    expect(refundBlock({ status: "SUCCESS", payout_status: "PAID" }, 10, "PROCESSED")?.code).toBe("ALREADY_PAID_OUT");
    expect(refundBlock({ status: "REFUNDED" }, 10, "PROCESSED")?.code).toBe("ALREADY_REFUNDED");
  });
  it("the creator's saved payout method wins, one destination only", () => {
    const acc = pickPayoutAccount({ upi_id: "a@okhdfc" }, { bank_account_number: "123456789012", bank_ifsc: "HDFC0001234" }, null)!;
    expect(acc.upi_id).toBe("a@okhdfc");
    expect(acc.account_number).toBeNull();
    const bank = pickPayoutAccount({ bank_account_number: "123456789012", bank_ifsc: "HDFC0001234", account_holder_name: "R" }, null, null)!;
    expect(bank.account_number).toBe("123456789012");
    expect(bank.upi_id).toBeNull();
    expect(pickPayoutAccount(null, null, { upi_id: "k@ybl" })!.upi_id).toBe("k@ybl");
    expect(pickPayoutAccount(null, null, null)).toBeNull();
  });
  it("fetchAllRows reads past 1000 rows", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const { data } = await fetchAllRows(async (f, t) => ({ data: all.slice(f, t + 1), error: null }));
    expect(data.length).toBe(2500);
  });
});

describe("sub-admin permission gate", () => {
  it("maps areas to permissions", () => {
    expect(requiredAdminPermission("POST", "/admin/escrow/d1/release-payout")).toBe("manage_escrow");
    expect(requiredAdminPermission("POST", "/admin/transactions/t/refund")).toBe("manage_escrow");
    expect(requiredAdminPermission("GET", "/admin/stats")).toBeNull();
    expect(requiredAdminPermission("POST", "/admin/users/u/ban")).toBe("manage_users");
    expect(requiredAdminPermission("GET", "/admin/something-new")).toBeNull();
    expect(requiredAdminPermission("POST", "/admin/something-new")).toBe("__full_admin_only__");
    expect(requiredAdminPermission("GET", "/creators")).toBeNull();
  });
  it("who is a sub-admin", () => {
    expect(isSubAdmin({ role: "sub_admin" })).toBe(true);
    expect(isSubAdmin({ role: "admin", team_role: "sub_admin" })).toBe(true);
    expect(isSubAdmin({ role: "admin" })).toBe(false);
    expect(isSubAdmin({ role: "brand", team_role: "admin" })).toBe(false);
  });
  const run = async (user: any, perms: string[], method: string, p: string) => {
    const gate = adminPermissionGate({ parseAuthUser: async () => user, checkAdminPerm: async (_u, perm) => perms.includes(perm) });
    const res: any = { code: 0, status(c: number) { this.code = c; return this; }, json() { return this; } };
    const next = vi.fn();
    await gate({ path: p, method }, res, next);
    return { passed: next.mock.calls.length === 1, code: res.code };
  };
  it("full admin passes, sub-admin needs the permission", async () => {
    expect((await run({ role: "admin" }, [], "POST", "/admin/escrow/x/release-payout")).passed).toBe(true);
    expect((await run({ role: "admin", team_role: "sub_admin" }, [], "POST", "/admin/escrow/x/release-payout")).code).toBe(403);
    expect((await run({ role: "sub_admin" }, ["manage_escrow"], "POST", "/admin/escrow/x/release-payout")).passed).toBe(true);
    expect((await run({ role: "sub_admin" }, ["manage_escrow"], "POST", "/admin/new-thing")).code).toBe(403);
    expect((await run({ role: "creator" }, [], "POST", "/admin/escrow/x/release-payout")).passed).toBe(true); // route refuses it
  });
  it("is registered before the route files", () => {
    const s = read("backend/server.ts");
    expect(s.indexOf("router.use(adminPermissionGate(")).toBeGreaterThan(0);
    expect(s.indexOf("router.use(adminPermissionGate(")).toBeLessThan(s.indexOf("setupPaymentRoutes(app, router"));
  });
});

describe("markup settings in Supabase", () => {
  it("only valid numbers, clamped", () => {
    expect(pickMarkupSettings({ brand_markup_pct: "3", agency_markup_pct: 90, x: 1, creator_deduction_pct: "abc" }))
      .toEqual({ brand_markup_pct: 3, agency_markup_pct: 50 });
  });
  it("cloud values win over the local file, defaults fill the rest", async () => {
    const row = { brand_markup_pct: 4 };
    const client = { from: () => ({ select: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) };
    const store = createPlatformSettingsStore({ getClient: () => client });
    expect(store.get({ brand_markup_pct: 2 }).brand_markup_pct).toBe(2);
    await store.refresh();
    const s = store.get({ brand_markup_pct: 2 });
    expect(s.brand_markup_pct).toBe(4);
    expect(s.agency_markup_pct).toBe(DEFAULT_PLATFORM_SETTINGS.agency_markup_pct);
  });
  it("migration adds the columns", () => {
    expect(read("scripts/sql/session38.sql")).toContain("add column if not exists brand_markup_pct");
  });
});

describe("no fake data, no fake switches", () => {
  it("the shipped local store is empty", () => {
    const db = JSON.parse(read("db_mock.json"));
    for (const [k, v] of Object.entries(db)) {
      if (Array.isArray(v)) expect(v.length, k).toBe(0);
    }
  });
  it("a fresh store gets no seed users or seed chat violations", () => {
    const s = read("backend/server.ts");
    expect(s).not.toContain('"user_violator_creator"');
    expect(s).not.toContain('id: "v_seed_1"');
    expect(s).not.toContain('auth_method: "seed"');
  });
  it("the AI auto-moderation switch is gone", () => {
    const s = read("src/components/admin/CampaignReviewQueue.jsx");
    expect(s).not.toContain("toggleAiReview");
    expect(s).not.toContain("ai_review_enabled");
  });
  it("applicants without a photo get initials, not a stock photo", () => {
    expect(read("src/components/campaigns/ApplicantCard.jsx")).not.toContain("unsplash");
    expect(read("src/components/campaigns/mobile/BrandCampaignDetailMobile.jsx")).not.toContain("photo-1534528741775");
  });
});

describe("KYC approve", () => {
  const s = read("backend/admin_kyc_verification_routes.ts");
  const approve = s.slice(s.indexOf('"/admin/verifications/:verification_id/approve"'), s.indexOf('"/admin/verifications/:verification_id/reject"'));
  it("updates only this request and reports save errors", () => {
    expect(approve).not.toContain("user_id.eq.${target_user}`)");
    expect(approve).toContain(".eq('verification_id', v.verification_id)");
    expect(approve).toContain("KYC_APPROVE_SAVE_FAILED");
  });
});

describe("pending counts", () => {
  const s = read("backend/admin_system_maintenance_routes.ts");
  it("help desk counts the statuses tickets really use; money work is counted", () => {
    expect(s).toContain("'OPEN', 'IN PROGRESS'");
    expect(s).toContain("payout_requests: payoutRequests");
    expect(s).toContain("ugc_refunds: ugcRefunds");
    expect(s).toContain("referral_withdrawals: referralWithdrawals");
  });
});

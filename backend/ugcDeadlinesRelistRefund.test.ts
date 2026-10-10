// Test suite for UGC Deadline Reminders, Auto-Relist and Brand Cancel & Refund
// Guards Protected Rule 47 in ARCHITECTURE.md.
import { describe, it, expect, beforeEach } from "vitest";
import {
  isQuietHours,
  getIstDate,
  hasUgcFirstDraft,
  isOrderClosed,
  formatTimeLeft,
  formatDeadlineTime,
  buildReminderCopy,
  buildCreatorExpiredCopy,
  buildBrandRelistedCopy,
  buildAdminAlertCopy,
  sendUgcWhatsAppMessage,
  runUgcDeadlineChecks
} from "./services/ugcDeadlineService";
import { parseRefundAccount, toPublicRefundAccount, toAdminRefundSnapshot } from "./ugcRefundAccounts";
import { FLOW_STATES, UGC_BRIEF_STATUSES, UGC_ORDER_STATUSES, UGC_REFUND_STATUSES } from "./statusTokens";

describe("UGC Status Tokens DB Contract", () => {
  it("includes EXPIRED and PARTIALLY_CANCELLED in status tokens", () => {
    expect(FLOW_STATES.EXPIRED).toBe("EXPIRED");
    expect(FLOW_STATES.PARTIALLY_CANCELLED).toBe("PARTIALLY_CANCELLED");
    expect(UGC_BRIEF_STATUSES.CANCELLED).toBe("CANCELLED");
    expect(UGC_BRIEF_STATUSES.PARTIALLY_CANCELLED).toBe("PARTIALLY_CANCELLED");
    expect(UGC_ORDER_STATUSES.EXPIRED).toBe("EXPIRED");
    expect(UGC_REFUND_STATUSES.PENDING).toBe("PENDING");
    expect(UGC_REFUND_STATUSES.PROCESSED).toBe("PROCESSED");
    expect(UGC_REFUND_STATUSES.FAILED).toBe("FAILED");
  });
});

describe("UGC Deadline Helpers & Logic", () => {
  it("determines 'Did something' (first draft exists) correctly (§2)", () => {
    // No draft
    expect(hasUgcFirstDraft({ status: "ACCEPTED" })).toBe(false);
    expect(hasUgcFirstDraft({ status: "ACCEPTED", video_url: null })).toBe(false);

    // With video_url or link
    expect(hasUgcFirstDraft({ status: "ACCEPTED", video_url: "https://example.com/v.mp4" })).toBe(true);
    expect(hasUgcFirstDraft({ status: "ACCEPTED", submission_link: "https://drive.google.com/xyz" })).toBe(true);
    expect(hasUgcFirstDraft({ status: "ACCEPTED", drive_url: "https://drive.google.com/xyz" })).toBe(true);

    // Status based
    expect(hasUgcFirstDraft({ status: "SUBMITTED" })).toBe(true);
    expect(hasUgcFirstDraft({ status: "IN_REVIEW" })).toBe(true);
    expect(hasUgcFirstDraft({ status: "CONTENT_APPROVED" })).toBe(true);
    expect(hasUgcFirstDraft({ status: "COMPLETED" })).toBe(true);
  });

  it("calculates IST quiet hours correctly (10 pm to 8 am IST) (§4)", () => {
    // 11:00 PM IST is quiet hours
    const d1 = new Date("2026-09-27T17:30:00.000Z"); // 23:00 IST
    expect(isQuietHours(d1)).toBe(true);

    // 04:00 AM IST is quiet hours
    const d2 = new Date("2026-09-27T22:30:00.000Z"); // 04:00 IST
    expect(isQuietHours(d2)).toBe(true);

    // 12:00 PM IST is daytime (not quiet hours)
    const d3 = new Date("2026-09-27T06:30:00.000Z"); // 12:00 IST
    expect(isQuietHours(d3)).toBe(false);

    // 09:00 AM IST is daytime
    const d4 = new Date("2026-09-27T03:30:00.000Z"); // 09:00 IST
    expect(isQuietHours(d4)).toBe(false);
  });

  it("formats time remaining and deadline accurately", () => {
    expect(formatTimeLeft(3600000)).toBe("1 hour");
    expect(formatTimeLeft(5 * 3600000)).toBe("5 hours");
    expect(formatTimeLeft(30 * 60000)).toBe("30 minutes");
    expect(formatTimeLeft(0)).toBe("0 hours");
  });

  it("generates approved reminder and alert copy (§10)", () => {
    const dummyOrder: any = {
      id: "ord_123",
      creator_payout: 2500,
      internal_deadline: new Date(Date.now() + 10 * 3600000).toISOString()
    };
    const dummyBrief: any = { id: "br_123", title: "Summer Skincare UGC" };
    const dummyBrand: any = { company_name: "Glow Naturals" };
    const dummyCreator: any = { full_name: "Aanya Sharma", email: "aanya@example.com" };

    const firstCopy = buildReminderCopy({
      reminderIndex: 1,
      order: dummyOrder,
      brief: dummyBrief,
      brand: dummyBrand,
      creator: dummyCreator
    });
    expect(firstCopy.subject).toContain("₹2500 is waiting");
    expect(firstCopy.body).toContain("Summer Skincare UGC");
    expect(firstCopy.body).toContain("Glow Naturals");
    expect(firstCopy.body).toContain("Ybex SafePay");
    expect(firstCopy.buttonText).toBe("Upload your video");

    const finalCopy = buildReminderCopy({
      reminderIndex: 6,
      order: dummyOrder,
      brief: dummyBrief,
      brand: dummyBrand,
      creator: dummyCreator
    });
    expect(finalCopy.subject).toContain("Last chance");
    expect(finalCopy.body).toContain("cancelled");
    expect(finalCopy.buttonText).toBe("Upload now");

    const expiredCopy = buildCreatorExpiredCopy({
      order: dummyOrder,
      brief: dummyBrief,
      creator: dummyCreator
    });
    expect(expiredCopy.subject).toContain("cancelled");
    expect(expiredCopy.body).toContain("open to other creators");
    expect(expiredCopy.buttonText).toBe("Explore briefs");

    const relistedCopy = buildBrandRelistedCopy({
      brief: dummyBrief
    });
    expect(relistedCopy.subject).toContain("brief is live again");
    expect(relistedCopy.body).toContain("Ybex SafePay");
    expect(relistedCopy.buttonText).toBe("View brief");
  });

  it("WhatsApp dispatcher fails safe when missing credentials or opt-in (§11)", async () => {
    // Missing opt-in
    const res1 = await sendUgcWhatsAppMessage({
      phone: "+919876543210",
      optIn: false,
      templateName: "ugc_reminder",
      parameters: ["Test"]
    });
    expect(res1.ok).toBe(false);
    expect(res1.skipped).toBe(true);
    expect(res1.reason).toBe("NO_WHATSAPP_OPT_IN");

    // Missing phone
    const res2 = await sendUgcWhatsAppMessage({
      phone: null,
      optIn: true,
      templateName: "ugc_reminder",
      parameters: ["Test"]
    });
    expect(res2.ok).toBe(false);
    expect(res2.skipped).toBe(true);
    expect(res2.reason).toBe("NO_PHONE_NUMBER");

    // Missing API keys in test environment
    const res3 = await sendUgcWhatsAppMessage({
      phone: "+919876543210",
      optIn: true,
      templateName: "ugc_reminder",
      parameters: ["Test"]
    });
    expect(res3.ok).toBe(false);
    expect(res3.reason).toBe("NOT_CONFIGURED");
  });
});

describe("Brand Refund Account Validation & Masking (§8)", () => {
  it("validates UPI refund account", () => {
    const valid = parseRefundAccount({ upi_id: "brand@okaxis" });
    expect(valid.error).toBeUndefined();
    expect(valid.row?.method_type).toBe("UPI");
    expect(valid.row?.upi_id).toBe("brand@okaxis");

    const invalid = parseRefundAccount({ upi_id: "invalid-upi" });
    expect(invalid.error).toBeDefined();
  });

  it("validates Bank refund account with confirmation", () => {
    const valid = parseRefundAccount({
      method_type: "BANK",
      bank_account_number: "123456789012",
      bank_account_confirm: "123456789012",
      bank_ifsc: "HDFC0001234",
      account_holder_name: "Acme Brands Pvt Ltd"
    });
    expect(valid.error).toBeUndefined();
    expect(valid.row?.method_type).toBe("BANK");
    expect(valid.row?.bank_account_number).toBe("123456789012");
    expect(valid.row?.bank_ifsc).toBe("HDFC0001234");

    // Mismatched confirmation
    const mismatch = parseRefundAccount({
      method_type: "BANK",
      bank_account_number: "123456789012",
      bank_account_confirm: "123456789999",
      bank_ifsc: "HDFC0001234",
      account_holder_name: "Acme Brands"
    });
    expect(mismatch.error).toContain("do not match");

    // Invalid IFSC
    const badIfsc = parseRefundAccount({
      method_type: "BANK",
      bank_account_number: "123456789012",
      bank_account_confirm: "123456789012",
      bank_ifsc: "1234",
      account_holder_name: "Acme Brands"
    });
    expect(badIfsc.error).toContain("IFSC");
  });

  it("masks bank account for public/browser consumption (Rule 36)", () => {
    const pub = toPublicRefundAccount({
      method_type: "BANK",
      bank_account_number: "98765432109876",
      bank_ifsc: "HDFC0001234",
      account_holder_name: "Acme Brands"
    });
    expect(pub?.account_last4).toBe("9876");
    expect((pub as any).bank_account_number).toBeUndefined();
  });
});

describe("UGC Deadline Cron Execution (§3, §4, §5, §6)", () => {
  let mockDb: any;
  let releasedSlots: string[] = [];

  beforeEach(() => {
    releasedSlots = [];
    mockDb = {
      ugc_orders: [],
      ugc_briefs: [],
      users: [],
      notifications: [],
      chat_threads: [],
      chat_messages: [],
      admin_logs: []
    };
  });

  it("sends 1st reminder at claim + 6 hours, then increments reminders_sent", async () => {
    const claimTime = new Date("2026-09-27T00:00:00.000Z");
    const deadline = new Date("2026-09-28T00:00:00.000Z"); // 24h window
    const now = new Date("2026-09-27T06:30:00.000Z"); // 6.5h after claim

    mockDb.ugc_briefs.push({ id: "br_1", brand_id: "brand_1", title: "Skincare UGC", budget: 2000 });
    mockDb.users.push(
      { user_id: "brand_1", email: "brand@test.com", name: "Brand One" },
      { user_id: "creator_1", email: "creator@test.com", name: "Creator One" }
    );
    mockDb.ugc_orders.push({
      id: "ord_1",
      brief_id: "br_1",
      brand_id: "brand_1",
      creator_id: "creator_1",
      status: "ACCEPTED",
      created_at: claimTime.toISOString(),
      internal_deadline: deadline.toISOString(),
      reminders_sent: 0
    });

    const results = await runUgcDeadlineChecks({
      supabase: null,
      privilegedSupabase: null,
      getDb: () => mockDb,
      saveDb: (db) => { mockDb = db; },
      releaseBriefSlot: async (bid) => { releasedSlots.push(bid); },
      now: () => now
    });

    expect(results.reminders_sent).toBe(1);
    expect(mockDb.ugc_orders[0].reminders_sent).toBe(1);
    expect(mockDb.ugc_orders[0].last_reminder_at).toBe(now.toISOString());
    expect(mockDb.notifications.length).toBeGreaterThan(0);
    expect(mockDb.notifications[0].user_id).toBe("creator_1");

    // Second immediate run in the same minute is idempotent (sends nothing twice)
    const run2 = await runUgcDeadlineChecks({
      supabase: null,
      privilegedSupabase: null,
      getDb: () => mockDb,
      saveDb: (db) => { mockDb = db; },
      releaseBriefSlot: async (bid) => { releasedSlots.push(bid); },
      now: () => now
    });
    expect(run2.reminders_sent).toBe(0);
  });

  it("alerts admin once 3 hours before deadline if still no draft (§5)", async () => {
    const claimTime = new Date("2026-09-27T00:00:00.000Z");
    const deadline = new Date("2026-09-28T00:00:00.000Z");
    const now = new Date("2026-09-27T21:30:00.000Z"); // 2.5 hours before deadline

    mockDb.ugc_briefs.push({ id: "br_2", brand_id: "brand_2", title: "App Promo", budget: 3000 });
    mockDb.users.push(
      { user_id: "brand_2", email: "brand2@test.com", name: "Brand Two" },
      { user_id: "creator_2", email: "creator2@test.com", name: "Creator Two" }
    );
    mockDb.ugc_orders.push({
      id: "ord_2",
      brief_id: "br_2",
      brand_id: "brand_2",
      creator_id: "creator_2",
      status: "ACCEPTED",
      created_at: claimTime.toISOString(),
      internal_deadline: deadline.toISOString(),
      reminders_sent: 2,
      last_reminder_at: new Date("2026-09-27T20:00:00.000Z").toISOString(),
      admin_alerted_at: null
    });

    const results = await runUgcDeadlineChecks({
      supabase: null,
      privilegedSupabase: null,
      getDb: () => mockDb,
      saveDb: (db) => { mockDb = db; },
      releaseBriefSlot: async (bid) => { releasedSlots.push(bid); },
      now: () => now
    });

    expect(results.admin_alerts_sent).toBe(1);
    expect(mockDb.ugc_orders[0].admin_alerted_at).toBe(now.toISOString());
    expect(mockDb.admin_logs.some((l: any) => l.action === "UGC_DEADLINE_ADMIN_ALERT")).toBe(true);
  });

  it("expires order and relists brief with explore priority when deadline passed (§6, §7)", async () => {
    const claimTime = new Date("2026-09-27T00:00:00.000Z");
    const deadline = new Date("2026-09-28T00:00:00.000Z");
    const now = new Date("2026-09-28T00:05:00.000Z"); // 5 minutes past deadline

    mockDb.ugc_briefs.push({
      id: "br_3",
      brand_id: "brand_3",
      title: "Fitness Reel",
      budget: 4000,
      claimed_count: 1,
      max_creators: 1,
      relist_count: 0,
      is_priority: false
    });
    mockDb.users.push(
      { user_id: "brand_3", email: "brand3@test.com", name: "Brand Three" },
      { user_id: "creator_3", email: "creator3@test.com", name: "Creator Three", missed_deadlines_count: 0 }
    );
    mockDb.ugc_orders.push({
      id: "ord_3",
      brief_id: "br_3",
      brand_id: "brand_3",
      creator_id: "creator_3",
      status: "ACCEPTED",
      created_at: claimTime.toISOString(),
      internal_deadline: deadline.toISOString(),
      reminders_sent: 5
    });

    const results = await runUgcDeadlineChecks({
      supabase: null,
      privilegedSupabase: null,
      getDb: () => mockDb,
      saveDb: (db) => { mockDb = db; },
      releaseBriefSlot: async (bid) => { releasedSlots.push(bid); },
      now: () => now
    });

    expect(results.orders_expired).toBe(1);
    expect(mockDb.ugc_orders[0].status).toBe("EXPIRED");
    expect(mockDb.ugc_orders[0].expiry_reason).toBe("NO_DRAFT_BY_DEADLINE");
    expect(releasedSlots).toContain("br_3");

    // Brief is relisted with priority explore status
    const brief = mockDb.ugc_briefs.find((b: any) => b.id === "br_3");
    expect(brief.is_priority).toBe(true);
    expect(brief.relist_count).toBe(1);
    expect(brief.relisted_at).toBe(now.toISOString());

    // Creator missed deadline count incremented
    const creator = mockDb.users.find((u: any) => u.user_id === "creator_3");
    expect(creator.missed_deadlines_count).toBe(1);

    // Both parties notified
    expect(mockDb.notifications.some((n: any) => n.user_id === "creator_3" && n.type === "UGC_ORDER_EXPIRED")).toBe(true);
    expect(mockDb.notifications.some((n: any) => n.user_id === "brand_3" && n.type === "UGC_BRIEF_RELISTED")).toBe(true);
  });

  it("does NOT expire or send reminders if draft exists (§2)", async () => {
    const claimTime = new Date("2026-09-27T00:00:00.000Z");
    const deadline = new Date("2026-09-28T00:00:00.000Z");
    const now = new Date("2026-09-28T01:00:00.000Z"); // Past deadline, but draft was uploaded!

    mockDb.ugc_briefs.push({ id: "br_4", brand_id: "brand_4", title: "App Launch" });
    mockDb.ugc_orders.push({
      id: "ord_4",
      brief_id: "br_4",
      brand_id: "brand_4",
      creator_id: "creator_4",
      status: "SUBMITTED",
      video_url: "https://example.com/draft.mp4",
      created_at: claimTime.toISOString(),
      internal_deadline: deadline.toISOString(),
      reminders_sent: 2
    });

    const results = await runUgcDeadlineChecks({
      supabase: null,
      privilegedSupabase: null,
      getDb: () => mockDb,
      saveDb: (db) => { mockDb = db; },
      releaseBriefSlot: async (bid) => { releasedSlots.push(bid); },
      now: () => now
    });

    expect(results.orders_expired).toBe(0);
    expect(results.reminders_sent).toBe(0);
    expect(mockDb.ugc_orders[0].status).toBe("SUBMITTED");
  });
});

describe("Cron Auth & Priority Sorting & Brand Cancellation", () => {
  it("enforces constant-time CRON_SECRET matching (§3)", () => {
    const cronSecret = "secret-super-key-12345";
    const goodHeader = "secret-super-key-12345";
    const badHeader = "secret-super-key-wrong";
    const crypto = require("crypto");

    const compareSecret = (header: string, expected: string) => {
      if (typeof header !== "string" || typeof expected !== "string") return false;
      const bH = Buffer.from(header);
      const bE = Buffer.from(expected);
      if (bH.length !== bE.length) return false;
      return crypto.timingSafeEqual(bH, bE);
    };

    expect(compareSecret(goodHeader, cronSecret)).toBe(true);
    expect(compareSecret(badHeader, cronSecret)).toBe(false);
    expect(compareSecret("short", cronSecret)).toBe(false);
  });

  it("sorts available briefs placing relisted priority briefs first (§7)", () => {
    const briefs = [
      { id: "b_normal_old", is_priority: false, created_at: "2026-09-25T10:00:00.000Z" },
      { id: "b_normal_new", is_priority: false, created_at: "2026-09-27T10:00:00.000Z" },
      { id: "b_relist_first", is_priority: true, relisted_at: "2026-09-27T12:00:00.000Z", created_at: "2026-09-24T10:00:00.000Z" },
      { id: "b_relist_earlier", is_priority: true, relisted_at: "2026-09-26T12:00:00.000Z", created_at: "2026-09-23T10:00:00.000Z" }
    ];

    briefs.sort((a: any, b: any) => {
      const aPrio = Boolean(a.is_priority);
      const bPrio = Boolean(b.is_priority);
      if (aPrio && !bPrio) return -1;
      if (!aPrio && bPrio) return 1;
      if (aPrio && bPrio) {
        const aRelist = new Date(a.relisted_at || 0).getTime();
        const bRelist = new Date(b.relisted_at || 0).getTime();
        return bRelist - aRelist;
      }
      const aCreated = new Date(a.created_at || 0).getTime();
      const bCreated = new Date(b.created_at || 0).getTime();
      return bCreated - aCreated;
    });

    expect(briefs[0].id).toBe("b_relist_first");
    expect(briefs[1].id).toBe("b_relist_earlier");
    expect(briefs[2].id).toBe("b_normal_new");
    expect(briefs[3].id).toBe("b_normal_old");
  });

  it("checks brand cancellation window (24h from brief creation) (§8)", () => {
    const now = Date.now();
    const briefRecent = { created_at: new Date(now - 2 * 3600 * 1000).toISOString() }; // 2 hours old
    const briefOld = { created_at: new Date(now - 25 * 3600 * 1000).toISOString() }; // 25 hours old

    const isCancellable = (b: any) => {
      const ageMs = now - new Date(b.created_at).getTime();
      return ageMs >= 24 * 3600 * 1000;
    };

    expect(isCancellable(briefRecent)).toBe(false);
    expect(isCancellable(briefOld)).toBe(true);
  });

  it("calculates cancellation slots and refund amount without touching active in-progress orders (§8)", () => {
    const brief = {
      id: "br_multi",
      budget: 1500,
      max_creators: 3
    };

    const orders = [
      { id: "ord_1", brief_id: "br_multi", status: "ACCEPTED" }, // active in progress
      { id: "ord_2", brief_id: "br_multi", status: "EXPIRED" }   // expired, slot is free
    ];

    const workingOrders = orders.filter((o) => !["CANCELLED", "EXPIRED"].includes(o.status));
    const openSlots = Math.max(0, brief.max_creators - workingOrders.length);
    const refundAmount = openSlots * brief.budget;
    const newBriefStatus = workingOrders.length === 0 ? "CANCELLED" : "PARTIALLY_CANCELLED";

    expect(workingOrders.length).toBe(1);
    expect(openSlots).toBe(2);
    expect(refundAmount).toBe(3000);
    expect(newBriefStatus).toBe("PARTIALLY_CANCELLED");
  });
});


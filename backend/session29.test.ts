import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { summariseEarnings, txNet, isReleasedTx, buildCreatorDashboard } from "./creatorDashboard";

// Session 29: creator dashboard numbers come from the server; modals/drawers cover the whole screen.
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
const DASH = read("src/components/dashboard/CreatorDashboard.jsx");
const FEE = { threshold_amount: 20000, below_threshold_rate: 15, above_threshold_rate: 5 };

describe("earnings — same rules as the Earnings page", () => {
  const now = new Date("2026-09-29T10:00:00+05:30");
  const txns = [
    { status: "SUCCESS", payout_status: "RELEASED", creator_net_amount: 3400, payout_released_at: "2026-09-10T10:00:00Z" },
    { status: "SUCCESS", payout_status: "PAID", creator_net_amount: 1000, payout_completed_at: "2026-08-10T10:00:00Z" },
    { status: "SUCCESS", payout_status: "HELD", creator_net_amount: 8500 },           // in escrow, not earned
    { status: "REFUNDED", payout_status: "HELD", creator_net_amount: 999 },           // refunded: neither
    { status: "SUCCESS", gross_amount: 10000, utr_number: "UTR1", created_at: "2026-09-02T10:00:00Z" }, // no net → 15% fee
  ];
  it("escrow money is not called earnings", () => {
    const e = summariseEarnings(txns, FEE, now);
    expect(e.in_escrow).toBe(8500);
    expect(e.released_total).toBe(3400 + 1000 + 8500);
    expect(e.released_this_month).toBe(3400 + 8500);
  });
  it("net falls back to gross minus the fee slab", () => {
    expect(txNet({ gross_amount: 10000 }, FEE)).toBe(8500);
    expect(txNet({ gross_amount: 30000 }, FEE)).toBe(28500);
    expect(txNet({ gross_amount: 10000, platform_fee_amount: 0 }, FEE)).toBe(10000);
  });
  it("released = RELEASED / PAID / UTR / payout reference", () => {
    expect(isReleasedTx({ payout_status: "HELD" })).toBe(false);
    expect(isReleasedTx({ payout_reference: "x" })).toBe(true);
  });
  it("month boundary is India time", () => {
    const e = summariseEarnings([{ payout_status: "PAID", creator_net_amount: 50, payout_completed_at: "2026-09-30T20:00:00Z" }], FEE, new Date("2026-10-01T09:00:00+05:30"));
    expect(e.released_this_month).toBe(50); // 20:00 UTC on 30 Sep = 1:30 am IST on 1 Oct
  });
});

describe("dashboard work items", () => {
  const d = buildCreatorDashboard({
    deals: [
      { id: "D1", brand_id: "B1", campaign_id: "C1", status: "ACTIVE", agreed_amount: 4300 },
      { id: "D2", brand_id: "B2", status: "COMPLETED", agreed_amount: 9000 },
    ],
    threadsByDeal: { D1: { id: "T1", deal_id: "D1", flow_state: "CHANGES_REQUESTED" } },
    ugcOrders: [{ id: "U1", brand_id: "B1", brief_id: "BR1", status: "IN_REVIEW", creator_payout: 1800 }],
    brands: { B1: { company_name: "cosmic eye", logo: null } },
    campaigns: { C1: { title: "New TRY" } },
    profileViews: 7,
  });
  it("uses the real amount (agreed_amount), never ₹0", () => {
    const deal = d.open_work.find((w: any) => w.id === "D1");
    expect(deal.amount).toBe(4300);
    expect(deal.amount_kind).toBe("agreed_fee");
    expect(deal.thread_id).toBe("T1");
    expect(deal.creator_action).toBe("Upload the changes"); // thread flow_state wins over deal.status
  });
  it("completed work is not in open work", () => {
    expect(d.open_work.map((w: any) => w.id)).not.toContain("D2");
    expect(d.recent_completed.map((w: any) => w.id)).toContain("D2");
    expect(d.counts.completed).toBe(1);
  });
  it("no invented brand name", () => {
    expect(d.recent_completed[0].brand_name).toBeNull();
  });
  it("UGC payout is labelled as the creator's payout", () => {
    const u = d.open_work.find((w: any) => w.id === "U1");
    expect(u.amount).toBe(1800);
    expect(u.amount_kind).toBe("your_payout");
    expect(u.stage_group).toBe("brand_review");
  });
  it("counts", () => {
    expect(d.counts.open_work).toBe(2);
    expect(d.counts.needs_your_action).toBe(1);
    expect(d.counts.profile_views).toBe(7);
  });
});

describe("creator dashboard screen", () => {
  it("reads the summary, not the view-counting profile route / collabs / transactions", () => {
    expect(DASH).toContain("api.get('dashboard/creator'");
    expect(DASH).not.toMatch(/api\.get\(`\/creators\/\$\{user\.user_id\}\/profile`\)/);
    expect(DASH).not.toContain("api.get('collabs')");
    expect(DASH).not.toContain("d.agreed_rate");
  });
  it("no invented trends, match %, budget or stock photo", () => {
    for (const fake of ['"+ 18%"', '"+ 12%"', '"+ 22%"', "₹4.2k", ">+18%<", "(75 + ((i * 13) % 21))", "`₹10,000`", "photo-1542291026"]) {
      expect(DASH).not.toContain(fake);
    }
  });
  it("active deals never show completed ones", () => {
    expect(DASH).toContain('if (deal.status === "Completed") return false;');
  });
  it("route is registered", () => {
    expect(read("backend/server.ts")).toContain("setupCreatorDashboardRoutes(router,");
  });
});

describe("modals cover the whole screen and lock scroll", () => {
  it("PullToRefresh has no transform at rest", () => {
    expect(read("src/components/common/PullToRefresh.jsx")).toContain('displayDistance > 0 ? `translate3d(0, ${displayDistance}px, 0)` : "none"');
  });
  for (const f of ["src/components/campaigns/CreatorReviewInvitationModal.jsx", "src/components/shared/NotificationBell.jsx"]) {
    it(`${path.basename(f)} renders in a portal with scroll lock`, () => {
      const src = read(f);
      expect(src).toContain("<ModalPortal>");
      expect(src).toContain("useScrollLock(");
    });
  }
  it("scroll lock also locks the app scroll container", () => {
    expect(read("src/lib/useScrollLock.js")).toContain('getElementById("app-scroll-container")');
  });
});

import { describe, it, expect } from "vitest";
import { rewardBlocks, freeDealsLeft, shareEarned, normaliseConfig, referralCodeForId, DEFAULTS } from "./referralProgram";

const cfg = normaliseConfig({});
const ref = (i: number, extra: any = {}) => ({ id: `r${i}`, referred_id: `u${i}`, status: "joined", created_at: new Date(Date.UTC(2026, 9, i)).toISOString(), ...extra });

describe("referral programme (session 36)", () => {
  it("defaults: 3 joins → 2 free deals, 7 days Featured, 20% of fee up to ₹2,000, ₹200 min", () => {
    expect(cfg).toMatchObject({ signups_per_reward: 3, free_deals_per_reward: 2, featured_days: 7, share_pct_of_fee: 20, share_cap_per_creator: 2000, min_withdraw: 200 });
    expect(DEFAULTS.attribution_days).toBe(30);
  });

  it("every 3 counted joins = one reward block; rejected joins do not count", () => {
    const b = rewardBlocks([ref(1), ref(2), ref(3, { status: "rejected" }), ref(4), ref(5), ref(6), ref(7)], cfg);
    expect(b.joined).toBe(6);
    expect(b.blocks.length).toBe(2);
    expect(b.to_next).toBe(3);
  });

  it("free deals: used oldest first, expired ones gone", () => {
    const blocks = [
      { completed_at: "", free_deals: 2, expires_at: "2026-01-01T00:00:00Z", featured_until: "" },
      { completed_at: "", free_deals: 2, expires_at: "2027-01-01T00:00:00Z", featured_until: "" },
    ];
    const now = Date.parse("2026-06-01T00:00:00Z");
    expect(freeDealsLeft(blocks, 0, now).left).toBe(2);
    expect(freeDealsLeft(blocks, 3, now).left).toBe(1);
  });

  it("share (session 39): 0.2% of what the friend received after the fee, capped per invited creator", () => {
    expect(cfg.share_pct_of_earnings).toBe(0.2);
    const net = new Map([["a", 45000], ["b", 5_000_000], ["c", 0]]);
    const s = shareEarned(["a", "b", "c"], net, cfg);
    expect(s.per).toEqual({ a: 90, b: 2000, c: 0 }); // ₹45,000 → ₹90; ₹50 lakh → capped at ₹2,000
    expect(s.total).toBe(2090);
  });

  it("referral code format matches the signup matcher", () => {
    expect(referralCodeForId("91fcc5f2-b557-4d5f-a5eb-8323795fe221")).toBe("YBEX-91FCC5F2");
  });
});

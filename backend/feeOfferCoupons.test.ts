import { describe, it, expect } from "vitest";
import { calculateFee } from "../src/utils/feeCalculator";
import { feeFromStamp } from "./stampedFee";
import { pickCreatorCoupon } from "./creatorCoupons";

const cfgClient = (cfg: any) => ({ from: () => ({ select: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: cfg, error: null }) }) }) }) }) });

describe("offer mode + stamped fee + creator coupons (session 36)", () => {
  it("offer ON: only the convenience fee, coupons do not stack", async () => {
    const r: any = await calculateFee(12000, cfgClient({ offer_mode: true, offer_fee_pct: 2 }) as any, { type: "zero_fee" } as any);
    expect(r).toMatchObject({ feePercent: 2, platformFee: 240, creatorNet: 11760, feeKind: "convenience" });
    const n: any = await calculateFee(12000, cfgClient({ offer_mode: false }) as any);
    expect(n).toMatchObject({ feePercent: 15, platformFee: 1800, feeKind: "platform" });
  });

  it("payout uses the fee stamped at payment, whatever today's setting is", () => {
    const tx = { gross_amount: 12000, platform_fee_amount: 240, gst_amount: 0 };
    expect(feeFromStamp(tx, 12000)).toMatchObject({ platformFee: 240, creatorNet: 11760, source: "stamped" });
    expect(feeFromStamp({ gross_amount: 0 }, 100)).toBeNull();
  });

  it("creator coupon: saved code beats auto offer; limits, dates and roles respected", () => {
    const now = Date.parse("2026-10-10T00:00:00Z");
    const coupons = [
      { id: "auto", code: "LAUNCH", type: "zero_fee", auto_apply: true, status: "active", applies_to: "all", applies_to_first_n_payouts: 3, valid_until: "2026-12-31" },
      { id: "code", code: "CR5", type: "fee_rate_override", override_fee_rate: 5, status: "active", applies_to: "creators", applies_to_first_n_payouts: 2 },
      { id: "brand", code: "BR", type: "zero_fee", auto_apply: true, status: "active", applies_to: "brand" },
      { id: "old", code: "OLD", type: "zero_fee", auto_apply: true, status: "active", valid_until: "2026-01-01" },
    ];
    expect(pickCreatorCoupon(coupons, [], "c1", now)).toMatchObject({ id: "auto", _dealNumber: 1, _dealsTotal: 3 });
    expect(pickCreatorCoupon(coupons, [{ coupon_id: "code", user_id: "c1", payouts_consumed: 0 }], "c1", now)).toMatchObject({ id: "code" });
    const used3 = [1, 2, 3].map(() => ({ coupon_id: "auto", user_id: "c1", payouts_consumed: 1 }));
    expect(pickCreatorCoupon(coupons.slice(0, 1), used3, "c1", now)).toBeNull();
    expect(pickCreatorCoupon(coupons.slice(0, 1), used3, "c2", now)).toMatchObject({ id: "auto" });
  });
});

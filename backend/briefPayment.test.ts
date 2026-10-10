import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { isPaymentFundingSomething, isUnlinkedPaymentRow } from "./briefPayment";

describe("UGC brief payment reuse check (session 24 bug: paid brief refused as 'already used')", () => {
  const verifyRow = { razorpay_order_id: "order_A", deal_id: null, ugc_order_id: null, status: "SUCCESS" };
  it("the unlinked row /payments/razorpay/verify writes does NOT make the order used", () => {
    expect(isPaymentFundingSomething(verifyRow, "order_A")).toBe(false);
    expect(isUnlinkedPaymentRow(verifyRow, "order_A")).toBe(true);
  });
  it("a row that funds a brief / deal / order does", () => {
    expect(isPaymentFundingSomething({ razorpay_order_id: "order_A", brief_id: "b1" }, "order_A")).toBe(true);
    expect(isPaymentFundingSomething({ zaakpay_order_id: "order_A", deal_id: "d1" }, "order_A")).toBe(true);
    expect(isPaymentFundingSomething({ razorpay_order_id: "order_B", brief_id: "b1" }, "order_A")).toBe(false);
  });
  it("POST /ugc/briefs uses the linked-only check and replaces the unlinked row", () => {
    const s = fs.readFileSync(path.join(__dirname, "ugc_routes.ts"), "utf8");
    expect(s).toContain("isPaymentFundingSomething(t, paymentOrderId)");
    expect(s).toContain("!isUnlinkedPaymentRow(t, paymentOrderId)");
    expect(s).not.toContain("some((t: any) => t.razorpay_order_id === paymentOrderId || t.zaakpay_order_id === paymentOrderId)");
  });
  it("brand clients keep a paid order and retry without a second checkout", () => {
    for (const f of ["src/pages/brand/BrandUGCMobile.jsx", "src/pages/brand/BrandUGCPost.jsx"]) {
      const s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
      expect(s).toContain("getPaidBriefOrder()");
      expect(s).toContain("savePaidBriefOrder(orderId");
      expect(s).toContain("FINAL_ORDER_CODES.includes(code)");
    }
  });
});

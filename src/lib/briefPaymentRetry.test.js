import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("./api", () => ({ api: { post: vi.fn() } }));
import { watchPaidOrder, goToPostedBriefs, BRIEF_POSTED_PATH } from "./briefPaymentRetry";

// Session 26: after a successful payment the brief went live but the page stayed on
// "Processing…". The page now (1) leaves for My Briefs with a hard-redirect fallback,
// (2) watches the paid order in case the checkout callback never arrives, and
// (3) the server answers a repeat post for the same paid order with the same brief.

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("session 26: brief payment never leaves the page stuck", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls onPaid once when the order turns paid", async () => {
    const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const onPaid = vi.fn();
    watchPaidOrder(check, "order_1", onPaid, { startAfterMs: 10, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid).toHaveBeenCalledWith("order_1");
  });

  it("stops when told to (normal success path won)", async () => {
    const check = vi.fn().mockResolvedValue(true);
    const onPaid = vi.fn();
    const stop = watchPaidOrder(check, "order_1", onPaid, { startAfterMs: 50 });
    stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("goes to My Briefs through the router", () => {
    const navigate = vi.fn();
    goToPostedBriefs(navigate);
    expect(navigate).toHaveBeenCalledWith(BRIEF_POSTED_PATH);
    expect(BRIEF_POSTED_PATH).toBe("/brand/ugc/briefs?tab=briefs");
  });

  it("both post screens use the safety net and the desktop page leaves via goToPostedBriefs", () => {
    const desktop = read("src/pages/brand/BrandUGCPost.jsx");
    const mobile = read("src/pages/brand/BrandUGCMobile.jsx");
    expect(desktop).toContain("goToPostedBriefs(navigate)");
    expect(desktop).toContain("watchPaidOrder(checkBriefOrderPaid");
    expect(mobile).toContain("watchPaidOrder(checkBriefOrderPaid");
    expect(read("src/lib/razorpay.js")).toContain("onOrderCreated(orderData.order_id)");
  });

  it("the server answers a repeat post for the same paid order with the existing brief", () => {
    const s = read("backend/ugc_routes.ts");
    expect(s).toContain("already_posted: true");
    expect(s).toContain("razorpay_order_id: paymentOrderId || null");
  });
});

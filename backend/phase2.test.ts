import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { issueSignToken, consumeSignToken, _resetSignTokens } from "./signTokens";
import { refundUgcOrder, refundMessageLine } from "./refunds";

// Session 21 — Phase 2 (money and contract).

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

describe("sign tokens", () => {
  beforeEach(() => _resetSignTokens());

  it("work once, for the user they were issued to", async () => {
    const t = await issueSignToken("u1");
    expect(await consumeSignToken("u2", t)).toBe(false); // someone else's — and now spent
    const t2 = await issueSignToken("u1");
    expect(await consumeSignToken("u1", t2)).toBe(true);
    expect(await consumeSignToken("u1", t2)).toBe(false); // one use
    expect(await consumeSignToken("u1", "")).toBe(false);
    expect(await consumeSignToken("u1", undefined)).toBe(false);
  });

  it("/otp/verify issues one only for a contract code, to the user who asked for it", () => {
    const s = read("backend/session_routes.ts");
    expect(s).toContain("const signUserId = purpose === 'contract_sign' && contractSigner ? String(contractSigner.user_id) : undefined;");
    expect(s).toContain("if (verifier && String(verifier.user_id) === record.signUserId)");
    expect(s).toContain("sign_token: await issueSignToken(record.signUserId)");
  });

  it("every signing route requires it", () => {
    const checks: [string, string][] = [
      ["backend/deals_chat_routes.ts", "consumeSignToken(user.user_id, req.body?.sign_token)"],
      ["backend/ugc_routes.ts", "consumeSignToken(user.user_id, req.body?.sign_token)"],
      ["backend/deals_routes.ts", "consumeSignToken(user.user_id, req.body?.sign_token)"],
    ];
    for (const [f, needle] of checks) expect([f, read(f).includes(needle)]).toEqual([f, true]);
    const ugc = read("backend/ugc_routes.ts");
    const claim = ugc.slice(ugc.indexOf("const handleUgcBriefClaim"), ugc.indexOf("const slot = await reserveBriefSlot"));
    expect(claim).toContain("consumeSignToken(user.user_id, req.body?.sign_token)"); // claiming signs, before the slot
  });

  it("/deals/:id/sign accepts only this deal's parties", () => {
    const s = read("backend/deals_routes.ts");
    expect(s).not.toContain("const isCreator = user.user_id === creatorId || user.role === 'creator';");
    expect(s).toContain("const isCreator = Boolean(creatorId) && user.user_id === creatorId;");
  });

  it("every signing screen sends the token", () => {
    const screens: [string, RegExp][] = [
      ["src/components/chat/ContractModal.jsx", /sign_token: verified\?\.data\?\.sign_token/],
      ["src/components/chat/UGCContractModal.jsx", /sign_token: signToken[\s\S]*sign_token: signToken/],
      ["src/components/chat/mobile/useChatThreadMobile.js", /sign_token: signToken/],
      ["src/pages/creator/CreatorUGCMobile.jsx", /sign_token: verified\?\.data\?\.sign_token/],
      ["src/pages/collabs/Collabs.jsx", /sign_token: signToken/],
      ["src/pages/creator/CreatorUGCOrders.jsx", /sign_token: signToken/],
      ["src/pages/collabs/DealDetail.jsx", /sign_token: signToken/],
    ];
    for (const [f, re] of screens) expect([f, re.test(read(f))]).toEqual([f, true]);
  });

  it("the /collabs signing modal no longer invents its OTP in the browser", () => {
    const s = read("src/components/deals/SlaAgreementOtpModal.jsx");
    expect(s).not.toContain("generatedOtp");
    expect(s).not.toMatch(/Math\.floor\(100000 \+ Math\.random\(\) \* 900000\)/);
    expect(s).toContain("await verifyContractOtp(user.email, otpCode)");
    const drawer = read("src/components/deals/DealDetailDrawer.jsx");
    expect(drawer).not.toMatch(/await onSign\(deal\.id, signatureText, deal\.type\);/); // typed name alone no longer signs
    expect(drawer).toContain("setShowOtpModal(true);");
  });
});

describe("escrow waits for both signatures", () => {
  it("create-order refuses a campaign deal whose agreement is not fully signed", () => {
    const s = read("backend/payment_routes.ts");
    const r = s.slice(s.indexOf('router.post("/payments/razorpay/create-order"'), s.indexOf('router.post("/payments/razorpay/verify"'));
    expect(r).toContain('"CONTRACT_NOT_SIGNED"');
    expect(r.indexOf("CONTRACT_NOT_SIGNED")).toBeLessThan(r.indexOf("rzp.orders.create"));
  });
});

describe("admins hear about payouts and failed refunds", () => {
  it("campaign approve-live-links alerts the payout desk", () => {
    const s = read("backend/campaign_lifecycle.ts") /* moved out of campaigns_routes.ts in session 22 */;
    expect(s).toMatch(/broadcastAdminNotification\(\{\s*type: 'payout_due'/);
    expect(read("backend/server.ts")).toMatch(/createCampaignLifecycleHandlers\(\{[\s\S]{0,300}broadcastAdminNotification,/);
  });
  it("UGC approve and a failed refund alert the admins", () => {
    const s = read("backend/services/ugcLifecycleService.ts");
    expect(s).toContain("if (action === 'APPROVE' && broadcastAdminNotification)");
    expect(s).toContain("type: 'refund_due'");
    expect(read("backend/server.ts")).toMatch(/createUgcLifecycleService\(\{[\s\S]{0,300}broadcastAdminNotification,/);
  });
});

describe("UGC cancel refunds for real", () => {
  const fakeRzp = (payment: any, refundResult: any = { id: "rfnd_1", status: "processed" }) => {
    const calls: any[] = [];
    return {
      calls,
      rzp: {
        orders: { fetchPayments: async () => ({ items: payment ? [payment] : [] }) },
        payments: { refund: async (id: string, body: any) => { calls.push({ id, body }); if (refundResult instanceof Error) throw refundResult; return refundResult; } },
      },
    };
  };
  const deps = (rzp: any, test = false) => ({ getRazorpay: () => rzp, isTestMode: () => test });

  it("refunds this order's share of the captured payment", async () => {
    const f = fakeRzp({ id: "pay_1", status: "captured", amount: 3_000_000, amount_refunded: 0 });
    const out = await refundUgcOrder(deps(f.rzp), { razorpayOrderId: "order_1", amount: 10000, orderId: "ugcord_1" });
    expect(out).toMatchObject({ refund_status: "PROCESSED", razorpay_refund_id: "rfnd_1", razorpay_payment_id: "pay_1" });
    expect(f.calls[0]).toMatchObject({ id: "pay_1", body: { amount: 1_000_000 } });
  });

  it("never refunds more than is left", async () => {
    const f = fakeRzp({ id: "pay_1", status: "captured", amount: 1_000_000, amount_refunded: 900_000 });
    const out = await refundUgcOrder(deps(f.rzp), { razorpayOrderId: "order_1", amount: 5000, orderId: "o" });
    expect(out.refund_status).toBe("PENDING");
    expect(f.calls).toHaveLength(0);
  });

  it("falls back to PENDING (manual refund) when it cannot refund", async () => {
    expect((await refundUgcOrder(deps(fakeRzp(null).rzp), { razorpayOrderId: "order_1", amount: 100, orderId: "o" })).refund_status).toBe("PENDING");
    expect((await refundUgcOrder(deps(fakeRzp(null).rzp), { razorpayOrderId: null, amount: 100, orderId: "o" })).refund_status).toBe("PENDING");
    expect((await refundUgcOrder(deps(fakeRzp(null).rzp, true), { razorpayOrderId: "order_1", amount: 100, orderId: "o" })).refund_status).toBe("PENDING");
    const boom = fakeRzp({ id: "pay_1", status: "captured", amount: 10_000, amount_refunded: 0 }, new Error("gateway down"));
    const out = await refundUgcOrder(deps(boom.rzp), { razorpayOrderId: "order_1", amount: 50, orderId: "o" });
    expect(out.refund_status).toBe("PENDING");
    expect(out.reason).toContain("gateway down");
  });

  it("the chat says what actually happened", () => {
    expect(refundMessageLine({ refund_status: "PROCESSED" }, 1000)).toContain("has been sent");
    expect(refundMessageLine({ refund_status: "PENDING" }, 1000)).toContain("the Ybex team will process it");
    const s = read("backend/services/ugcLifecycleService.ts");
    expect(s).not.toContain("have been refunded.`");
    expect(s).not.toMatch(/refund_status: 'PROCESSED',/);
  });
});

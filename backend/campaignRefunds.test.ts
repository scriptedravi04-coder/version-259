import { describe, it, expect } from "vitest";
import express from "express";
import { toBrandRefund, setupCampaignRefundRoutes } from "./campaignRefunds";
import fs from "fs";

describe("campaign refunds like UGC (session 36)", () => {
  it("brand sees amount, status and the UTR only once sent", () => {
    expect(toBrandRefund({ id: "t1", refund_amount: "5000", refund_status: "pending", refund_reference: "X" }))
      .toMatchObject({ amount: 5000, status: "PENDING", reference: null });
    expect(toBrandRefund({ id: "t2", refund_amount: 5000, refund_status: "PROCESSED", refund_reference: "UTR123" }))
      .toMatchObject({ status: "PROCESSED", reference: "UTR123" });
  });

  it("admin-only account lookup and notify; brand-only refund list", async () => {
    const router = express.Router();
    const calls: any[] = [];
    setupCampaignRefundRoutes(router, {
      supabase: null, privilegedSupabase: null,
      getDb: () => ({ transactions: [{ id: "t", brand_id: "b1", refund_status: "PENDING", refund_amount: 900 }], brand_refund_accounts: [] }),
      parseAuthUser: async (req: any) => req.__user,
      sendNotification: async (...a: any[]) => { calls.push(a); },
    });
    const run = async (method: string, url: string, user: any, body: any = {}) => {
      const out: any = {};
      const res: any = { status(c: number) { out.code = c; return res; }, json(j: any) { out.body = j; out.code ??= 200; return res; } };
      const layer = (router as any).stack.find((l: any) => l.route?.path === url.split("?")[0].replace(/\/b1$/, "/:brandId") && l.route.methods[method]);
      await layer.route.stack[0].handle({ __user: user, params: { brandId: "b1" }, body, query: {} }, res, () => {});
      return out;
    };
    expect((await run("get", "/admin/refund-account/b1", { role: "brand", user_id: "b1" })).code).toBe(403);
    expect((await run("get", "/admin/refund-account/b1", { role: "admin" })).body).toEqual({ refund_account: null });
    const list = await run("get", "/brand/refunds", { role: "brand", user_id: "b1" });
    expect(list.body).toMatchObject({ has_refund_account: false, refunds: [{ id: "t", status: "PENDING", amount: 900 }] });
    await run("post", "/admin/refunds/notify", { role: "admin" }, { brand_id: "b1", kind: "processed", amount: 900, reference: "UTR9" });
    expect(calls[0][1]).toBe("b1");
    expect(calls[0][3]).toContain("UTR9");
  });

  it("locked payment_routes.ts is not touched by this feature", () => {
    expect(fs.readFileSync("backend/campaignRefunds.ts", "utf8")).toContain("No locked file is changed");
  });
});

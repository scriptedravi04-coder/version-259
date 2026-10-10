// Session 36 (Ravi): campaign / deal refunds work like UGC refunds. Refunds are sent by hand (Razorpay
// free plan has no automatic refunds), so:
//  1. the brand keeps ONE refund account (UPI or bank) — the same brand_refund_accounts row UGC uses
//     (GET/POST /api/brand/refund-account, ugc_routes.ts);
//  2. the admin's Refund screen shows that account so the money can be sent, or asks the brand to add it;
//  3. the admin records the UTR with the existing POST /admin/transactions/:id/refund (payment_routes.ts,
//     unchanged) and the brand is told;
//  4. the brand sees every refund with its status and UTR (GET /api/brand/refunds).
// No locked file is changed for this.
import express from "express";

type Deps = {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  parseAuthUser: (req: express.Request) => Promise<any>;
  sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
};

const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");
const actingBrandId = (u: any) => String(u?.parent_brand_id || u?.user_id || "");
const inr = (n: any) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export function toBrandRefund(tx: any) {
  return {
    id: tx.id,
    deal_id: tx.deal_id || tx.campaign_deal_id || null,
    amount: Number(tx.refund_amount) || 0,
    status: String(tx.refund_status || "").toUpperCase(),   // PENDING | PROCESSED
    reference: tx.refund_status && String(tx.refund_status).toUpperCase() === "PROCESSED" ? (tx.refund_reference || null) : null,
    reason: tx.refund_reason || null,
    refunded_at: tx.refunded_at || null,
    created_at: tx.created_at || null,
  };
}

export function setupCampaignRefundRoutes(router: express.Router, deps: Deps) {
  const client = () => deps.privilegedSupabase || deps.supabase;

  // Admin: the brand's full refund account, to send the money.
  router.get("/admin/refund-account/:brandId", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const brandId = String(req.params.brandId || "");
    let row: any = null;
    if (client()) {
      const { data } = await client().from("brand_refund_accounts").select("*").eq("brand_id", brandId).maybeSingle();
      row = data || null;
    }
    if (!row) row = (deps.getDb().brand_refund_accounts || []).find((a: any) => a.brand_id === brandId) || null;
    if (!row) return res.json({ refund_account: null });
    return res.json({
      refund_account: {
        method_type: row.method_type || (row.upi_id ? "UPI" : "BANK"),
        upi_id: row.upi_id || null,
        bank_account_number: row.bank_account_number || null,
        bank_ifsc: row.bank_ifsc || null,
        account_holder_name: row.account_holder_name || null,
        updated_at: row.updated_at || null,
      },
    });
  });

  // Admin: tell the brand (a) to add a refund account, or (b) that the refund was sent.
  router.post("/admin/refunds/notify", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const brandId = String(req.body?.brand_id || "");
    const kind = String(req.body?.kind || "");
    if (!brandId || !["needs_account", "processed"].includes(kind)) return res.status(400).json({ error: "brand_id and kind are required" });
    const amount = inr(req.body?.amount);
    const ref = String(req.body?.reference || "").trim();
    const message = kind === "needs_account"
      ? `A refund of ${amount} is ready for you. Add your refund account (UPI or bank) in Payments so we can send it.`
      : `Your refund of ${amount} has been sent${ref ? ` (UTR ${ref})` : ""}. It can take 1–2 working days to show in your account.`;
    try {
      await deps.sendNotification(deps.getDb(), brandId, kind === "processed" ? "refund_processed" : "refund_account_needed", message);
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(502).json({ error: "Could not notify the brand." });
    }
  });

  // Brand: my refunds (campaign / deal). UGC brief refunds have their own list (BriefRefundStatus).
  router.get("/brand/refunds", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (String(user.role || "").toLowerCase() !== "brand") return res.status(403).json({ error: "Brands only" });
    const brandId = actingBrandId(user);
    let rows: any[] = [];
    if (client()) {
      const { data, error } = await client().from("transactions")
        .select("id, deal_id, campaign_deal_id, refund_amount, refund_status, refund_reference, refund_reason, refunded_at, created_at")
        .eq("brand_id", brandId)
        .not("refund_status", "is", null)
        .order("created_at", { ascending: false });
      if (!error) rows = data || [];
    }
    if (rows.length === 0) {
      rows = (deps.getDb().transactions || []).filter((t: any) => t.brand_id === brandId && t.refund_status);
    }
    let hasAccount = false;
    if (client()) {
      const { data } = await client().from("brand_refund_accounts").select("id").in("brand_id", [brandId, String(user.user_id)]);
      hasAccount = Array.isArray(data) && data.length > 0;
    }
    if (!hasAccount) hasAccount = (deps.getDb().brand_refund_accounts || []).some((a: any) => a.brand_id === brandId || a.brand_id === user.user_id);
    return res.json({ refunds: rows.map(toBrandRefund), has_refund_account: hasAccount });
  });
}

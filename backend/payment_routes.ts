import { logIgnored } from "./logIgnored";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getRazorpay } from "./helpers";
import { calculateFee as calculatePlatformFee } from "../src/utils/feeCalculator";
import { feeAtPaymentTime } from "./stampedFee";
import { resolveCreatorCoupon, recordCouponUse } from "./creatorCoupons";
import { decideSignatureCheck } from "./paymentTestMode";
import { parsePayoutMethod, toPublicPayoutMethod, payoutRequestBlock, toEligibleDeal, isEligibleForPayout, PAYOUT_READY_DEAL_STATUSES } from "./payoutMethods";
import { payoutReleaseBlock, refundBlock, pickPayoutAccount, isPayoutRequested, fetchAllRows } from "./adminMoney";

// All payment, escrow, and payout-related routes: Razorpay order creation
// and verification, admin transaction/refund management, admin escrow
// overview and manual payout release, and creator-facing transaction/
// payout-eligibility endpoints.
//
// Extracted from server.ts as part of an ongoing, incremental effort to
// split the single giant startServer() function into smaller, focused
// files. Every dependency this code needs from the outer server.ts scope
// (the Supabase clients, in-memory db helpers, auth, notifications, etc.)
// is passed in explicitly rather than relied on via closure, so this file
// has no hidden coupling to server.ts beyond what's listed below.
export function setupPaymentRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAction,
    sendNotification,
    fetchUserScopedTransactions,
    serializeChatMessage,
    insertChatMessageToSupabase,
    parseThreadState,
    getIsTestMode,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: string, targetType: string, targetId: string, details?: any) => Promise<any>;
    sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any>;
    fetchUserScopedTransactions: (userId: string, role?: string) => Promise<any[]>;
    serializeChatMessage: (a?: any, b?: any, c?: any, d?: any) => any;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
    parseThreadState: (thread: any) => any;
    getIsTestMode: () => boolean;
  }
) {
  const getIsoNow = () => new Date().toISOString();
  const threadAlertCooldowns = new Map<string, number>();

  router.get("/transactions", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    try {
      const txns = await fetchUserScopedTransactions(user.user_id, user.role);
      return res.json(txns);
    } catch (err) {
      console.error("[/transactions] Exception fetching transactions:", err);
      return res.json([]);
    }
  });


  router.get("/escrow-transactions", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    try {
      const data = await fetchUserScopedTransactions(user.user_id, user.role);

      const mapped = (data || []).map((e: any, idx: number) => ({
        id: e.id || `et-${idx}`,
        contract_id: e.contract_id || `CTR-${String(e.deal_id || e.id || "0000").slice(0, 8).toUpperCase()}`,
        brand_id: e.brand_id,
        creator_id: e.creator_id,
        creator_name: e.users?.name || e.creator_name || "Creator Pro",
        amount: Number(e.gross_amount || e.amount || 0),
        gross_amount: Number(e.gross_amount || 0),
        creator_net_amount: Number(e.creator_net_amount || 0),
        status: (e.payout_status === 'RELEASED' || e.payout_status === 'PAID')
          ? "released"
          : ["COMPLETED"].includes((e.status || "").toUpperCase())
            ? "released"
            : ["SUCCESS", "ACTIVE", "ESCROW_HELD"].includes((e.status || "").toUpperCase())
              ? "held"
              : (e.status || "held").toLowerCase(),
        payout_status: e.payout_status,
        payout_reference: e.payout_reference,
        escrow_hold: e.escrow_hold,
        created_at: e.created_at || new Date().toISOString(),
        payout_completed_at: e.payout_completed_at || null,
        payout_released_at: e.payout_released_at || e.payout_completed_at || null,
        is_brand_approved: e.is_brand_approved,
        deal_status: e.deal_status
      }));

      res.json(mapped);
    } catch (err) {
      console.error("[/escrow-transactions] Exception:", err);
      res.json([]);
    }
  });


  // Session 24: rules in backend/payoutMethods.ts (see the comment there).
  const loadCreatorDeals = async (userId: string) => {
    let rows: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('*, campaigns(title), transactions(*)')
          .eq('creator_id', userId)
          .in('status', PAYOUT_READY_DEAL_STATUSES) // session 38: brand-approved only
          .order('updated_at', { ascending: false });
        if (error) console.warn("[payout-eligible-deals] Supabase error:", error.message);
        if (Array.isArray(data)) {
          rows = data.map((d: any) => ({ deal: d, tx: Array.isArray(d.transactions) ? d.transactions[0] : d.transactions }));
        }
      } catch (e) {
        console.warn("[payout-eligible-deals] Supabase error:", e);
      }
    }
    if (rows.length === 0) {
      const db = getDb();
      rows = (db.deals || [])
        .filter((d: any) => (d.creator_id === userId || d.creatorId === userId) && PAYOUT_READY_DEAL_STATUSES.includes(d.status))
        .map((d: any) => ({ deal: d, tx: (db.transactions || []).find((t: any) => t.deal_id === d.id) || null }));
    }
    return rows;
  };

  router.get("/creator/payout-eligible-deals", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });
    try {
      const rows = await loadCreatorDeals(user.user_id || user.id);
      return res.json(rows.map(({ deal, tx }) => toEligibleDeal(deal, tx)).filter(isEligibleForPayout));
    } catch (err: any) {
      console.error("[/creator/payout-eligible-deals] Exception:", err);
      return res.json([]);
    }
  });

  const readPayoutMethod = async (userId: string) => {
    if (privilegedSupabase) {
      try {
        const { data, error } = await privilegedSupabase
          .from('creator_payment_methods').select('*').eq('user_id', userId).limit(1);
        if (error) console.warn("[payment-methods] read error:", error.message);
        if (Array.isArray(data) && data[0]) return data[0];
      } catch (e: any) { logIgnored("payment_routes:readPayoutMethod", e); }
    }
    const db = getDb();
    return (db.creator_payment_methods || []).find((m: any) => m.user_id === userId) || null;
  };

  router.get("/creator/payment-methods", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || user.role !== "creator") {
        return res.status(403).json({ error: "Only creators can access payment methods" });
      }
      const m = await readPayoutMethod(user.user_id);
      const pub = toPublicPayoutMethod(m);
      res.json(pub && (pub.upi_id || pub.account_last4) ? [pub] : []);
    } catch (e: any) {
      console.error("Error fetching payment methods:", e);
      res.status(500).json({ error: e.message || "Failed to fetch payment methods" });
    }
  });

  router.post("/creator/payment-methods", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || user.role !== "creator") {
        return res.status(403).json({ error: "Only creators can modify payment methods" });
      }
      const { row, error: invalid } = parsePayoutMethod(req.body || {});
      if (!row) return res.status(400).json({ error: invalid });

      const nowIso = getIsoNow();
      // Shared table first: that is what survives a restart and what admins read.
      if (privilegedSupabase) {
        const payload = { user_id: user.user_id, ...row, updated_at: nowIso };
        let { error } = await privilegedSupabase.from('creator_payment_methods').upsert(payload, { onConflict: 'user_id' });
        if (error) {
          // No unique constraint on user_id → do it by hand.
          const { data: existing } = await privilegedSupabase.from('creator_payment_methods').select('user_id').eq('user_id', user.user_id).limit(1);
          ({ error } = Array.isArray(existing) && existing.length
            ? await privilegedSupabase.from('creator_payment_methods').update(payload).eq('user_id', user.user_id)
            : await privilegedSupabase.from('creator_payment_methods').insert(payload));
        }
        if (error) {
          console.error("[payment-methods] save failed:", error.message);
          return res.status(502).json({ error: "Couldn't save your payout details. Please try again." });
        }
      }

      const db = getDb();
      db.creator_payment_methods = db.creator_payment_methods || [];
      let method = db.creator_payment_methods.find((m: any) => m.user_id === user.user_id);
      if (method) Object.assign(method, row, { updated_at: nowIso });
      else {
        method = { id: "pm_" + crypto.randomUUID(), user_id: user.user_id, ...row, created_at: nowIso, updated_at: nowIso };
        db.creator_payment_methods.push(method);
      }
      saveDb(db);
      res.json({ success: true, method: toPublicPayoutMethod(method) });
    } catch (e: any) {
      console.error("Error saving payment method:", e);
      res.status(500).json({ error: e.message || "Failed to save payment method" });
    }
  });

  router.post("/creator/payout-request", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });

    const { deal_id, note } = req.body || {};
    if (!deal_id) return res.status(400).json({ error: "deal_id is required" });
    const userId = user.user_id || user.id;
    const nowIso = getIsoNow();
    try {
      // The server's own deal + transaction — never the client's word for amount or status.
      let deal: any = null;
      let tx: any = null;
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('deals').select('*, transactions(*)').eq('id', deal_id).maybeSingle();
          if (data) {
            deal = data;
            tx = Array.isArray(data.transactions) ? data.transactions[0] : data.transactions;
          }
        } catch (e: any) { logIgnored("payment_routes:payoutRequestDeal", e); }
      }
      const db = getDb();
      if (!deal) deal = (db.deals || []).find((d: any) => d.id === deal_id) || null;
      if (!tx) tx = (db.transactions || []).find((t: any) => t.deal_id === deal_id) || null;

      const block = payoutRequestBlock(userId, deal, tx);
      if (block) return res.status(block.status).json({ error: block.error, code: block.code });

      const alreadyRequested = String(tx.payout_status || "").toUpperCase() === "PROCESSING";
      if (supabase) {
        const { error } = await (privilegedSupabase || supabase)
          .from('transactions')
          .update({ payout_status: 'PROCESSING', ...(note ? { notes: String(note).slice(0, 1000) } : {}), updated_at: nowIso })
          .eq('deal_id', deal_id);
        if (error) {
          console.error("[payout-request] update failed:", error.message);
          return res.status(502).json({ error: "Couldn't send the request. Please try again." });
        }
      }
      const localTx = (db.transactions || []).find((t: any) => t.deal_id === deal_id);
      if (localTx) {
        localTx.payout_status = 'PROCESSING';
        localTx.updated_at = nowIso;
        saveDb(db);
      }
      try {
        emitAdminEvent?.(req.app.get("io"), "payout_requested", { deal_id, creator_id: userId, reminder: alreadyRequested, at: nowIso });
      } catch (e: any) { logIgnored("payment_routes:payoutRequestEmit", e); }

      return res.json({
        success: true,
        message: alreadyRequested ? "Reminder sent to the Ybex finance team." : "Payout request sent to the Ybex finance team.",
        deal_id,
        payout_status: 'PROCESSING',
        reminder: alreadyRequested,
      });
    } catch (err: any) {
      console.error("[/creator/payout-request] Exception:", err);
      return res.status(500).json({ error: "Failed to raise payout request" });
    }
  });


  router.get("/admin/transactions", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== "admin" && user.role !== "sub_admin" && user.team_role !== "sub_admin")) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    if (supabase) {
      try {
        // Session 38: every page, not just Supabase's first 1000 rows.
        const { data, error } = await fetchAllRows((from, to) => supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to));

        if (error) {
          console.error("[/admin/transactions] Error fetching transactions:", error);
          return res.status(500).json({ detail: "Database error fetching transactions" });
        }
        return res.json(data || []);
      } catch (err) {
        console.error("[/admin/transactions] Exception fetching transactions:", err);
        return res.status(500).json({ detail: "Internal server error" });
      }
    } else {
      const db = getDb();
      return res.json(db.transactions || []);
    }
  });


  router.post("/admin/transactions/:id/refund", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const { id } = req.params;
    const {
      refund_amount,
      refund_reason,
      refund_reference,
      refund_status,
      fee_correction_note
    } = req.body;

    const amountNum = Number(refund_amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: "Please enter a valid refund amount greater than 0." });
    }

    const targetStatus = (refund_status || 'PROCESSED').toUpperCase();
    if (targetStatus === 'PROCESSED' && (!refund_reference || !String(refund_reference).trim())) {
      return res.status(400).json({ error: "Reference / UTR number is required when marking a refund as PROCESSED." });
    }

    const cleanRef = refund_reference ? String(refund_reference).trim() : null;
    const cleanReason = refund_reason ? String(refund_reason).trim() : null;
    const cleanFeeNote = fee_correction_note ? String(fee_correction_note).trim() : null;
    const nowIso = getIsoNow();

    let updatedTx: any = null;

    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        let findQuery = supabase.from('transactions').select('*');
        if (isUuid) {
          findQuery = findQuery.or(`id.eq.${id},zaakpay_order_id.eq.${id}`);
        } else {
          findQuery = findQuery.eq('zaakpay_order_id', id);
        }
        const { data: matched, error: findErr } = await findQuery;
        if (findErr) {
          console.error("[Admin Refund] Error finding transaction:", findErr);
          return res.status(502).json({ error: "Couldn't load this payment. Please try again." });
        }

        const existingTx = matched && matched.length > 0 ? matched[0] : null;

        // Session 38: no "refunded" toast for a payment that doesn't exist, no refund above what
        // was paid, none after the creator was paid, and never twice.
        if (!existingTx) {
          return res.status(404).json({ error: "Payment not found. Refresh the list and try again.", code: "TX_NOT_FOUND" });
        }
        const refundStop = refundBlock(existingTx, amountNum, targetStatus);
        if (refundStop) return res.status(refundStop.status).json({ error: refundStop.error, code: refundStop.code });

        const updatePayload: any = {
          refund_amount: amountNum,
          refund_status: targetStatus,
          refund_reason: cleanReason,
          refund_reference: cleanRef,
          fee_correction_note: cleanFeeNote
        };

        if (targetStatus === 'PROCESSED') {
          updatePayload.refunded_at = nowIso;
          updatePayload.refunded_by = user.user_id;
        }

        if (existingTx) {
          let { data: updatedRows, error: updateErr } = await (privilegedSupabase || supabase)
            .from('transactions')
            .update({
              ...updatePayload,
              ...(targetStatus === 'PROCESSED' ? { status: 'REFUNDED' } : { status: 'REFUND_PENDING' })
            })
            .eq('id', existingTx.id)
            .select('*');

          if (updateErr && updateErr.message && updateErr.message.includes('transactions_status_check')) {
            const retryRes = await (privilegedSupabase || supabase)
              .from('transactions')
              .update(updatePayload)
              .eq('id', existingTx.id)
              .select('*');
            updatedRows = retryRes.data;
            updateErr = retryRes.error;
          }

          if (updateErr) {
            console.error("[Admin Refund] Supabase update error:", updateErr);
            return res.status(500).json({ error: updateErr.message || "Failed to update transaction refund record." });
          }
          updatedTx = updatedRows && updatedRows[0] ? updatedRows[0] : { ...existingTx, ...updatePayload };

          // If linked to a deal, release escrow hold on refund processing
          if (existingTx.deal_id && targetStatus === 'PROCESSED') {
            try {
              await (privilegedSupabase || supabase)
                .from('deals')
                .update({
                  escrow_hold: false,
                  updated_at: nowIso
                })
                .eq('id', existingTx.deal_id);
            } catch (dealErr) {
              console.warn("[Admin Refund] Could not update linked deal escrow_hold:", dealErr);
            }
          }
        }
      } catch (err: any) {
        console.error("[Admin Refund] Exception:", err);
        // Session 38: this used to carry on and answer "success" with nothing saved.
        return res.status(500).json({ error: "Couldn't save the refund. Please try again." });
      }
    }

    // Sync with mock database if transaction exists locally
    const db = getDb();
    if (!db.transactions) db.transactions = [];
    const localIdx = db.transactions.findIndex((t: any) => t.id === id || t.transaction_id === id || t.zaakpay_order_id === id);
    if (localIdx >= 0) {
      db.transactions[localIdx] = {
        ...db.transactions[localIdx],
        refund_amount: amountNum,
        refund_status: targetStatus,
        refund_reason: cleanReason,
        refund_reference: cleanRef,
        fee_correction_note: cleanFeeNote,
        status: targetStatus === 'PROCESSED' ? 'REFUNDED' : 'REFUND_PENDING',
        refunded_at: targetStatus === 'PROCESSED' ? nowIso : undefined,
        refunded_by: targetStatus === 'PROCESSED' ? user.user_id : undefined,
        updated_at: nowIso
      };
      if (!updatedTx) updatedTx = db.transactions[localIdx];
      saveDb(db);
    } else if (!updatedTx) {
      updatedTx = {
        id,
        refund_amount: amountNum,
        refund_status: targetStatus,
        refund_reason: cleanReason,
        refund_reference: cleanRef,
        fee_correction_note: cleanFeeNote,
        status: targetStatus === 'PROCESSED' ? 'REFUNDED' : 'REFUND_PENDING',
        refunded_at: targetStatus === 'PROCESSED' ? nowIso : undefined
      };
    }

    await logAdminAction(user, 'REFUND_TRANSACTION', 'TRANSACTION', id, {
      refund_amount: amountNum,
      refund_status: targetStatus,
      refund_reference: cleanRef,
      refund_reason: cleanReason
    });

    return res.json({
      success: true,
      transaction: updatedTx
    });
  });


  router.get("/admin/escrow/overview", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    if (!supabase) return res.status(500).json({ error: "DB not initialized" });

    try {
      // Session 38: all pages (Supabase stops at 1000 rows per request).
      const { data: txns, error } = await fetchAllRows((from, to) => supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to));
      if (error) throw error;

      // Fetch related data with correct column names.
      //
      // These lookups are what turn the ledger into readable rows. Their errors used to be
      // dropped on the floor: one wrong column name here returns null, every map comes out
      // empty, and the panel quietly renders "Brand" / "Creator" / "UGC Content Deal"
      // placeholders with no clue why. Each one is now checked and named in the log.
      const [
        { data: deals, error: dealsErr },
        { data: ugcOrders, error: ugcOrdersErr },
        { data: ugcBriefs, error: ugcBriefsErr },
        { data: campaigns, error: campaignsErr },
        { data: users, error: usersErr },
        { data: brandProfiles, error: brandProfilesErr },
        { data: creatorProfiles, error: creatorProfilesErr },
        { data: creatorKyc, error: creatorKycErr },
        { data: payoutMethods, error: payoutMethodsErr }
      ] = await Promise.all([
        fetchAllRows((f, t) => supabase.from('deals').select('id, status, campaign_id, brand_id, creator_id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('ugc_orders').select('id, brief_id, status, brand_id, creator_id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('ugc_briefs').select('id, title, product_name, brand_name, brand_id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('campaigns').select('campaign_id, title, brand_name, brand_user_id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('users').select('user_id, name, email').range(f, t)),
        fetchAllRows((f, t) => supabase.from('brand_profiles').select('user_id, company_name').range(f, t)),
        fetchAllRows((f, t) => supabase.from('creator_profiles').select('user_id, name, verified, profile_status').range(f, t)),
        // creator_kyc too. A creator who entered their UPI during KYC had it written to
        // creator_kyc and verifications, never to creator_profiles — so the payout modal,
        // which only read creator_profiles, showed "Not set" while the details sat in the
        // database the whole time.
        // NOTE the column names: creator_kyc is keyed on creator_id (not user_id) and uses
        // bank_account_no / bank_holder_name.
        fetchAllRows((f, t) => supabase.from('creator_kyc').select('creator_id, upi_id, bank_account_no, bank_ifsc, bank_holder_name, full_name, status').range(f, t)),
        // Session 38: what the creator saved in Earnings → payout details. The modal never read
        // it, so admins saw "Missing Bank/UPI" for creators who had filled it in.
        fetchAllRows((f, t) => (privilegedSupabase || supabase).from('creator_payment_methods').select('*').range(f, t))
      ]);

      const lookupErrors: string[] = [];
      const noteLookupError = (label: string, err: any) => {
        if (!err) return;
        lookupErrors.push(label);
        console.error(`[admin/escrow/overview] ${label} lookup failed — names will fall back to placeholders:`, err.message || err);
      };
      noteLookupError('deals', dealsErr);
      noteLookupError('ugc_orders', ugcOrdersErr);
      noteLookupError('ugc_briefs', ugcBriefsErr);
      noteLookupError('campaigns', campaignsErr);
      noteLookupError('users', usersErr);
      noteLookupError('brand_profiles', brandProfilesErr);
      noteLookupError('creator_profiles', creatorProfilesErr);
      noteLookupError('creator_kyc', creatorKycErr);
      noteLookupError('creator_payment_methods', payoutMethodsErr);

      const dealsMap = new Map<string, any>((deals || []).map((d: any) => [d.id, d]));
      const ugcOrdersMap = new Map<string, any>((ugcOrders || []).map((u: any) => [u.id, u]));
      const ugcBriefsMap = new Map<string, any>((ugcBriefs || []).map((b: any) => [b.id, b]));
      const campaignsMap = new Map<string, any>((campaigns || []).map((c: any) => [c.campaign_id, c]));
      const usersMap = new Map<string, any>((users || []).map((u: any) => [u.user_id, u]));
      const brandProfilesMap = new Map<string, string>((brandProfiles || []).map((bp: any) => [bp.user_id, bp.company_name]));
      // The whole row, not just the name — the admin payout modal needs the UPI/bank fields
      // off the same record. creator_profiles is the source of truth for these; the copy
      // sometimes embedded on the transaction row is a snapshot that goes stale.
      const creatorProfilesMap = new Map<string, any>((creatorProfiles || []).map((cp: any) => [cp.user_id, cp]));

      const creatorKycMap = new Map<string, any>((creatorKyc || []).map((k: any) => [k.creator_id, k]));
      const payoutMethodsMap = new Map<string, any>((payoutMethods || []).map((m: any) => [m.user_id, m]));

      /**
       * Payout details for a creator, from wherever they actually entered them.
       *
       * Two different screens write these: profile settings writes creator_profiles, and
       * KYC writes creator_kyc. Reading only one meant half the creators showed "Not set"
       * on the payout modal even though their details were saved. Either source is taken,
       * field by field, so a partially-filled profile still resolves.
       */
      const payoutAccountFor = (cid: any) => {
        if (!cid) return null;
        return pickPayoutAccount(payoutMethodsMap.get(cid), creatorProfilesMap.get(cid), creatorKycMap.get(cid));
      };

      const enrichedTransactions = (txns || []).map((tx: any) => {
        let deal_status = undefined;
        let is_brand_approved = undefined;
        let brand_name = undefined;
        let brand_id = tx.brand_id;
        let campaign_title = undefined;
        let campaign_id = undefined;
        let creator_name = undefined;
        let creator_id = tx.creator_id;
        
        const deal = tx.deal_id ? dealsMap.get(tx.deal_id) : null;
        const ugcOrder = tx.ugc_order_id ? ugcOrdersMap.get(tx.ugc_order_id) : null;

        if (deal) {
          deal_status = deal.status;
          is_brand_approved = Boolean(deal.status === 'COMPLETED' || deal.status === 'APPROVED' || tx.payout_status === 'RELEASED' || tx.payout_status === 'READY_FOR_RELEASE');
          campaign_id = deal.campaign_id;
          brand_id = deal.brand_id || brand_id;
          creator_id = deal.creator_id || creator_id;
          
          const campaign = deal.campaign_id ? campaignsMap.get(deal.campaign_id) : null;
          if (campaign) {
            campaign_title = campaign.title;
            brand_name = campaign.brand_name || brandProfilesMap.get(campaign.brand_user_id) || usersMap.get(campaign.brand_user_id)?.name;
            if (!brand_id) brand_id = campaign.brand_user_id;
          }
          if (!brand_name && deal.brand_id) {
            brand_name = brandProfilesMap.get(deal.brand_id) || usersMap.get(deal.brand_id)?.name;
          }

          const cId = deal.creator_id || tx.creator_id;
          creator_name = (creatorProfilesMap.get(cId) || {}).name || usersMap.get(cId)?.name;
        } else if (ugcOrder) {
          deal_status = ugcOrder.status;
          is_brand_approved = Boolean(ugcOrder.status === 'COMPLETED' || ugcOrder.status === 'APPROVED' || tx.payout_status === 'RELEASED' || tx.payout_status === 'READY_FOR_RELEASE');
          brand_id = ugcOrder.brand_id || brand_id;
          creator_id = ugcOrder.creator_id || creator_id;

          const brief = ugcOrder.brief_id ? ugcBriefsMap.get(ugcOrder.brief_id) : null;
          campaign_title = brief?.title ? `UGC: ${brief.title}` : (brief?.product_name ? `UGC: ${brief.product_name}` : "Instant UGC Order");
          brand_name = brief?.brand_name || brandProfilesMap.get(ugcOrder.brand_id) || usersMap.get(ugcOrder.brand_id)?.name;

          const cId = ugcOrder.creator_id || tx.creator_id;
          creator_name = (creatorProfilesMap.get(cId) || {}).name || usersMap.get(cId)?.name;
        } else {
          if (tx.creator_id) {
            creator_name = (creatorProfilesMap.get(tx.creator_id) || {}).name || usersMap.get(tx.creator_id)?.name;
          }
          if (tx.brand_id) {
            brand_name = brandProfilesMap.get(tx.brand_id) || usersMap.get(tx.brand_id)?.name;
          }
        }

        const account = payoutAccountFor(creator_id);
        return {
          ...tx,
          deal_status,
          is_brand_approved,
          brand_name: brand_name || "Unknown Brand",
          brand_id,
          campaign_title: campaign_title || "Campaign Deal",
          campaign_id,
          creator_name: creator_name || "Content Creator",
          creator_payout_account: account,
          // Session 38: the creator's current saved account wins over the old snapshot on the
          // payment row; one destination only (UPI or bank), never a mix of the two.
          upi_id: account ? account.upi_id : (tx.upi_id || null),
          bank_account_no: account ? account.account_number : (tx.bank_account_no || null),
          bank_ifsc: account ? account.ifsc_code : (tx.bank_ifsc || null),
          bank_name: account ? account.bank_name : (tx.bank_name || null),
          bank_holder_name: (account && account.account_holder_name) || tx.bank_holder_name || null,
          // Session 38: "Request payout" from Earnings sets payout_status PROCESSING only; the
          // Payment Requests tab looked for payout_requested and never showed it.
          payout_requested: isPayoutRequested(tx),
          creator_id
        };
      });

      res.json({
        transactions: enrichedTransactions,
        lookup_errors: lookupErrors.length > 0 ? lookupErrors : undefined
      });
    } catch (err: any) {
      console.error("Error fetching admin escrow overview:", err);
      res.status(500).json({ error: err.message });
    }
  });


  router.post("/admin/escrow/:dealId/release-payout", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const { dealId } = req.params;
    const {
      utr_number,
      reason,
      transaction_id,
      deal_id,
      ugc_order_id,
      creator_id,
      creator_net_amount,
      gross_amount,
      platform_fee_amount
    } = req.body;

    if (!utr_number || !String(utr_number).trim()) {
      return res.status(400).json({ error: "UTR / Banking reference number is required to release payout." });
    }

    const cleanUtr = String(utr_number).trim();
    const cleanReason = reason ? String(reason).trim() : "Payout released by admin";
    const nowIso = getIsoNow();

    const targetDealId = deal_id || ugc_order_id || dealId;
    let targetCreatorId = creator_id || null;
    // Populated alongside targetCreatorId below. Without it the local-thread fallback match
    // further down throws a ReferenceError inside a swallowing try/catch, which silently
    // skipped the "Payout Disbursed" chat card and the socket update on every release.
    let targetBrandId: string | null = null;
    let netPayout = Number(creator_net_amount) || 0;

    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetDealId);
        
        // Find matching transaction
        let txnQuery = supabase.from('transactions').select('*');
        if (transaction_id) {
          txnQuery = txnQuery.eq('id', transaction_id);
        } else if (isUuid) {
          txnQuery = txnQuery.or(`deal_id.eq.${targetDealId},id.eq.${targetDealId},ugc_order_id.eq.${targetDealId}`);
        } else {
          txnQuery = txnQuery.or(`ugc_order_id.eq.${targetDealId},id.eq.${targetDealId}`);
        }

        const { data: matchedTxns } = await txnQuery;
        const matchedTx = matchedTxns && matchedTxns.length > 0 ? matchedTxns[0] : null;

        // Session 38: a second "mark paid" sent the creator a second payout card + email, and a
        // refunded payment could still be marked paid out.
        const releaseStop = payoutReleaseBlock(matchedTx);
        if (releaseStop) return res.status(releaseStop.status).json({ error: releaseStop.error, code: releaseStop.code });

        if (matchedTx) {
          if (!targetCreatorId && matchedTx.creator_id) targetCreatorId = matchedTx.creator_id;
          if (!targetBrandId && matchedTx.brand_id) targetBrandId = matchedTx.brand_id;
          if (!netPayout && matchedTx.creator_net_amount) netPayout = Number(matchedTx.creator_net_amount);
        }

        // If still missing creator or netPayout, lookup deal or ugc_order
        if (!targetCreatorId || !netPayout) {
          if (isUuid) {
            const { data: dRec } = await supabase.from('deals').select('*').eq('id', targetDealId).maybeSingle();
            if (dRec) {
              if (!targetCreatorId && dRec.creator_id) targetCreatorId = dRec.creator_id;
              if (!targetBrandId && (dRec.brand_id || dRec.brand_user_id)) targetBrandId = dRec.brand_id || dRec.brand_user_id;
              if (!netPayout) {
                const gross = Number(dRec.agreed_amount || dRec.gross_amount) || 0;
                const feeCalc = await feeAtPaymentTime(supabase, { dealId: dRec.id }, gross, calculatePlatformFee); // session 36: stamped fee
                netPayout = feeCalc.creatorNet;
              }
            }
          }
          if (!targetCreatorId || !netPayout) {
            const { data: uRec } = await supabase.from('ugc_orders').select('*').eq('id', targetDealId).maybeSingle();
            if (uRec) {
              if (!targetCreatorId && uRec.creator_id) targetCreatorId = uRec.creator_id;
              if (!targetBrandId && uRec.brand_id) targetBrandId = uRec.brand_id;
              if (!netPayout) {
                const gross = Number(uRec.creator_payout || uRec.escrow_amount || uRec.agreed_amount || uRec.budget) || 0;
                const feeCalc = await feeAtPaymentTime(supabase, { ugcOrderId: uRec.id, briefId: uRec.brief_id }, gross, calculatePlatformFee); // session 36: stamped fee
                netPayout = feeCalc.creatorNet;
              }
            }
          }
        }

        // Update transactions table (only with columns that exist in the database)
        let updateTxnQuery = (privilegedSupabase || supabase).from('transactions').update({
          payout_status: 'PAID',
          status: 'SUCCESS',
          payout_reference: cleanUtr,
          payout_completed_at: nowIso,
          payout_completed_by: user?.user_id || user?.id || null,
          admin_action_note: cleanReason,
          admin_action_by: user?.user_id || user?.id || null
        });

        if (transaction_id) {
          updateTxnQuery = updateTxnQuery.eq('id', transaction_id);
        } else if (matchedTx) {
          updateTxnQuery = updateTxnQuery.eq('id', matchedTx.id);
        } else if (isUuid) {
          updateTxnQuery = updateTxnQuery.or(`deal_id.eq.${targetDealId},id.eq.${targetDealId},ugc_order_id.eq.${targetDealId}`);
        } else {
          updateTxnQuery = updateTxnQuery.eq('ugc_order_id', targetDealId);
        }

        const { error: txnUpdateErr } = await updateTxnQuery;
        if (txnUpdateErr) {
          console.error("[Admin Release Payout] Transaction update error:", txnUpdateErr);
        }

        // Update deals table (if applicable)
        if (isUuid) {
          try {
            await (privilegedSupabase || supabase).from('deals').update({
              escrow_hold: false,
              updated_at: nowIso
            }).eq('id', targetDealId);
          } catch (e) {
            console.warn("[Admin Release Payout] deals update warning:", e);
          }
        }

        // Update ugc_orders table (if applicable)
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          payout_status: 'PAID',
          payment_status: 'PAID',
          escrow_hold: false,
          utr_number: cleanUtr,
          updated_at: nowIso
        }).or(`id.eq.${targetDealId},deal_id.eq.${targetDealId}`);

        // Update payout_requests table
        try {
          await (privilegedSupabase || supabase).from('payout_requests').update({
            status: 'PAID',
            utr_number: cleanUtr,
            updated_at: nowIso
          }).or(`deal_id.eq.${targetDealId},id.eq.${targetDealId}`);
        } catch (prErr: any) { logIgnored("payment_routes:821", prErr); }

        // Send notification to Creator
        if (targetCreatorId) {
          try {
            await sendNotification(
              null,
              targetCreatorId,
              "payout_released",
              `🎉 Payout of ₹${netPayout > 0 ? netPayout.toLocaleString('en-IN') : 'funds'} has been disbursed to your bank account! UTR / Reference: ${cleanUtr}`
            );
          } catch (notifErr: any) { logIgnored("payment_routes:832", notifErr); }
        }

        // Add system chat message to thread & emit socket.io update
        try {
          const targetThreads: any[] = [];
          if (supabase) {
            try {
              const { data: threads } = await (privilegedSupabase || supabase)
                .from('chat_threads')
                .select('id, brand_id, creator_id, deal_id')
                .or(`id.eq.${targetDealId},deal_id.eq.${targetDealId},ugc_order_id.eq.${targetDealId}`)
                .limit(10);
              if (threads && threads.length > 0) {
                targetThreads.push(...threads);
              }
            } catch (thrErr: any) { logIgnored("payment_routes:848", thrErr); }
          }

          const localDb = getDb();
          const matchedLocal = (localDb.chat_threads || []).filter((t: any) =>
            t.id === targetDealId ||
            t.deal_id === targetDealId ||
            t.ugc_order_id === targetDealId ||
            (targetCreatorId && t.creator_id === targetCreatorId && targetBrandId && t.brand_id === targetBrandId)
          );
          for (const ml of matchedLocal) {
            if (!targetThreads.some(tt => tt.id === ml.id)) {
              targetThreads.push(ml);
            }
          }

          if (targetThreads.length > 0) {
            for (const thr of targetThreads) {
              const sysMsg = `💸 Payout Disbursed! Admin has released ₹${netPayout > 0 ? netPayout.toLocaleString('en-IN') : ''} to the creator's bank account. UTR / Ref: ${cleanUtr}`;

              // IMPORTANT: message_type must be exactly 'payout_released'
              const msgRecord = {
                message_id: crypto.randomUUID(),
                thread_id: thr.id,
                sender_user_id: user?.user_id || 'system',
                sender_role: 'system',
                text: sysMsg,
                content: sysMsg,
                message_type: 'payout_released',
                metadata: {
                  action: 'PAYOUT_RELEASED',
                  utr_number: cleanUtr,
                  payout_status: 'PAID',
                  creator_net_amount: netPayout,
                  net_amount: netPayout,
                  disbursed_at: nowIso
                },
                created_at: nowIso
              };

              if (supabase) {
                try {
                  await insertChatMessageToSupabase(msgRecord);
                } catch (insErr: any) { logIgnored("payment_routes:891", insErr); }
              }

              if (!localDb.chat_messages) localDb.chat_messages = [];
              localDb.chat_messages.push(msgRecord);

              const io = req.app.get("io");
              if (io) {
                io.to(thr.id).emit("new_message", msgRecord);
                emitThreadEvent(io, "thread_updated", {
                  id: thr.id,
                  threadId: thr.id,
                  payout_status: "PAID",
                  utr_number: cleanUtr,
                  lastMessage: msgRecord
                });
              }
            }
            saveDb(localDb);
          }
        } catch (chatErr) {
          console.warn("[Admin Release Payout] Chat sync warning:", chatErr);
        }

        // Broadcast admin escrow event
        const io = req.app.get("io");
        if (io) {
          emitThreadEvent(io, "payout_released", {
            deal_id: targetDealId,
            transaction_id: transaction_id || matchedTx?.id,
            utr_number: cleanUtr,
            creator_id: targetCreatorId,
            creator_net_amount: netPayout
          });
        }

        return res.json({
          success: true,
          message: `Payout of ₹${netPayout.toLocaleString('en-IN')} released successfully! UTR: ${cleanUtr}`,
          utr_number: cleanUtr,
          deal_id: targetDealId,
          payout_status: 'RELEASED'
        });
      } catch (err: any) {
        console.error("[Admin Release Payout] Error:", err);
        return res.status(500).json({ error: err.message || "Failed to release payout." });
      }
    }

    // Memory DB Fallback
    const db = getDb();
    if (db) {
      if (db.transactions) {
        const tx = db.transactions.find((t: any) =>
          t.id === transaction_id || t.deal_id === targetDealId || t.ugc_order_id === targetDealId || t.id === targetDealId
        );
        if (tx) {
          tx.payout_status = "RELEASED";
          tx.status = "SUCCESS";
          tx.escrow_hold = false;
          tx.utr_number = cleanUtr;
          tx.payout_reference = cleanUtr;
          tx.payout_date = nowIso;
          tx.payout_notes = cleanReason;
          if (!targetCreatorId && tx.creator_id) targetCreatorId = tx.creator_id;
          if (!netPayout && tx.creator_net_amount) netPayout = tx.creator_net_amount;
        }
      }
      if (db.deals) {
        const d = db.deals.find((x: any) => x.id === targetDealId);
        if (d) {
          d.payout_status = "PAID";
          d.payment_status = "PAID";
          d.escrow_hold = false;
          d.utr_number = cleanUtr;
        }
      }
      if (db.ugc_orders) {
        const uo = db.ugc_orders.find((x: any) => x.id === targetDealId || x.deal_id === targetDealId);
        if (uo) {
          uo.payout_status = "PAID";
          uo.payment_status = "PAID";
          uo.escrow_hold = false;
          uo.utr_number = cleanUtr;
        }
      }
      saveDb(db);
    }

    const io = req.app.get("io");
    if (io) {
      emitThreadEvent(io, "payout_released", {
        deal_id: targetDealId,
        transaction_id,
        utr_number: cleanUtr,
        creator_id: targetCreatorId,
        creator_net_amount: netPayout
      });
    }

    return res.json({
      success: true,
      message: `Payout of ₹${netPayout.toLocaleString('en-IN')} released successfully! UTR: ${cleanUtr}`,
      utr_number: cleanUtr,
      deal_id: targetDealId,
      payout_status: 'RELEASED'
    });
  });


  router.post("/payments/razorpay/create-order", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required", detail: "Please sign in to proceed with payment." });
    }

    const { deal_id, thread_id, campaign_id, brief_id, creator_id, gross_amount, amount } = req.body;

    let verifiedGrossAmount = Number(gross_amount ?? amount ?? 0);
    if (!verifiedGrossAmount || isNaN(verifiedGrossAmount) || verifiedGrossAmount <= 0) {
      verifiedGrossAmount = 1000;
    }

    // CAMPAIGN escrow: the amount comes from the deal, not from the browser. The order used to
    // be created for whatever the client sent, and the escrow was then recorded at the deal's
    // full agreed amount — so paying ₹1 recorded ₹20,000 as held. The order is also tagged with
    // its deal so a paid order cannot be presented later as payment for a different deal.
    let campaignOrderDealId: string | null = null;
    {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let candidate = String(deal_id || thread_id || "");
      if (candidate.startsWith("thread_camp_")) candidate = candidate.replace("thread_camp_", "");
      const client = privilegedSupabase || supabase;
      if (client && candidate && !candidate.startsWith("ugcord_") && !candidate.startsWith("thread_ugc_")) {
        try {
          if (!UUID_RE.test(candidate) && thread_id) {
            const { data: thr } = await client.from('chat_threads').select('deal_id').eq('id', thread_id).maybeSingle();
            if (thr?.deal_id && UUID_RE.test(thr.deal_id)) candidate = thr.deal_id;
          }
          if (UUID_RE.test(candidate)) {
            const { data: dealRec } = await client.from('deals').select('id, agreed_amount').eq('id', candidate).maybeSingle();
            const dealAmt = Number(dealRec?.agreed_amount);
            if (dealRec && dealAmt > 0) {
              campaignOrderDealId = dealRec.id;
              verifiedGrossAmount = dealAmt;
            }
          }
        } catch (e: any) {
          console.warn("[Razorpay Create Order] campaign deal amount lookup failed:", e?.message || e);
        }
      }
    }

    // WHEN: the escrow is paid only after BOTH sides signed (Ravi's flow: amount agreed →
    // agreement → both sign → payment). A deal could be funded with the contract unsigned, and
    // the creator then had money in escrow for terms they never accepted.
    if (campaignOrderDealId) {
      const client = privilegedSupabase || supabase;
      let thr: any = (getDb().chat_threads || []).find((t: any) => t.deal_id === campaignOrderDealId || t.id === `thread_camp_${campaignOrderDealId}`);
      if (client) {
        try {
          const { data } = await client
            .from('chat_threads')
            .select('agreement_signed_creator, agreement_signed_brand')
            .eq('deal_id', campaignOrderDealId)
            .limit(1);
          if (data && data[0]) thr = data[0];
        } catch (e: any) {
          console.warn("[Razorpay Create Order] signature lookup failed:", e?.message || e);
        }
      }
      if (thr && !(thr.agreement_signed_creator && thr.agreement_signed_brand)) {
        const waitingFor = !thr.agreement_signed_brand && !thr.agreement_signed_creator ? "both parties" : !thr.agreement_signed_brand ? "the brand" : "the creator";
        return res.status(409).json({
          error: "CONTRACT_NOT_SIGNED",
          code: "CONTRACT_NOT_SIGNED",
          detail: `The agreement must be signed by both sides before the secure payment hold is paid — waiting for ${waitingFor}.`
        });
      }
    }

    let rzp: Razorpay | null = null;
    try {
      rzp = getRazorpay();
    } catch (err: any) {
      console.warn("[Razorpay Create Order] Razorpay config notice:", err.message);
    }

    let order: any = null;
    if (rzp) {
      try {
        const options: any = {
          amount: Math.round(verifiedGrossAmount * 100),
          currency: "INR",
          receipt: `rcpt_${Date.now()}`
        };
        if (campaignOrderDealId) {
          options.notes = { deal_id: campaignOrderDealId, kind: "campaign_escrow" };
        }
        order = await rzp.orders.create(options);
      } catch (err: any) {
        console.warn("[Razorpay Create Order] Razorpay API call failed:", err.message);
      }
    }

    if (!order) {
      if (getIsTestMode()) {
        const simulatedOrderId = `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const transactionId = crypto.randomUUID();
        return res.json({
          success: true,
          key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
          order_id: simulatedOrderId,
          amount: Math.round(verifiedGrossAmount * 100),
          currency: "INR",
          transaction_id: transactionId,
          is_test_mode: true,
          user_name: user.name || "Brand User",
          user_email: user.email || "",
          user_phone: user.phone || ""
        });
      }
      return res.status(500).json({ error: "Failed to create Razorpay order." });
    }

    const transactionId = crypto.randomUUID();
    return res.json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      transaction_id: transactionId,
      is_test_mode: getIsTestMode(),
      user_name: user.name || "Brand User",
      user_email: user.email || "",
      user_phone: user.phone || ""
    });
  });

  async function persistEscrowPayment({
    razorpay_order_id,
    razorpay_payment_id,
    deal_id,
    thread_id,
    user,
    req,
  }: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    deal_id?: string | null;
    thread_id?: string | null;
    user?: any;
    req: express.Request;
  }): Promise<{ safeGross: number; dealUpdateError: string | null; threadUpdateError: string | null; alreadyProcessed: boolean; amountMismatch?: string | null }> {
    let dealUpdateError: string | null = null;
    let threadUpdateError: string | null = null;
    let isAlreadyProcessed = false;  // FIX #5: Track this early for socket event logic

    if (supabase && razorpay_order_id) {
      try {
        // FIX #2: Use razorpay_order_id column, not zaakpay_order_id
        // This prevents duplicate transaction processing if payment persists multiple times
        const { data: existingTxn } = await supabase
          .from('transactions')
          .select('gross_amount, id')
          .eq('zaakpay_order_id', razorpay_order_id)  // ✅ FIX #2: Corrected column name
          .maybeSingle();
        if (existingTxn) {
          console.log(`[persistEscrowPayment] Payment already processed (idempotency hit). Transaction ID: ${existingTxn.id}, Gross: ₹${existingTxn.gross_amount}`);
          isAlreadyProcessed = true;  // FIX #5: Mark as duplicate
          return { safeGross: Number(existingTxn.gross_amount) || 0, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: true };
        }
      } catch (e) {
        console.warn("[persistEscrowPayment] Idempotency check failed, proceeding anyway:", e);
      }
    }

    let grossAmount = 0;
    let targetCreatorId: string | null = null;
    let targetBrandId: string | null = user?.user_id || null;
    let campaignDealUuid: string | null = null;

    if (supabase) {
      try {
        let checkDealId = deal_id || thread_id;
        if (checkDealId && checkDealId.startsWith("thread_camp_")) {
          checkDealId = checkDealId.replace("thread_camp_", "");
        }
        if (checkDealId) {
          if (checkDealId.startsWith("ugcord_")) {
            const { data: uOrder } = await supabase.from('ugc_orders').select('*').eq('id', checkDealId).maybeSingle();
            if (uOrder) {
              grossAmount = Number(uOrder.creator_payout || uOrder.escrow_amount || uOrder.agreed_amount || uOrder.budget) || 0;
              if (uOrder.creator_id) targetCreatorId = uOrder.creator_id;
              if (uOrder.brand_id) targetBrandId = uOrder.brand_id;
            }
          } else {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkDealId);
            if (isUuid) {
              const { data: dealRec } = await supabase.from('deals').select('*').eq('id', checkDealId).maybeSingle();
              if (dealRec) {
                grossAmount = Number(dealRec.agreed_amount || dealRec.amount_fixed || dealRec.budget || dealRec.gross_amount) || 0;
                if (grossAmount > 0) campaignDealUuid = dealRec.id;
                if (dealRec.creator_id) targetCreatorId = dealRec.creator_id;
                if (dealRec.brand_id || dealRec.brand_user_id) targetBrandId = dealRec.brand_id || dealRec.brand_user_id;
              }
            }
            if (!grossAmount) {
              const { data: uOrder } = await supabase.from('ugc_orders').select('*').eq('id', checkDealId).maybeSingle();
              if (uOrder) {
                grossAmount = Number(uOrder.creator_payout || uOrder.escrow_amount || uOrder.agreed_amount || uOrder.budget) || 0;
                if (uOrder.creator_id) targetCreatorId = uOrder.creator_id;
                if (uOrder.brand_id) targetBrandId = uOrder.brand_id;
              }
            }
          }
        }
        if (thread_id && (!grossAmount || grossAmount <= 0)) {
          const { data: threadRec } = await supabase.from('chat_threads').select('*').eq('id', thread_id).maybeSingle();
          if (threadRec) {
            const parsed = parseThreadState(threadRec);
            grossAmount = Number(threadRec.agreed_amount || threadRec.amount_fixed || parsed.amount_fixed) || 0;
            if (threadRec.creator_id) targetCreatorId = threadRec.creator_id;
            if (threadRec.brand_id) targetBrandId = threadRec.brand_id;
          }
        }
      } catch (e) {
        console.warn("[persistEscrowPayment] DB lookup error:", e);
      }
    }

    if (!grossAmount || grossAmount <= 0) {

      try {
        const rzp = getRazorpay();
        const rzpOrder = await rzp.orders.fetch(razorpay_order_id);
        if (rzpOrder?.amount) {
          grossAmount = Math.round(Number(rzpOrder.amount) / 100);
        }
      } catch (e: any) { logIgnored("payment_routes:1231", e); }
    }

    // CAMPAIGN: the escrow is recorded at the deal's amount, so the money Razorpay actually took
    // must cover it, and the order must belong to this deal. Neither was checked. Fails closed:
    // if the order cannot be confirmed, nothing is marked funded and the client can retry.
    if (campaignDealUuid && grossAmount > 0 && !getIsTestMode() && !String(razorpay_order_id || "").startsWith("order_test_")) {
      let mismatch: string | null = null;
      try {
        const rzpOrder: any = await getRazorpay().orders.fetch(razorpay_order_id);
        const paidRupees = Number(rzpOrder?.amount_paid || rzpOrder?.amount || 0) / 100;
        const boundDeal = rzpOrder?.notes?.deal_id;
        if (boundDeal && boundDeal !== campaignDealUuid) {
          mismatch = "This payment belongs to a different deal.";
        } else if (paidRupees + 0.5 < grossAmount) {
          mismatch = `The payment (₹${paidRupees}) does not cover the agreed amount (₹${grossAmount}).`;
        }
      } catch (e: any) {
        mismatch = "The payment amount could not be confirmed with Razorpay. Please retry in a moment.";
      }
      if (mismatch) {
        console.error("[persistEscrowPayment] campaign escrow NOT recorded:", { razorpay_order_id, campaignDealUuid, grossAmount, mismatch });
        return { safeGross: 0, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: false, amountMismatch: mismatch };
      }
    }

    const safeGross = Math.max(1, Math.round(grossAmount || 0));
    // Session 36 (Ravi OK): a creator coupon (auto-apply launch offer or saved code) is applied HERE, once,
    // when the brand pays; the result is stamped on the transaction below. Offer mode overrides coupons.
    const fundingCoupon = await resolveCreatorCoupon(privilegedSupabase || supabase, targetCreatorId);
    const feeCalc = await calculatePlatformFee(safeGross, supabase || undefined, fundingCoupon || undefined);
    const platformFee = Math.round(feeCalc.platformFee || 0);
    const gstAmount = Math.round(feeCalc.gstAmount || 0);
    const creatorNet = Math.round(feeCalc.creatorNet || (safeGross - platformFee - gstAmount));
    const nowIso = getIsoNow();

    if (supabase) {
      try {
        let validDealId: string | null = null;
        let validUgcOrderId: string | null = null;
        
        const candidateId = deal_id || thread_id;
        if (candidateId) {
          if (candidateId.startsWith("ugcord_")) {
            validUgcOrderId = candidateId;
          } else if (candidateId.startsWith("thread_camp_")) {
            const extracted = candidateId.replace("thread_camp_", "");
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(extracted);
            if (isUuid) {
              validDealId = extracted;
            }
          } else {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
            if (isUuid) {
              const { data: dCheck } = await supabase.from('deals').select('id').eq('id', candidateId).maybeSingle();
              if (dCheck) validDealId = candidateId;
            }
            if (!validDealId) {
              const { data: uCheck } = await supabase.from('ugc_orders').select('id').eq('id', candidateId).maybeSingle();
              if (uCheck) validUgcOrderId = candidateId;
            }
          }
        }

        
        if (!validDealId && !validUgcOrderId && deal_id) {
          let checkFallback = deal_id;
          if (checkFallback.startsWith("thread_camp_")) checkFallback = checkFallback.replace("thread_camp_", "");
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkFallback);
          if (isUuid) validDealId = checkFallback;
          else validUgcOrderId = checkFallback;
        }


        const txnId = crypto.randomUUID();
        const hasValidSource = (Boolean(validDealId) !== Boolean(validUgcOrderId));
        
console.log('Valid Source:', { validDealId, validUgcOrderId, hasValidSource, deal_id, candidateId });

        if (hasValidSource) {
          // FIX #2: Use correct column names (razorpay_order_id, razorpay_payment_id)
          const { error: insErr } = await (privilegedSupabase || supabase).from('transactions').insert({
            id: txnId,
            deal_id: validDealId || null,
            ugc_order_id: validUgcOrderId || null,
            creator_id: targetCreatorId || null,
            gross_amount: safeGross,
            platform_fee_amount: platformFee,
            creator_net_amount: creatorNet,
            gst_amount: gstAmount,
            zaakpay_order_id: razorpay_order_id,
            status: 'SUCCESS',
            payout_status: 'PENDING',
            payout_type: 'full',
            created_at: nowIso
          });
          if (!insErr && feeCalc?.appliedCoupon && targetCreatorId) {
            await recordCouponUse(privilegedSupabase || supabase, feeCalc.appliedCoupon, { creatorId: targetCreatorId, dealId: validDealId || null, ugcOrderId: validUgcOrderId || null, discount: Number(feeCalc.discountApplied || 0) });
          }
          if (insErr) { console.error('[persistEscrowPayment] Supabase transaction insert error:', insErr); dealUpdateError = JSON.stringify(insErr); }
        }

        if (validDealId) {
          const { error: dealErr } = await (privilegedSupabase || supabase).from('deals').update({
            status: 'ACTIVE',
            escrow_hold: true,
            escrow_hold_at: nowIso,
            updated_at: nowIso
          }).eq('id', validDealId);
          if (dealErr) {
            dealUpdateError = dealErr.message || String(dealErr);
            console.error("[persistEscrowPayment] deals.update FAILED (payment succeeded but deal not marked active):", dealErr);
          }
        }
        if (validUgcOrderId) {
          const { error: ugcErr } = await (privilegedSupabase || supabase).from('ugc_orders').update({
            payment_status: 'ESCROW_HELD',
            status: 'IN_PROGRESS',
            escrow_hold: true,
            escrow_held_at: nowIso,
            updated_at: nowIso
          }).eq('id', validUgcOrderId);
          if (ugcErr) {
            dealUpdateError = ugcErr.message || String(ugcErr);
            console.error("[persistEscrowPayment] ugc_orders.update FAILED (payment succeeded but order not marked active):", ugcErr);
          }
        }

        let targetThreadId = thread_id || null;
        if (!targetThreadId && (validDealId || validUgcOrderId || candidateId || deal_id)) {
          const lookupId = validDealId || validUgcOrderId || candidateId || deal_id;
          const { data: thrRow } = await (privilegedSupabase || supabase)
            .from('chat_threads')
            .select('id, brand_id, creator_id')
            .or(`id.eq.${lookupId},deal_id.eq.${lookupId}`)
            .maybeSingle();
          if (thrRow) {
            targetThreadId = thrRow.id;
            if (!targetBrandId && thrRow.brand_id) targetBrandId = thrRow.brand_id;
          }
        }

        if (targetThreadId) {
          // IMPORTANT: chat_threads has no payment_funded/escrow_funded/
          // funded_at columns in the real Postgres schema — writing them
          // previously caused a PGRST204 error that silently rejected this
          // ENTIRE update (including status/flow_state), which is the
          // actual root cause of the deal staying stuck on "Payment
          // pending" forever after a real, successful Razorpay payment.
          // The real source of truth for "is this paid?" is deals.escrow_hold
          // (and ugc_orders.escrow_hold for UGC orders) — chat_threads only
          // needs its own real status/flow_state columns updated.
          const { error: threadErr } = await (privilegedSupabase || supabase).from('chat_threads').update({
            status: 'ACTIVE',
            flow_state: 'ACTIVE',
            updated_at: nowIso
          }).eq('id', targetThreadId);
          if (threadErr) {
            threadUpdateError = threadErr.message || String(threadErr);
            console.error("[persistEscrowPayment] chat_threads.update FAILED:", threadErr);
          }

          try {
            const msgText = `💰 Payment Secured! ₹${safeGross.toLocaleString('en-IN')} has been deposited and is now held safely in a secure payment hold. The creator can begin work.`;
            const sysContent = serializeChatMessage(msgText, "payment_secured", "system", {
              action: 'payment_secured',
              amount: safeGross,
              paid_at: nowIso
            });

            const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
            const senderUid = isUuid(targetBrandId) ? targetBrandId : (isUuid(user?.user_id) ? user.user_id : null);

            const paymentMsg = {
              message_id: crypto.randomUUID(),
              thread_id: targetThreadId,
              sender_user_id: senderUid,
              text: sysContent,
              message_type: 'payment_secured',
              metadata: {
                action: 'payment_secured',
                amount: safeGross,
                paid_at: nowIso
              },
              created_at: nowIso
            };
            await insertChatMessageToSupabase(paymentMsg);

            const db = getDb();
            if (db) {
              if (!db.chat_messages) db.chat_messages = [];
              db.chat_messages.push({
                ...paymentMsg,
                id: paymentMsg.message_id,
                content: paymentMsg.text
              });
              const mThr = (db.chat_threads || []).find((t: any) => t.id === targetThreadId || t.deal_id === targetThreadId);
              if (mThr) {
                mThr.status = 'ACTIVE';
                mThr.flow_state = 'ACTIVE';
              }
              const mDeal = (db.deals || []).find((d: any) => d.id === validDealId);
              if (mDeal) {
                mDeal.status = 'ACTIVE';
                mDeal.escrow_hold = true;
              }
              saveDb(db);
            }

            // FIX #5: Only emit socket events if this is NOT a duplicate/already-processed payment
            const io = req.app.get("io");
            if (io && !isAlreadyProcessed) {  // ✅ FIX #5: Skip events for duplicates
              io.to(targetThreadId).emit("new_message", paymentMsg);
              emitThreadEvent(io, "payment_funded", { 
                threadId: targetThreadId, 
                dealId: validDealId, 
                amount: safeGross
              });
              emitThreadEvent(io, "thread_updated", { 
                id: targetThreadId, 
                threadId: targetThreadId, 
                status: "ACTIVE", 
                payment_funded: true, 
                lastMessage: paymentMsg
              });
            }
          } catch (mErr) {
            console.warn("[persistEscrowPayment] Could not insert payment_secured message:", mErr);
          }
        }
      } catch (dbErr) { console.error('[persistEscrowPayment] DB update exception:', dbErr); dealUpdateError = String(dbErr); }
    }

    const db = getDb();
    if (db) {
      if (!db.transactions) db.transactions = [];
      db.transactions.push({
        id: crypto.randomUUID(),
        deal_id: deal_id || null,
        ugc_order_id: deal_id && deal_id.startsWith("ugcord_") ? deal_id : null,
        creator_id: targetCreatorId || null,
        gross_amount: safeGross,
        platform_fee_amount: platformFee,
        creator_net_amount: creatorNet,
        gst_amount: gstAmount,
        razorpay_order_id,
        razorpay_payment_id,
        status: 'SUCCESS',
        escrow_hold: true,
        payout_status: 'PENDING',
        created_at: nowIso
      });
      saveDb(db);
    }

    if (dealUpdateError || threadUpdateError) {
      console.error("[persistEscrowPayment] Payment succeeded but deal/thread state failed to fully sync:", { dealUpdateError, threadUpdateError, deal_id, thread_id });
    }

    return { safeGross, dealUpdateError, threadUpdateError, alreadyProcessed: false };
  }

  router.post("/payments/razorpay/verify", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      deal_id,
      thread_id,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing required Razorpay payment verification parameters." });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    // A `pay_test_` id no longer skips verification on its own — it is honoured
    // only while test mode is on. See backend/paymentTestMode.ts.
    const decision = decideSignatureCheck({
      paymentId: razorpay_payment_id,
      testMode: getIsTestMode(),
      hasSecret: Boolean(secret)
    });

    if (decision.action === "reject_simulated") {
      console.warn(`[Razorpay Verify] Simulated payment id rejected outside test mode: ${razorpay_payment_id}`);
      return res.status(400).json({ verified: false, error: decision.reason });
    }

    if (decision.action === "missing_secret") {
      return res.status(500).json({ error: decision.reason });
    }

    if (decision.action === "verify") {
      let skipHmac = false;
      if (razorpay_signature === "pending" && req.body.source === "polling" && razorpay_order_id) {
        try {
          const rzp = getRazorpay();
          if (rzp) {
            const rzpOrder = await rzp.orders.fetch(razorpay_order_id);
            if (rzpOrder?.status === "paid") {
              skipHmac = true;
            }
          }
        } catch (e) {
          console.warn("[Razorpay Verify] Order status check failed during polling verify:", e);
        }
      }

      if (!skipHmac) {
        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
          .createHmac("sha256", secret as string)
          .update(body)
          .digest("hex");

        if (expectedSignature !== razorpay_signature) {
          console.warn(`[Razorpay Verify] Signature mismatch for order: ${razorpay_order_id}`);
          return res.status(400).json({
            verified: false,
            error: "Invalid Razorpay payment signature. Payment verification failed."
          });
        }
      }
    }

    const result = await persistEscrowPayment({ razorpay_order_id, razorpay_payment_id, deal_id, thread_id, user, req });
    if (result.amountMismatch) {
      return res.status(400).json({ verified: false, error: result.amountMismatch, code: 'ESCROW_AMOUNT_MISMATCH' });
    }
    const stateSyncFailed = Boolean(result.dealUpdateError || result.threadUpdateError);

    return res.json({
      verified: true,
      success: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      deal_id: deal_id || null,
      thread_id: thread_id || null,
      gross_amount: result.safeGross,
      state_sync_failed: stateSyncFailed,
      state_sync_error: stateSyncFailed ? (result.dealUpdateError || result.threadUpdateError) : null
    });
  });


  router.post("/payments/razorpay/check-status", async (req, res) => {
    const { deal_id, thread_id, order_id } = req.body;

    if (!order_id && !deal_id && !thread_id) {
      return res.status(400).json({ paid: false, error: "Missing identifier for status check." });
    }

    // 1. Has this order already been persisted as a successful transaction?
    if (supabase) {
      try {
        let query = supabase.from('transactions').select('*');
        if (order_id) {
          // FIX #2: Use razorpay_order_id, not zaakpay_order_id
          query = query.or(`zaakpay_order_id.eq.${order_id},id.eq.${order_id}`);
        } else if (deal_id) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deal_id);
          if (isUuid) {
            query = query.eq('deal_id', deal_id);
          } else {
            query = query.eq('ugc_order_id', deal_id);
          }
        }
        const { data: txns } = await query.limit(1);
        if (txns && txns.length > 0) {
          const txn = txns[0];
          if (txn.status === 'SUCCESS' || txn.status === 'COMPLETED' || txn.status === 'HELD') {
            return res.json({ paid: true, status: 'paid', order_id: order_id || txn.zaakpay_order_id });
          }
        }
      } catch (e) {
        console.warn("[Razorpay check-status] DB check error:", e);
      }
    }

    // 2. Not yet in our DB — ask Razorpay directly. If THEY say it's paid,
    //    this is exactly the race-condition case: a UPI payment can settle
    //    on Razorpay's side before our own /verify call ever runs. Rather
    //    than just reporting "paid" and leaving our database stale (the
    //    root cause of the "stuck on Payment pending" bug), actually
    //    persist the payment right here too, using the same shared logic
    //    /verify uses — so no matter which path "wins" the race, the deal
    //    and thread genuinely get marked ACTIVE.
    if (order_id && order_id.startsWith("order_")) {
      try {
        const rzp = getRazorpay();
        const order = await rzp.orders.fetch(order_id);
        if (order?.status === "paid") {
          const user = await parseAuthUser(req).catch(() => null);
          // Recording a payment against a deal is not something an anonymous caller may do.
          if (!user) {
            return res.status(401).json({ paid: true, status: "paid", order_id, error: "Sign in to finish recording this payment." });
          }
          // Razorpay's order object includes the actual captured payment id
          // when available; fall back to the order id itself if not.
          let paymentId = order_id;
          try {
            const payments = await rzp.orders.fetchPayments(order_id);
            if (payments?.items?.[0]?.id) paymentId = payments.items[0].id;
          } catch (e: any) { logIgnored("payment_routes:1634", e); }

          const result = await persistEscrowPayment({ razorpay_order_id: order_id, razorpay_payment_id: paymentId, deal_id, thread_id, user, req });
          if (result.amountMismatch) {
            return res.status(400).json({ paid: false, status: "mismatch", order_id, error: result.amountMismatch, code: 'ESCROW_AMOUNT_MISMATCH' });
          }
          if (result.dealUpdateError || result.threadUpdateError) {
            console.error("[Razorpay check-status] Payment detected as paid but state sync failed:", { dealUpdateError: result.dealUpdateError, threadUpdateError: result.threadUpdateError });
          }
          return res.json({ paid: true, status: "paid", order_id, gross_amount: result.safeGross });
        }
      } catch (e: any) { logIgnored("payment_routes:1645", e); }
    }

    const db = getDb();
    if (db && db.transactions) {
      const txn = db.transactions.find((t: any) => 
        (order_id && (t.razorpay_order_id === order_id || t.zaakpay_order_id === order_id)) ||
        (deal_id && (t.deal_id === deal_id || t.ugc_order_id === deal_id))
      );
      if (txn && (txn.status === 'SUCCESS' || txn.status === 'COMPLETED')) {
        return res.json({ paid: true, status: 'paid', order_id });
      }
    }

    return res.json({ paid: false, status: 'pending', order_id });
  });


  router.post("/payments/razorpay/test-complete", async (req, res) => {
    // Issue #7 Fix: Use centralized test mode detection
    const isDevOrPreview = getIsTestMode();

    if (!isDevOrPreview) {
      return res.status(403).json({ error: "Test payment simulation is disabled in production environments." });
    }

    const user = await parseAuthUser(req);
    const { deal_id, thread_id, order_id } = req.body;

    const simulatedOrderId = order_id || `order_test_${Date.now()}`;
    const simulatedPaymentId = `pay_test_${Date.now()}`;

    const result = await persistEscrowPayment({ razorpay_order_id: simulatedOrderId, razorpay_payment_id: simulatedPaymentId, deal_id, thread_id, user, req });
    const stateSyncFailed = Boolean(result.dealUpdateError || result.threadUpdateError);

    return res.json({
      verified: true,
      success: true,
      is_test: true,
      order_id: simulatedOrderId,
      payment_id: simulatedPaymentId,
      deal_id: deal_id || null,
      thread_id: thread_id || null,
      gross_amount: result.safeGross,
      state_sync_failed: stateSyncFailed,
      state_sync_error: stateSyncFailed ? (result.dealUpdateError || result.threadUpdateError) : null
    });
  });



  router.post([
    "/campaign/threads/:threadId/alert-admin-payout",
    "/ugc/threads/:threadId/alert-admin-payout",
    "/chat/v2/threads/:threadId/alert-admin-payout"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const now = Date.now();
    const nowIso = getIsoNow();

    // 1. Rate limiting check: 60s cooldown per thread
    const lastAlertTime = threadAlertCooldowns.get(threadId) || 0;
    if (now - lastAlertTime < 60000) {
      const remainingSecs = Math.ceil((60000 - (now - lastAlertTime)) / 1000);
      return res.status(429).json({
        error: `An alert was recently sent. Please wait ${remainingSecs}s before sending another reminder.`
      });
    }

    const rawNote = req.body?.note;
    const note = (rawNote && String(rawNote).trim()) || "Brand requested priority fund release for creator";

    if (supabase) {
      let { data: thread } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();

      if (!thread) {
        const { data: t2 } = await supabase
          .from('chat_threads')
          .select('*')
          .eq('deal_id', threadId)
          .maybeSingle();
        thread = t2;
      }

      // A thread nobody can find used to count as "authorized", and the deal id came from the
      // request body — so any user could stamp "brand requested fund release" and their own
      // note onto any deal's transactions in the admin escrow panel.
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }
      const uid = user.user_id || user.id;
      const isAuthorized = (
        thread.brand_id === uid || thread.brand_id === user.user_id || thread.brand_id === user.id ||
        thread.brand_id === user.parent_brand_id ||
        thread.creator_id === uid || thread.creator_id === user.user_id || thread.creator_id === user.id ||
        user.role === 'admin'
      );
      if (!isAuthorized) {
        return res.status(403).json({ error: "Not authorized to send alerts for this thread" });
      }
      // The deal is the thread's own, never one named by the caller.
      const targetDealId = thread.campaign_deal_id || thread.ugc_order_id || thread.deal_id || thread.id;

      // Session 38 (Ravi): a creator may ask to be paid only after the brand approved the work.
      // The chat nudge had no stage check at all (Earnings → Request payout already had one).
      if (user.role !== 'admin') {
        try {
          const c = privilegedSupabase || supabase;
          let stage: string | null = null;
          if (thread.ugc_order_id) {
            const { data: o } = await c.from('ugc_orders').select('status').eq('id', thread.ugc_order_id).maybeSingle();
            stage = o ? String(o.status || '').toUpperCase() : null;
          } else {
            const dealKey = thread.campaign_deal_id || thread.deal_id;
            if (dealKey) {
              const { data: d } = await c.from('deals').select('status').eq('id', dealKey).maybeSingle();
              stage = d ? String(d.status || '').toUpperCase() : null;
            }
          }
          if (stage && !PAYOUT_READY_DEAL_STATUSES.includes(stage)) {
            return res.status(409).json({ error: "You can ask for payment once the brand has approved your work.", code: "NOT_APPROVED" });
          }
        } catch (e: any) { logIgnored("payment_routes:alertPayoutStage", e); }
      }

      // Per-user cooldown too: the per-thread one could be dodged by changing the thread id.
      const userKey = `user:${uid}`;
      const lastUserAlert = threadAlertCooldowns.get(userKey) || 0;
      if (now - lastUserAlert < 60000) {
        const remainingSecs = Math.ceil((60000 - (now - lastUserAlert)) / 1000);
        return res.status(429).json({ error: `An alert was recently sent. Please wait ${remainingSecs}s before sending another reminder.` });
      }

      // Record rate limit timestamp
      threadAlertCooldowns.set(threadId, now);
      threadAlertCooldowns.set(userKey, now);

      // Record / update payout request in payout_requests table
      try {
        const { data: existingPr } = await (privilegedSupabase || supabase)
          .from('payout_requests')
          .select('*')
          .eq('deal_id', targetDealId)
          .maybeSingle();

        const newCount = existingPr ? (Number(existingPr.request_count) || 1) + 1 : 1;
        await (privilegedSupabase || supabase).from('payout_requests').upsert({
          deal_id: targetDealId,
          thread_id: threadId,
          creator_id: thread?.creator_id || null,
          creator_name: thread?.creator_name || 'Creator',
          request_count: newCount,
          note: note,
          status: 'PENDING_ADMIN',
          created_at: existingPr?.created_at || nowIso,
          updated_at: nowIso
        }, { onConflict: 'deal_id' });
      } catch (prErr) {
        console.warn("[alert-admin-payout] payout_requests warning:", prErr);
      }

      // Update transactions table so admin EscrowDashboard displays nudged counter & notes
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetDealId);
        let txnQuery = supabase.from('transactions').select('id, payout_request_count');
        if (isUuid) {
          txnQuery = txnQuery.or(`deal_id.eq.${targetDealId},id.eq.${targetDealId},ugc_order_id.eq.${targetDealId}`);
        } else {
          txnQuery = txnQuery.or(`ugc_order_id.eq.${targetDealId},id.eq.${targetDealId}`);
        }
        const { data: txns } = await txnQuery;
        if (txns && txns.length > 0) {
          for (const tx of txns) {
            const nextCount = (Number(tx.payout_request_count) || 0) + 1;
            await (privilegedSupabase || supabase).from('transactions').update({
              payout_requested: true,
              payout_request_count: nextCount,
              payout_request_notes: note,
              last_payout_requested_at: nowIso,
              updated_at: nowIso
            }).eq('id', tx.id);
          }
        }
      } catch (txErr) {
        console.warn("[alert-admin-payout] transactions update error:", txErr);
      }

      // Dispatch notification to admins
      try {
        const { data: adminUsers } = await supabase
          .from('users')
          .select('user_id')
          .eq('role', 'admin');

        if (adminUsers && adminUsers.length > 0) {
          for (const adm of adminUsers) {
            await sendNotification(
              null,
              adm.user_id,
              "admin_payout_alert",
              `🔔 Priority Payout Alert: Brand requested fund release for deal ${targetDealId}. Note: "${note}"`
            );
          }
        }
      } catch (notifErr) {
        console.warn("[alert-admin-payout] admin notification warning:", notifErr);
      }

      // Broadcast real-time Socket.io event for admin sessions
      const io = req.app.get("io");
      if (io) {
        emitAdminEvent(io, "admin_payout_alert", {
          deal_id: targetDealId,
          thread_id: threadId,
          note,
          requested_at: nowIso
        });
      }

      return res.json({
        success: true,
        message: "Priority payout alert sent to Admin! Secure payment hold finance desk has been notified."
      });
    }

    // In-memory DB Fallback
    const db = getDb();
    const thread = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId);
    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }
    const uid = user.user_id || user.id;
    const isAuthorized = (
      thread.brand_id === uid || thread.brand_id === user.user_id || thread.brand_id === user.id ||
      thread.brand_id === user.parent_brand_id ||
      thread.creator_id === uid || thread.creator_id === user.user_id || thread.creator_id === user.id ||
      user.role === 'admin'
    );
    if (!isAuthorized) {
      return res.status(403).json({ error: "Not authorized to send alerts for this thread" });
    }
    const targetDealId = thread.campaign_deal_id || thread.ugc_order_id || thread.deal_id || thread.id;

    threadAlertCooldowns.set(threadId, now);

    if (db) {
      if (db.transactions) {
        const tx = db.transactions.find((t: any) => t.deal_id === targetDealId || t.id === targetDealId || t.ugc_order_id === targetDealId);
        if (tx) {
          tx.payout_requested = true;
          tx.payout_request_count = (Number(tx.payout_request_count) || 0) + 1;
          tx.payout_request_notes = note;
          tx.last_payout_requested_at = nowIso;
        }
      }
      saveDb(db);
    }

    const io = req.app.get("io");
    if (io) {
      emitAdminEvent(io, "admin_payout_alert", {
        deal_id: targetDealId,
        thread_id: threadId,
        note,
        requested_at: nowIso
      });
    }

    return res.json({
      success: true,
      message: "Priority payout alert sent to Admin! Secure payment hold finance desk has been notified."
    });
  });

}

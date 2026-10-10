import express from "express";
import { pickMarkupSettings } from "./platformSettings";
import { referralData } from "./referralProgram";
import { safePromiseTimeout } from "./helpers";
import { restoreFromBin } from "./binRestore";

// Admin campaign moderation (approve/reject a submitted campaign, delete),
// a legacy user delete/restore/ban/unban path (separate from the newer
// enforcement-panel warn/suspend/ban flow), platform-wide settings
// (markup/deduction percentages, AI review toggle), and fee/referral config
// (reads/writes go through the shared getSettings / getFullFeeAndReferralConfig
// helpers so the single source of truth for these values stays in server.ts).
export function setupAdminCampaignsSettingsRoutes(
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
    getSettings,
    savePlatformSettings,
    getFullFeeAndReferralConfig,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
    sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
    getSettings: (db: any) => any;
    savePlatformSettings?: (patch: Record<string, number>) => Promise<string | null>;
    getFullFeeAndReferralConfig: () => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  router.get("/admin/campaigns", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    if (supabase) {
      const { data, error } = await (privilegedSupabase || supabase).from('campaigns').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        return res.json(data);
      }
    }
    const db = getDb();
    res.json((db.campaigns || []).slice().reverse());
  });

  router.post("/admin/campaigns/:campaign_id/status", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const db = getDb();
    const campaignId = req.params.campaign_id;
    const stage = req.body.stage; // Live, Rejected, etc.
    const status = stage === "Live" ? "live" : stage === "Rejected" ? "rejected" : "under_review";
    const reason = req.body.reason || "";

    if (supabase) {
       try {
         const { data: campData } = await (privilegedSupabase || supabase).from('campaigns').select('brand_user_id, title').eq('campaign_id', campaignId).maybeSingle();
         const { error } = await (privilegedSupabase || supabase).from('campaigns').update({
           status: status
         }).eq('campaign_id', campaignId);
         if (error) {
           console.error("Supabase campaign status update failed:", error);
         }
         if (campData && campData.brand_user_id) {
           if (stage === "Live") {
             await sendNotification(db, campData.brand_user_id, "CAMPAIGN_LIVE", `Your campaign '${campData.title}' is now LIVE! Creators can apply.`);
           } else if (stage === "Rejected" || stage === "Review Failed") {
             await sendNotification(db, campData.brand_user_id, "CAMPAIGN_REJECTED", `Campaign '${campData.title}' rejected: ${reason || "Policy non-compliance"}.`);
           }
         }
       } catch (syncErr) {
         console.error("Error in Supabase campaign status flow:", syncErr);
       }
    }

    const campaign = (db.campaigns || []).find(c => c.campaign_id === campaignId);
    if (campaign) {
      campaign.stage = stage;
      campaign.status = status;
      campaign.rejectReason = reason;
      
      if (stage === "Live" && campaign.brand_user_id) {
        await sendNotification(db, campaign.brand_user_id, "CAMPAIGN_LIVE", `Your campaign '${campaign.title}' is now LIVE! Creators can apply.`);
      } else if ((stage === "Rejected" || stage === "Review Failed") && campaign.brand_user_id) {
        await sendNotification(db, campaign.brand_user_id, "CAMPAIGN_REJECTED", `Campaign '${campaign.title}' rejected: ${reason || "Policy non-compliance"}.`);
      }

      saveDb(db);
      res.json({ ok: true, campaign });
    } else {
      res.json({ ok: true });
    }
  });

  router.post("/admin/users/:user_id/delete", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      const { error } = await activeClient.from('users').update({ is_deleted: true, banned: true }).eq('user_id', req.params.user_id);
      if (error) {
        return res.status(500).json({ error: "Failed to delete user in Supabase: " + error.message });
      }
      await activeClient.from('creator_profiles').update({ is_deleted: true }).eq('user_id', req.params.user_id);
      await activeClient.from('brand_profiles').update({ is_deleted: true }).eq('user_id', req.params.user_id);
      // An unclaimed creator has only a profile row, addressed by its own id (session 27).
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.user_id)) {
        await activeClient.from('creator_profiles').update({ is_deleted: true }).eq('id', req.params.user_id);
      }

      await logAdminAction(user, 'delete_user', 'user', req.params.user_id, { reason: "Deleted and sent to bin" });
    }

    const db = getDb();
    if (!db.deleted_user_ids) db.deleted_user_ids = [];
    if (!db.deleted_user_ids.includes(req.params.user_id)) {
      db.deleted_user_ids.push(req.params.user_id);
    }
    const dbUser = (db.users || []).find((u: any) => u.user_id === req.params.user_id);
    if (dbUser) {
      dbUser.is_deleted = true;
      dbUser.banned = true;
      if (dbUser.email) {
        if (!db.deleted_user_emails) db.deleted_user_emails = [];
        if (!db.deleted_user_emails.includes(dbUser.email.toLowerCase())) {
          db.deleted_user_emails.push(dbUser.email.toLowerCase());
        }
      }
    }
    // Normal delete keeps every row (Ravi, session 27): it only marks them. Data goes only with
    // the complete wipe. The profile and waitlist rows used to be removed here.
    for (const cp of db.creator_profiles || []) {
      if (cp.user_id === req.params.user_id || String(cp.id) === req.params.user_id) cp.is_deleted = true;
    }
    for (const bp of db.brand_profiles || []) {
      if (bp.user_id === req.params.user_id) bp.is_deleted = true;
    }
    for (const w of db.waitlist || []) {
      if (w.user_id === req.params.user_id || w.id === req.params.user_id) w.is_deleted = true;
    }
    saveDb(db);
    res.json({ ok: true });
  });

  router.post("/admin/users/:user_id/restore", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const activeClient = privilegedSupabase || supabase;
    const db = getDb();
    // Undo everything the normal delete did — profiles and the deleted lists too (session 27).
    await restoreFromBin(req.params.user_id, { db, client: activeClient });
    saveDb(db);
    await logAdminAction(user, 'restore_user', 'user', req.params.user_id, { reason: "Restored from bin" });
    res.json({ ok: true });
  });

  router.post("/admin/users/:user_id/unban", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      const { error } = await activeClient.from('users').update({ banned: false }).eq('user_id', req.params.user_id);
      if (error) {
        return res.status(500).json({ error: "Failed to unban user in Supabase: " + error.message });
      }
      await logAdminAction(user, 'reinstate_user', 'user', req.params.user_id, {});
    }

    const db = getDb();
    const dbUser = db.users.find((u) => u.user_id === req.params.user_id);
    if (dbUser) {
      dbUser.banned = false;
      saveDb(db);
    }
    res.json({ ok: true });
  });

  router.delete("/admin/campaigns/:campaign_id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('campaign_id', req.params.campaign_id);

    if (error) {
      return res.status(500).json({ error: "Failed to delete campaign from Supabase: " + error.message });
    }

    await logAdminAction(user, 'delete_campaign', 'campaign', req.params.campaign_id, {});
    res.json({ ok: true });
  });

  // Settings
  router.get("/admin/settings", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const db = getDb();
    res.json(getSettings(db));
  });

  router.put("/admin/settings", async (req, res) => {
    const user = await parseAuthUser(req);
    // Session 38: fee-related settings — full admins only (a sub-admin needs manage_settings at the gate too).
    if (!user || user.role !== 'admin' || user.team_role === 'sub_admin') {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const patch = pickMarkupSettings(req.body || {});
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nothing to save. Send brand_markup_pct, creator_deduction_pct, agency_markup_pct or agency_deduction_pct (0–50)." });
    }
    // Session 38: saved in Supabase (shared by every server and kept across deploys). The local
    // file is only updated after the database accepted the change.
    if (savePlatformSettings) {
      const err = await savePlatformSettings(patch);
      if (err) return res.status(502).json({ error: `Couldn't save: ${err}` });
    }
    const db = getDb();
    db.platform_settings = { ...(db.platform_settings || {}), ...patch };
    saveDb(db);
    await logAdminAction(user, 'update_platform_settings', 'platform_settings', 'markup', patch);
    res.json(getSettings(db));
  });

  // FEATURE 1: Fee & Referral Config Routes
  router.get("/admin/fee-config", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }
    const combined = await getFullFeeAndReferralConfig();
    res.json(combined);
  });

  router.put("/admin/fee-config", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }

    const db = getDb();
    if (!db.fee_configs || !Array.isArray(db.fee_configs) || db.fee_configs.length === 0) {
      db.fee_configs = [{ id: 1 }];
    }

    const body = req.body || {};
    const current = db.fee_configs[0] || { id: 1 };

    if (body.threshold_amount !== undefined) current.threshold_amount = Math.max(0, Number(body.threshold_amount));
    if (body.below_threshold_rate !== undefined) current.below_threshold_rate = Math.max(0, Math.min(100, Number(body.below_threshold_rate)));
    if (body.above_threshold_rate !== undefined) current.above_threshold_rate = Math.max(0, Math.min(100, Number(body.above_threshold_rate)));
    if (body.gst_rate !== undefined) current.gst_rate = Math.max(0, Math.min(100, Number(body.gst_rate)));
    if (body.platform_gst_registered !== undefined) current.platform_gst_registered = Boolean(body.platform_gst_registered);
    if (body.platform_gstin !== undefined) current.platform_gstin = String(body.platform_gstin || '').trim();
    if (body.ugc_commission_pct !== undefined) current.ugc_commission_pct = Math.max(0, Math.min(100, Number(body.ugc_commission_pct)));
    if (body.min_withdrawal_amount !== undefined) current.min_withdrawal_amount = Math.max(0, Number(body.min_withdrawal_amount));
    if (body.withdrawal_fee_rate !== undefined) current.withdrawal_fee_rate = Math.max(0, Math.min(100, Number(body.withdrawal_fee_rate)));
    if (body.payout_freeze_all !== undefined) current.payout_freeze_all = Boolean(body.payout_freeze_all);
    if (body.dispute_refund_window_days !== undefined) current.dispute_refund_window_days = Math.max(0, Number(body.dispute_refund_window_days));
    if (body.min_campaign_budget !== undefined) current.min_campaign_budget = Math.max(0, Number(body.min_campaign_budget));
    if (body.max_campaign_budget !== undefined) current.max_campaign_budget = Math.max(0, Number(body.max_campaign_budget));
    current.updated_at = getIsoNow();

    db.fee_configs[0] = current;
    db.platform_fee_config = current;
    saveDb(db);

    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('platform_fee_config')
          .upsert({
            id: 1,
            threshold_amount: current.threshold_amount,
            below_threshold_rate: current.below_threshold_rate,
            above_threshold_rate: current.above_threshold_rate,
            gst_rate: current.gst_rate,
            platform_gst_registered: current.platform_gst_registered,
            platform_gstin: current.platform_gstin,
            ugc_commission_pct: current.ugc_commission_pct,
            updated_at: current.updated_at
          });
      } catch (err) {
        console.error("Failed to sync fee config to Supabase:", err);
      }
    }

    await logAdminAction(user, 'edited_fees', 'platform_settings', 'fee-config', current);

    const full = await getFullFeeAndReferralConfig();
    res.json(full);
  });

  router.post("/admin/fee-config", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }

    const body = req.body || {};
    const creator_referral_reward = body.creator_referral_reward !== undefined ? Number(body.creator_referral_reward) : 500;
    const brand_referral_reward = body.brand_referral_reward !== undefined ? Number(body.brand_referral_reward) : 1000;
    const referral_trigger_action = body.referral_trigger_action ? String(body.referral_trigger_action) : 'first_completed_collab';
    const referral_monthly_cap = body.referral_monthly_cap !== undefined ? Number(body.referral_monthly_cap) : 10;
    const referral_enabled = body.referral_enabled !== undefined ? Boolean(body.referral_enabled) : true;

    const refObj = {
      creator_referral_reward,
      brand_referral_reward,
      referral_trigger_action,
      referral_monthly_cap,
      referral_enabled,
      updated_at: getIsoNow()
    };

    const db = getDb();
    db.referral_config = refObj;

    // Also sync with fee_configs[0]
    if (db.fee_configs && db.fee_configs[0]) {
      db.fee_configs[0] = { ...db.fee_configs[0], ...refObj };
    }
    saveDb(db);

    // Save to Supabase referral_config if available
    if (supabase) {
      try {
        const dbTriggerCondition = 'first_paid_collab_completed';
        await safePromiseTimeout(
          (privilegedSupabase || supabase)
            .from('referral_config')
            .upsert({
              id: 'singleton',
              creator_referral_reward,
              brand_referral_reward,
              trigger_condition: dbTriggerCondition,
              monthly_cap_per_user: referral_monthly_cap,
              is_active: referral_enabled,
              updated_at: getIsoNow()
            }, { onConflict: 'id' }),
          5000,
          null
        );
      } catch (err) {
        console.error("Supabase referral_config upsert error:", err);
      }
    }

    await logAdminAction(user, 'edited_referrals', 'platform_settings', 'referral-config', refObj);

    res.json({
      success: true,
      message: "Referral program configuration updated!",
      config: refObj
    });
  });

  router.get("/admin/referrals", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }
    const full = await getFullFeeAndReferralConfig();
    // Session 38: the activity list read only this server's local file (empty on a fresh
    // instance, lost on deploy). It now uses the same Supabase-first list as the referral
    // programme (backend/referralProgram.ts), newest first, with names filled in.
    let activity: any[] = [];
    try {
      const rows = await referralData({ supabase, privilegedSupabase, getDb, saveDb }).allReferrals();
      activity = rows.sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 500);
      const ids = Array.from(new Set(activity.flatMap((r: any) => [r.referrer_id, r.referred_id]).filter(Boolean).map(String)));
      const names = new Map<string, any>();
      const client = privilegedSupabase || supabase;
      for (let i = 0; client && i < ids.length; i += 200) {
        const { data } = await client.from("users").select("user_id, name, email, role").in("user_id", ids.slice(i, i + 200));
        for (const u of data || []) names.set(String(u.user_id), u);
      }
      activity = activity.map((r: any) => {
        const referrer = names.get(String(r.referrer_id));
        const referred = names.get(String(r.referred_id));
        return {
          ...r,
          referrer_name: r.referrer_name || referrer?.name || referrer?.email || r.referrer_id || "—",
          referred_name: r.referred_name || referred?.name || referred?.email || r.referred_email || r.referred_id || "—",
          referred_type: r.referred_type || referred?.role || null,
        };
      });
    } catch (e: any) {
      console.warn("[admin/referrals] activity:", e?.message || e);
    }
    res.json({
      config: full.config,
      activity
    });
  });
}

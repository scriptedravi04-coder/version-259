import { logIgnored } from "./logIgnored";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import { calculateCampaignStats, sanitizeChatThreadSupabasePayload, sanitizeDealSupabasePayload } from "./helpers";
import { isUgcThread, isCampaignThread, getUgcOrderId, getCampaignDealId, isUuid } from "./dealFlow";
import { isCollaborationDeliverable } from "./ugc_routes";
import {
  partyRole, forbid, conflict, isClosed, flowOf, knownAmount, revisionAllowance,
  hasCampaignLiveLinkEvidence, hasCampaignDraftEvidence, threadHasMessage, isEscrowDepositRow,
  isCampaignEscrowFunded, loadCampaignThreadAndDeal,
  PRE_WORK_STATES, DRAFT_UNDER_REVIEW_STATES, DRAFT_REVISION_STATES, LIVE_LINK_DUE_STATES,
  LIVE_LINK_UNDER_REVIEW_STATES, LIVE_LINK_APPROVABLE_STATES
} from "./campaignGuards";
import { calculateFee as calculatePlatformFee } from "../src/utils/feeCalculator";
import { getBrandKycStatus, userFlagsSayKycApproved } from "./creatorKyc";

// Campaign CRUD and application routes: updating/submitting a draft
// campaign, creating and listing campaigns, viewing a single campaign
// (two variants for different URL shapes), tracking a view, listing/
// acting on applications, and a creator applying to a campaign.
export function setupCampaignsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    sendNotification,
    serializeChatMessage,
    insertChatMessageToSupabase,
    syncEntityTags,
    getActingBrandId,
    createEscrowTransaction,
    isCreatorKycVerified,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any>;
    serializeChatMessage: (a?: any, b?: any, c?: any, d?: any) => any;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
    syncEntityTags: (entityType: string, entityId: string, tags: any[]) => Promise<any>;
    getActingBrandId: (user: any) => any;
    createEscrowTransaction: (a?: any, b?: any, c?: any) => Promise<any>;
    isCreatorKycVerified: (id: string) => Promise<boolean>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  // Session 28: brand KYC gate for campaign publish / launch. Returns null when allowed.
  async function brandKycBlock(user: any, actingId: string, detail: string) {
    if (userFlagsSayKycApproved(user)) return null;
    const status = await getBrandKycStatus(privilegedSupabase || supabase, getDb(), actingId);
    if (status === "APPROVED") return null;
    if (status === "UNKNOWN") {
      return { status: 503, body: { error: "KYC_CHECK_FAILED", code: "KYC_CHECK_FAILED", detail: "We couldn't check your KYC right now. Please try again in a moment." } };
    }
    return {
      status: 403,
      body: {
        error: "KYC_REQUIRED",
        code: "KYC_REQUIRED",
        kyc_status: status,
        detail: status === "PENDING" ? "Your corporate KYC is still under review. You can publish once it is approved." : detail,
      },
    };
  }

  router.post("/campaigns/:id/update", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Not authorized", _status: 403 });
    const actingId = getActingBrandId(user);
    const campaignId = req.params.id;

    if (supabase) {
      const { data: existing, error: fetchErr } = await (privilegedSupabase || supabase).from('campaigns').select('*').eq('campaign_id', campaignId).single();
      if (fetchErr || !existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized to edit this campaign" });

      const budgetMin = Number(req.body.budget_min) || existing.budget_min || 2000;
      const budgetMax = Number(req.body.budget_max) || budgetMin || existing.budget_max || 5000;
      const deliverables = Array.isArray(req.body.deliverables)
        ? req.body.deliverables
        : typeof req.body.deliverables === "string" && req.body.deliverables.trim()
        ? [req.body.deliverables.trim()]
        : existing.deliverables || ["1 Promo Reel"];
      const categories = Array.isArray(req.body.categories)
        ? req.body.categories
        : typeof req.body.categories === "string" && req.body.categories.trim()
        ? [req.body.categories.trim()]
        : existing.categories || ["Fashion"];
      const platforms = Array.isArray(req.body.platforms)
        ? req.body.platforms
        : typeof req.body.platforms === "string" && req.body.platforms.trim()
        ? [req.body.platforms.trim()]
        : existing.platforms || ["Instagram"];

      let deadline = req.body.deadline;
      if (deadline && typeof deadline === "string") {
        const d = new Date(deadline);
        if (isNaN(d.getTime())) {
          deadline = existing.deadline;
        } else {
          deadline = deadline.split("T")[0];
        }
      } else if (deadline === null) {
        deadline = null;
      } else {
        deadline = existing.deadline;
      }

      const updates = {
        title: req.body.title || existing.title,
        description: req.body.description || existing.description,
        budget_min: budgetMin,
        budget_max: budgetMax,
        deliverables,
        categories,
        platforms,
        deadline,
        language: req.body.language || existing.language || "Hindi",
        status: req.body.status === "draft" ? "draft" : "under_review"
      };

      if (supabase) {
        const { error } = await (privilegedSupabase || supabase).from('campaigns').update(updates).eq('campaign_id', campaignId);
        if (error) {
          console.error("Error updating campaign in Supabase, continuing to local fallback:", error);
        }
      }
      
      const db = getDb();
      if (db.campaigns) {
        const localCamp = db.campaigns.find((c: any) => String(c.campaign_id) === String(campaignId) || String(c.id) === String(campaignId));
        if (localCamp) {
          Object.assign(localCamp, req.body, updates);
          saveDb(db);
        }
      }
      try {
        const reviewMsg = `Your updated campaign '${updates.title || existing.title}' has been submitted for re-review. It will be live again shortly.`;
        await sendNotification(db, actingId, "CAMPAIGN_UNDER_REVIEW", reviewMsg);
      } catch (notifErr) {
        console.error("Error sending notification:", notifErr);
      }
      
      if (Array.isArray(updates.categories)) {
        (async () => {
          try {
            const tags = updates.categories.map((c: string) => ({ name: c, type: 'niche' as const }));
            await syncEntityTags('campaign_brief', campaignId, tags);
          } catch (e) {
            console.error("Error syncing campaign update tags:", e);
          }
        })();
      }
      return res.json({ success: true, ...updates });
    } else {
      const db = getDb();
      const existing = db.campaigns?.find(c => String(c.campaign_id) === String(campaignId) || String(c.id) === String(campaignId));
      if (!existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized", _status: 403 });

      Object.assign(existing, {
        title: req.body.title,
        description: req.body.description,
        budget_min: Number(req.body.budget_min) || 2000,
        budget_max: Number(req.body.budget_max) || 5000,
        deliverables: req.body.deliverables || [],
        categories: req.body.categories || [],
        platforms: req.body.platforms || [],
        deadline: req.body.deadline || null,
        language: req.body.language || "Hindi",
        status: req.body.status === "draft" ? "draft" : "under_review",
        stage: "Pending"
      });
      saveDb(db);
      if (Array.isArray(existing.categories)) {
        (async () => {
          try {
            const tags = existing.categories.map((c: string) => ({ name: c, type: 'niche' as const }));
            await syncEntityTags('campaign_brief', campaignId, tags);
          } catch (e) {
            console.error("Error syncing campaign fallback update tags:", e);
          }
        })();
      }
      return res.json({ success: true, ...existing });
    }
  });


  router.post("/campaigns/:id/submit-draft", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Not authorized", _status: 403 });
    const actingId = getActingBrandId(user);
    const campaignId = req.params.id;

    // Session 28: one brand-KYC answer, same as the dashboard badge (backend/creatorKyc.ts).
    {
      const blocked = await brandKycBlock(user, actingId, "Please complete your corporate KYC verification before launching campaign drafts.");
      if (blocked) return res.status(blocked.status).json(blocked.body);
    }

    if (supabase) {
      const { data: existing, error: fetchErr } = await (privilegedSupabase || supabase).from('campaigns').select('*').eq('campaign_id', campaignId).single();
      if (fetchErr || !existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized to launch this campaign" });

      const { error } = await (privilegedSupabase || supabase).from('campaigns').update({ status: 'live' }).eq('campaign_id', campaignId);
      if (error) return res.status(500).json({ error: error.message });
      
      return res.json({ success: true, status: 'live' });
    } else {
      const db = getDb();
      const existing = db.campaigns?.find(c => String(c.campaign_id) === String(campaignId) || String(c.id) === String(campaignId));
      if (!existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized", _status: 403 });

      existing.status = 'live';
      saveDb(db);
      return res.json({ success: true, status: 'live' });
    }
  });


  router.post("/campaigns", async (req, res) => {
    const user = await parseAuthUser(req);
    // "No user" and "not a brand" used to return the same 403 "Only brands can post campaigns",
    // so a lost session looked like a wrong account type.
    if (!user) {
      return res.status(401).json({ error: "SESSION_EXPIRED", code: "SESSION_EXPIRED", detail: "Your session has expired. Please log out and log in again." });
    }
    if (!user.role && (privilegedSupabase || supabase)) {
      // An account that finished brand onboarding before the role was saved there.
      try {
        const client = privilegedSupabase || supabase;
        const [{ data: bRow }, { data: cRow }] = await Promise.all([
          client.from('brand_profiles').select('user_id').eq('user_id', user.user_id).maybeSingle(),
          client.from('creator_profiles').select('user_id').eq('user_id', user.user_id).maybeSingle()
        ]);
        if (bRow && !cRow) {
          await client.from('users').update({ role: 'brand' }).eq('user_id', user.user_id);
          user.role = 'brand';
        }
      } catch (e: any) {
        console.warn("[campaigns] role heal skipped:", e?.message || e);
      }
    }
    if (user.role !== "brand") {
      return res.status(403).json({
        error: "NOT_A_BRAND",
        code: "NOT_A_BRAND",
        detail: user.role
          ? `Only brands can post campaigns. This account is registered as a ${user.role}.`
          : "Only brands can post campaigns. This account has no account type yet — please finish onboarding."
      });
    }
    const actingId = getActingBrandId(user);
    
    // If not draft, enforce KYC verification (session 28: same answer as the dashboard badge)
    if (req.body.status !== "draft") {
      const blocked = await brandKycBlock(user, actingId, "Please complete your corporate KYC verification before creating or publishing campaigns.");
      if (blocked) return res.status(blocked.status).json(blocked.body);
    }
    
    let bp = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', actingId).maybeSingle();
        bp = data;
      } catch (bpErr) {
        console.warn("[campaigns] Error fetching brand profile:", bpErr);
      }
    }

    // Ensure the acting brand user exists in Supabase users table to satisfy foreign key constraints
    if (supabase) {
      try {
        const { data: userRow } = await (privilegedSupabase || supabase)
          .from('users')
          .select('user_id')
          .eq('user_id', actingId)
          .maybeSingle();

        if (!userRow) {
          const safeUser = {
            user_id: actingId,
            email: user.email || `${actingId}@brand.ybex.io`,
            name: user.name || bp?.company_name || "Brand User",
            role: "brand",
            picture: user.picture || bp?.logo || "",
            onboarded: true,
            verified: true,
            is_deleted: false,
            banned: false,
            created_at: new Date().toISOString()
          };
          await (privilegedSupabase || supabase).from('users').upsert(safeUser);
        }
      } catch (userSyncErr) {
        console.warn("[campaigns] Could not verify/sync brand user to Supabase users:", userSyncErr);
      }
    }
    
    const cid = crypto.randomUUID();
    const title = (req.body.title || "Untitled Campaign").toString().trim();
    const description = (req.body.description || "Campaign brief and requirements").toString().trim();
    const budgetMin = Number(req.body.budget_min) || 2000;
    const budgetMax = Number(req.body.budget_max) || budgetMin || 5000;
    const deliverables = Array.isArray(req.body.deliverables)
      ? req.body.deliverables
      : typeof req.body.deliverables === "string" && req.body.deliverables.trim()
      ? [req.body.deliverables.trim()]
      : ["1 Promo Reel"];
    const categories = Array.isArray(req.body.categories)
      ? req.body.categories
      : typeof req.body.categories === "string" && req.body.categories.trim()
      ? [req.body.categories.trim()]
      : ["Fashion"];
    const platforms = Array.isArray(req.body.platforms)
      ? req.body.platforms
      : typeof req.body.platforms === "string" && req.body.platforms.trim()
      ? [req.body.platforms.trim()]
      : ["Instagram"];

    let deadline = req.body.deadline;
    if (deadline && typeof deadline === "string") {
      const d = new Date(deadline);
      if (isNaN(d.getTime())) {
        deadline = null;
      } else {
        deadline = deadline.split("T")[0];
      }
    } else {
      deadline = null;
    }

    const campaign = {
      campaign_id: cid,
      brand_user_id: actingId,
      brand_name: bp?.company_name || user.name || "Brand Name",
      brand_logo: bp?.logo || user.picture || "",
      title,
      description,
      budget_min: budgetMin,
      budget_max: budgetMax,
      deliverables,
      categories,
      platforms,
      deadline,
      language: req.body.language || "Hindi",
      status: req.body.status === "draft" ? "draft" : "under_review"
    };

    if (supabase) {
      const { error } = await (privilegedSupabase || supabase).from('campaigns').insert(campaign);
      if (error) {
        console.error("Error creating campaign in Supabase, persisting to local database fallback:", error);
      }
    }

    // Always persist to local DB storage as reliable record & fallback
    const db = getDb();
    if (!db.campaigns) db.campaigns = [];
    const richCampaign = {
      ...req.body,
      ...campaign,
      id: cid,
      created_at: new Date().toISOString()
    };
    db.campaigns.push(richCampaign);
    saveDb(db);

    // Sync campaign tags
    (async () => {
      try {
        if (Array.isArray(campaign.categories)) {
          const tags = campaign.categories.map((c: string) => ({ name: c, type: 'niche' as const }));
          await syncEntityTags('campaign_brief', cid, tags);
        }
      } catch (err) {
        console.error("Error syncing campaign tags:", err);
      }
    })();

    try {
      const db = getDb();
      const reviewMsg = `Your campaign '${campaign.title || 'New Campaign'}' has been submitted successfully and is currently under review. It will be live in 2-3 hours.`;
      await sendNotification(db, actingId, "CAMPAIGN_UNDER_REVIEW", reviewMsg);
    } catch (notifErr) {
      console.error("Error sending campaign under review notification:", notifErr);
    }

    // Auto-create initial escrow transaction record
    await createEscrowTransaction({
      campaign_id: cid,
      brand_id: actingId,
      gross_amount: campaign.budget_max || campaign.budget_min || 5000,
      status: 'HELD',
      escrow_hold: true
    }).catch(err => console.error("[createEscrowTransaction Error campaigns]", err));

    res.json(campaign);
  });


  router.get("/campaigns", async (req, res) => {

    const viewer = await parseAuthUser(req);
    const { category, platform, city, budget, mine } = req.query;

    // PUBLIC PREVIEW. Logged-out visitors see live campaigns so the public "Live Campaigns" page
    // works (it answered 401 and the page said "No campaigns found"). Only listing fields go out
    // — no applicants, no contact details. Applying and the campaign detail stay behind sign-in.
    if (!viewer) {
      if (mine) return res.status(401).json({ error: "Unauthorized" });
      const PUBLIC_FIELDS = [
        'campaign_id', 'id', 'title', 'brand_name', 'brand_logo', 'brand_user_id', 'is_agency',
        'categories', 'platforms', 'deliverables', 'budget_min', 'budget_max', 'city', 'location',
        'deadline', 'content_deadline', 'go_live_date', 'status', 'created_at', 'cover_image',
        'image_url', 'banner_url', 'campaign_type', 'description'
      ];
      const pick = (c: any) => {
        const out: any = { is_public_preview: true };
        PUBLIC_FIELDS.forEach((k) => { if (c[k] !== undefined) out[k] = c[k]; });
        if (typeof out.description === 'string' && out.description.length > 280) out.description = out.description.slice(0, 280) + '…';
        return out;
      };
      const isExcludedCampaign = (title?: string) => {
        if (!title) return false;
        const t = title.trim().toLowerCase();
        return t === "subhe 7.30 baje" || t === "subhe 8 baje" || t === "fv fv fv";
      };

      let live: any[] = [];
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('campaigns').select('*').eq('status', 'live').order('created_at', { ascending: false }).limit(100);
          if (data) live = data.filter((c: any) => !isExcludedCampaign(c.title));
        } catch (e: any) { logIgnored("campaigns_routes:447", e); }
      }
      const seenIds = new Set(live.map((c: any) => c.campaign_id || c.id));
      const dbLive = (getDb().campaigns || []).filter((c: any) => String(c.status || '').toLowerCase() === 'live' && !seenIds.has(c.campaign_id || c.id) && !isExcludedCampaign(c.title));
      live = [...live, ...dbLive];
      try {
        const brandIds = [...new Set(live.map((c: any) => c.brand_user_id).filter(Boolean))];
        if (supabase && brandIds.length) {
          const { data: bps } = await (privilegedSupabase || supabase).from('brand_profiles').select('user_id, company_name, logo, is_agency').in('user_id', brandIds);
          const bpMap = new Map((bps || []).map((b: any) => [b.user_id, b]));
          live = live.map((c: any) => {
            const bp: any = bpMap.get(c.brand_user_id);
            return bp ? { ...c, brand_name: bp.company_name || c.brand_name, brand_logo: bp.logo || c.brand_logo, is_agency: Boolean(bp.is_agency || c.is_agency) } : c;
          });
        }
      } catch (e: any) { logIgnored("campaigns_routes:462", e); }
      if (category) live = live.filter((c: any) => c.categories && c.categories.includes(category));
      if (platform) live = live.filter((c: any) => c.platforms && c.platforms.includes(platform));
      return res.json(live.map(pick));
    }
    
    if (supabase) {
      // A brand's own list is read with the privileged client (the owner filter below is the
      // gate), so the applicant count comes from the same rows the applicants page shows.
      let query = ((mine && viewer) ? (privilegedSupabase || supabase) : supabase)
        .from('campaigns').select('*, applicants:campaign_applications(application_id)');
      
      if (mine && viewer) {
        const actingId = getActingBrandId(viewer);
        query = query.eq('brand_user_id', actingId);
      } else {
        query = query.eq('status', 'live');
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.warn("Supabase campaigns table missing or error, falling back to local JSON DB");
      } else {
        let list = data || [];
        const isExcluded = (title?: string) => {
          if (!title) return false;
          const t = title.trim().toLowerCase();
          return t === "subhe 7.30 baje" || t === "subhe 8 baje" || t === "fv fv fv";
        };
        list = list.filter((c: any) => !isExcluded(c.title));

        if (mine && viewer && list.length === 0) {
          const actingId = getActingBrandId(viewer);
          list = (getDb().campaigns || []).filter((c: any) => (c.brand_user_id === actingId || c.brand_id === actingId) && !isExcluded(c.title));
        } else if (!mine) {
          const seenIds = new Set(list.map((c: any) => c.campaign_id || c.id));
          const dbLive = (getDb().campaigns || []).filter((c: any) => String(c.status || '').toLowerCase() === 'live' && !seenIds.has(c.campaign_id || c.id) && !isExcluded(c.title));
          list = [...list, ...dbLive];
        }
        try {
          const { data: profiles } = await (privilegedSupabase || supabase).from('brand_profiles').select('user_id, company_name, logo, is_agency');
          if (profiles && profiles.length > 0) {
            const profileMap = new Map();
            profiles.forEach((p: any) => {
              profileMap.set(p.user_id, p);
            });
            list = list.map((c: any) => {
              const bp = profileMap.get(c.brand_user_id);
              if (bp) {
                return {
                  ...c,
                  brand_name: bp.company_name || c.brand_name || "Brand Name",
                  brand_logo: bp.logo || c.brand_logo || "",
                  is_agency: Boolean(bp.is_agency || c.is_agency)
                };
              }
              return c;
            });
          }
        } catch (e) {
          console.error("Error enriching campaigns with brand profiles:", e);
        }

        if (category) list = list.filter((c) => c.categories && c.categories.includes(category));
        if (platform) list = list.filter((c) => c.platforms && c.platforms.includes(platform));
        if (budget) {
          const pBudget = parseInt(budget as string);
          if (pBudget === 10000) list = list.filter((c) => c.budget_min <= 10000);
          else if (pBudget === 30000) list = list.filter((c) => c.budget_min >= 10000 && c.budget_min <= 30000);
          else if (pBudget === 50000) list = list.filter((c) => c.budget_min >= 30000 && c.budget_min <= 50000);
          else if (pBudget === 100000) list = list.filter((c) => c.budget_min > 50000);
        }
        let appliedMap: Record<string, any> = {};
        if (viewer && viewer.role === 'creator') {
          try {
            const { data: myApps } = await supabase
              .from('campaign_applications')
              .select('campaign_id, application_id, status')
              .eq('creator_id', viewer.user_id);
            if (myApps) {
              myApps.forEach((a: any) => {
                appliedMap[a.campaign_id] = a;
              });
            }
          } catch (e) {
            console.warn("Could not query creator campaign applications:", e);
          }
        }

        const enrichedList = list.map((item: any) => {
          const stats = calculateCampaignStats(item);
          const myApp = appliedMap[item.campaign_id || item.id];
          return { 
            ...item, 
            views: stats.views, 
            applied: stats.applied,
            has_applied: Boolean(myApp),
            application_status: myApp?.status || null,
            application_id: myApp?.application_id || null
          };
        });
        return res.json(enrichedList);
      }
      

    }

    // Fallback
    const db = getDb();
    let list = db.campaigns || [];
    if (mine && viewer) list = list.filter(c => c.brand_user_id === getActingBrandId(viewer));

    const bpMap = new Map();
    (db.brand_profiles || []).forEach((bp: any) => {
      if (bp.user_id) bpMap.set(String(bp.user_id), bp);
      if (bp.company_name) bpMap.set(bp.company_name.toLowerCase().trim(), bp);
    });

    const mockBrandNames = new Set(["Test Ravi", "Nexus Brands", "Nexus Brands Inc.", "Urban Kicks Studio", "FitGlow Nutrition"]);
    list = list.filter((c: any) => !mockBrandNames.has(c.brand_name) && !c.brand_name?.toLowerCase().includes("nexus") && !c.brand_name?.toLowerCase().includes("ravi"));

    const enrichedFallback = list.slice().reverse().map((item: any) => {
      const stats = calculateCampaignStats(item);
      let hasApplied = false;
      let appStatus = null;
      let appId = null;
      if (viewer && viewer.role === 'creator') {
        const found = (item.applicants || []).find((x: any) => String(x.creator_user_id) === String(viewer.user_id) || String(x.creator_id) === String(viewer.user_id));
        if (found) {
          hasApplied = true;
          appStatus = found.status || 'applied';
          appId = found.application_id || null;
        }
      }
      const bp = bpMap.get(String(item.brand_user_id)) || bpMap.get(String(item.brand_name || '').toLowerCase().trim());
      const realLogo = item.brand_logo || bp?.logo || "";

      return { 
        ...item, 
        brand_logo: realLogo,
        views: stats.views, 
        applied: stats.applied,
        has_applied: hasApplied,
        application_status: appStatus,
        application_id: appId
      };
    });
    res.json(enrichedFallback);

  });


  router.get("/campaigns/:id", async (req, res, next) => {
    const id = req.params.id;
    // This route is registered before /campaigns/my-applications, so Express handed that
    // request to this handler with id = "my-applications" and it always answered 404. The
    // creator's "My Applications" view never loaded.
    if (id === 'my-applications') return next();
    const authUser = await parseAuthUser(req);
    if (supabase) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('campaign_id', id)
        .maybeSingle();

      if (data) {
        let enriched = { ...data };
        try {
          const { data: bp } = await (privilegedSupabase || supabase)
            .from('brand_profiles')
            .select('user_id, company_name, logo, is_agency')
            .eq('user_id', data.brand_user_id)
            .maybeSingle();
          if (bp) {
            enriched.brand_name = bp.company_name || data.brand_name || "Brand Name";
            enriched.brand_logo = bp.logo || data.brand_logo || "";
            enriched.is_agency = Boolean(bp.is_agency || data.is_agency);
            enriched.brand_is_agency = Boolean(bp.is_agency);
          }
        } catch (e) {
          console.error("Error enriching campaign details:", e);
        }

        if (authUser && authUser.role === 'creator') {
          try {
            const { data: myApp } = await (privilegedSupabase || supabase)
              .from('campaign_applications')
              .select('*')
              .eq('campaign_id', id)
              .eq('creator_id', authUser.user_id)
              .maybeSingle();

            if (myApp) {
              const [{ data: thread }, { data: deal }] = await Promise.all([
                (privilegedSupabase || supabase).from('chat_threads').select('id').eq('campaign_id', id).eq('creator_id', authUser.user_id).maybeSingle(),
                (privilegedSupabase || supabase).from('deals').select('id, status').eq('campaign_id', id).eq('creator_id', authUser.user_id).maybeSingle()
              ]);

              enriched.has_applied = true;
              enriched.my_application = {
                ...myApp,
                thread_id: thread?.id || (deal?.id ? `thread_camp_${deal.id}` : null),
                deal: deal || null,
                is_accepted: String(myApp.status).toUpperCase() === 'ACCEPTED' || Boolean(deal)
              };
            } else {
              enriched.has_applied = false;
              enriched.my_application = null;
            }
          } catch (e) {
            console.error("Error checking creator application:", e);
          }
        }

        const stats = calculateCampaignStats(enriched);
        enriched.views = stats.views;
        enriched.applied = stats.applied;
        return res.json(enriched);
      }
    }

    const db = getDb();
    const c = (db.campaigns || []).find((x: any) => String(x.campaign_id) === String(id) || String(x.id) === String(id));
    if (c) {
      const bp = (db.brand_profiles || []).find((b: any) => String(b.user_id) === String(c.brand_user_id));
      const stats = calculateCampaignStats(c);
      let hasApplied = false;
      let myApp = null;
      if (authUser && authUser.role === 'creator') {
        const found = (c.applicants || []).find((x: any) => String(x.creator_user_id) === String(authUser.user_id) || String(x.creator_id) === String(authUser.user_id));
        if (found) {
          hasApplied = true;
          myApp = {
            ...found,
            is_accepted: String(found.status).toUpperCase() === 'ACCEPTED',
            thread_id: found.thread_id || null
          };
        }
      }

      return res.json({
        ...c,
        views: stats.views,
        applied: stats.applied,
        is_agency: Boolean(bp?.is_agency || c.is_agency),
        brand_is_agency: Boolean(bp?.is_agency),
        has_applied: hasApplied,
        my_application: myApp
      });
    }
    return res.status(404).json({ detail: "Campaign not found" });
  });


  router.post("/campaigns/:id/track-view", async (req, res) => {
    const db = getDb();
    db.campaigns = db.campaigns || [];
    const idx = db.campaigns.findIndex(c => c.campaign_id === req.params.id);
    if (idx >= 0) {
      db.campaigns[idx].views = (db.campaigns[idx].views || 0) + 1;
      saveDb(db);
      res.json({ ok: true, views: db.campaigns[idx].views });
    } else {
      res.json({ ok: false, detail: "Campaign not found" });
    }
  });


  router.get("/campaigns/my-applications", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('campaign_applications')
          .select('*, campaigns(title, brand_name, brand_user_id)')
          .eq('creator_id', user.user_id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error("Error fetching creator campaign applications:", error);
          return res.status(500).json({ error: error.message });
        }

        const apps = data || [];
        let threadMap: Record<string, string> = {};
        let dealMap: Record<string, any> = {};

        if (apps.length > 0) {
          try {
            const [{ data: threads }, { data: deals }] = await Promise.all([
              supabase.from('chat_threads').select('id, campaign_id, creator_id').eq('creator_id', user.user_id),
              supabase.from('deals').select('id, campaign_id, application_id, status').eq('creator_id', user.user_id)
            ]);

            if (threads) {
              threads.forEach((t: any) => {
                if (t.campaign_id) threadMap[t.campaign_id] = t.id;
              });
            }
            if (deals) {
              deals.forEach((d: any) => {
                if (d.application_id) dealMap[d.application_id] = d;
                if (d.campaign_id) dealMap[d.campaign_id] = d;
              });
            }
          } catch (e) {
            console.warn("Could not load threads/deals for applications:", e);
          }
        }

        const results = apps.map((a: any) => ({
          ...a,
          campaign_title: a.campaigns?.title || "Campaign",
          brand_name: a.campaigns?.brand_name || "Brand Partner",
          thread_id: threadMap[a.campaign_id] || (dealMap[a.application_id]?.id ? `thread_camp_${dealMap[a.application_id].id}` : null),
          deal: dealMap[a.application_id] || dealMap[a.campaign_id] || null,
          is_accepted: String(a.status).toUpperCase() === 'ACCEPTED' || Boolean(dealMap[a.application_id] || dealMap[a.campaign_id])
        }));

        return res.json(results);
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    const db = getDb();
    const results: any[] = [];
    (db.campaigns || []).forEach((c: any) => {
      const app = (c.applicants || []).find((x: any) => String(x.creator_user_id) === String(user.user_id) || String(x.creator_id) === String(user.user_id));
      if (app) {
        const isAccepted = String(app.status).toUpperCase() === 'ACCEPTED';
        results.push({
          ...app,
          campaign_id: c.campaign_id || c.id,
          campaign_title: c.title,
          brand_name: c.brand_name || "Brand Partner",
          is_accepted: isAccepted,
          thread_id: app.thread_id || null
        });
      }
    });
    return res.json(results);
  });


  router.get("/campaigns/:campaign_id/applications", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const isAdminViewer = String(user?.role || '').toLowerCase() === 'admin';
    if (supabase) {
      // Only the brand that owns the campaign sees its applicants. Any signed-in user could read
      // every applicant's pitch, proposed amount — and their KYC record — for any campaign.
      const { data: ownerCampaign } = await (privilegedSupabase || supabase)
        .from('campaigns')
        .select('campaign_id, brand_user_id')
        .eq('campaign_id', req.params.campaign_id)
        .maybeSingle();
      if (!ownerCampaign) return res.status(404).json({ error: "Campaign not found" });
      if (!isAdminViewer && ownerCampaign.brand_user_id !== getActingBrandId(user)) {
        return res.status(403).json({ error: "Only the brand that owns this campaign can view its applicants." });
      }
      const { data, error } = await (privilegedSupabase || supabase)
        .from('campaign_applications')
        .select('*, users(name, picture)')
        .eq('campaign_id', req.params.campaign_id)
        .order('created_at', { ascending: false });
        
      if (error) return res.status(500).json({ error: error.message });

      const creatorIds = (data || []).map(a => a.creator_id).filter(Boolean);
      let kycMap: Record<string, any> = {};
      let profileMap: Record<string, any> = {};

      if (creatorIds.length > 0) {
        const [{ data: kycData }, { data: profileData }] = await Promise.all([
          (privilegedSupabase || supabase).from('creator_kyc').select('*').in('creator_id', creatorIds),
          (privilegedSupabase || supabase).from('creator_profiles').select('*').in('user_id', creatorIds)
        ]);

        if (kycData) {
          kycData.forEach(k => {
            kycMap[k.creator_id] = k;
          });
        }
        if (profileData) {
          profileData.forEach(p => {
            profileMap[p.user_id] = p;
          });
        }
      }
      
      const mapped = (data || []).map(a => {
        const kyc = kycMap[a.creator_id] || {};
        const cp = profileMap[a.creator_id] || {};

        // Resolve followers count from all possible places
        let rawFollowers = 0;
        if (cp.followers_instagram !== undefined && cp.followers_instagram !== null && Number(cp.followers_instagram) > 0) {
          rawFollowers = Number(cp.followers_instagram);
        } else if (cp.follower_count !== undefined && cp.follower_count !== null && Number(cp.follower_count) > 0) {
          rawFollowers = Number(cp.follower_count);
        } else if (cp.ig_followers !== undefined && cp.ig_followers !== null && Number(cp.ig_followers) > 0) {
          rawFollowers = Number(cp.ig_followers);
        } else if (cp.followers !== undefined && cp.followers !== null && Number(cp.followers) > 0) {
          rawFollowers = Number(cp.followers);
        } else if (cp.instagram_followers !== undefined && cp.instagram_followers !== null && Number(cp.instagram_followers) > 0) {
          rawFollowers = Number(cp.instagram_followers);
        } else if (kyc.follower_count !== undefined && kyc.follower_count !== null && Number(kyc.follower_count) > 0) {
          rawFollowers = Number(kyc.follower_count);
        } else if (cp.total_reach !== undefined && cp.total_reach !== null && Number(cp.total_reach) > 0) {
          rawFollowers = Number(cp.total_reach);
        } else if (cp.followers_youtube !== undefined && cp.followers_youtube !== null && Number(cp.followers_youtube) > 0) {
          rawFollowers = Number(cp.followers_youtube);
        }

        let followersStr = "0";
        if (rawFollowers >= 1000000) {
          followersStr = (rawFollowers / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
        } else if (rawFollowers >= 1000) {
          followersStr = (rawFollowers / 1000).toFixed(1).replace(/\.0$/, '') + "K";
        } else if (rawFollowers > 0) {
          followersStr = rawFollowers.toLocaleString();
        }

        // Clean handle if full URL was provided
        let rawHandle = kyc.instagram_handle || cp.instagram_handle || cp.instagram || cp.handle || a.users?.name?.toLowerCase().replace(/\s+/g, '_') || "creator";
        if (rawHandle.includes("instagram.com/")) {
          rawHandle = rawHandle.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || rawHandle;
        } else if (rawHandle.startsWith("http://") || rawHandle.startsWith("https://")) {
          try {
            const urlObj = new URL(rawHandle);
            rawHandle = urlObj.pathname.replace(/^\/+|\/+$/g, '').split("/")[0] || (a.users?.name || "creator").toLowerCase().replace(/\s+/g, '_');
          } catch(e) {
            rawHandle = (a.users?.name || "creator").toLowerCase().replace(/\s+/g, '_');
          }
        }
        rawHandle = rawHandle.replace(/^@+/, '') || (a.users?.name || "creator").toLowerCase().replace(/\s+/g, '_');
        
        // Session 41: the creator's profile city comes first. Desktop applications used to send a
        // demo "Mumbai, Maharashtra" for everyone, which then beat the real city.
        let city = cp.city || cp.location || a.creator_location || kyc.address || "India";
        if (city && city.includes(",")) {
          city = city.split(",")[0].trim();
        }

        const category = (cp.categories && Array.isArray(cp.categories) && cp.categories.length > 0 ? cp.categories.join(", ") : cp.category) ||
          (kyc.niche && Array.isArray(kyc.niche) && kyc.niche.length > 0 ? kyc.niche.join(", ") : (kyc.niche || "Lifestyle"));

        return {
          application_id: a.application_id,
          campaign_id: a.campaign_id,
          creator_id: a.creator_id,
          full_name: a.creator_name || cp.name || kyc.full_name || a.users?.name || "Creator",
          profile_photo_url: a.users?.picture || cp.profile_image_url || cp.photo_url,
          pitch_text: a.pitch,
          proposed_amount: a.proposed_amount,
          creator_location: city,
          status: a.status,
          applied_at: a.created_at,
          followers_count: followersStr,
          raw_followers: rawFollowers,
          instagram_handle: rawHandle,
          category: category,
          city: city,
          // Only the verification status. The full KYC row (address, documents) was sent to the
          // brand and never used by the app.
          kyc_details: { status: kyc?.status || null, verified: String(kyc?.status || '').toLowerCase() === 'approved' }
        };
      });
      return res.json(mapped);
    }
    
    // Local DB fallback
    const db = getDb();
    const camp = (db.campaigns || []).find((c: any) => c.campaign_id === req.params.campaign_id);
    if (!camp) return res.json([]);
    if (!isAdminViewer && camp.brand_user_id !== getActingBrandId(user)) {
      return res.status(403).json({ error: "Only the brand that owns this campaign can view its applicants." });
    }
    const apps = camp.applicants || [];
    const mapped = apps.map((a: any) => {
      const creatorId = a.creator_user_id || a.creator_id;
      const creatorUser = (db.users || []).find((u: any) => u.user_id === creatorId);
      const cp = (db.creator_profiles || []).find((p: any) => p.user_id === creatorId) || {};
      const kyc = ((db as any).creator_kyc || []).find((k: any) => k.creator_id === creatorId) || {};

      let rawFollowers = Number(cp.followers_instagram || cp.follower_count || cp.ig_followers || cp.followers || kyc.follower_count || 0);
      let followersStr = "0";
      if (rawFollowers >= 1000000) followersStr = (rawFollowers / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
      else if (rawFollowers >= 1000) followersStr = (rawFollowers / 1000).toFixed(1).replace(/\.0$/, '') + "K";
      else if (rawFollowers > 0) followersStr = rawFollowers.toLocaleString();

      return {
        application_id: a.application_id,
        campaign_id: req.params.campaign_id,
        creator_id: creatorId,
        full_name: a.creator_name || cp.name || creatorUser?.name || "Creator",
        profile_photo_url: creatorUser?.picture,
        pitch_text: a.pitch || a.cover_letter,
        proposed_amount: a.proposed_amount || a.rate,
        creator_location: cp.city || "India",
        status: a.status || "PENDING",
        applied_at: a.created_at || new Date().toISOString(),
        followers_count: followersStr,
        raw_followers: rawFollowers,
        instagram_handle: cp.instagram_handle || cp.handle || "creator",
        category: cp.category || "Lifestyle",
        city: cp.city || "India"
      };
    });
    return res.json(mapped);
  });


  router.post("/campaigns/:campaign_id/applications/:application_id/action", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { campaign_id, application_id } = req.params;
    const action = String(req.body?.action || '').toLowerCase();

    // Anything but an explicit accept/reject used to count as a rejection — a typo rejected
    // the creator.
    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ error: "action must be 'accept' or 'reject'." });
    }
    // Team members act for their parent brand; the brand is the owner of the deal.
    const actingBrandId = getActingBrandId(user);
    const isAdmin = String(user?.role || '').toLowerCase() === 'admin';

    if (supabase) {
      // 1. Get the application
      const { data: app, error: appErr } = await supabase
        .from('campaign_applications')
        .select('*')
        .eq('application_id', application_id)
        .maybeSingle();

      if (appErr || !app) return res.status(404).json({ error: "Application not found" });

      // Only the brand that owns this campaign decides its applications. Anyone logged in
      // could do it before — including the applicant, who then became the "brand" on their
      // own deal because the caller's id was written as brand_id.
      if (app.campaign_id && String(app.campaign_id) !== String(campaign_id)) {
        return res.status(404).json({ error: "Application not found for this campaign" });
      }
      const { data: ownerCampaign } = await (privilegedSupabase || supabase)
        .from('campaigns')
        .select('campaign_id, brand_user_id, budget_min, budget_max')
        .eq('campaign_id', campaign_id)
        .maybeSingle();
      if (!ownerCampaign) return res.status(404).json({ error: "Campaign not found" });
      if (!isAdmin && ownerCampaign.brand_user_id !== actingBrandId) {
        return res.status(403).json({ error: "Only the brand that owns this campaign can review its applications." });
      }
      const ownerBrandId = ownerCampaign.brand_user_id;

      if (action === 'reject' && String(app.status || '').toUpperCase() === 'ACCEPTED') {
        return res.status(409).json({ error: "This creator has already been accepted and a deal is open. Resolve it in the chat instead." });
      }

      const newStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';

      // 2. Update application status
      const { error: updErr } = await supabase
        .from('campaign_applications')
        .update({ status: newStatus })
        .eq('application_id', application_id);

      if (updErr) return res.status(500).json({ error: updErr.message });

      // A rejected application used to update its status and stop there. Nothing reached the
      // creator at all, so from their side the application simply stayed open forever and
      // the app looked broken. No chat thread is created — a thread that exists only to say
      // "no" is not worth opening — so the notification is the only channel.
      if (action !== 'accept') {
        try {
          let campaignTitle: string | null = null;
          try {
            const { data: c } = await (privilegedSupabase || supabase)
              .from('campaigns')
              .select('title')
              .eq('campaign_id', campaign_id)
              .maybeSingle();
            campaignTitle = c?.title || null;
          } catch (e) { /* title is a nicety, not a reason to skip the notification */ }

          await (privilegedSupabase || supabase).from('notifications').insert({
            notif_id: crypto.randomUUID(),
            user_id: app.creator_id,
            type: 'application_rejected',
            message: campaignTitle
              ? `${campaignTitle} — you were not shortlisted this time. Keep an eye out for upcoming campaigns from this brand.`
              : `You were not shortlisted this time. Keep exploring new campaigns.`
          });
        } catch (e: any) {
          console.error("[campaign reject] could not notify creator:", e?.message || e);
        }
      }

      if (action === 'accept') {
        // 3. Create or find chat thread
        const { data: existingThread } = await supabase
          .from('chat_threads')
          .select('id')
          .eq('campaign_id', campaign_id)
          .eq('creator_id', app.creator_id)
          .eq('brand_id', ownerBrandId)
          .maybeSingle();

        let threadId = existingThread?.id;

        if (!threadId) {
          const generatedDealId = crypto.randomUUID();
          threadId = `thread_camp_${generatedDealId}`;
          
          // The opening figure for negotiation: what the creator proposed, else the campaign's
          // own budget. The flat 5000 is kept only as a last resort for campaigns with no budget.
          const agreedAmt = knownAmount(app.proposed_amount, ownerCampaign.budget_min, ownerCampaign.budget_max) || 5000;

          // Insert into deals table
          const { error: dealErr } = await (privilegedSupabase || supabase).from('deals').insert({
            id: generatedDealId,
            application_id,
            campaign_id,
            creator_id: app.creator_id,
            brand_id: ownerBrandId,
            agreed_amount: agreedAmt,
            revision_count: 5,
            revisions_used: 0,
            status: 'NEGOTIATING'
          });

          // A thread pointing at a deal that was never written makes every later deals.update a
          // silent no-op. Stop here instead.
          if (dealErr) {
            console.error("[campaign accept] deals insert failed:", dealErr?.message || dealErr);
            return res.status(500).json({ error: "Could not create the deal for this creator. Please try again.", detail: dealErr?.message });
          }

          // Insert into chat_threads
          const { error: threadErr } = await (privilegedSupabase || supabase).from('chat_threads').insert({
            id: threadId,
            campaign_id,
            creator_id: app.creator_id,
            brand_id: ownerBrandId,
            deal_id: generatedDealId,
            agreed_amount: agreedAmt,
            revision_count: 5,
            status: 'NEGOTIATING',
            flow_state: 'NEGOTIATING'
          });

          if (threadErr) return res.status(500).json({ error: threadErr.message });

          // 4. Send the "negotiation started" welcome message!
          // We pass a proper message_type string 'campaign_approved' instead of user.user_id
          const welcomeMessageText = `Congratulations! You've been selected. Let's negotiate the terms.`;
          const welcomeContent = serializeChatMessage(
            welcomeMessageText,
            'campaign_approved',
            'system',
            null
          );

          // The cards show campaign details, which this scope did not have — tsc caught it.
          // Non-fatal: if the lookup fails the cards still render, just without the extras.
          let campaign: any = null;
          try {
            const { data: c } = await (privilegedSupabase || supabase)
              .from('campaigns')
              .select('*')
              .eq('campaign_id', campaign_id)
              .maybeSingle();
            if (c) campaign = c;
          } catch (e: any) {
            console.warn("[campaign accept] campaign lookup failed:", e?.message || e);
          }

          // Two cards, in this order. The good news first, then the thing to act on —
          // chat puts the newest message at the bottom, and the buttons belong there.
          const nowIso = new Date().toISOString();

          await insertChatMessageToSupabase({
            message_id: crypto.randomUUID(),
            thread_id: threadId,
            sender_user_id: user.user_id,
            text: welcomeContent,
            message_type: 'campaign_approved',
            metadata: {
              action: 'campaign_approved',
              thread_id: threadId,
              campaign_title: campaign?.title || null,
              budget_label:
                campaign?.budget_min && campaign?.budget_max
                  ? `₹${Number(campaign.budget_min).toLocaleString('en-IN')} – ₹${Number(campaign.budget_max).toLocaleString('en-IN')}`
                  : null,
              deliverable: campaign?.deliverable_type || campaign?.deliverables || null,
              delivery_days: app.delivery_days || campaign?.delivery_days || null
            },
            created_at: nowIso
          });

          // The creator's own application, replayed into the chat.
          //
          // sender_user_id is the CREATOR, not the brand — that is what puts it on the
          // correct side for each of them, and it is also simply true: these are the
          // creator's terms, submitted when they applied.
          //
          // Without this the brand had nothing to negotiate against, and the only button in
          // the thread belonged to the person who had set the price.
          await insertChatMessageToSupabase({
            message_id: crypto.randomUUID(),
            thread_id: threadId,
            sender_user_id: app.creator_id,
            text: serializeChatMessage(
              `Thank you for choosing me! My proposal: ₹${Number(app.proposed_amount || 0).toLocaleString('en-IN')}.`,
              'creator_application_offer',
              'creator',
              null
            ),
            message_type: 'creator_application_offer',
            metadata: {
              action: 'creator_application_offer',
              thread_id: threadId,
              campaign_title: campaign?.title || null,
              proposed_fee: Number(app.proposed_amount || 0),
              pitch: app.pitch || app.cover_letter || null,
              delivery_days: app.delivery_days || campaign?.delivery_days || null,
              revisions: app.revisions ?? 1,
              applied_at: app.created_at || nowIso
            },
            created_at: new Date(Date.now() + 1000).toISOString()
          });

          // Also insert a notification
          await (privilegedSupabase || supabase).from('notifications').insert({
            notif_id: crypto.randomUUID(),
            user_id: app.creator_id,
            type: 'chat_unlocked',
            message: `Congratulations! Your campaign application has been approved.`
          });
        }

        return res.json({ ok: true, thread_id: threadId });
      }

      return res.json({ ok: true });
    }

    // Local DB fallback
    const db = getDb();
    const camp = db.campaigns?.find(c => c.campaign_id === campaign_id);
    if (!camp) return res.status(404).json({ detail: "Campaign not found" });
    if (!isAdmin && camp.brand_user_id !== actingBrandId) {
      return res.status(403).json({ error: "Only the brand that owns this campaign can review its applications." });
    }

    const applicant = camp.applicants?.find(a => a.application_id === application_id);
    if (!applicant) return res.status(404).json({ detail: "Applicant not found" });

    applicant.status = action === 'accept' ? 'accepted' : 'rejected';

    if (action === 'accept') {
      let thread = db.chat_threads?.find(t => t.campaign_id === campaign_id && t.creator_id === applicant.creator_user_id);
      if (!thread) {
        const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        thread = {
          id: threadId,
          campaign_id,
          creator_id: applicant.creator_user_id,
          brand_id: camp.brand_user_id,
          status: 'NEGOTIATING',
          creator_name: applicant.creator_name,
          brand_name: user.name
        };
        if (!db.chat_threads) db.chat_threads = [];
        db.chat_threads.push(thread);

        const welcomeMessageText = `👋 Campaign Application APPROVED!\n\nNegotiations have been unlocked for campaign. Please review the details and confirm terms!`;
        const welcomeContent = serializeChatMessage(
          welcomeMessageText,
          'campaign_approved',
          'system',
          null
        );

        if (!db.chat_messages) db.chat_messages = [];
        db.chat_messages.push({
          id: crypto.randomUUID(),
          thread_id: threadId,
          sender_id: 'system',
          sender_role: 'system',
          message_type: 'campaign_approved',
          content: welcomeMessageText,
          text: welcomeContent,
          created_at: new Date().toISOString()
        });
      }
      saveDb(db);
      return res.json({ ok: true, thread_id: thread.id });
    }

    saveDb(db);
    return res.json({ ok: true });
  });


  router.get("/campaigns/:campaign_id", async (req, res) => {

    if (supabase) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('campaign_id', req.params.campaign_id)
        .maybeSingle();
      if (error) {
        console.error("Error fetching campaign:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ detail: "Campaign not found" });

      try {
        const { data: bp } = await (privilegedSupabase || supabase).from('brand_profiles').select('company_name, logo').eq('user_id', data.brand_user_id).maybeSingle();
        if (bp) {
          data.brand_name = bp.company_name || data.brand_name || "Brand Name";
          data.brand_logo = bp.logo || data.brand_logo || "";
        }
      } catch (e) {
        console.error("Error enriching campaign brand profile:", e);
      }

      return res.json(data);
    }

    const db = getDb();
    const c = db.campaigns.find((x) => x.campaign_id === req.params.campaign_id);
    if (!c) {
      return res.status(404).json({ detail: "Campaign not found" });
    }
    res.json(c);

  });


  router.post("/campaigns/apply", async (req, res) => {

    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const campaignId = req.body.campaign_id;
    const creatorId = user.user_id;

    // Server-side KYC Gating Check
    const verified = await isCreatorKycVerified(creatorId);
    if (!verified) {
      return res.status(403).json({ 
        error: "Complete KYC verification to apply.", 
        detail: "Complete KYC verification to apply." 
      });
    }

    if (supabase) {
      // The application is written and read with the SAME (privileged) client the brand's list
      // uses. It used to be inserted and duplicate-checked with the anon client while other reads
      // used another; under row-level security that is how a row ends up saved but invisible to
      // the brand — "I applied but the brand doesn't see it".
      const appClient = privilegedSupabase || supabase;
      const { data: existingRows } = await appClient
        .from('campaign_applications')
        .select('application_id')
        .eq('campaign_id', campaignId)
        .eq('creator_id', creatorId)
        .limit(1);
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;

      if (existing) return res.status(400).json({ error: 'Already applied' });

      const { data: targetCampaign } = await appClient
        .from('campaigns')
        .select('campaign_id, status')
        .eq('campaign_id', campaignId)
        .maybeSingle();
      if (!targetCampaign) return res.status(404).json({ error: "Campaign not found" });

      const payload = { 
        application_id: crypto.randomUUID(), 
        campaign_id: campaignId, 
        creator_id: creatorId, 
        status: 'PENDING',
        pitch: req.body.pitch,
        proposed_amount: Number(req.body.proposed_amount),
        creator_location: req.body.creator_location || null,
        creator_name: req.body.creator_name || null
      };
      
      const { data, error } = await appClient
        .from('campaign_applications')
        .insert(payload);
      
      if (error) {
         console.error("[campaigns/apply] insert failed:", error.message || error);
         return res.status(500).json({ error: "Could not submit your application. Please try again.", detail: error.message });
      }
      
      const { data: camp } = await (privilegedSupabase || supabase).from('campaigns').select('brand_user_id, title').eq('campaign_id', campaignId).maybeSingle();
      if (camp) {
        await (privilegedSupabase || supabase).from('notifications').insert({
          notif_id: crypto.randomUUID(),
          user_id: camp.brand_user_id,
          type: 'new_application',
          message: `${user.name} applied to your campaign "${camp.title}"!`
        });
      }
      return res.json({ ok: true });
    }

    const db = getDb();
    const c = db.campaigns.find((x) => x.campaign_id === campaignId);
    if (!c) return res.status(404).json({ detail: "Campaign not found" });
    if (!c.applicants) c.applicants = [];
    if (c.applicants.find((a) => a.creator_user_id === user.user_id)) return res.status(400).json({ detail: "Already applied" });
    
    c.applicants.push({
      application_id: crypto.randomUUID(),
      creator_user_id: user.user_id,
      creator_name: user.name,
      proposed_amount: req.body.proposedRate || 0,
      pitch: req.body.pitch || "",
      portfolio_links: req.body.portfolioLinks || "",
      est_delivery: req.body.estDelivery || "",
      status: "applied",
      created_at: getIsoNow()
    });
    saveDb(db);
    res.json({ ok: true });

  });

}

export { createCampaignLifecycleHandlers } from "./campaign_lifecycle";

/**
 * Campaign draft submission guard.
 *
 * /campaign/threads/:id/submit-content is served by the shared deliverable handler, which
 * checks only that the caller is the thread's creator. It accepted a draft before the
 * contract was signed or funded, while a previous draft was still under review (a second
 * card), and after the draft had already been approved or the deal completed. This wraps it
 * with the campaign stage rules and then hands over unchanged.
 */
export function createCampaignDraftSubmitGuard(
  deps: { supabase: any; privilegedSupabase: any; getDb: () => any; parseAuthUser: (req: any) => Promise<any> },
  delegate: (req: any, res: any) => any
) {
  return async (req: any, res: any) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const rawId = req.params.id || req.params.threadId;
    const db = deps.getDb();
    const client = deps.privilegedSupabase || deps.supabase;
    const { thread, deal, dealId } = await loadCampaignThreadAndDeal({ client, db, rawId, getCampaignDealId });

    // Not a campaign thread we can see — leave the decision to the delegate exactly as before.
    if (!thread || isUgcThread(thread)) return delegate(req, res);

    const role = partyRole(user, thread, deal);
    if (role !== 'creator' && role !== 'admin') return forbid(res, 'creator');
    if (isClosed(thread, deal)) return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");

    const flow = flowOf(thread, deal);
    if (PRE_WORK_STATES.includes(flow)) {
      return conflict(res, 'CONTRACT_NOT_ACTIVE', "The contract has to be signed by both sides and funded before you submit a draft.");
    }
    if ([...LIVE_LINK_DUE_STATES, ...LIVE_LINK_UNDER_REVIEW_STATES].includes(flow)) {
      return conflict(res, 'DRAFT_ALREADY_APPROVED', "Your draft is already approved — submit the live post link instead.");
    }
    if (DRAFT_UNDER_REVIEW_STATES.includes(flow) && flow !== 'REVISION_DECLINED') {
      return conflict(res, 'DRAFT_UNDER_REVIEW', "Your draft is already with the brand for review.");
    }
    if (deal) {
      const funded = await isCampaignEscrowFunded({ client, db, dealId, thread, deal });
      if (!funded) {
        return conflict(res, 'ESCROW_NOT_FUNDED', "The brand has not funded the secure payment hold yet. You can submit your draft once payment is secured.");
      }
    }
    return delegate(req, res);
  };
}

export function setupCampaignThreadRoutes(
  app: express.Application,
  router: express.Router,
  {
    handleCampaignApprove,
    handleCampaignApproveContent,
    handleCampaignSubmitLiveLink,
    handleCampaignSubmitContent,
    handleCampaignRevision,
    handleCampaignDeclineRevisions,
    handleCampaignDeclineLiveLinks,
    handleCampaignCancel,
  }: {
    handleCampaignApprove: (req: express.Request, res: express.Response) => any;
    handleCampaignApproveContent?: (req: express.Request, res: express.Response) => any;
    handleCampaignSubmitLiveLink?: (req: express.Request, res: express.Response) => any;
    handleCampaignSubmitContent?: (req: express.Request, res: express.Response) => any;
    handleCampaignRevision: (req: express.Request, res: express.Response) => any;
    handleCampaignDeclineRevisions: (req: express.Request, res: express.Response) => any;
    handleCampaignDeclineLiveLinks?: (req: express.Request, res: express.Response) => any;
    handleCampaignCancel: (req: express.Request, res: express.Response) => any;
  }
) {
  // Campaign thread routes namespace
  router.post(["/campaign/threads/:id/mark-complete", "/campaign/threads/:id/approve-live-links", "/campaign/threads/:threadId/mark-complete", "/campaign/threads/:threadId/approve-live-links"], handleCampaignApprove);
  if (handleCampaignApproveContent) {
    router.post(["/campaign/threads/:id/approve-content", "/campaign/threads/:id/content/approve", "/campaign/threads/:threadId/approve-content", "/campaign/threads/:threadId/content/approve"], handleCampaignApproveContent);
  }
  if (handleCampaignSubmitLiveLink) {
    router.post(["/campaign/threads/:id/submit-live-link", "/campaign/threads/:id/submit-live-links", "/campaign/threads/:threadId/submit-live-link", "/campaign/threads/:threadId/submit-live-links"], handleCampaignSubmitLiveLink);
  }
  if (handleCampaignSubmitContent) {
    router.post(["/campaign/threads/:id/submit-content", "/campaign/threads/:id/submit-draft", "/campaign/threads/:threadId/submit-content", "/campaign/threads/:threadId/submit-draft"], handleCampaignSubmitContent);
  }
  router.post(["/campaign/threads/:id/reject-content", "/campaign/threads/:id/request-revision", "/campaign/threads/:threadId/reject-content", "/campaign/threads/:threadId/request-revision"], handleCampaignRevision);
  // A draft decline and a live-link decline are different events. They shared one handler —
  // the live-link one — which is how declining draft changes surfaced a payout button.
  if (handleCampaignDeclineLiveLinks) {
    router.post(["/campaign/threads/:id/decline-revisions", "/campaign/threads/:threadId/decline-revisions"], handleCampaignDeclineRevisions);
    router.post(["/campaign/threads/:id/decline-live-links-resubmission", "/campaign/threads/:threadId/decline-live-links-resubmission"], handleCampaignDeclineLiveLinks);
  } else {
    router.post(["/campaign/threads/:id/decline-revisions", "/campaign/threads/:id/decline-live-links-resubmission", "/campaign/threads/:threadId/decline-revisions", "/campaign/threads/:threadId/decline-live-links-resubmission"], handleCampaignDeclineRevisions);
  }
  router.post(["/campaign/threads/:id/cancel-order", "/campaign/threads/:threadId/cancel-order"], handleCampaignCancel);
}

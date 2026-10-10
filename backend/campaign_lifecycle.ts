import { logIgnored } from "./logIgnored";
import { feeAtPaymentTime } from "./stampedFee";
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

// Campaign deal lifecycle handlers (accept, sign, fund, drafts, live link, release, cancel).
// Moved out of campaigns_routes.ts in session 22 — behaviour unchanged; campaigns_routes.ts
// re-exports it so existing imports keep working.
export function createCampaignLifecycleHandlers({
  supabase,
  privilegedSupabase,
  getDb,
  saveDb,
  parseAuthUser,
  insertChatMessageToSupabase,
  getIsoNow = () => new Date().toISOString(),
  syncUgcLifecycleEvent,
  broadcastAdminNotification,
}: {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  parseAuthUser: (req: any) => Promise<any>;
  insertChatMessageToSupabase: (payload: any) => Promise<any>;
  getIsoNow?: () => string;
  syncUgcLifecycleEvent?: (opts: any) => Promise<any>;
  broadcastAdminNotification?: (n: { type: string; message: string; metadata?: any; actor_id?: string; title?: string }) => Promise<any>;
}) {
  // 10c. Approve Live Links & Release Payment (Deal Completion)
  const handleThreadApproveLiveLinks = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rawId = req.params.id || req.params.threadId;
    const db = getDb();
    const nowIso = getIsoNow ? getIsoNow() : new Date().toISOString();
    const io = req.app.get("io");

    let targetThread: any = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);
    if (!targetThread && supabase) {
      try {
        const { data: threadRow } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${rawId},deal_id.eq.${rawId}`)
          .maybeSingle();
        if (threadRow) targetThread = threadRow;
      } catch (e: any) { logIgnored("campaigns_routes:1427", e); }
    }

    const targetThreadId = targetThread?.id || rawId;
    const dealId = targetThread?.deal_id || (targetThread?.metadata && targetThread.metadata.deal_id) || (rawId.startsWith('thread_camp_') ? rawId.replace('thread_camp_', '') : rawId);

    // Canonical flow separation via dealFlow helpers
    const isUgcOrder = isUgcThread(targetThread || { id: targetThreadId, deal_id: dealId });
    const ugcOrderId = getUgcOrderId(targetThread || { id: targetThreadId, deal_id: dealId });
    const campaignDealId = getCampaignDealId(targetThread || { id: targetThreadId, deal_id: dealId });

    let dealObj = !isUgcOrder ? (db.deals || []).find((d: any) => d.id === campaignDealId || d.id === dealId || d.id === targetThreadId) : null;
    let ugcOrderObj = isUgcOrder ? (db.ugc_orders || []).find((o: any) => o.id === ugcOrderId || o.id === dealId || o.id === targetThreadId) : null;

    let creatorId = targetThread?.creator_id || dealObj?.creator_id || ugcOrderObj?.creator_id;
    let brandId = targetThread?.brand_id || dealObj?.brand_id || ugcOrderObj?.brand_id || user?.user_id;

    if (!isUgcOrder && (!creatorId || !brandId || !dealObj) && supabase && campaignDealId) {
      try {
        const { data: dRec } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('*')
          .eq('id', campaignDealId)
          .maybeSingle();
        if (dRec) {
          if (!creatorId) creatorId = dRec.creator_id;
          if (!brandId) brandId = dRec.brand_id;
          if (!dealObj) dealObj = dRec;
        }
      } catch (e: any) { logIgnored("campaigns_routes:1456", e); }
    }

    if (isUgcOrder && (!creatorId || !brandId || !ugcOrderObj) && supabase && ugcOrderId) {
      try {
        const { data: uRec } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('id', ugcOrderId)
          .maybeSingle();
        if (uRec) {
          if (!creatorId) creatorId = uRec.creator_id;
          if (!brandId) brandId = uRec.brand_id;
          if (!ugcOrderObj) ugcOrderObj = uRec;
        }
      } catch (e: any) { logIgnored("campaigns_routes:1471", e); }
    }

    const canonicalBrandId = isUuid(brandId) ? brandId : (isUuid(user?.user_id) ? user.user_id : (isUuid(user?.id) ? user.id : brandId));
    const canonicalCreatorId = isUuid(creatorId) ? creatorId : (targetThread?.creator_id || dealObj?.creator_id || ugcOrderObj?.creator_id || creatorId);

    // CAMPAIGN ONLY. This handler releases the escrow, and it used to check nothing but "is
    // somebody logged in". A creator could call it on their own thread and pay themselves; a
    // stranger could call it on anyone's; and it paid out for deals with no live post at all.
    // The UGC branch below is untouched — UGC reaches this handler only for its own flow and
    // is guarded in ugc_routes.ts.
    let campaignKnownAmount = 0;
    if (!isUgcOrder) {
      const role = partyRole(user, targetThread, dealObj);
      if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');

      // Idempotent: a second approval (double tap, stale card, retry) must not release, message
      // or notify again.
      if (isClosed(targetThread, dealObj)) {
        return res.json({
          ok: true,
          success: true,
          already_completed: true,
          thread_id: targetThreadId,
          deal_id: dealId,
          status: 'COMPLETED',
          flow_state: 'COMPLETED',
          message: "This deal is already complete — the payout was released earlier."
        });
      }

      const flow = flowOf(targetThread, dealObj);
      const client = privilegedSupabase || supabase;
      const hasLiveLink = await hasCampaignLiveLinkEvidence({
        client, db, threadId: targetThreadId, dealId: campaignDealId, thread: targetThread, deal: dealObj
      });
      if (!LIVE_LINK_APPROVABLE_STATES.includes(flow) || !hasLiveLink) {
        return res.status(400).json({
          error: "There is no live post to approve yet. The creator has to submit the live link after the draft is approved.",
          code: 'NO_LIVE_LINK_TO_APPROVE',
          flow_state: flow || null,
          _status: 400
        });
      }

      const funded = await isCampaignEscrowFunded({ client, db, dealId: campaignDealId, thread: targetThread, deal: dealObj });
      if (!funded) {
        return conflict(res, 'ESCROW_NOT_FUNDED', "The escrow for this deal was never funded, so there is nothing to release.");
      }

      campaignKnownAmount = knownAmount(dealObj?.agreed_amount, targetThread?.agreed_amount, targetThread?.amount_fixed);
      if (!campaignKnownAmount) {
        return conflict(res, 'AMOUNT_UNKNOWN', "The agreed amount for this deal could not be found, so the payout was not released. Please contact support.");
      }
    }

    const dealAmount = !isUgcOrder
      ? campaignKnownAmount
      : Number(dealObj?.agreed_amount || ugcOrderObj?.creator_payout || ugcOrderObj?.agreed_amount || targetThread?.agreed_amount || targetThread?.amount_fixed || 5000);
    // Session 36 (option A, Ravi OK): the fee stamped when the brand paid, not today's setting.
    const feeCalc = await feeAtPaymentTime((privilegedSupabase || supabase), { dealId: campaignDealId || dealObj?.id, ugcOrderId: ugcOrderObj?.id }, dealAmount, calculatePlatformFee);
    const feePercentage = Number(feeCalc?.feePercent ?? 15);
    const platformFee = Number(feeCalc?.platformFee ?? Math.round(((dealAmount * feePercentage) / 100) * 100) / 100);
    const netAmount = Number(feeCalc?.creatorNet ?? Math.max(0, Math.round((dealAmount - platformFee) * 100) / 100));

    // 1. Update Deals table: status = 'COMPLETED' (only for campaign deals with valid UUID, NOT UGC orders)
    if (!isUgcOrder && supabase && campaignDealId) {
      try {
        const { error: dealsErr } = await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'COMPLETED',
            updated_at: nowIso
          })
          .eq('id', campaignDealId);
        if (dealsErr) {
          console.error("[handleThreadApproveLiveLinks] deals update error:", dealsErr?.message || JSON.stringify(dealsErr));
        }
      } catch (e: any) {
        console.warn("[handleThreadApproveLiveLinks] deals update error:", e?.message || e);
      }
    }
    if (!isUgcOrder && dealObj) {
      dealObj.status = 'COMPLETED';
      dealObj.stage = 'COMPLETED';
      dealObj.flow_state = 'COMPLETED';
      dealObj.updated_at = nowIso;
    }
    if (!isUgcOrder && db.collabs) {
      const c = db.collabs.find((x: any) => x.collab_id === dealId || x.id === dealId);
      if (c) {
        c.status = 'COMPLETED';
        c.stage = 'COMPLETED';
        c.updated_at = nowIso;
      }
    }

    // 1c. Update ugc_orders table if this thread is associated with a UGC order
    if (isUgcOrder || ugcOrderId) {
      const targetUgcId = ugcOrderId || dealId || targetThreadId;
      if (supabase && targetUgcId) {
        try {
          await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .update({
              status: 'COMPLETED',
              payment_status: 'RELEASED',
              escrow_released_at: nowIso,
              updated_at: nowIso
            })
            .eq('id', targetUgcId);
        } catch (e: any) {
          console.warn("[handleThreadApproveLiveLinks] ugc_orders update error:", e?.message || e);
        }
      }
      if (db.ugc_orders) {
        const u = db.ugc_orders.find((x: any) => x.id === targetUgcId || x.id === dealId || x.brief_id === dealId || x.brief_id === targetUgcId);
        if (u) {
          u.status = 'COMPLETED';
          u.payment_status = 'RELEASED';
          u.escrow_released_at = nowIso;
          u.updated_at = nowIso;
        }
      }
    }

    // 1b. Update transactions table: status = 'SUCCESS', payout_status = 'RELEASED'
    if (supabase) {
      try {
        if (isUgcOrder && ugcOrderId) {
          const { data: ugcTxns } = await (privilegedSupabase || supabase)
            .from('transactions')
            .select('id, ugc_order_id')
            .eq('ugc_order_id', ugcOrderId);

          if (ugcTxns && ugcTxns.length > 0) {
            for (const tx of ugcTxns) {
              const { error: txErr } = await (privilegedSupabase || supabase)
                .from('transactions')
                .update({
                  payout_status: 'RELEASED',
                  status: 'SUCCESS',
                  platform_fee_amount: platformFee,
                  creator_net_amount: netAmount,
                  payout_completed_at: nowIso
                })
                .eq('id', tx.id);
              if (txErr) {
                console.error("[handleThreadApproveLiveLinks] transactions update error:", txErr?.message || JSON.stringify(txErr));
              }
            }
          } else {
            await (privilegedSupabase || supabase)
              .from('transactions')
              .insert({
                id: crypto.randomUUID(),
                ugc_order_id: ugcOrderId,
                creator_id: canonicalCreatorId || null,
                gross_amount: dealAmount,
                platform_fee_amount: platformFee,
                creator_net_amount: netAmount,
                gst_amount: 0,
                status: 'SUCCESS',
                payout_status: 'RELEASED',
                payout_type: 'full',
                created_at: nowIso,
                payout_completed_at: nowIso
              });
          }
        } else if (!isUgcOrder && campaignDealId) {
          // Only escrow DEPOSIT rows are released. A refund row also carries status SUCCESS,
          // and the old code stamped every matching row as RELEASED with the full net amount,
          // so one deal could show the creator's payout more than once.
          const { data } = await (privilegedSupabase || supabase)
            .from('transactions')
            .select('id, deal_id, campaign_deal_id, status, payout_status, refund_amount, refund_status, refunded_at, escrow_hold')
            .or(`campaign_deal_id.eq.${campaignDealId},deal_id.eq.${campaignDealId}`);
          const depositRows = (data || []).filter(isEscrowDepositRow);

          if (depositRows.length > 0) {
            for (let i = 0; i < depositRows.length; i++) {
              const tx = depositRows[i];
              const txUpdate: any = {
                payout_status: 'RELEASED',
                status: 'SUCCESS',
                campaign_deal_id: campaignDealId,
                payout_completed_at: nowIso
              };
              // The fee and net payout belong to the deal once, not to every row.
              if (i === 0) {
                txUpdate.platform_fee_amount = platformFee;
                txUpdate.creator_net_amount = netAmount;
              }
              const { error: txErr } = await (privilegedSupabase || supabase)
                .from('transactions')
                .update(txUpdate)
                .eq('id', tx.id);
              if (txErr) {
                console.error("[handleThreadApproveLiveLinks] transactions update error:", txErr?.message || JSON.stringify(txErr));
              }
            }
          } else {
            // Funded by the deal flag (older deals were funded before escrow rows were written),
            // so record the payout row now.
            await (privilegedSupabase || supabase)
              .from('transactions')
              .insert({
                id: crypto.randomUUID(),
                deal_id: campaignDealId,
                campaign_deal_id: campaignDealId,
                creator_id: canonicalCreatorId || null,
                gross_amount: dealAmount,
                platform_fee_amount: platformFee,
                creator_net_amount: netAmount,
                gst_amount: 0,
                status: 'SUCCESS',
                payout_status: 'RELEASED',
                payout_type: 'full',
                created_at: nowIso,
                payout_completed_at: nowIso
              });
          }
        }
      } catch (e: any) {
        console.warn("[handleThreadApproveLiveLinks] transactions update error:", e?.message || e);
      }
    }

    // Local DB transactions fallback
    if (db.transactions) {
      const tx = db.transactions.find((x: any) =>
        (!isUgcOrder ? isEscrowDepositRow(x) : true) &&
        (x.campaign_deal_id === campaignDealId || (campaignDealId && x.deal_id === campaignDealId) || (isUgcOrder && ugcOrderId && x.ugc_order_id === ugcOrderId))
      );
      if (tx) {
        tx.payout_status = 'RELEASED';
        tx.status = 'SUCCESS';
        tx.platform_fee_amount = platformFee;
        tx.creator_net_amount = netAmount;
        tx.payout_completed_at = nowIso;
      }
    }

    // 2. Update Chat Thread: status = 'COMPLETED', flow_state = 'COMPLETED'
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            status: 'COMPLETED',
            flow_state: 'COMPLETED',
            updated_at: nowIso
          })
          .eq('id', targetThreadId);
      } catch (e: any) {
        console.warn("[handleThreadApproveLiveLinks] chat_threads update error:", e?.message || e);
      }
    }

    if (db.chat_threads) {
      const thread = db.chat_threads.find((t: any) => t.id === targetThreadId || t.deal_id === dealId);
      if (thread) {
        thread.status = 'COMPLETED';
        thread.flow_state = 'COMPLETED';
        thread.updated_at = nowIso;
      }
    }

    // 3. Insert system message in chat
    const msgId = crypto.randomUUID();
    const msgText = `🎉 Deliverables & Live Links Approved!\n\nEscrow payment of ₹${dealAmount.toLocaleString('en-IN')} has been released. The deal is now complete! Creator will receive payout of ₹${netAmount.toLocaleString('en-IN')} after platform fee.`;
    const msgMetadata = {
      action: 'live_links_approved',
      status: 'COMPLETED',
      amount: dealAmount,
      creator_net_amount: netAmount,
      platform_fee: platformFee,
      sender_role: 'brand'
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: canonicalBrandId,
      receiver_user_id: canonicalCreatorId || null,
      sender_id: canonicalBrandId,
      receiver_id: canonicalCreatorId || null,
      sender_role: 'brand',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Brand',
      message_type: 'live_links_approved',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadApproveLiveLinks] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // 4. Notification for creator
    if (canonicalCreatorId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: canonicalCreatorId,
        type: 'deal_live_links_approved',
        title: 'Work Approved & Payment Released! 🎉',
        message: `Brand approved your deliverables for ₹${dealAmount.toLocaleString('en-IN')}. Secure payment hold payout processing in 1–2 working days.`,
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e: any) { logIgnored("campaigns_routes:1794", e); }
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // 4b. Tell the admin payout desk. The brand approving released the escrow on the platform;
    // the bank transfer to the creator is still done by an admin. This alert used to exist and
    // was missing — admins only saw a RELEASED row if they happened to open Escrow.
    if (broadcastAdminNotification) {
      try {
        await broadcastAdminNotification({
          type: 'payout_due',
          title: 'Payout due to creator',
          message: `Brand approved the live links — pay ₹${Number(netAmount).toLocaleString('en-IN')} to the creator (deal ${dealId || targetThreadId}). Mark it disbursed in Escrow once transferred.`,
          metadata: { thread_id: targetThreadId, deal_id: dealId, creator_id: creatorId, brand_id: brandId, gross_amount: dealAmount, creator_net_amount: netAmount },
          actor_id: user?.user_id
        });
      } catch (e: any) {
        console.error("[approve-live-links] admin payout alert failed:", e?.message || e);
      }
    }

    // 5. Socket emit
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      emitThreadEvent(io, "thread_updated", {
        threadId: targetThreadId,
        status: 'COMPLETED',
        flow_state: 'COMPLETED'
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      thread_id: targetThreadId,
      deal_id: dealId,
      status: 'COMPLETED',
      flow_state: 'COMPLETED',
      amount: dealAmount,
      creator_net_amount: netAmount,
      message: "Live links approved and payment released! Creator payout processing via Escrow in 1-2 working days."
    });
  };

  const handleThreadSubmitLiveLink = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const targetThreadId = req.params.threadId || req.params.id;
    const { link, links, live_link, instagram_post_url, notes, content_notes } = req.body || {};
    const rawUrl = (
      link ||
      (Array.isArray(links)
        ? (links.map((l: any) => (typeof l === 'string' ? l : l?.url || '')).find((u: string) => u.trim() !== '') || '')
        : (typeof links === 'string' ? links : (links?.url || ''))) ||
      live_link ||
      instagram_post_url ||
      ""
    ).trim();
    const finalNotes = (notes || content_notes || "").trim();

    // Validate that link is a valid URL with http(s):// and a recognizable domain
    const isValidLiveUrl = (urlStr: string): boolean => {
      if (!urlStr || typeof urlStr !== 'string') return false;
      const trimmed = urlStr.trim();
      if (!trimmed || /\s/.test(trimmed)) return false;
      try {
        const toTest = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
        const parsed = new URL(toTest);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        const hostParts = parsed.hostname.split('.');
        if (hostParts.length < 2) return false;
        const tld = hostParts[hostParts.length - 1];
        if (!tld || tld.length < 2) return false;
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!isValidLiveUrl(rawUrl)) {
      return res.status(400).json({
        error: "A valid live post link (URL) is required to submit live links proof.",
        detail: "Please provide a valid web link starting with http:// or https://"
      });
    }

    const finalUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;

    const db = getDb();
    let targetThread: any = (db.chat_threads || []).find((t: any) => t.id === targetThreadId || t.deal_id === targetThreadId);

    if (!targetThread && supabase) {
      try {
        const { data: threadRow } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .eq('id', targetThreadId)
          .maybeSingle();
        if (threadRow) targetThread = threadRow;
      } catch (e: any) { logIgnored("campaigns_routes:1898", e); }
    }

    const dealId = targetThread?.deal_id || targetThreadId;
    const nowIso = new Date().toISOString();

    const isUgcOrder = isUgcThread(targetThread || { id: targetThreadId, deal_id: dealId });
    const campaignDealId = getCampaignDealId(targetThread || { id: targetThreadId, deal_id: dealId });

    // CAMPAIGN ONLY. A live link is the creator's to submit, and only once the draft has been
    // approved. Without these checks the brand could submit a "creator" link, a link could be
    // sent before any draft existed, and — worst — a link sent to a COMPLETED deal flipped it
    // back to ACTIVE / PROOF_SUBMITTED after the payout had already gone out.
    if (!isUgcOrder) {
      const guardDeal = (db.deals || []).find((d: any) => d.id === campaignDealId) || null;
      const role = partyRole(user, targetThread, guardDeal);
      if (role !== 'creator' && role !== 'admin') return forbid(res, 'creator');
      if (isClosed(targetThread, guardDeal)) {
        return conflict(res, 'DEAL_CLOSED', "This deal is already complete — no further links can be submitted.");
      }
      const flow = flowOf(targetThread, guardDeal);
      if (LIVE_LINK_UNDER_REVIEW_STATES.includes(flow)) {
        return conflict(res, 'LINK_ALREADY_UNDER_REVIEW', "Your live link is already with the brand for review.");
      }
      let draftApproved = LIVE_LINK_DUE_STATES.includes(flow);
      if (!draftApproved && ![...PRE_WORK_STATES, ...DRAFT_UNDER_REVIEW_STATES, ...DRAFT_REVISION_STATES].includes(flow)) {
        // Legacy rows whose flow_state was never written: accept the approval message as proof.
        draftApproved = await threadHasMessage(
          { client: privilegedSupabase || supabase, db, threadId: targetThreadId },
          ['content_approved'],
          ['draft_approved']
        );
      }
      if (!draftApproved) {
        return conflict(res, 'DRAFT_NOT_APPROVED', "The brand has to approve your draft before you post it live and submit the link.");
      }
    }

    // 1. Update deal in Supabase & Local DB (skip if it's a UGC order)
    let dealObj = !isUgcOrder ? (db.deals || []).find((d: any) => d.id === (campaignDealId || dealId) || d.id === targetThreadId) : null;
    if (dealObj) {
      dealObj.flow_state = 'PROOF_SUBMITTED';
      dealObj.status = 'ACTIVE';
      dealObj.live_links_submitted = true;
      dealObj.live_link = finalUrl;
      dealObj.updated_at = nowIso;
    }

    if (!isUgcOrder && supabase && campaignDealId) {
      try {
        const cleanDealPayload = sanitizeDealSupabasePayload({
          status: 'ACTIVE',
          updated_at: nowIso
        });
        await (privilegedSupabase || supabase)
          .from('deals')
          .update(cleanDealPayload)
          .eq('id', campaignDealId);
      } catch (e: any) {
        console.warn("[handleThreadSubmitLiveLink] Supabase deals update error:", e?.message || e);
      }
    }

    // 2. Insert or update content_submission
    const canonicalCreatorId = isUuid(targetThread?.creator_id) ? targetThread.creator_id : (isUuid(user?.user_id) ? user.user_id : (dealObj?.creator_id || user.user_id));
    const brandId = targetThread?.brand_id || dealObj?.brand_id;

    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('content_submissions')
          .insert({
            id: crypto.randomUUID(),
            deal_id: isUgcOrder ? null : campaignDealId,
            creator_id: canonicalCreatorId,
            submission_type: 'live_link',
            video_url: finalUrl,
            notes_to_brand: finalNotes || null,
            status: 'PENDING_REVIEW',
            submitted_at: nowIso
          });
      } catch (e) {
        console.warn("[handleThreadSubmitLiveLink] content_submissions insert warning:", e);
      }
    }

    // 3. Update chat_threads
    if (supabase) {
      try {
        const cleanThreadPayload = sanitizeChatThreadSupabasePayload({
          status: 'ACTIVE',
          flow_state: 'PROOF_SUBMITTED',
          updated_at: nowIso
        });
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update(cleanThreadPayload)
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadSubmitLiveLink] Supabase chat_threads update error:", e);
      }
    }

    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.status = 'ACTIVE';
        t.flow_state = 'PROOF_SUBMITTED';
        t.live_links_submitted = true;
        t.live_link = finalUrl;
        t.updated_at = nowIso;
      }
    }

    // 4. Insert chat message for thread
    const msgId = crypto.randomUUID();
    const msgText = `🚀 Live Post Link Submitted!\n\nLink: ${finalUrl}${finalNotes ? `\n\nNotes: ${finalNotes}` : ''}`;
    const msgMetadata = {
      action: 'live_link_submitted',
      status: 'PROOF_SUBMITTED',
      link: finalUrl,
      links: [finalUrl],
      notes: finalNotes || undefined,
      sender_role: 'creator',
      sender_id: canonicalCreatorId,
      creator_id: canonicalCreatorId
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: canonicalCreatorId,
      receiver_user_id: brandId || null,
      sender_id: canonicalCreatorId,
      receiver_id: brandId || null,
      sender_role: 'creator',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Creator',
      message_type: 'live_links_submitted',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadSubmitLiveLink] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // 5. Notification for brand
    if (brandId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: brandId,
        type: 'deal_live_links_submitted',
        title: 'Live Link Submitted! 🚀',
        message: 'The creator submitted their live post link. Review the post and release payout.',
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e: any) { logIgnored("campaigns_routes:2070", e); }
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // 6. Socket emit
    const io = req.app.get("io");
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      emitThreadEvent(io, "thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'PROOF_SUBMITTED'
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      deal_id: dealId,
      thread_id: targetThreadId,
      status: 'PROOF_SUBMITTED',
      flow_state: 'PROOF_SUBMITTED',
      link: finalUrl,
      message: "Live link submitted successfully! Brand has been notified."
    });
  };

  // Reject live links / Request resubmission of live links by Brand
  const handleThreadRejectLiveLinks = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rawId = req.params.id || req.params.threadId;
    const feedback = (req.body?.feedback || req.body?.notes || req.body?.reason || req.body?.comments || "").trim() || "Please resubmit correct live links.";

    const db = getDb();
    let targetThread: any = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);

    if (!targetThread && supabase) {
      try {
        const { data: threadRow } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .eq('id', rawId)
          .maybeSingle();
        if (threadRow) targetThread = threadRow;
      } catch (e: any) { logIgnored("campaigns_routes:2120", e); }
    }

    const targetThreadId = targetThread?.id || rawId;
    const dealId = targetThread?.deal_id || (targetThread?.metadata && targetThread.metadata.deal_id) || rawId;
    const nowIso = new Date().toISOString();

    const isUgcOrder = isUgcThread(targetThread || { id: targetThreadId, deal_id: dealId });
    const campaignDealId = getCampaignDealId(targetThread || { id: targetThreadId, deal_id: dealId });

    // CAMPAIGN ONLY: the brand asks for a correction, and only while a live link is actually
    // with them (or after the creator declined a correction and the brand asks again).
    if (!isUgcOrder) {
      const guardDeal = (db.deals || []).find((d: any) => d.id === campaignDealId) || null;
      const role = partyRole(user, targetThread, guardDeal);
      if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');
      if (isClosed(targetThread, guardDeal)) {
        return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
      }
      const flow = flowOf(targetThread, guardDeal);
      if (![...LIVE_LINK_UNDER_REVIEW_STATES, 'REVISION_DECLINED_LINKS'].includes(flow)) {
        return conflict(res, 'NO_LIVE_LINK_UNDER_REVIEW', "There is no live link waiting for your review right now.", { flow_state: flow || null });
      }
    }

    // Find deal
    let dealObj = !isUgcOrder ? (db.deals || []).find((d: any) => d.id === (campaignDealId || dealId) || d.id === targetThreadId) : null;
    if (dealObj) {
      dealObj.flow_state = 'REVISION_REQUESTED_LINKS';
      dealObj.status = 'ACTIVE';
      dealObj.live_links_submitted = false;
      dealObj.revision_notes_links = feedback;
      dealObj.updated_at = nowIso;
    }

    if (!isUgcOrder && supabase && campaignDealId) {
      try {
        const cleanDealPayload = sanitizeDealSupabasePayload({
          status: 'ACTIVE',
          updated_at: nowIso
        });
        await (privilegedSupabase || supabase)
          .from('deals')
          .update(cleanDealPayload)
          .eq('id', campaignDealId);
      } catch (e: any) {
        console.warn("[handleThreadRejectLiveLinks] Supabase deals update error:", e?.message || e);
      }
    }

    // Update chat_thread
    if (supabase) {
      try {
        const cleanThreadPayload = sanitizeChatThreadSupabasePayload({
          flow_state: 'REVISION_REQUESTED_LINKS',
          status: 'ACTIVE',
          updated_at: nowIso
        });
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update(cleanThreadPayload)
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadRejectLiveLinks] Supabase chat_threads update error:", e);
      }
    }

    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.status = 'ACTIVE';
        t.flow_state = 'REVISION_REQUESTED_LINKS';
        t.live_links_submitted = false;
        t.revision_notes_links = feedback;
        t.updated_at = nowIso;
      }
    }

    const creatorId = targetThread?.creator_id || dealObj?.creator_id;
    const brandId = targetThread?.brand_id || dealObj?.brand_id || user.user_id;

    // Chat message
    const msgId = crypto.randomUUID();
    const msgText = `❌ Resubmission requested by Brand: ${feedback}`;
    const msgMetadata = {
      action: 'live_links_resubmit_requested',
      status: 'REVISION_REQUESTED_LINKS',
      feedback
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: user?.user_id || brandId,
      receiver_user_id: creatorId || null,
      sender_id: user?.user_id || brandId,
      receiver_id: creatorId || null,
      sender_role: 'brand',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Brand',
      message_type: 'live_links_resubmit_request',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadRejectLiveLinks] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // Notification for creator
    if (creatorId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: creatorId,
        type: 'deal_live_links_resubmit',
        title: 'Correction Requested for Live Links ⚠️',
        message: `Brand requested resubmission: "${feedback}"`,
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e: any) { logIgnored("campaigns_routes:2254", e); }
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // Socket emit
    const io = req.app.get("io");
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      emitThreadEvent(io, "thread_updated", {
        threadId: targetThreadId,
        id: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'REVISION_REQUESTED_LINKS',
        live_links_submitted: false,
        revision_notes_links: feedback
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      thread_id: targetThreadId,
      deal_id: dealId,
      status: 'ACTIVE',
      flow_state: 'REVISION_REQUESTED_LINKS',
      feedback
    });
  };

  // Creator declines resubmission request for live links
  const handleThreadDeclineLiveLinksResubmission = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rawId = req.params.id || req.params.threadId;
    const feedback = (req.body?.feedback || req.body?.reason || "").trim() || "Creator declined the resubmission request.";

    const db = getDb();
    let targetThread: any = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);

    if (!targetThread && supabase) {
      try {
        const { data: threadRow } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .eq('id', rawId)
          .maybeSingle();
        if (threadRow) targetThread = threadRow;
      } catch (e: any) { logIgnored("campaigns_routes:2306", e); }
    }

    const targetThreadId = targetThread?.id || rawId;
    const dealId = targetThread?.deal_id || (targetThread?.metadata && targetThread.metadata.deal_id) || rawId;
    const nowIso = new Date().toISOString();

    const isUgcOrder = isUgcThread(targetThread || { id: targetThreadId, deal_id: dealId });
    const campaignDealId = getCampaignDealId(targetThread || { id: targetThreadId, deal_id: dealId });

    // CAMPAIGN ONLY: the creator declines a LIVE-LINK correction, and only while one is open.
    // A draft-revision decline used to be routed here too, which marked the thread
    // REVISION_DECLINED_LINKS and put an "Approve Last Submission" payout button in front of
    // the brand for a deal whose draft was never approved. Drafts now have their own handler.
    if (!isUgcOrder) {
      const guardDeal = (db.deals || []).find((d: any) => d.id === campaignDealId) || null;
      const role = partyRole(user, targetThread, guardDeal);
      if (role !== 'creator' && role !== 'admin') return forbid(res, 'creator');
      if (isClosed(targetThread, guardDeal)) {
        return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
      }
      const flow = flowOf(targetThread, guardDeal);
      if (!['REVISION_REQUESTED_LINKS', 'LIVE_LINK_REVISION_REQ', 'LIVE_LINK_REVISION'].includes(flow)) {
        return conflict(res, 'NO_LINK_CORRECTION_OPEN', "There is no open live-link correction request to decline.", { flow_state: flow || null });
      }
    }

    let dealObj = !isUgcOrder ? (db.deals || []).find((d: any) => d.id === (campaignDealId || dealId) || d.id === targetThreadId) : null;
    if (dealObj) {
      dealObj.flow_state = 'REVISION_DECLINED_LINKS';
      dealObj.decline_notes_links = feedback;
      dealObj.decline_reason = feedback;
      dealObj.updated_at = nowIso;
    }

    if (db.ugc_orders) {
      const o = db.ugc_orders.find((x: any) => x.id === targetThreadId || x.id === dealId || x.thread_id === targetThreadId);
      if (o) {
        o.status = 'REVISION_DECLINED_LINKS';
        o.decline_notes_links = feedback;
        o.decline_reason = feedback;
        o.updated_at = nowIso;
      }
    }

    if (!isUgcOrder && supabase && campaignDealId) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            updated_at: nowIso
          })
          .eq('id', campaignDealId);
      } catch (e: any) {
        console.warn("[handleThreadDeclineLiveLinksResubmission] Supabase deals update error:", e?.message || e);
      }
    }

    if (supabase) {
      try {
        const cleanThreadPayload = sanitizeChatThreadSupabasePayload({
          flow_state: 'REVISION_DECLINED_LINKS',
          updated_at: nowIso
        });
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update(cleanThreadPayload)
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadDeclineLiveLinksResubmission] Supabase chat_threads update error:", e);
      }
    }

    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.flow_state = 'REVISION_DECLINED_LINKS';
        t.decline_notes_links = feedback;
        t.decline_reason = feedback;
        t.updated_at = nowIso;
      }
    }

    const creatorId = targetThread?.creator_id || dealObj?.creator_id || user.user_id;
    const brandId = targetThread?.brand_id || dealObj?.brand_id;

    // Chat message
    const msgId = crypto.randomUUID();
    const msgText = `⚠️ Creator declined live links resubmission: ${feedback}`;
    const msgMetadata = {
      action: 'live_links_resubmit_declined',
      status: 'REVISION_DECLINED_LINKS',
      feedback
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: user?.user_id || creatorId,
      receiver_user_id: brandId || null,
      sender_id: user?.user_id || creatorId,
      receiver_id: brandId || null,
      sender_role: 'creator',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Creator',
      message_type: 'live_links_resubmit_declined',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadDeclineLiveLinksResubmission] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // The brand is the one who has to act next, and was never told.
    if (!isUgcOrder && brandId) {
      const notifData = {
        id: `notif_${crypto.randomUUID().slice(0, 10)}`,
        user_id: brandId,
        type: 'deal_live_links_resubmit_declined',
        title: 'Creator declined the link correction',
        message: `The creator declined your live-link correction: "${feedback}". Review the original link or contact support.`,
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e: any) { logIgnored("campaigns_routes:2444", e); }
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // Socket emit
    const io = req.app.get("io");
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      emitThreadEvent(io, "thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'REVISION_DECLINED_LINKS',
        decline_notes_links: feedback
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      thread_id: targetThreadId,
      deal_id: dealId,
      status: 'ACTIVE',
      flow_state: 'REVISION_DECLINED_LINKS',
      feedback
    });
  };

  // Campaign Draft Revision Handler
  const handleCampaignRevision = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params.id || req.params.threadId;
    const notes = (
      req.body?.notes ||
      req.body?.feedback ||
      req.body?.revision_notes ||
      req.body?.comments ||
      ""
    ).trim();

    if (!notes) {
      return res.status(400).json({ error: "Revision notes are required. Please describe the specific changes needed." });
    }

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${id},deal_id.eq.${id}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("campaigns_routes:2503", e); }
    }

    const dealId = thread?.deal_id || (typeof id === 'string' && id.startsWith('thread_camp_') ? id.replace('thread_camp_', '') : id);
    const campaignDealId = getCampaignDealId(thread || { id, deal_id: dealId });
    const now = new Date().toISOString();
    let dealRecord: any = null;
    let submission: any = null;

    if (supabase && campaignDealId) {
      try {
        const { data: dData } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('*')
          .eq('id', campaignDealId)
          .maybeSingle();
        if (dData) dealRecord = dData;

        const { data: sByDeal } = await (privilegedSupabase || supabase)
          .from('content_submissions')
          .select('*')
          .eq('deal_id', campaignDealId)
          // NULL-safe: `neq` alone would also drop older drafts whose submission_type is NULL.
          .or('submission_type.is.null,submission_type.neq.live_link')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sByDeal) submission = sByDeal;
      } catch (e) {
        console.error("[handleCampaignRevision] Error fetching campaign deal/submission:", e);
      }
    }

    const localDeal = (db.deals || []).find((x: any) => x.id === (campaignDealId || dealId) || x.deal_id === (campaignDealId || dealId))
      || (db.collabs || []).find((x: any) => x.collab_id === (campaignDealId || dealId) || x.id === (campaignDealId || dealId));

    // Only the brand asks for changes, and only while a draft is actually with them. Asking
    // on a completed deal, before anything was submitted, or after the draft was approved
    // used to be accepted and spent a revision.
    {
      const guardDeal = dealRecord || localDeal;
      const role = partyRole(user, thread, guardDeal);
      if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');
      if (isClosed(thread, guardDeal)) {
        return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
      }
      const flow = flowOf(thread, guardDeal);
      let draftWithBrand = DRAFT_UNDER_REVIEW_STATES.includes(flow);
      if (!draftWithBrand && ![...PRE_WORK_STATES, ...DRAFT_REVISION_STATES, ...LIVE_LINK_DUE_STATES, ...LIVE_LINK_UNDER_REVIEW_STATES].includes(flow)) {
        draftWithBrand = Boolean(submission && submission.submission_type !== 'live_link') ||
          await hasCampaignDraftEvidence({ client: privilegedSupabase || supabase, db, threadId: thread?.id || id, dealId: campaignDealId });
      }
      if (!draftWithBrand) {
        return conflict(res, 'NO_DRAFT_UNDER_REVIEW', "There is no draft waiting for your review right now.", { flow_state: flow || null });
      }
    }

    const currentUsed = Math.max(Number(dealRecord?.revisions_used || 0), Number(localDeal?.revisions_used || 0));
    const maxRevisions = revisionAllowance(dealRecord?.revision_count, localDeal?.revision_count);

    if (currentUsed >= maxRevisions) {
      return res.status(400).json({
        error: `Revision limit reached (${maxRevisions}/${maxRevisions}).`,
        detail: `Revision limit reached (${maxRevisions}/${maxRevisions}).`,
        _status: 400,
        revisions_used: currentUsed,
        revision_count: maxRevisions
      });
    }

    const nextUsed = currentUsed + 1;

    if (supabase) {
      try {
        if (submission) {
          await (privilegedSupabase || supabase)
            .from('content_submissions')
            .update({
              status: 'CHANGES_REQUESTED',
              brand_feedback: notes || "",
              reviewed_at: now
            })
            .eq('id', submission.id);
        }

        if (campaignDealId) {
          await (privilegedSupabase || supabase)
            .from('deals')
            .update({
              status: 'ACTIVE',
              revisions_used: nextUsed,
              updated_at: now
            })
            .eq('id', campaignDealId);
        }

        if (thread?.id) {
          await (privilegedSupabase || supabase)
            .from('chat_threads')
            .update({
              flow_state: 'CHANGES_REQUESTED',
              status: 'ACTIVE',
              updated_at: now
            })
            .eq('id', thread.id);
        }
      } catch (e) {
        console.error("[handleCampaignRevision] Error updating deal revision in Supabase:", e);
      }
    }

    if (db.content_submissions) {
      // The latest DRAFT, not the oldest row and not a live-link row.
      const sub = db.content_submissions.slice().reverse().find((s: any) => (s.id === id || s.deal_id === (campaignDealId || dealId)) && s.submission_type !== 'live_link');
      if (sub) {
        sub.status = 'CHANGES_REQUESTED';
        sub.brand_feedback = notes || "";
        sub.reviewed_at = now;
      }
    }

    if (localDeal) {
      localDeal.status = 'ACTIVE';
      localDeal.revisions_used = nextUsed;
      localDeal.updated_at = now;
    }

    if (thread) {
      thread.flow_state = 'CHANGES_REQUESTED';
      thread.status = 'ACTIVE';
      thread.updated_at = now;
      thread.revision_notes = notes;
    }

    const targetThreadId = thread?.id || id;
    const creatorId = thread?.creator_id || dealRecord?.creator_id || localDeal?.creator_id;
    // Must be a UUID: chat_messages.message_id is a uuid column. The old `msg_<time>_<x>` id
    // made the Supabase insert fail, so the card lived only in the local store — and the
    // messages endpoint appended local-only rows AFTER everything else: the "Brand Needs Some
    // Changes" card stuck to the bottom of the chat (session 23).
    const msgId = crypto.randomUUID();
    const msgPayload = {
      message_id: msgId,
      thread_id: targetThreadId,
      sender_user_id: user.user_id,
      receiver_user_id: creatorId || '',
      text: `Brand requested changes: ${notes || 'Please review feedback and upload an updated draft.'}`,
      from_name: user.name || 'Brand',
      message_type: 'revision_requested',
      metadata: {
        feedback: notes,
        notes,
        revision_notes: notes,
        revisions_used: nextUsed,
        action: 'revision_requested'
      },
      created_at: now,
      read: false
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgPayload);
      } catch (e: any) { logIgnored("campaigns_routes:2662", e); }
    }

    if (!db.chat_messages) db.chat_messages = [];
    const storedRevisionMsg = {
      ...msgPayload,
      id: msgId,
      content: msgPayload.text,
      sender_id: user.user_id,
      receiver_id: creatorId || '',
      sender_role: 'brand'
    };
    db.chat_messages.push(storedRevisionMsg);

    saveDb(db);

    const io = req.app.get("io");
    if (io) {
      // The live socket copy used to lack id / sender_id / sender_role / content, so the card
      // rendered differently until a reload replaced it with the stored one.
      io.to(targetThreadId).emit("new_message", storedRevisionMsg);
      io.to(targetThreadId).emit("thread_updated", {
        threadId: targetThreadId,
        id: targetThreadId,
        deal_id: dealId,
        status: 'ACTIVE',
        flow_state: 'CHANGES_REQUESTED',
        revision_notes: notes,
        revision_feedback: notes
      });
    }

    return res.json({
      success: true,
      message: "Revision request submitted for campaign draft",
      flow_state: 'CHANGES_REQUESTED',
      revisions_used: nextUsed
    });
  };

  // Creator declines a DRAFT revision request.
  //
  // This used to be routed to handleThreadDeclineLiveLinksResubmission, the LIVE-LINK decline.
  // So declining draft changes marked the thread REVISION_DECLINED_LINKS and posted a
  // "Creator declined live links resubmission" card — and that card offers the brand
  // "Approve Last Submission", which releases the escrow. For a deal whose draft was never
  // approved and that has no live post. The creator's own screen then offered a live-link
  // form because REVISION_DECLINED_LINKS reads as "draft approved".
  //
  // Here a draft decline is what it is: flow_state REVISION_DECLINED and a revision_declined
  // message, which ContentProofNotice already renders with "Approve Draft" (no payout) and
  // "Request changes again".
  const handleCampaignDeclineDraftRevision = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rawId = req.params.id || req.params.threadId;
    const reason = String(req.body?.feedback || req.body?.reason || req.body?.notes || "").trim();
    if (!reason) {
      return res.status(400).json({ error: "Please give a reason for declining the changes." });
    }
    const db = getDb();
    const nowIso = getIsoNow ? getIsoNow() : new Date().toISOString();
    const client = privilegedSupabase || supabase;

    const { thread, deal, dealId: campaignDealId } = await loadCampaignThreadAndDeal({ client, db, rawId, getCampaignDealId });
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    if (isUgcThread(thread)) {
      return res.status(400).json({ error: "This is a UGC order; use the UGC decline endpoint.", code: 'NOT_A_CAMPAIGN_THREAD' });
    }

    const role = partyRole(user, thread, deal);
    if (role !== 'creator' && role !== 'admin') return forbid(res, 'creator');
    if (isClosed(thread, deal)) return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
    const flow = flowOf(thread, deal);
    if (!DRAFT_REVISION_STATES.includes(flow)) {
      return conflict(res, 'NO_REVISION_REQUEST_OPEN', "There is no open revision request on your draft to decline.", { flow_state: flow || null });
    }

    const threadId = thread.id;
    if (supabase) {
      try {
        await client
          .from('chat_threads')
          .update(sanitizeChatThreadSupabasePayload({ flow_state: 'REVISION_DECLINED', status: 'ACTIVE', updated_at: nowIso }))
          .eq('id', threadId);
      } catch (e) {
        console.warn("[handleCampaignDeclineDraftRevision] chat_threads update error:", e);
      }
    }
    const localThread = (db.chat_threads || []).find((t: any) => t.id === threadId);
    if (localThread) {
      localThread.flow_state = 'REVISION_DECLINED';
      localThread.status = 'ACTIVE';
      localThread.decline_reason = reason;
      localThread.updated_at = nowIso;
    }

    const brandId = thread.brand_id || deal?.brand_id || null;
    const msgId = crypto.randomUUID();
    const msgText = `⚠️ Creator declined the requested changes.\n\nReason: ${reason}`;
    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: threadId,
      sender_user_id: user.user_id,
      receiver_user_id: brandId,
      sender_id: user.user_id,
      receiver_id: brandId,
      sender_role: 'creator',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Creator',
      message_type: 'revision_declined',
      metadata: { action: 'revision_declined', status: 'REVISION_DECLINED', feedback: reason },
      read: false,
      created_at: nowIso
    };
    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleCampaignDeclineDraftRevision] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    if (brandId) {
      const notifData = {
        id: `notif_${crypto.randomUUID().slice(0, 10)}`,
        user_id: brandId,
        type: 'deal_revision_declined',
        title: 'Creator declined the requested changes',
        message: `Reason: "${reason}". You can approve the current draft, ask again, or contact support.`,
        link: `/messages/${threadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try { await client.from('notifications').insert(notifData); } catch (e: any) { logIgnored("campaigns_routes:2802", e); }
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    const io = req.app.get("io");
    if (io) {
      io.to(threadId).emit("new_message", msgRecord);
      io.to(threadId).emit("thread_updated", { threadId, id: threadId, status: 'ACTIVE', flow_state: 'REVISION_DECLINED' });
    }
    saveDb(db);

    return res.json({ ok: true, success: true, thread_id: threadId, deal_id: campaignDealId, status: 'ACTIVE', flow_state: 'REVISION_DECLINED' });
  };

  const handleCampaignCancel = async (req: any, res: any) => {
    return res.status(400).json({
      error: "Campaign deals cannot be cancelled via this endpoint",
      detail: "Campaign deals cannot be cancelled via this endpoint",
      _status: 400
    });
  };

  // 10b. Approve Content for Thread (separates Campaign Deals & UGC Collab from Raw Video UGC)
  const handleThreadApproveContent = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = req.body?.notes || req.body?.feedback || "";
    const nowIso = getIsoNow ? getIsoNow() : new Date().toISOString();
    const db = getDb();

    // 1. Resolve thread and check whether it belongs to a Deal vs UGC Order
    let thread: any = null;
    if (supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${id},deal_id.eq.${id}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e) {
        console.warn("[handleThreadApproveContent] Error resolving thread:", e);
      }
    }
    if (!thread && db.chat_threads) {
      thread = db.chat_threads.find((t: any) => t.id === id || t.deal_id === id);
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder: any = null;
    if (supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${id},id.eq.${targetOrderId},brief_id.eq.${id}`)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e) {
        console.warn("[handleThreadApproveContent] Error checking ugc_orders:", e);
      }
    }
    if (!ugcOrder && db.ugc_orders) {
      ugcOrder = db.ugc_orders.find((o: any) => o.id === id || o.id === targetOrderId || o.brief_id === id);
    }

    // Check whether this thread belongs to a UGC order or a Deal
    const isUgcOrder = isUgcThread(thread || { id, deal_id: targetOrderId, ugc_order: ugcOrder });

    const briefId = ugcOrder?.brief_id || thread?.ugc_brief_id;
    let brief: any = null;
    if (supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("campaigns_routes:2884", e); }
    }
    if (!brief && db.ugc_briefs && briefId) {
      brief = db.ugc_briefs.find((b: any) => b.id === briefId);
    }

    const deliverableType = String(
      ugcOrder?.deliverable_type ||
      brief?.deliverable_type ||
      thread?.deliverable_type ||
      ""
    ).toLowerCase();

    const isCollab = ugcOrder?.is_collaboration !== undefined
      ? Boolean(ugcOrder.is_collaboration)
      : (ugcOrder?.requires_live_link !== undefined
        ? Boolean(ugcOrder.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : isCollaborationDeliverable(deliverableType)));

    const requiresLiveLink = ugcOrder?.requires_live_link !== undefined
      ? Boolean(ugcOrder.requires_live_link)
      : isCollab;

    // If it's a Normal UGC order thread (requiresLiveLink === false), draft approval IS the final approval: releases payout
    if (isUgcOrder && !requiresLiveLink && syncUgcLifecycleEvent) {
      const result = await syncUgcLifecycleEvent({
        rawId: id,
        action: 'APPROVE',
        actorUser: user,
        notes,
        io: req.app.get("io")
      });
      return res.json({
        ...result,
        message: "Order approved! Escrow payout released to creator."
      });
    }

    // Otherwise, this is a Collaboration (Campaign Deal or UGC Collaboration Reel)!
    // In collaboration flow, draft approval ONLY approves the draft, does NOT release escrow payout,
    // and asks creator to post to their handle and submit live links.
    const dealId = thread?.deal_id || id;
    const campaignDealId = getCampaignDealId(thread || { id, deal_id: dealId });
    const targetThreadId = thread?.id || id;
    let creatorId = thread?.creator_id;
    let brandId = thread?.brand_id || user?.user_id;

    // CAMPAIGN ONLY (the UGC collaboration path below is unchanged). The brand approves a
    // draft that exists. The creator could previously "approve" their own draft, and a draft
    // could be approved before anything was submitted.
    if (!isUgcOrder) {
      const guardDeal = (db.deals || []).find((d: any) => d.id === campaignDealId) || null;
      const role = partyRole(user, thread, guardDeal);
      if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');
      if (isClosed(thread, guardDeal)) {
        return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
      }
      const flow = flowOf(thread, guardDeal);
      if ([...LIVE_LINK_DUE_STATES, ...LIVE_LINK_UNDER_REVIEW_STATES].includes(flow)) {
        return res.json({
          ok: true,
          success: true,
          already_approved: true,
          deal_id: dealId,
          thread_id: targetThreadId,
          status: 'CONTENT_APPROVED',
          flow_state: flow,
          message: "This draft was already approved."
        });
      }
      let draftWithBrand = DRAFT_UNDER_REVIEW_STATES.includes(flow);
      if (!draftWithBrand && ![...PRE_WORK_STATES, ...DRAFT_REVISION_STATES].includes(flow)) {
        draftWithBrand = await hasCampaignDraftEvidence({ client: privilegedSupabase || supabase, db, threadId: targetThreadId, dealId: campaignDealId });
      }
      if (!draftWithBrand) {
        return conflict(res, 'NO_DRAFT_TO_APPROVE', "There is no draft waiting for your approval right now.", { flow_state: flow || null });
      }
    }

    if ((!creatorId || !brandId) && supabase && campaignDealId) {
      try {
        const { data: dRec } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('creator_id, brand_id')
          .eq('id', campaignDealId)
          .maybeSingle();
        if (dRec) {
          if (!creatorId) creatorId = dRec.creator_id;
          if (!brandId) brandId = dRec.brand_id;
        }
      } catch (e: any) { logIgnored("campaigns_routes:2976", e); }
    }

    // A. Update latest content_submission for this deal to APPROVED
    if (supabase && campaignDealId) {
      try {
        const { data: sByDeal } = await (privilegedSupabase || supabase)
          .from('content_submissions')
          .select('*')
          .eq('deal_id', campaignDealId)
          // NULL-safe: `neq` alone would also drop older drafts whose submission_type is NULL.
          .or('submission_type.is.null,submission_type.neq.live_link')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sByDeal) {
          await (privilegedSupabase || supabase)
            .from('content_submissions')
            .update({
              status: 'APPROVED',
              brand_feedback: notes || null,
              reviewed_at: nowIso
            })
            .eq('id', sByDeal.id);
        }
      } catch (e) {
        console.warn("[handleThreadApproveContent] content_submissions update error:", e);
      }
    }
    if (db.content_submissions) {
      const sub = db.content_submissions.slice().reverse().find((s: any) => s.deal_id === (campaignDealId || dealId) || s.id === (campaignDealId || dealId));
      if (sub) {
        sub.status = 'APPROVED';
        sub.reviewed_at = nowIso;
        if (notes) sub.brand_feedback = notes;
      }
    }

    // B. Update deals & ugc_orders table: status = 'CONTENT_APPROVED' (do NOT touch escrow_hold)
    if (supabase) {
      try {
        if (campaignDealId) {
          await (privilegedSupabase || supabase)
            .from('deals')
            .update({
              status: 'CONTENT_APPROVED',
              updated_at: nowIso
            })
            .eq('id', campaignDealId);
        }
        if (ugcOrder?.id || isUgcOrder) {
          const uId = ugcOrder?.id || id;
          await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .update({
              draft_approved_at: nowIso,
              updated_at: nowIso
            })
            .or(`id.eq.${uId},id.eq.${id}`);
        }
      } catch (e) {
        console.warn("[handleThreadApproveContent] deals/ugc_orders update error:", e);
      }
    }
    if (db.deals && dealId) {
      const d = db.deals.find((x: any) => x.id === dealId || x.deal_id === dealId);
      if (d) {
        d.status = 'CONTENT_APPROVED';
        d.stage = 'CONTENT_APPROVED';
        d.updated_at = nowIso;
      }
    }
    if (db.collabs && dealId) {
      const c = db.collabs.find((x: any) => x.collab_id === dealId || x.id === dealId);
      if (c) {
        c.status = 'CONTENT_APPROVED';
        c.stage = 'CONTENT_APPROVED';
        c.updated_at = nowIso;
      }
    }
    if (db.ugc_orders && (ugcOrder || isUgcOrder)) {
      const uId = ugcOrder?.id || id;
      const ord = db.ugc_orders.find((o: any) => o.id === uId || o.brief_id === id);
      if (ord) {
        ord.draft_approved_at = nowIso;
        ord.status = 'CONTENT_APPROVED';
        ord.stage = 'COMPLETED_APPROVAL';
        ord.updated_at = nowIso;
      }
    }

    // C. Update chat_threads: status = 'ACTIVE', flow_state = 'CONTENT_APPROVED' (do NOT set COMPLETED)
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            status: 'ACTIVE',
            flow_state: 'CONTENT_APPROVED',
            updated_at: nowIso
          })
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadApproveContent] chat_threads update error:", e);
      }
    }
    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.status = 'ACTIVE';
        t.flow_state = 'CONTENT_APPROVED';
        t.content_approved = true;
        t.updated_at = nowIso;
      }
    }

    // D. Insert accurate chat message
    const msgId = crypto.randomUUID();
    const msgText = "🎉 Content Approved! The brand has approved your draft. Please submit your live post link to complete this deal.";
    const msgMetadata = {
      action: 'draft_approved',
      status: 'CONTENT_APPROVED',
      notes: notes || undefined
    };
    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: user?.user_id || brandId,
      receiver_user_id: creatorId || null,
      sender_id: user?.user_id || brandId,
      receiver_id: creatorId || null,
      sender_role: 'brand',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Brand',
      message_type: 'content_approved',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadApproveContent] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // E. Notification for creator
    if (creatorId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: creatorId,
        type: 'deal_content_approved',
        title: 'Draft Approved! 🚀',
        message: 'The brand approved your content draft. Please submit your live post link to proceed.',
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e: any) { logIgnored("campaigns_routes:3144", e); }
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // F. Socket emission
    const io = req.app.get("io");
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      emitThreadEvent(io, "thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'CONTENT_APPROVED'
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      deal_id: dealId,
      thread_id: targetThreadId,
      status: 'CONTENT_APPROVED',
      flow_state: 'CONTENT_APPROVED',
      message: "Draft content approved! Notification sent to creator to submit live link."
    });
  };

  return {
    handleThreadApproveLiveLinks,
    handleThreadApproveContent,
    handleThreadSubmitLiveLink,
    handleThreadRejectLiveLinks,
    handleThreadDeclineLiveLinksResubmission,
    handleCampaignRevision,
    handleCampaignDeclineDraftRevision,
    handleCampaignCancel
  };
}

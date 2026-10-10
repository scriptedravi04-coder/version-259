// UGC Deadline Reminders, Auto-Relist and Expiry Service
// Implements specs from prompts: §2, §3, §4, §5, §6, §7, §10, §11.
import crypto from "crypto";
import { logIgnored } from "../logIgnored";
import { Resend, buildEmailHtml } from "../helpers";
import { ADMIN_ROOM } from "../socketAccess";
import { toAdminRefundSnapshot } from "../ugcRefundAccounts";

export type UgcOrderRecord = {
  id: string;
  brief_id: string;
  brand_id: string;
  creator_id: string;
  status: string;
  payment_status?: string;
  creator_payout?: number;
  agreed_amount?: number;
  escrow_amount?: number;
  video_url?: string;
  submission_link?: string;
  drive_url?: string;
  delivered_at?: string;
  internal_deadline?: string;
  created_at: string;
  reminders_sent?: number;
  last_reminder_at?: string;
  admin_alerted_at?: string;
  expired_at?: string;
  expiry_reason?: string;
  [key: string]: any;
};

export type UgcBriefRecord = {
  id: string;
  brand_id: string;
  title?: string;
  budget?: number;
  max_creators?: number;
  claimed_count?: number;
  status?: string;
  delivery_hours?: number | string;
  relisted_at?: string;
  relist_count?: number;
  is_priority?: boolean;
  [key: string]: any;
};

/** Statuses of an order still waiting for its first draft (the only ones that can expire). */
export const PRE_DRAFT_STATUSES = ["ACCEPTED", "CLAIMED", "IN_PROGRESS", "PENDING", "ACTIVE", "SIGNED"];

export function escapeHtml(v: any): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}

/** Convert any timestamp to an Indian Standard Time (IST, UTC+5:30) Date object */
export function getIstDate(date: Date = new Date()): Date {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000);
}

/** Quiet hours: 10:00 PM to 8:00 AM IST (inclusive of 22:00 up to 07:59:59) */
export function isQuietHours(date: Date = new Date()): boolean {
  const ist = getIstDate(date);
  const hour = ist.getHours();
  return hour >= 22 || hour < 8;
}

/**
 * §2 Definition: "Did something" = first draft exists:
 * video_url OR submission_link OR drive_url set, or status
 * SUBMITTED / DELIVERED / CONTENT_SUBMITTED / IN_REVIEW / CONTENT_APPROVED / COMPLETED.
 */
export function hasUgcFirstDraft(order: UgcOrderRecord | any): boolean {
  if (!order) return false;
  if (order.video_url || order.submission_link || order.drive_url) return true;
  const s = String(order.status || "").toUpperCase();
  return [
    "SUBMITTED",
    "DELIVERED",
    "CONTENT_SUBMITTED",
    "IN_REVIEW",
    "CONTENT_APPROVED",
    "COMPLETED",
    "AWAITING_LIVE_LINK",
    "PROOF_SUBMITTED",
    "LIVE_LINKS_SUBMITTED"
  ].includes(s);
}

export function isOrderClosed(order: UgcOrderRecord | any): boolean {
  if (!order) return true;
  const s = String(order.status || "").toUpperCase();
  return ["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED", "CLOSED"].includes(s);
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "0 hours";
  const hours = Math.floor(ms / (3600 * 1000));
  const minutes = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}${minutes > 0 && hours < 3 ? ` ${minutes}m` : ""}`;
  }
  return `${Math.max(1, minutes)} minute${minutes === 1 ? "" : "s"}`;
}

export function formatDeadlineTime(dateStr: string): string {
  if (!dateStr) return "the deadline";
  try {
    const d = new Date(dateStr);
    const ist = getIstDate(d);
    const nowIst = getIstDate(new Date());
    const isToday = ist.toDateString() === nowIst.toDateString();
    const isTomorrow =
      new Date(nowIst.getTime() + 24 * 3600000).toDateString() === ist.toDateString();

    const timeStr = ist.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    const dayStr = isToday ? "today" : isTomorrow ? "tomorrow" : ist.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    return `${timeStr} ${dayStr}`;
  } catch {
    return dateStr;
  }
}

/** Approved message copy (§10) */
export function buildReminderCopy({
  reminderIndex,
  order,
  brief,
  brand,
  creator,
  now = new Date(),
  appBaseUrl = process.env.APP_URL || "https://ybexmedia.in"
}: {
  reminderIndex: number; // 1 to 6
  order: UgcOrderRecord;
  brief: UgcBriefRecord;
  brand: any;
  creator: any;
  now?: Date;
  appBaseUrl?: string;
}) {
  const payout = Number(order.creator_payout ?? order.agreed_amount ?? brief?.budget ?? 0);
  const creatorFirstName = (creator?.name || creator?.full_name || "Creator").trim().split(" ")[0];
  const briefTitle = brief?.title || "UGC Video Brief";
  const brandName = brand?.company_name || brand?.brand_name || brand?.name || "the brand";
  const deadlineDate = new Date(order.internal_deadline || now.getTime() + 24 * 3600000);
  const msLeft = Math.max(0, deadlineDate.getTime() - now.getTime());
  const timeLeft = formatTimeLeft(msLeft);
  const deadlineTime = formatDeadlineTime(deadlineDate.toISOString());
  const orderWorkspaceUrl = `${appBaseUrl}/creator/ugc?tab=manage&orderId=${order.id}`;

  const isFinal = reminderIndex === 6 || msLeft <= 3 * 3600000;

  if (reminderIndex === 1 && !isFinal) {
    return {
      type: "UGC_REMINDER_FIRST",
      subject: `⏳ Your ₹${payout} is waiting — upload your video for ${brandName}`,
      body: `Hi ${creatorFirstName}, you claimed **${briefTitle}** by ${brandName}. The payment is already held safely with Ybex SafePay, and it's yours once your video is approved. You have **${timeLeft}** left to upload your draft.`,
      buttonText: "Upload your video",
      buttonUrl: orderWorkspaceUrl
    };
  }

  if (isFinal) {
    return {
      type: "UGC_REMINDER_FINAL",
      subject: `🚨 Last chance: ${briefTitle} gets cancelled at ${deadlineTime}`,
      body: `Hi ${creatorFirstName}, this is the last reminder. If no draft is uploaded by **${deadlineTime}**, this order will be cancelled, the brief goes to another creator, and the missed deadline is recorded on your profile.`,
      buttonText: "Upload now",
      buttonUrl: orderWorkspaceUrl
    };
  }

  // Repeat reminder (every 3h)
  return {
    type: "UGC_REMINDER_REPEAT",
    subject: `⚠️ Only ${timeLeft} left — don't lose your ₹${payout} order`,
    body: `Hi ${creatorFirstName}, we haven't received your draft for **${briefTitle}** yet. Please upload it before **${deadlineTime}**. Brands pick creators who deliver on time, and late or missed orders show on your profile.`,
    buttonText: "Upload your video",
    buttonUrl: orderWorkspaceUrl
  };
}

export function buildCreatorExpiredCopy({
  order,
  brief,
  creator,
  appBaseUrl = process.env.APP_URL || "https://ybexmedia.in"
}: {
  order: UgcOrderRecord;
  brief: UgcBriefRecord;
  creator: any;
  appBaseUrl?: string;
}) {
  const payout = Number(order.creator_payout ?? order.agreed_amount ?? brief?.budget ?? 0);
  const creatorFirstName = (creator?.name || creator?.full_name || "Creator").trim().split(" ")[0];
  const briefTitle = brief?.title || "UGC Video Brief";
  return {
    type: "UGC_ORDER_EXPIRED",
    subject: `❌ Your ₹${payout} order for ${briefTitle} was cancelled`,
    body: `Hi ${creatorFirstName}, no draft was uploaded for **${briefTitle}** by the deadline, so the order has been cancelled and the brief is open to other creators. You can keep claiming new briefs. Please claim only when you can deliver on time.`,
    buttonText: "Explore briefs",
    buttonUrl: `${appBaseUrl}/creator/ugc?tab=explore`
  };
}

export function buildBrandRelistedCopy({
  brief,
  appBaseUrl = process.env.APP_URL || "https://ybexmedia.in"
}: {
  brief: UgcBriefRecord;
  appBaseUrl?: string;
}) {
  const briefTitle = brief?.title || "UGC Video Brief";
  return {
    type: "UGC_BRIEF_RELISTED",
    subject: `Your brief is live again — back at the top for creators`,
    body: `The creator who claimed **${briefTitle}** didn't deliver in time, so we cancelled their order. Your payment is still held safely with Ybex SafePay, and your brief is back at the top of the creator feed so a new creator can pick it up quickly.`,
    buttonText: "View brief",
    buttonUrl: `${appBaseUrl}/brand/ugc`
  };
}

export function buildAdminAlertCopy({
  order,
  brief,
  brand,
  creator,
  now = new Date(),
  appBaseUrl = process.env.APP_URL || "https://ybexmedia.in"
}: {
  order: UgcOrderRecord;
  brief: UgcBriefRecord;
  brand: any;
  creator: any;
  now?: Date;
  appBaseUrl?: string;
}) {
  const creatorName = creator?.name || creator?.full_name || "Creator";
  const creatorPhone = creator?.phone || creator?.phone_number || "No phone";
  const creatorEmail = creator?.email || "No email";
  const briefTitle = brief?.title || "UGC Brief";
  const brandName = brand?.company_name || brand?.brand_name || brand?.name || "Brand";
  const deadlineDate = new Date(order.internal_deadline || now.getTime() + 3 * 3600000);
  const msLeft = Math.max(0, deadlineDate.getTime() - now.getTime());
  const timeLeft = formatTimeLeft(msLeft);
  const deadlineTime = formatDeadlineTime(deadlineDate.toISOString());
  const remindersSent = order.reminders_sent || 0;

  return {
    subject: `[URGENT] ${creatorName} hasn't delivered — ${timeLeft} left`,
    details: `${creatorName} (${creatorPhone}, ${creatorEmail}) claimed ${briefTitle} for ${brandName} and hasn't uploaded a draft. Deadline: ${deadlineTime} (${timeLeft} left). Reminders sent: ${remindersSent}.`,
    buttonText: "Open order",
    buttonUrl: `${appBaseUrl}/admin`
  };
}

export function buildBrandRefundSentCopy({
  amount,
  briefTitle,
  accountLast4,
  utr
}: {
  amount: number;
  briefTitle: string;
  accountLast4: string;
  utr: string;
}) {
  return {
    type: "UGC_REFUND_SENT",
    subject: `✅ ₹${amount} refund sent — UTR ${utr}`,
    body: `We've sent **₹${amount}** for **${briefTitle}** to your account ending **${accountLast4}**. Bank reference (UTR): **${utr}**.`
  };
}

/**
 * WhatsApp message dispatcher (§11).
 * Fails safe: skipped silently if no credentials or no opt-in; never throws or crashes the cron.
 */
export async function sendUgcWhatsAppMessage({
  phone,
  optIn,
  templateName,
  parameters,
  buttonUrl
}: {
  phone?: string | null;
  optIn?: boolean;
  templateName: string;
  parameters: string[];
  buttonUrl?: string;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  if (!optIn) {
    return { ok: false, skipped: true, reason: "NO_WHATSAPP_OPT_IN" };
  }
  if (!phone) {
    return { ok: false, skipped: true, reason: "NO_PHONE_NUMBER" };
  }

  const apiKey = process.env.WHATSAPP_API_KEY || process.env.META_WA_API_KEY;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_ID;

  if (!apiKey || !phoneNumberId) {
    console.log(`[WhatsApp Skipped - Missing config] Template: ${templateName} to ${phone}`);
    return { ok: false, skipped: true, reason: "NOT_CONFIGURED" };
  }

  try {
    // Standard Meta Cloud API call
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: parameters.map((p) => ({ type: "text", text: p }))
            },
            ...(buttonUrl
              ? [
                  {
                    type: "button",
                    sub_type: "url",
                    index: 0,
                    parameters: [{ type: "text", text: buttonUrl.replace(/^https?:\/\/[^/]+/, "") }]
                  }
                ]
              : [])
          ]
        }
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn(`[WhatsApp API Error] to ${cleanPhone}:`, data);
      return { ok: false, reason: data?.error?.message || "WA_API_ERROR" };
    }
    console.log(`[WhatsApp Success] Template ${templateName} sent to ${cleanPhone}`);
    return { ok: true };
  } catch (err: any) {
    console.warn(`[WhatsApp Exception]`, err?.message || err);
    return { ok: false, reason: err?.message || "EXCEPTION" };
  }
}

/** Dependencies needed for executing the cron job */
export type UgcDeadlineDeps = {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  releaseBriefSlot: (briefId: string, creatorId?: string) => Promise<any>;
  app?: any;
  now?: () => Date;
};

/**
 * Main Cron Execution Function
 * Called every 15 minutes by Cloud Scheduler via POST /internal/cron/ugc-deadlines
 * Idempotent, concurrency-safe, DB-first.
 */
export async function runUgcDeadlineChecks(deps: UgcDeadlineDeps) {
  const now = deps.now ? deps.now() : new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const client = deps.privilegedSupabase || deps.supabase;
  const db = deps.getDb();

  const results = {
    checked: 0,
    reminders_sent: 0,
    admin_alerts_sent: 0,
    orders_expired: 0,
    errors: [] as string[]
  };

  // 1. Fetch active orders
  let orders: UgcOrderRecord[] = [];
  if (client) {
    try {
      const { data, error } = await client
        .from("ugc_orders")
        .select("*")
        .not("status", "in", '("COMPLETED","CANCELLED","REFUNDED","EXPIRED","CLOSED")');
      if (!error && Array.isArray(data)) {
        orders = data;
      }
    } catch (e: any) {
      console.error("[ugcDeadlineService] Supabase fetch error:", e);
    }
  }

  // Fallback / merge local store
  const localOrders = (db.ugc_orders || []).filter((o: any) => !isOrderClosed(o));
  const orderMap = new Map<string, UgcOrderRecord>();
  orders.forEach((o) => orderMap.set(o.id, o));
  localOrders.forEach((lo: any) => {
    if (!orderMap.has(lo.id)) orderMap.set(lo.id, lo);
    else orderMap.set(lo.id, { ...orderMap.get(lo.id)!, ...lo });
  });

  const activeOrders = Array.from(orderMap.values()).filter(
    (o) => !isOrderClosed(o) && !hasUgcFirstDraft(o)
  );

  results.checked = activeOrders.length;
  if (activeOrders.length === 0) {
    return results;
  }

  // Fetch briefs and users for context
  const briefIds = Array.from(new Set(activeOrders.map((o) => o.brief_id).filter(Boolean)));
  const userIds = Array.from(
    new Set([...activeOrders.map((o) => o.creator_id), ...activeOrders.map((o) => o.brand_id)].filter(Boolean))
  );

  const briefMap = new Map<string, UgcBriefRecord>();
  const userMap = new Map<string, any>();

  // Fetch from DB
  if (client && briefIds.length) {
    try {
      const { data: bData } = await client.from("ugc_briefs").select("*").in("id", briefIds);
      (bData || []).forEach((b: any) => briefMap.set(b.id, b));
    } catch (e) { logIgnored("ugcDeadlines:briefs", e); }
  }
  (db.ugc_briefs || []).forEach((b: any) => {
    if (briefIds.includes(b.id) && !briefMap.has(b.id)) briefMap.set(b.id, b);
  });

  if (client && userIds.length) {
    try {
      const { data: uData } = await client
        .from("users")
        .select("user_id, name, email, phone, whatsapp_opt_in, missed_deadlines_count")
        .in("user_id", userIds);
      (uData || []).forEach((u: any) => userMap.set(u.user_id, u));
    } catch (e) { logIgnored("ugcDeadlines:users", e); }
  }
  (db.users || []).forEach((u: any) => {
    const uid = u.user_id || u.id;
    if (userIds.includes(uid) && !userMap.has(uid)) userMap.set(uid, u);
  });

  const quietHoursNow = isQuietHours(now);
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";

  for (const order of activeOrders) {
    try {
      const brief = briefMap.get(order.brief_id) || { id: order.brief_id, brand_id: order.brand_id };
      const creator = userMap.get(order.creator_id) || { user_id: order.creator_id };
      const brand = userMap.get(order.brand_id) || { user_id: order.brand_id };

      const claimTimeMs = new Date(order.created_at || nowIso).getTime();
      const deadlineMs = new Date(order.internal_deadline || claimTimeMs + 24 * 3600000).getTime();
      const msSinceClaim = nowMs - claimTimeMs;
      const msUntilDeadline = deadlineMs - nowMs;
      const remindersSent = Number(order.reminders_sent || 0);
      const lastReminderMs = order.last_reminder_at ? new Date(order.last_reminder_at).getTime() : 0;

      // -------------------------------------------------------------
      // Case A: Deadline Passed and Still No Draft -> Expire & Relist (§6)
      // -------------------------------------------------------------
      if (nowMs >= deadlineMs) {
        // Guarded conditional write: only if status is not already EXPIRED
        let updated = false;
        if (client) {
          // Only while the order is STILL waiting for its first draft: a creator who uploads a
          // second before this run must not be expired (the list above was read earlier).
          const { data: updatedRows, error } = await client
            .from("ugc_orders")
            .update({
              status: "EXPIRED",
              expired_at: nowIso,
              expiry_reason: "NO_DRAFT_BY_DEADLINE"
            })
            .eq("id", order.id)
            .in("status", PRE_DRAFT_STATUSES)
            .is("video_url", null)
            .select("id");
          if (!error && updatedRows && updatedRows.length > 0) {
            updated = true;
          }
        } else {
          updated = true;
        }

        if (updated) {
          order.status = "EXPIRED";
          order.expired_at = nowIso;
          order.expiry_reason = "NO_DRAFT_BY_DEADLINE";

          // Mirror local db
          const locOrd = (db.ugc_orders || []).find((o: any) => o.id === order.id);
          if (locOrd) {
            locOrd.status = "EXPIRED";
            locOrd.expired_at = nowIso;
            locOrd.expiry_reason = "NO_DRAFT_BY_DEADLINE";
          }

          // 2. Release slot back to brief (money stays in escrow)
          await deps.releaseBriefSlot(brief.id, order.creator_id);

          // A brief the brand already cancelled (fully or the open slots) can't take a new
          // creator, so this slot's money would sit stuck: it goes to the refund queue instead.
          const briefStatus = String(brief.status || "").toUpperCase();
          if (["CANCELLED", "PARTIALLY_CANCELLED"].includes(briefStatus)) {
            await queueSlotRefund({ order, brief, deps, nowIso });
            await postChatSystemMessage({
              orderId: order.id, briefId: brief.id, brandId: order.brand_id, creatorId: order.creator_id,
              message: `This order expired because no draft was submitted by the deadline. The brief was already cancelled, so this slot has been added to your refund.`,
              deps
            });
            deps.saveDb(db);
            results.orders_expired++;
            continue;
          }

          // 3. Mark brief as relisted with priority Explore placement (§6, §7)
          const newRelistCount = Number(brief.relist_count || 0) + 1;
          if (client) {
            await client
              .from("ugc_briefs")
              .update({
                relisted_at: nowIso,
                relist_count: newRelistCount,
                is_priority: true
              })
              .eq("id", brief.id);
          }
          brief.relisted_at = nowIso;
          brief.relist_count = newRelistCount;
          brief.is_priority = true;

          const locBrief = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
          if (locBrief) {
            locBrief.relisted_at = nowIso;
            locBrief.relist_count = newRelistCount;
            locBrief.is_priority = true;
          }

          // 4. Record missed-deadline count on creator
          if (client) {
            try {
              const currentMissed = Number(creator.missed_deadlines_count || 0) + 1;
              await client
                .from("users")
                .update({ missed_deadlines_count: currentMissed })
                .eq("user_id", creator.user_id);
            } catch (e) { logIgnored("ugcDeadlines:creatorMissedCount", e); }
          }
          if (creator) {
            creator.missed_deadlines_count = Number(creator.missed_deadlines_count || 0) + 1;
          }

          // 5. Notify Creator (§10)
          const creatorCopy = buildCreatorExpiredCopy({ order, brief, creator });
          await dispatchNotification({
            userId: order.creator_id,
            email: creator.email,
            phone: creator.phone || creator.phone_number,
            whatsappOptIn: Boolean(creator.whatsapp_opt_in),
            copy: creatorCopy,
            deps,
            isQuietHoursNow: quietHoursNow
          });

          // Notify Brand (§10)
          const brandCopy = buildBrandRelistedCopy({ brief });
          await dispatchNotification({
            userId: order.brand_id,
            email: brand.email,
            phone: brand.phone || brand.phone_number,
            whatsappOptIn: Boolean(brand.whatsapp_opt_in),
            copy: brandCopy,
            deps,
            isQuietHoursNow: quietHoursNow
          });

          // 6. Post system message to chat thread & trigger thread_updated (protected rule 30)
          await postChatSystemMessage({
            orderId: order.id,
            briefId: brief.id,
            brandId: order.brand_id,
            creatorId: order.creator_id,
            message: `This order expired because no draft was submitted by the deadline (${formatDeadlineTime(order.internal_deadline || nowIso)}). The brief has been relisted for creators.`,
            deps
          });

          deps.saveDb(db);
          results.orders_expired++;
          continue;
        }
      }

      // -------------------------------------------------------------
      // Case B: Admin Alert (§5)
      // 3 hours before deadline, if still no draft, alert admin once
      // -------------------------------------------------------------
      if (msUntilDeadline <= 3 * 3600000 && msUntilDeadline > 0 && !order.admin_alerted_at) {
        let alertClaimed = false;
        if (client) {
          const { data: updatedRows, error } = await client
            .from("ugc_orders")
            .update({ admin_alerted_at: nowIso })
            .eq("id", order.id)
            .is("admin_alerted_at", null)
            .select("id");
          if (!error && updatedRows && updatedRows.length > 0) alertClaimed = true;
        } else {
          alertClaimed = true;
        }

        if (alertClaimed) {
          order.admin_alerted_at = nowIso;
          const locOrd = (db.ugc_orders || []).find((o: any) => o.id === order.id);
          if (locOrd) locOrd.admin_alerted_at = nowIso;

          const alertCopy = buildAdminAlertCopy({ order, brief, brand, creator, now });

          // In-app admin alert
          await insertInAppNotification({
            userId: "admin",
            type: "UGC_DEADLINE_ADMIN_ALERT",
            title: alertCopy.subject,
            message: alertCopy.details,
            redirectPath: "/admin",
            isAdminMessage: true,
            deps
          });

          // Email super admin
          if (resendApiKey) {
            try {
              const resend = new Resend(resendApiKey);
              const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.ADMIN_EMAIL || "";
              if (!adminEmail) throw new Error("ADMIN_ALERT_EMAIL not set — in-app alert only");
              const html = buildEmailHtml({
                title: alertCopy.subject,
                greeting: "Admin Team,",
                paragraphs: [
                  `<pre style="background:#f8fafc;padding:12px;border-radius:8px;font-family:monospace;font-size:13px;white-space:pre-wrap;">${escapeHtml(alertCopy.details)}</pre>`
                ],
                button: { text: alertCopy.buttonText, link: alertCopy.buttonUrl }
              });
              await resend.emails.send({
                from: fromEmail,
                to: [adminEmail],
                subject: alertCopy.subject,
                html
              });
            } catch (e: any) {
              console.warn("[ugcDeadlineService] Admin alert email error:", e?.message);
            }
          }

          // Admin action log (WHO = system, WHEN = now)
          if (!db.admin_logs) db.admin_logs = [];
          db.admin_logs.unshift({
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            actor_id: "system",
            action: "UGC_DEADLINE_ADMIN_ALERT",
            target_id: order.id,
            details: alertCopy.details,
            created_at: nowIso
          });

          results.admin_alerts_sent++;
        }
      }

      // -------------------------------------------------------------
      // Case C: Reminders to Creator (§4)
      // Cap: Max 6 reminders per order
      // Schedule: 1st at claim + 6h; then every 3h; stop if draft exists
      // -------------------------------------------------------------
      // Quiet hours (10 pm–8 am IST): the reminder is NOT counted as sent — the first run after
      // 8 am sends it on every channel (spec §4). It used to be marked sent with only the in-app
      // copy, so the email/WhatsApp for that slot was lost.
      if (remindersSent < 6 && msUntilDeadline > 0 && !quietHoursNow) {
        let isDue = false;
        let nextIndex = remindersSent + 1;

        if (remindersSent === 0 && msSinceClaim >= 6 * 3600000) {
          isDue = true;
        } else if (remindersSent > 0 && msSinceClaim >= 6 * 3600000 && nowMs >= lastReminderMs + 3 * 3600000) {
          isDue = true;
        }

        if (isDue) {
          // Conditional write to increment reminders_sent idempotently
          let claimed = false;
          if (client) {
            const { data: rows, error } = await client
              .from("ugc_orders")
              .update({
                reminders_sent: nextIndex,
                last_reminder_at: nowIso
              })
              .eq("id", order.id)
              .eq("reminders_sent", remindersSent)
              .select("id");
            if (!error && rows && rows.length > 0) claimed = true;
          } else {
            claimed = true;
          }

          if (claimed) {
            order.reminders_sent = nextIndex;
            order.last_reminder_at = nowIso;
            const locOrd = (db.ugc_orders || []).find((o: any) => o.id === order.id);
            if (locOrd) {
              locOrd.reminders_sent = nextIndex;
              locOrd.last_reminder_at = nowIso;
            }

            const copy = buildReminderCopy({
              reminderIndex: nextIndex,
              order,
              brief,
              brand,
              creator,
              now
            });

            await dispatchNotification({
              userId: order.creator_id,
              email: creator.email,
              phone: creator.phone || creator.phone_number,
              whatsappOptIn: Boolean(creator.whatsapp_opt_in),
              copy,
              deps,
              isQuietHoursNow: quietHoursNow
            });

            results.reminders_sent++;
          }
        }
      }
    } catch (orderErr: any) {
      console.error(`[ugcDeadlineService] Error processing order ${order.id}:`, orderErr);
      results.errors.push(`Order ${order.id}: ${orderErr?.message || orderErr}`);
    }
  }

  deps.saveDb(db);
  return results;
}

/** Dispatches in-app, email and WhatsApp notifications respecting quiet hours */
async function dispatchNotification({
  userId,
  email,
  phone,
  whatsappOptIn,
  copy,
  deps,
  isQuietHoursNow,
  inAppPath
}: {
  userId: string;
  email?: string;
  phone?: string;
  whatsappOptIn?: boolean;
  /** In-app links stay inside the app (rule 38); defaults to the email button URL. */
  inAppPath?: string;
  copy: {
    type: string;
    subject: string;
    body: string;
    buttonText: string;
    buttonUrl: string;
  };
  deps: UgcDeadlineDeps;
  isQuietHoursNow: boolean;
}) {
  // 1. In-app notification is ALWAYS sent immediately
  await insertInAppNotification({
    userId,
    type: copy.type,
    title: copy.subject,
    message: copy.body.replace(/\*\*/g, ""),
    redirectPath: inAppPath || copy.buttonUrl,
    deps
  });

  // 2. Email & WhatsApp: suppressed during quiet hours (10 pm to 8 am IST)
  if (isQuietHoursNow) {
    console.log(`[ugcDeadlineService] Quiet hours active (10pm-8am IST) — email/WhatsApp deferred for ${userId}`);
    return;
  }

  // Email via Resend
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey && email && email.includes("@") && !email.endsWith(".demo") && !email.endsWith("@example.com")) {
    try {
      const resend = new Resend(resendApiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
      const html = buildEmailHtml({
        title: copy.subject,
        greeting: "Hello,",
        // Titles and names come from users (brief title, brand name): escape before HTML.
        paragraphs: [`<div style="white-space:pre-wrap;font-size:15px;line-height:1.6;">${escapeHtml(copy.body).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>`],
        button: copy.buttonText ? { text: copy.buttonText, link: copy.buttonUrl } : undefined
      });
      await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: copy.subject,
        html
      });
    } catch (e: any) {
      console.warn(`[ugcDeadlineService] Email dispatch failed for ${email}:`, e?.message);
    }
  }

  // WhatsApp
  await sendUgcWhatsAppMessage({
    phone,
    optIn: whatsappOptIn,
    templateName: copy.type.toLowerCase(),
    parameters: [copy.subject, copy.body.replace(/\*\*/g, "")],
    buttonUrl: copy.buttonUrl
  });
}

/** Insert in-app notification row and emit socket notification */
async function insertInAppNotification({
  userId,
  type,
  title,
  message,
  redirectPath,
  isAdminMessage = false,
  deps
}: {
  userId: string;
  type: string;
  title: string;
  message: string;
  redirectPath?: string;
  isAdminMessage?: boolean;
  deps: UgcDeadlineDeps;
}) {
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();

  const payload: any = {
    notif_id: notifId,
    user_id: userId,
    type,
    title,
    message,
    redirect_path: redirectPath || null,
    read: false,
    created_at: nowIso
  };

  const db = deps.getDb();
  if (!db.notifications) db.notifications = [];
  db.notifications.unshift(payload);

  const client = deps.privilegedSupabase || deps.supabase;
  if (client) {
    try {
      if (isAdminMessage || userId === "admin") {
        const { data: adminUsers } = await client
          .from("users")
          .select("user_id")
          .or("role.eq.admin,role.eq.sub_admin");
        const rows = [{ ...payload, user_id: "admin" }];
        (adminUsers || []).forEach((adm: any) => {
          if (adm.user_id && adm.user_id !== "admin") {
            rows.push({ ...payload, notif_id: `${notifId}_${adm.user_id.slice(-6)}`, user_id: adm.user_id });
          }
        });
        await client.from("notifications").insert(rows);
      } else {
        await client.from("notifications").insert(payload);
      }
    } catch (e) {
      logIgnored("ugcDeadlines:inAppNotif", e);
    }
  }

  const io = deps.app?.get("io");
  if (io) {
    if (isAdminMessage || userId === "admin") {
      io.to(ADMIN_ROOM).emit("admin_notification", payload);
      io.to(ADMIN_ROOM).emit("bell_notification", payload);
    } else {
      io.to(`user_${userId}`).emit("new_notification", payload);
      io.to(`user_${userId}`).emit("bell_notification", payload);
    }
  }
}

/** Post system message into chat thread and trigger thread_updated */
async function postChatSystemMessage({
  orderId,
  briefId,
  brandId,
  creatorId,
  message,
  deps,
  status = "EXPIRED"
}: {
  orderId: string;
  briefId: string;
  brandId: string;
  creatorId: string;
  message: string;
  deps: UgcDeadlineDeps;
  status?: string;
}) {
  const nowIso = new Date().toISOString();
  const db = deps.getDb();
  const thread = (db.chat_threads || []).find(
    (t: any) => t.id === orderId || t.deal_id === orderId || t.ugc_order_id === orderId
  );
  const threadId = thread?.id || `thread_${orderId}`;

  const sysMsg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    thread_id: threadId,
    deal_id: orderId,
    sender_id: "system",
    sender_name: "Ybex System",
    text: message,
    is_system_message: true,
    created_at: nowIso
  };

  if (!db.chat_messages) db.chat_messages = [];
  db.chat_messages.push(sysMsg);

  const client = deps.privilegedSupabase || deps.supabase;
  if (client) {
    try {
      // Session 35: real chat_messages columns (sender_id / message / is_system_message do not
      // exist, so these deadline notes never reached the chat). Same shape as other system rows.
      await client.from("chat_messages").insert({
        message_id: crypto.randomUUID(),
        thread_id: threadId,
        sender_user_id: "system",
        sender_role: "system",
        from_name: "Ybex System",
        text: message,
        message_type: "system",
        created_at: nowIso
      });
    } catch (e) {
      logIgnored("ugcDeadlines:sysMsg", e);
    }
  }

  const io = deps.app?.get("io");
  if (io) {
    io.to(threadId).emit("new_message", sysMsg);
    io.to(`user_${brandId}`).emit("thread_updated", { thread_id: threadId, deal_id: orderId, status });
    io.to(`user_${creatorId}`).emit("thread_updated", { thread_id: threadId, deal_id: orderId, status });
  }
}

/**
 * An expired slot on a brief the brand already cancelled: queue its refund (same queue as a
 * brand cancel, manual payout by Ybex). Idempotent per order.
 */
async function queueSlotRefund({ order, brief, deps, nowIso }: { order: UgcOrderRecord; brief: UgcBriefRecord; deps: UgcDeadlineDeps; nowIso: string }) {
  const client = deps.privilegedSupabase || deps.supabase;
  const db = deps.getDb();
  const refundId = `ugcref_exp_${order.id}`;
  if ((db.ugc_refunds || []).some((r: any) => r.id === refundId)) return;
  const amount = Number(brief.budget) || 0;
  if (amount <= 0) return;
  let account: any = (db.brand_refund_accounts || []).find((a: any) => a.brand_id === brief.brand_id) || null;
  if (client) {
    try {
      const { data } = await client.from("brand_refund_accounts").select("*").eq("brand_id", brief.brand_id).maybeSingle();
      if (data) account = data;
    } catch (e) { logIgnored("ugcDeadlines:refundAccount", e); }
  }
  const acc = String(account?.bank_account_number || "");
  const snapshot = account ? {
    method_type: account.method_type || (account.upi_id ? "UPI" : "BANK"),
    upi_id: account.upi_id || null,
    bank_account_number: account.bank_account_number || null,
    bank_ifsc: account.bank_ifsc || null,
    account_holder_name: account.account_holder_name || null,
    account_last4: acc ? acc.slice(-4) : null,
  } : { missing: true };
  const row = {
    id: refundId, brief_id: brief.id, brand_id: brief.brand_id, amount, slots: 1,
    reason: "Creator missed the deadline on a cancelled brief", status: "PENDING",
    refund_account_snapshot: snapshot, utr: null, failure_reason: null,
    requested_at: nowIso, processed_at: null, processed_by: null,
  };
  if (client) {
    const { error } = await client.from("ugc_refunds").upsert(row, { onConflict: "id", ignoreDuplicates: true });
    if (error) { console.error("[ugcDeadlineService] slot refund insert:", error.message); return; }
    // The slot is gone from the brief (as a brand cancel does).
    try {
      const { data: b } = await client.from("ugc_briefs").select("max_creators").eq("id", brief.id).maybeSingle();
      const max = Math.max(0, (Number(b?.max_creators) || 1) - 1);
      await client.from("ugc_briefs").update({ max_creators: max }).eq("id", brief.id);
    } catch (e) { logIgnored("ugcDeadlines:slotMax", e); }
  }
  if (!db.ugc_refunds) db.ugc_refunds = [];
  db.ugc_refunds.unshift(row);
  const lb = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
  if (lb) lb.max_creators = Math.max(0, (Number(lb.max_creators) || 1) - 1);
  await insertInAppNotification({
    userId: brief.brand_id,
    type: "UGC_REFUND_QUEUED",
    title: `A slot on ${brief.title || "your brief"} will be refunded`,
    message: account
      ? `The creator missed the deadline and the brief was already cancelled, so ₹${amount} will be refunded to your account within 1–2 working days.`
      : `The creator missed the deadline and the brief was already cancelled, so ₹${amount} will be refunded. Please add your refund account (UPI or bank) so we can send it.`,
    redirectPath: "/brand/ugc",
    deps,
  });
}

// ---------------------------------------------------------------------------------------------
// Creator self-cancel of an order before the first draft (session 25, protected rule 51).
// WHO: only the order's creator. WHEN: before the first draft. Effect: order CANCELLED with an
// expiry_reason, NO refund (the money stays in the brief), slot relisted at the top as urgent
// (or queued for refund when the brand already cancelled the brief), brand told in-app + email.
// ---------------------------------------------------------------------------------------------

/** The chips on the cancel sheet. The server accepts only these. */
export const CREATOR_CANCEL_REASONS = [
  "Not feeling well",
  "Brief is not what I expected",
  "Product not received",
  "Other",
] as const;

/** Cancelling within this long after the timer started does not count on the profile. */
export const CREATOR_CANCEL_GRACE_MS = 60 * 60 * 1000;

/** When the order's timer started: the deadline minus the brief's delivery window. */
export function orderTimerStartMs(order: any, deliveryHours: any): number | null {
  const hours = [24, 48, 72].includes(Number(deliveryHours)) ? Number(deliveryHours) : 24;
  const due = Date.parse(order?.internal_deadline || "");
  if (Number.isFinite(due)) return due - hours * 3600000;
  const created = Date.parse(order?.created_at || "");
  return Number.isFinite(created) ? created : null;
}

/** Which expiry_reason a creator cancel gets, i.e. whether it counts on the profile. */
export function creatorCancelReasonToken(order: any, deliveryHours: any, nowMs: number): string {
  // Only an explicit false/null is "never signed" (same rule as the mobile workspace).
  const signed = !(order?.agreement_signed_creator === false || order?.agreement_signed_creator === null);
  if (!signed) return "CREATOR_CANCELLED_UNSIGNED";
  const start = orderTimerStartMs(order, deliveryHours);
  if (start !== null && nowMs - start >= 0 && nowMs - start < CREATOR_CANCEL_GRACE_MS) return "CREATOR_CANCELLED_GRACE";
  return "CREATOR_CANCELLED";
}

export function buildBrandCreatorSteppedAwayCopy({
  brief,
  appBaseUrl = process.env.APP_URL || "https://ybexmedia.in"
}: { brief: any; appBaseUrl?: string }) {
  const briefTitle = brief?.title || "UGC Video Brief";
  return {
    type: "UGC_CREATOR_STEPPED_AWAY",
    subject: "Your creator stepped away — brief back at the top",
    body: `The creator who claimed **${briefTitle}** cancelled before sending a draft. Your payment is still held safely with Ybex SafePay, and your brief is back at the top of the creator feed so a new creator can pick it up quickly.`,
    buttonText: "View brief",
    buttonUrl: `${appBaseUrl}/brand/ugc`
  };
}

export type CreatorCancelResult = { status: number; json: any };

export async function cancelUgcOrderByCreator(
  deps: UgcDeadlineDeps,
  { order, thread, user, reason, note }: { order: any; thread?: any; user: any; reason: string; note?: string }
): Promise<CreatorCancelResult> {
  const now = deps.now ? deps.now() : new Date();
  const nowIso = now.toISOString();
  const client = deps.privilegedSupabase || deps.supabase;
  const db = deps.getDb();

  if (!order?.id) return { status: 404, json: { error: "Order not found" } };
  // WHO: the order's own creator (an admin uses the admin tools, not this button).
  if (!user?.user_id || user.user_id !== order.creator_id) {
    return { status: 403, json: { error: "Only the creator on this order can do this.", code: "FORBIDDEN" } };
  }
  let cleanReason = String(reason || "").trim();
  const cleanNote = String(note || "").trim().slice(0, 300);
  // A never-signed reservation is just released (the old "Cancel Claim" button sends no reason).
  const neverSigned = order.agreement_signed_creator === false || order.agreement_signed_creator === null;
  if (neverSigned) {
    cleanReason = cleanReason.slice(0, 80) || "Released unsigned reservation";
  } else if (!(CREATOR_CANCEL_REASONS as readonly string[]).includes(cleanReason)) {
    return { status: 400, json: { error: "Pick a reason for cancelling.", code: "REASON_REQUIRED" } };
  }
  if (!neverSigned && cleanReason === "Other" && cleanNote.length < 3) {
    return { status: 400, json: { error: "Tell us briefly why you're cancelling.", code: "NOTE_REQUIRED" } };
  }
  // WHEN: before the first draft only. After that it's a conversation / dispute, not a button.
  const status = String(order.status || "").toUpperCase();
  if (hasUgcFirstDraft(order)) {
    return { status: 409, json: { error: "You've already sent a draft, so this order can't be cancelled here. Talk to the brand in chat or raise it with support.", code: "DRAFT_SUBMITTED" } };
  }
  if (!PRE_DRAFT_STATUSES.includes(status)) {
    return { status: 409, json: { error: "This order is already closed.", code: "ORDER_CLOSED" } };
  }

  let brief: any = (db.ugc_briefs || []).find((b: any) => b.id === order.brief_id) || null;
  if (client && order.brief_id) {
    try {
      const { data } = await client.from("ugc_briefs").select("*").eq("id", order.brief_id).maybeSingle();
      if (data) brief = { ...(brief || {}), ...data };
    } catch (e) { logIgnored("creatorCancel:brief", e); }
  }
  brief = brief || { id: order.brief_id, brand_id: order.brand_id };

  const expiryReason = creatorCancelReasonToken(order, brief.delivery_hours, now.getTime());
  const countsOnProfile = expiryReason === "CREATOR_CANCELLED";

  // Guarded write: only while the order is still waiting for its first draft. A draft uploaded a
  // second earlier (or the cron expiring it) wins, and nothing else here runs.
  const updates = { status: "CANCELLED", cancelled_at: nowIso, expired_at: nowIso, expiry_reason: expiryReason, updated_at: nowIso };
  if (client) {
    const { data: rows, error } = await client
      .from("ugc_orders")
      .update(updates)
      .eq("id", order.id)
      .eq("creator_id", user.user_id)
      .in("status", PRE_DRAFT_STATUSES)
      .is("video_url", null)
      .select("id");
    if (error) {
      console.error("[creatorCancel] order update:", error.message || error);
      return { status: 500, json: { error: "Couldn't cancel the order. Please try again." } };
    }
    if (!rows || rows.length === 0) {
      // Not in Supabase at all (local-only order) → fall through to the local store; otherwise
      // the order moved on under us.
      const { data: fresh } = await client.from("ugc_orders").select("id, status, video_url").eq("id", order.id).maybeSingle();
      if (fresh) {
        if (fresh.video_url || hasUgcFirstDraft(fresh)) {
          return { status: 409, json: { error: "You've already sent a draft, so this order can't be cancelled here.", code: "DRAFT_SUBMITTED" } };
        }
        return { status: 409, json: { error: "This order is already closed.", code: "ORDER_CLOSED" } };
      }
    }
  }
  const local = (db.ugc_orders || []).find((o: any) => o.id === order.id);
  if (local) {
    if (!client && (hasUgcFirstDraft(local) || !PRE_DRAFT_STATUSES.includes(String(local.status || "").toUpperCase()))) {
      return { status: 409, json: { error: "This order is already closed.", code: "ORDER_CLOSED" } };
    }
    Object.assign(local, updates, { creator_status: "CANCELLED", brand_status: "CANCELLED", cancel_reason: cleanReason, cancel_note: cleanNote || null });
  }
  Object.assign(order, updates);

  // Thread closes (the order page reads the order; chat needs the flow_state).
  const threadMatch = (t: any) => t && (t.id === thread?.id || t.deal_id === order.id || t.ugc_order_id === order.id);
  (db.chat_threads || []).filter(threadMatch).forEach((t: any) => { t.status = "COMPLETED"; t.flow_state = "CANCELLED"; t.updated_at = nowIso; });
  if (client) {
    try { await client.from("chat_threads").update({ status: "COMPLETED", flow_state: "CANCELLED", updated_at: nowIso }).eq("deal_id", order.id); }
    catch (e) { logIgnored("creatorCancel:thread", e); }
  }

  // The slot goes back to the brief. The money stays in the brief (no refund to anyone).
  await deps.releaseBriefSlot(brief.id, order.creator_id);

  const briefStatus = String(brief.status || "").toUpperCase();
  const briefCancelled = ["CANCELLED", "PARTIALLY_CANCELLED"].includes(briefStatus);
  if (briefCancelled) {
    // The brand already cancelled the open slots: this one can't be relisted, so it is refunded
    // through the same manual queue as a brand cancel.
    await queueSlotRefund({ order, brief, deps, nowIso });
  } else {
    const newRelistCount = Number(brief.relist_count || 0) + 1;
    if (client) {
      try {
        await client.from("ugc_briefs").update({ relisted_at: nowIso, relist_count: newRelistCount, is_priority: true }).eq("id", brief.id);
      } catch (e) { logIgnored("creatorCancel:relist", e); }
    }
    const lb = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
    for (const b of [brief, lb].filter(Boolean)) { b.relisted_at = nowIso; b.relist_count = newRelistCount; b.is_priority = true; }
  }

  // Profile: counts like a missed deadline, except the 1-hour grace and never-signed reservations.
  if (countsOnProfile) {
    let current = Number((db.users || []).find((u: any) => (u.user_id || u.id) === user.user_id)?.missed_deadlines_count || 0);
    if (client) {
      try {
        const { data: u } = await client.from("users").select("missed_deadlines_count").eq("user_id", user.user_id).maybeSingle();
        if (u) current = Number(u.missed_deadlines_count || 0);
        await client.from("users").update({ missed_deadlines_count: current + 1 }).eq("user_id", user.user_id);
      } catch (e) { logIgnored("creatorCancel:missedCount", e); }
    }
    const lu = (db.users || []).find((u: any) => (u.user_id || u.id) === user.user_id);
    if (lu) lu.missed_deadlines_count = current + 1;
  }

  // Brand: in-app + email. The creator's reason is not shown to the brand (admin log only).
  let brand: any = (db.users || []).find((u: any) => (u.user_id || u.id) === order.brand_id) || { user_id: order.brand_id };
  if (client) {
    try {
      const { data } = await client.from("users").select("user_id, name, email, phone, whatsapp_opt_in").eq("user_id", order.brand_id).maybeSingle();
      if (data) brand = data;
    } catch (e) { logIgnored("creatorCancel:brandUser", e); }
  }
  if (!briefCancelled) {
    await dispatchNotification({
      userId: order.brand_id,
      email: brand.email,
      phone: brand.phone || brand.phone_number,
      whatsappOptIn: Boolean(brand.whatsapp_opt_in),
      copy: buildBrandCreatorSteppedAwayCopy({ brief }),
      deps,
      // A person just did this — not a timed reminder — so it goes out now.
      isQuietHoursNow: false,
      inAppPath: "/brand/ugc"
    });
  }

  await postChatSystemMessage({
    orderId: order.id,
    briefId: brief.id,
    brandId: order.brand_id,
    creatorId: order.creator_id,
    message: briefCancelled
      ? "The creator cancelled this order before sending a draft. The brief was already cancelled, so this slot has been added to your refund."
      : "The creator cancelled this order before sending a draft. The brief is back at the top of the creator feed and the payment stays safely with Ybex SafePay.",
    deps,
    status: "CANCELLED"
  });

  // WHO + WHEN.
  if (!db.admin_logs) db.admin_logs = [];
  db.admin_logs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    actor_id: user.user_id,
    action: "UGC_CREATOR_CANCELLED",
    target_id: order.id,
    details: `Creator cancelled before first draft. Reason: ${cleanReason}${cleanNote ? ` — ${cleanNote}` : ""}. ${countsOnProfile ? "Counts as missed deadline." : expiryReason === "CREATOR_CANCELLED_GRACE" ? "Within 1-hour grace — not counted." : "Never signed — not counted."}`,
    created_at: nowIso
  });
  deps.saveDb(db);

  return {
    status: 200,
    json: {
      ok: true,
      status: "CANCELLED",
      expiry_reason: expiryReason,
      counts_on_profile: countsOnProfile,
      relisted: !briefCancelled,
      message: countsOnProfile
        ? "Order cancelled. The brief goes back to other creators. This counts like a missed deadline on your profile."
        : "Order cancelled. The brief goes back to other creators. This one doesn't count against your profile."
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Brand cancels ONE order (session 25, protected rule 52 — Ravi's policy).
// WHO: the order's brand. WHEN: the creator's timer started 24h+ ago AND no draft yet.
//   · first 24 hours → refused (the creator is working on it);
//   · a draft was uploaded → refused (DELIVERED_USE_DISPUTE, checked by the caller);
//   · 24h+ and no draft → allowed, NO fee.
// Effect: order CANCELLED (BRAND_CANCELLED — never counts against the creator), the slot is
// removed from the brief and its money goes to the manual UGC Refunds queue (never Razorpay).
// ---------------------------------------------------------------------------------------------

/** The creator gets this long on an order before the brand can cancel it. */
export const BRAND_ORDER_CANCEL_WAIT_MS = 24 * 3600000;

/** When the brand may cancel this order (ms), or null if the timer start is unknown. */
export function brandCanCancelOrderAtMs(order: any, deliveryHours: any): number | null {
  const start = orderTimerStartMs(order, deliveryHours);
  return start === null ? null : start + BRAND_ORDER_CANCEL_WAIT_MS;
}

export async function cancelUgcOrderByBrand(
  deps: UgcDeadlineDeps,
  { order, thread, user, reason }: { order: any; thread?: any; user: any; reason?: string }
): Promise<CreatorCancelResult> {
  const now = deps.now ? deps.now() : new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const client = deps.privilegedSupabase || deps.supabase;
  const db = deps.getDb();

  if (!order?.id) return { status: 404, json: { error: "Order not found" } };
  const actingBrand = user?.parent_brand_id || user?.user_id;
  if (!actingBrand || (actingBrand !== order.brand_id && user?.user_id !== order.brand_id)) {
    return { status: 403, json: { error: "Only the brand on this order can do this.", code: "FORBIDDEN" } };
  }
  if (hasUgcFirstDraft(order)) {
    return { status: 409, json: { error: "The creator has already delivered on this order, so it can no longer be cancelled for a refund. Raise it with support from the order.", code: "DELIVERED_USE_DISPUTE" } };
  }
  if (!PRE_DRAFT_STATUSES.includes(String(order.status || "").toUpperCase())) {
    return { status: 409, json: { error: "This order is already closed.", code: "ORDER_CLOSED" } };
  }

  let brief: any = (db.ugc_briefs || []).find((b: any) => b.id === order.brief_id) || null;
  if (client && order.brief_id) {
    try {
      const { data } = await client.from("ugc_briefs").select("*").eq("id", order.brief_id).maybeSingle();
      if (data) brief = { ...(brief || {}), ...data };
    } catch (e) { logIgnored("brandOrderCancel:brief", e); }
  }
  brief = brief || { id: order.brief_id, brand_id: order.brand_id };

  // WHEN: 24 hours after the creator's timer started.
  const allowedAt = brandCanCancelOrderAtMs(order, brief.delivery_hours);
  if (allowedAt === null || nowMs < allowedAt) {
    const left = allowedAt === null ? BRAND_ORDER_CANCEL_WAIT_MS : allowedAt - nowMs;
    return {
      status: 409,
      json: {
        error: `The creator is working on this order. You can cancel it if there's still no draft ${formatTimeLeft(left)} from now.`,
        code: "CANCEL_WITHIN_24H",
        time_left_ms: Math.max(0, left),
        can_cancel_at: allowedAt === null ? null : new Date(allowedAt).toISOString(),
      },
    };
  }

  const amount = Number(brief.budget) || Number(order.escrow_amount) || 0;
  if (amount <= 0) return { status: 409, json: { error: "There is no refundable amount on this order.", code: "NO_REFUNDABLE_AMOUNT" } };

  // Refund destination: the brand's saved account (the screen saves one first if missing).
  let account: any = (db.brand_refund_accounts || []).find((a: any) => a.brand_id === order.brand_id) || null;
  if (client) {
    try {
      const { data } = await client.from("brand_refund_accounts").select("*").eq("brand_id", order.brand_id).maybeSingle();
      if (data) account = data;
    } catch (e) { logIgnored("brandOrderCancel:account", e); }
  }
  if (!account) {
    return { status: 400, json: { error: "Add a refund account (UPI or bank) to receive your refund.", code: "REFUND_ACCOUNT_REQUIRED" } };
  }

  // 1. Refund row first (deterministic id: a double tap can't make two), then claim the order.
  const refundId = `ugcref_ord_${order.id}`;
  const cleanReason = String(reason || "").trim().slice(0, 200);
  const refundRow = {
    id: refundId, brief_id: brief.id, brand_id: order.brand_id, amount, slots: 1,
    reason: cleanReason ? `Brand cancelled an order with no draft after 24 hours: ${cleanReason}` : "Brand cancelled an order with no draft after 24 hours",
    status: "PENDING", refund_account_snapshot: toAdminRefundSnapshot(account), utr: null, failure_reason: null,
    requested_at: nowIso, processed_at: null, processed_by: null,
  };
  if ((db.ugc_refunds || []).some((r: any) => r.id === refundId)) {
    return { status: 200, json: { ok: true, already_cancelled: true, status: "CANCELLED", message: "This order was already cancelled." } };
  }
  if (client) {
    const { data: ins, error } = await client.from("ugc_refunds").upsert(refundRow, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) {
      console.error("[brandOrderCancel] refund insert:", error.message || error);
      return { status: 502, json: { error: "Couldn't cancel the order. Please try again." } };
    }
    if (Array.isArray(ins) && ins.length === 0) {
      return { status: 200, json: { ok: true, already_cancelled: true, status: "CANCELLED", message: "This order was already cancelled." } };
    }
  }

  // 2. Guarded order update: only while still waiting for the first draft.
  const updates = { status: "CANCELLED", cancelled_at: nowIso, expired_at: nowIso, expiry_reason: "BRAND_CANCELLED", updated_at: nowIso };
  if (client) {
    const { data: rows, error } = await client
      .from("ugc_orders").update(updates)
      .eq("id", order.id).in("status", PRE_DRAFT_STATUSES).is("video_url", null)
      .select("id");
    let lost = Boolean(error);
    if (!error && (!rows || rows.length === 0)) {
      const { data: fresh } = await client.from("ugc_orders").select("id").eq("id", order.id).maybeSingle();
      lost = Boolean(fresh); // the row exists but moved on (a draft landed) → undo the refund
    }
    if (lost) {
      try { await client.from("ugc_refunds").delete().eq("id", refundId); } catch (e) { logIgnored("brandOrderCancel:rollback", e); }
      return { status: 409, json: { error: "The creator just delivered on this order, so it can no longer be cancelled.", code: "DELIVERED_USE_DISPUTE" } };
    }
  }
  const local = (db.ugc_orders || []).find((o: any) => o.id === order.id);
  if (local) Object.assign(local, updates, { creator_status: "CANCELLED", brand_status: "CANCELLED" });
  Object.assign(order, updates);
  if (!db.ugc_refunds) db.ugc_refunds = [];
  db.ugc_refunds.unshift(refundRow);

  // 3. Thread closes; the slot leaves the brief (it is refunded, not relisted).
  const threadMatch = (t: any) => t && (t.id === thread?.id || t.deal_id === order.id || t.ugc_order_id === order.id);
  (db.chat_threads || []).filter(threadMatch).forEach((t: any) => { t.status = "COMPLETED"; t.flow_state = "CANCELLED"; t.updated_at = nowIso; });
  if (client) {
    try { await client.from("chat_threads").update({ status: "COMPLETED", flow_state: "CANCELLED", updated_at: nowIso }).eq("deal_id", order.id); }
    catch (e) { logIgnored("brandOrderCancel:thread", e); }
  }
  await deps.releaseBriefSlot(brief.id, order.creator_id);
  if (client) {
    try {
      const { data: b } = await client.from("ugc_briefs").select("max_creators").eq("id", brief.id).maybeSingle();
      await client.from("ugc_briefs").update({ max_creators: Math.max(0, (Number(b?.max_creators) || 1) - 1) }).eq("id", brief.id);
    } catch (e) { logIgnored("brandOrderCancel:slotMax", e); }
  }
  const lb = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
  if (lb) lb.max_creators = Math.max(0, (Number(lb.max_creators) || 1) - 1);

  // 4. Tell both sides. The creator is not at fault and it does not touch their profile.
  let creator: any = (db.users || []).find((u: any) => (u.user_id || u.id) === order.creator_id) || { user_id: order.creator_id };
  if (client) {
    try {
      const { data } = await client.from("users").select("user_id, name, email, phone, whatsapp_opt_in").eq("user_id", order.creator_id).maybeSingle();
      if (data) creator = data;
    } catch (e) { logIgnored("brandOrderCancel:creatorUser", e); }
  }
  const appBaseUrl = process.env.APP_URL || "https://ybexmedia.in";
  const title = brief.title || "UGC Video Brief";
  await dispatchNotification({
    userId: order.creator_id,
    email: creator.email,
    phone: creator.phone || creator.phone_number,
    whatsappOptIn: Boolean(creator.whatsapp_opt_in),
    copy: {
      type: "UGC_ORDER_CANCELLED_BY_BRAND",
      subject: `The brand cancelled your order for ${title}`,
      body: `No draft had arrived for **${title}** 24 hours after you claimed it, so the brand cancelled the order. This does not count against your profile. You can keep claiming new briefs.`,
      buttonText: "Explore briefs",
      buttonUrl: `${appBaseUrl}/creator/ugc?tab=explore`,
    },
    deps,
    isQuietHoursNow: false,
    inAppPath: "/creator/ugc?tab=explore",
  });
  await insertInAppNotification({
    userId: order.brand_id,
    type: "UGC_REFUND_QUEUED",
    title: `Order cancelled — ₹${amount} refund on the way`,
    message: `We'll send ₹${amount} to your refund account within 1–2 working days.`,
    redirectPath: "/brand/ugc",
    deps,
  });
  await postChatSystemMessage({
    orderId: order.id, briefId: brief.id, brandId: order.brand_id, creatorId: order.creator_id,
    message: "The brand cancelled this order because no draft had arrived 24 hours after it was claimed. This does not count against the creator's profile.",
    deps, status: "CANCELLED",
  });

  if (!db.admin_logs) db.admin_logs = [];
  db.admin_logs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    actor_id: user.user_id,
    action: "UGC_BRAND_CANCELLED_ORDER",
    target_id: order.id,
    details: `Brand cancelled order with no draft after 24h. Refund ₹${amount} queued (${refundId}).${cleanReason ? ` Reason: ${cleanReason}` : ""}`,
    created_at: nowIso,
  });
  deps.saveDb(db);

  return {
    status: 200,
    json: {
      ok: true, status: "CANCELLED", expiry_reason: "BRAND_CANCELLED", refund_id: refundId, refund_amount: amount,
      message: `Order cancelled. ₹${amount} will be refunded to your account within 1–2 working days.`,
    },
  };
}

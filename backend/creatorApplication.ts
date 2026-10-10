// Session 34 (Ravi): public creator application ("Apply as a creator", /apply).
//
// Flow: the form ONLY creates a waitlist row (status Pending). Nothing goes to Explore and no
// creator profile is created or changed here. The admin approves (→ one unclaimed profile on
// Explore + approval email) or rejects (→ email with the reason) in admin_waitlist_routes.ts.
// Only the admin can edit an application. No spam limit on purpose (ads are running; the team
// checks by hand), but every row is validated and the save is real: if the database write fails
// the person sees an error, never a fake "submitted".
import crypto from "crypto";
import { audienceEstimate } from "../src/utils/audienceEstimate";
import { shrinkPhoto } from "./imageResize";

// Session 35: the real Supabase columns (checked against the live tables, 7 Oct 2026). Supabase
// refuses a whole insert / upsert when one key is not a column, so every write below sends only
// these. The local cache copy may keep extra keys (pricing, handle …) for older screens.
export const WAITLIST_COLUMNS = ["id", "name", "email", "role", "status", "reject_reason", "panel_message", "created_at",
  "social_handle", "followers", "city", "gender", "instagram_link", "mobile", "avg_reach", "charges", "niche",
  "collab_types", "ugc_rating", "sample_links", "notes", "profile_photo_url", "source", "is_registered_user",
  "linked_user_id", "terms_accepted_at"];
export const USERS_COLUMNS = ["user_id", "email", "name", "password_hash", "role", "picture", "auth_method", "onboarded",
  "verified", "parent_brand_id", "team_role", "created_at", "banned", "is_deleted", "phone", "missed_deadlines_count",
  "whatsapp_opt_in"];
export const CREATOR_PROFILE_COLUMNS = ["user_id", "name", "email", "picture", "photo", "bio", "category", "sub_categories",
  "city", "state", "languages", "gender", "instagram", "youtube", "twitter", "linkedin", "followers_instagram",
  "followers_youtube", "rate_card", "barter", "payment_terms", "portfolio", "past_brands", "creator_type", "work_mode",
  "engagement_rate", "fake_follower_pct", "avg_views_30d", "performance_score", "profile_views", "managed_by_agency_id",
  "created_at", "updated_at", "instagram_handle", "follower_count", "primary_niche", "barter_mode", "tier",
  "is_platinum_override", "rate_reel", "rate_story", "rate_yt_video", "verified", "categories", "ig_followers",
  "yt_subscribers", "is_deleted", "avg_likes_30d", "avg_comments_30d", "profile_status", "review_eta_hours", "reviewed_at",
  "is_claimed", "avatar_url", "onboarding_complete", "submitted_at"];
export function onlyColumns<T extends Record<string, any>>(row: T, columns: string[]): Partial<T> {
  const out: any = {};
  for (const k of columns) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

// ---------- numbers ----------
/**
 * "1.5L", "1.5 lakh", "2 cr", "150K", "1.2M", "1,50,000", "150000" → whole number, or null.
 * Same rule on the server and in the form (src/utils/creatorFormValidation.js mirrors it).
 */
export function parseCount(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  const s = String(raw).toLowerCase().replace(/[₹,\s]/g, "").replace(/rs\.?/g, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lakh|lakhs|m|mn|million|cr|crore|crores)?\+?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult: Record<string, number> = {
    k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5,
    m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, crores: 1e7,
  };
  const v = Math.round(n * (m[2] ? mult[m[2]] : 1));
  return Number.isFinite(v) ? v : null;
}

/** 150000 → "1,50,000" (Indian grouping). */
export const formatIndian = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-IN");

/** "+91" + "98765 43210" → "+919876543210"; other codes: 6–12 digits. Null when invalid. */
export function normaliseApplicantMobile(code: any, raw: any): string | null {
  const cc = String(code || "+91").trim().startsWith("+") ? String(code || "+91").trim() : `+${String(code || "91").trim()}`;
  let digits = String(raw || "").replace(/\D/g, "");
  if (cc === "+91") {
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
  }
  return digits.length >= 6 && digits.length <= 12 ? `${cc}${digits}` : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export type CleanApplication = {
  name: string; gender: string; email: string; mobile: string; handle: string; instagram_link: string;
  city: string; followers: number; avg_reach: number; price: number; niche: string;
  collab_types: string[]; ugc_rating: number | null; sample_links: string[]; notes: string; photo: string;
};

/** Validates and cleans the form body. Returns { errors } (field → message) or { value }. */
export function validateApplication(body: any): { errors: Record<string, string>; value?: CleanApplication } {
  const b = body || {};
  const errors: Record<string, string> = {};
  const name = String(b.name || "").trim().replace(/\s+/g, " ");
  const gender = String(b.gender || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const handle = String(b.social_handle || b.handle || "").trim().replace(/^@+/, "").toLowerCase();
  const city = String(b.city || "").trim();
  const niche = String(b.niche || "").trim();
  const photo = String(b.profile_photo_url || b.photo || "").trim();

  if (!photo) errors.photo = "Please add a profile photo.";
  if (name.length < 2 || name.length > 80) errors.name = "Please enter your full name.";
  if (!["Male", "Female", "Other"].includes(gender)) errors.gender = "Please choose your gender.";
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = "Please enter a valid email address.";
  const mobile = normaliseApplicantMobile(b.country_code, b.mobile);
  if (!mobile) errors.mobile = "Please enter a valid mobile number.";
  if (!HANDLE_RE.test(handle)) errors.social_handle = "Please enter your Instagram handle (letters, numbers, . and _).";
  if (city.length < 2 || city.length > 60) errors.city = "Please enter your city.";
  const followers = parseCount(b.followers);
  if (followers === null || followers < 100) errors.followers = "Please enter your follower count (for example 12,500 or 1.5L).";
  const avgReach = parseCount(b.avg_reach);
  if (avgReach === null || avgReach < 1) errors.avg_reach = "Please enter your average reach (for example 8,000 or 1.2L).";
  const price = parseCount(b.charges ?? b.price);
  if (price === null || price < 100) errors.charges = "Please enter your price for 1 UGC video (at least ₹100).";
  else if (price > 1e7) errors.charges = "Please check your price.";
  if (!niche || niche.length > 60) errors.niche = "Please choose your main niche.";

  if (Object.keys(errors).length) return { errors };

  const linkIn = String(b.instagram_link || "").trim();
  const instagram_link = /^https?:\/\/(www\.)?instagram\.com\//i.test(linkIn) ? linkIn : `https://instagram.com/${handle}`;
  const list = (v: any, max: number, len: number) =>
    (Array.isArray(v) ? v : []).map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, max).map((x: string) => x.slice(0, len));
  const rating = Number(b.ugc_rating);

  return {
    errors: {},
    value: {
      name, gender, email, mobile: mobile!, handle, instagram_link, city,
      followers: followers!, avg_reach: avgReach!, price: price!, niche,
      collab_types: list(b.collab_types, 10, 40),
      ugc_rating: Number.isInteger(rating) && rating >= 1 && rating <= 10 ? rating : null,
      sample_links: list(b.sample_links, 10, 300).filter((u: string) => /^https?:\/\//i.test(u)),
      notes: String(b.notes || "").trim().slice(0, 1000),
      photo,
    },
  };
}

// ---------- photo ----------
async function storePhoto(client: any, photo: string, id: string): Promise<{ url?: string; error?: string }> {
  if (/^https:\/\//i.test(photo)) return { url: photo };
  const m = photo.match(/^data:(image\/(?:jpeg|jpg|png|webp|heic|heif));base64,(.+)$/i);
  if (!m) return { error: "Please upload a JPG, PNG or WEBP photo." };
  const raw = Buffer.from(m[2], "base64");
  if (raw.length > 8 * 1024 * 1024) return { error: "Photo is too large (max 8 MB)." };
  if (!client) return { url: photo }; // local dev without Supabase: keep it inline
  try {
    const small = await shrinkPhoto(raw, m[1], "avatars");
    const ext = small.shrunk ? small.ext : (m[1].split("/")[1] || "jpg");
    const path = `applications/${id}.${ext}`;
    const { error } = await client.storage.from("avatars").upload(path, small.buffer, { contentType: small.contentType, upsert: true });
    if (error) return { error: `Photo upload failed: ${error.message || "storage error"}` };
    const { data } = client.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl ? { url: data.publicUrl } : { error: "Photo upload failed." };
  } catch (e: any) {
    return { error: `Photo upload failed: ${e?.message || "error"}` };
  }
}

// ---------- handler ----------
export function makeCreatorApplicationHandler(deps: {
  getClient: () => any;
  getDb: () => any;
  saveDb: (db: any) => void;
}) {
  return async (req: any, res: any) => {
    const { errors, value } = validateApplication(req.body);
    if (!value) return res.status(400).json({ error: Object.values(errors)[0], fields: errors, code: "INVALID_APPLICATION" });

    const client = deps.getClient();
    // waitlist.id is a uuid column — a "WAITLIST_…" text id was refused (session 35).
    const id = crypto.randomUUID();
    const photo = await storePhoto(client, value.photo, id);
    if (photo.error) return res.status(400).json({ error: photo.error, fields: { photo: photo.error }, code: "PHOTO_FAILED" });

    // Read-only: tell the admin if this email already has an account. Never changes that account.
    let linkedUserId: string | null = null;
    if (client) {
      try {
        const { data } = await client.from("users").select("user_id, auth_method").ilike("email", value.email).limit(1);
        const u = Array.isArray(data) ? data[0] : null;
        if (u?.user_id && u.auth_method !== "unclaimed") linkedUserId = u.user_id;
      } catch { /* informational only */ }
    }

    const row: any = {
      id,
      name: value.name,
      gender: value.gender,
      email: value.email,
      mobile: value.mobile,
      phone: value.mobile,
      social_handle: value.handle,
      handle: value.handle,
      instagram_link: value.instagram_link,
      city: value.city,
      followers: value.followers,
      follower_count: value.followers,
      avg_reach: String(value.avg_reach),
      charges: `₹${formatIndian(value.price)}`,
      pricing: { ugc: value.price },
      niche: value.niche,
      category: value.niche,
      collab_types: value.collab_types,
      ugc_rating: value.ugc_rating,
      sample_links: value.sample_links,
      notes: value.notes,
      bio: value.notes,
      profile_photo_url: photo.url,
      photo: photo.url,
      role: "creator",
      status: "Pending",
      source: "creator_apply_form",
      is_registered_user: Boolean(linkedUserId),
      linked_user_id: linkedUserId,
      terms_accepted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (client) {
      const { error } = await client.from("waitlist").insert([onlyColumns(row, WAITLIST_COLUMNS)]);
      if (error) {
        console.error("[creator-apply] waitlist insert failed:", error.message || error);
        return res.status(500).json({ error: `We could not save your application: ${error.message || "database error"}. Please try again.`, code: "SAVE_FAILED" });
      }
    }
    const db = deps.getDb();
    if (!db.waitlist) db.waitlist = [];
    db.waitlist.push(row);
    try { deps.saveDb(db); } catch { /* local cache only */ }

    // Session 36: referral — the applicant came through ybexmedia.in/r/<CODE> (the code travels with the
    // form). Counted as a join for the inviter; moved to the account if this person signs up later.
    const refCode = String(req.body?.referral_code || "").trim();
    if (refCode) {
      try {
        const { recordReferral } = await import("./referralProgram");
        await recordReferral({ supabase: client, privilegedSupabase: client, getDb: deps.getDb, saveDb: deps.saveDb },
          refCode, { id: `waitlist:${id}`, email: value.email, phone: value.mobile, type: "creator" });
      } catch (e: any) { console.warn("[creator-apply] referral not recorded:", e?.message || e); }
    }

    return res.json({ ok: true, success: true, id, handle: value.handle, email: value.email, niche: value.niche });
  };
}

// ---------- approval (admin) ----------
/**
 * Same formulas the app uses for registered creators (creators_routes.ts profile save): engagement
 * from reach ÷ followers, the authentic-audience estimate and the performance score. So each
 * approved applicant gets numbers from their own followers and reach — never one fixed value.
 */
export function applicantMetrics(followers: number, reach: number) {
  // Session 40: same estimate as a registered creator (src/utils/audienceEstimate.ts) — from the
  // applicant's own followers and reach, null when there is not enough to say anything.
  const f = Math.max(0, Number(followers) || 0);
  const r = Math.max(0, Number(reach) || 0);
  let er = f > 0 && r > 0 ? parseFloat(((r / f) * 100).toFixed(2)) : 0;
  if (er > 100) er = 100;
  const est = audienceEstimate({ followers: f, avgReach: r });
  return {
    engagement_rate: er,
    fake_follower_pct: est.authenticPct === null ? null : 100 - est.authenticPct,
    performance_score: est.performanceScore,
    avg_views_30d: r,
  };
}

const unclaimedId = () => `CRTR_UNCLAIMED_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

/**
 * Approve one creator application → exactly ONE unclaimed creator profile on Explore.
 * - Email already belongs to a real account → no shadow profile, that account is never touched.
 * - The same email was approved before → the same unclaimed profile is updated (no duplicates).
 * Returns { ok, status, message, shadowUserId? } or { ok: false, error }.
 */
export async function approveCreatorApplication(entry: any, deps: { client: any; getDb: () => any; saveDb: (db: any) => void }) {
  const { client } = deps;
  const db = deps.getDb();
  for (const k of ["users", "creator_profiles", "waitlist"]) if (!db[k]) db[k] = [];
  const email = String(entry?.email || "").toLowerCase().trim();
  const now = new Date().toISOString();

  const markApproved = async (patch: any) => {
    if (client) {
      const { error } = await client.from("waitlist").update({ status: "Approved", ...patch }).eq("id", entry.id);
      if (error) return error.message || "database error";
    }
    const w = db.waitlist.find((x: any) => String(x.id) === String(entry.id));
    if (w) Object.assign(w, { status: "Approved", ...patch });
    return null;
  };

  // Who owns this email today?
  let real: any = null; let shadow: any = null;
  if (email) {
    let rows: any[] = [];
    if (client) {
      const { data } = await client.from("users").select("user_id, auth_method, role").ilike("email", email).limit(5);
      rows = Array.isArray(data) ? data : [];
    } else {
      rows = db.users.filter((u: any) => String(u.email || "").toLowerCase() === email);
    }
    real = rows.find((u) => u.auth_method !== "unclaimed") || null;
    shadow = rows.find((u) => u.auth_method === "unclaimed") || null;
  }
  if (real) {
    const err = await markApproved({ linked_user_id: real.user_id, is_registered_user: true });
    if (err) return { ok: false, error: `Approval failed: ${err}` };
    try { deps.saveDb(db); } catch { /* cache */ }
    return { ok: true, status: "Approved", message: "This email already has a Ybex account — marked approved, their own profile stays as it is." };
  }

  const shadowUserId = shadow?.user_id || unclaimedId();
  const followers = Number(entry.followers || entry.follower_count || 0) || 0;
  const reach = parseCount(entry.avg_reach) || 0;
  const price = parseCount(entry.pricing?.ugc ?? entry.charges) || 0;
  const handle = String(entry.social_handle || entry.handle || "").replace(/^@+/, "");
  const photo = entry.profile_photo_url || entry.photo || "";
  const m = applicantMetrics(followers, reach);

  const shadowUser = {
    user_id: shadowUserId, email: email || `unclaimed_${shadowUserId}@ybex.io`, name: entry.name || "Creator",
    phone: entry.mobile || entry.phone || "", picture: photo, role: "creator", auth_method: "unclaimed",
    is_claimed: false, is_unclaimed: true, created_at: now,
  };
  const shadowProfile = {
    user_id: shadowUserId, name: entry.name || "Creator", email, photo, picture: photo, avatar_url: photo,
    city: entry.city || "", gender: entry.gender || "",
    instagram: entry.instagram_link || (handle ? `https://instagram.com/${handle}` : ""),
    instagram_handle: handle, handle,
    followers_instagram: followers, follower_count: followers, followers,
    instagram_avg_reach: reach,
    primary_niche: entry.niche || entry.category || "", category: entry.niche || entry.category || "",
    rate_reel: price, rate_story: 0, rate_yt_video: 0,
    rate_card: { ugc: price, reel: price, reels: price },
    charges: price ? `₹${formatIndian(price)}` : "",
    ugc_rating: entry.ugc_rating ?? null,
    ...m,
    collab_types: Array.isArray(entry.collab_types) ? entry.collab_types : [],
    sample_links: Array.isArray(entry.sample_links) ? entry.sample_links : [],
    portfolio: Array.isArray(entry.sample_links) ? entry.sample_links : [],
    bio: entry.notes || "",
    profile_status: "approved", creator_type: "influencer", work_mode: "active",
    is_claimed: false, is_unclaimed: true, reviewed_at: now, created_at: now,
  };

  if (client) {
    const u = await client.from("users").upsert([onlyColumns(shadowUser, USERS_COLUMNS)], { onConflict: "user_id" });
    if (u.error) return { ok: false, error: `Approval failed (account): ${u.error.message}` };
    const p = await client.from("creator_profiles").upsert([onlyColumns(shadowProfile, CREATOR_PROFILE_COLUMNS)], { onConflict: "user_id" });
    if (p.error) return { ok: false, error: `Approval failed (profile): ${p.error.message}` };
  }
  const ui = db.users.findIndex((x: any) => String(x.user_id) === shadowUserId);
  if (ui >= 0) db.users[ui] = { ...db.users[ui], ...shadowUser }; else db.users.unshift(shadowUser);
  const pi = db.creator_profiles.findIndex((x: any) => String(x.user_id) === shadowUserId);
  if (pi >= 0) db.creator_profiles[pi] = { ...db.creator_profiles[pi], ...shadowProfile }; else db.creator_profiles.unshift(shadowProfile);
  const err = await markApproved({ linked_user_id: shadowUserId });
  if (err) return { ok: false, error: `Approval failed: ${err}` };
  try { deps.saveDb(db); } catch { /* cache */ }
  return { ok: true, status: "Approved", shadowUserId, message: shadow ? "Approved — updated their existing listing." : "Approved and added to Unclaimed Creators" };
}

// ---------- emails ----------
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Approval / rejection email for an application. Never throws; returns whether it was sent. */
export async function sendApplicationDecisionEmail(entry: any, decision: "approved" | "rejected", reason?: string): Promise<boolean> {
  const to = String(entry?.email || "").trim();
  if (!to.includes("@") || to.endsWith("@ybex.io") || to.includes("@example.com")) return false;
  // Session 36: rows from Admin → Upload CSV did not apply themselves — no approve / reject email.
  if (String(entry?.source || "") === "csv_import") return false;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log(`[creator-apply] email skipped (no RESEND_API_KEY): ${decision} → ${to}`); return false; }
  try {
    const { Resend } = await import("resend");
    const { buildEmailHtml, getValidFromEmail } = await import("./helpers");
    const appUrl = process.env.APP_URL || "https://ybexmedia.in";
    const name = String(entry?.name || "there").split(" ")[0];
    const approved = decision === "approved";
    const html = buildEmailHtml({
      title: approved ? "You're on Ybex" : "About your Ybex application",
      greeting: `Hi ${esc(name)},`,
      paragraphs: approved
        ? [
            "Good news — our team reviewed your creator application and approved it. Your profile is now listed on Ybex, where brands can find you.",
            "Sign up with this same email to claim your profile, add your rate card and start getting collaborations.",
          ]
        : [
            "Thank you for applying to Ybex. Our team reviewed your application, and we can't list your profile right now.",
            `<strong>Reason:</strong> ${esc(reason || "Your profile did not meet our current listing criteria.")}`,
            "You are welcome to apply again once this is sorted.",
          ],
      button: approved ? { text: "Claim your profile", link: `${appUrl}/signup?role=creator` } : { text: "Apply again", link: `${appUrl}/apply` },
    });
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getValidFromEmail(),
      to,
      subject: approved ? "Your Ybex creator profile is approved" : "Update on your Ybex creator application",
      html,
    } as any);
    if (error) { console.warn("[creator-apply] email failed:", (error as any).message || error); return false; }
    return true;
  } catch (e: any) {
    console.warn("[creator-apply] email failed:", e?.message || e);
    return false;
  }
}

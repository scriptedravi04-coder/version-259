// Session 36 (Ravi): Admin → Waitlist → Upload CSV. Replaces the old bulk-import route that invented
// numbers. Each good row becomes a PENDING waitlist row (source "csv_import") — the same review queue as
// the public /apply form (rule 72). Nothing is invented: an empty cell stays empty. Approving / rejecting
// an imported row sends NO email (these people did not apply themselves).
import crypto from "crypto";
import { parseCount, normaliseApplicantMobile, onlyColumns, WAITLIST_COLUMNS } from "./creatorApplication";

export const CSV_IMPORT_SOURCE = "csv_import";
export const CSV_MAX_ROWS = 500;
export const CSV_TEMPLATE_HEADERS = ["name", "email", "mobile", "instagram", "city", "gender", "followers", "avg_reach", "price", "niche", "notes"];

export type CsvRowResult = {
  row: number;            // 1-based line in the sheet (header = 0)
  status: "ok" | "error" | "duplicate";
  reason?: string;
  value?: Record<string, any>;
};

const pick = (r: Record<string, any>, ...keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(r).find((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_") === k);
    if (hit && String(r[hit] ?? "").trim() !== "") return String(r[hit]).trim();
  }
  return "";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure: checks rows, never writes. existingEmails = lower-case emails already in waitlist or users. */
export function prepareCsvRows(rows: Record<string, any>[], existingEmails: Set<string>): CsvRowResult[] {
  const seen = new Set<string>();
  return (rows || []).slice(0, CSV_MAX_ROWS).map((r, i) => {
    const row = i + 1;
    const name = pick(r, "name", "full_name");
    const email = pick(r, "email", "email_id").toLowerCase();
    if (!name) return { row, status: "error", reason: "Name is missing" };
    if (!email) return { row, status: "error", reason: "Email is missing" };
    if (!EMAIL_RE.test(email)) return { row, status: "error", reason: "Email does not look right" };
    if (existingEmails.has(email)) return { row, status: "duplicate", reason: "This email is already on Ybex" };
    if (seen.has(email)) return { row, status: "duplicate", reason: "Same email twice in this file" };

    const mobileRaw = pick(r, "mobile", "phone", "whatsapp");
    const mobile = mobileRaw ? normaliseApplicantMobile("+91", mobileRaw) : null;
    if (mobileRaw && !mobile) return { row, status: "error", reason: "Mobile number is not valid" };

    const followersRaw = pick(r, "followers", "followers_instagram");
    const followers = followersRaw ? parseCount(followersRaw) : null;
    if (followersRaw && followers === null) return { row, status: "error", reason: "Followers is not a number (e.g. 15000 or 1.5L)" };
    const reachRaw = pick(r, "avg_reach", "reach", "average_reach");
    const reach = reachRaw ? parseCount(reachRaw) : null;
    if (reachRaw && reach === null) return { row, status: "error", reason: "Avg reach is not a number" };
    const priceRaw = pick(r, "price", "charges", "rate", "ugc_price");
    const price = priceRaw ? parseCount(priceRaw) : null;
    if (priceRaw && price === null) return { row, status: "error", reason: "Price is not a number" };

    const insta = pick(r, "instagram", "instagram_handle", "insta")
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").replace(/^@/, "");

    seen.add(email);
    return {
      row, status: "ok",
      value: {
        name, email, mobile,
        social_handle: insta || null,
        instagram_link: insta ? `https://instagram.com/${insta}` : null,
        city: pick(r, "city") || null,
        gender: pick(r, "gender") || null,
        followers,                                   // null when empty — never a default
        avg_reach: reach !== null ? String(reach) : null,
        charges: price !== null ? `₹${Math.round(price).toLocaleString("en-IN")}` : null,
        niche: pick(r, "niche", "category") || null,
        notes: pick(r, "notes") || null,
      },
    };
  });
}

/** Row for the waitlist table (real columns only). */
export function toWaitlistRow(value: Record<string, any>, nowIso = new Date().toISOString()) {
  return onlyColumns({
    id: crypto.randomUUID(),
    ...value,
    role: "creator",
    status: "Pending",
    source: CSV_IMPORT_SOURCE,
    is_registered_user: false,
    created_at: nowIso,
  }, WAITLIST_COLUMNS);
}

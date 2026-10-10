import express from "express";
import { Resend, buildEmailHtml, getValidFromEmail } from "./helpers";
import { issueLoginOtp, checkLoginOtp, LOGIN_OTP_MESSAGES } from "./loginOtp";
import { activeMoney } from "./accountWipe";

// Session 43 (Ravi): Settings → Account. Login details (phone change instant, email change via OTP),
// and self-serve account deletion (Play Store requirement). Payment / invoice records are kept
// (the `transactions` table is never touched here); deletion is a soft-delete (is_deleted) that hides
// the account and blocks login, exactly like the admin "bin". The 30-day auto-purge + self-serve
// recovery need a `users.deletion_requested_at` column + a scheduled job — see PENDING_DB_CHANGES.md.
// This endpoint best-effort stamps that column so it is ready the moment it exists.

const PHONE_OK = (p: string) => /^[6-9]\d{9}$/.test(String(p || "").replace(/\D/g, ""));
const EMAIL_OK = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

export function setupAccountRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {
  const db = () => privilegedSupabase || supabase;

  const me = async (req: express.Request, res: express.Response) => {
    const user = await parseAuthUser(req);
    if (!user) { res.status(403).json({ detail: "Not authenticated" }); return null; }
    return user;
  };

  const updateUserEverywhere = async (uid: string, patch: Record<string, any>) => {
    const client = db();
    if (client) {
      try { await client.from("users").update(patch).eq("user_id", uid); } catch (e) { console.warn("[account] users update notice", e); }
    }
    const local = getDb();
    if (local?.users) {
      const u = local.users.find((x: any) => x.user_id === uid);
      if (u) { Object.assign(u, patch); saveDb(local); }
    }
  };

  const sendOtpEmail = async (to: string, code: string, subject: string, line: string) => {
    if (!process.env.RESEND_API_KEY) { console.warn("[account] RESEND_API_KEY not set — OTP only in logs"); return; }
    try {
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      await resendClient.emails.send({
        from: getValidFromEmail(process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>"),
        to,
        subject,
        html: buildEmailHtml({
          greeting: "Hi there,",
          paragraphs: [
            line,
            '<h1 style="font-size:32px;letter-spacing:4px;color:#7C3AED;background:#f3f4f6;padding:12px 20px;display:inline-block;border-radius:8px;margin:0;">' + code + "</h1>",
            "It works for 10 minutes. If this wasn't you, you can ignore this email.",
          ],
        }),
      });
    } catch (e: any) {
      console.error("[account] OTP email failed:", e?.message || e);
    }
  };

  // Money still in flight (held / paid-but-unfinished) that must be settled before deleting.
  const activeMoneyFor = async (uid: string): Promise<string[]> => {
    const client = db();
    if (!client) return [];
    try {
      const [{ data: deals }, { data: orders }] = await Promise.all([
        client.from("deals").select("*").or(`creator_id.eq.${uid},brand_id.eq.${uid},brand_user_id.eq.${uid},creator_user_id.eq.${uid}`),
        client.from("ugc_orders").select("*").or(`creator_id.eq.${uid},brand_id.eq.${uid}`),
      ]);
      return activeMoney(deals || [], orders || []);
    } catch (e) {
      console.warn("[account] active-money check notice", e);
      return []; // cannot check → do not hard-block (Play requires deletion to be possible)
    }
  };

  // ---- Login details -------------------------------------------------------
  router.get("/account/overview", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    res.json({
      email: user.email || "",
      phone: user.phone || "",
      email_verified: Boolean(user.verified || user.email_verified),
      role: user.role || "",
    });
  });

  // Phone — instant, no OTP (phone is not used for login or sign-in codes).
  router.post("/account/phone", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    if (!PHONE_OK(phone)) return res.status(400).json({ detail: "Enter a valid 10-digit mobile number." });
    await updateUserEverywhere(user.user_id, { phone });
    res.json({ success: true, phone });
  });

  // Email change — prove the NEW address with an OTP sent to it.
  router.post("/account/email/send-otp", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_OK(email)) return res.status(400).json({ detail: "Enter a valid email address." });
    if (email === String(user.email || "").trim().toLowerCase()) return res.status(400).json({ detail: "That is already your email." });
    try {
      const { data: taken } = await db().from("users").select("user_id").ilike("email", email).neq("user_id", user.user_id).limit(1);
      if (taken && taken.length) return res.status(409).json({ detail: "That email is already used by another account." });
    } catch (e) { console.warn("[account] email-taken check notice", e); }
    const issued = await issueLoginOtp(email);
    if (!issued.ok) return res.status(429).json({ detail: "Too many codes asked. Please wait 15 minutes." });
    await sendOtpEmail(email, issued.code, `${issued.code} is your Ybex email-change code`, "Use this code to confirm your new Ybex email:");
    res.json({ success: true });
  });

  router.post("/account/email/verify", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    if (!EMAIL_OK(email) || !otp) return res.status(400).json({ detail: "Email and code are required." });
    const chk = await checkLoginOtp(email, otp);
    if (chk !== "ok") return res.status(400).json({ detail: LOGIN_OTP_MESSAGES[chk] || "That code didn't work." });
    try {
      const { data: taken } = await db().from("users").select("user_id").ilike("email", email).neq("user_id", user.user_id).limit(1);
      if (taken && taken.length) return res.status(409).json({ detail: "That email is already used by another account." });
    } catch (e) { console.warn("[account] email-taken check notice", e); }
    await updateUserEverywhere(user.user_id, { email, verified: true, email_verified: true });
    res.json({ success: true, email });
  });

  // ---- Delete account ------------------------------------------------------
  router.get("/account/delete/preflight", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const reasons = await activeMoneyFor(user.user_id);
    res.json({ blocked: reasons.length > 0, reasons });
  });

  router.post("/account/delete/send-otp", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const email = String(user.email || "").trim().toLowerCase();
    if (!EMAIL_OK(email)) return res.status(400).json({ detail: "Your account has no email to send a code to. Please contact support." });
    const issued = await issueLoginOtp(email);
    if (!issued.ok) return res.status(429).json({ detail: "Too many codes asked. Please wait 15 minutes." });
    await sendOtpEmail(email, issued.code, `${issued.code} is your Ybex account-deletion code`, "Use this code to confirm deleting your Ybex account:");
    res.json({ success: true });
  });

  router.post("/account/delete/confirm", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const otp = String(req.body?.otp || "").trim();
    const email = String(user.email || "").trim().toLowerCase();
    if (!otp) return res.status(400).json({ detail: "Enter the code we emailed you." });
    const chk = await checkLoginOtp(email, otp);
    if (chk !== "ok") return res.status(400).json({ detail: LOGIN_OTP_MESSAGES[chk] || "That code didn't work." });

    const reasons = await activeMoneyFor(user.user_id);
    if (reasons.length) return res.status(409).json({ detail: "Finish or cancel these first, then delete.", code: "ACTIVE_MONEY", reasons });

    const uid = user.user_id;
    const client = db();
    // Soft-delete: hide the account and block login (same flag the admin bin uses). Records kept.
    await updateUserEverywhere(uid, { is_deleted: true });
    if (client) {
      for (const tbl of ["creator_profiles", "brand_profiles"]) {
        try { await client.from(tbl).update({ is_deleted: true }).eq("user_id", uid); } catch { /* table/column may not exist */ }
      }
      // Best-effort: stamp the deletion time so the future 30-day purge job + countdown can use it.
      try { await client.from("users").update({ deletion_requested_at: new Date().toISOString(), deletion_reason: "self_serve" }).eq("user_id", uid); } catch { /* column not added yet */ }
      // End every active session for this user.
      try { await client.from("user_sessions").delete().eq("user_id", uid); } catch { /* ignore */ }
    }
    const local = getDb();
    if (local?.user_sessions) { local.user_sessions = local.user_sessions.filter((s: any) => s.user_id !== uid); saveDb(local); }

    res.clearCookie?.("session_token");
    res.clearCookie?.("has_session");
    res.json({ success: true, grace_days: 30 });
  });
}

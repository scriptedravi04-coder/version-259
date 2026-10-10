// Session 24 security pass (login).
//
// Before:
//  - Session tokens were `token_` + Math.random() in base 36 (~11 chars, not cryptographic).
//  - Every password a user typed at sign-up / login / admin reset was saved in PLAIN TEXT
//    (db_mock.json `user_plain_passwords`) and shown to admins as `plain_password`.
//  - Login looked the email up with ILIKE, so `%` / `_` in the input were wildcards.
//  - No limit on wrong-password attempts (a weak admin password could be guessed).
import crypto from "crypto";

export function newSessionToken(prefix = "token_"): string {
  return prefix + crypto.randomBytes(32).toString("hex");
}

/** An email for an exact, case-insensitive ILIKE match (wildcards escaped). */
export function escapeLike(s: string): string {
  return String(s || "").replace(/[\\%_]/g, (c) => "\\" + c);
}

/** Pick the one account for this email from several rows (duplicates exist in old data). */
export function pickLoginUser(rows: any[], email: string): any | null {
  const target = String(email || "").trim().toLowerCase();
  const exact = (rows || []).filter((u) => String(u?.email || "").trim().toLowerCase() === target);
  if (!exact.length) return null;
  const alive = exact.filter((u) => !u.is_deleted);
  const pool = alive.length ? alive : exact;
  // Prefer a row that can actually log in with a password, then the admin row, then newest.
  return pool.slice().sort((a, b) =>
    (Number(Boolean(b.password_hash)) - Number(Boolean(a.password_hash))) ||
    (Number(String(b.role).toLowerCase() === "admin") - Number(String(a.role).toLowerCase() === "admin")) ||
    (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0)
  )[0];
}

/** True when the stored value is a real bcrypt hash. Anything else is legacy and gets upgraded. */
export function isBcryptHash(v: any): boolean {
  return typeof v === "string" && /^\$2[aby]\$\d{2}\$/.test(v);
}

type Bucket = { count: number; first: number; lockedUntil: number };
const buckets = new Map<string, Bucket>();
export const LOGIN_MAX_FAILS = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** ms left in a lockout for this key (0 = allowed). */
export function loginLockedFor(key: string, now = Date.now()): number {
  const b = buckets.get(key);
  if (!b) return 0;
  if (b.lockedUntil > now) return b.lockedUntil - now;
  if (now - b.first > LOGIN_WINDOW_MS) buckets.delete(key);
  return 0;
}
export function recordLoginFailure(key: string, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || now - b.first > LOGIN_WINDOW_MS) { buckets.set(key, { count: 1, first: now, lockedUntil: 0 }); return; }
  b.count += 1;
  if (b.count >= LOGIN_MAX_FAILS) b.lockedUntil = now + LOGIN_LOCK_MS;
}
export function clearLoginFailures(key: string): void { buckets.delete(key); }
export function _resetLoginBuckets(): void { buckets.clear(); }

export function sessionCookieOptions() {
  const prod = process.env.NODE_ENV === "production";
  return { maxAge: 7 * 24 * 3600 * 1000, httpOnly: true, secure: prod, sameSite: "lax" as const, path: "/" };
}

const SECRET_KEYS = new Set(["password_hash", "password", "plain_password", "user_plain_passwords", "plain_passwords", "session_token_hash"]);

/**
 * Backstop for every API response: returns a copy without password fields, however deep.
 * (Many handlers spread whole user rows into their answer — the admin user list sent every
 * user's password hash.) Never mutates the input: local-db rows are returned by reference.
 */
export function scrubSecrets(value: any, depth = 0): any {
  if (value === null || typeof value !== "object" || depth > 8) return value;
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  let out: any = null;
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (SECRET_KEYS.has(k)) { if (!out) out = { ...value }; delete out[k]; continue; }
    if (v && typeof v === "object") {
      const c = scrubSecrets(v, depth + 1);
      if (c !== v) { if (!out) out = { ...value }; out[k] = c; }
    }
  }
  return out || value;
}


// ---------------------------------------------------------------------------------------------
// Session 25 — admin accounts.
// ---------------------------------------------------------------------------------------------

/** Roles that are admin staff. `team_role` is only meaningful on these. */
export const ADMIN_STAFF_ROLES = ["admin", "sub_admin"];

/** Team roles that grant admin staff powers; nobody outside ADMIN_STAFF_ROLES may carry them. */
export const STAFF_TEAM_ROLES = ["sub_admin", "super_admin", "owner"];

export function neutralizeStaffTeamRole<T extends any>(user: T): T {
  const u: any = user;
  if (!u || typeof u !== "object") return user;
  const role = String(u.role || "").toLowerCase();
  const team = String(u.team_role || "").toLowerCase();
  if (!ADMIN_STAFF_ROLES.includes(role) && STAFF_TEAM_ROLES.includes(team)) {
    return { ...u, team_role: null };
  }
  return user;
}

/** Full admin = role admin and not a sub-admin. Only they create or promote admins. */
export function isFullAdmin(user: any): boolean {
  return Boolean(user) && String(user.role || "").toLowerCase() === "admin" && String(user.team_role || "").toLowerCase() !== "sub_admin";
}

export function isAdminStaff(user: any): boolean {
  return Boolean(user) && ADMIN_STAFF_ROLES.includes(String(user.role || "").toLowerCase());
}

const WEAK = new Set(["123456789", "1234567890", "12345678", "password", "password1", "qwerty123", "admin123", "11111111", "iloveyou", "ybex1234"]);

/** Error text for a password an admin sets for someone else, or null when it is fine. */
export function newPasswordProblem(pw: any): string | null {
  const p = String(pw || "");
  if (p.length < 10) return "Use at least 10 characters.";
  if (WEAK.has(p.toLowerCase()) || /^(\d)\1+$/.test(p) || /^\d+$/.test(p)) return "This password is too easy to guess. Mix letters, numbers and a symbol.";
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return "Use both letters and numbers.";
  return null;
}

/** True when a Supabase error is a row-level-security refusal (the server lacks the service key). */
export function isRlsError(err: any): boolean {
  const msg = String(err?.message || "");
  return err?.code === "42501" || /row-level security/i.test(msg);
}

export const SERVICE_KEY_HELP =
  "The server is not using the Supabase service key, so the database refused the write. Set SUPABASE_SERVICE_ROLE_KEY (the service_role / secret key, not the anon or publishable key) on this server and restart it.";

/**
 * Session 33: is this "service key" really the anon / publishable key? (Common mistake when the
 * Cloud Run variable is filled in.) Returns a message only when we are sure; null = looks fine.
 */
export function serviceKeyProblem(key: string | undefined | null): string | null {
  const k = String(key || "").trim();
  if (!k) return "SUPABASE_SERVICE_ROLE_KEY is empty.";
  if (k.startsWith("sb_publishable_")) return "SUPABASE_SERVICE_ROLE_KEY holds the publishable key (sb_publishable_…). Use the secret key (sb_secret_…) or the legacy service_role key.";
  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      if (payload && payload.role && payload.role !== "service_role") {
        return `SUPABASE_SERVICE_ROLE_KEY is a '${payload.role}' key, not the service_role key.`;
      }
    } catch { return null; }
  }
  return null;
}

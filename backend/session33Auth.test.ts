// Session 33 (Ravi): signup failed on the public site even with the service key set.
// Locks the fixes: no local-only accounts, no plain OTP, code to browser only in test mode,
// duplicate-safe email lookup, anon key in the service-key slot is detected.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { serviceKeyProblem } from "./authSecurity";

const src = fs.readFileSync(path.join(process.cwd(), "backend/auth_routes.ts"), "utf8");

describe("session 33 signup / OTP", () => {
  it("never stores or compares a plain OTP", () => {
    expect(src).not.toMatch(/plain_otp/);
  });
  it("returns the code to the browser only on a non-production server (Session 43: not payment test mode)", () => {
    expect(src).not.toMatch(/!process\.env\.RESEND_API_KEY\)\s*\?\s*otp/);
    expect(src).toMatch(/otpForBrowser = \(otp: string\) => \(resolveOtpEcho\(process\.env\) \? otp : undefined\)/);
  });
  it("has no silent local-file fallback when the users insert is refused", () => {
    expect(src).not.toMatch(/using local DB fallback/);
    expect(src).toMatch(/SIGNUP_INSERT_FAILED/);
  });
  it("fails signup / verify / resend clearly without the service key", () => {
    expect((src.match(/if \(supabase && !privilegedSupabase\) return res\.status\(503\)\.json\(SIGNUP_NO_SERVICE_KEY\)/g) || []).length).toBe(3);
  });
  it("a code that could not be saved to Supabase is an error (other instances could not verify it)", () => {
    expect((src.match(/OTP_SAVE_FAILED/g) || []).length).toBe(2);
  });
  it("looks emails up duplicate-safe (no maybeSingle on signup / verify / resend)", () => {
    for (const route of ['"/auth/signup"', '"/auth/verify-email"', '"/auth/resend-verification-otp"']) {
      const start = src.indexOf(`router.post(${route}`);
      const body = src.slice(start, src.indexOf("router.post(", start + 10));
      expect(body).toMatch(/findUserByEmail\(/);
    }
  });
});

describe("serviceKeyProblem", () => {
  const jwt = (role: string) => "x." + Buffer.from(JSON.stringify({ role })).toString("base64") + ".y";
  it("flags anon / publishable keys", () => {
    expect(serviceKeyProblem("sb_publishable_abc")).toMatch(/publishable/);
    expect(serviceKeyProblem(jwt("anon"))).toMatch(/anon/);
  });
  it("accepts service_role and secret keys", () => {
    expect(serviceKeyProblem(jwt("service_role"))).toBeNull();
    expect(serviceKeyProblem("sb_secret_abc")).toBeNull();
  });
});

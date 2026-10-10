import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { resolveOtpEcho } from "./otpEcho";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("Session 43 — OTP never reaches the browser on the live server", () => {
  it("production never echoes, even with payment test mode on a run.app URL", () => {
    expect(resolveOtpEcho({ NODE_ENV: "production", PAYMENTS_TEST_MODE: "true", APP_URL: "https://x.run.app" })).toBe(false);
    expect(resolveOtpEcho({ NODE_ENV: "production" })).toBe(false);
  });
  it("local dev / tests echo unless OTP_ECHO=off", () => {
    expect(resolveOtpEcho({ NODE_ENV: "development" })).toBe(true);
    expect(resolveOtpEcho({ NODE_ENV: "test" })).toBe(true);
    expect(resolveOtpEcho({ NODE_ENV: "development", OTP_ECHO: "off" })).toBe(false);
  });
  it("signup, login, resend and signing codes all use it (not payment test mode)", () => {
    const auth = read("backend/auth_routes.ts");
    expect(auth).not.toMatch(/resolveTestMode\(process\.env\) \? otp/);
    expect(auth).not.toMatch(/if \(resolveTestMode\(process\.env\)\) console\.log\(`\[(Signup|Login OTP|Resend|Forgot)/);
    expect(read("backend/session_routes.ts")).toContain("const exposeCode = resolveOtpEcho(process.env);");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { issueLoginOtp, checkLoginOtp, emailCheckAllowed } from "./loginOtp";
import { _resetEphemeral } from "./ephemeralStore";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("Session 42 — login with an email code", () => {
  beforeEach(() => _resetEphemeral());

  it("a code works once, case and spaces in the email don't matter", async () => {
    const r = await issueLoginOtp(" Riya@Mail.com ");
    expect(r.ok).toBe(true);
    const code = (r as any).code;
    expect(code).toMatch(/^\d{6}$/);
    expect(await checkLoginOtp("riya@mail.com", code)).toBe("ok");
    expect(await checkLoginOtp("riya@mail.com", code)).toBe("expired");
  });

  it("a new code replaces the old one", async () => {
    const a = (await issueLoginOtp("a@b.in")) as any;
    const b = (await issueLoginOtp("a@b.in")) as any;
    if (a.code !== b.code) expect(await checkLoginOtp("a@b.in", a.code)).not.toBe("ok");
    expect(await checkLoginOtp("a@b.in", b.code)).toBe("ok");
  });

  it("5 wrong tries kill the code", async () => {
    const r = (await issueLoginOtp("x@y.in")) as any;
    const wrong = r.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect(await checkLoginOtp("x@y.in", wrong)).toBe("wrong");
    expect(await checkLoginOtp("x@y.in", wrong)).toBe("locked");
    expect(await checkLoginOtp("x@y.in", r.code)).toBe("expired");
  });

  it("at most 3 codes per email in 15 minutes", async () => {
    for (let i = 0; i < 3; i++) expect((await issueLoginOtp("z@y.in")).ok).toBe(true);
    expect(await issueLoginOtp("z@y.in")).toEqual({ ok: false, reason: "too_many" });
  });

  it("the email box can't be used to test thousands of emails", () => {
    const t = Date.now();
    for (let i = 0; i < 30; i++) expect(emailCheckAllowed("9.9.9.9", t)).toBe(true);
    expect(emailCheckAllowed("9.9.9.9", t)).toBe(false);
    expect(emailCheckAllowed("9.9.9.9", t + 11 * 60 * 1000)).toBe(true);
  });

  it("/auth/login checks the code itself, so every account check (banned, deleted, team) still runs", () => {
    const s = read("backend/auth_routes.ts");
    const login = s.slice(s.indexOf('router.post("/auth/login"'), s.indexOf('router.post("/auth/check-email"'));
    expect(login).toContain("const usingOtp = !password && !!otp;");
    expect(login.indexOf("if (user.banned)")).toBeLessThan(login.indexOf("checkLoginOtp(cleanInput"));
    expect(login).toContain("if (!usingOtp && user.password_hash)");
    expect(login).toContain("recordLoginFailure(limitKey)");
  });

  it("check-email tells only what the screen needs; unverified accounts count too (Session 43)", () => {
    const s = read("backend/auth_routes.ts");
    const r = s.slice(s.indexOf('router.post("/auth/check-email"'), s.indexOf('router.post("/auth/login-otp"'));
    expect(r).toContain("emailCheckAllowed(ip)");
    expect(r).toContain("if (!user || user.auth_method === 'unclaimed')");
    expect(r).not.toMatch(/user_id|phone|name:/);
  });

  it("login codes use the existing shared store (no new table)", () => {
    expect(read("backend/loginOtp.ts")).toContain('from "./ephemeralStore"');
  });
});

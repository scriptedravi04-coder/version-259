import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Session 20. A brand could open Create Campaign and still get "Only brands can post
// campaigns"; OTPs reported "sent" when no email went out; /api/admin/run-sql leaked process.env.

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

const server = read("backend/server.ts");
const parseAuth = server.slice(server.indexOf("async function parseAuthUser"), server.indexOf("async function sendActivityNotificationEmail"));

describe("parseAuthUser", () => {
  it("reads sessions and users with the privileged client", () => {
    expect(parseAuth).toContain("const authDb = privilegedSupabase || supabase;");
    expect(parseAuth).toMatch(/authDb\s*\.from\('user_sessions'\)/);
    expect(parseAuth).toMatch(/authDb\s*\.from\('users'\)\s*\.select\('\*'\)\s*\.eq\('user_id', sess\.user_id\)/);
  });

  it("no longer accepts a bare user_id as a login token", () => {
    expect(parseAuth).not.toContain("directUser");
    expect(parseAuth).not.toMatch(/\.eq\('user_id', token\)/);
    expect(parseAuth).not.toMatch(/u\.user_id === token/);
  });
});

describe("POST /campaigns", () => {
  const c = read("backend/campaigns_routes.ts");
  const route = c.slice(c.indexOf('router.post("/campaigns", async'), c.indexOf("const actingId = getActingBrandId(user);", c.indexOf('router.post("/campaigns", async')));

  it("tells a lost session apart from a wrong account type", () => {
    expect(route).toContain('status(401)');
    expect(route).toContain('"SESSION_EXPIRED"');
    expect(route).toContain('"NOT_A_BRAND"');
    expect(route).toContain("This account is registered as a ${user.role}");
  });

  it("heals a finished brand that has no role", () => {
    expect(route).toContain("if (bRow && !cRow)");
    expect(route).toContain("update({ role: 'brand' })");
  });

  for (const f of ["src/pages/brand/BrandCampaignCreate.jsx", "src/components/campaigns/mobile/MobileCampaignCreate.jsx"]) {
    it(`${path.basename(f)} shows the readable message, not the code`, () => {
      expect(read(f)).toMatch(/e\?\.response\?\.data\?\.detail \|\|\s*(e\?\.response\?\.data\?\.error)/);
    });
  }
});

describe("OTP delivery", () => {
  const s = read("backend/session_routes.ts");
  const send = s.slice(s.indexOf('app.post("/api/otp/send"'), s.indexOf('app.post("/api/otp/verify"'));

  it("/otp/send reports a failed email instead of saying it was sent", () => {
    expect(send).toContain('status(502)');
    expect(send).toContain('"OTP_NOT_DELIVERED"');
    expect(send).toMatch(/if \(deliveryError && !exposeCode\)/);
    expect((send.match(/deliveryError = /g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it("drops the undeliverable code so the user can retry at once", () => {
    const failBlock = send.slice(send.indexOf("if (deliveryError && !exposeCode)"));
    expect(failBlock.slice(0, 400)).toContain("otpStore.delete(key)");
    expect(failBlock.slice(0, 400)).toContain("otpSendLog.set(key, sends.slice(0, -1))");
  });

  it("signup / resend / reset emails fail loudly outside NODE_ENV=production too", () => {
    const a = read("backend/auth_routes.ts");
    expect(a).not.toContain("process.env.NODE_ENV === 'production' && !process.env.RESEND_ALLOW_FALLBACK");
  });

  it("OTP codes are logged only on a non-production server (Session 43)", () => {
    const a = read("backend/auth_routes.ts");
    for (const m of a.match(/console\.log\(`\[[^\]]+\] OTP for \$\{email\} is \$\{otp\}`\)/g) || []) {
      const at = a.indexOf(m);
      expect(a.slice(at - 40, at)).toContain("if (resolveOtpEcho(process.env))");
    }
  });

  for (const f of ["src/components/chat/ContractModal.jsx", "src/components/chat/UGCContractModal.jsx", "src/components/chat/mobile/useChatThreadMobile.js"]) {
    it(`${path.basename(f)} says so in test mode when the email did not go out`, () => {
      expect(read(f)).toContain('String(otpRes?.data?.message || "").startsWith("Test mode")');
    });
  }
});

describe("secrets", () => {
  it("no route answers with process.env", () => {
    expect(server).not.toContain("/api/admin/run-sql', async");
    expect(server).not.toMatch(/res\.json\(process\.env\)/);
  });
});

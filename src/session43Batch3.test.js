// Session 43 (Ravi): account section, delete account, /delete-account, privacy wording.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("backend account routes", () => {
  const s = read("backend/account_routes.ts");
  it("has login-details, phone (instant), email (OTP) and delete endpoints", () => {
    expect(s).toContain('router.get("/account/overview"');
    expect(s).toContain('router.post("/account/phone"');
    expect(s).toContain('router.post("/account/email/send-otp"');
    expect(s).toContain('router.post("/account/email/verify"');
    expect(s).toContain('router.get("/account/delete/preflight"');
    expect(s).toContain('router.post("/account/delete/send-otp"');
    expect(s).toContain('router.post("/account/delete/confirm"');
  });
  it("phone change has no OTP, email change verifies an OTP", () => {
    expect(s).toContain("instant, no OTP");
    expect(s).toContain("checkLoginOtp");
  });
  it("delete is a soft-delete that keeps transactions and blocks on active money", () => {
    expect(s).toContain("is_deleted: true");
    expect(s).toContain("activeMoney");
    expect(s).toContain('code: "ACTIVE_MONEY"');
    expect(s).not.toContain('from("transactions")'); // never touches payment records
  });
  it("best-effort stamps deletion_requested_at for the future purge job", () => {
    expect(s).toContain("deletion_requested_at");
  });
  it("is registered in server.ts", () => {
    expect(read("backend/server.ts")).toContain("setupAccountRoutes(app, router,");
  });
});

describe("account wired into profiles + public delete page", () => {
  it("creator profile has an Account row + screen", () => {
    const s = read("src/pages/creator/CreatorMobileProfile.jsx");
    expect(s).toContain('setMobileScreen("account")');
    expect(s).toContain('mobileScreen === "account"');
    expect(s).toContain("AccountPanel");
  });
  it("brand profile has an Account row + screen", () => {
    const s = read("src/components/profile/mobile/BrandProfileMobile.jsx");
    expect(s).toContain('goTo("account")');
    expect(s).toContain('section === "account"');
  });
  it("/delete-account route exists for the Play Console link", () => {
    expect(read("src/App.jsx")).toContain('path="/delete-account"');
  });
});

describe("privacy policy covers self-serve deletion & retention", () => {
  const s = read("src/lib/legal/legalContent.js");
  it("mentions Settings → Account → Delete account and 30-day recovery", () => {
    expect(s).toContain("Delete account");
    expect(s).toContain("delete-account");
    expect(s).toContain("30 days");
  });
  it("still keeps payment/invoice records and avoids the word escrow", () => {
    expect(s.toLowerCase()).not.toContain("escrow");
    expect(s).toMatch(/payment and invoice records are kept|Payment and tax records/i);
  });
});

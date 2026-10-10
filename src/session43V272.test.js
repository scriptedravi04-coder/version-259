import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { splitNumberAcrossMessages, checkComprehensiveDisallowedContent, resetRecentMessageBuffer, chunkDigits } from "./utils/contactSecurityFilter";
import { resolveNotificationTarget, notificationTitle } from "./components/inbox/mobile/NotificationsMobile.jsx";
import { upiPayUrl } from "./components/admin/AdminPayoutMobile.jsx";
import { couponSaving } from "./components/referral/CreatorCodeDealCard.jsx";
import { PUBLIC_SITE_URL } from "./lib/publicUrl";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("Session 43 v272 — Ravi's list 34–58", () => {
  it("a phone number sent in pieces is blocked (Ravi's exact chat), prices are not", () => {
    expect(chunkDigits("Reach me at 931")).toBe("931");
    expect(chunkDigits("budget is ₹3000")).toBeNull();
    expect(splitNumberAcrossMessages("9117", ["Reach me at 931", "509"])).toBe(true);
    expect(splitNumberAcrossMessages("2000", ["5000", "3000"])).toBe(false);
    resetRecentMessageBuffer();
    const o = { threadId: "t", senderId: "s" };
    const r = ["Reach me at 931", "509", "9117"].map((m) => checkComprehensiveDisallowedContent(m, o).blocked);
    expect(r[2]).toBe(true);
  });

  it("every notification opens a page; generic titles get real ones", () => {
    expect(resolveNotificationTarget({ thread_id: "t1" }, "brand")).toBe("/chat/t1");
    expect(resolveNotificationTarget({ message: "Ankit applied to your campaign X", campaign_id: "c1" }, "brand")).toBe("/brand/campaigns/c1/applicants");
    expect(resolveNotificationTarget({ title: "Payout released" }, "creator")).toBe("/earnings");
    expect(resolveNotificationTarget({ title: "Something" }, "creator")).toBe("/creator/inbox");
    expect(resolveNotificationTarget({ action_url: "https://evil.example" }, "brand")).toBe("/brand/inbox");
    expect(notificationTitle({ title: "Notification", message: "Ankit applied to your campaign X" })).toBe("New application");
  });

  it("admin UPI QR only from a real UPI ID and the exact amount", () => {
    expect(upiPayUrl({ upiId: "9950832099@ybl", netAmount: 5478, creatorName: "B Cool" })).toBe("upi://pay?pa=9950832099%40ybl&pn=B+Cool&am=5478.00&cu=INR&tn=Ybex+payout");
    expect(upiPayUrl({ upiId: "", netAmount: 5478 })).toBeNull();
    expect(upiPayUrl({ upiId: "not a vpa", netAmount: 5478 })).toBeNull();
    expect(read("src/components/admin/AdminPayoutMobile.jsx")).toContain("isPaidOut(t)");
  });

  it("creator code: gone from the agreement, card in chat; saving maths", () => {
    expect(read("src/components/chat/mobile/MobileContractSheet.jsx")).not.toContain("<KeepMorePopup");
    expect(read("src/components/chat/AgreementSign.jsx")).not.toContain("<KeepMorePopup");
    expect(read("src/components/chat/mobile/ChatBoxMobile.jsx")).toContain("<CreatorCodeDealCard");
    expect(couponSaving(10000, { threshold_amount: 20000, below_threshold_rate: 15 }, { type: "zero_fee" })).toBe(1500);
    expect(couponSaving(10000, { threshold_amount: 20000, below_threshold_rate: 15 }, null)).toBe(0);
  });

  it("signed side never gets the sign + OTP sheet again", () => {
    const m = read("src/components/chat/mobile/ChatBoxMobile.jsx");
    expect(m).toContain('setActiveSheet("signedInfo")');
    expect(read("src/components/chat/ChatBox.jsx")).toContain("You've signed. Waiting for the other side to sign.");
  });

  it("burger menu: no stuck tap layer, no ** in text, no handle in partner details", () => {
    const b = read("src/components/chat/BurgerMenuSupport.jsx");
    expect(b).toContain('data-testid="burger-menu-backdrop"');
    expect(b).not.toContain("**Section 10A");
    expect(b).not.toContain("creatorProfile.instagram || creator.instagram");
  });

  it("back from a linked chat clears the id from the address", () => {
    expect(read("src/components/inbox/mobile/InboxMobile.jsx")).toContain("if (routeUserId && typeof window");
  });

  it("shared links use the public address; previews have the Ybex picture", () => {
    expect(PUBLIC_SITE_URL).toMatch(/^https:\/\//);
    expect(read("src/components/referral/ReferralHub.jsx")).not.toContain("window.location.origin");
    expect(read("index.html")).toContain('property="og:image"');
    expect(fs.existsSync(path.join(process.cwd(), "public/og-image.jpg"))).toBe(true);
  });

  it("earnings deal sheet: no made-up dates; handshake picture; explore has no profile circle", () => {
    const e = read("src/components/payments/CreatorEarningsMobile.jsx");
    expect(e).not.toMatch(/Sep 18 ·|0:42 high bitrate|18h 32m if/);
    expect(read("src/components/chat/mobile/MobileShortlistCards.jsx")).toContain("/img/handshake.webp");
    expect(read("src/components/explore/mobile/ExploreMobile.jsx")).not.toContain('aria-label="Your account"');
  });
});

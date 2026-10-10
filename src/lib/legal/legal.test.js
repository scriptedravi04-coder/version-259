import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PUBLIC_TERMS, PRIVACY_POLICY, REFUND_POLICY, IN_APP_CARDS, LEGAL, roleTermsPage } from "./legalContent";
import { ageFromDob, isUnder18 } from "../age";

const all = JSON.stringify([PUBLIC_TERMS, PRIVACY_POLICY, REFUND_POLICY, IN_APP_CARDS]);
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("legal content (session 34)", () => {
  it("Ravi's decisions: Ybex Media, ybexmedia.in, Jaipur, Ravi Sharma; no Aadhaar collected, no escrow word", () => {
    expect(LEGAL.company).toBe("Ybex Media");
    expect(all).toContain("Jaipur");
    expect(all).toContain("Ravi Sharma");
    expect(all).toMatch(/do not collect Aadhaar/);
    expect(all.toLowerCase()).not.toContain("escrow");
    expect(all).not.toMatch(/ybex\.io|ybexmedia\.com/);
  });
  it("does not promise what is not built (auto-approval after 72 hours)", () => {
    expect(all).not.toMatch(/automatically.{0,40}72 hours|72 hours.{0,40}automatically/i);
  });
  it("creator panel = creator + common cards, brand panel = brand + common", () => {
    const c = roleTermsPage("creator").sections.map((s) => s.h);
    expect(c).toContain("Getting paid");
    expect(c).not.toContain("Hiring outside Ybex");
    expect(roleTermsPage("brand").sections.map((s) => s.h)).toContain("Hiring outside Ybex");
  });
  it("no false claims left on settings / signup", () => {
    for (const f of ["src/pages/creator/CreatorSettings.jsx", "src/pages/brand/BrandSettings.jsx", "src/components/profile/mobile/brand/LegalScreen.jsx"]) {
      const s = read(f);
      expect(s).not.toContain("Zero Middlemen Markup");
      expect(s).not.toContain("GDPR");
    }
    const signup = read("src/pages/auth/Signup.jsx");
    expect(signup).not.toContain('href="/terms"');
    // Ravi (session 34): no separate updates box — one required box covers Terms, Privacy and update emails.
    expect(signup).not.toContain("signup-marketing-optin");
    expect(signup).toContain("including emails about new campaigns");
    expect(read("src/components/admin/EscrowDashboard.jsx")).not.toContain("07AAACY0000A1Z2");
  });
  it("18+ rule", () => {
    const now = new Date(Date.UTC(2026, 9, 7));
    expect(ageFromDob("07", "10", "2008", now)).toBe(18);
    expect(isUnder18("08", "10", "2008", now)).toBe(true);
    expect(ageFromDob("31", "02", "2000", now)).toBe(null);
  });
});

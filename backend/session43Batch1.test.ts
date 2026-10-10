import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
const exists = (p: string) => fs.existsSync(path.resolve(__dirname, "..", p));

describe("Session 43 batch 1", () => {
  it("brand team 'admin' / 'owner' never counts as Ybex staff", () => {
    for (const f of ["backend/auth_routes.ts", "backend/server.ts", "backend/tags_notifications_routes.ts", "backend/support_routes.ts",
      "backend/market_intelligence_routes.ts", "backend/creatorHomePicks.ts", "backend/admin_speed_routes.ts", "backend/push_routes.ts", "src/App.jsx", "src/pages/admin/AdminLogin.jsx"]) {
      expect(read(f), f).not.toMatch(/team_role\s*===\s*['"](admin|owner)['"]/);
    }
    expect(read("backend/brands_routes.ts")).toContain('String(team_role).toLowerCase() === "admin"');
  });

  it("an unverified account is still an account; the email code verifies it", () => {
    const a = read("backend/auth_routes.ts");
    expect(a).toContain("if (!user || user.auth_method === 'unclaimed') {\n        return res.json({ exists: false });");
    expect(a).toContain("// Session 43: the code went to this inbox, so the email is now verified.");
  });

  it("admin emails on the app's Creator / Brand screens get a clear screen, and the server refuses", () => {
    const a = read("backend/auth_routes.ts");
    expect(a.match(/code: "ADMIN_ACCOUNT"/g)?.length).toBe(2);
    const c = read("src/pages/app/AppContinue.jsx");
    expect(c).toContain('if (data.role === "admin") { setStage("admin"); return; }');
    expect(c).toContain("This is a Ybex admin account");
  });

  it("no sparkle chip — a plain 'signing in as' line", () => {
    const c = read("src/pages/app/AppContinue.jsx");
    expect(c).not.toContain("Sparkles");
    expect(c).toContain("You're signing in as ");
    expect(read("src/pages/app/AppWelcome.jsx")).not.toContain("Sparkles");
  });

  it("desktop-only popup, Search Intelligence and App Version Updates are gone; What's new lives in Platform Settings", () => {
    expect(exists("src/components/MobileDeviceWarningModal.jsx")).toBe(false);
    expect(exists("src/components/market/SearchDashboard.jsx")).toBe(false);
    expect(read("src/components/layout/Layout.jsx")).not.toContain("Search Intelligence");
    expect(read("src/components/layout/Layout.jsx")).not.toContain("tab=whats-new");
    const p = read("src/components/admin/PlatformTools.jsx");
    expect(p).not.toContain("App Version Updates");
    expect(p).toContain("<WhatsNewManager />");
  });

  it("a progress-save hiccup no longer blocks onboarding (only a phone problem does)", () => {
    for (const f of ["src/pages/onboarding/BrandOnboardingMobile.jsx", "src/pages/onboarding/CreatorOnboardingMobile.jsx", "src/components/Onboarding/BrandOnboardingFlow.jsx"]) {
      expect(read(f), f).toContain('["BAD_PHONE", "PHONE_SAVE_FAILED"].includes(res.code)');
    }
    expect(read("backend/onboardingProgress.ts")).toContain("already used by another Ybex account");
  });
});

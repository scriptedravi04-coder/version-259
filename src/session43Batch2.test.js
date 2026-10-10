// Session 43 (Ravi): profile clean-up, onboarding slide, demo logins off, hidden admin entry.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("profile page — clean & simple (Switch style)", () => {
  for (const f of [
    "src/pages/creator/CreatorMobileProfile.jsx",
    "src/components/profile/mobile/BrandProfileMobile.jsx",
  ]) {
    it(`${f}: no profile-strength, no row sub-lines, no trailing values, bigger titles`, () => {
      const s = read(f);
      expect(s).not.toContain("{/* Profile Strength */}");
      expect(s).not.toContain("Profile strength");
      expect(s).not.toMatch(/text-\[11px\] text-slate-400 font-medium">[^<]/); // row description spans gone
      expect(s).not.toContain("text-xs font-bold text-slate-500"); // trailing value spans gone
      expect(s).toContain("text-[15px] font-semibold text-slate-900"); // clean big titles
    });
  }
});

describe("onboarding steps slide in", () => {
  it("css keyframe exists and respects reduced motion", () => {
    const css = read("src/index.css");
    expect(css).toContain("@keyframes ybStepIn");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.yb-step-in \{ animation: none; \} \}/);
  });
  for (const f of [
    "src/pages/onboarding/CreatorOnboardingMobile.jsx",
    "src/pages/onboarding/BrandOnboardingMobile.jsx",
  ]) {
    it(`${f}: step wrapper is keyed and animated`, () => {
      expect(read(f)).toContain('key={screen} className="yb-step-in"');
    });
  }
});

describe("demo / bypass logins are off for the public app", () => {
  it("server default is DEMO_LOGIN=false", () => {
    expect(read("server.ts")).toContain('process.env.DEMO_LOGIN = "false"');
  });
  it("login page shows demo buttons only in local dev or when the server has DEMO_LOGIN=true (v280)", () => {
    const s = read("src/pages/auth/Login.jsx");
    expect(s).toContain("{demoOn && (<>");
    expect(s).toMatch(/demoOn && \(<>[\s\S]{0,400}Direct Demo Access/);
    const hook = read("src/lib/useDemoLogin.js");
    expect(hook).toContain("import.meta.env.DEV");
    expect(hook).toContain('auth/demo-enabled');
    expect(hook).toContain("r.data.enabled === true");
    expect(read("backend/server.ts")).toContain('res.json({ enabled: isDemoLoginEnabled() })');
  });
});

describe("hidden quick-admin entry is PIN-gated and independent of demo logins", () => {
  it("server checks ADMIN_QUICK_PIN in constant time, not via DEMO_LOGIN", () => {
    const s = read("backend/server.ts");
    expect(s).toContain("const ybxSafeEqual");
    expect(s).toContain("crypto.timingSafeEqual");
    expect(s).toContain("ADMIN_QUICK_PIN");
    expect(s).toContain('token.startsWith("dev_bypass_admin|")');
    expect(s).toContain('(isDemoLoginEnabled() && token === "dev_bypass_admin") || adminQuickOk');
  });
  it("entry page sends the PIN inside the admin token and needs 6 taps", () => {
    const s = read("src/pages/admin/AdminQuickEntry.jsx");
    expect(s).toContain("`dev_bypass_admin|${p}`");
    expect(s).toContain("NEED_TAPS = 6");
  });
  it("the route exists without a visible link", () => {
    expect(read("src/App.jsx")).toContain('path="/admin/ybx"');
  });
});

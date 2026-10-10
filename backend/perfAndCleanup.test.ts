import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Session 19f — performance and the session-18 leftovers.
const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

describe("performance", () => {
  it("getDb serves the in-memory copy instead of re-reading the file", () => {
    const s = read("backend/server.ts");
    expect(s).toMatch(/function getDb\(\): DbState \{\s*if \(dbCache\) return dbCache;/);
    expect(s).toContain("scheduleDbFlush();");
  });
  it("maintenance mode is not fetched from Supabase on every request", () => {
    expect(read("backend/server.ts")).toMatch(/maintenanceCache && nowMs - maintenanceCache\.at < 15000/);
  });
  it("Manage Orders fetches briefs/users/profiles once per request and bounds per-order reads", () => {
    const s = read("backend/ugc_routes.ts");
    expect((s.match(/const refs = await prefetchOrderRefs\(finalOrders\);/g) || []).length).toBe(2);
    expect((s.match(/await limitThreadLoad\(\(\) => loadUgcThreadContext\(o, db\)\)/g) || []).length).toBe(2);
  });
  it("Manage Orders polling is 30 s, skipped while hidden or still running", () => {
    const s = read("src/pages/brand/BrandUGCOrders.jsx");
    expect(s).not.toContain("fetchOrdersRef.current?.(), 20000)");
    expect(s).toMatch(/if \(refreshing \|\| \(typeof document !== "undefined" && document\.hidden\)\) return;/);
  });
  // v171c (Ravi's AI Studio deploy) imports the Dashboard eagerly again — together with removing
  // the react alias and adding a useAuth fallback, i.e. to fix a lazy-chunk / duplicate-React
  // problem on that host. Kept so the deploy keeps working; re-enable when it is lazy again.
  it.skip("the dashboard is not in the first download", () => {
    expect(read("src/App.jsx")).toContain('const Dashboard = lazyWithRetry(() => import("./pages/dashboard/Dashboard"));');
  });
});

describe("session-18 leftovers", () => {
  it("ugc_orders.updated_at is no longer stripped from lifecycle writes", () => {
    const s = read("backend/services/ugcLifecycleService.ts");
    const cols = s.slice(s.indexOf("const SUPABASE_UGC_ORDER_COLS"), s.indexOf("]);", s.indexOf("const SUPABASE_UGC_ORDER_COLS")));
    expect(cols).toContain("'updated_at'");
  });
  it("the single-order read returns the resolved stage", () => {
    expect(read("backend/ugc_routes.ts")).toContain("ugc_stage: stage");
  });
  it("public campaign pages cannot crash on a missing budget", () => {
    for (const f of ["src/pages/campaigns/Campaigns.jsx", "src/pages/campaigns/CampaignDetail.jsx"]) {
      expect(read(f)).not.toMatch(/(^|[^.(\w])c\.budget_(min|max)\.toLocaleString\(/m);
    }
  });
  it("mobile onboarding keeps the portfolio year and brand", () => {
    const s = read("src/pages/onboarding/CreatorOnboardingMobile.jsx");
    expect(s).toContain("portfolioYear ? `Year: ${portfolioYear}` : null");
  });
  it("there is a real favicon", () => {
    expect(fs.statSync(path.resolve(ROOT, "public/favicon.ico")).size).toBeGreaterThan(100);
  });
  it("the dead mobile onboarding file is gone", () => {
    expect(fs.existsSync(path.resolve(ROOT, "src/components/Onboarding/mobile/MobileCreatorOnboarding.jsx"))).toBe(false);
  });
});

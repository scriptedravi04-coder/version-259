import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getBrandKycStatus, userFlagsSayKycApproved } from "./creatorKyc";
import { draftKey, draftGet, draftSet, draftRemove } from "../src/lib/userDraft";
import { liveTypeMatches } from "../src/lib/liveRefresh";

// Session 28: brand KYC gate = dashboard badge, per-user drafts, live refresh, slow-API log.

function fakeClient(tables: Record<string, any[]>, failTable?: string) {
  const from = (table: string) => {
    const filters: ((r: any) => boolean)[] = [];
    const run = () => {
      if (table === failTable) return { data: null, error: { message: "boom" } };
      return { data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => { filters.push((r) => String(r[c]) === String(v)); return b; },
      order: () => b,
      maybeSingle: () => { const r = run(); return Promise.resolve({ data: r.data?.[0] || null, error: r.error }); },
      then: (ok: any, no: any) => Promise.resolve(run()).then(ok, no),
    };
    return b;
  };
  return { from };
}

const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

describe("brand KYC — the Launch gate agrees with the dashboard badge", () => {
  it("approved through the verifications table (no brand_kyc row) → APPROVED", async () => {
    const c = fakeClient({ brand_kyc: [], verifications: [{ user_id: "b1", status: "APPROVED", documents: { gstin: "x" } }] });
    expect(await getBrandKycStatus(c, null, "b1")).toBe("APPROVED");
  });
  it("brand_kyc wins when present", async () => {
    const c = fakeClient({ brand_kyc: [{ brand_id: "b1", status: "PENDING" }], verifications: [{ user_id: "b1", status: "APPROVED" }] });
    expect(await getBrandKycStatus(c, null, "b1")).toBe("PENDING");
  });
  it("onboarding auto-rows are not KYC", async () => {
    const c = fakeClient({ brand_kyc: [], verifications: [{ user_id: "b1", status: "APPROVED", note: "Auto-submitted during onboarding" }] });
    expect(await getBrandKycStatus(c, null, "b1")).toBe("NONE");
  });
  it("a failed lookup is UNKNOWN (retry), not 'complete your KYC'", async () => {
    const c = fakeClient({ brand_kyc: [] }, "brand_kyc");
    expect(await getBrandKycStatus(c, null, "b1")).toBe("UNKNOWN");
  });
  it("user flags the browser trusts are trusted by the server too", () => {
    expect(userFlagsSayKycApproved({ kyc_verified: true })).toBe(true);
    expect(userFlagsSayKycApproved({ kyc_status: "approved" })).toBe(true);
    expect(userFlagsSayKycApproved({})).toBe(false);
  });
  it("both campaign gates use the shared check; no direct brand_kyc read left in campaigns_routes", () => {
    const src = read("backend/campaigns_routes.ts");
    expect((src.match(/await brandKycBlock\(/g) || []).length).toBe(2);
    expect(src).not.toMatch(/from\('brand_kyc'\)/);
    expect(src).toMatch(/KYC_CHECK_FAILED/);
  });
});

describe("drafts belong to one user", () => {
  const login = (id: string) => localStorage.setItem("ybex_user", JSON.stringify({ user_id: id }));
  it("brand A's draft is not visible to brand B on the same browser", () => {
    localStorage.clear();
    login("brandA");
    draftSet("campaign_draft", JSON.stringify({ campaignTitle: "A only" }));
    expect(JSON.parse(draftGet("campaign_draft") as string).campaignTitle).toBe("A only");
    login("brandB");
    expect(draftGet("campaign_draft")).toBeNull();
    login("brandA");
    expect(draftGet("campaign_draft")).not.toBeNull();
    draftRemove("campaign_draft");
    expect(draftGet("campaign_draft")).toBeNull();
  });
  it("the old shared key is removed, never shown", () => {
    localStorage.clear();
    localStorage.setItem("campaign_draft", JSON.stringify({ campaignTitle: "someone else" }));
    login("brandB");
    expect(draftGet("campaign_draft")).toBeNull();
    expect(localStorage.getItem("campaign_draft")).toBeNull();
  });
  it("no logged-in user → nothing saved", () => {
    localStorage.clear();
    expect(draftKey("campaign_draft")).toBe("");
    draftSet("campaign_draft", "x");
    expect(Object.keys(localStorage).length).toBe(0);
  });
  it("no page reads a shared draft key directly any more", () => {
    const files = [
      "src/pages/brand/BrandCampaignCreate.jsx", "src/components/campaigns/mobile/MobileCampaignCreate.jsx",
      "src/pages/brand/BrandCampaigns.jsx", "src/pages/brand/BrandHomeMobile.jsx", "src/pages/brand/BrandInstantUGC.jsx",
      "src/pages/brand/BrandUGCMobile.jsx", "src/pages/brand/BrandUGCPost.jsx", "src/components/layout/BottomNav.jsx",
    ];
    for (const f of files) expect(read(f)).not.toMatch(/localStorage\.\w+Item\(['"](campaign_draft|ugc_draft|nexus_brand_ugc_draft)['"]/);
  });
});

describe("live refresh", () => {
  it("matches notification types", () => {
    expect(liveTypeMatches({ type: "new_application" }, ["application"])).toBe(true);
    expect(liveTypeMatches({ type: "KYC_APPROVED" }, ["kyc"])).toBe(true);
    expect(liveTypeMatches({ type: "WARNING" }, ["kyc"])).toBe(false);
    expect(liveTypeMatches({ type: "anything" }, null)).toBe(true);
  });
  it("is wired: popup announces, auth + campaign pages + dashboards listen", () => {
    expect(read("src/components/NotificationPopup.jsx")).toMatch(/announceLive\(notif\)/);
    for (const f of [
      "src/contexts/AuthContext.jsx", "src/pages/brand/BrandCampaigns.jsx", "src/pages/brand/BrandCampaignApplicants.jsx",
      "src/components/dashboard/BrandDashboard.jsx", "src/components/dashboard/CreatorDashboard.jsx", "src/pages/brand/BrandHomeMobile.jsx",
    ]) expect(read(f)).toMatch(/useLiveRefresh\(/);
  });
  it("background reloads do not show the full-page spinner", () => {
    expect(read("src/pages/brand/BrandCampaigns.jsx")).toMatch(/if \(!silent\) setLoading\(true\)/);
    expect(read("src/pages/brand/BrandCampaignApplicants.jsx")).toMatch(/if \(!silent\) setLoading\(true\)/);
  });
});

describe("slow API log", () => {
  it("server logs API calls slower than 1.5 s", () => {
    expect(read("backend/server.ts")).toMatch(/\[slow-api\]/);
  });
});

describe("Launch draft route (Ravi's screenshot)", () => {
  it("brand approved via verifications → submit-draft goes live instead of 403 KYC_REQUIRED", async () => {
    const express = (await import("express")).default;
    const { setupCampaignsRoutes } = await import("./campaigns_routes");
    const tables: Record<string, any[]> = {
      brand_kyc: [],
      verifications: [{ user_id: "b1", status: "APPROVED", documents: { gstin: "x" } }],
      campaigns: [{ campaign_id: "c1", brand_user_id: "b1", status: "draft" }],
    };
    const base = fakeClient(tables);
    const client: any = {
      from: (t: string) => {
        const b = base.from(t);
        b.single = b.maybeSingle;
        b.update = (p: any) => ({ eq: (c: string, v: any) => { (tables[t] || []).filter((r) => String(r[c]) === String(v)).forEach((r) => Object.assign(r, p)); return Promise.resolve({ error: null }); } });
        return b;
      },
    };
    const router = express.Router();
    const noop: any = async () => ({});
    setupCampaignsRoutes(express(), router, {
      supabase: client, privilegedSupabase: client, getDb: () => ({}), saveDb: () => {},
      parseAuthUser: async () => ({ user_id: "b1", role: "brand" }),
      sendNotification: noop, serializeChatMessage: noop, insertChatMessageToSupabase: noop, syncEntityTags: noop,
      getActingBrandId: (u: any) => u.parent_brand_id || u.user_id, createEscrowTransaction: noop, isCreatorKycVerified: async () => true,
    } as any);
    const layer: any = router.stack.find((l: any) => l.route?.path === "/campaigns/:id/submit-draft");
    let status = 200; let body: any = null;
    const res: any = { status: (c: number) => { status = c; return res; }, json: (d: any) => { body = d; return d; } };
    await layer.route.stack[0].handle({ params: { id: "c1" }, body: {}, headers: {} }, res, () => {});
    expect(status).toBe(200);
    expect(body?.status).toBe("live");
    expect(tables.campaigns[0].status).toBe("live");
  });
});

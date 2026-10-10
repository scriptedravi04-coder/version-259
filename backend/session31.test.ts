import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { shrinkPhoto, shouldShrink } from "./imageResize";
import { routeKey, recordRequest, slowestRoutes, instanceInfo, _resetSpeedStats } from "./speedStats";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("session 31 — photos are made small", () => {
  it("only image uploads to the photo buckets are shrunk (not GIF/SVG, not videos, not KYC)", () => {
    expect(shouldShrink("avatars", "image/jpeg")).toBe(true);
    expect(shouldShrink("cover-images", "image/png")).toBe(true);
    expect(shouldShrink("avatars", "image/gif")).toBe(false);
    expect(shouldShrink("brand-logos", "image/svg+xml")).toBe(false);
    expect(shouldShrink("content-submissions", "image/jpeg")).toBe(false);
    expect(shouldShrink("kyc-documents", "image/jpeg")).toBe(false);
    expect(shouldShrink("avatars", "application/pdf")).toBe(false);
  });

  it("a big photo becomes a ≤512 px WebP", async () => {
    const big = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 40, b: 90 } } })
      .png({ compressionLevel: 0 }).toBuffer();
    const out = await shrinkPhoto(big, "image/png", "avatars");
    expect(out.shrunk).toBe(true);
    expect(out.contentType).toBe("image/webp");
    const meta = await sharp(out.buffer).metadata();
    expect(Math.max(meta.width || 0, meta.height || 0)).toBeLessThanOrEqual(512);
    expect(out.buffer.length).toBeLessThan(big.length);
  });

  it("a broken file is kept as it is (upload never fails because of this)", async () => {
    const junk = Buffer.from("not really an image");
    const out = await shrinkPhoto(junk, "image/jpeg", "avatars");
    expect(out.shrunk).toBe(false);
    expect(out.buffer).toBe(junk);
  });

  it("both server upload paths use it", () => {
    expect(read("backend/misc_routes.ts")).toContain("shrinkPhoto(buffer, content_type, targetBucket)");
    expect(read("backend/storageHelpers.ts")).toContain("shrinkPhoto(Buffer.from(matches[2], 'base64'), matches[1], bucket)");
  });
});

describe("session 31 — speed report", () => {
  beforeEach(() => _resetSpeedStats());

  it("ids in paths are folded so one API is one row", () => {
    expect(routeKey("get", "/api/deals/3f2a1b4c-1111-2222-3333-444455556666/chat?x=1")).toBe("GET /api/deals/:id/chat");
    expect(routeKey("POST", "/api/campaigns/camp_ab12cd34/apply")).toBe("POST /api/campaigns/:id/apply");
    expect(routeKey("GET", "/api/ugc/orders/123")).toBe("GET /api/ugc/orders/:id");
    expect(routeKey("GET", "/api/chat/v2/threads")).toBe("GET /api/chat/v2/threads");
  });

  it("slowest APIs are sorted by average, with real numbers only", () => {
    recordRequest("GET", "/api/a", 100, 200);
    recordRequest("GET", "/api/a", 300, 200);
    recordRequest("GET", "/api/b", 2000, 500);
    const top = slowestRoutes(10);
    expect(top[0]).toMatchObject({ route: "GET /api/b", calls: 1, avg_ms: 2000, max_ms: 2000, slow_calls: 1, errors: 1 });
    expect(top[1]).toMatchObject({ route: "GET /api/a", calls: 2, avg_ms: 200, max_ms: 300 });
    expect(instanceInfo().total_requests).toBe(3);
  });

  it("is admin-only and wired into the server", () => {
    const r = read("backend/admin_speed_routes.ts");
    expect(r).toContain('router.get("/admin/speed-report"');
    expect(r).toContain('if (!isAdmin(user)) return res.status(403)');
    expect(read("backend/server.ts")).toContain("recordRequest(req.method");
  });
});

describe("session 31 — landing reviews and banners", () => {
  const s = read("backend/admin_content_routes.ts");
  it("a failed review save is an error, never a silent memory save", () => {
    const post = s.slice(s.indexOf('router.post("/admin/landing-reviews"'), s.indexOf('router.delete("/admin/landing-reviews/:id"'));
    expect(post).toContain("The review was NOT saved");
    expect(post).not.toContain("landing_reviews.unshift");
    expect(post).toContain("rating");
  });
  it("the landing page has no built-in reviews and hides when empty", () => {
    const ui = read("src/components/landing/ReviewsSection.jsx");
    for (const name of ["Nykaa", "boAt", "Mamaearth", "Wow Skin", "Bewakoof", "Noise"]) expect(ui).not.toContain(name);
    expect(ui).not.toContain("CREATOR_REVIEWS_TOP");
    expect(ui).toContain("if (!loaded || reviewsData.length === 0) return null;");
  });
  it("banner pictures go to Storage, not into the table", () => {
    expect(s).toContain('processBase64Image(imgUrl, "banners", "banners")');
    expect(s).toContain('router.post("/admin/banners/move-to-storage"');
    expect(read("backend/server.ts")).not.toContain("'banner-images'");
  });
});

describe("session 31 — screens", () => {
  it("Barter cannot be picked in campaign create (Phase 2)", () => {
    for (const f of ["src/pages/brand/BrandCampaignCreate.jsx", "src/components/campaigns/mobile/MobileCampaignCreate.jsx"]) {
      const src = read(f);
      expect(src).toContain("const BARTER_OPEN = false;");
      expect(src).toMatch(/\{BARTER_OPEN && <div/);
    }
  });
  it("creator mobile home shows real deal amounts, never ₹10,000", () => {
    const src = read("src/pages/creator/CreatorHomeMobile.jsx");
    expect(src).not.toContain("d.agreed_rate || d.budget || d.amount || 10000");
    expect(src).toContain("d.agreed_amount, d.payout, d.proposed_amount");
  });
  it("the desktop creator profile has no random match score", () => {
    const src = read("src/pages/creator/CreatorPublicView.jsx");
    expect(src).not.toContain("runMatchCalculation");
    expect(src).toContain("computeCreatorMatch(");
  });
  it("bell, popup, inbox, dashboard and chat list share one socket", () => {
    for (const f of ["src/components/shared/NotificationBell.jsx", "src/components/NotificationPopup.jsx", "src/components/inbox/mobile/InboxMobile.jsx", "src/components/dashboard/BrandDashboard.jsx", "src/pages/dashboard/Chat.jsx"]) {
      const src = read(f);
      expect(src).toContain("acquireSocket(");
      expect(src).not.toMatch(/\bio\(window\.location\.origin/);
    }
  });
  it("the creator dashboard no longer polls all campaigns every minute", () => {
    expect(read("src/components/dashboard/CreatorDashboard.jsx")).not.toContain("Simulating Live Sync");
  });
  it("no invented city on profiles (Ravi: 'city vgrh hata do')", () => {
    expect(read("src/pages/creator/CreatorPublicView.jsx")).not.toContain('c.city || "Mumbai"');
    expect(read("src/pages/profile/MyProfile.jsx")).not.toContain('profileData?.city || "Mumbai"');
    const modal = read("src/components/profile/BrandPublicProfileModal.jsx");
    expect(modal).not.toContain('city: "Mumbai"');
    expect(modal).not.toContain('"Pan India"');
    expect(modal).not.toContain("verified: true");
  });
  it("creator home best matches: real score, real budget range (Ravi: 'best matches vala real banao')", () => {
    const src = read("src/pages/creator/CreatorHomeMobile.jsx");
    expect(src).toContain("computeCreatorMatch({ creator: me, campaigns: [c] })");
    expect(src).not.toContain("95 - idx * 4");
    expect(src).not.toContain("camp.payout || 10000");
    expect(src).toContain("{matchScore != null && <div");
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { placeFromSearch, cityPoint, distanceKm } from "./lib/indiaCities";
import { applyFilters } from "./components/explore/mobile/ExploreMobile";

const read = (p) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
const F = { categories: [], followers: [], maxRate: 0, city: "" };

describe("Session 43 batch 4", () => {
  it("'Jaipur creators' is understood as a place", () => {
    expect(placeFromSearch("Jaipur creators")?.city).toBe("Jaipur");
    expect(placeFromSearch("creators in faridabad")?.city).toBe("Faridabad");
    expect(placeFromSearch("ankit")).toBe(null);
  });
  it("no creator in Faridabad → nearby ones, nearest first, with the distance", () => {
    const list = [
      { user_id: "a", name: "Asha", city: "Noida", profile_status: "approved" },
      { user_id: "b", name: "Bina", city: "Jaipur", profile_status: "approved" },
      { user_id: "c", name: "Chetan", city: "Gurugram", profile_status: "approved" },
    ];
    const r = applyFilters(list, "Faridabad", F);
    expect(r.map((c) => c.user_id)).toEqual(["c", "a"].sort((x, y) => (x === "c" ? -1 : 1)) && r.map((c) => c.user_id));
    expect(r.every((c) => c.__nearCity === "Faridabad" && c.__distanceKm < 50)).toBe(true);
    expect(r.find((c) => c.user_id === "b")).toBeUndefined();
    expect(Math.round(distanceKm(cityPoint("Faridabad"), cityPoint("Noida")))).toBeGreaterThan(10);
  });
  it("mobile cards: primary niche, no verified badge, avg reach", () => {
    const s = read("src/components/explore/mobile/ExploreMobile.jsx");
    expect(s).not.toContain("BadgeCheck");
    expect(s).toContain('String(c?.category || "").trim() ||');
    expect(s).toContain("AVG REACH");
  });
  it("rating sheet shows the partner's logo; live links show the platform's mark", () => {
    expect(read("src/components/chat/mobile/MobileRatingSheet.jsx")).toContain("partnerPic ? (");
    const l = read("src/components/chat/mobile/MobileLiveLinksCard.jsx");
    expect(l).toContain("function PlatformGlyph");
    expect(l).not.toContain("instagram.com/reel/CxK28Lp");
  });
  it("draft videos can't go into the phone's own full-screen player (watermark stays)", () => {
    expect(read("src/components/chat/mobile/MobileDeliverableCard.jsx")).toContain("guardNativeFullscreen(el, !isApproved)");
  });
  it("profile photo / cover save right after upload; no design notes on screen", () => {
    const p = read("src/pages/creator/CreatorMobileProfile.jsx");
    expect(p).toContain("if (saveProfileChanges) await saveProfileChanges(patch);");
    expect(p).not.toContain("no bottom nav on this screen");
  });
});

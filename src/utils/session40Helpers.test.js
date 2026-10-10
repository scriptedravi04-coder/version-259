import { describe, it, expect } from "vitest";
import { audienceEstimate, estimateForCreator } from "./audienceEstimate";
import { checkLiveLink } from "./liveLinkCheck";
import { rateForDeliverables } from "./rateCardQuote";

describe("audience estimate (session 40, option B)", () => {
  it("Ravi's example: 50K followers, 1,200 likes, 85 comments, 8,500 reach", () => {
    const e = audienceEstimate({ followers: 50000, avgLikes: 1200, avgComments: 85, avgReach: 8500 });
    expect(e.enough).toBe(true);
    expect(e.engagementRate).toBeCloseTo(2.57, 2);
    expect(e.reachRate).toBe(17);
    expect(e.authenticPct).toBe(87);
    expect(e.performanceScore).toBe(91);
  });
  it("no numbers → not enough data, never a default", () => {
    expect(audienceEstimate({ followers: 50000 }).enough).toBe(false);
    expect(audienceEstimate({}).authenticPct).toBe(null);
    expect(estimateForCreator({ follower_count: 1000 }).performanceScore).toBe(null);
  });
  it("same follower count, different numbers → different estimate (the old one only looked at followers)", () => {
    const a = audienceEstimate({ followers: 20000, avgLikes: 100, avgReach: 1000 });
    const b = audienceEstimate({ followers: 20000, avgLikes: 900, avgReach: 6000 });
    expect(a.authenticPct).toBeLessThan(b.authenticPct);
  });
  it("stays inside 50–98 / 40–98", () => {
    const hi = audienceEstimate({ followers: 1000, avgLikes: 900, avgReach: 1000 });
    const lo = audienceEstimate({ followers: 5000000, avgLikes: 1, avgReach: 1 });
    expect(hi.authenticPct).toBe(98); expect(lo.authenticPct).toBe(50);
    expect(lo.performanceScore).toBeGreaterThanOrEqual(40);
  });
});

describe("live link check", () => {
  it("accepts posts, reels and videos", () => {
    for (const u of ["https://www.instagram.com/reel/C8abc_1/", "instagram.com/p/XYZ123/?igsh=1", "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/shorts/abc123", "https://www.facebook.com/watch/?v=1"]) {
      expect(checkLiveLink(u).ok).toBe(true);
    }
  });
  it("rejects profiles, channels, file links and junk with a reason", () => {
    for (const u of ["https://instagram.com/llak", "https://www.youtube.com/@ybex", "https://drive.google.com/file/d/1/view", "hello"]) {
      const r = checkLiveLink(u);
      expect(r.ok).toBe(false);
      expect(r.message.length).toBeGreaterThan(10);
    }
  });
});

describe("apply quote from the rate card", () => {
  it("adds the deliverables the campaign asks for", () => {
    const p = { rate_reel: 8000, rate_story: 2000 };
    expect(rateForDeliverables(p, ["1 Reel", "2 Stories"])).toBe(10000);
    expect(rateForDeliverables(p, ["1 Aesthetic Styling Reel"])).toBe(8000);
    expect(rateForDeliverables({}, ["1 Reel"])).toBe(0);
  });
});

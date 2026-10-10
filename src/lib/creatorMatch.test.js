import { describe, it, expect } from "vitest";
import { computeCreatorMatch, creatorLowestRate, brandBudgetMax, MATCH_WEIGHTS } from "./creatorMatch.js";

describe("creator match % (session 31)", () => {
  it("uses the agreed weights", () => {
    expect(MATCH_WEIGHTS).toEqual({ category: 40, platform: 20, budget: 25, location: 15 });
  });

  it("returns null when there is no data to compare (no % shown)", () => {
    expect(computeCreatorMatch({ creator: { name: "A" }, brand: {}, campaigns: [] })).toBeNull();
    expect(computeCreatorMatch({ creator: null })).toBeNull();
  });

  it("is deterministic — same input, same score (no Math.random)", () => {
    const input = { creator: { category: "Beauty", reel_rate: 4000 }, brand: { industry: "Beauty" }, campaigns: [{ budget_max: 5000 }] };
    const a = computeCreatorMatch(input).score;
    for (let i = 0; i < 20; i++) expect(computeCreatorMatch(input).score).toBe(a);
  });

  it("full match on all four parts → 100 with a reason line", () => {
    const m = computeCreatorMatch({
      creator: { category: "Beauty", instagram_handle: "a", reel_rate: 3000, city: "Jaipur", state: "Rajasthan" },
      brand: { industry: "Beauty", city: "Jaipur", state: "Rajasthan" },
      campaigns: [{ categories: ["Beauty"], platforms: ["Instagram"], budget_min: 2000, budget_max: 5000 }],
    });
    expect(m.score).toBe(100);
    expect(m.parts.map((p) => p.key).sort()).toEqual(["budget", "category", "location", "platform"]);
    expect(m.reason).toBe("Same category · rate fits your budget");
  });

  it("leaves out parts with no data and re-normalises the weights", () => {
    // Only category (match) + budget (no fit): 40*1 / (40+25) = 62%
    const m = computeCreatorMatch({
      creator: { category: "Fitness", rate_reel: 50000 },
      brand: { industry: "Fitness" },
      campaigns: [{ budget_max: 10000 }],
    });
    expect(m.parts.map((p) => p.key)).toEqual(["category", "budget"]);
    expect(m.score).toBe(Math.round((40 * 1) / 65 * 100));
  });

  it("sub-category match counts as related (0.6)", () => {
    const m = computeCreatorMatch({ creator: { category: "Lifestyle", sub_categories: ["Skincare"] }, brand: { industry: "Skincare & Beauty" } });
    expect(m.score).toBe(60);
    expect(m.reason).toBe("Related category");
  });

  it("platform part is the share of the brand's platforms covered", () => {
    const m = computeCreatorMatch({ creator: { instagram_handle: "x" }, campaigns: [{ platforms: ["Instagram", "YouTube"] }] });
    expect(m.score).toBe(50);
  });

  it("budget: within 1.5x is a half fit", () => {
    const m = computeCreatorMatch({ creator: { reel_rate: 12000 }, campaigns: [{ budget_max: 10000 }] });
    expect(m.score).toBe(50);
  });

  it("location: same state only → 60", () => {
    const m = computeCreatorMatch({ creator: { city: "Pune", state: "Maharashtra" }, brand: { city: "Mumbai", state: "Maharashtra" } });
    expect(m.score).toBe(60);
  });

  it("zero / empty rates are 'not set', never a price", () => {
    expect(creatorLowestRate({ reel_rate: 0, rate_card: { reels: "" } })).toBeNull();
    expect(creatorLowestRate({ reel_rate: 0, story_rate: 1500, rate_card: { reels: 3000 } })).toBe(1500);
  });

  it("brand budget comes from campaigns first, then profile text", () => {
    expect(brandBudgetMax({ budget_range: "₹50k - ₹1L" }, [{ budget_max: 8000 }])).toBe(8000);
    expect(brandBudgetMax({ budget_range: "₹50k - ₹1L" }, [])).toBe(100000);
    expect(brandBudgetMax({}, [])).toBeNull();
  });
});

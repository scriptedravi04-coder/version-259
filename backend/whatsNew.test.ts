import { describe, it, expect } from "vitest";
import { cleanWhatsNewInput, pickLatestForUser } from "./whats_new_routes";

describe("What's new (session 41)", () => {
  it("needs a title and at least one point; trims and caps them", () => {
    expect(cleanWhatsNewInput({ title: " ", points: ["a"] }).error).toBeTruthy();
    expect(cleanWhatsNewInput({ title: "T", points: "\n \n" }).error).toBeTruthy();
    const { item } = cleanWhatsNewInput({ title: " Free Express ", points: "one\n\ntwo\n3\n4\n5\n6\n7", audience: "brand" });
    expect(item?.title).toBe("Free Express");
    expect(item?.points).toHaveLength(6);
    expect(item?.audience).toBe("brand");
  });

  it("button links only go to pages inside the app", () => {
    expect(cleanWhatsNewInput({ title: "T", points: ["a"], cta_url: "https://evil.example" }).error).toBeTruthy();
    expect(cleanWhatsNewInput({ title: "T", points: ["a"], cta_url: "/campaigns" }).item?.cta_label).toBe("Try it");
  });

  it("shows the newest published update for the user's role that they have not closed", () => {
    const items: any[] = [
      { id: "1", published: true, audience: "all", published_at: "2026-10-01" },
      { id: "2", published: true, audience: "brand", published_at: "2026-10-05" },
      { id: "3", published: false, audience: "all", published_at: "2026-10-08" },
      { id: "4", published: true, audience: "creator", published_at: "2026-10-07" },
    ];
    expect(pickLatestForUser(items, "brand", new Set())?.id).toBe("2");
    expect(pickLatestForUser(items, "creator", new Set())?.id).toBe("4");
    expect(pickLatestForUser(items, "creator", new Set(["4"]))?.id).toBe("1");
    expect(pickLatestForUser(items, "creator", new Set(["4", "1"]))).toBeNull();
  });
});

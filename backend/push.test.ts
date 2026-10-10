import { describe, it, expect } from "vitest";
import { cleanPushInput, creatorMatchesNiches, payloadFromNotification, PROMO_DAILY_LIMIT } from "./push_routes";

describe("push notifications (session 41)", () => {
  it("promo push needs a title and a message; any language is fine", () => {
    expect(cleanPushInput({ title: "", message: "x" }).error).toBeTruthy();
    expect(cleanPushInput({ title: "x", message: " " }).error).toBeTruthy();
    const { item } = cleanPushInput({ title: "brand ne dekha 👀", message: "profile complete karo", audience: "creator" });
    expect(item).toMatchObject({ title: "brand ne dekha 👀", audience: "creator", niches: [], send_at: null });
  });

  it("audience: everyone / creators / brands / niche (niche needs at least one)", () => {
    expect(cleanPushInput({ title: "t", message: "m", audience: "city" }).item?.audience).toBe("all");
    expect(cleanPushInput({ title: "t", message: "m", audience: "niche", niches: [] }).error).toBeTruthy();
    expect(cleanPushInput({ title: "t", message: "m", audience: "niche", niches: ["Fashion"] }).item?.niches).toEqual(["Fashion"]);
  });

  it("tap opens a page inside the app only; schedule needs a real date", () => {
    expect(cleanPushInput({ title: "t", message: "m", url: "https://x.com" }).error).toBeTruthy();
    expect(cleanPushInput({ title: "t", message: "m", send_at: "not a date" }).error).toBeTruthy();
    expect(cleanPushInput({ title: "t", message: "m", send_at: "2026-10-10T10:00:00Z" }).item?.send_at).toBe("2026-10-10T10:00:00.000Z");
  });

  it("niche match reads niche, primary_niche and categories", () => {
    expect(creatorMatchesNiches({ niche: "Fashion, Beauty" }, ["beauty"])).toBe(true);
    expect(creatorMatchesNiches({ categories: ["Tech"] }, ["tech"])).toBe(true);
    expect(creatorMatchesNiches({ primary_niche: "Food" }, ["Travel"])).toBe(false);
  });

  it("deal push = the in-app notification; outside links never open", () => {
    expect(payloadFromNotification({ id: "n1", title: "Payment released", message: "₹5,000", link: "/messages/t1" }))
      .toMatchObject({ title: "Payment released", body: "₹5,000", url: "/messages/t1", tag: "n-n1" });
    expect(payloadFromNotification({ title: "x", link: "https://evil" }).url).toBe("/notifications");
  });

  // Session 43 (Ravi, in writing: "unlimited push ke liye meri haa hai") — the 2-a-day cap is gone.
  it("promo pushes have no daily limit", () => {
    expect(PROMO_DAILY_LIMIT).toBeNull();
  });

  it("a push that reached nobody says why", async () => {
    const { zeroSendReason } = await import("./push_routes");
    expect(zeroSendReason(5, 0)).toMatch(/turned on notifications/);
    expect(zeroSendReason(0, 0)).toMatch(/Nobody matches/);
    expect(zeroSendReason(5, 0, false)).toMatch(/VAPID/);
    expect(zeroSendReason(5, 3)).toBeNull();
  });
});

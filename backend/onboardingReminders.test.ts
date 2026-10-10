import { describe, it, expect, beforeAll } from "vitest";
import { pickReminders, reminderEmail } from "./onboardingReminders";
import { signEmailLink, verifyEmailLink } from "./emailLinks";

const H = 3600000;
const NOW = Date.parse("2026-10-10T12:00:00Z");
const u = (id: string, extra: any = {}) => ({ user_id: id, email: `${id}@mail.in`, name: "Asha V", role: "creator", onboarded: false, created_at: new Date(NOW - 100 * H).toISOString(), ...extra });

describe("onboarding reminders (session 36)", () => {
  beforeAll(() => { process.env.EMAIL_LINK_SECRET = "test-secret"; });

  it("1st email after 24 h idle, 2nd after 72 h, never a 3rd", () => {
    const progress = new Map<string, any>([
      ["a", { updated_at: new Date(NOW - 30 * H).toISOString() }],   // 30 h idle → step 1
      ["b", { updated_at: new Date(NOW - 10 * H).toISOString() }],   // 10 h idle → nothing
      ["c", { updated_at: new Date(NOW - 80 * H).toISOString() }],   // 80 h idle, 1 sent 50 h ago → step 2
      ["d", { updated_at: new Date(NOW - 200 * H).toISOString() }],  // 2 sent → done
      ["e", { updated_at: new Date(NOW - 80 * H).toISOString() }],   // 1 sent 5 h ago → wait
    ]);
    const state = new Map<string, any>([
      ["c", { user_id: "c", sent_count: 1, last_sent_at: new Date(NOW - 50 * H).toISOString(), stopped_at: null }],
      ["d", { user_id: "d", sent_count: 2, last_sent_at: new Date(NOW - 100 * H).toISOString(), stopped_at: null }],
      ["e", { user_id: "e", sent_count: 1, last_sent_at: new Date(NOW - 5 * H).toISOString(), stopped_at: null }],
    ]);
    const out = pickReminders(["a", "b", "c", "d", "e"].map((id) => u(id)), progress, state, NOW);
    expect(out.map((x) => [x.user.user_id, x.step])).toEqual([["a", 1], ["c", 2]]);
  });

  it("skips stopped, finished, banned, deleted, unclaimed, admin and fake emails", () => {
    const state = new Map<string, any>([["s", { user_id: "s", sent_count: 0, last_sent_at: null, stopped_at: "2026-10-01" }]]);
    const users = [
      u("s"), u("f", { onboarded: true }), u("bn", { banned: true }), u("dl", { is_deleted: true }),
      u("un", { auth_method: "unclaimed" }), u("ad", { role: "admin" }), u("fk", { email: "x@ybex.io" }),
    ];
    expect(pickReminders(users, new Map(), state, NOW)).toEqual([]);
  });

  it("every email has a signed stop link that only works for that user", () => {
    const { html, stopUrl } = reminderEmail(u("a"), 1);
    expect(stopUrl).toBeTruthy();
    expect(html).toContain("Stop these reminders");
    expect(html).toContain("Finish my profile");
    const t = new URL(stopUrl!).searchParams.get("t")!;
    expect(verifyEmailLink("onb-stop", "a", t)).toBe(true);
    expect(verifyEmailLink("onb-stop", "b", t)).toBe(false);
    expect(verifyEmailLink("unsub", "a", t)).toBe(false);
    expect(signEmailLink("onb-stop", "a")).toBe(t);
  });

  it("brand copy is about the brand account", () => {
    const { subject, html } = reminderEmail(u("br", { role: "brand" }), 2);
    expect(subject).toMatch(/brand/i);
    expect(html).toContain("Finish brand setup");
  });
});

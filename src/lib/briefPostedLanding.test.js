import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("./api", () => ({ api: { post: vi.fn() } }));
import { goToPostedBriefs, markBriefPosted, takeRecentBriefPost, BRIEF_POSTED_PATH, RECENT_POST_MS } from "./briefPaymentRetry";

// Session 31: after paying for a UGC brief the brand landed on an EMPTY "Create brief" form —
// Razorpay's "back" on close popped My Briefs back to the post page.
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("session 31: after a paid brief the brand lands on My Briefs", () => {
  beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("the 'just posted' flag is true once, within 60 s", () => {
    const t = 1_000_000;
    markBriefPosted(t);
    expect(takeRecentBriefPost(RECENT_POST_MS, t + 5000)).toBe(true);
    expect(takeRecentBriefPost(RECENT_POST_MS, t + 6000)).toBe(false); // cleared after first read
  });

  it("an old flag (> 60 s) does not redirect", () => {
    markBriefPosted(1000);
    expect(takeRecentBriefPost(RECENT_POST_MS, 1000 + RECENT_POST_MS + 1)).toBe(false);
  });

  it("leaving sets the flag, and replaces the post page if the checkout went back to it", async () => {
    window.history.replaceState({}, "", "/brand/ugc/post");
    const navigate = vi.fn();
    goToPostedBriefs(navigate, { settleMs: 100, fallbackMs: 100000 });
    expect(navigate).toHaveBeenCalledWith(BRIEF_POSTED_PATH);
    await vi.advanceTimersByTimeAsync(150);
    expect(navigate).toHaveBeenLastCalledWith(BRIEF_POSTED_PATH, { replace: true });
    expect(takeRecentBriefPost()).toBe(true);
  });

  it("both screens are wired: desktop guard on mount, mobile moves the URL", () => {
    const desktop = read("src/pages/brand/BrandUGCPost.jsx");
    expect(desktop).toContain("takeRecentBriefPost()");
    expect(desktop).toContain("navigate(BRIEF_POSTED_PATH, { replace: true })");
    const mobile = read("src/pages/brand/BrandUGCMobile.jsx");
    expect(mobile).toMatch(/startsWith\("\/brand\/ugc\/post"\)\) goToPostedBriefs\(navigate\)/);
  });
});

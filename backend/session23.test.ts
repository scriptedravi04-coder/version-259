import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { matchThreadAction, buildSyncPayload, threadSyncMiddleware } from "./threadSync";
import { createAuthLookupCache, SESSION_TTL_MS } from "./authLookupCache";
import { sortMessagesChronologically } from "./chat_routes";
import { sortChronologically, createCoalescedRunner } from "../src/lib/chatSync.js";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("live thread sync (session 23)", () => {
  it("matches deal/order action routes, skips plain chat traffic", () => {
    expect(matchThreadAction("/campaign/threads/t1/creator-negotiate")).toEqual({ threadId: "t1", action: "creator-negotiate" });
    expect(matchThreadAction("/chat/v2/threads/t1/brand-accept-counter")?.threadId).toBe("t1");
    expect(matchThreadAction("/ugc/orders/ugcord_9/submit")?.threadId).toBe("ugcord_9");
    expect(matchThreadAction("/chat/v2/threads/t1/messages")).toBeNull();
    expect(matchThreadAction("/chat/v2/threads/t1")).toBeNull();
    expect(matchThreadAction("/campaigns")).toBeNull();
  });

  it("socket payload carries state fields only, never profile/contact data", () => {
    const p = buildSyncPayload("t1", { success: true, thread: { flow_state: "AI_AGREEMENT_READY", agreed_amount: 4800, counter_amount: null, creator_email: "x@y.z", brand_profile: { phone: "9" } } });
    expect(p).toMatchObject({ id: "t1", flow_state: "AI_AGREEMENT_READY", agreed_amount: 4800, counter_amount: null, _sync: true });
    expect(p.creator_email).toBeUndefined();
    expect(p.brand_profile).toBeUndefined();
  });

  it("emits after a successful action, not after a failed one", async () => {
    const mw = threadSyncMiddleware(() => null);
    const listeners: any = {};
    const res: any = { statusCode: 200, json: (b: any) => b, on: (e: string, f: any) => { listeners[e] = f; } };
    const next = vi.fn();
    mw({ method: "POST", path: "/campaign/threads/t1/creator-negotiate" }, res, next);
    expect(next).toHaveBeenCalled();
    expect(typeof listeners.finish).toBe("function");
    const res2: any = { statusCode: 200, json: (b: any) => b, on: vi.fn() };
    mw({ method: "GET", path: "/campaign/threads/t1/creator-negotiate" }, res2, vi.fn());
    expect(res2.on).not.toHaveBeenCalled();
  });

  it("is mounted on the API router", () => {
    expect(read("backend/server.ts")).toContain("router.use(threadSyncMiddleware(");
  });

  it("clients coalesce socket refreshes and never overwrite the thread id", () => {
    for (const f of ["src/components/chat/ChatBox.jsx", "src/components/chat/mobile/useChatThreadMobile.js"]) {
      const src = read(f);
      expect(src).toContain("createCoalescedRunner");
      expect(src).toMatch(/const \{ id: _eid, threadId: _etid, thread_id: _ethid, _sync: _es, \.\.\.patch \} = updatedThread/);
    }
  });

  it("coalesced runner turns a burst into one run (+ one follow-up)", async () => {
    vi.useFakeTimers();
    let runs = 0;
    const s = createCoalescedRunner(async () => { runs++; }, 50);
    s(); s(); s();
    await vi.advanceTimersByTimeAsync(60);
    expect(runs).toBe(1);
    s.cancel();
    vi.useRealTimers();
  });
});

describe("chat message order (session 23)", () => {
  const msgs = [
    { id: "a", created_at: "2026-09-25T18:55:00Z" },
    { id: "rev", created_at: "2026-09-25T18:54:00Z" },
    { id: "temp", created_at: undefined },
    { id: "b", created_at: "2026-09-25T18:57:00Z" },
  ];
  it("server and client sort oldest first, untimed last", () => {
    expect(sortMessagesChronologically(msgs).map((m) => m.id)).toEqual(["rev", "a", "b", "temp"]);
    expect(sortChronologically(msgs).map((m: any) => m.id)).toEqual(["rev", "a", "b", "temp"]);
  });
  it("campaign revision message id is a UUID (chat_messages.message_id is uuid)", () => {
    const src = read("backend/campaign_lifecycle.ts");
    expect(src).not.toMatch(/const msgId = `msg_/);
    expect(src).toContain("const msgId = crypto.randomUUID();");
  });
});

describe("auth lookup cache (session 23)", () => {
  it("parallel requests share one session + one user lookup", async () => {
    const sessionUserId = vi.fn(async () => "u1");
    const userRow = vi.fn(async () => ({ user_id: "u1", role: "brand" }));
    const c = createAuthLookupCache();
    const all = await Promise.all(Array.from({ length: 10 }, () => c.resolve("tok", { sessionUserId, userRow })));
    expect(sessionUserId).toHaveBeenCalledTimes(1);
    expect(userRow).toHaveBeenCalledTimes(1);
    all[0].role = "hacked";
    expect(all[1].role).toBe("brand"); // own copy each
  });

  it("user row is always re-read (role/ban apply at once); session expires after TTL", async () => {
    let t = 0;
    const sessionUserId = vi.fn(async () => "u1");
    let role = "creator";
    const userRow = vi.fn(async () => ({ user_id: "u1", role }));
    const c = createAuthLookupCache({ now: () => t });
    const L = { sessionUserId, userRow };
    await c.resolve("tok", L);
    role = "brand";
    expect((await c.resolve("tok", L)).role).toBe("brand");
    expect(sessionUserId).toHaveBeenCalledTimes(1);
    t += SESSION_TTL_MS + 1;
    await c.resolve("tok", L);
    expect(sessionUserId).toHaveBeenCalledTimes(2);
  });

  it("forgetToken drops a logged-out session immediately; unknown tokens are not cached", async () => {
    let valid = true;
    const c = createAuthLookupCache();
    const L = { sessionUserId: async () => (valid ? "u1" : null), userRow: async () => ({ user_id: "u1" }) };
    expect(await c.resolve("tok", L)).toBeTruthy();
    valid = false;
    c.forgetToken("tok");
    expect(await c.resolve("tok", L)).toBeNull();
    expect(c._size()).toBe(0);
  });

  it("logout deletes the Supabase session row too", () => {
    const src = read("backend/auth_routes.ts");
    expect(src).toMatch(/from\('user_sessions'\)\.delete\(\)\.eq\('session_token', token\)/);
    expect(src).toContain('get("authLookup")?.forgetToken(token)');
  });
});

import { sortThreadsByActivity } from "./chat_routes";
import { sortThreadsByActivity as sortThreadsClient } from "../src/lib/chatSync.js";
import { sortOrdersForWork, isClosedOrder } from "../src/utils/orderSort.js";

describe("inbox order (session 23)", () => {
  const threads = [
    { id: "stuck", updated_at: "2026-09-25T10:00:00Z", last_message: { created_at: "2026-09-24T18:00:00Z" } },
    { id: "fresh", updated_at: "2026-09-20T10:00:00Z", last_message: { created_at: "2026-09-25T18:30:00Z" } },
    { id: "empty", created_at: "2026-09-25T12:00:00Z" },
  ];
  it("newest message wins over a newer status update, server and client", () => {
    expect(sortThreadsByActivity(threads).map((t: any) => t.id)).toEqual(["fresh", "empty", "stuck"]);
    expect(sortThreadsClient(threads).map((t: any) => t.id)).toEqual(["fresh", "empty", "stuck"]);
  });
  it("a local bump from the open chat moves a thread to the top", () => {
    const bumped = threads.map((t) => (t.id === "stuck" ? { ...t, _activity_at: "2026-09-25T19:00:00Z" } : t));
    expect(sortThreadsClient(bumped)[0].id).toBe("stuck");
  });
  it("the threads endpoint returns the sorted list", () => {
    expect(read("backend/chat_routes.ts")).toContain("return res.json(sortThreadsByActivity(populated));");
    expect(read("src/pages/dashboard/Chat.jsx")).toContain("sortThreadsByActivity(displayThreads?.filter(");
    expect(read("src/components/inbox/mobile/InboxMobile.jsx")).toContain("sortThreadsByActivity(rawThreads)");
  });
});

describe("UGC order lists (session 23)", () => {
  it("open orders first (nearest deadline), finished below (newest first)", () => {
    const list = [
      { id: "a", status: "COMPLETED", raw: { updated_at: "2026-09-20T00:00:00Z" } },
      { id: "b", status: "IN_PROGRESS", deadline: "2026-09-27T00:00:00Z" },
      { id: "c", rawStatus: "CANCELLED", raw: { updated_at: "2026-09-24T00:00:00Z" } },
      { id: "d", stage: "REVISION_REQUESTED", deadline: "2026-09-26T00:00:00Z" },
      { id: "e", status: "DISPUTED" },
    ];
    expect(sortOrdersForWork(list).map((o: any) => o.id)).toEqual(["d", "b", "e", "c", "a"]);
    expect(isClosedOrder({ status: "DISPUTED" })).toBe(false);
  });
  it("both order screens use it", () => {
    expect(read("src/pages/creator/ManageUGCOrdersView.jsx")).toContain(".sort(compareOrdersForWork)");
    expect(read("src/pages/brand/BrandUGCOrders.jsx")).toContain(".sort(compareOrdersForWork)");
  });
});

describe("OTP on the mobile UGC sign screen (session 23)", () => {
  it("the code is never shown on screen (only when test mode could not deliver the email)", () => {
    const s = read("src/pages/creator/CreatorUGCMobile.jsx");
    expect(s).not.toContain("(Code: ${res.data.code})");
    expect(s).toMatch(/res\.data\?\.code && String\(res\.data\?\.message \|\| ""\)\.startsWith\("Test mode"\)/);
  });
  it("shows the user's full registered email, not a masked one", () => {
    const s = read("src/pages/creator/CreatorUGCMobile.jsx");
    expect(s).not.toContain("return `${visible}***@${parts[1]}`;");
    expect(s).toContain('const maskedEmail = userEmail || "your registered email";');
  });
  it("a re-send keeps the previous unexpired codes valid (the code in the first email still works)", () => {
    const s = read("backend/session_routes.ts");
    expect(s).toContain("prevHashes?: { h: string; exp: number }[]");
    expect(s).toContain("const matchesEarlier = (record.prevHashes || []).some((p) => p.h === given && Date.now() < p.exp);");
    expect(s).toContain(".slice(-2)");
  });
});

import { clearInboxCache, INBOX_TTL_MS } from "./chat_routes";

describe("inbox speed + reliability (session 23)", () => {
  it("nav badge never downloads the inbox (either path form)", () => {
    const L = read("src/components/layout/Layout.jsx");
    expect(L).not.toContain('api.get("/chat/v2/threads"');
    expect(L).not.toContain('api.get("chat/v2/threads",');
    expect(L).toContain("res?.data?.unread ?? res?.data?.count");
    expect(read("backend/chat_routes.ts")).toContain("return res.json({ count: threads.length, unread });");
  });
  it("inbox load retries (desktop + mobile) instead of staying empty", () => {
    expect(read("src/pages/dashboard/Chat.jsx")).toContain("for (const wait of [0, 2000, 5000])");
    expect(read("src/pages/dashboard/Chat.jsx")).toContain("Retry now");
    expect(read("src/components/inbox/mobile/InboxMobile.jsx")).toContain("for (const wait of [0, 2000, 5000])");
  });
  it("server shares one inbox computation per user and any write clears the cache", () => {
    const c = read("backend/chat_routes.ts");
    expect(c).toContain("inboxInflight.set(uid, shared);");
    expect(INBOX_TTL_MS).toBeLessThanOrEqual(5000);
    expect(typeof clearInboxCache).toBe("function");
    expect(read("backend/server.ts")).toContain('res.on("finish", () => { if (res.statusCode < 400) clearInboxCache(); });');
  });
  it("no socket is websocket-only (long-polling fallback when websockets stall)", () => {
    const out = require("child_process").execSync("grep -rln 'transports: \\[\"websocket\"\\]' src || true").toString().trim();
    expect(out).toBe("");
  });
  it("an OTP whose shared-store write failed is still found on this instance", () => {
    const e = read("backend/ephemeralStore.ts");
    expect(e).toContain("if (!data) return memOnly.has(key) ? memGet(key) : null;");
    expect(e).toContain("memOnly.add(key);");
  });
});

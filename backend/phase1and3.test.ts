import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { isAdminOnlyNotification } from "./tags_notifications_routes";
import { checkSignedUploadTarget } from "./misc_routes";
import { createUgcSlots } from "./ugcSlots";
import { createSocketAccess, sessionTokenFromHandshake, ADMIN_ROOM } from "./socketAccess";

// Session 20 — Phase 1 (security) and Phase 3 (bugs).

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

// ---------------------------------------------------------------------------------------------
// A tiny in-memory stand-in for the Supabase query builder: enough for ugcSlots and
// socketAccess (select / eq / is / or / limit / maybeSingle / update(...).eq().eq().select()).
// Every call yields to the event loop first, so concurrent claims really interleave.
function fakeClient(tables: Record<string, any[]>) {
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  const builder = (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    let patch: any = null;
    const q: any = {
      select: () => q,
      update: (p: any) => { patch = p; return q; },
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
      is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      or: (expr: string) => {
        const parts = expr.split(",").map((p) => p.split(".eq."));
        filters.push((r) => parts.some(([k, v]) => String(r[k]) === v));
        return q;
      },
      limit: () => q,
      run: async () => {
        await tick();
        const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
        if (patch) {
          rows.forEach((r) => Object.assign(r, patch));
          return { data: rows.map((r) => ({ id: r.id })), error: null };
        }
        return { data: rows.map((r) => ({ ...r })), error: null };
      },
      maybeSingle: async () => {
        const { data } = await q.run();
        return { data: data[0] || null, error: null };
      },
      then: (res: any, rej: any) => q.run().then(res, rej),
    };
    return q;
  };
  return { from: (t: string) => builder(t) };
}

describe("Phase 1 · admin alerts stay with admins", () => {
  it("recognises admin alerts, including ones already written to 'all'", () => {
    expect(isAdminOnlyNotification({ is_admin_message: true, user_id: "all" })).toBe(true);
    expect(isAdminOnlyNotification({ notif_id: "notif_171_abc1234_all", user_id: "all" })).toBe(true);
    expect(isAdminOnlyNotification({ notif_id: "notif_171_abc1234", user_id: "all" })).toBe(false); // a real broadcast
    expect(isAdminOnlyNotification(null)).toBe(false);
  });

  it("broadcastAdminNotification no longer writes an 'all' copy or emits to every socket", () => {
    // Moved from server.ts to notificationService.ts in session 22.
    const s = read("backend/server.ts") + read("backend/notificationService.ts");
    const n = read("backend/notificationService.ts");
    const fn = n.slice(n.indexOf("async function broadcastAdminNotification"), n.indexOf("async function broadcastAdminNotification") + 4000);
    expect(fn).not.toContain("user_id: 'all'");
    expect(fn).not.toMatch(/ioInstance\.emit\(/);
    expect(fn).toContain("ioInstance.to(ADMIN_ROOM)");
    expect(s).not.toContain('"admin_room"');
  });

  it("the notification list hides admin alerts from non-staff", () => {
    const s = read("backend/tags_notifications_routes.ts");
    expect(s).toContain("isStaff ? data : data.filter((n: any) => !isAdminOnlyNotification(n))");
    expect(s).toContain('(n.user_id === "all" && (isStaff || !isAdminOnlyNotification(n)))');
  });
});

describe("Phase 1 · /auth/session", () => {
  it("accepts only a real session token", () => {
    const s = read("backend/auth_routes.ts");
    const r = s.slice(s.indexOf('router.post("/auth/session"'), s.indexOf('router.post("/auth/session"') + 900);
    expect(r).toContain("parseAuthUser({ headers: { authorization: `Bearer ${sessionId}` } } as any)");
    expect(r).toContain("status(401)");
    expect(r).not.toContain('"dev-user-id-12345"');
    expect(r).not.toContain("u.user_id === session_id");
  });
});

describe("Phase 1 · signed upload URLs", () => {
  it("allow only the app's own deliverable folders", () => {
    expect(checkSignedUploadTarget("content-submissions", "ugc-videos/ugcord_1-17.mp4").ok).toBe(true);
    expect(checkSignedUploadTarget("content-submissions", "ugc-videos/ugcord_1/ugcord_1-17.mp4").ok).toBe(true);
    expect(checkSignedUploadTarget("content-submissions", "campaign-deliverables/thread_camp_x-1.mov").ok).toBe(true);
    expect(checkSignedUploadTarget("content-submissions", "chat-attachments/t-1.pdf").ok).toBe(true);
  });
  it("refuse other buckets, folders and path tricks", () => {
    expect(checkSignedUploadTarget("kyc-documents", "ugc-videos/a.mp4").ok).toBe(false);
    expect(checkSignedUploadTarget("brand-logos", "x.png").ok).toBe(false);
    expect(checkSignedUploadTarget("content-submissions", "kyc/a.pdf").ok).toBe(false);
    expect(checkSignedUploadTarget("content-submissions", "ugc-videos/../kyc/a.pdf").ok).toBe(false);
    expect(checkSignedUploadTarget("content-submissions", "ugc-videos//a.mp4").ok).toBe(false);
    expect(checkSignedUploadTarget("content-submissions", "ugc-videos/a b.mp4").ok).toBe(false);
    expect(checkSignedUploadTarget(undefined, undefined).ok).toBe(false);
  });
  it("never overwrites an existing file", () => {
    expect(read("backend/misc_routes.ts")).toContain("createSignedUploadUrl(filePath, { upsert: false })");
  });
});

describe("Phase 1 · demo flag", () => {
  it("dev_bypass_2 obeys isDemoLoginEnabled()", () => {
    const s = read("backend/server.ts");
    expect(s).toContain('isDemoLoginEnabled() && (token === "dev_bypass" || token === "dev_bypass_2")');
    expect(s).not.toContain('isDemoLoginEnabled() && token === "dev_bypass" || token === "dev_bypass_2"');
  });
});

describe("Phase 3 · UGC slots are race-safe", () => {
  const setup = (max: number, count = 0, status = "OPEN") => {
    const tables = { ugc_briefs: [{ id: "b1", claimed_count: count, max_creators: max, status }] };
    const local = { ugc_briefs: [{ id: "b1", claimed_count: count, max_creators: max, status }] };
    const slots = createUgcSlots({ getClient: () => fakeClient(tables), getDb: () => local, saveDb: () => {} });
    return { tables, local, slots };
  };

  it("ten creators racing for one slot: exactly one wins", async () => {
    const { tables, slots } = setup(1);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => slots.reserveBriefSlot({ id: "b1" }, `c${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(tables.ugc_briefs[0].claimed_count).toBe(1);
    expect(tables.ugc_briefs[0].status).toBe("CLAIMED");
  });

  it("ten creators racing for three slots: exactly three win", async () => {
    const { tables, slots } = setup(3);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => slots.reserveBriefSlot({ id: "b1" }, `c${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(tables.ugc_briefs[0].claimed_count).toBe(3);
  });

  it("a double tap by the same creator reserves once", async () => {
    const { tables, slots } = setup(5);
    const [a, b] = await Promise.all([slots.reserveBriefSlot({ id: "b1" }, "c1"), slots.reserveBriefSlot({ id: "b1" }, "c1")]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(tables.ugc_briefs[0].claimed_count).toBe(1);
  });

  it("releasing reopens a full brief but leaves a closed one closed", async () => {
    const full = setup(1, 1, "CLAIMED");
    await full.slots.releaseBriefSlot("b1");
    expect(full.tables.ugc_briefs[0]).toMatchObject({ claimed_count: 0, status: "OPEN" });

    const closed = setup(2, 1, "CLOSED");
    await closed.slots.releaseBriefSlot("b1");
    expect(closed.tables.ugc_briefs[0]).toMatchObject({ claimed_count: 0, status: "CLOSED" });
  });

  it("the claim route reserves first and gives the slot back when the order cannot be saved", () => {
    const s = read("backend/ugc_routes.ts");
    const claim = s.slice(s.indexOf("const handleUgcBriefClaim"), s.indexOf('router.post("/ugc/orders/claim", handleUgcBriefClaim)'));
    expect(claim.indexOf("reserveBriefSlot(brief, user.user_id)")).toBeLessThan(claim.indexOf(".from('ugc_orders').insert"));
    expect((claim.match(/releaseBriefSlot\(brief\.id, user\.user_id\)/g) || []).length).toBe(2);
    expect(claim).not.toMatch(/claimed_count: newClaimCount/);
  });

  it("cancel frees the slot through the same helper", () => {
    const s = read("backend/services/ugcLifecycleService.ts");
    expect(s).toContain("if (briefId) await releaseBriefSlot(briefId);");
    expect(s).not.toMatch(/claimed_count: newCount/);
  });

  it("the legacy accept route goes through the claim and invents nothing", () => {
    const s = read("backend/ugc_routes.ts");
    const acc = s.slice(s.indexOf('router.post("/ugc-orders/:orderId/accept"'), s.indexOf('router.post("/ugc-orders/:orderId/submit"'));
    expect(acc).toContain("return handleUgcBriefClaim(req, res);");
    expect(acc).not.toContain("50000");
    expect(acc).not.toContain("8ebacafb");
    expect(acc).toContain("This order is already yours.");
    const sub = s.slice(s.indexOf('router.post("/ugc-orders/:orderId/submit"'), s.indexOf('router.post("/ugc-orders/:orderId/submit"') + 6000);
    expect(sub).not.toContain("50000");
    expect(sub).not.toContain("8ebacafb");
  });
});

describe("Phase 3 · earnings show the net amount", () => {
  it("/ugc/earnings attaches the fee and net from the release row", () => {
    const s = read("backend/ugc_routes.ts");
    const r = s.slice(s.indexOf('router.get("/ugc/earnings"'), s.indexOf('router.get("/ugc/earnings"') + 4000);
    expect(r).toContain("creator_net_amount: Number(tx.creator_net_amount) || 0");
    expect(r).toContain("calculatePlatformFee(gross");
    expect(r).toContain("return res.json(withNet)");
  });
  it("the page sums net, labels RELEASED honestly and shows no fake growth", () => {
    const s = read("src/pages/creator/CreatorUGCEarnings.jsx");
    expect(s).toContain("const total = earnings.reduce((acc, o) => acc + netOf(o), 0);");
    expect(s).not.toContain("payout_status: 'PAID'");
    expect(s).not.toMatch(/"\+100%"\s*:/);
    for (const f of ["src/pages/dashboard/Earnings.jsx", "src/pages/brand/BrandPayments.jsx", "src/pages/brand/BrandUGCPayments.jsx", "src/components/profile/mobile/brand/PaymentsScreen.jsx", "src/components/admin/EscrowDashboard.jsx"]) {
      expect(read(f)).not.toMatch(/= "\+100%"|\? "\+100%"/);
    }
  });
});

describe("Phase 3 · no placeholder parties", () => {
  it("ensureUGCChatThread refuses to build a thread without a real brand and creator", () => {
    const s = read("backend/server.ts");
    const fn = s.slice(s.indexOf("const ensureUGCChatThread"), s.indexOf("const ensureUGCChatThread") + 2500);
    expect(fn).not.toContain("'dev-brand-id-12345'");
    expect(fn).not.toContain("'dev-user-id-12345'");
    expect(fn).toContain("if (!finalBrandId || !creatorId)");
  });
});

describe("Phase 3 · stale chat-card buttons", () => {
  it("desktop live-link cards apply the newest-card rule to UGC too", () => {
    const s = read("src/components/chat/SystemMessage.jsx");
    expect(s).not.toContain("if (isUgcDeal || !Array.isArray(allMessages)");
    expect(s).not.toContain("!isUgcDeal && Boolean(campaignFlowUpper)");
    expect(s).not.toContain("(!isUgcDeal && (!isLatestOfType(");
  });
  it("desktop draft cards: only the newest is reviewable", () => {
    const s = read("src/components/chat/ContentProofNotice.jsx");
    expect(s).toContain("const isPendingReview = !isApproved && !isRevision && !isDeclined && !isSupersededDraft;");
    expect(read("src/components/chat/MessageBubble.jsx")).toMatch(/<ContentProofNotice[\s\S]{0,200}allMessages=\{allMessages\}/);
  });
  it("mobile cards receive and honour isSuperseded", () => {
    expect(read("src/components/chat/mobile/ChatBoxMobile.jsx")).toContain("isSuperseded={supersededIdx.has(idx)}");
    expect(read("src/components/chat/mobile/MobileLiveLinksCard.jsx")).toContain("!isApproved && !isSuperseded");
    expect(read("src/components/chat/mobile/MobileDeliverableCard.jsx")).toContain("!isMine && !isSuperseded");
  });
});

describe("Phase 3 · sockets", () => {
  const db = {
    chat_threads: [{ id: "t1", brand_id: "brandA", creator_id: "creatorA" }],
    ugc_orders: [{ id: "ugcord_1", brand_id: "brandB", creator_id: "creatorB" }],
    deals: [],
  };
  const access = createSocketAccess({ parseAuthUser: async () => null, getDb: () => db, getClient: () => null });

  it("only the deal's parties (or staff) may join its room", async () => {
    expect(await access.canJoinThread({ user_id: "creatorA", role: "creator" }, "t1")).toBe(true);
    expect(await access.canJoinThread({ user_id: "brandA", role: "brand" }, "thread_t1")).toBe(true);
    expect(await access.canJoinThread({ user_id: "member", role: "brand", parent_brand_id: "brandA" }, "t1")).toBe(true);
    expect(await access.canJoinThread({ user_id: "stranger", role: "creator" }, "t1")).toBe(false);
    expect(await access.canJoinThread(null, "t1")).toBe(false);
    expect(await access.canJoinThread({ user_id: "x", role: "admin" }, "t1")).toBe(true);
    expect(await access.canJoinThread({ user_id: "creatorB", role: "creator" }, "ugcord_1")).toBe(true);
  });

  it("deal events go to the room, both parties and admins — not to everyone", async () => {
    const rooms: string[] = [];
    let emitted: any = null;
    const target: any = { to: (r: string) => { rooms.push(r); return target; }, emit: (e: string, p: any) => { emitted = { e, p }; } };
    const io: any = { to: (r: string) => { rooms.push(r); return target; }, emit: () => { throw new Error("broadcast to everyone"); } };
    await access.emitToThread(io, "thread_updated", { threadId: "t1" });
    expect(emitted.e).toBe("thread_updated");
    expect(new Set(rooms)).toEqual(new Set([ADMIN_ROOM, "t1", "thread_t1", "user_brandA", "user_creatorA"]));
  });

  it("reads the token from the auth payload or the session cookie", () => {
    expect(sessionTokenFromHandshake({ auth: { token: "tok1" } })).toBe("tok1");
    expect(sessionTokenFromHandshake({ headers: { cookie: "a=1; session_token=tok2; b=2" } })).toBe("tok2");
    expect(sessionTokenFromHandshake({})).toBe("");
  });

  it("the server no longer trusts the client's user id or room choice", () => {
    // The connection handler moved from server.ts to socketServer.ts in session 22.
    const s = read("backend/socketServer.ts");
    const conn = s.slice(s.indexOf('io.on("connection"'));
    expect(read("backend/server.ts")).toContain("attachSocketServer(io, {");
    expect(conn).not.toMatch(/socket\.join\(`user_\$\{userId\}`\)/);
    expect(conn).toContain("await socketAccess.canJoinThread(user, roomId)");
    expect(conn).toContain('socket.emit("room_denied"');
  });

  it("no deal event is broadcast to every socket any more", () => {
    const files = fs.readdirSync(path.join(ROOT, "backend")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "socketAccess.ts" /* its doc comment names the old call */).map((f) => `backend/${f}`)
      .concat(fs.readdirSync(path.join(ROOT, "backend/services")).filter((f) => f.endsWith(".ts")).map((f) => `backend/services/${f}`));
    const hits = files.filter((f) => /(io|ioInstance)\??\.emit\(["'](thread_updated|payment_funded|payout_released|ugc_order_updated|admin_payout_alert)["']/.test(read(f)));
    expect(hits).toEqual([]);
  });

  it("every socket the app opens sends the login token", () => {
    const files = ["src/components/shared/NotificationBell.jsx", "src/components/chat/ChatBox.jsx", "src/components/chat/mobile/useChatThreadMobile.js",
      "src/components/NotificationPopup.jsx", "src/components/inbox/mobile/InboxMobile.jsx", "src/pages/brand/BrandUGCOrders.jsx",
      "src/pages/creator/ManageUGCOrdersView.jsx", "src/pages/dashboard/Chat.jsx"];
    for (const f of files) {
      const s = read(f);
      const opened = (s.match(/io\(window\.location\.origin/g) || []).length;
      const withAuth = (s.match(/io\(window\.location\.origin, \{ auth: socketAuth,/g) || []).length;
      expect([f, withAuth]).toEqual([f, opened]);
    }
  });
});

describe("Phase 3 · campaign edit", () => {
  for (const f of ["src/pages/brand/BrandCampaignCreate.jsx", "src/components/campaigns/mobile/MobileCampaignCreate.jsx"]) {
    it(`${path.basename(f)} no longer creates a second campaign when an update fails`, () => {
      expect(read(f)).not.toMatch(/update`, payload\)\.catch\(async \(\) => \{\s*await api\.post\(`\/campaigns`/);
    });
  }
});

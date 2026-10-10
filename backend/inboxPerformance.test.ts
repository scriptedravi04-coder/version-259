import { describe, it, expect } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import { setupChatCoreRoutes } from "./chat_routes";
import { setupCampaignsRoutes } from "./campaigns_routes";

// Session 19b — "the inbox takes 20–30 s", "the whole app is slow on mobile", and
// "I applied as a creator but the brand doesn't see it".

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");
const USER = "u0000000-0000-4000-8000-000000000001";
const BRAND = "b0000000-0000-4000-8000-000000000001";
const OTHER_BRAND = "d0000000-0000-4000-8000-000000000003";

async function serve(app: express.Express, fn: (base: string) => Promise<void>) {
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const port = (srv.address() as any).port;
  try { await fn(`http://127.0.0.1:${port}`); } finally { srv.close(); }
}

function chatApp(db: any, calls: { heal: string[]; populate: number }) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  setupChatCoreRoutes(app, router, {
    supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {},
    parseAuthUser: async () => ({ user_id: USER, role: "creator" }),
    ensureUGCChatThread: async (order: any) => {
      calls.heal.push(order.id);
      return { id: `thread_ugc_${order.id}`, deal_id: order.id, creator_id: USER, brand_id: BRAND };
    },
    populateThreadData: async (threads: any[]) => { calls.populate++; return threads; },
    insertChatMessageToSupabase: async () => {},
  } as any);
  app.use("/api", router);
  return app;
}

describe("inbox list", () => {
  it("heals only orders that have no thread (it used to re-run for every order on every load)", async () => {
    const db = {
      chat_threads: [{ id: "thread_ugc_ugcord_1", deal_id: "ugcord_1", creator_id: USER, brand_id: BRAND, status: "ACTIVE" }],
      ugc_orders: [
        { id: "ugcord_1", creator_id: USER, brand_id: BRAND, status: "IN_PROGRESS" },
        { id: "ugcord_2", creator_id: USER, brand_id: BRAND, status: "IN_PROGRESS" },
      ],
      chat_messages: [],
    };
    const calls = { heal: [] as string[], populate: 0 };
    await serve(chatApp(db, calls), async (base) => {
      const r = await fetch(`${base}/api/chat/v2/threads`);
      const list = await r.json();
      expect(r.status).toBe(200);
      expect(calls.heal).toEqual(["ugcord_2"]);
      expect(list.some((t: any) => t.deal_id === "ugcord_2")).toBe(true);
      expect(r.headers.get("server-timing")).toContain("populate");
    });
  });

  it("the nav badge has a count endpoint that does not populate anything", async () => {
    const db = { chat_threads: [{ id: "t1", creator_id: USER }, { id: "t2", brand_id: USER }, { id: "t3", creator_id: "someone" }], ugc_orders: [], chat_messages: [] };
    const calls = { heal: [] as string[], populate: 0 };
    await serve(chatApp(db, calls), async (base) => {
      const r = await fetch(`${base}/api/chat/v2/threads/count`);
      expect(r.status).toBe(200);
      expect((await r.json()).count).toBe(2);
      expect(calls.populate).toBe(0);
    });
  });
});

describe("applicants belong to the campaign's brand", () => {
  function app(actor: any) {
    const db: any = {
      campaigns: [{ campaign_id: "camp1", brand_user_id: BRAND, applicants: [{ application_id: "a1", creator_user_id: "c1" }] }],
      users: [], creator_profiles: [],
    };
    const a = express();
    a.use(express.json());
    const router = express.Router();
    setupCampaignsRoutes(a, router, {
      supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {},
      parseAuthUser: async () => actor, sendNotification: async () => {}, serializeChatMessage: (t: any) => t,
      insertChatMessageToSupabase: async () => {}, syncEntityTags: async () => {},
      getActingBrandId: (u: any) => u?.parent_brand_id || u?.user_id, createEscrowTransaction: async () => null,
      isCreatorKycVerified: async () => true,
    } as any);
    a.use("/api", router);
    return a;
  }

  it("another brand cannot read a campaign's applicants", async () => {
    await serve(app({ user_id: OTHER_BRAND, role: "brand" }), async (base) => {
      const r = await fetch(`${base}/api/campaigns/camp1/applications`);
      expect(r.status).toBe(403);
    });
  });

  it("the owning brand can", async () => {
    await serve(app({ user_id: BRAND, role: "brand" }), async (base) => {
      const r = await fetch(`${base}/api/campaigns/camp1/applications`);
      expect(r.status).toBe(200);
      expect((await r.json()).length).toBe(1);
    });
  });
});

describe("source-level guards", () => {
  const SERVER = read("./server.ts");
  const CAMPAIGNS = read("./campaigns_routes.ts");
  const LAYOUT = read("../src/components/layout/Layout.jsx");
  const INBOX_MOBILE = read("../src/components/inbox/mobile/InboxMobile.jsx");
  const CHATBOX = read("../src/components/chat/ChatBox.jsx");
  const MOBILE_THREAD = read("../src/components/chat/mobile/useChatThreadMobile.js");
  const CHAT_PAGE = read("../src/pages/dashboard/Chat.jsx");

  it("deals are looked up by UUID ids only (a ugcord_ id failed the whole query)", () => {
    expect(SERVER).toContain("uuidOrderIds.length ? pClient.from('deals').select('*').in('id', uuidOrderIds)");
    expect(SERVER).not.toContain(".from('deals').select('*').in('id', potentialOrderIds)");
  });

  it("the inbox fetches a message window per thread, not every message ever", () => {
    expect(SERVER).toContain(".limit(MESSAGE_WINDOW)");
    expect(SERVER).not.toMatch(/from\('chat_messages'\)\s*\.select\('\*'\)\s*\.in\('thread_id', threadIds\)\s*\.order\('created_at', \{ ascending: true \}\)/);
  });

  it("the nav badge no longer downloads the inbox", () => {
    expect(LAYOUT).toContain('api.get("chat/v2/threads/count")');
    expect(LAYOUT).not.toContain('api.get("chat/v2/threads")');
  });

  it("polling no longer stacks up", () => {
    expect(INBOX_MOBILE).not.toContain("}, 10000);");
    expect(CHATBOX).not.toMatch(/refreshThread\(\);\s*\}, 6000\);/);
    expect(MOBILE_THREAD).not.toMatch(/refreshThread\(\);\s*\}, 6000\);/);
  });

  it("the inbox does not blank the app behind the full-screen loader", () => {
    expect(CHAT_PAGE).not.toContain("startLoading();");
  });

  it("the brand never receives a creator's full KYC record", () => {
    expect(CAMPAIGNS).not.toContain("kyc_details: kyc\n");
  });

  it("applications are written and read with the same client", () => {
    expect(CAMPAIGNS).toContain("const appClient = privilegedSupabase || supabase;");
    expect(CAMPAIGNS).toMatch(/await appClient\s*\.from\('campaign_applications'\)\s*\.insert\(payload\)/);
  });
});

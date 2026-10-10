import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import { setupCampaignsRoutes } from "./campaigns_routes";
import { setupSessionRoutes } from "./session_routes";
import { buildContractSignEmailHtml } from "./helpers";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");

const BRAND = "b0000000-0000-4000-8000-000000000001";
const OTHER_BRAND = "d0000000-0000-4000-8000-000000000003";
const CREATOR = "c0000000-0000-4000-8000-000000000002";

async function serve(app: express.Express, fn: (base: string) => Promise<void>) {
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const port = (srv.address() as any).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    srv.close();
  }
}

function campaignsApp(actor: () => any, db: any) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  setupCampaignsRoutes(app, router, {
    supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {},
    parseAuthUser: async () => actor(), sendNotification: async () => {}, serializeChatMessage: (t: any) => t,
    insertChatMessageToSupabase: async () => {}, syncEntityTags: async () => {},
    getActingBrandId: (u: any) => u?.parent_brand_id || u?.user_id, createEscrowTransaction: async () => null,
    isCreatorKycVerified: async () => true,
  } as any);
  app.use("/api", router);
  return app;
}

describe("GET /campaigns/my-applications is reachable", () => {
  it("is no longer swallowed by /campaigns/:id (it always answered 404 'Campaign not found')", async () => {
    const app = campaignsApp(() => null, { campaigns: [] });
    await serve(app, async (base) => {
      const r = await fetch(`${base}/api/campaigns/my-applications`);
      const body = await r.json();
      // Unauthenticated → the my-applications handler's own 401, not the campaign 404.
      expect(r.status).toBe(401);
      expect(body.detail).not.toBe("Campaign not found");
    });
  });
});

describe("application accept / reject belongs to the campaign's brand", () => {
  const freshDb = () => ({
    campaigns: [{ campaign_id: "camp1", brand_user_id: BRAND, applicants: [{ application_id: "app1", creator_user_id: CREATOR, status: "pending" }] }],
    chat_threads: [] as any[],
    chat_messages: [] as any[],
  });

  it("the applicant cannot accept their own application", async () => {
    const db = freshDb();
    const app = campaignsApp(() => ({ user_id: CREATOR, role: "creator" }), db);
    await serve(app, async (base) => {
      const r = await fetch(`${base}/api/campaigns/camp1/applications/app1/action`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept" }),
      });
      expect(r.status).toBe(403);
      expect(db.chat_threads.length).toBe(0);
    });
  });

  it("another brand cannot reject someone else's applicants", async () => {
    const db = freshDb();
    const app = campaignsApp(() => ({ user_id: OTHER_BRAND, role: "brand" }), db);
    await serve(app, async (base) => {
      const r = await fetch(`${base}/api/campaigns/camp1/applications/app1/action`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reject" }),
      });
      expect(r.status).toBe(403);
      expect(db.campaigns[0].applicants[0].status).toBe("pending");
    });
  });

  it("a typo is not a rejection", async () => {
    const db = freshDb();
    const app = campaignsApp(() => ({ user_id: BRAND, role: "brand" }), db);
    await serve(app, async (base) => {
      const r = await fetch(`${base}/api/campaigns/camp1/applications/app1/action`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "acept" }),
      });
      expect(r.status).toBe(400);
      expect(db.campaigns[0].applicants[0].status).toBe("pending");
    });
  });

  it("a team member accepting for the brand opens the thread under the BRAND's id", async () => {
    const db = freshDb();
    const app = campaignsApp(() => ({ user_id: "team_member_7", parent_brand_id: BRAND, role: "brand" }), db);
    await serve(app, async (base) => {
      const r = await fetch(`${base}/api/campaigns/camp1/applications/app1/action`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept" }),
      });
      expect(r.status).toBe(200);
      expect(db.chat_threads[0].brand_id).toBe(BRAND);
    });
  });
});

describe("OTP", () => {
  const prev = process.env.PAYMENTS_TEST_MODE;
  afterEach(() => {
    if (prev === undefined) delete process.env.PAYMENTS_TEST_MODE;
    else process.env.PAYMENTS_TEST_MODE = prev;
  });

  function otpApp(actor: () => any) {
    const app = express();
    app.use(express.json());
    setupSessionRoutes(app, express.Router(), {
      supabase: null, privilegedSupabase: null, getDb: () => ({}), saveDb: () => {}, parseAuthUser: async () => actor(),
    } as any);
    return app;
  }
  const post = (base: string, p: string, body: any) =>
    fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("does not hand the code back outside test mode — and says so when no email could go out", async () => {
    process.env.PAYMENTS_TEST_MODE = "false";
    process.env.OTP_ECHO = "off"; // Session 43: echo follows NODE_ENV, so act like the live server
    const savedKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      await serve(otpApp(() => null), async (base) => {
        const r = await post(base, "/api/otp/send", { value: "someone@example.com", target: "email" });
        const body = await r.json();
        // Session 20: this used to be 200 "OTP successfully sent" with no email sent at all.
        expect(r.status).toBe(502);
        expect(body.code).toBeUndefined();
        expect(body.detail).toMatch(/not configured/i);
        expect(body.error).toBe("OTP_NOT_DELIVERED");
        // The dead code was dropped, so the user can retry immediately (no 30 s wait).
        const again = await post(base, "/api/otp/send", { value: "someone@example.com", target: "email" });
        expect(again.status).toBe(502);
      });
    } finally {
      delete process.env.OTP_ECHO;
      if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;
    }
  });

  it("in test mode an undelivered code is returned with a warning instead of a fake success", async () => {
    process.env.PAYMENTS_TEST_MODE = "true";
    const savedKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      await serve(otpApp(() => null), async (base) => {
        const r = await post(base, "/api/otp/send", { value: "tester@example.com", target: "email" });
        const body = await r.json();
        expect(r.status).toBe(200);
        expect(body.code).toMatch(/^\d{6}$/);
        expect(body.message).toMatch(/^Test mode:/);
      });
    } finally {
      if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey;
    }
  });

  it("a signing code needs a signed-in user and goes only to their own email", async () => {
    process.env.PAYMENTS_TEST_MODE = "false";
    await serve(otpApp(() => null), async (base) => {
      const r = await post(base, "/api/otp/send", { value: "victim@example.com", target: "email", purpose: "contract_sign" });
      expect(r.status).toBe(401);
    });
    await serve(otpApp(() => ({ user_id: BRAND, email: "brand@example.com" })), async (base) => {
      const r = await post(base, "/api/otp/send", { value: "victim@example.com", target: "email", purpose: "contract_sign" });
      expect(r.status).toBe(403);
    });
  });

  it("five wrong guesses kill the code", async () => {
    process.env.PAYMENTS_TEST_MODE = "true";
    await serve(otpApp(() => null), async (base) => {
      const sent = await (await post(base, "/api/otp/send", { value: "a@example.com", target: "email" })).json();
      const right = sent.code;
      const wrong = right === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) await post(base, "/api/otp/verify", { value: "a@example.com", code: wrong });
      const late = await post(base, "/api/otp/verify", { value: "a@example.com", code: right });
      expect(late.status).toBe(400);
    });
  });

  it("the contract email escapes what the caller sends", () => {
    const html = buildContractSignEmailHtml({ code: "123456", brandName: '<a href="https://evil">Pay here</a>', dealAmount: "<b>x</b>" } as any);
    expect(html).not.toContain('<a href="https://evil">');
    expect(html).toContain("&lt;a href=");
  });
});

describe("source-level guards (frontend and payments)", () => {
  const MOBILE = read("../src/components/chat/mobile/useChatThreadMobile.js");
  const CHATBOX = read("../src/components/chat/ChatBox.jsx");
  const SYSMSG = read("../src/components/chat/SystemMessage.jsx");
  const PAYOUT = read("../src/components/chat/mobile/MobilePayoutCard.jsx");
  const PAYMENTS = read("./payment_routes.ts");
  const SERVER = read("./server.ts");
  const CAMPAIGNS = read("./campaigns_routes.ts");

  it("mobile never resends a live-link POST to /chat/v2 in a catch", () => {
    expect(MOBILE).not.toMatch(/catch\s*\{\s*await api\.post\(`\/chat\/v2\/threads\/\$\{targetId\}\/submit-live-link`/);
    expect(MOBILE).not.toMatch(/api\.post\(`\/deals\/\$\{[^}]+\}\/add-collab`/);
  });

  it("a mobile live-link correction never falls through to the DRAFT revision endpoint", () => {
    expect(MOBILE).not.toMatch(/reject-live-links`[^;]*;\s*\}\s*catch\s*\{\s*await api\.post\(`\/campaign\/threads\/\$\{targetId\}\/reject-content`/);
  });

  it("the draft preview approves the draft for a campaign — it does not release escrow", () => {
    expect(CHATBOX).toContain("`/campaign/threads/${currentThread.id}/approve-content`");
    expect(CHATBOX).not.toContain("`/campaign/threads/${currentThread.id}/mark-complete`");
  });

  it("desktop live-link submit does not write the link a second time through add-collab", () => {
    expect(CHATBOX).not.toMatch(/api\.post\(`\/deals\/\$\{dealId\}\/add-collab`/);
  });

  it("no fabricated invoice", () => {
    expect(CHATBOX).not.toContain("amt * 0.1");
    expect(CHATBOX).not.toContain("amt * 0.9");
  });

  it("stale campaign live-link cards lose their buttons", () => {
    expect(SYSMSG).toContain('isLatestOfType("live_links_submitted")');
    expect(SYSMSG).toContain('isLatestOfType("live_links_resubmit_request")');
    expect(SYSMSG).not.toContain("thread?.agreed_amount || 5000).toLocaleString");
  });

  it("the mobile rating goes to a route that exists and does not fake success", () => {
    expect(PAYOUT).not.toContain("chat/threads/${thread?.id}/review");
    expect(PAYOUT).toContain("/submit-review");
    expect(PAYOUT).not.toContain(".catch(() => {});");
  });

  it("campaign escrow orders are priced from the deal and checked against Razorpay", () => {
    expect(PAYMENTS).toContain('options.notes = { deal_id: campaignOrderDealId, kind: "campaign_escrow" }');
    expect(PAYMENTS).toContain("amountMismatch: mismatch");
    expect(PAYMENTS).toContain("ESCROW_AMOUNT_MISMATCH");
  });

  it("a counter proposal is not written into agreed_amount", () => {
    expect(SERVER).not.toMatch(/updates\.counter_amount[\s\S]{0,80}dbUpdates\.agreed_amount = Number\(updates\.counter_amount\)/);
  });

  it("draft decline and live-link decline are wired to different handlers", () => {
    expect(SERVER).toContain("handleCampaignDeclineRevisions: handleCampaignDeclineDraftRevision");
    expect(SERVER).toContain("handleCampaignDeclineLiveLinks: handleThreadDeclineLiveLinksResubmission");
    expect(CAMPAIGNS).toContain('router.post(["/campaign/threads/:id/decline-revisions", "/campaign/threads/:threadId/decline-revisions"], handleCampaignDeclineRevisions)');
  });
});

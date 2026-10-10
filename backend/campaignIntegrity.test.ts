import { issueSignToken } from "./signTokens";
import { describe, it, expect } from "vitest";
import { createCampaignLifecycleHandlers } from "./campaigns_routes";
import { setupDealsChatRoutes } from "./deals_chat_routes";
import { revisionAllowance, knownAmount, isEscrowDepositRow, partyRole } from "./campaignGuards";

// Session 19 — campaign chat flow integrity.
//
// Every one of these was reproduced against v162 before it was fixed. The handlers run in
// local-store mode (no Supabase), which is the same code path the guards take with Supabase:
// the guards read the thread / deal the handler already resolved.

const DEAL = "1c3d5525-0373-40f6-ab50-df43f3e790c6";
const THREAD = `thread_camp_${DEAL}`;
const BRAND = "b0000000-0000-4000-8000-000000000001";
const CREATOR = "c0000000-0000-4000-8000-000000000002";
const STRANGER = "d0000000-0000-4000-8000-000000000003";
const OTHER_CREATOR = "e0000000-0000-4000-8000-000000000004";

const brand = { user_id: BRAND, role: "brand" };
const creator = { user_id: CREATOR, role: "creator" };

const liveLinkMsg = { id: "m_link", thread_id: THREAD, message_type: "live_links_submitted", metadata: { action: "live_link_submitted", link: "https://instagram.com/p/x" } };

function lifecycle(threadExtra: any = {}, dealExtra: any = {}, dbExtra: any = {}) {
  const db: any = {
    chat_threads: [{ id: THREAD, deal_id: DEAL, campaign_id: "camp1", brand_id: BRAND, creator_id: CREATOR, status: "ACTIVE", flow_state: "ACTIVE", ...threadExtra }],
    deals: [{ id: DEAL, brand_id: BRAND, creator_id: CREATOR, agreed_amount: 20000, status: "ACTIVE", escrow_hold: true, ...dealExtra }],
    transactions: [], chat_messages: [], notifications: [], content_submissions: [],
    ...dbExtra,
  };
  let actor: any = null;
  const h = createCampaignLifecycleHandlers({
    supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {},
    parseAuthUser: async () => actor, insertChatMessageToSupabase: async () => ({}),
  });
  const call = async (fn: any, user: any, body: any = {}) => {
    actor = user; let status = 200; let json: any;
    const res = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; } };
    await fn({ params: { id: THREAD }, body, app: { get: () => null } }, res);
    return { status, json };
  };
  const payoutMsgs = () => db.chat_messages.filter((m: any) => m.message_type === "live_links_approved").length;
  return { db, h, call, payoutMsgs };
}

const underReview = () => lifecycle({ flow_state: "PROOF_SUBMITTED" }, {}, { chat_messages: [liveLinkMsg] });

describe("approve-live-links releases escrow only for the brand, only with a live post", () => {
  it("the creator cannot release their own escrow", async () => {
    const { db, h, call } = underReview();
    const r = await call(h.handleThreadApproveLiveLinks, creator);
    expect(r.status).toBe(403);
    expect(db.deals[0].status).toBe("ACTIVE");
  });

  it("a stranger cannot release someone else's escrow", async () => {
    const { db, h, call } = underReview();
    const r = await call(h.handleThreadApproveLiveLinks, { user_id: STRANGER, role: "brand" });
    expect(r.status).toBe(403);
    expect(db.chat_threads[0].status).toBe("ACTIVE");
  });

  it("no payout without a live link on record", async () => {
    const { db, h, call, payoutMsgs } = lifecycle({ flow_state: "CONTENT_APPROVED" });
    const r = await call(h.handleThreadApproveLiveLinks, brand);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("NO_LIVE_LINK_TO_APPROVE");
    expect(payoutMsgs()).toBe(0);
    expect(db.deals[0].status).toBe("ACTIVE");
  });

  it("REVISION_DECLINED_LINKS left behind by a DRAFT decline does not unlock a payout", async () => {
    // The old draft-decline bug produced exactly this: the flow_state, and no live link.
    const { h, call, payoutMsgs } = lifecycle({ flow_state: "REVISION_DECLINED_LINKS" });
    const r = await call(h.handleThreadApproveLiveLinks, brand);
    expect(r.status).toBe(400);
    expect(payoutMsgs()).toBe(0);
  });

  it("no payout for an unfunded escrow", async () => {
    const { h, call } = lifecycle({ flow_state: "PROOF_SUBMITTED" }, { escrow_hold: false }, { chat_messages: [liveLinkMsg] });
    const r = await call(h.handleThreadApproveLiveLinks, brand);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("ESCROW_NOT_FUNDED");
  });

  it("no invented ₹5000 when the amount is missing", async () => {
    const { h, call } = lifecycle({ flow_state: "PROOF_SUBMITTED", agreed_amount: null }, { agreed_amount: null }, { chat_messages: [liveLinkMsg] });
    const r = await call(h.handleThreadApproveLiveLinks, brand);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("AMOUNT_UNKNOWN");
  });

  it("the brand's approval releases once; a second approval is a no-op", async () => {
    const { db, h, call, payoutMsgs } = underReview();
    const r1 = await call(h.handleThreadApproveLiveLinks, brand);
    expect(r1.status).toBe(200);
    expect(r1.json.amount).toBe(20000);
    expect(db.deals[0].status).toBe("COMPLETED");
    const r2 = await call(h.handleThreadApproveLiveLinks, brand);
    expect(r2.status).toBe(200);
    expect(r2.json.already_completed).toBe(true);
    expect(payoutMsgs()).toBe(1);
  });

  it("a refund row is never 'released' as the payout", async () => {
    const { db, h, call } = lifecycle({ flow_state: "PROOF_SUBMITTED" }, {}, {
      chat_messages: [liveLinkMsg],
      transactions: [{ id: "t_refund", deal_id: DEAL, status: "SUCCESS", refund_amount: 20000, refund_status: "PROCESSED", payout_status: "PENDING" }],
    });
    await call(h.handleThreadApproveLiveLinks, brand);
    expect(db.transactions[0].payout_status).toBe("PENDING");
  });
});

describe("live links: creator submits after approval; brand corrects; creator declines only a correction", () => {
  it("a completed deal is not reopened by a late live link", async () => {
    const { db, h, call } = lifecycle({ status: "COMPLETED", flow_state: "COMPLETED" }, { status: "COMPLETED" });
    const r = await call(h.handleThreadSubmitLiveLink, creator, { link: "https://instagram.com/p/x" });
    expect(r.status).toBe(409);
    expect(db.chat_threads[0].status).toBe("COMPLETED");
    expect(db.chat_threads[0].flow_state).toBe("COMPLETED");
  });

  it("the brand cannot submit the creator's live link", async () => {
    const { h, call } = lifecycle({ flow_state: "CONTENT_APPROVED" });
    const r = await call(h.handleThreadSubmitLiveLink, brand, { link: "https://instagram.com/p/x" });
    expect(r.status).toBe(403);
  });

  it("no live link before the draft is approved", async () => {
    const { h, call } = lifecycle({ flow_state: "SUBMITTED" });
    const r = await call(h.handleThreadSubmitLiveLink, creator, { link: "https://instagram.com/p/x" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DRAFT_NOT_APPROVED");
  });

  it("a second link while one is under review is refused (no duplicate card)", async () => {
    const { db, h, call } = lifecycle({ flow_state: "PROOF_SUBMITTED" });
    const r = await call(h.handleThreadSubmitLiveLink, creator, { link: "https://instagram.com/p/y" });
    expect(r.status).toBe(409);
    expect(db.chat_messages.length).toBe(0);
  });

  it("after approval the creator's link goes through", async () => {
    const { db, h, call } = lifecycle({ flow_state: "CONTENT_APPROVED" });
    const r = await call(h.handleThreadSubmitLiveLink, creator, { link: "https://instagram.com/p/x" });
    expect(r.status).toBe(200);
    expect(db.chat_threads[0].flow_state).toBe("PROOF_SUBMITTED");
  });

  it("legacy row: approval message without a flow_state still allows the link", async () => {
    const { h, call } = lifecycle({ flow_state: "ACTIVE" }, {}, { chat_messages: [{ thread_id: THREAD, message_type: "content_approved" }] });
    const r = await call(h.handleThreadSubmitLiveLink, creator, { link: "https://instagram.com/p/x" });
    expect(r.status).toBe(200);
  });

  it("only the brand requests a link correction, and only while a link is under review", async () => {
    const a = lifecycle({ flow_state: "PROOF_SUBMITTED" });
    expect((await a.call(a.h.handleThreadRejectLiveLinks, creator, { feedback: "x" })).status).toBe(403);
    const b = lifecycle({ flow_state: "CONTENT_APPROVED" });
    expect((await b.call(b.h.handleThreadRejectLiveLinks, brand, { feedback: "x" })).status).toBe(409);
    const c = lifecycle({ flow_state: "PROOF_SUBMITTED" });
    expect((await c.call(c.h.handleThreadRejectLiveLinks, brand, { feedback: "wrong post" })).status).toBe(200);
  });

  it("a live-link decline needs an open link correction", async () => {
    const { h, call } = lifecycle({ flow_state: "PROOF_SUBMITTED" });
    const r = await call(h.handleThreadDeclineLiveLinksResubmission, creator, { feedback: "no" });
    expect(r.status).toBe(409);
  });
});

describe("draft decline is a DRAFT decline", () => {
  it("declining draft changes gives REVISION_DECLINED and a revision_declined card — never the live-link payout card", async () => {
    const { db, h, call } = lifecycle({ flow_state: "CHANGES_REQUESTED" });
    const r = await call(h.handleCampaignDeclineDraftRevision, creator, { feedback: "The brief never asked for that" });
    expect(r.status).toBe(200);
    expect(db.chat_threads[0].flow_state).toBe("REVISION_DECLINED");
    expect(db.chat_messages[0].message_type).toBe("revision_declined");
    expect(db.chat_messages.some((m: any) => m.message_type === "live_links_resubmit_declined")).toBe(false);
  });

  it("…and the brand then cannot release escrow off it", async () => {
    const { h, call, payoutMsgs } = lifecycle({ flow_state: "CHANGES_REQUESTED" });
    await call(h.handleCampaignDeclineDraftRevision, creator, { feedback: "no" });
    const r = await call(h.handleThreadApproveLiveLinks, brand);
    expect(r.status).toBe(400);
    expect(payoutMsgs()).toBe(0);
  });

  it("…but the brand can approve the draft or ask again", async () => {
    const a = lifecycle({ flow_state: "REVISION_DECLINED" });
    expect((await a.call(a.h.handleThreadApproveContent, brand)).status).toBe(200);
    expect(a.db.chat_threads[0].flow_state).toBe("CONTENT_APPROVED");
    const b = lifecycle({ flow_state: "REVISION_DECLINED" });
    expect((await b.call(b.h.handleCampaignRevision, brand, { notes: "please" })).status).toBe(200);
  });

  it("only the creator declines, and only an open request", async () => {
    const a = lifecycle({ flow_state: "CHANGES_REQUESTED" });
    expect((await a.call(a.h.handleCampaignDeclineDraftRevision, brand, { feedback: "x" })).status).toBe(403);
    const b = lifecycle({ flow_state: "SUBMITTED" });
    expect((await b.call(b.h.handleCampaignDeclineDraftRevision, creator, { feedback: "x" })).status).toBe(409);
  });
});

describe("draft review", () => {
  it("the creator cannot approve their own draft", async () => {
    const { h, call } = lifecycle({ flow_state: "SUBMITTED" });
    expect((await call(h.handleThreadApproveContent, creator)).status).toBe(403);
  });

  it("nothing to approve before a draft exists", async () => {
    const { h, call } = lifecycle({ flow_state: "ACTIVE" });
    const r = await call(h.handleThreadApproveContent, brand);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("NO_DRAFT_TO_APPROVE");
  });

  it("approving twice does not post a second card", async () => {
    const { db, h, call } = lifecycle({ flow_state: "SUBMITTED" });
    await call(h.handleThreadApproveContent, brand);
    const r2 = await call(h.handleThreadApproveContent, brand);
    expect(r2.json.already_approved).toBe(true);
    expect(db.chat_messages.filter((m: any) => m.message_type === "content_approved").length).toBe(1);
  });

  it("no revision request without a draft", async () => {
    const { h, call } = lifecycle({ flow_state: "ACTIVE" });
    expect((await call(h.handleCampaignRevision, brand, { notes: "x" })).status).toBe(409);
  });

  it("a revision allowance of 0 means none", async () => {
    const { h, call } = lifecycle({ flow_state: "SUBMITTED" }, { revision_count: 0, revisions_used: 0 });
    const r = await call(h.handleCampaignRevision, brand, { notes: "fix" });
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------

function dealsChat(threadExtra: any = {}, messages: any[] = []) {
  const db: any = {
    chat_threads: [{ id: THREAD, deal_id: DEAL, campaign_id: "c1", brand_id: BRAND, creator_id: CREATOR, status: "NEGOTIATING", flow_state: "AI_AGREEMENT_READY", agreed_amount: 10000, ...threadExtra }],
    deals: [], chat_messages: [...messages],
  };
  const routes: Record<string, any> = {};
  const router: any = { post: (paths: any, fn: any) => { (Array.isArray(paths) ? paths : [paths]).forEach((p: string) => (routes[p] = fn)); } };
  let actor: any;
  const noop = async (_req: any, res: any) => res.json({});
  setupDealsChatRoutes({} as any, router, {
    supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {}, parseAuthUser: async () => actor,
    sendNotification: async () => {}, serializeChatMessage: (t: any) => t, insertChatMessageToSupabase: async () => {},
    parseThreadState: () => ({}), updateThreadState: async () => {}, enrichThread: (t: any) => t,
    handleThreadApproveLiveLinks: noop, handleThreadApproveContent: noop, handleThreadSubmitLiveLink: noop,
    handleThreadRejectLiveLinks: noop, handleThreadDeclineLiveLinksResubmission: noop, getIsTestMode: () => false,
  } as any);
  const call = async (path: string, user: any, body: any = {}) => {
    actor = user; let status = 200; let json: any;
    const res = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; } };
    await routes[path]({ params: { threadId: THREAD }, body, app: { get: () => null } }, res);
    return { status, json };
  };
  return { db, call };
}

describe("contract signing and negotiation", () => {
  it("an unrelated creator cannot sign someone else's contract", async () => {
    const { db, call } = dealsChat();
    const r = await call("/campaign/threads/:threadId/sign", { user_id: OTHER_CREATOR, role: "creator" });
    expect(r.status).toBe(403);
    expect(db.chat_threads[0].agreement_signed_creator).toBeFalsy();
  });

  it("an unrelated brand cannot sign as the brand", async () => {
    const { db, call } = dealsChat();
    const r = await call("/campaign/threads/:threadId/sign", { user_id: STRANGER, role: "brand" });
    expect(r.status).toBe(403);
    expect(db.chat_threads[0].agreement_signed_brand).toBeFalsy();
  });

  it("signing again does not drag the deal back to ACTIVE", async () => {
    const { db, call } = dealsChat({ status: "ACTIVE", flow_state: "PROOF_SUBMITTED", agreement_signed_creator: true, agreement_signed_brand: true });
    const r = await call("/campaign/threads/:threadId/sign", creator);
    expect(r.json.already_signed).toBe(true);
    expect(db.chat_threads[0].flow_state).toBe("PROOF_SUBMITTED");
    expect(db.chat_messages.length).toBe(0);
  });

  it("the parties still sign normally (with a verified-OTP sign token)", async () => {
    const { db, call } = dealsChat();
    // Session 21: /sign requires the one-time token /otp/verify issues for a contract code.
    expect((await call("/campaign/threads/:threadId/sign", creator)).json.code).toBe("SIGN_OTP_REQUIRED");
    expect((await call("/campaign/threads/:threadId/sign", creator, { sign_token: await issueSignToken(creator.user_id) })).status).toBe(200);
    expect((await call("/campaign/threads/:threadId/sign", brand, { sign_token: await issueSignToken(creator.user_id) })).json.code).toBe("SIGN_OTP_REQUIRED"); // someone else's token
    expect((await call("/campaign/threads/:threadId/sign", brand, { sign_token: await issueSignToken(brand.user_id) })).status).toBe(200);
    expect(db.chat_threads[0].agreement_signed_creator).toBe(true);
    expect(db.chat_threads[0].agreement_signed_brand).toBe(true);
  });

  it("the creator cannot accept their own counter as the brand", async () => {
    const { db, call } = dealsChat({ flow_state: "NEGOTIATING_COUNTER", counter_amount: 15000 });
    const r = await call("/campaign/threads/:threadId/brand-accept-counter", creator, { amount: 99000 });
    expect(r.status).toBe(403);
    expect(db.chat_threads[0].agreed_amount).toBe(10000);
  });

  it("the brand accepts the PROPOSED amount, not one it names", async () => {
    const { db, call } = dealsChat(
      { flow_state: "NEGOTIATING_COUNTER", counter_amount: 15000 },
      [{ thread_id: THREAD, message_type: "negotiation_offer", metadata: { proposed_amount: 15000 } }]
    );
    const r = await call("/campaign/threads/:threadId/brand-accept-counter", brand, { amount: 1 });
    expect(r.status).toBe(200);
    expect(db.chat_threads[0].agreed_amount).toBe(15000);
  });

  it("no counter to accept outside NEGOTIATING_COUNTER", async () => {
    const { call } = dealsChat({ flow_state: "AI_AGREEMENT_READY" });
    expect((await call("/campaign/threads/:threadId/brand-accept-counter", brand)).status).toBe(409);
  });

  it("the one-call both-signatures shortcut is retired", async () => {
    const { db, call } = dealsChat({ amount_fixed: 10000 });
    const r = await call("/campaign/threads/:threadId/creator-approve-agreement", brand);
    expect(r.status).toBe(410);
    expect(db.chat_threads[0].agreement_signed_creator).toBeFalsy();
  });

  it("only the brand prepares the agreement, and not after anyone signed", async () => {
    const a = dealsChat({ flow_state: "NEGOTIATING" });
    expect((await a.call("/campaign/threads/:threadId/approve-request", creator)).status).toBe(403);
    const b = dealsChat({ agreement_signed_creator: true });
    expect((await b.call("/campaign/threads/:threadId/approve-request", brand)).status).toBe(409);
  });

  it("the creator cannot mark the escrow paid", async () => {
    const { call } = dealsChat({ flow_state: "ACTIVE" });
    const r = await call("/campaign/threads/:threadId/pay", creator);
    expect(r.status).toBe(403);
  });
});

describe("guard helpers", () => {
  it("revisionAllowance keeps 0 as 0", () => {
    expect(revisionAllowance(0, 3)).toBe(0);
    expect(revisionAllowance(null, undefined)).toBe(5);
    expect(revisionAllowance(undefined, 2)).toBe(2);
  });
  it("knownAmount never invents a figure", () => {
    expect(knownAmount(null, undefined, 0)).toBe(0);
    expect(knownAmount(null, "12000")).toBe(12000);
  });
  it("a refund row is not an escrow deposit", () => {
    expect(isEscrowDepositRow({ status: "SUCCESS" })).toBe(true);
    expect(isEscrowDepositRow({ status: "SUCCESS", refund_amount: 100 })).toBe(false);
    expect(isEscrowDepositRow({ status: "PENDING" })).toBe(false);
  });
  it("partyRole understands team members acting for a brand", () => {
    const t = { brand_id: BRAND, creator_id: CREATOR };
    expect(partyRole({ user_id: "team1", parent_brand_id: BRAND, role: "brand" }, t)).toBe("brand");
    expect(partyRole({ user_id: OTHER_CREATOR, role: "creator" }, t)).toBe(null);
    expect(partyRole({ user_id: "x", role: "admin" }, t)).toBe("admin");
  });
});

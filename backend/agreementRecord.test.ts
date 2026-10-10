import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { buildAgreementRow, normalizeAgreementText, recordAgreementSignature, sha256Hex, textShowsAmount } from "./agreementRecord";
import { issueSignToken, consumeSignToken, noteSignEmail, takeLastSignMeta } from "./signTokens";
import { setupDealsChatRoutes } from "./deals_chat_routes";
import { captureAgreementText } from "../src/lib/agreementCapture";

// Session 28 (Ravi): every OTP signature leaves a permanent record (public.agreement_signatures).
const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const TEXT = "Partnership Contract\n1. Scope of Work\n2. Budget: the total compensation is ₹10,000 held in escrow.\n3. Timeline\n4. Licence";

describe("record contents", () => {
  it("hash is sha256 of the exact stored text (same as Postgres digest)", () => {
    expect(sha256Hex("test")).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  });
  it("text is normalised the same way on screen and server", () => {
    const raw = "  A  \r\n\r\n\r\n\r\n  B \n";
    expect(normalizeAgreementText(raw)).toBe("A\n\nB");
    const el: any = { innerText: raw };
    expect(captureAgreementText(el)).toBe(normalizeAgreementText(raw));
  });
  it("keeps the screen text, version, OTP email/time, IP and device", () => {
    const row = buildAgreementRow({
      kind: "campaign", signerRole: "brand", user: { user_id: "b1", name: "Brand Co" },
      req: { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1", "user-agent": "UA/1" }, body: { agreement_text: TEXT, agreement_version: "campaign-v0-desktop" } },
      signMeta: { email: "poc@brand.in", verifiedAt: "2026-09-29T10:00:00.000Z" }, threadId: "t1", amount: 10000,
    });
    expect(row.agreement_text).toBe(normalizeAgreementText(TEXT));
    expect(row.text_sha256).toBe(sha256Hex(row.agreement_text));
    expect(row.agreement_version).toBe("campaign-v0-desktop");
    expect(row).toMatchObject({ signer_email: "poc@brand.in", otp_verified_at: "2026-09-29T10:00:00.000Z", ip_address: "1.2.3.4", user_agent: "UA/1", signer_role: "brand", thread_id: "t1", amount: 10000 });
  });
  it("marks a screen text that does not show the deal amount", () => {
    const row = buildAgreementRow({ kind: "campaign", signerRole: "creator", user: { user_id: "c1" }, req: { body: { agreement_text: TEXT, agreement_version: "v" } }, signMeta: { verifiedAt: "x" }, amount: 25000 });
    expect(row.agreement_version).toBe("v|amount-not-in-text");
    expect(textShowsAmount("pay ₹1,00,000 now", 100000)).toBe(true);
    expect(textShowsAmount("pay 100,000 now", 100000)).toBe(true);
  });
  it("no screen text → honest summary, marked text-not-captured (never invented terms)", () => {
    const row = buildAgreementRow({ kind: "ugc", signerRole: "creator", user: { user_id: "c1" }, req: { body: {} }, signMeta: { verifiedAt: "x" }, amount: 3000, summary: ["Order: o1"] });
    expect(row.agreement_version).toBe("ugc-unversioned|text-not-captured");
    expect(row.agreement_text).toMatch(/did not send its text/);
    expect(row.agreement_text).toMatch(/Order: o1/);
  });
});

describe("writing the record", () => {
  const input = (over: any = {}) => ({ kind: "ugc" as const, signerRole: "creator" as const, user: { user_id: "c1" }, req: { body: { agreement_text: TEXT } }, signMeta: { email: "c@x.in", verifiedAt: "2026-09-29T10:00:00Z" }, orderId: "o1", ...over });
  it("inserts into agreement_signatures", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const r = await recordAgreementSignature({ from: (t: string) => { expect(t).toBe("agreement_signatures"); return { insert }; } }, null, input());
    expect(r.ok).toBe(true);
    expect((insert.mock.calls[0] as any)[0].order_id).toBe("o1");
  });
  it("a second identical signature is a duplicate, not an error", async () => {
    const r = await recordAgreementSignature({ from: () => ({ insert: async () => ({ error: { code: "23505", message: "dup" } }) }) }, null, input());
    expect(r).toMatchObject({ ok: true, duplicate: true });
  });
  it("a database failure never throws (signing must not break)", async () => {
    const r = await recordAgreementSignature({ from: () => ({ insert: async () => { throw new Error("down"); } }) }, null, input());
    expect(r.ok).toBe(false);
  });
  it("a non-admin signature without a verified OTP is never written", async () => {
    const insert = vi.fn();
    const r = await recordAgreementSignature({ from: () => ({ insert }) }, null, input({ signMeta: null }));
    expect(r.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
  it("local dev keeps records on the local db, once", async () => {
    const db: any = {};
    await recordAgreementSignature(null, db, input());
    await recordAgreementSignature(null, db, input());
    expect(db.agreement_signatures).toHaveLength(1);
  });
});

describe("sign token remembers the verified email and time", () => {
  it("the email noted at /otp/verify comes back once, right after the token is consumed", async () => {
    noteSignEmail("u1", "A@B.in");
    const t = await issueSignToken("u1");
    expect(takeLastSignMeta("u1")).toBeNull(); // nothing consumed yet
    expect(await consumeSignToken("u1", t)).toBe(true);
    const meta = takeLastSignMeta("u1");
    expect(meta?.email).toBe("a@b.in");
    expect(meta?.verifiedAt).toBeTruthy();
    expect(takeLastSignMeta("u1")).toBeNull(); // read once
    expect(await consumeSignToken("u1", t)).toBe(false); // token still one-use
    expect(await consumeSignToken("u2", await issueSignToken("u1"))).toBe(false);
    expect(takeLastSignMeta("u2")).toBeNull();
  });
});

describe("campaign sign route saves the record", () => {
  it("brand signs with OTP → record with screen text, OTP email and thread", async () => {
    const db: any = { chat_threads: [{ id: "T1", deal_id: "D1", campaign_id: "c1", brand_id: "B1", creator_id: "C1", status: "NEGOTIATING", agreed_amount: 10000 }], deals: [], chat_messages: [] };
    const routes: Record<string, any> = {};
    const router: any = { post: (paths: any, fn: any) => { (Array.isArray(paths) ? paths : [paths]).forEach((p: string) => (routes[p] = fn)); } };
    const actor = { user_id: "B1", role: "brand", name: "Brand Co" };
    const noop = async (_req: any, res: any) => res.json({});
    setupDealsChatRoutes({} as any, router, {
      supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {}, parseAuthUser: async () => actor,
      sendNotification: async () => {}, serializeChatMessage: (t: any) => t, insertChatMessageToSupabase: async () => {},
      parseThreadState: () => ({}), updateThreadState: async () => {}, enrichThread: (t: any) => t,
      handleThreadApproveLiveLinks: noop, handleThreadApproveContent: noop, handleThreadSubmitLiveLink: noop,
      handleThreadRejectLiveLinks: noop, handleThreadDeclineLiveLinksResubmission: noop, getIsTestMode: () => false,
    } as any);
    let status = 200;
    const res: any = { status(s: number) { status = s; return this; }, json() { return this; } };
    noteSignEmail("B1", "poc@brand.in");
    const token = await issueSignToken("B1");
    await routes["/campaign/threads/:threadId/sign"]({ params: { threadId: "T1" }, headers: { "x-forwarded-for": "5.6.7.8" }, body: { sign_token: token, agreement_text: TEXT, agreement_version: "campaign-v0-desktop" }, app: { get: () => null } }, res);
    expect(status).toBe(200);
    expect(db.agreement_signatures).toHaveLength(1);
    expect(db.agreement_signatures[0]).toMatchObject({ agreement_type: "campaign", signer_role: "brand", signer_email: "poc@brand.in", thread_id: "T1", deal_id: "D1", ip_address: "5.6.7.8", agreement_version: "campaign-v0-desktop" });
  });
});

describe("wiring", () => {
  it("every OTP sign route records the signature", () => {
    expect(read("backend/deals_chat_routes.ts")).toMatch(/recordAgreementSignature\(/);
    expect(read("backend/deals_routes.ts")).toMatch(/recordAgreementSignature\(/);
    expect((read("backend/ugc_routes.ts").match(/recordAgreementSignature\(/g) || []).length).toBe(2); // claim + sign
    for (const f of ["backend/deals_chat_routes.ts", "backend/deals_routes.ts", "backend/ugc_routes.ts"]) expect(read(f)).toMatch(/takeLastSignMeta\(user\.user_id\)/);
  });
  it("the main signing screens send the text they showed", () => {
    // Session 30 (Ravi: new agreement v1): every screen renders the agreement from
    // src/lib/agreementTerms.js and sends that same object's text — the record = what was shown.
    expect(read("src/components/chat/ContractModal.jsx")).toMatch(/agreementFields\(asCaptureSource\(agreementV1\), AGREEMENT_VERSIONS\.campaignDesktop\)/);
    expect(read("src/components/chat/ContractModal.jsx")).toMatch(/<AgreementTermsPanel agreement=\{agreementV1\}/);
    expect(read("src/components/chat/mobile/MobileContractSheet.jsx")).toMatch(/agreementText: agreementPlainText\(agreementV1\)/);
    expect(read("src/components/chat/mobile/MobileContractSheet.jsx")).toMatch(/<AgreementTermsPanel agreement=\{agreementV1\}/);
    expect(read("src/components/chat/mobile/useChatThreadMobile.js")).toMatch(/agreement_text: agreementText/);
    expect((read("src/components/chat/UGCContractModal.jsx").match(/agreementFields\(asCaptureSource\(agreementV1\)/g) || []).length).toBe(2);
    expect(read("src/pages/creator/CreatorUGCMobile.jsx")).toMatch(/agreementFields\(asCaptureSource\(buildUgcAgreement\(selectedBrief\)\)/);
  });
  it("complete wipe removes records only through the database function", () => {
    const src = read("backend/admin_wipe_routes.ts");
    expect(src).toMatch(/rpc\("wipe_agreement_signatures"/);
    expect(src).not.toMatch(/from\("agreement_signatures"\)\.delete/);
  });
  it("admin can read records; nobody can write them through the API", () => {
    const src = read("backend/admin_agreements_routes.ts");
    expect(src).toMatch(/router\.get\("\/admin\/agreements"/);
    expect(src).not.toMatch(/router\.(post|put|patch|delete)\(/);
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { deriveDealState } from "../dealState";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const campaign = (extra) => ({ id: "t1", campaign_id: "c1", deal_id: "d1", ...extra });

describe("mobile chat uses desktop deal state (session 23)", () => {
  it("both signed but not paid is NOT funded (mobile used to say 'Escrow secured')", () => {
    const s = deriveDealState({ thread: campaign({ status: "ACTIVE", flow_state: "ACTIVE", agreement_signed_brand: true, agreement_signed_creator: true }), messages: [], isBrand: true });
    expect(s.isAgreementSigned).toBe(true);
    expect(s.isPaymentFunded).toBe(false);
  });
  it("payment_funded from the server counts as funded (mobile ignored it)", () => {
    const s = deriveDealState({ thread: campaign({ status: "ACTIVE", payment_funded: true, agreement_signed_brand: true, agreement_signed_creator: true }), messages: [] });
    expect(s.isPaymentFunded).toBe(true);
  });
  it("negotiating: price not fixed, so no signing yet", () => {
    const s = deriveDealState({ thread: campaign({ status: "NEGOTIATING", flow_state: "NEGOTIATING_COUNTER" }), messages: [] });
    expect(s.isDealFixed).toBe(false);
  });
  it("an old revision does not keep the deal in 'revision' once a new draft is in", () => {
    const messages = [
      { message_type: "content_proof_submitted" },
      { message_type: "revision_requested" },
      { message_type: "content_proof_submitted" },
    ];
    const s = deriveDealState({ thread: campaign({ status: "ACTIVE", payment_funded: true, agreement_signed_brand: true, agreement_signed_creator: true }), messages });
    expect(s.isRevisionRequested).toBe(false);
    expect(s.isContentSubmitted).toBe(true);
  });
});

describe("mobile chat wiring (session 23)", () => {
  const box = read("src/components/chat/mobile/ChatBoxMobile.jsx");
  const hook = read("src/components/chat/mobile/useChatThreadMobile.js");
  const escrow = read("src/components/chat/mobile/MobileEscrowSheet.jsx");
  const payout = read("src/components/chat/mobile/MobilePayoutCard.jsx");

  it("flags come from dealState; negotiation uses the desktop NegotiationTable", () => {
    expect(box).toContain("deriveDealState({ thread: currentThread, messages, isBrand })");
    expect(box).toContain("<NegotiationTable");
    expect(box).not.toContain("// Comprehensive collaboration stage flags");
  });
  it("escrow: real Razorpay payment (same call as desktop), no fake 'secured', no invented fee", () => {
    expect(hook).toContain("await processRazorpayPayment({");
    expect(escrow).toContain("onPay");
    expect(escrow).not.toMatch(/Platform fee/);
  });
  it("a UGC approval (releases payout) asks first", () => {
    expect(hook).toMatch(/isUgcOrder && typeof window !== "undefined" && !window\.confirm\(/);
  });
  it("accept/counter merge the returned thread, not the response envelope", () => {
    expect(hook).not.toContain("setLocalThread((prev) => ({ ...prev, ...data }))");
    expect(hook).toContain("if (data?.thread) setLocalThread((prev) => ({ ...prev, ...data.thread }));");
  });
  it("payout card: real receipt, no print/alert stubs, admin alert for the creator only", () => {
    expect(payout).not.toContain("window.print");
    expect(payout).not.toContain('alert("Deliverable file ready for download")');
    expect(payout).toContain("<InvoiceModal");
    expect(payout).toContain("{!isBrand && (");
  });
  it("'+' only opens what the task button offers this user", () => {
    expect(box).toContain("{plusSheet && (");
    expect(box).toMatch(/const plusSheet = !isBrand && !isDealCompleted && isPaymentFunded/);
  });
});

describe("mobile chat bubbles + deliverable upload (session 23)", () => {
  it("text bubble sizes to its message (no fixed 302px width)", () => {
    const s = read("src/components/chat/mobile/MobileMessageRow.jsx");
    expect(s).not.toContain("width: 302,");
    expect(s).toContain('width: "fit-content",');
  });
  it("upload uses desktop's UGC detection, order-id fallback and payload; supports a drive link", () => {
    const h = read("src/components/chat/mobile/useChatThreadMobile.js");
    expect(h).toContain("async (file, notes, link) => {");
    expect(h).toContain("const asUgc = Boolean(isUgcOrder || targetUgcOrderId);");
    expect(h).toContain("content_url: finalVideoUrl,");
    const sheet = read("src/components/chat/mobile/MobileUploadSheet.jsx");
    expect(sheet).toContain('label="Drive link"');
    expect(sheet).toContain("toast.error(`This video is");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const CAMPAIGNS = read("backend", "campaigns_routes.ts");
const PAYMENTS = read("backend", "payment_routes.ts");
const CREATORS = read("backend", "creators_routes.ts");
const BUBBLE = read("src", "components", "chat", "MessageBubble.jsx");
const CARDS = read("src", "components", "chat", "ShortlistCards.jsx");

// Shortlisting used to post one plain text line with no renderer, so it appeared as an
// ordinary chat bubble: no fee, no note, nothing to act on. And the only negotiation button
// in the thread belonged to the creator — the person who had set the price.

describe("shortlisting posts both cards", () => {
  it("sends the brand's congratulations", () => {
    expect(CAMPAIGNS).toContain("message_type: 'campaign_approved'");
  });

  it("replays the creator's application as a second message", () => {
    expect(CAMPAIGNS).toContain("message_type: 'creator_application_offer'");
  });

  it("the offer is sent AS THE CREATOR, not the brand", () => {
    // This is what puts each card on the correct side for each party, and it is also true:
    // these are the creator's terms. Sending it as the brand would show the creator their
    // own offer as an incoming message.
    const offerBlock = CAMPAIGNS.slice(
      CAMPAIGNS.indexOf("creator_application_offer") - 900,
      CAMPAIGNS.indexOf("creator_application_offer") + 900
    );
    expect(offerBlock).toContain("sender_user_id: app.creator_id");
  });

  it("carries the fee and the creator's own note", () => {
    expect(CAMPAIGNS).toContain("proposed_fee: Number(app.proposed_amount");
    expect(CAMPAIGNS).toContain("pitch: app.pitch");
  });
});

describe("card rendering", () => {
  it("both types are routed to the cards", () => {
    expect(BUBBLE).toContain("msgType === 'campaign_approved'");
    expect(BUBBLE).toContain("msgType === 'creator_application_offer'");
  });

  it("alignment comes from isMine, so each side sees the mirror", () => {
    const block = BUBBLE.slice(
      BUBBLE.indexOf("msgType === 'campaign_approved'"),
      BUBBLE.indexOf("msgType === 'campaign_approved'") + 700
    );
    expect(block).toContain('isMine ? "justify-end" : "justify-start"');
  });

  it("only the brand gets Accept and Negotiate", () => {
    // If the creator saw these, they would accept their own price every time and the brand
    // would never get to negotiate at all — which is the whole reason for this change.
    expect(CARDS).toContain("isUserBrand ? (");
    expect(CARDS).toContain("Awaiting brand response");
  });

  it("the congratulations card carries no action", () => {
    const congrats = CARDS.slice(
      CARDS.indexOf("export function ShortlistCongratsCard"),
      CARDS.indexOf("export function CreatorApplicationOfferCard")
    );
    expect(congrats).not.toContain("<button");
  });

  it("says the offer came with the application", () => {
    expect(CARDS).toContain("Submitted with application");
  });
});

describe("a rejected creator is told", () => {
  it("sends a notification on reject", () => {
    expect(CAMPAIGNS).toContain("type: 'application_rejected'");
  });

  it("does not open a chat thread to say no", () => {
    const rejectBlock = CAMPAIGNS.slice(
      CAMPAIGNS.indexOf("application_rejected") - 1200,
      CAMPAIGNS.indexOf("application_rejected") + 400
    );
    expect(rejectBlock).not.toContain("chat_threads");
  });
});

describe("payout details resolve from wherever the creator entered them", () => {
  it("reads creator_kyc as well as creator_profiles", () => {
    // KYC wrote to creator_kyc; the payout modal read creator_profiles. The details were in
    // the database the whole time and the modal still said "Not set".
    expect(PAYMENTS).toContain("from('creator_kyc')");
    expect(PAYMENTS).toContain("creatorKycMap");
  });

  it("keys creator_kyc on creator_id, not user_id", () => {
    // Different table, different key. Getting this wrong returns an error that the code
    // logs and then carries on with empty maps — silently back to "Not set".
    expect(PAYMENTS).toContain("creatorKyc || []).map((k: any) => [k.creator_id, k]");
  });

  it("uses creator_kyc's own column names", () => {
    expect(PAYMENTS).toContain("bank_account_no");
    expect(PAYMENTS).toContain("bank_holder_name");
  });

  it("KYC submission mirrors the details onto creator_profiles", () => {
    expect(CREATORS).toContain("payoutMirror");
    expect(CREATORS).toContain("from('creator_profiles')");
  });
});

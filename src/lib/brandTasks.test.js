import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buildBrandTasks, brandDealStep, brandProfileStrength } from "./brandTasks";

const NOW = new Date("2026-10-06T12:00:00Z").getTime();
const fullProfile = { company_name: "Acme", logo: "x.png", industry: "Food", description: "We cook", website: "acme.in" };

describe("brandDealStep (session 34)", () => {
  it("brand's turn: creator counter only when the last message is the creator's offer", () => {
    const base = { id: "t1", creator_id: "c1", flow_state: "NEGOTIATING_COUNTER" };
    expect(brandDealStep({ ...base, last_message: { message_type: "negotiation_offer", sender_user_id: "c1" } })).toBe("counter");
    expect(brandDealStep({ ...base, last_message: { message_type: "negotiation_offer", sender_user_id: "b1" } })).toBe(null);
    expect(brandDealStep({ ...base, last_message: { message_type: "text", sender_user_id: "c1" } })).toBe(null);
  });
  it("sign, then fund, then nothing", () => {
    expect(brandDealStep({ id: "t", flow_state: "AI_AGREEMENT_READY" })).toBe("sign");
    expect(brandDealStep({ id: "t", flow_state: "AI_AGREEMENT_READY", agreement_signed_brand: true })).toBe(null);
    expect(brandDealStep({ id: "t", flow_state: "AI_AGREEMENT_READY", agreement_signed_brand: true, agreement_signed_creator: true })).toBe("fund");
    expect(brandDealStep({ id: "t", flow_state: "ACTIVE", agreement_signed_brand: true, agreement_signed_creator: true, payment_funded: true })).toBe(null);
  });
  it("draft / live link waiting on the brand; UGC and ended threads are skipped", () => {
    expect(brandDealStep({ id: "t", flow_state: "SUBMITTED" })).toBe("review_draft");
    expect(brandDealStep({ id: "t", flow_state: "PROOF_SUBMITTED" })).toBe("review_link");
    expect(brandDealStep({ id: "t", flow_state: "SUBMITTED", is_ugc: true })).toBe(null);
    expect(brandDealStep({ id: "t", flow_state: "COMPLETED" })).toBe(null);
  });
});

describe("buildBrandTasks (session 34)", () => {
  it("Ravi's order: review → deal room → applicants → KYC → profile", () => {
    const tasks = buildBrandTasks({
      ugcOrders: [{ id: "u1", status: "SUBMITTED", creator_name: "Neha", creator_payout: 2000 }, { id: "u2", status: "ACCEPTED" }],
      threads: [
        { id: "t1", creator_id: "c1", flow_state: "AI_AGREEMENT_READY", agreed_amount: 5000, campaign_title: "Winter" },
        { id: "t2", creator_id: "c2", flow_state: "NEGOTIATING_COUNTER", counter_amount: 7000, last_message: { message_type: "negotiation_offer", sender_user_id: "c2" } },
      ],
      applications: [{ campaign_id: "k1", status: "PENDING" }, { campaign_id: "k1", status: "PENDING" }, { campaign_id: "k1", status: "ACCEPTED" }],
      campaigns: [{ campaign_id: "k1", title: "Diwali" }],
      kycStatus: null,
      profile: { company_name: "Acme" }, profileLoaded: true, now: NOW,
    });
    expect(tasks.map((t) => t.id)).toEqual(["ugc_draft_u1", "deal_counter_t2", "deal_sign_t1", "applicants_k1", "kyc", "profile"]);
    expect(tasks[0].action.to).toBe("/brand/ugc/orders");
    expect(tasks[1].action.to).toBe("/brand/inbox/t2");
    expect(tasks[1].m1v).toBe("₹7,000");
    expect(tasks[3].title).toBe("2 new applicants to review");
    expect(tasks[3].brand).toBe("Diwali");
    expect(tasks[3].action.to).toBe("/brand/campaigns/k1/applicants");
  });
  it("no always-on promo tasks", () => {
    const ids = buildBrandTasks({ kycStatus: "approved", profile: fullProfile, profileLoaded: true }).map((t) => t.id);
    expect(ids).toEqual(["post_campaign", "explore_creators"]);
    const s = fs.readFileSync(path.join(process.cwd(), "src/components/dashboard/BrandDashboard.jsx"), "utf8");
    expect(s).not.toContain("Pre-fund campaign escrow");
    expect(s).not.toContain("Need Custom Social Ads?");
    expect(s).toContain("buildBrandTasks(");
  });
  it("KYC under review, and no profile task before the profile is loaded", () => {
    const tasks = buildBrandTasks({ kycStatus: "pending", profileLoaded: false });
    expect(tasks.map((t) => t.id)).toEqual(["kyc_review"]);
  });
  it("profile strength from the brand_profiles row", () => {
    expect(brandProfileStrength(fullProfile)).toEqual({ percent: 100, missing: [] });
    expect(brandProfileStrength({ company_name: "Acme" }).missing).toEqual(["Logo", "Industry", "About", "Website"]);
  });
});

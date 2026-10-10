import { describe, it, expect } from "vitest";
import { buildCreatorInviteActions, buildBrandApplicationActions, quickActionHiddenOn } from "./quickActionsData";

describe("quick actions (session 41)", () => {
  it("creator: only invites still waiting, with real brand details and no placeholder facts", () => {
    const cards = buildCreatorInviteActions({
      invitations: [
        { id: "i1", status: "pending_creator_acceptance", brand_name: "Skullcandy", brand_logo: "x.png", campaign_title: "Summer drop", proposed_budget: "8000", deliverables: "Standard Deliverables", timeline: "Flexible" },
        { id: "i2", status: "accepted", brand_name: "Old" },
      ],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "invite:i1", kind: "invite", title: "Skullcandy", photo: "x.png" });
    expect(cards[0].facts).toEqual(["₹8,000"]); // "Standard Deliverables" / "Flexible" are fillers, not shown
  });

  it("brand: only pending applications, with quote and pitch", () => {
    const cards = buildBrandApplicationActions([
      { c: { campaign_id: "c1", title: "Launch" }, apps: [
        { application_id: "a1", status: "PENDING", full_name: "Asha", instagram_handle: "asha", proposed_amount: 5000, pitch_text: "I love it", followers_count: "12K" },
        { application_id: "a2", status: "ACCEPTED", full_name: "Done" },
      ] },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "app:a1", campaignId: "c1", title: "Asha", subtitle: "@asha", note: "I love it" });
    expect(cards[0].facts).toContain("Quote ₹5,000");
  });

  it("never opens inside chat, onboarding or admin", () => {
    expect(quickActionHiddenOn("/chat/t1")).toBe(true);
    expect(quickActionHiddenOn("/creator/inbox")).toBe(true);
    expect(quickActionHiddenOn("/onboarding")).toBe(true);
    expect(quickActionHiddenOn("/dashboard")).toBe(false);
  });
});

describe("quick actions — your turn in a deal (session 41)", () => {
  it("only threads the inbox marks as needing you; never 'waiting' ones", async () => {
    const { buildDealTurnActions } = await import("./quickActionsData");
    const chip = (t) => t.c;
    const cards = buildDealTurnActions([
      { id: "t1", c: { key: "contract", label: "Sign contract", needsAction: true }, brand: { company_name: "Skullcandy" }, campaign_title: "Drop" },
      { id: "t2", c: { key: "contract", label: "Waiting on brand", needsAction: true } },
      { id: "t3", c: { key: "live", label: "Live", needsAction: false } },
    ], false, chip);
    expect(cards.map((c) => c.threadId)).toEqual(["t1"]);
    expect(cards[0]).toMatchObject({ kind: "deal", title: "Skullcandy", headline: "Sign contract", acceptLabel: "Open chat" });
  });
});

import { describe, it, expect } from "vitest";
import { hiredCreatorIds } from "./hiredCreators";

// Session 33: "Hired" = escrow funded deal for this campaign (applications never say "hired").
describe("hiredCreatorIds", () => {
  it("counts only this campaign's funded deals", () => {
    const threads = [
      { campaign_id: "c1", creator_id: "a", flow_state: "ACTIVE" },
      { campaign_id: "c1", creator_id: "b", flow_state: "NEGOTIATING" },
      { campaign_id: "c1", creator_id: "c", flow_state: "AI_AGREEMENT_READY", escrow_funded: true },
      { campaign_id: "c2", creator_id: "d", flow_state: "COMPLETED" },
    ];
    expect([...hiredCreatorIds(threads, "c1")].sort()).toEqual(["a", "c"]);
  });
});

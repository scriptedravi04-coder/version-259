import { describe, it, expect } from "vitest";
import { setupCampaignManageRoutes, applyBlockReason, countMatchingCreators } from "./campaignManage";

// Session 30: pause / close / matching creators + the apply guard (no Supabase: local db).
function harness(user: any) {
  const db: any = {
    campaigns: [{ campaign_id: "C1", brand_user_id: "B1", status: "live", categories: ["Beauty", "Fashion"] }],
    creator_profiles: [{ user_id: "u1", categories: ["beauty"] }, { user_id: "u2", niche: "Tech" }, { user_id: "u3", category: "fashion" }],
  };
  const routes: Record<string, any> = {};
  const router: any = {
    get: (p: string, h: any) => { routes["GET " + p] = h; },
    post: (p: string, h: any) => { routes["POST " + p] = h; },
  };
  setupCampaignManageRoutes(router, {
    supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {},
    parseAuthUser: async () => user, getActingBrandId: (u: any) => u.user_id,
  });
  const call = async (key: string, params: any = {}, body: any = {}) => {
    let status = 200, json: any = null, nexted = false;
    const res: any = { status: (s: number) => { status = s; return res; }, json: (j: any) => { json = j; return res; } };
    await routes[key]({ params, body }, res, () => { nexted = true; });
    return { status, json, nexted };
  };
  return { db, call };
}

describe("campaign manage", () => {
  it("only the owner can pause", async () => {
    const other = harness({ user_id: "B2", role: "brand" });
    expect((await other.call("POST /campaigns/:id/applications-paused", { id: "C1" }, { paused: true })).status).toBe(403);
    const owner = harness({ user_id: "B1", role: "brand" });
    const r = await owner.call("POST /campaigns/:id/applications-paused", { id: "C1" }, { paused: true });
    expect(r.status).toBe(200);
    expect(owner.db.campaigns[0].applications_paused).toBe(true);
    expect(owner.db.campaigns[0].applications_paused_by).toBe("B1");
    expect(owner.db.campaigns[0].applications_paused_at).toBeTruthy();
  });

  it("apply guard refuses a paused campaign and lets others through", async () => {
    const h = harness({ user_id: "B1", role: "brand" });
    expect((await h.call("POST /campaigns/apply", {}, { campaign_id: "C1" })).nexted).toBe(true);
    h.db.campaigns[0].applications_paused = true;
    const r = await h.call("POST /campaigns/apply", {}, { campaign_id: "C1" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("APPLICATIONS_CLOSED");
  });

  it("close marks completed with who/when; closed campaigns refuse applications", async () => {
    const h = harness({ user_id: "B1", role: "brand" });
    expect((await h.call("POST /campaigns/:id/close", { id: "C1" })).status).toBe(200);
    expect(h.db.campaigns[0].status).toBe("completed");
    expect(h.db.campaigns[0].closed_by).toBe("B1");
    expect(applyBlockReason(h.db.campaigns[0])).toMatch(/closed/);
  });

  it("drafts cannot be closed", async () => {
    const h = harness({ user_id: "B1", role: "brand" });
    h.db.campaigns[0].status = "draft";
    expect((await h.call("POST /campaigns/:id/close", { id: "C1" })).status).toBe(409);
  });

  it("matching creators = category overlap, count only", async () => {
    const h = harness({ user_id: "B1", role: "brand" });
    const r = await h.call("GET /campaigns/:id/matching-creators", { id: "C1" });
    expect(r.json.count).toBe(2);
    expect(countMatchingCreators({ categories: [] }, [{ categories: ["x"] }])).toBe(0);
  });
});

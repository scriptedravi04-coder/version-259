// Session 38 part 2 (Ravi: "YE SAB BANAO"): chat moderation + pitch leads + referral activity in
// Supabase, payout only after brand approval, generated campaign numbers for creators only.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { chatModeration, newModerationEvent, toAdminViolation, violationType } from "./chatModeration";
import { pitchStatusFromInvite, countNewUnclaimedPitches } from "./pitchLeads";
import { payoutRequestBlock, PAYOUT_READY_DEAL_STATUSES } from "./payoutMethods";
// @ts-ignore — plain JS module
import { campaignStatsFor, seesRealCampaignStats, campaignAvatarsFor, realAppliedCount } from "../src/utils/campaignStatsForViewer.js";

const read = (f: string) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

function fakeClient() {
  const tables: Record<string, any[]> = {};
  const q = (table: string) => {
    const rows = () => (tables[table] = tables[table] || []);
    let filters: Array<(r: any) => boolean> = [];
    let patch: any = null;
    const api: any = {
      insert: async (arr: any[]) => { rows().push(...arr); return { error: null }; },
      select: () => api,
      order: () => api,
      in: (col: string, vals: any[]) => { filters.push((r) => vals.includes(r[col])); return api; },
      eq: (col: string, v: any) => { filters.push((r) => r[col] === v); return api; },
      update: (p: any) => { patch = p; return api; },
      range: async (f: number, t: number) => ({ data: rows().filter((r) => filters.every((fn) => fn(r))).slice(f, t + 1), error: null }),
      then: (res: any) => {
        const hit = rows().filter((r) => filters.every((fn) => fn(r)));
        if (patch) hit.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: hit, error: null }).then(res);
      },
    };
    return api;
  };
  return { from: q, tables };
}

describe("chat moderation in Supabase", () => {
  it("records, lists with names, and resolves", async () => {
    const c = fakeClient();
    c.tables.users = [{ user_id: "u1", name: "Asha", email: "a@x.in", role: "creator" }];
    const db: any = {};
    const m = chatModeration({ getClient: () => c, getDb: () => db, saveDb: () => {} });
    const ev = newModerationEvent({ threadId: "t1", senderId: "u1", senderRole: "creator", code: "CONTACT_INFO_BLOCKED", reason: "contact_leak", content: "call 98xxxx", blocked: true });
    await m.record(ev);
    expect(c.tables.chat_moderation_events.length).toBe(1);
    expect(db.blocked_message_attempts).toBeUndefined(); // not only local any more
    const list = await m.list();
    expect(list[0].sender_name).toBe("Asha");
    expect(list[0].violation_type).toBe("hard_number");
    expect(list[0].message_content_attempted).toBe("call 98xxxx");
    expect(await m.resolve(ev.id, "mark_safe", "admin1")).toBe(true);
    expect(c.tables.chat_moderation_events[0].status).toBe("RESOLVED_SAFE");
  });
  it("profanity is a soft (logged) entry", () => {
    expect(violationType({ code: "PROFANITY_FLAGGED", blocked: false })).toBe("soft_keyword");
    expect(toAdminViolation({ id: "x", code: "ABUSE", blocked: true, status: "OPEN", content: "", created_at: "" }).status).toBe("FLAGGED");
  });
  it("chat route records through Supabase and the admin lists read it", () => {
    const s = read("backend/chat_routes.ts");
    expect(s).toContain("moderation.record(newModerationEvent(");
    expect(s).toContain("res.json(await moderation.list())");
    expect(s).not.toContain("db.blocked_message_attempts.push(");
    expect(read("scripts/sql/session38_part2.sql")).toContain("create table if not exists public.chat_moderation_events");
  });
});

describe("pitch leads from Supabase", () => {
  it("maps invite statuses and never writes the invite status", () => {
    expect(pitchStatusFromInvite("pending_creator_acceptance")).toBe("NEW");
    expect(pitchStatusFromInvite("accepted")).toBe("ACCEPTED");
    expect(pitchStatusFromInvite("creator_declined")).toBe("DECLINED");
    expect(countNewUnclaimedPitches([{ status: "NEW", creator_is_claimed: false }, { status: "NEW", creator_is_claimed: true }, { status: "ACCEPTED" }])).toBe(1);
    const s = read("backend/admin_pitch_leads_routes.ts");
    expect(s).toContain("loadPitchData(");
    expect(s).toContain("saveAdminPitchFields(");
    expect(read("backend/pitchLeads.ts")).not.toMatch(/from\("brief_requests"\)\.(update|upsert|insert)/);
  });
});

describe("referral activity", () => {
  it("comes from the Supabase referral list, not db.referrals", () => {
    const s = read("backend/admin_campaigns_settings_routes.ts");
    expect(s).toContain("referralData({ supabase, privilegedSupabase, getDb, saveDb }).allReferrals()");
    expect(s).not.toContain("activity: db.referrals || []");
  });
});

describe("payout only after the brand approved", () => {
  it("PROOF_SUBMITTED is refused", () => {
    expect(PAYOUT_READY_DEAL_STATUSES).toEqual(["COMPLETED", "APPROVED"]);
    const tx = { payout_status: "PENDING" };
    expect(payoutRequestBlock("c1", { creator_id: "c1", status: "PROOF_SUBMITTED" }, tx)?.code).toBe("NOT_APPROVED");
    expect(payoutRequestBlock("c1", { creator_id: "c1", status: "COMPLETED" }, tx)).toBeNull();
    expect(read("backend/payment_routes.ts")).toContain("You can ask for payment once the brand has approved your work.");
  });
});

describe("generated campaign numbers: creators only", () => {
  const camp = { campaign_id: "abc", applicants: [{ photo: "https://x/p.jpg" }] };
  it("creators keep the generated numbers, brands see real ones", () => {
    expect(seesRealCampaignStats({ role: "creator" })).toBe(false);
    expect(seesRealCampaignStats({ role: "brand" })).toBe(true);
    expect(campaignStatsFor({ campaign_id: "abc" }, { role: "brand" })).toEqual({ views: null, applied: 0 });
    expect(campaignStatsFor(camp, { role: "brand" }).applied).toBe(1);
    expect(campaignStatsFor({ campaign_id: "abc" }, { role: "creator" }).views).toBeGreaterThanOrEqual(10);
    expect(campaignAvatarsFor(camp, 3, { role: "brand" })).toEqual(["https://x/p.jpg"]);
    expect(campaignAvatarsFor({ campaign_id: "abc" }, 3, { role: "brand" })).toEqual([]);
    expect(realAppliedCount({ applications_count: 4 })).toBe(4);
  });
  it("brand home uses only real numbers", () => {
    const s = read("src/pages/brand/BrandHomeMobile.jsx");
    expect(s).not.toContain("getCampaignAvatars(c,");
    expect(s).not.toContain("const stats = getCampaignStats(c);");
  });
});

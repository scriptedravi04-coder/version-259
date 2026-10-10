import { describe, it, expect } from "vitest";
import { buildCreatorTasks, creatorProfileStrength, formatLeft, formatDue, dashboardSubline } from "./creatorTasks";

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime(); // local time
const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();

// Session 33: Ravi's "Important for you" — one list, real data, design priority order.
describe("buildCreatorTasks", () => {
  const invite = { id: "i1", status: "pending_creator_acceptance", brand_name: "cosmic eye", campaign_title: "Skincare reel", proposed_budget: 4300, deliverables: "1 Reel", created_at: iso(NOW - 2 * H) };
  const soon = { kind: "ugc", id: "o1", brand_name: "Nexus Brands", title: "Quick unboxing", creator_action: "Upload your video", stage_group: "in_progress", amount: 3300, amount_kind: "your_payout", deadline: iso(NOW + 14 * H + 22 * 60000) };
  const later = { kind: "campaign", id: "d1", thread_id: "t1", brand_name: "carboex", title: "Sponsorship", creator_action: "Upload your draft", stage_group: "in_progress", amount: 12000, deadline: iso(NOW + 72 * H) };

  it("orders: deadline < 24h → invites → KYC → profile → later deadlines", () => {
    const t = buildCreatorTasks({ invitations: [invite], work: [later, soon], kycStatus: null, profile: {}, profileLoaded: true, now: NOW });
    expect(t.map((x) => x.kind)).toEqual(["deadline", "invite", "kyc", "profile", "deadline"]);
    expect(t[0].kicker).toBe("DEADLINE · 14h 22m left");
    expect(t[0].m1l).toBe("PAYOUT");
    expect(t[0].m1v).toBe("₹3,300");
    expect(t[0].cta).toBe("Upload now");
    expect(t[0].action).toEqual({ type: "route", to: "/creator/ugc?tab=manage&orderId=o1" });
    expect(t[4].m1l).toBe("AGREED FEE");
    expect(t[4].action.to).toBe("/chat/t1");
  });

  it("invite task carries real budget / deliverables and opens the popup", () => {
    const [t] = buildCreatorTasks({ invitations: [invite], kycVerified: true, now: NOW });
    expect(t.kicker).toBe("CAMPAIGN INVITE · 2h ago");
    expect(t.m1v).toBe("₹4,300");
    expect(t.m2v).toBe("1 deliverable");
    expect(t.cta).toBe("Review invitation");
    expect(t.action).toEqual({ type: "invite", invite });
  });

  it("skips accepted invites, ended work and work with no deadline", () => {
    const t = buildCreatorTasks({
      invitations: [{ ...invite, status: "accepted" }],
      work: [{ ...soon, stage_group: "ended" }, { ...soon, deadline: null }],
      kycVerified: true, now: NOW,
    });
    expect(t.map((x) => x.kind)).toEqual(["explore"]);
  });

  it("overdue work says so", () => {
    const [t] = buildCreatorTasks({ work: [{ ...soon, deadline: iso(NOW - 3 * H) }], kycVerified: true, now: NOW });
    expect(t.kicker).toBe("OVERDUE · 3h 0m late");
  });

  it("KYC under review is a status task, not a 'verify' task", () => {
    const t = buildCreatorTasks({ kycStatus: "UNDER_REVIEW", now: NOW });
    expect(t[0].id).toBe("kyc_review");
  });

  it("no profile task until the profile is loaded; none when complete", () => {
    expect(buildCreatorTasks({ kycVerified: true, profileLoaded: false, now: NOW }).some((x) => x.kind === "profile")).toBe(false);
    const full = { photo: "x", content_niches: "Fitness", bio: "hi", instagram_handle: "me", rate_reel: 5000 };
    expect(buildCreatorTasks({ kycVerified: true, profile: full, profileLoaded: true, portfolioCount: 2, now: NOW }).some((x) => x.kind === "profile")).toBe(false);
  });
});

describe("helpers", () => {
  it("profile strength from real fields", () => {
    expect(creatorProfileStrength({ photo: "x", rate_reel: 4000 }, 0)).toEqual({ percent: 40, missing: ["Niche & bio", "Instagram / YouTube", "Past work"] });
  });
  it("formats time left and due", () => {
    expect(formatLeft(2 * 24 * H + 3 * H)).toBe("2d 3h");
    expect(formatDue(NOW + 22 * H, NOW)).toMatch(/^Tomorrow, 10 AM$/);
  });
  it("subline", () => {
    expect(dashboardSubline(3, 3)).toBe("You have 3 new invites and 3 active deals.");
    expect(dashboardSubline(1, 0)).toBe("You have 1 new invite.");
    expect(dashboardSubline(0, 0)).toBe("No new invites or active deals yet.");
  });
});

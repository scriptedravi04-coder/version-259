import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCollaborationDeliverable } from "./ugc_routes";
import { createUgcLifecycleService } from "./services/ugcLifecycleService";

// Two bugs, both from the same root: the order forgot what kind of deliverable it was.
//
//   1. A `ugc_video_raw` order demanded a live link instead of releasing the payout.
//   2. After a live link WAS submitted and approved, the chat asked for it again.
//
// Three separate defects produced that:
//   a) SUPABASE_UGC_ORDER_COLS did not contain deliverable_type / requires_live_link /
//      is_collaboration / live_link, so every write stripped them.
//   b) The claim insert never wrote them in the first place.
//   c) /ugc/threads/:id/approve-content was wired straight to handleThreadApproveContent,
//      bypassing the deliverable-type routing entirely.
//
// (a) and (c) are structural, so they are pinned by reading the source. A unit test that
// imported the handler would keep passing while the route pointed somewhere else — which
// is exactly how this shipped.

const read = (f: string) => readFileSync(join(process.cwd(), "backend", f), "utf8");
const UGC_ROUTES = read("ugc_routes.ts");
const LIFECYCLE = read(join("services", "ugcLifecycleService.ts"));

describe("isCollaborationDeliverable", () => {
  it("raw and edited UGC do NOT need a live link", () => {
    expect(isCollaborationDeliverable("ugc_video_raw")).toBe(false);
    expect(isCollaborationDeliverable("ugc_video_edited")).toBe(false);
    expect(isCollaborationDeliverable("UGC_VIDEO_RAW")).toBe(false);
  });

  it("a collaboration reel DOES need a live link", () => {
    expect(isCollaborationDeliverable("collaboration_reel")).toBe(true);
  });

  it("an unknown type stays conservative and asks for a live link", () => {
    // Deliberate: delaying a payout is recoverable, releasing the brand's money for a post
    // that was never made is not. The approve path logs loudly when it lands here.
    expect(isCollaborationDeliverable("")).toBe(true);
    expect(isCollaborationDeliverable(undefined)).toBe(true);
  });
});

describe("the fields survive the Supabase write", () => {
  const whitelist = LIFECYCLE.slice(
    LIFECYCLE.indexOf("SUPABASE_UGC_ORDER_COLS"),
    LIFECYCLE.indexOf("SUPABASE_UGC_ORDER_COLS") + 1400
  );

  for (const col of ["deliverable_type", "requires_live_link", "is_collaboration"]) {
    it(`whitelist keeps ${col}`, () => {
      expect(whitelist).toContain(`'${col}'`);
    });
  }

  it("whitelist keeps live_link, so an approved live link is not forgotten", () => {
    // This is bug 2: with live_link stripped, isLiveLinkApproval came back false on the
    // second call and the flow fell into the draft-approval branch, re-posting "submit
    // your live link".
    expect(whitelist).toContain("'live_link'");
    expect(whitelist).toContain("'live_link_submitted_at'");
    expect(whitelist).not.toContain("'live_links'");
  });
});

describe("the claim writes the deliverable type onto the order", () => {
  // Anchored on the SUPABASE payload inside the claim route specifically.
  //
  // Not the claim route as a whole: the local `newOrder` object a few lines above carries
  // the same three fields, so a looser slice kept passing while the Supabase insert — the
  // one that actually persists them — had them removed. The local copy is not what the
  // approval path reads back.
  const claimStart = UGC_ROUTES.indexOf("const handleUgcBriefClaim"); // the claim handler (named since session 20)
  const payloadStart = UGC_ROUTES.indexOf("const supaPayload", claimStart);
  const claim = UGC_ROUTES.slice(payloadStart, UGC_ROUTES.indexOf("from('ugc_orders').insert", payloadStart));

  it("carries deliverable_type, is_collaboration and requires_live_link from the brief", () => {
    expect(claim).toContain("deliverable_type: deliverableType");
    expect(claim).toContain("is_collaboration: isCollab");
    expect(claim).toContain("requires_live_link: requiresLiveLink");
  });
});

describe("approval routes all use the deliverable-aware handler", () => {
  const approveContentLine = UGC_ROUTES.split("\n").find(
    (l) => l.includes('"/ugc/threads/:id/approve-content"')
  );

  it("approve-content is not wired straight to the draft handler", () => {
    expect(approveContentLine).toBeTruthy();
    expect(approveContentLine).toContain("handleUgcOrderApprove");
    expect(approveContentLine).not.toContain("handleThreadApproveContent");
  });

  it("approve and mark-complete use the same handler", () => {
    const line = UGC_ROUTES.split("\n").find((l) => l.includes('"/ugc/threads/:id/mark-complete"'));
    expect(line).toContain("handleUgcOrderApprove");
  });
});

describe("the brief is consulted before guessing", () => {
  it("falls back to brief.requires_live_link, not straight to the deliverable type", () => {
    expect(UGC_ROUTES).toContain("brief?.requires_live_link !== undefined");
  });

  it("logs loudly when no deliverable type can be found anywhere", () => {
    expect(UGC_ROUTES).toContain("no deliverable_type on order, brief or thread");
  });
});

describe("SUBMIT_LIVE_LINK updates ugc_orders with singular live_link", () => {
  it("writes live_link and not live_links to Supabase ugc_orders", async () => {
    let capturedTable: string | null = null;
    let capturedUpdates: any = null;

    const mockOrder = {
      id: "ugcord_test_123",
      brief_id: "brief_test_123",
      creator_id: "creator_1",
      brand_id: "brand_1",
      status: "CONTENT_APPROVED",
      stage: "AWAITING_LIVE_LINK",
      requires_live_link: true,
      deliverable_type: "collaboration_reel"
    };

    const mockThread = {
      id: "thread_ugcord_test_123",
      deal_id: "ugcord_test_123",
      creator_id: "creator_1",
      brand_id: "brand_1",
      status: "ACTIVE",
      flow_state: "CONTENT_APPROVED",
      is_ugc: true
    };

    const mockDb = {
      ugc_orders: [mockOrder],
      chat_threads: [mockThread],
      ugc_briefs: [],
      transactions: [],
      content_submissions: []
    };

    const mockSupabase = {
      from: (table: string) => {
        capturedTable = table;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: table === 'ugc_orders' ? mockOrder : mockThread, error: null }),
              single: async () => ({ data: table === 'ugc_orders' ? mockOrder : mockThread, error: null }),
            }),
            or: () => ({
              select: () => ({ data: [{ id: "ugcord_test_123" }], error: null }),
              maybeSingle: async () => ({ data: table === 'ugc_orders' ? mockOrder : mockThread, error: null }),
            }),
            in: () => ({ data: [], error: null })
          }),
          update: (payload: any) => {
            if (table === 'ugc_orders') {
              capturedUpdates = payload;
            }
            return {
              eq: () => Promise.resolve({ data: null, error: null }),
              or: () => ({
                select: () => Promise.resolve({ data: [{ id: "ugcord_test_123" }], error: null }),
                eq: () => Promise.resolve({ data: null, error: null })
              })
            };
          },
          insert: () => Promise.resolve({ data: null, error: null }),
          upsert: () => Promise.resolve({ data: null, error: null })
        };
      }
    };

    const service = createUgcLifecycleService({
      supabase: mockSupabase,
      privilegedSupabase: mockSupabase,
      getDb: () => mockDb,
      saveDb: vi.fn(),
      getIsoNow: () => "2026-09-21T12:00:00.000Z",
      ensureUGCChatThread: async () => mockThread,
      insertChatMessageToSupabase: async () => ({ id: "msg_1" })
    });

    const result = await service({
      rawId: "ugcord_test_123",
      action: "SUBMIT_LIVE_LINK",
      actorUser: { user_id: "creator_1", role: "creator" },
      videoUrl: "https://instagram.com/reel/collab_test_123",
      notes: "Here is the live reel!"
    });

    expect(result.success).toBe(true);
    expect(capturedUpdates).toBeDefined();
    // Must write singular live_link
    expect(capturedUpdates.live_link).toBe("https://instagram.com/reel/collab_test_123");
    expect(capturedUpdates.live_link_submitted_at).toBe("2026-09-21T12:00:00.000Z");
    // Must NOT write live_links (plural)
    expect(capturedUpdates.live_links).toBeUndefined();
    expect(capturedUpdates).not.toHaveProperty("live_links");
    // Must NOT write live_links_submitted to ugc_orders
    expect(capturedUpdates.live_links_submitted).toBeUndefined();
  });
});

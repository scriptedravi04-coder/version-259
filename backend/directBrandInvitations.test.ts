import { describe, it, expect, vi } from "vitest";
import express from "express";
import { setupCreatorsRoutes } from "./creators_routes";

describe("Backend: Gated Direct Brand Invitations & Notifications (PART B)", () => {
  const createTestContext = (currentUser: any, initialDb: any = {}) => {
    const app = express();
    app.use(express.json());
    const router = express.Router();

    const db: any = {
      users: [
        { user_id: "brand_101", name: "Acme Corp", role: "brand", email: "brand@acme.com" },
        { user_id: "creator_202", name: "Pooja Sharma", role: "creator", email: "pooja@creator.in" },
      ],
      creator_profiles: [
        { user_id: "creator_202", name: "Pooja Sharma", email: "pooja@creator.in", is_claimed: true }
      ],
      brand_profiles: [
        { user_id: "brand_101", company_name: "Acme Corp", logo: "https://acme.com/logo.png" }
      ],
      brief_requests: [],
      chat_threads: [],
      chat_messages: [],
      notifications: [],
      ...initialDb,
    };

    const getDb = () => db;
    const saveDb = (updated: any) => Object.assign(db, updated);
    const parseAuthUser = vi.fn().mockResolvedValue(currentUser);

    setupCreatorsRoutes(app, router, {
      supabase: null,
      privilegedSupabase: null,
      getDb,
      saveDb,
      parseAuthUser,
      syncEntityTags: vi.fn(),
      processBase64Image: vi.fn(),
      getSettings: () => ({}),
      markupForRole: () => 0,
      getActingBrandId: (u: any) => u.user_id,
      logTeamActivity: vi.fn(),
      sanitizeCreatorProfile: (p: any) => p,
      fetchCreatorReviews: vi.fn(),
      broadcastAdminNotification: vi.fn(),
      insertChatMessageToSupabase: vi.fn(),
    });

    app.use(router);
    return { app, router, db, parseAuthUser };
  };

  it("registers direct brand invite and creator invitation routes", () => {
    const { router } = createTestContext({ user_id: "brand_101", role: "brand" });

    const postPaths = router.stack
      .filter((layer: any) => layer.route && layer.route.methods?.post)
      .flatMap((layer: any) => layer.route.path);

    const getPaths = router.stack
      .filter((layer: any) => layer.route && layer.route.methods?.get)
      .flatMap((layer: any) => layer.route.path);

    expect(postPaths).toContain("/creators/:id/send-brief");
    expect(postPaths).toContain("/creators/:id/invite");
    expect(postPaths).toContain("/creators/invitations/:id/accept");
    expect(postPaths).toContain("/creators/invitations/:id/decline");
    expect(getPaths).toContain("/creators/invitations");
  });

  it("saves direct invite as pending_creator_acceptance without opening chat thread", async () => {
    const brandUser = { user_id: "brand_101", name: "Acme Corp", role: "brand" };
    const { router, db } = createTestContext(brandUser);

    const req: any = {
      params: { id: "creator_202" },
      body: {
        campaign_title: "Diwali Festive Reel",
        budget_range: "₹54,903",
        deliverables: "1 Dedicated Reel + 2 Story frames",
        timeline: "7 days",
        message: "We'd love for you to showcase our festive line!",
      },
      app: { get: () => null },
    };

    let responseData: any = null;
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((data) => {
        responseData = data;
        return data;
      }),
    };

    // Find the handleSendBrief layer in router stack
    const sendBriefLayer = router.stack.find((l: any) => l.route?.path === "/creators/:id/send-brief");
    expect(sendBriefLayer).toBeTruthy();

    await sendBriefLayer.route.stack[0].handle(req, res, (() => {}) as any);

    expect(responseData).toBeTruthy();
    expect(responseData.success).toBe(true);
    expect(responseData.status).toBe("pending_creator_acceptance");
    expect(responseData.thread_id).toBeNull();
    expect(responseData.note).toBe("Invitation sent to creator! Chat will open once the creator accepts your invitation.");

    // Check DB
    expect(db.brief_requests.length).toBe(1);
    const savedBrief = db.brief_requests[0];
    expect(savedBrief.status).toBe("pending_creator_acceptance");
    expect(savedBrief.thread_id).toBeNull();
    expect(savedBrief.deliverables_count).toBe(3);
    expect(savedBrief.brand_name).toBe("Acme Corp");

    // Chat threads should NOT have any new thread or chat messages
    expect(db.chat_threads.length).toBe(0);
    expect(db.chat_messages.length).toBe(0);

    // Notification created for creator
    const creatorNotif = db.notifications.find((n: any) => n.user_id === "creator_202");
    expect(creatorNotif).toBeTruthy();
    expect(creatorNotif.type).toBe("campaign_invite");
  });

  it("allows creator to decline invitation with reason without creating chat thread", async () => {
    const creatorUser = { user_id: "creator_202", name: "Pooja Sharma", role: "creator", email: "pooja@creator.in" };
    const { router, db } = createTestContext(creatorUser, {
      brief_requests: [
        {
          id: "brief_test_1",
          brand_id: "brand_101",
          brand_name: "Acme Corp",
          creator_id: "creator_202",
          campaign_title: "Summer Collection",
          status: "pending_creator_acceptance",
          deliverables: "1 Reel",
          created_at: new Date().toISOString(),
        }
      ]
    });

    const declineLayer = router.stack.find((l: any) =>
      Array.isArray(l.route?.path)
        ? l.route.path.includes("/creators/invitations/:id/decline")
        : l.route?.path === "/creators/invitations/:id/decline"
    );
    expect(declineLayer).toBeTruthy();

    const req: any = {
      params: { id: "brief_test_1" },
      body: { reason: "Budget too low" },
    };
    let responseData: any = null;
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((data) => { responseData = data; return data; }),
    };

    await declineLayer.route.stack[0].handle(req, res, (() => {}) as any);

    expect(responseData.success).toBe(true);
    expect(responseData.status).toBe("creator_declined");
    expect(responseData.reason).toBe("Budget too low");

    // Check DB status and reason
    expect(db.brief_requests[0].status).toBe("creator_declined");
    expect(db.brief_requests[0].decline_reason).toBe("Budget too low");

    // Brand received notification of decline
    const brandNotif = db.notifications.find((n: any) => n.user_id === "brand_101");
    expect(brandNotif).toBeTruthy();
    expect(brandNotif.type).toBe("invitation_declined");
    expect(brandNotif.message).toContain("Budget too low");

    // Creator inbox remains uncluttered (no thread)
    expect(db.chat_threads.length).toBe(0);
  });

  it("allows creator to accept invitation, activates chat thread, and seeds messages", async () => {
    const creatorUser = { user_id: "creator_202", name: "Pooja Sharma", role: "creator", email: "pooja@creator.in" };
    const { router, db } = createTestContext(creatorUser, {
      brief_requests: [
        {
          id: "brief_test_2",
          brand_id: "brand_101",
          brand_name: "Acme Corp",
          creator_id: "creator_202",
          creator_name: "Pooja Sharma",
          campaign_title: "Winter Launch",
          proposed_budget: "₹54,903",
          deliverables: "2 Reels",
          timeline: "5 days",
          message: "Check out our winter line!",
          status: "pending_creator_acceptance",
          created_at: new Date().toISOString(),
        }
      ]
    });

    const acceptLayer = router.stack.find((l: any) =>
      Array.isArray(l.route?.path)
        ? l.route.path.includes("/creators/invitations/:id/accept")
        : l.route?.path === "/creators/invitations/:id/accept"
    );
    expect(acceptLayer).toBeTruthy();

    const req: any = {
      params: { id: "brief_test_2" },
      body: {},
      app: { get: () => null }
    };
    let responseData: any = null;
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((data) => { responseData = data; return data; }),
    };

    await acceptLayer.route.stack[0].handle(req, res, (() => {}) as any);

    expect(responseData.success).toBe(true);
    expect(responseData.status).toBe("accepted");
    expect(responseData.thread_id).toBeTruthy();

    // Check DB
    expect(db.brief_requests[0].status).toBe("accepted");
    expect(db.chat_threads.length).toBe(1);
    expect(db.chat_threads[0].status).toBe("NEGOTIATING");
    expect(db.chat_threads[0].flow_state).toBe("NEGOTIATING");

    // Session 26 (Ravi's flow): a short automatic thank-you from the creator, then the BRAND's
    // offer card (Accept / Negotiate for the creator). Replaces the v212 pair
    // brand_invitation_card + creator_invitation_acceptance, which put a note the creator never
    // wrote in their name and made the brand "accept" its own offer.
    expect(db.chat_messages.length).toBe(2);
    expect(db.chat_messages[0].message_type).toBe("text");
    expect(db.chat_messages[0].sender_user_id).toBe("creator_202");
    expect(db.chat_messages[0].metadata.automated).toBe(true);
    expect(db.chat_messages[1].message_type).toBe("brand_invitation_offer");
    expect(db.chat_messages[1].sender_user_id).toBe("brand_101");
    expect(db.chat_messages[1].metadata.proposed_fee).toBe(54903);

    // Brand received notification of acceptance
    const brandNotif = db.notifications.find((n: any) => n.user_id === "brand_101");
    expect(brandNotif).toBeTruthy();
    expect(brandNotif.type).toBe("invitation_accepted");
  });
});

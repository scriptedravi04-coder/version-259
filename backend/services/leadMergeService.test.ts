import { describe, it, expect } from "vitest";
import { createLeadMergeService } from "./leadMergeService";

describe("Smart Signup Auto-Merge Service", () => {
  it("merges existing unclaimed creator profile when a creator signs up", async () => {
    let mockDbState: any = {
      creator_profiles: [
        {
          user_id: "lead_unclaimed_123",
          name: "Pooja Sharma",
          email: "pooja@example.com",
          instagram: "poojasharma_fit",
          followers_instagram: 45000,
          category: "Fitness",
          city: "Delhi",
          rate_card: { reel: 8000, story: 3000 },
          verified: true,
          is_claimed: false,
          onboarding_complete: true,
        }
      ],
      deals: [
        {
          id: "deal_999",
          brand_id: "brand_abc",
          creator_id: "lead_unclaimed_123",
          title: "Protein Shake Campaign",
          amount: 8000,
          status: "OFFER_SENT"
        }
      ],
      chat_threads: [
        {
          id: "thread_999",
          brand_id: "brand_abc",
          creator_id: "lead_unclaimed_123",
          title: "Collab Discussion"
        }
      ],
      ugc_orders: [],
      users: [
        {
          user_id: "new_auth_user_789",
          email: "pooja@example.com",
          name: "Pooja",
          role: "creator",
          onboarded: false
        }
      ]
    };

    const getDb = () => mockDbState;
    const saveDb = (d: any) => { mockDbState = d; };

    const mergeService = createLeadMergeService({
      supabase: null,
      privilegedSupabase: null,
      getDb,
      saveDb
    });

    const result = await mergeService("new_auth_user_789", "pooja@example.com", "9876543210", "creator");

    expect(result.merged).toBe(true);
    expect(result.leadFound).toBe(true);
    expect(result.dealsLinked).toBe(1);
    expect(result.threadsLinked).toBe(1);

    // Verify creator_profiles is now mapped to new_auth_user_789 with is_claimed = true
    const updatedProfile = mockDbState.creator_profiles.find((p: any) => p.email === "pooja@example.com");
    expect(updatedProfile).toBeDefined();
    expect(updatedProfile.user_id).toBe("new_auth_user_789");
    expect(updatedProfile.is_claimed).toBe(true);
    expect(updatedProfile.instagram).toBe("poojasharma_fit");

    // Verify deal creator_id is updated to new user
    expect(mockDbState.deals[0].creator_id).toBe("new_auth_user_789");

    // Verify chat thread creator_id is updated to new user
    expect(mockDbState.chat_threads[0].creator_id).toBe("new_auth_user_789");

    // Verify users record is marked as onboarded
    expect(mockDbState.users[0].onboarded).toBe(true);
    expect(mockDbState.users[0].role).toBe("creator");
  });

  // Session 36 (Ravi, rule 72): an application is not a profile. Signing up only LINKS the waitlist row;
  // the creator still onboards and the admin still reviews. Before, this created a "verified, approved"
  // profile with invented defaults — that behaviour is gone on purpose.
  it("links a pending waitlist application on signup — no profile, no approval, nothing invented", async () => {
    let mockDbState: any = {
      creator_profiles: [],
      waitlist: [
        {
          id: "w_123",
          name: "Rohit Verma",
          email: "rohit@test.com",
          instagram: "rohit_vlogs",
          followers: 120000,
          category: "Travel",
          city: "Goa",
          charge_per_post: 15000,
          status: "pending"
        }
      ],
      deals: [],
      chat_threads: [],
      ugc_orders: [],
      users: [
        {
          user_id: "user_rohit_456",
          email: "rohit@test.com",
          name: "Rohit Verma",
          role: "creator",
          onboarded: false
        }
      ]
    };

    const getDb = () => mockDbState;
    const saveDb = (d: any) => { mockDbState = d; };

    const mergeService = createLeadMergeService({
      supabase: null,
      privilegedSupabase: null,
      getDb,
      saveDb
    });

    const result = await mergeService("user_rohit_456", "rohit@test.com", "", "creator");

    expect(result.leadFound).toBe(false);
    expect(result.leadSource).toBe("waitlist");
    expect(mockDbState.creator_profiles.length).toBe(0);
    expect(mockDbState.waitlist[0]).toMatchObject({ linked_user_id: "user_rohit_456", is_registered_user: true, status: "pending" });
    expect(mockDbState.users[0].onboarded).toBe(false);
  });
});

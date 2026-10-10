import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { sanitizeChatThreadSupabasePayload, sanitizeDealSupabasePayload } from "./helpers";

const CHATBOX = fs.readFileSync(
  path.resolve(__dirname, "../src/components/chat/ChatBox.jsx"),
  "utf8"
);
const SERVER = fs.readFileSync(
  path.resolve(__dirname, "./server.ts"),
  "utf8"
);
const CAMPAIGNS_ROUTES = fs.readFileSync(
  path.resolve(__dirname, "./campaigns_routes.ts"),
  "utf8"
);

describe("Campaign Live Link Revision Decoupling", () => {
  describe("Supabase Schema Sanitizers", () => {
    it("sanitizes chat_threads payload to prevent Postgres 42703 error", () => {
      const dirty = {
        id: "thread_123",
        status: "ACTIVE",
        flow_state: "REVISION_REQUESTED_LINKS",
        live_links_submitted: false, // invalid column in Supabase chat_threads
        revision_notes_links: "Fix link", // invalid column in Supabase chat_threads
        decline_notes_links: "Declined", // invalid column in Supabase chat_threads
        payment_funded: true, // invalid column in Supabase chat_threads
        updated_at: "2026-09-23T12:00:00Z"
      };

      const clean = sanitizeChatThreadSupabasePayload(dirty);
      expect(clean.id).toBe("thread_123");
      expect(clean.status).toBe("ACTIVE");
      expect(clean.flow_state).toBe("REVISION_REQUESTED_LINKS");
      expect(clean.updated_at).toBe("2026-09-23T12:00:00Z");
      expect(clean.live_links_submitted).toBeUndefined();
      expect(clean.revision_notes_links).toBeUndefined();
      expect(clean.decline_notes_links).toBeUndefined();
      expect(clean.payment_funded).toBeUndefined();
    });

    it("sanitizes deals payload to prevent Postgres 42703 error", () => {
      const dirty = {
        id: "deal_123",
        status: "ACTIVE",
        flow_state: "PROOF_SUBMITTED", // invalid column in Supabase deals
        live_links_submitted: true, // invalid column in Supabase deals
        live_link: "https://instagram.com/p/123", // invalid column in Supabase deals
        updated_at: "2026-09-23T12:00:00Z"
      };

      const clean = sanitizeDealSupabasePayload(dirty);
      expect(clean.id).toBe("deal_123");
      expect(clean.status).toBe("ACTIVE");
      expect(clean.updated_at).toBe("2026-09-23T12:00:00Z");
      expect(clean.flow_state).toBeUndefined();
      expect(clean.live_links_submitted).toBeUndefined();
      expect(clean.live_link).toBeUndefined();
    });
  });

  describe("Backend Routes Use Sanitized Supabase Updates", () => {
    it("campaigns_routes uses sanitizeDealSupabasePayload and sanitizeChatThreadSupabasePayload", () => {
      expect(CAMPAIGNS_ROUTES).toContain("sanitizeDealSupabasePayload");
      expect(CAMPAIGNS_ROUTES).toContain("sanitizeChatThreadSupabasePayload");
      expect(CAMPAIGNS_ROUTES).not.toMatch(/from\(['"]deals['"]\)\s*\.update\(\{\s*status:[^}]*flow_state:/);
      expect(CAMPAIGNS_ROUTES).not.toMatch(/from\(['"]chat_threads['"]\)\s*\.update\(\{\s*flow_state:[^}]*revision_notes_links:/);
    });
  });

  describe("Backend populateThreadData Decoupling", () => {
    it("separates UGC and Campaign link calculation in server.ts", () => {
      expect(SERVER).toContain("// Campaign Deal pipeline (completely separate segment from UGC)");
      expect(SERVER).toContain("isCampaignRevision");
      expect(SERVER).toContain("isLatestMsgResubmitReq");
    });
  });

  describe("ChatBox Frontend Decoupling", () => {
    it("defines distinct isUgcLinksRevisionOpen and isCampaignLinksRevisionOpen", () => {
      expect(CHATBOX).toContain("const isUgcLinksRevisionOpen");
      expect(CHATBOX).toContain("const isCampaignLinksRevisionOpen");
      expect(CHATBOX).toContain("const isLinksRevisionOpen = isUgcOrder ? isUgcLinksRevisionOpen : isCampaignLinksRevisionOpen");
      expect(CHATBOX).toContain("const isLiveLinksSubmitted = !isDealCompleted && !isUgcLinksRevisionOpen && !isCampaignLinksRevisionOpen");
    });
  });
});

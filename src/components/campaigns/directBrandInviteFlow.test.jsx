import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ api: apiMock }));

import InviteToCampaignModal from "./InviteToCampaignModal";
import CreatorReviewInvitationModal from "./CreatorReviewInvitationModal";
import { formatBudget, getDeliverablesCount } from "../../utils/invitationUtils";

describe("Gated Direct Brand Invitations & Creator Notification Flow (PART B)", () => {
  beforeEach(() => {
    cleanup();
    apiMock.post.mockReset();
    apiMock.get.mockReset();
    vi.clearAllMocks();
  });

  describe("Deliverables and Budget formatting helpers", () => {
    it("correctly counts deliverables from string formats", () => {
      expect(getDeliverablesCount("1 Dedicated Reel + 2 Story frames")).toBe(3);
      expect(getDeliverablesCount("1 Reel")).toBe(1);
      expect(getDeliverablesCount("Reel, Story, Post")).toBe(3);
      expect(getDeliverablesCount(4)).toBe(4);
    });

    it("correctly formats offered budget values", () => {
      expect(formatBudget("54903")).toBe("₹54,903");
      expect(formatBudget(54903)).toBe("₹54,903");
      expect(formatBudget("₹54,903")).toBe("₹54,903");
      expect(formatBudget("Barter Friendly")).toBe("Barter Friendly");
    });
  });

  describe("InviteToCampaignModal", () => {
    it("renders required fields and adheres to ARCHITECTURE.md button alignment", () => {
      const creator = {
        id: "creator_123",
        user_id: "creator_123",
        name: "Pooja Sharma",
        category: "Fashion & Beauty",
      };

      render(
        <InviteToCampaignModal
          isOpen={true}
          creator={creator}
          onClose={() => {}}
        />
      );

      // Verify fields
      expect(screen.getByPlaceholderText(/Summer Skincare Product Launch/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/54,903/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/7-10 days/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/1 Dedicated Reel/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/Describe your brand goals/i)).toBeTruthy();

      // Verify button alignment: Cancel on left, Send Invitation on right
      const buttons = screen.getAllByRole("button");
      const cancelBtn = screen.getByText("Cancel");
      const sendBtn = screen.getByText(/Send Invitation/i);

      expect(cancelBtn).toBeTruthy();
      expect(sendBtn).toBeTruthy();

      const btnContainer = cancelBtn.parentElement;
      const children = Array.from(btnContainer.children);
      expect(children.indexOf(cancelBtn)).toBeLessThan(children.indexOf(sendBtn));
    });

    it("does NOT open chat on submit and posts brief with exact toast feedback", async () => {
      const creator = {
        id: "creator_456",
        user_id: "creator_456",
        name: "Rohan Verma",
      };

      apiMock.post.mockResolvedValueOnce({
        data: {
          success: true,
          status: "pending_creator_acceptance",
          note: "Invitation sent to creator! Chat will open once the creator accepts your invitation.",
          thread_id: null,
        }
      });

      const onInviteSent = vi.fn();
      const onClose = vi.fn();

      render(
        <InviteToCampaignModal
          isOpen={true}
          creator={creator}
          onClose={onClose}
          onInviteSent={onInviteSent}
        />
      );

      fireEvent.change(screen.getByPlaceholderText(/Summer Skincare Product Launch/i), {
        target: { value: "Autumn Tech Review" }
      });
      fireEvent.change(screen.getByPlaceholderText(/54,903/i), {
        target: { value: "₹45,000" }
      });
      fireEvent.change(screen.getByPlaceholderText(/1 Dedicated Reel/i), {
        target: { value: "1 Unboxing Video + 2 Shorts" }
      });
      fireEvent.change(screen.getByPlaceholderText(/Describe your brand goals/i), {
        target: { value: "We want an honest gadget breakdown." }
      });

      fireEvent.submit(screen.getByTestId("invite-form"));

      await waitFor(() => {
        expect(apiMock.post).toHaveBeenCalledWith(
          "/creators/creator_456/send-brief",
          expect.objectContaining({
            campaign_title: "Autumn Tech Review",
            budget_range: "₹45,000",
            deliverables: "1 Unboxing Video + 2 Shorts",
            message: "We want an honest gadget breakdown.",
          })
        );
        expect(onClose).toHaveBeenCalled();
        expect(onInviteSent).toHaveBeenCalled();
      });
    });
  });

  describe("CreatorReviewInvitationModal", () => {
    const invite = {
      id: "brief_req_999",
      brand_name: "Boat Lifestyle",
      brand_logo: "https://example.com/boat.png",
      campaign_title: "Airdopes ANC Launch",
      campaign_description: "Deliver high energy gym reels showcasing active noise cancellation.",
      proposed_budget: "₹54,903",
      deliverables: "2 Instagram Reels + 1 Story",
      deliverables_count: 3,
      timeline: "5-7 days",
      pitch: "Loved your recent fitness content! Perfect fit for our ANC range.",
      status: "pending_creator_acceptance",
    };

    it("displays brand details, campaign info, budget, deliverables, and button alignment", () => {
      render(
        <CreatorReviewInvitationModal
          isOpen={true}
          invite={invite}
          onClose={() => {}}
        />
      );

      expect(screen.getByText("Boat Lifestyle")).toBeTruthy();
      expect(screen.getByText("Airdopes ANC Launch")).toBeTruthy();
      expect(screen.getByText("₹54,903")).toBeTruthy();
      expect(screen.getByText(/2 Instagram Reels \+ 1 Story/i)).toBeTruthy();
      expect(screen.getByText(/Timeline:/i)).toBeTruthy();
      expect(screen.getByText(/Loved your recent fitness content/i)).toBeTruthy();

      // ARCHITECTURE.md: Decline on left, Accept & open deal room on right (labels: Ravi, session 33)
      const declineBtn = screen.getByText("Decline");
      const acceptBtn = screen.getByText(/Accept & open deal room/i);

      expect(declineBtn).toBeTruthy();
      expect(acceptBtn).toBeTruthy();

      const btnRow = declineBtn.parentElement;
      const children = Array.from(btnRow.children);
      expect(children.indexOf(declineBtn)).toBeLessThan(children.indexOf(acceptBtn));
    });

    it("prompts reason confirmation on decline and sends decline reason", async () => {
      apiMock.post.mockResolvedValueOnce({
        data: {
          success: true,
          status: "creator_declined",
          reason: "Budget too low",
        }
      });

      const onDeclined = vi.fn();
      const onClose = vi.fn();

      render(
        <CreatorReviewInvitationModal
          isOpen={true}
          invite={invite}
          onClose={onClose}
          onDeclined={onDeclined}
        />
      );

      // Click Decline
      fireEvent.click(screen.getByText("Decline"));

      // Should prompt confirmation
      expect(screen.getByText(/Are you sure you want to decline this invitation\?/i)).toBeTruthy();
      expect(screen.getByText(/Reason for Declining/i)).toBeTruthy();

      // Button alignment inside confirmation: Back on Left, Confirm Decline on Right
      const backBtn = screen.getByText(/Back to Review/i);
      const confirmDeclineBtn = screen.getByText(/Confirm Decline/i);

      expect(backBtn).toBeTruthy();
      expect(confirmDeclineBtn).toBeTruthy();

      const btnRow = backBtn.parentElement;
      const children = Array.from(btnRow.children);
      expect(children.indexOf(backBtn)).toBeLessThan(children.indexOf(confirmDeclineBtn));

      // Confirm decline
      fireEvent.click(confirmDeclineBtn);

      await waitFor(() => {
        expect(apiMock.post).toHaveBeenCalledWith(
          "/creators/invitations/brief_req_999/decline",
          { reason: "Budget too low" }
        );
        expect(onDeclined).toHaveBeenCalledWith(invite, "Budget too low");
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("accepts invitation, creates chat thread, and redirects creator", async () => {
      apiMock.post.mockResolvedValueOnce({
        data: {
          success: true,
          status: "accepted",
          thread_id: "thread_boat_pooja_123",
        }
      });

      const onAccepted = vi.fn();
      const onClose = vi.fn();

      render(
        <CreatorReviewInvitationModal
          isOpen={true}
          invite={invite}
          onClose={onClose}
          onAccepted={onAccepted}
        />
      );

      fireEvent.click(screen.getByText(/Accept & open deal room/i));

      await waitFor(() => {
        expect(apiMock.post).toHaveBeenCalledWith(
          "/creators/invitations/brief_req_999/accept"
        );
        expect(onAccepted).toHaveBeenCalledWith(invite, "thread_boat_pooja_123");
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});

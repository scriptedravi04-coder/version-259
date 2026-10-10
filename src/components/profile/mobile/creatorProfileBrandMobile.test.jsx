import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../lib/api", () => ({ api: apiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../hooks/useIsMobile", () => ({ default: () => true }));

import CreatorProfileBrandMobile from "./CreatorProfileBrandMobile";
import InviteToCampaignModal from "../../campaigns/InviteToCampaignModal";

const creator = { user_id: "cr1", name: "Anshika Thapa", instagram_handle: "anshika", city: "Mumbai", category: "Health",
  follower_count: 195000, avg_views_30d: 12000, engagement_rate: 4.1, rate_reel: 6000, rate_story: 1500 };

// Session 30: EX-04 creator profile + EX-05 invite sheet (mobile, brand side).
describe("EX-04 creator profile (mobile)", () => {
  beforeEach(() => cleanup());
  it("shows real stats and rate card; no rating without reviews", () => {
    render(<CreatorProfileBrandMobile creator={creator} reviews={[]} canInvite onInvite={() => {}} />);
    expect(screen.getByText("195K")).toBeTruthy();
    expect(screen.getByText("₹6,000")).toBeTruthy();
    expect(screen.getByText("₹1,500")).toBeTruthy();
    expect(screen.queryByText(/★/)).toBeNull();
    expect(screen.queryByText("YouTube video")).toBeNull();
  });
  it("empty rate card is honest", () => {
    render(<CreatorProfileBrandMobile creator={{ name: "X" }} reviews={[]} />);
    expect(screen.getByText(/No rates listed yet/)).toBeTruthy();
  });
});

describe("EX-05 invite sheet (mobile)", () => {
  beforeEach(() => { cleanup(); apiMock.post.mockReset(); });
  it("picking a campaign prefills; Send uses the same send-brief call", async () => {
    apiMock.post.mockResolvedValue({ data: { note: "ok" } });
    const camps = [{ campaign_id: "c1", title: "Summer Glow", description: "Serum launch", deliverables: "1 Reel", budget_min: 8000, budget_max: 18000 }];
    render(<InviteToCampaignModal isOpen creator={creator} campaigns={camps} onClose={() => {}} />);
    expect(screen.getByText("Invite Anshika to a campaign")).toBeTruthy();
    fireEvent.click(screen.getByText("Summer Glow"));
    expect(screen.getByDisplayValue("6000")).toBeTruthy();
    fireEvent.click(screen.getByText("Send invite"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/creators/cr1/send-brief", expect.objectContaining({
      campaign_title: "Summer Glow", budget_range: "6000", deliverables: "1 Reel", message: "Serum launch",
    })));
  });
});

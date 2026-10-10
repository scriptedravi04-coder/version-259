import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../lib/api", () => ({ api: apiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../common/ExportAnalyticsPdfButton", () => ({ default: () => <div>pdf</div> }));
vi.mock("../ApplicantCard", () => ({ default: ({ applicant }) => <div>{applicant.full_name}</div> }));
import BrandCampaignDetailMobile from "./BrandCampaignDetailMobile";

const camp = { campaign_id: "C1", title: "Summer Glow", status: "live", budget_min: 8000, budget_max: 18000 };

describe("session 30: mobile campaign detail", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset(); });

  it("no pitches → share + real matching count", async () => {
    apiMock.get.mockResolvedValue({ data: { count: 7, categories: ["beauty"] } });
    render(<MemoryRouter><BrandCampaignDetailMobile campaignId="C1" campaign={camp} applicants={[]} /></MemoryRouter>);
    expect(screen.getByText("No pitches yet")).toBeTruthy();
    expect(await screen.findByText("7 creators match this brief")).toBeTruthy();
    expect(apiMock.get).toHaveBeenCalledWith("/campaigns/C1/matching-creators");
  });

  it("actions sheet pauses applications through the new endpoint", async () => {
    apiMock.post.mockResolvedValue({ data: { ok: true } });
    const reload = vi.fn();
    render(<MemoryRouter><BrandCampaignDetailMobile campaignId="C1" campaign={camp} applicants={[{ application_id: "a1", status: "pending", full_name: "A" }]} onReload={reload} /></MemoryRouter>);
    expect(screen.getByText("Review 1 applicant")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Campaign actions"));
    fireEvent.click(screen.getByText("Pause new applications"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/campaigns/C1/applications-paused", { paused: true }));
    expect(reload).toHaveBeenCalled();
  });
});

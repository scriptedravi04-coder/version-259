import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BrandCampaignsMobile from "./BrandCampaignsMobile";

// Session 30: MG-01/02/03 mobile campaigns list — UI only, handlers come from the locked page.
const base = {
  tabs: [{ id: "all", label: "All Briefs", count: 2 }, { id: "live", label: "Live", count: 1 }, { id: "draft", label: "Drafts", count: 1 }],
  activeTab: "all", setActiveTab: vi.fn(), isUnderReview: () => false, hasLocalDraft: false, localDraftInfo: null,
  onCreate: vi.fn(), onResumeDraft: vi.fn(), onDiscardDraft: vi.fn(), onEdit: vi.fn(), onSubmitDraft: vi.fn(), onManage: vi.fn(),
};
const live = { campaign_id: "c1", title: "Summer Glow", status: "live", applicants: [{ application_id: "a" }, { application_id: "b" }], budget_min: 8000, budget_max: 18000, platforms: ["Instagram"] };
const draft = { campaign_id: "c2", title: "Monsoon push", status: "draft" };

describe("session 30: mobile campaigns list", () => {
  beforeEach(() => { cleanup(); Object.values(base).forEach((f) => f?.mockClear?.()); });

  it("empty state offers Create campaign", () => {
    render(<MemoryRouter><BrandCampaignsMobile {...base} campaigns={[]} filtered={[]} /></MemoryRouter>);
    fireEvent.click(screen.getByText("Create campaign"));
    expect(base.onCreate).toHaveBeenCalled();
  });

  it("shows the real applicant count and routes taps to the page's handlers", () => {
    render(<MemoryRouter><BrandCampaignsMobile {...base} campaigns={[live, draft]} filtered={[live, draft]} /></MemoryRouter>);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Applicants")).toBeTruthy();
    expect(screen.getByText(/₹8,000 – ₹18,000 per creator/)).toBeTruthy();
    fireEvent.click(screen.getByText("Summer Glow"));
    expect(base.onManage).toHaveBeenCalledWith(live);
    fireEvent.click(screen.getByText("Launch"));
    expect(base.onSubmitDraft).toHaveBeenCalledWith(draft);
  });

  it("makes no server calls of its own", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "BrandCampaignsMobile.jsx"), "utf8");
    expect(src).not.toMatch(/\bapi\.|fetch\(|supabase/);
  });
});

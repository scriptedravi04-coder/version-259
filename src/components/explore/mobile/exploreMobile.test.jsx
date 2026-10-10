import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../lib/api", () => ({ api: apiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { user_id: "b1", role: "brand", name: "Nova Brand" } }) }));

import ExploreMobile, { applyFilters, visibleCreators } from "./ExploreMobile";

const creators = [
  { user_id: "c1", name: "Anshika Thapa", city: "Mumbai", content_niches: "Health, Fitness", follower_count: 195000, rate_reel: 6000, verified: true },
  { user_id: "c2", name: "Dev Verma", city: "Bengaluru", content_niches: "Tech", followers_count: "210K", rate_reel: 42000 },
  { user_id: "c3", name: "Sana Kapoor", city: "Pune", content_niches: "Food", followers_count: 56000 },
  { user_id: "c4", name: "test user", content_niches: "Food" },
  { user_id: "c5", name: "Hidden", profile_status: "under_review" },
];

// Session 33: Explore on mobile = Ravi's design (EX-01/02/03/05), not the desktop page squeezed.
describe("ExploreMobile helpers", () => {
  it("hides test / unapproved profiles like desktop", () => {
    expect(visibleCreators(creators).map((c) => c.user_id)).toEqual(["c1", "c2", "c3"]);
  });
  it("filters by category, followers, max rate and city", () => {
    const v = visibleCreators(creators);
    const f = (o) => applyFilters(v, "", { categories: [], followers: [], maxRate: 0, city: "", ...o }).map((c) => c.user_id);
    expect(f({ categories: ["Health"] })).toEqual(["c1"]);
    expect(f({ followers: ["macro"] })).toEqual(["c1", "c2"]);
    expect(f({ maxRate: 25000 })).toEqual(["c1"]); // no rate card = not shown under a rate cap
    expect(f({ city: "pune" })).toEqual(["c3"]);
    expect(applyFilters(v, "beng", { categories: [], followers: [], maxRate: 0, city: "" }).map((c) => c.user_id)).toEqual(["c2"]);
  });
});

describe("ExploreMobile screen", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset(); });

  it("browse grid shows only real data — Session 43: desktop card details, no Verified badge, no rate", async () => {
    apiMock.get.mockResolvedValue({ data: creators });
    render(<MemoryRouter><ExploreMobile /></MemoryRouter>);
    expect(await screen.findByText("Anshika Thapa")).toBeTruthy();
    expect(apiMock.get).toHaveBeenCalledWith("creators/explore", expect.anything());
    expect(screen.queryByText("Verified")).toBeNull();
    expect(screen.queryByText("₹6K")).toBeNull();
    expect(screen.queryByText("Hidden")).toBeNull();
  });

  it("filters → results with select → invite sends message + fee to send-brief for each creator", async () => {
    apiMock.get.mockImplementation((url) => Promise.resolve({ data: url.startsWith("campaigns") ? [{ campaign_id: "k1", title: "Summer Glow", status: "live", description: "Serum launch", budget_min: 8000 }, { campaign_id: "k2", title: "Old", status: "live", closed_at: "2026-01-01" }] : creators }));
    apiMock.post.mockResolvedValue({ data: {} });
    render(<MemoryRouter><ExploreMobile /></MemoryRouter>);
    await screen.findByText("Anshika Thapa");
    fireEvent.click(screen.getByTestId("explore-filters-button"));
    fireEvent.click(screen.getByText("100K–1M"));
    expect(screen.getByTestId("explore-show-results").textContent).toContain("Show 2 creators");
    fireEvent.click(screen.getByTestId("explore-show-results"));
    fireEvent.click(screen.getByTestId("explore-select-c1"));
    fireEvent.click(screen.getByTestId("explore-select-c2"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Invite to campaign"));
    expect(apiMock.get).toHaveBeenCalledWith("campaigns?mine=true");
    fireEvent.click(await screen.findByText("Summer Glow"));
    expect(screen.queryByText("Old")).toBeNull(); // closed campaigns are not offered
    fireEvent.click(screen.getByTestId("explore-send-invite"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2));
    expect(apiMock.post).toHaveBeenCalledWith("/creators/c1/send-brief", expect.objectContaining({ message: "Serum launch", budget_range: "8000", campaign_title: "Summer Glow" }));
    expect(apiMock.post).toHaveBeenCalledWith("/creators/c2/send-brief", expect.objectContaining({ message: "Serum launch" }));
  });

  it("does not send an invite under ₹3,000 or without a message", async () => {
    apiMock.get.mockImplementation((url) => Promise.resolve({ data: url.startsWith("campaigns") ? [] : creators }));
    render(<MemoryRouter><ExploreMobile /></MemoryRouter>);
    await screen.findByText("Anshika Thapa");
    fireEvent.click(screen.getByTestId("explore-filters-button"));
    fireEvent.click(screen.getByText("100K–1M"));
    fireEvent.click(screen.getByTestId("explore-show-results"));
    fireEvent.click(screen.getByTestId("explore-select-c2"));
    fireEvent.click(screen.getByText("Invite to campaign"));
    fireEvent.click(await screen.findByTestId("explore-send-invite"));
    await new Promise((r) => setTimeout(r, 20));
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

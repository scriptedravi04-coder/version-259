import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../lib/api", () => ({ api: apiMock }));

import BriefSafetyExplainer, { useBriefExplainer, hasSeenBriefExplainer, HowItWorksLink } from "./ugc/BriefSafetyExplainer";
import CreatorCard from "./ugc/CreatorCard";

function Host({ userId }) {
  const [open, openAgain, close, reopened] = useBriefExplainer(userId, true);
  return (<div><HowItWorksLink onClick={openAgain} /><BriefSafetyExplainer open={open} onClose={close} reopened={reopened} /></div>);
}

describe("brand explainer (session 24 design)", () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });
  it("opens once, with the refund line and no 'escrow' jargon; reopens from How it works", async () => {
    render(<Host userId="b1" />);
    const dlg = screen.getByTestId("brief-safety-explainer");
    expect(dlg.textContent).toContain("Your money stays safe");
    expect(dlg.textContent).toContain("100% refundable.");
    expect(dlg.textContent).toContain("Ybex SafePay");
    expect(dlg.textContent).toContain("within 24–48 hours");
    expect(dlg.textContent.toLowerCase()).not.toContain("escrow");
    expect(dlg.textContent).not.toMatch(/misses the deadline/);
    fireEvent.click(screen.getByText("Got it, create brief"));
    // Session 37: the popup plays a short closing animation before it leaves.
    await waitFor(() => expect(screen.queryByTestId("brief-safety-explainer")).toBeNull());
    expect(hasSeenBriefExplainer("b1")).toBe(true);
    cleanup();
    render(<Host userId="b1" />);
    expect(screen.queryByTestId("brief-safety-explainer")).toBeNull(); // not again automatically
    fireEvent.click(screen.getByText("How it works"));
    expect(screen.getByText("Got it")).toBeTruthy();
  });
});

describe("creator card (session 24 design)", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); });
  const setup = (stats, profile) => apiMock.get.mockImplementation(async (u) => ({ data: u.includes("ugc-stats") ? stats : profile }));

  it("established: stats, platforms, portfolio; manage + chat work", async () => {
    setup({ kyc_verified: true, completed_orders: 12, rating_avg: 4.7, rating_count: 12, on_time_pct: 92, on_time_sample: 10 },
      { name: "Aanya Kapoor", niche: "Skincare, Lifestyle", ig_followers: 18400, followers_youtube: 3100, portfolio: [{ url: "https://x/a.jpg" }, { url: "https://x/b.mp4" }, { url: "https://x/c.png" }, { url: "https://x/d.jpg" }] });
    const onManage = vi.fn();
    render(<MemoryRouter><CreatorCard creatorId="cA" variant="compact" status="In progress" onManage={onManage} chatTo="/brand/inbox?creator=cA" /></MemoryRouter>);
    expect(await screen.findByText("4.7 ★")).toBeTruthy();
    expect(screen.getByText("12 orders")).toBeTruthy();
    expect(screen.getByText("92% on time")).toBeTruthy();
    expect(screen.getByText("Skincare · Lifestyle")).toBeTruthy();
    expect(screen.getByText("18.4K")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    fireEvent.click(screen.getByText("Manage order"));
    expect(onManage).toHaveBeenCalled();
  });
  it("new creator → 'New on Ybex'; no portfolio → no strip; never 0★ / 0%", async () => {
    setup({ kyc_verified: true, completed_orders: 0, rating_count: 0, on_time_pct: null, on_time_sample: 0 }, { name: "Rohan Mehta" });
    render(<MemoryRouter><CreatorCard creatorId="cB" variant="expanded" /></MemoryRouter>);
    expect(await screen.findByText("New on Ybex")).toBeTruthy();
    const card = screen.getByTestId("creator-card");
    expect(card.querySelectorAll("img").length).toBe(0);
    expect(card.textContent).not.toMatch(/0 ★|0% on time|0 orders/);
  });
});

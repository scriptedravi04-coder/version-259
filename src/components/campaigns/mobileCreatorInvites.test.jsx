import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../lib/api", () => ({ api: apiMock }));

import MobileCreatorInvites from "./MobileCreatorInvites";

// Session 26 (Ravi): pending direct invitations show on the mobile creator home too.
describe("session 26: mobile creator invitations", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset(); });

  it("shows nothing when there is no pending invite", async () => {
    apiMock.get.mockResolvedValue({ data: { pending: [] } });
    const { container } = render(<MemoryRouter><MobileCreatorInvites /></MemoryRouter>);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("creators/invitations"));
    expect(container.querySelector('[data-testid="mobile-creator-invites"]')).toBeNull();
  });

  it("lists a pending invite and opens the same review modal as desktop", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        pending: [{
          id: "inv_1", brand_name: "Acme", campaign_title: "Winter Launch",
          proposed_budget: "₹4,500", deliverables: "2 Reels", timeline: "5 days",
          status: "pending_creator_acceptance",
        }],
      },
    });
    render(<MemoryRouter><MobileCreatorInvites /></MemoryRouter>);
    expect(await screen.findByText("Winter Launch")).toBeTruthy();
    expect(screen.getByText(/Acme · ₹4,500 · 2 deliverables/)).toBeTruthy();
    fireEvent.click(screen.getByText("Review"));
    expect(await screen.findByText(/Accept & open deal room/)).toBeTruthy();
  });

  it("is mounted on the mobile creator home", () => {
    const s = fs.readFileSync(path.join(process.cwd(), "src/pages/creator/CreatorHomeMobile.jsx"), "utf8");
    expect(s).toContain("<MobileCreatorInvites refreshKey={invitesRefreshKey} />");
    expect(s).not.toContain("|| 3300");
  });
});

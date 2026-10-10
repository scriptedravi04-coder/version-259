import { it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const apiMock = vi.hoisted(() => ({
  get: vi.fn(async (u) => {
    if (u.startsWith("ugc/briefs/my")) return { data: [{ id: "b1", title: "Serum reel", budget: 3000, max_creators: 2, claimed_count: 1, status: "OPEN", deliverable_type: "ugc_video_edited", applicants: [{ creator_id: "c1", creator_name: "Asha", status: "In progress" }] }] };
    if (u.startsWith("ugc/orders/brand")) return { data: [{ id: "ugcord_1", brief_id: "b1", creator_id: "c1", creator_name: "Asha", status: "ACCEPTED", created_at: new Date(Date.now()-3600e3).toISOString(), internal_deadline: new Date(Date.now()+71*3600e3).toISOString(), agreed_amount: 3000 }] };
    if (u.includes("/ugc-stats")) return { data: { kyc_verified: true, completed_orders: 0, rating_count: 0, on_time_pct: null, on_time_sample: 0 } };
    if (u.includes("/profile")) return { data: { ig_followers: 1200 } };
    return { data: [] };
  }),
  post: vi.fn(async () => ({ data: {} })),
}));
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("../../lib/supabase", () => ({ supabase: null }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { user_id: "br1", email: "b@x.in", role: "brand", name: "Glow" } }) }));
import BrandUGCMobile from "./BrandUGCMobile";
it("brand UGC mobile renders briefs and the claimed-by sheet with real creator stats", async () => {
  const errs = []; const orig = console.error; console.error = (...a) => { errs.push(String(a[0])); };
  render(<MemoryRouter><BrandUGCMobile /></MemoryRouter>);
  const btn = await screen.findByText(/Applicants \(/);
  fireEvent.click(btn);
  expect(await screen.findByText("Claimed by")).toBeTruthy();
  expect(await screen.findByText("New on Ybex")).toBeTruthy();
  // Session 24 designed card (CreatorCard) replaced the first stats strip in this sheet.
  expect(screen.getByTestId("creator-card").getAttribute("data-variant")).toBe("mobile");
  expect(screen.getByText("KYC verified")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/0★|0% on time/);
  console.error = orig;
  expect(errs.filter((e) => /Element type is invalid|is not defined|Cannot read/.test(e))).toEqual([]);
});

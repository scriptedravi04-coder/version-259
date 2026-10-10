import { it, expect, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const apiMock = vi.hoisted(() => ({
  get: vi.fn(async (u) => {
    if (u.startsWith("ugc/briefs/available")) return { data: [{ id: "b1", title: "Serum reel", brand_name: "Glow", budget: 3000, delivery_hours: 48, deliverable_type: "ugc_video_edited", max_creators: 2, claimed_count: 0, status: "OPEN" }] };
    if (u.startsWith("ugc/orders/creator")) return { data: [{ id: "ugcord_1", brief_id: "b0", status: "ACCEPTED", created_at: new Date(Date.now()-3600e3).toISOString(), internal_deadline: new Date(Date.now()+47*3600e3).toISOString(), creator_payout: 2000, agreement_signed_creator: true, brief: { title: "Old" } }] };
    if (u.startsWith("verifications/me")) return { data: { status: "NOT_SUBMITTED" } };
    return { data: [] };
  }),
  post: vi.fn(async () => ({ data: {} })),
}));
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("../../lib/supabase", () => ({ supabase: null }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { user_id: "c1", email: "c@x.in", role: "creator" } }) }));
import CreatorUGCMobile from "./CreatorUGCMobile";
it("creator UGC mobile renders explore, brief details (KYC gate) and manage without crashing", async () => {
  const errs = []; const orig = console.error; console.error = (...a) => { errs.push(String(a[0])); };
  render(<MemoryRouter><CreatorUGCMobile /></MemoryRouter>);
  const cta = await screen.findByText(/View brief/);
  expect(document.body.textContent).toContain("48h delivery");
  fireEvent.click(cta);
  expect(await screen.findByText("Complete KYC to claim")).toBeTruthy();
  cleanup();
  render(<MemoryRouter><CreatorUGCMobile defaultTab="manage" initialOrderId="ugcord_1" /></MemoryRouter>);
  await screen.findAllByText(/Agreement signed|Submit deliverable/);
  console.error = orig;
  expect(errs.filter((e) => /Element type is invalid|is not defined|Cannot read/.test(e))).toEqual([]);
});

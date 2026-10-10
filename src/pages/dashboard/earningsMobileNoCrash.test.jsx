// Session 39 (Ravi: "earning page hi nahi khul raha"): the mobile Earnings screen returned its
// loading skeleton before some hooks, so React crashed ("Rendered more hooks") the moment the
// data arrived. This renders the real page on a phone width and waits for the data.
import { it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const apiMock = vi.hoisted(() => ({
  get: vi.fn(async (u) => {
    if (u.includes("verifications")) return { data: { status: "PENDING" } };
    if (u.includes("fee-config")) return { data: { platform_fee_pct: 10 } };
    return { data: [] };
  }),
  post: vi.fn(async () => ({ data: {} })),
}));
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("../../lib/supabase", () => ({ supabase: null }));
vi.mock("../../hooks/useIsMobile", () => ({ default: () => true }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { user_id: "c1", email: "c@x.in", role: "creator", name: "B Cool" } }) }));
import Earnings from "./Earnings";

it("mobile Earnings opens after loading without a hooks crash", async () => {
  const errs = []; const orig = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(" ")); };
  render(<MemoryRouter><Earnings /></MemoryRouter>);
  await screen.findAllByText(/Earnings/i);
  await new Promise((r) => setTimeout(r, 300));
  console.error = orig;
  expect(errs.filter((e) => /Rendered more hooks|change in the order of Hooks/.test(e))).toEqual([]);
});

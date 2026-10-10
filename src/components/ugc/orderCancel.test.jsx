// Session 25 — order cancel UI (rules 51, 52). The server decides; these check that the screens
// offer the button only when the server would allow it, and send what the server expects.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../lib/api", () => ({ api: apiMock }));
import CreatorCancelOrderSheet from "./CreatorCancelOrderSheet";
import BrandCancelOrderModal, { BrandCancelOrderButton } from "./BrandCancelOrderModal";
import { creatorCancelInfo, brandCancelInfo, CREATOR_CANCEL_REASONS } from "../../utils/ugcOrderCancel";
import fs from "fs";
import path from "path";

const H = 3600000;
const order = (hoursAgo, extra = {}) => {
  const start = Date.now() - hoursAgo * H;
  return { id: "o1", status: "ACCEPTED", agreement_signed_creator: true, created_at: new Date(start).toISOString(), internal_deadline: new Date(start + 48 * H).toISOString(), brief: { delivery_hours: 48 }, ...extra };
};

describe("rules on the client", () => {
  it("creator: grace in the first hour, counts after, never after a draft", () => {
    expect(creatorCancelInfo(order(0.3))).toMatchObject({ allowed: true, counts: false });
    expect(creatorCancelInfo(order(3))).toMatchObject({ allowed: true, counts: true });
    expect(creatorCancelInfo(order(3, { video_url: "v", status: "SUBMITTED" })).allowed).toBe(false);
    expect(creatorCancelInfo(order(3, { agreement_signed_creator: false })).counts).toBe(false);
  });
  it("brand: not in the first 24h, not after a draft, yes after 24h with no draft", () => {
    expect(brandCancelInfo(order(10))).toMatchObject({ show: true, allowed: false, why: "TOO_EARLY" });
    expect(brandCancelInfo(order(30, { video_url: "v" }))).toMatchObject({ allowed: false, why: "DRAFT" });
    expect(brandCancelInfo(order(30))).toMatchObject({ allowed: true });
    expect(brandCancelInfo(order(30, { status: "CANCELLED" })).show).toBe(false);
  });
  it("reason chips match the server list", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../backend/services/ugcDeadlineService.ts"), "utf8");
    CREATOR_CANCEL_REASONS.forEach((r) => expect(src).toContain(`"${r}"`));
  });
});

describe("creator cancel sheet", () => {
  beforeEach(() => { cleanup(); apiMock.post.mockReset(); });
  it("needs a reason, shows the profile warning, posts reason + note", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Order cancelled." } });
    const done = vi.fn();
    render(<CreatorCancelOrderSheet order={order(5)} onClose={() => {}} onCancelled={done} />);
    expect(document.body.textContent).toMatch(/missed deadline/);
    const btn = screen.getByText("Cancel order");
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByText("Other"));
    expect(screen.getByText("Cancel order").disabled).toBe(true); // "Other" needs a note
    fireEvent.change(screen.getByPlaceholderText(/what happened/), { target: { value: "family emergency" } });
    fireEvent.click(screen.getByText("Cancel order"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(apiMock.post).toHaveBeenCalledWith("/ugc/orders/o1/cancel", { reason: "Other", note: "family emergency" });
  });
  it("says it won't count within the first hour", () => {
    render(<CreatorCancelOrderSheet order={order(0.2)} onClose={() => {}} />);
    expect(document.body.textContent).toMatch(/won't count/);
  });
});

describe("brand cancel", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset(); });
  it("button is disabled with the wait time in the first 24 hours", () => {
    render(<BrandCancelOrderButton order={order(10)} onOpen={() => {}} />);
    expect(screen.getByText("Cancel this order").disabled).toBe(true);
    expect(document.body.textContent).toMatch(/you can cancel in 14h/);
  });
  it("saves a refund account first when none is saved, then cancels", async () => {
    apiMock.get.mockResolvedValue({ data: { refund_account: null } });
    apiMock.post.mockImplementation(async (u) => ({ data: u.includes("refund-account") ? { refund_account: { method_type: "UPI" } } : { message: "ok" } }));
    const done = vi.fn();
    render(<BrandCancelOrderModal order={order(30)} amount={5000} onClose={() => {}} onCancelled={done} />);
    expect(document.body.textContent).toMatch(/₹5,000/);
    expect(document.body.textContent).toMatch(/no cancellation fee/);
    fireEvent.change(await screen.findByPlaceholderText(/UPI ID/), { target: { value: "acme@upi" } });
    fireEvent.click(screen.getByText("Cancel & refund"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(apiMock.post.mock.calls[0][0]).toBe("/brand/refund-account");
    expect(apiMock.post.mock.calls[1][0]).toBe("/ugc/orders/o1/cancel");
  });
});

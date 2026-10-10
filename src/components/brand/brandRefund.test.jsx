import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../lib/api", () => ({ api: apiMock }));
import CancelBriefModal from "./CancelBriefModal";
import BriefRefundStatus from "./BriefRefundStatus";

describe("brand cancel & refund UI (session 24)", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); });
  it("the cancel sheet shows the SERVER's amount, not its own guess", async () => {
    apiMock.get.mockImplementation(async (u) => u.includes("cancel-quote")
      ? { data: { open_slots: 1, working_slots: 2, per_slot: 3000, amount: 3000, can_cancel_at: new Date(Date.now() - 1000).toISOString() } }
      : { data: { refund_account: null } });
    // brief says 5 slots / 0 claimed — a local guess would be ₹15,000
    render(<CancelBriefModal isOpen brief={{ id: "b1", title: "T", max_creators: 5, claimed_count: 0, budget: 3000, created_at: "2026-01-01" }} onClose={() => {}} />);
    expect((await screen.findAllByText(/₹3,000/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("15,000");
  });
  it("refund status: processing / refunded with UTR / failed with fix button", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { refund: { status: "PROCESSED", amount: 3000, utr: "UTR123456", processed_at: "2026-09-27T10:00:00Z" } } });
    render(<BriefRefundStatus briefId="b1" />);
    expect((await screen.findByTestId("brief-refund-status")).textContent).toContain("UTR123456");
    cleanup();
    apiMock.get.mockResolvedValueOnce({ data: { refund: { status: "FAILED", amount: 3000, failure_reason: "Wrong IFSC" } } });
    render(<BriefRefundStatus briefId="b2" />);
    expect(await screen.findByText("Update account")).toBeTruthy();
  });
});

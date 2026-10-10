import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(async () => ({ data: {} })) }));
vi.mock("../lib/api", () => ({ api: apiMock }));

import NotificationsMobile, { notificationTarget } from "./notifications/mobile/NotificationsMobile";
import { validatePayoutForm } from "./payments/mobile/PayoutMethodSheet";
import { buildOrderTicketPayload } from "./chat/orderTicket";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("mobile notifications (session 24)", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockClear(); });

  it("renders a notification instead of crashing, and marks it read on tap", async () => {
    apiMock.get.mockResolvedValue({ data: [{ notif_id: "n1", title: "Welcome to YBEX!", message: "<b>hi</b> there", type: "general", read: false, created_at: new Date().toISOString() }] });
    render(<MemoryRouter><NotificationsMobile role="creator" /></MemoryRouter>);
    const title = await screen.findByText("Welcome to YBEX!");
    // plain text, no HTML injection
    expect(screen.getByText("<b>hi</b> there")).toBeTruthy();
    expect(screen.getByText("Mark all read")).toBeTruthy();
    fireEvent.click(title);
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("notifications/n1/read"));
    expect(screen.getByLabelText("Back to inbox")).toBeTruthy();
  });

  it("a failed load says so and offers retry (not 'all caught up')", async () => {
    apiMock.get.mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><NotificationsMobile role="brand" /></MemoryRouter>);
    expect(await screen.findByText("Couldn't load notifications")).toBeTruthy();
  });

  it("only in-app paths are followed", () => {
    expect(notificationTarget({ redirect_path: "/creator/ugc" })).toBe("/creator/ugc");
    expect(notificationTarget({ action_url: "https://evil.example" })).toBeNull();
    expect(notificationTarget({ action_url: "//evil.example" })).toBeNull();
    expect(notificationTarget({ thread_id: "t1" })).toBe("/chat/t1");
  });
});

describe("mobile payouts (session 24)", () => {
  it("form checks match the server rules", () => {
    expect(validatePayoutForm("UPI", { upi: "ravi@okhdfc" })).toBeNull();
    expect(validatePayoutForm("UPI", { upi: "ravi" })).toBeTruthy();
    const bank = { account: "123456789012", confirm: "123456789012", ifsc: "HDFC0001234", holder: "Ravi" };
    expect(validatePayoutForm("BANK", bank)).toBeNull();
    expect(validatePayoutForm("BANK", { ...bank, confirm: "1" })).toMatch(/match/);
  });
  it("Earnings mobile renders the request + payout-account sheets; no dead /settings?tab=payouts", () => {
    const s = read("src/pages/dashboard/Earnings.jsx");
    expect(s).toContain("<PayoutRequestSheet");
    expect(s).toContain("<PayoutMethodSheet");
    expect(s).toContain("onOpenPayoutSettings={() => setShowPayoutMethodSheet(true)}");
    expect(s).not.toContain("/settings?tab=payouts");
    expect(s).not.toContain("* 0.9)");
    // the fake "Payout request submitted!" toast is gone
    expect(s).not.toContain("We'll transfer within 3-5 business days");
    expect(s).toContain("<AddPaymentMethod");
  });
  it("mobile earnings: masked account, no hardcoded month", () => {
    const s = read("src/components/payments/CreatorEarningsMobile.jsx");
    expect(s).toContain("primaryMethod.account_last4");
    expect(s).not.toContain("SEPTEMBER 2026");
  });
});

describe("mobile chat + UGC actions (session 24)", () => {
  it("decline changes is wired, not an empty function", () => {
    const row = read("src/components/chat/mobile/MobileMessageRow.jsx");
    expect(row).not.toContain("onDeclineChanges={() => {}}");
    expect(read("src/components/chat/mobile/ChatBoxMobile.jsx")).toContain("onDeclineChanges={declineRevisions}");
    const hook = read("src/components/chat/mobile/useChatThreadMobile.js");
    expect(hook).toContain("/decline-revisions");
  });
  it("order ticket: desktop modal and mobile sheet share one payload", () => {
    expect(read("src/components/chat/OrderSupportModal.jsx")).toContain("raiseOrderTicket(api");
    expect(read("src/components/chat/mobile/MobileOrderSupportSheet.jsx")).toContain("raiseOrderTicket(api");
    const p = buildOrderTicketPayload({ thread: { id: "t1", deal_id: "deal_123456789", amount_fixed: 5000 }, category: "X", message: " hi " });
    expect(p.order_id).toBe("deal_123456789");
    expect(p.message).toBe("hi");
    expect(p.thread_id).toBe("t1");
  });
  it("UGC mobile: decline + cancel claim use the desktop endpoints; no invented ₹5,000", () => {
    const s = read("src/pages/creator/CreatorUGCMobile.jsx");
    expect(s).toContain("/decline-revisions`, { feedback: declineReason.trim() }");
    expect(s).toContain("/cancel-claim`");
    expect(s).not.toContain("o.brief?.budget || 5000");
  });
});

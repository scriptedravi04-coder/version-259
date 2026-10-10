import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("../payments/InvoiceModal", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import TicketForm from "./TicketForm";
import TicketThread from "./TicketThread";
import { reviewTargetFor } from "../payments/BrandPaymentsMobile";

// Session 33: TicketForm / TicketThread were stubs (Submit only closed; thread showed nothing).
describe("support tickets", () => {
  beforeEach(() => { cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset(); });
  it("Send ticket posts to /support/tickets", async () => {
    apiMock.post.mockResolvedValue({ data: { ticket_id: "t1" } });
    const onClose = vi.fn();
    render(<TicketForm onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/what you were doing/), { target: { value: "Payment stuck" } });
    fireEvent.click(screen.getByText("Send ticket"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/support/tickets", expect.objectContaining({ message: "Payment stuck" })));
    expect(onClose).toHaveBeenCalled();
  });
  it("empty message is not sent", async () => {
    render(<TicketForm onClose={() => {}} />);
    fireEvent.click(screen.getByText("Send ticket"));
    await new Promise((r) => setTimeout(r, 10));
    expect(apiMock.post).not.toHaveBeenCalled();
  });
  it("thread reads the ticket's messages", async () => {
    apiMock.get.mockResolvedValue({ data: [{ message_id: "m1", sender_type: "admin", message: "We fixed it" }] });
    render(<TicketThread ticket={{ ticket_id: "t1", subject: "Help" }} onBack={() => {}} />);
    expect(await screen.findByText("We fixed it")).toBeTruthy();
    expect(apiMock.get).toHaveBeenCalledWith("/support/tickets/t1/messages", expect.anything());
  });
  it("session 34: the owner can reply inside the ticket", async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    apiMock.post.mockResolvedValue({ data: { success: true, status: "OPEN", data: { message_id: "m9", sender_type: "user", message: "Still broken" } } });
    render(<TicketThread ticket={{ ticket_id: "t1", subject: "Help", status: "RESOLVED" }} onBack={() => {}} />);
    fireEvent.change(screen.getByTestId("ticket-reply-input"), { target: { value: "Still broken" } });
    fireEvent.click(screen.getByTestId("ticket-reply-send"));
    expect(await screen.findByText("Still broken")).toBeTruthy();
    expect(apiMock.post).toHaveBeenCalledWith("/support/tickets/t1/messages", { message: "Still broken" });
    expect(screen.getByText(/OPEN ·/)).toBeTruthy();
  });
  it("session 34: a closed ticket has no reply box", async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    render(<TicketThread ticket={{ ticket_id: "t1", subject: "Help", status: "CLOSED" }} onBack={() => {}} />);
    expect(screen.queryByTestId("ticket-reply-input")).toBeNull();
    expect(screen.getByText(/This ticket is closed/)).toBeTruthy();
  });
});

describe("brand payments escrow sheet target", () => {
  it("UGC payment → UGC orders; campaign payment → its deal chat", () => {
    expect(reviewTargetFor({ rawObj: { ugc_order_id: "o1" } })).toBe("/brand/ugc/orders");
    expect(reviewTargetFor({ rawObj: { contract_id: "d9" } })).toBe("/brand/inbox?thread=d9");
    expect(reviewTargetFor({ rawObj: {} })).toBe("/brand/inbox");
  });
});

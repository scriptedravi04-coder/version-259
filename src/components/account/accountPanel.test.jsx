// Session 43 (Ravi): Settings → Account — login details + delete flow.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const logoutMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ logout: logoutMock, setUser: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AccountPanel from "./AccountPanel";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const overview = { data: { email: "ravi@ybex.in", phone: "9876543210", email_verified: true } };

describe("AccountPanel", () => {
  it("shows login details and the delete entry", async () => {
    apiMock.get.mockResolvedValueOnce(overview);
    render(<AccountPanel onOpen={vi.fn()} onDeleted={vi.fn()} />);
    expect(await screen.findByText("ravi@ybex.in")).toBeTruthy();
    expect(screen.getByText("9876543210")).toBeTruthy();
    expect(screen.getByText("Delete account")).toBeTruthy();
  });

  it("devices & privacy rows call onOpen with the right screen", async () => {
    apiMock.get.mockResolvedValueOnce(overview);
    const onOpen = vi.fn();
    render(<AccountPanel onOpen={onOpen} onDeleted={vi.fn()} />);
    await screen.findByText("ravi@ybex.in");
    fireEvent.click(screen.getByText("Devices & sessions"));
    expect(onOpen).toHaveBeenCalledWith("sessions");
    fireEvent.click(screen.getByText("Privacy & terms"));
    expect(onOpen).toHaveBeenCalledWith("legal");
  });

  it("phone change needs a valid 10-digit number and posts it", async () => {
    apiMock.get.mockResolvedValueOnce(overview);
    apiMock.post.mockResolvedValueOnce({ data: { phone: "9000000000" } });
    render(<AccountPanel onOpen={vi.fn()} onDeleted={vi.fn()} />);
    await screen.findByText("ravi@ybex.in");
    fireEvent.click(screen.getByText("Phone"));
    const input = screen.getByPlaceholderText("10-digit number");
    fireEvent.change(input, { target: { value: "12345" } });
    expect(screen.getByText("Save number").disabled).toBe(true); // not a valid mobile
    fireEvent.change(input, { target: { value: "9000000000" } });
    fireEvent.click(screen.getByText("Save number"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("account/phone", { phone: "9000000000" }));
  });

  it("delete is blocked while money is on hold, then runs OTP → confirm when clear", async () => {
    apiMock.get.mockResolvedValueOnce(overview); // overview
    render(<AccountPanel onOpen={vi.fn()} onDeleted={logoutMock} />);
    await screen.findByText("ravi@ybex.in");

    apiMock.get.mockResolvedValueOnce({ data: { blocked: true, reasons: ["deal 42"] } }); // preflight
    fireEvent.click(screen.getByText("Delete account"));
    await waitFor(() => expect(screen.getByText("deal 42")).toBeTruthy());
    expect(screen.getByText("Continue to delete").disabled).toBe(true);
  });

  it("delete runs OTP then confirm when nothing is on hold", async () => {
    apiMock.get.mockResolvedValueOnce(overview);
    render(<AccountPanel onOpen={vi.fn()} onDeleted={logoutMock} />);
    await screen.findByText("ravi@ybex.in");

    apiMock.get.mockResolvedValueOnce({ data: { blocked: false, reasons: [] } }); // preflight
    fireEvent.click(screen.getByText("Delete account"));
    await waitFor(() => expect(screen.getByText("Continue to delete").disabled).toBe(false));

    apiMock.post.mockResolvedValueOnce({ data: { success: true } }); // send-otp
    fireEvent.click(screen.getByText("Continue to delete"));
    const otp = await screen.findByPlaceholderText("______");
    fireEvent.change(otp, { target: { value: "123456" } });
    apiMock.post.mockResolvedValueOnce({ data: { success: true, grace_days: 30 } }); // confirm
    fireEvent.click(screen.getByText("Delete my account"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("account/delete/confirm", { otp: "123456" }));
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });
});

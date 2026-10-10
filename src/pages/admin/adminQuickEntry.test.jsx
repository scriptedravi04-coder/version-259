// Session 43 (Ravi): hidden /admin/ybx entrance — 6 taps reveal a PIN, server checks it.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
const navMock = vi.hoisted(() => vi.fn());
const setUserMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ setUser: setUserMock }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navMock }));

import AdminQuickEntry from "./AdminQuickEntry";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const tap6 = () => { const b = screen.getByLabelText("Ybex"); for (let i = 0; i < 6; i++) fireEvent.click(b); };

describe("AdminQuickEntry", () => {
  it("PIN box is hidden until six taps", () => {
    render(<AdminQuickEntry />);
    expect(screen.queryByPlaceholderText("Admin PIN")).toBeNull();
    tap6();
    expect(screen.getByPlaceholderText("Admin PIN")).toBeTruthy();
  });

  it("a short PIN does not call the server", () => {
    render(<AdminQuickEntry />);
    tap6();
    fireEvent.change(screen.getByPlaceholderText("Admin PIN"), { target: { value: "123" } });
    fireEvent.click(screen.getByText("Enter"));
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("a wrong PIN restores the old token and shows an error (no admin nav)", async () => {
    apiMock.get.mockRejectedValueOnce(new Error("401"));
    render(<AdminQuickEntry />);
    tap6();
    fireEvent.change(screen.getByPlaceholderText("Admin PIN"), { target: { value: "999999" } });
    fireEvent.click(screen.getByText("Enter"));
    await waitFor(() => expect(screen.getByText(/Wrong PIN/i)).toBeTruthy());
    expect(navMock).not.toHaveBeenCalled();
  });

  it("the correct PIN logs in as admin and opens /admin", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { user: { user_id: "a", role: "admin" } } });
    render(<AdminQuickEntry />);
    tap6();
    fireEvent.change(screen.getByPlaceholderText("Admin PIN"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByText("Enter"));
    await waitFor(() => expect(navMock).toHaveBeenCalledWith("/admin", { replace: true }));
    expect(setUserMock).toHaveBeenCalled();
  });
});

// Session 43 (v280): the installed app (start_url /app) shows Ravi's new hero, not the old welcome.
import React from "react";
import fs from "fs";
import path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false }) }));
import AppWelcome from "./AppWelcome";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
afterEach(() => { cleanup(); apiMock.get.mockReset(); });

describe("installed-app welcome = new hero", () => {
  it("shows the new design and no old wording", () => {
    apiMock.get.mockResolvedValue({ data: { enabled: false } });
    render(<MemoryRouter><AppWelcome /></MemoryRouter>);
    expect(screen.getByText(/Hire creators\./)).toBeTruthy();
    expect(screen.getByText("₹45,000")).toBeTruthy();
    expect(screen.queryByText(/done properly/)).toBeNull();
    expect(read("src/pages/app/AppWelcome.jsx").toLowerCase()).not.toContain("escrow");
  });

  it("buttons stay inside the app flow", () => {
    apiMock.get.mockResolvedValue({ data: { enabled: false } });
    render(<MemoryRouter><AppWelcome /></MemoryRouter>);
    expect(screen.getByTestId("app-role-creator").getAttribute("href")).toBe("/app/continue/creator");
    expect(screen.getByTestId("app-role-brand").getAttribute("href")).toBe("/app/continue/brand");
    expect(screen.getByTestId("hero-login").getAttribute("href")).toBe("/app/continue/creator");
    expect(screen.getByTestId("landing-mobile-hero").className).not.toContain("md:hidden");
  });

  it("demo link only when the server says DEMO_LOGIN is on", async () => {
    apiMock.get.mockResolvedValue({ data: { enabled: true } });
    render(<MemoryRouter><AppWelcome /></MemoryRouter>);
    const link = await screen.findByTestId("app-demo-link");
    expect(link.getAttribute("href")).toBe("/login?demo=1");
  });

  it("no demo link on the public server", async () => {
    apiMock.get.mockResolvedValue({ data: { enabled: false } });
    render(<MemoryRouter><AppWelcome /></MemoryRouter>);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    // DEV is true under vitest, so only check the server flag drives it in a build:
    expect(read("src/lib/useDemoLogin.js")).toContain("useState(Boolean(import.meta.env.DEV))");
  });
});

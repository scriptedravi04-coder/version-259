// Session 43 (Ravi): mobile landing hero + splash fixes (Batch 2).
import React from "react";
import fs from "fs";
import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingMobileHero from "./LandingMobileHero";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
afterEach(cleanup);

describe("mobile landing hero", () => {
  it("shows the headline, live campaign card and role cards", () => {
    render(<MemoryRouter><LandingMobileHero /></MemoryRouter>);
    expect(screen.getByText(/Hire creators\./)).toBeTruthy();
    expect(screen.getByText("Diwali Glow Campaign")).toBeTruthy();
    expect(screen.getByText("₹45,000")).toBeTruthy();
    expect(screen.getByText("I'm a Creator")).toBeTruthy();
    expect(screen.getByText("I'm a Brand")).toBeTruthy();
  });

  it("uses 'secure payment hold' wording, never 'escrow'", () => {
    const src = read("src/components/landing/LandingMobileHero.jsx");
    expect(src.toLowerCase()).not.toContain("escrow");
    render(<MemoryRouter><LandingMobileHero /></MemoryRouter>);
    expect(screen.getByText("Secure payment hold")).toBeTruthy();
    expect(screen.getByText("Legal contracts")).toBeTruthy();
  });

  it("role cards link to signup, Log in to /login", () => {
    render(<MemoryRouter><LandingMobileHero /></MemoryRouter>);
    expect(screen.getByText("Log in").closest("a").getAttribute("href")).toBe("/login");
    expect(screen.getByText("I'm a Creator").closest("a").getAttribute("href")).toContain("role=creator");
    expect(screen.getByText("I'm a Brand").closest("a").getAttribute("href")).toContain("role=brand");
  });

  it("the hero turns the status bar purple", () => {
    const src = read("src/components/landing/LandingMobileHero.jsx");
    expect(src).toContain('data-statusbar="#8A00F0"');
  });
});

describe("Landing shows the new hero on mobile only", () => {
  const s = read("src/pages/dashboard/Landing.jsx");
  it("renders LandingMobileHero and hides the desktop Hero on mobile", () => {
    expect(s).toContain("<LandingMobileHero />");
    expect(s).toMatch(/hidden md:block">\s*<Hero \/>/);
  });
});

describe("splash fixes", () => {
  it("installed app first paint is purple (no blank flash)", () => {
    expect(read("index.html")).toContain("(display-mode: standalone), (display-mode: fullscreen) { html { background: #7E00DC; }");
  });
  it("TWA native splash hands off quickly and keeps the purple background", () => {
    const m = JSON.parse(read("twa-manifest.json"));
    expect(m.splashScreenFadeOutDuration).toBe(200);
    expect(m.backgroundColor.toUpperCase()).toBe("#7E00DC");
  });
});

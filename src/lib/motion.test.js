import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pageDirection, shouldCloseSheet, panelMotion, sheetMotion, modalMotion, DUR } from "./motion";

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]
  );

describe("Session 37 — app motion", () => {
  it("page direction: deeper = forward, back = back, tabs = fade", () => {
    expect(pageDirection("/campaigns", "/campaigns/123", "PUSH")).toBe("forward");
    expect(pageDirection("/campaigns/123", "/campaigns", "PUSH")).toBe("back");
    expect(pageDirection("/campaigns/123", "/campaigns", "POP")).toBe("back");
    expect(pageDirection("/dashboard", "/creator/ugc", "PUSH")).toBe("none");
    expect(pageDirection("/brand", "/brand/inbox", "POP")).toBe("none");
    expect(pageDirection("/explore", "/explore", "PUSH")).toBe("none");
  });

  it("sheet closes on a real pull or a flick, not a small nudge", () => {
    expect(shouldCloseSheet({ offset: { y: 120 }, velocity: { y: 0 } })).toBe(true);
    expect(shouldCloseSheet({ offset: { y: 20 }, velocity: { y: 900 } })).toBe(true);
    expect(shouldCloseSheet({ offset: { y: 30 }, velocity: { y: 100 } })).toBe(false);
  });

  it("popup kinds and quick timings", () => {
    expect(panelMotion("sheet")).toBe(sheetMotion);
    expect(panelMotion("modal")).toBe(modalMotion);
    expect(DUR.base).toBeLessThanOrEqual(0.25);
    expect(DUR.fast).toBeLessThan(DUR.base);
  });

  it("one animation library: no GSAP left", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies.gsap).toBeUndefined();
    const files = walk(path.join(root, "src")).filter((f) => /\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f));
    const offenders = files.filter((f) => /from ["']gsap/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("tw-animate-css is loaded so animate-in / fade-in classes work", () => {
    expect(read("src/index.css")).toContain('@import "tw-animate-css"');
  });

  it("route changes never wait for the old page to leave", () => {
    const app = read("src/App.jsx");
    expect(app).not.toContain('mode="wait"');
    expect(app).toContain('MotionConfig reducedMotion="user"');
  });
});

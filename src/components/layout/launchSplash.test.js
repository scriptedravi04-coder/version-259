import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const pngSize = (p) => { const b = fs.readFileSync(path.join(root, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe("Session 43 — app icon + launch splash (Claude Design 4a / 4b)", () => {
  it("icons are the final purple 'Ybex.' tile at the right sizes", () => {
    expect(pngSize("public/pwa-192x192.png")).toEqual([192, 192]);
    expect(pngSize("public/pwa-512x512.png")).toEqual([512, 512]);
    expect(pngSize("public/pwa-maskable-512x512.png")).toEqual([512, 512]);
    expect(pngSize("public/apple-touch-icon.png")).toEqual([180, 180]);
    const svg = read("public/icon.svg");
    expect(svg).toContain("#9B00FF");
    expect(svg).toContain("#2E0066");
  });

  it("every iPhone launch image linked in index.html exists with the size its name says", () => {
    const html = read("index.html");
    const links = [...html.matchAll(/rel="apple-touch-startup-image" href="\/(splash\/launch-(\d+)x(\d+)\.png)"/g)];
    expect(links.length).toBeGreaterThanOrEqual(13);
    for (const [, file, w, h] of links) expect(pngSize(`public/${file}`)).toEqual([+w, +h]);
  });

  it("the purple intro only runs in the installed app, once per session, and can never get stuck", () => {
    const html = read("index.html");
    expect(html).toContain('id="yb-splash"');
    expect(html).toContain("(display-mode: standalone)");
    expect(html).toContain("window.navigator.standalone");
    expect(html).toContain('sessionStorage.getItem("yb_splash_seen")');
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toMatch(/setTimeout\(remove, \d+\)/);
    expect(html).toContain("Where brands meet creators");
  });

  it("the app hands off: mounted in App, shrinks into the home hero banner", () => {
    expect(read("src/App.jsx")).toContain("<AppLaunchSplash />");
    expect(read("src/components/layout/AppLaunchSplash.jsx")).toContain("window.__ybSplash.exit");
    expect(read("src/pages/creator/CreatorHomeMobile.jsx")).toContain('data-splash-target="hero"');
    expect(read("src/pages/brand/BrandHomeMobile.jsx")).toContain('data-splash-target="hero"');
    expect(read("src/components/layout/StatusBarSync.jsx")).toContain("ybex:splash-done");
  });

  it("Android launch colour matches the splash", () => {
    expect(JSON.parse(read("public/manifest.json")).background_color).toBe("#7E00DC");
    expect(JSON.parse(read("twa-manifest.json")).backgroundColor).toBe("#7E00DC");
  });
});

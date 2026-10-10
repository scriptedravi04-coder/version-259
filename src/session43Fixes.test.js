import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

const read = (p) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("Session 43 — Ravi's phone test fixes", () => {
  it("Allow notifications returns as soon as the phone answers (save runs in the background)", async () => {
    vi.resetModules();
    let resolveReady;
    const ready = new Promise((r) => { resolveReady = r; }); // service worker still installing
    Object.defineProperty(globalThis.navigator, "serviceWorker", { value: { ready }, configurable: true });
    globalThis.window.PushManager = function () {};
    globalThis.window.Notification = { permission: "default", requestPermission: async () => { globalThis.window.Notification.permission = "granted"; return "granted"; } };
    globalThis.Notification = globalThis.window.Notification;
    const { askPushPermission } = await import("./lib/push.js");
    const res = await Promise.race([askPushPermission(), new Promise((r) => setTimeout(() => r("hung"), 300))]);
    expect(res).toBe("granted");
    resolveReady(null);
  });

  it("Missed-notification toasts wait while the Allow screen is open", () => {
    expect(read("src/components/push/PushPermissionScreen.jsx")).toContain('"ybex:fullscreen-ask"');
    const n = read("src/components/NotificationPopup.jsx");
    expect(n).toContain("if (activeToast || isGapPeriod || fullScreenAsk || toastQueue.length === 0) return;");
  });

  it("Best matches: short heading, swipeable boxes, no auto-slide", () => {
    const s = read("src/pages/creator/CreatorHomeMobile.jsx");
    expect(s).toContain("Best matches for your profile");
    expect(s).not.toContain("`Best matches for ${campaignsMatchNiche}`");
    expect(s).toContain('data-testid="best-matches-row"');
    expect(s).toContain('scrollSnapType: "x mandatory"');
    const row = s.slice(s.indexOf('data-testid="best-matches-row"') - 600, s.indexOf('data-testid="best-matches-row"'));
    expect(row).not.toMatch(/setInterval|autoplay/i);
  });

  it("Status bar follows each page (Ravi, after the preview): dashboard gradient continues behind the clock", () => {
    const sb = read("src/components/layout/StatusBarSync.jsx");
    expect(sb).toContain('el.getAttribute("data-statusbar")');
    expect(sb).toContain("const c = scrolledTopColor();");
    const html = read("index.html");
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
    expect(html).not.toContain('id="yb-statusbar"');
    expect(read("src/index.css")).not.toContain("#root { padding-top");
    for (const f of ["src/pages/creator/CreatorHomeMobile.jsx", "src/pages/brand/BrandHomeMobile.jsx"]) {
      expect(read(f)).toContain('data-statusbar="#D6C3FF"');
      expect(read(f)).toContain("linear-gradient(180deg, #D6C3FF 0%, #E6DAFF 30%, #F6F1FF 100%)");
    }
  });

  it("A new page or a new section (?section=) opens at the top", () => {
    const l = read("src/components/layout/Layout.jsx");
    expect(l).toContain('[location.pathname, p.get("section"), p.get("subscreen"), p.get("tab"), p.get("view")].join("|")');
    expect(l).toContain("}, [screenKey]);");
  });

  it("Creator quick actions: Refer & Earn and Share profile (not the bottom-bar items); brand says New campaign", () => {
    const c = read("src/pages/creator/CreatorHomeMobile.jsx");
    expect(c).toContain('data-testid="qa-refer"');
    expect(c).toContain('data-testid="qa-share-profile"');
    expect(c).not.toContain("{/* Shortcut 2: Insta UGC");
    expect(read("src/pages/brand/BrandHomeMobile.jsx")).toContain("New campaign");
  });

  it("Match % only when 2+ parts could be compared (no automatic 100%)", () => {
    expect(read("src/pages/creator/CreatorHomeMobile.jsx")).toContain("m.parts.length >= 2");
  });

  it("iPhone launch images stay out of the offline download", () => {
    expect(read("vite.config.js")).toContain("globIgnores: ['splash/**']");
  });
});

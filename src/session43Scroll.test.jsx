// Session 43 (Ravi): "scroll karte hue lag, phir stuck; neeche karo to upar jaata hai".
import React from "react";
import fs from "fs";
import path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import PullToRefresh from "./components/common/PullToRefresh";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
afterEach(cleanup);

describe("one scroller on phones", () => {
  it("app shell is exactly the visible height and the document itself never scrolls", () => {
    const css = read("src/index.css");
    expect(css).toMatch(/@supports \(height: 100dvh\) \{\s*\.app-shell \{ height: 100dvh; \}/);
    expect(css).toMatch(/html:has\(\.app-shell\), body:has\(\.app-shell\) \{[^}]*overflow: hidden;/);
    expect(css).toMatch(/#app-scroll-container \{[^}]*overscroll-behavior-y: contain;/);
    const layout = read("src/components/layout/Layout.jsx");
    expect(layout.match(/app-shell flex h-screen /g)).toHaveLength(2); // h-screen = fallback for old phones
  });
  it("status bar check is throttled while scrolling", () => {
    expect(read("src/components/layout/StatusBarSync.jsx")).toContain("Date.now() - lastRun < 150");
  });
});

describe("pull to refresh never fights the page scroll", () => {
  const content = (root) => root.lastChild; // the moving box
  it("touch-action stays pan-y and touch moves are blocked only during a real pull", () => {
    const src = read("src/components/common/PullToRefresh.jsx");
    expect(src).toContain('style={{ touchAction: "pan-y" }}');
    expect(src).toContain('addEventListener("touchmove", onMove, { passive: false })');
    expect(src).not.toContain("onTouchMove={handleTouchMove}");
  });
  it("a small wobble before a normal scroll does not move the page", () => {
    const { container } = render(<PullToRefresh onRefresh={vi.fn()}><div>x</div></PullToRefresh>);
    const root = container.firstChild;
    fireEvent.touchStart(root, { touches: [{ clientY: 300, clientX: 100 }] });
    fireEvent.touchMove(root, { touches: [{ clientY: 305, clientX: 100 }] }); // 5 px down
    expect(content(root).style.transform).toBe("none");
    fireEvent.touchMove(root, { touches: [{ clientY: 200, clientX: 100 }] }); // then scrolls normally
    expect(content(root).style.transform).toBe("none");
  });
  it("no pull when the page is not at the very top", () => {
    const box = document.createElement("div");
    box.id = "app-scroll-container";
    Object.defineProperty(box, "scrollTop", { value: 1, configurable: true });
    document.body.appendChild(box);
    const onRefresh = vi.fn();
    const { container } = render(<PullToRefresh onRefresh={onRefresh}><div>x</div></PullToRefresh>);
    const root = container.firstChild;
    fireEvent.touchStart(root, { touches: [{ clientY: 100, clientX: 100 }] });
    fireEvent.touchMove(root, { touches: [{ clientY: 300, clientX: 100 }] });
    expect(content(root).style.transform).toBe("none");
    box.remove();
  });
  it("touch-type pointer events are ignored (only a mouse drags)", async () => {
    const onRefresh = vi.fn();
    const { container } = render(<PullToRefresh onRefresh={onRefresh} pullDownThreshold={40}><div>x</div></PullToRefresh>);
    const root = container.firstChild;
    fireEvent.pointerDown(root, { pointerType: "touch", clientY: 100, clientX: 10, button: 0 });
    fireEvent.pointerMove(root, { pointerType: "touch", clientY: 300, clientX: 10 });
    await act(async () => { fireEvent.pointerUp(root, { pointerType: "touch" }); });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rememberResponse, peekApi, snapshotGet, hasSnapshots, clearSnapshots, isPersisted } from "./apiSnapshot";

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

describe("Session 42 — saved answers for instant screens", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearSnapshots();
    window.localStorage.setItem("ybex_token", "token-A");
  });

  it("keeps the last answer and gives it back without a network call", async () => {
    rememberResponse("/api/collabs", { sent: [1], received: [] });
    expect(peekApi("collabs")).toEqual({ sent: [1], received: [] });
    const res = await snapshotGet("/collabs");
    expect(res.data).toEqual({ sent: [1], received: [] });
    expect(hasSnapshots(["collabs"])).toBe(true);
    expect(hasSnapshots(["collabs", "campaigns"])).toBe(false);
  });

  it("rejects when nothing is saved, so the caller's fallback runs", async () => {
    await expect(snapshotGet("ugc/orders/creator")).rejects.toThrow();
  });

  it("survives an app restart only for the listed home / inbox reads", () => {
    rememberResponse("chat/v2/threads", [{ id: 1 }]);
    rememberResponse("admin/users", [{ id: 2 }]);
    expect(isPersisted("chat/v2/threads")).toBe(true);
    expect(isPersisted("admin/users")).toBe(false);
    const keys = Object.keys(window.localStorage);
    expect(keys.some((k) => k.includes("/api/chat/v2/threads"))).toBe(true);
    expect(keys.some((k) => k.includes("/api/admin/users"))).toBe(false);
  });

  it("never shows one account's data to another account on the same phone", () => {
    rememberResponse("collabs", { sent: ["mine"] });
    clearSnapshots(); // drop the in-memory copy, keep the phone copy
    rememberResponse("collabs", { sent: ["mine"] });
    window.localStorage.setItem("ybex_token", "token-B");
    // memory copy is per app session; a reload for account B reads only the phone copy
    clearMemoryOnly();
    expect(peekApi("collabs")).toBeUndefined();
  });

  it("logout wipes everything", () => {
    rememberResponse("notifications", [{ id: 1 }]);
    clearSnapshots();
    expect(peekApi("notifications")).toBeUndefined();
    expect(Object.keys(window.localStorage).some((k) => k.startsWith("ybex_snap:"))).toBe(false);
  });

  it("logout paths in AuthContext call clearSnapshots", () => {
    const s = read("src/contexts/AuthContext.jsx");
    const removals = (s.match(/forgetMediaKey\(\);/g) || []).length;
    const clears = (s.match(/forgetMediaKey\(\); clearSnapshots\(\);/g) || []).length;
    expect(removals).toBeGreaterThan(0);
    expect(clears).toBe(removals);
  });

  it("phones no longer download the desktop dashboards (charts) up front", () => {
    const d = read("src/pages/dashboard/Dashboard.jsx");
    expect(d).not.toMatch(/^import CreatorDashboard/m);
    expect(d).not.toMatch(/^import BrandDashboard/m);
    expect(d).toMatch(/lazy\(\(\) => import\("..\/..\/components\/dashboard\/CreatorDashboard"\)\)/);
  });
});

// Simulates a fresh app start: the in-memory map is gone, only the phone copy is left.
function clearMemoryOnly() {
  const saved = {};
  for (const k of Object.keys(window.localStorage)) saved[k] = window.localStorage.getItem(k);
  clearSnapshots();
  for (const [k, v] of Object.entries(saved)) window.localStorage.setItem(k, v);
}

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("Session 43 — push stays admin-only and keyless in code", () => {
  const src = read("backend/push_routes.ts");

  it("brand team roles never pass the push admin check", () => {
    const line = src.split("\n").find((l) => l.includes("const isAdmin")) || "";
    expect(line).toContain('u.role === "admin"');
    // a brand team member can hold team_role "admin" / "owner" — those must not send app-wide pushes
    expect(line).not.toMatch(/team_role/);
  });

  it("no VAPID key is written in the code (env only)", () => {
    expect(src).toMatch(/process\.env\.VAPID_PUBLIC_KEY \|\| ""/);
    expect(src).toMatch(/process\.env\.VAPID_PRIVATE_KEY \|\| ""/);
    expect(src).not.toMatch(/VAPID_PRIVATE_KEY \|\| "[A-Za-z0-9_-]{20,}"/);
  });

  it("Send now asks in-app before it goes out", () => {
    const ui = read("src/components/admin/PushNotificationsManager.jsx");
    expect(ui).not.toContain("window.confirm");
    expect(ui).toContain("setConfirmSend(true)");
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
// @ts-ignore — plain ESM helper shared with the protect:update CLI
import { LOGIC_FILES, SCREEN_GROUPS, MANIFEST, currentState, exists } from "../scripts/protectedFlows.mjs";

// Session 28 (Ravi): Campaign, UGC and Invite-to-campaign are LOCKED. ARCHITECTURE.md rule 60.
// If this test fails you changed a protected flow. Undo your change. Only if Ravi approved this
// exact change in writing: `npm run protect:update -- --reason "..."`. Never edit this test,
// the manifest or the file lists to make it pass.

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", MANIFEST), "utf8"));
const now = currentState();
const STOP = "PROTECTED FLOW (Campaign / UGC / Invite) — Ravi locked this. Undo the change, or ask Ravi.";

describe("protected flows: logic files are frozen", () => {
  it("every locked file is still there", () => {
    const missing = (LOGIC_FILES as string[]).filter((f) => !exists(f));
    expect(missing, `${STOP}\nDeleted/moved: ${missing.join(", ")}`).toEqual([]);
  });
  it("no locked file changed", () => {
    const changed = (LOGIC_FILES as string[]).filter((f) => manifest.logic?.[f] !== now.logic[f]);
    expect(changed, `${STOP}\nChanged: ${changed.join(", ")}`).toEqual([]);
  });
  it("the lock list itself was not shortened", () => {
    const dropped = Object.keys(manifest.logic || {}).filter((f) => !(LOGIC_FILES as string[]).includes(f));
    expect(dropped, `${STOP}\nRemoved from the lock list: ${dropped.join(", ")}`).toEqual([]);
  });
});

describe("protected flows: screens may be redesigned, their server calls may not change", () => {
  for (const group of Object.keys(SCREEN_GROUPS)) {
    it(`${group}: every screen makes the same server calls as the locked build`, () => {
      const problems: string[] = [];
      const files = new Set([...Object.keys(manifest.screens?.[group] || {}), ...Object.keys(now.screens[group])]);
      for (const f of files) {
        const before: string[] = manifest.screens?.[group]?.[f] || [];
        const after: string[] = now.screens[group][f] || [];
        const removed = before.filter((c) => !after.includes(c));
        const added = after.filter((c) => !before.includes(c));
        if (removed.length || added.length) problems.push(`${f} — removed: ${removed.join(", ") || "none"}; added: ${added.join(", ") || "none"}`);
      }
      expect(problems, `${STOP}\n${problems.join("\n")}\nDesign changes are fine; server calls must stay the same.`).toEqual([]);
    });
  }
  it("no screen group was dropped", () => {
    const dropped = Object.keys(manifest.screens || {}).filter((g) => !(g in SCREEN_GROUPS));
    expect(dropped).toEqual([]);
  });
  it("every screen file listed still exists", () => {
    const missing = Object.values(SCREEN_GROUPS as Record<string, string[]>).flat().filter((f) => !exists(f));
    expect(missing, `${STOP}\nScreen file missing: ${missing.join(", ")}`).toEqual([]);
  });
});

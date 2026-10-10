import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ALL_FLOW_STATES } from "./statusTokens";

const ROOT = path.resolve(__dirname, "..");
const files = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(`${dir}/${d.name}`) : d.name.endsWith(".ts") && !d.name.endsWith(".test.ts") ? [`${dir}/${d.name}`] : []
  );

describe("flow_state tokens", () => {
  it("every flow_state the backend writes is listed in statusTokens.ts", () => {
    const unknown: string[] = [];
    for (const f of files("backend")) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const m of src.matchAll(/flow_state:\s*['"]([A-Z_]+)['"]/g)) {
        if (!ALL_FLOW_STATES.includes(m[1])) unknown.push(`${f}: ${m[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

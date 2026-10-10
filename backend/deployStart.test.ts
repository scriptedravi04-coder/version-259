import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Cloud Run runs `npm start`. It once pointed at `node server.ts`, which plain Node cannot run
// (extensionless imports) — the container crashed before listening on PORT and every deploy failed.
describe("production start command", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

  it("npm start runs the built bundle in production mode", () => {
    expect(pkg.scripts.start).toContain("dist/server.cjs");
    expect(pkg.scripts.start).toContain("NODE_ENV=production");
  });

  it("npm run build produces that bundle", () => {
    expect(pkg.scripts.build).toContain("--outfile=dist/server.cjs");
  });

  it("the server listens on process.env.PORT on 0.0.0.0", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "backend", "server.ts"), "utf8");
    expect(src).toMatch(/Number\(process\.env\.PORT\)/);
    expect(src).toMatch(/httpServer\.listen\(PORT,\s*"0\.0\.0\.0"/);
  });
});

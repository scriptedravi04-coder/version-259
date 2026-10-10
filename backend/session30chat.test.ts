import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Session 30: mobile chat already follows Ravi's Uniqe_Chat design; these guard the clean-up.
const dir = path.resolve(__dirname, "../src/components/chat/mobile");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsx"));

describe("mobile chat shows only real values", () => {
  it("no made-up message times", () => {
    for (const f of files) expect(fs.readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(/:\s*"\d{1,2}:\d{2}";/);
  });
  it("no invented original ask or minimum counter", () => {
    const offer = fs.readFileSync(path.join(dir, "MobileOfferCard.jsx"), "utf8");
    expect(offer).not.toContain("|| 15000");
    expect(offer).not.toContain("Minimum ₹3,000");
  });
});

describe("loader 14b", () => {
  it("route code loading runs the top bar", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../src/App.jsx"), "utf8");
    const fb = app.slice(app.indexOf("function RouteLoaderFallback"), app.indexOf("function AnimatedRoutes"));
    expect(fb).toContain("startLoading");
    expect(fb).toContain("stopLoading");
  });
});

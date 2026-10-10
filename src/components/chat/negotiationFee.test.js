import { describe, it, expect } from "vitest";
import fs from "fs";

describe("negotiation table shows the real money (session 36)", () => {
  const src = fs.readFileSync("src/components/chat/NegotiationTable.jsx", "utf8");
  it("no invented 2% brand charge", () => {
    expect(src).not.toMatch(/platformFeePct\s*=\s*2/);
    expect(src).not.toContain("Platform Service Charge (2%)");
    expect(src).toContain("const brandTotal = subtotal;");
  });
  it("creator side does not promise a fee-free net", () => {
    expect(src).not.toContain("Guaranteed Creator Net Payout");
  });
});

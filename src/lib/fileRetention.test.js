import { describe, it, expect } from "vitest";
import { RETENTION_DAYS, availableUntil, retentionLine, APPROVE_NOTICE, FILE_REMOVED_TEXT } from "./fileRetention";

describe("15-day file retention (session 36)", () => {
  it("adds 15 days to the approval time", () => {
    expect(RETENTION_DAYS).toBe(15);
    expect(availableUntil("2026-10-07T10:00:00Z").toISOString()).toBe("2026-10-22T10:00:00.000Z");
    expect(availableUntil(null)).toBe(null);
    expect(availableUntil("not a date")).toBe(null);
  });
  it("shows a date when known, else '15 days' — never an invented date", () => {
    expect(retentionLine("creator", "2026-10-07T10:00:00Z")).toMatch(/until 22 Oct 2026/);
    expect(retentionLine("brand", null)).toMatch(/for 15 days/);
    expect(APPROVE_NOTICE).toMatch(/15 days/);
    expect(FILE_REMOVED_TEXT).toMatch(/15 days/);
  });
});

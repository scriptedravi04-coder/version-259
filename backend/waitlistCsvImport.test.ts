import { describe, it, expect } from "vitest";
import { prepareCsvRows, toWaitlistRow } from "./waitlistCsvImport";
import { WAITLIST_COLUMNS, sendApplicationDecisionEmail } from "./creatorApplication";
import fs from "fs";

describe("Admin CSV import (session 36)", () => {
  it("checks rows without inventing anything", () => {
    const res = prepareCsvRows([
      { name: "Asha", email: "ASHA@x.in", mobile: "9876543210", instagram: "https://instagram.com/asha.c/", followers: "1.5L", price: "2500" },
      { name: "", email: "b@x.in" },
      { name: "C", email: "bad" },
      { name: "D", email: "old@x.in" },
      { name: "E", email: "asha@x.in" },
      { name: "F", email: "f@x.in", followers: "lots" },
      { Name: "G", "Email ID": "g@x.in" },
    ], new Set(["old@x.in"]));
    expect(res.map((r) => r.status)).toEqual(["ok", "error", "error", "duplicate", "duplicate", "error", "ok"]);
    expect(res[0].value).toMatchObject({ email: "asha@x.in", followers: 150000, charges: "₹2,500", social_handle: "asha.c", mobile: "+919876543210" });
    // empty cells stay empty — no 10,000 followers / Mumbai / ₹5,000 defaults
    expect(res[6].value).toMatchObject({ followers: null, city: null, charges: null, avg_reach: null });
  });

  it("saves only real waitlist columns, as Pending csv_import", () => {
    const row: any = toWaitlistRow({ name: "A", email: "a@x.in", followers: null });
    expect(row).toMatchObject({ status: "Pending", source: "csv_import", role: "creator" });
    for (const k of Object.keys(row)) expect(WAITLIST_COLUMNS).toContain(k);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("imported people get no approve / reject email", async () => {
    process.env.RESEND_API_KEY = "x";
    expect(await sendApplicationDecisionEmail({ email: "a@real.in", source: "csv_import" }, "approved")).toBe(false);
    delete process.env.RESEND_API_KEY;
  });

  it("old routes are closed (no profiles with invented numbers)", () => {
    const src = fs.readFileSync("backend/public_creator_routes.ts", "utf8");
    expect(src).not.toMatch(/engagement_rate|performance_score|verified: true/);
    expect(src).toContain("status(410)");
  });
});

// Session 33: GET /brands/:id is public but returned the whole brand_profiles row (POC email,
// phone, tax/bank) to anyone. Others now get public fields only.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const src = fs.readFileSync(path.join(process.cwd(), "backend/brands_routes.ts"), "utf8");
const route = src.slice(src.indexOf('router.get("/brands/:id"'), src.indexOf('router.get("/brand-profile"'));

describe("public brand profile", () => {
  it("shapes every response (owner/admin full, others public)", () => {
    expect(route).toMatch(/const shape = \(row: any\) => \(canSeeAll\(row\) \? row : publicBrand\(row\)\)/);
    expect(route).not.toMatch(/return res\.json\(sanitized\);/);
    expect(route).not.toMatch(/return res\.json\(sanitizeBrandProfile\(local\)\);/);
  });
  it("public list has no contact / tax / bank fields", () => {
    const list = src.slice(src.indexOf("const PUBLIC_BRAND_FIELDS"), src.indexOf("const publicBrand"));
    const fields = (list.match(/"([a-z_]+)"/g) || []).map((x) => x.slice(1, -1));
    expect(fields).toContain("company_name");
    for (const f of fields) expect(f).not.toMatch(/email|phone|mobile|gst|^pan|bank|ifsc|poc|contact|address|account/);
  });
});

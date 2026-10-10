import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Session 19g. Competitor names had been written into the product by an AI generator, and the
// chat signing screens ran a browser-only "OTP". Ravi's rule: signing takes only the
// representative's mobile number; no competitor name may appear anywhere in the product.

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");
const BANNED = /influish|hashfame|hash\s*fame|datrux/i;

function walk(dir: string, out: string[] = []) {
  for (const f of fs.readdirSync(dir)) {
    if (["node_modules", "dist", ".git"].includes(f)) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?|json|html|md|css|txt)$/.test(f) && st.size < 5_000_000) out.push(p);
  }
  return out;
}

describe("no competitor names", () => {
  it("appear anywhere in the source, seed data or public files", () => {
    const hits = walk(ROOT)
      .filter((f) => !f.endsWith("brandingAndSigning.test.ts"))
      .filter((f) => BANNED.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});

describe("chat signing screens", () => {
  for (const f of ["src/components/chat/AgreementSign.jsx", "src/components/chat/BrandAgreement.jsx"]) {
    it(`${path.basename(f)} takes only the mobile number and runs no fake OTP`, () => {
      const s = read(f);
      expect(s).not.toMatch(/Math\.random\(\)/);
      expect(s).not.toMatch(/generatedOtp|signerName|signerTitle|showSmsSimulator/);
      expect(s).toContain("signer_mobile: mobile");
      expect(s).toMatch(/\^\[6-9\]\\d\{9\}\$/);
      expect(s).not.toMatch(/"Alisha"|GutarGoo|ialishathakur|\|\| 15000/);
    });
  }
  it("the server keeps the signer's mobile with the signature record", () => {
    const s = read("backend/deals_chat_routes.ts");
    expect((s.match(/signer_id: user\.user_id, signer_mobile,/g) || []).length).toBe(3);
  });
});

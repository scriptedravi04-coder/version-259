import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Session 41 — the brand phone dashboard called GET /brands/profile, a route that never existed
// (only POST does), so the logo uploaded in onboarding never showed. This test reads every fixed
// `api.get/post/put/patch/delete("…")` in src/ and checks the server has a matching route.

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { if (name !== "node_modules") walk(p, exts, out); }
    else if (exts.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const routes: { method: string; rx: RegExp }[] = [];
for (const file of walk(path.resolve("backend"), /\.ts$/)) {
  const src = fs.readFileSync(file, "utf8");
  const re = /(?:router|app)\.(get|post|put|patch|delete|all)\(\s*(\[[^\]]*\]|["'`][^"'`]+["'`])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const pm of m[2].matchAll(/["'`]([^"'`]+)["'`]/g)) {
      let p = pm[1].split("?")[0].replace(/\/$/, "");
      if (p.startsWith("/api/")) p = p.slice(4);
      const rx = new RegExp("^" + p.replace(/:[A-Za-z_]+\??/g, "[^/]+").replace(/\*/g, ".*") + "/?$");
      routes.push({ method: m[1], rx });
    }
  }
}

describe("frontend API calls have a server route (session 41)", () => {
  it("no call goes to a route that does not exist", () => {
    const missing: string[] = [];
    for (const file of walk(path.resolve("src"), /\.(jsx?|tsx?)$/)) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bapi\.(get|post|put|patch|delete)\(\s*([`"'])([^`"']+)\2/g)) {
        const method = m[1];
        let u = m[3].replace(/\$\{[^}]*\}/g, "X").split("?")[0];
        if (u.startsWith("X") || u.startsWith("http")) continue;
        u = ("/" + u.replace(/^\/+/, "")).replace(/\/$/, "");
        if (u.startsWith("/api/")) u = u.slice(4);
        if (!routes.some((r) => (r.method === method || r.method === "all") && r.rx.test(u))) {
          missing.push(`${method.toUpperCase()} ${m[3]} ← ${path.relative(process.cwd(), file)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("the brand dashboard reads its profile from a real route", () => {
    const src = fs.readFileSync(path.resolve("src/pages/brand/BrandHomeMobile.jsx"), "utf8");
    expect(src).not.toMatch(/api\.get\(\s*[`"']\/?brands\/profile/);
    expect(src).toMatch(/api\.get\("brands\/me"\)/);
  });
});

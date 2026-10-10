import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Session 41 — a creator tapped "Chat with Brand" on a UGC order and got "This page doesn't exist":
// the button opened /creator/inbox/<thread>, a page that was never added. This test reads every
// fixed in-app link (navigate("/…"), to="/…", href="/…") and checks it matches a <Route> in App.jsx.

const SRC = path.resolve(process.cwd(), "src");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const appSrc = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");
const routes = [...appSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((r) => r !== "*");
const routeRx = routes.map(
  (r) => new RegExp("^" + r.replace(/\/$/, "").replace(/:[A-Za-z_]+\??/g, "[^/]+") + "/?$")
);

function linksIn(code) {
  const out = [];
  const rx = /(?:navigate\(\s*|\bto=\{?\s*|\bhref=\{?\s*)[`'"](\/[^`'"?#]*)/g;
  let m;
  while ((m = rx.exec(code))) out.push(m[1]);
  return out;
}

describe("in-app links (session 41)", () => {
  const broken = [];
  for (const file of walk(SRC)) {
    const code = fs.readFileSync(file, "utf8");
    for (const link of linksIn(code)) {
      if (link.startsWith("/api") || link.startsWith("//") || /\.[a-z0-9]+$/i.test(link)) continue;
      // `${x}` inside a template stands for one path part
      const target = link.replace(/\$\{[^}]*\}/g, "X").replace(/\/$/, "") || "/";
      if (target.includes("X") && /^X|\/X[^/]/.test(target)) continue; // whole path built at runtime
      if (!routeRx.some((r) => r.test(target))) broken.push(`${path.relative(SRC, file)} → ${link}`);
    }
  }

  it("every fixed link opens a real page", () => {
    expect(broken).toEqual([]);
  });

  it("UGC 'Chat with Brand' route exists for creators (the reported 404)", () => {
    expect(routes).toContain("/creator/inbox/:userId");
  });
});

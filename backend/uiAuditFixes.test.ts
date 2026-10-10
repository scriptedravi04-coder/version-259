import { describe, it, expect } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import { setupMissingRoutes } from "./missing_routes";

// Session 19e — fixes for the full UI audit (19d).

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

async function serve(app: express.Express, fn: (base: string) => Promise<void>) {
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const port = (srv.address() as any).port;
  try { await fn(`http://127.0.0.1:${port}`); } finally { srv.close(); }
}
function mkApp(db: any, user: any) {
  const app = express(); app.use(express.json());
  const router = express.Router();
  setupMissingRoutes(app, router, { supabase: null, privilegedSupabase: null, getDb: () => db, parseAuthUser: async () => user } as any);
  app.use("/api", router);
  return app;
}
const post = (base: string, p: string, body: any) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("routes that used to 404", () => {
  it("referral stats count real referrals, invent nothing", async () => {
    const db = { referrals: [{ id: "r1", referrer_id: "u1", status: "pending" }, { id: "r2", referrer_id: "u1", status: "rewarded" }, { id: "r3", referrer_id: "u2", status: "rewarded" }] };
    await serve(mkApp(db, { user_id: "u1", role: "creator" }), async (base) => {
      const d = await (await fetch(base + "/api/referral/stats")).json();
      expect(d.total_referred).toBe(2);
      expect(d.rewards_earned).toBe(1);
      expect(d.reward_amount).toBeNull();
    });
  });

  it("coupons validate: valid, expired, unknown, below minimum, wrong audience", async () => {
    const future = new Date(Date.now() + 86400e3).toISOString(), past = new Date(Date.now() - 86400e3).toISOString();
    const db = { coupons: [
      { id: "c1", code: "SAVE10", type: "flat_discount", discount_amount: 100, status: "active", usage_limit: 5, used_count: 0, valid_until: future, applies_to: "all" },
      { id: "c2", code: "OLD", status: "active", valid_until: past },
      { id: "c3", code: "BIG", status: "active", min_campaign_value: 50000 },
      { id: "c4", code: "BRANDONLY", status: "active", applies_to: "brand" },
    ] };
    await serve(mkApp(db, { user_id: "u1", role: "creator" }), async (base) => {
      const ok = await (await post(base, "/api/coupons/validate", { code: "save10", campaign_amount: 10000 })).json();
      expect(ok.valid).toBe(true);
      expect(ok.code).toBe("SAVE10");
      expect((await post(base, "/api/coupons/validate", { code: "OLD" })).status).toBe(400);
      expect((await post(base, "/api/coupons/validate", { code: "NOPE" })).status).toBe(404);
      expect((await post(base, "/api/coupons/validate", { code: "BIG", campaign_amount: 1000 })).status).toBe(400);
      expect((await post(base, "/api/coupons/validate", { code: "BRANDONLY" })).status).toBe(400);
    });
  });

  it("AI negotiation answers without Gemini (rules), shaped as the chat expects", async () => {
    const prev = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
    try {
      await serve(mkApp({}, { user_id: "u1", role: "creator" }), async (base) => {
        const d = await (await post(base, "/api/ai/negotiation", { offer: 12000, history: [] })).json();
        expect(d.suggestedResponse).toContain("12,000");
        expect(d.source).toBe("rules");
      });
    } finally { if (prev !== undefined) process.env.GEMINI_API_KEY = prev; }
  });

  it("profile suggestions come from what is actually missing", async () => {
    await serve(mkApp({}, { user_id: "u1", role: "creator" }), async (base) => {
      const d = await (await post(base, "/api/ai/profile-suggestions", { creator: { bio: "short", city: "Delhi", instagram_handle: "x" } })).json();
      const titles = d.map((x: any) => x.title).join(" | ");
      expect(titles).toContain("bio");
      expect(titles).not.toContain("city");
      expect(titles).not.toContain("social");
    });
  });

  it("every one of them needs a signed-in user", async () => {
    await serve(mkApp({}, null), async (base) => {
      expect((await fetch(base + "/api/referral/stats")).status).toBe(401);
      expect((await post(base, "/api/coupons/validate", { code: "X" })).status).toBe(401);
      expect((await post(base, "/api/ai/negotiation", {})).status).toBe(401);
    });
  });
});

describe("every frontend API call has a backend route", () => {
  it("no call points at a route that does not exist", () => {
    const glob = (dir: string, out: string[] = []) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) glob(p, out); else out.push(p);
      }
      return out;
    };
    const routes: [string, RegExp][] = [];
    for (const f of glob(path.join(ROOT, "backend")).filter((f) => f.endsWith(".ts") && !f.includes(".test."))) {
      // Comments inside a route array can hold quotes, which would break the string pairing.
      const t = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "");
      for (const m of t.matchAll(/(?:router|app)\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|"[^"]+"|'[^']+'|`[^`]+`)/g)) {
        for (const q of m[2].matchAll(/["'`]([^"'`]+)["'`]/g)) {
          let p = q[1]; if (!p.startsWith("/")) continue; if (p.startsWith("/api/")) p = p.slice(4);
          const rx = "^" + p.replace(/\/$/, "").split("/").map((s) => s.startsWith(":") ? "[^/]+" : s === "*" ? ".*" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/") + "/?$";
          routes.push([m[1].toUpperCase(), new RegExp(rx)]);
        }
      }
    }
    const missing: string[] = [];
    for (const f of glob(path.join(ROOT, "src")).filter((f) => /\.(jsx?|tsx?)$/.test(f) && !f.includes(".test."))) {
      const t = fs.readFileSync(f, "utf8");
      for (const m of t.matchAll(/api\.(get|post|put|patch|delete)\(\s*([`"'])(.+?)\2/g)) {
        let u = m[3].replace(/\$\{[^}]+\}/g, "X").split("?")[0];
        if (u.startsWith("http")) continue;
        if (!u.startsWith("/")) u = "/" + u;
        if (u.startsWith("/api/")) u = u.slice(4);
        // A namespace chosen at runtime (`${ns}/threads/...`) or a whole path built at runtime.
        if (/^\/X\//.test(u) || u === "/X" || /\/X\/X$/.test(u) || u.endsWith("X") && !u.endsWith("/X")) continue;
        const meth = m[1].toUpperCase();
        if (!routes.some(([rm, rx]) => rm === meth && rx.test(u))) missing.push(`${meth} ${u}  (${path.relative(ROOT, f)})`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("UI audit fixes (source)", () => {
  it("admin mobile payout records on the real route and never fakes success", () => {
    const s = read("src/components/admin/AdminPayoutMobile.jsx");
    expect(s).not.toContain('api.post("admin/payouts/mark-disbursed"');
    expect(s).toContain("/release-payout");
    expect(s).not.toContain("Backend endpoint fallback executed");
  });
  it("mobile creator profile has a PATCH route", () => {
    expect(read("backend/creators_routes.ts")).toContain('router.patch("/creators/me", saveCreatorProfile)');
  });
  it("legacy UGC post goes through the paid brief flow", () => {
    const s = read("src/pages/ugc/UgcOrders.jsx");
    expect(s).not.toContain('api.post("ugc-orders"');
    expect(s).toContain('navigate("/brand/ugc/post")');
  });
  it("unknown URLs show a 404 page instead of silently going home", () => {
    const s = read("src/App.jsx");
    expect(s).toContain("<NotFoundPage />");
    expect(s).not.toContain('<Route path="*" element={<Navigate to="/" replace />} />');
  });
  it("the full-screen loader cannot trap the app", () => {
    const s = read("src/contexts/LoadingContext.jsx");
    // startLoading arms a timer that clears the loader on its own.
    expect(s).toMatch(/safetyTimerRef\.current = setTimeout\(\(\) => \{\s*setIsLoading\(false\);/);
  });
  it("privacy page does not scroll sideways on mobile", () => {
    expect(read("src/pages/dashboard/PrivacyPolicy.jsx")).toContain("overflow-x-hidden");
  });
  it("the desktop-only sheet is gone (Session 43: the app is built for phones)", () => {
    expect(fs.existsSync(path.resolve(__dirname, "..", "src/components/MobileDeviceWarningModal.jsx"))).toBe(false);
  });
});

describe("wiring", () => {
  it("server.ts registers the previously-missing routes", () => {
    expect(read("backend/server.ts")).toMatch(/setupMissingRoutes\(app, router, \{/);
  });
});

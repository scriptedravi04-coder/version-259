import { describe, it, expect } from "vitest";
import express from "express";
import { recordConsents, latestConsents, setupConsentRoutes } from "./consents";

const deps = () => { const db: any = {}; return { db, getClient: () => null, getDb: () => db, saveDb: () => {} }; };

describe("consent records (session 34)", () => {
  it("records terms / privacy / marketing; latest decision per kind wins", async () => {
    const d = deps();
    await recordConsents(d, "u1", [{ kind: "terms", granted: true }, { kind: "marketing", granted: true }, { kind: "bogus" as any, granted: true }]);
    await recordConsents(d, "u1", [{ kind: "marketing", granted: false }]);
    const c = await latestConsents(d, "u1");
    expect(c.terms.granted).toBe(true);
    expect(c.marketing.granted).toBe(false);
    expect(c.bogus).toBeUndefined();
  });
  it("routes need a login and valid items", async () => {
    const d = deps();
    const router = express.Router();
    let user: any = null;
    setupConsentRoutes(router, { ...d, parseAuthUser: async () => user });
    const post: any = router.stack.find((l: any) => l.route?.path === "/consents" && l.route.methods.post)!.route!.stack[0].handle;
    const call = async (body: any) => { let st = 200, js: any; const res: any = { status(s: number) { st = s; return res; }, json(j: any) { js = j; return res; } }; await post({ body, headers: {} }, res, () => {}); return { st, js }; };
    expect((await call({ items: [{ kind: "terms", granted: true }] })).st).toBe(401);
    user = { user_id: "u2" };
    expect((await call({ items: [{ kind: "nope", granted: true }] })).st).toBe(400);
    const ok = await call({ items: [{ kind: "brand_terms", granted: true }] });
    expect(ok.js.consents.brand_terms.granted).toBe(true);
  });
});

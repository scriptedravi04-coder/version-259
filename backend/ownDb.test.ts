// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "http";
import express from "express";

const posts: any[] = [];
vi.mock("../src/lib/api", () => ({ api: { post: async (url: string, body: any) => { posts.push({ url, body }); return { data: { data: [{ ok: 1 }] } }; } } }));
import { ownDb } from "../src/lib/ownDb";
import { setupBrowserDbRoutes } from "./browserDbRoutes";

describe("ownDb shim", () => {
  it("collects .eq() chained after update/delete and returns { data, error }", async () => {
    const r = await ownDb.from("creator_social_channels").delete().eq("creator_id", "u1").eq("platform", "instagram");
    expect(r).toEqual({ data: [{ ok: 1 }], error: null });
    expect(posts.at(-1)).toEqual({ url: "/db/own", body: { table: "creator_social_channels", op: "delete", values: undefined, match: { creator_id: "u1", platform: "instagram" }, options: undefined } });
  });
});

describe("POST /api/db/own", () => {
  let server: http.Server; let base = "";
  const calls: any[] = [];
  const q: any = {};
  for (const m of ["upsert", "insert", "update", "delete", "eq", "select"]) q[m] = (...a: any[]) => { calls.push([m, ...a]); return m === "select" ? Promise.resolve({ data: [], error: null }) : q; };
  beforeAll(async () => {
    const app = express(); app.use(express.json()); const router = express.Router();
    setupBrowserDbRoutes(router, {
      parseAuthUser: async (req: any) => (req.headers.authorization ? { user_id: "me", role: "creator" } : null),
      getClient: () => ({ from: (t: string) => { calls.push(["from", t]); return q; } }), getDb: () => ({}), saveDb: () => {},
    });
    app.use("/api", router);
    server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(() => server?.close());
  const post = (body: any, auth = true) => fetch(`${base}/api/db/own`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer t" } : {}) }, body: JSON.stringify(body) });

  it("forces the caller's own row and drops staff-only columns", async () => {
    calls.length = 0;
    const r = await post({ table: "creator_profiles", op: "upsert", values: { user_id: "victim", bio: "hi", verified: true, is_featured: true, profile_status: "approved", rating: 5 } });
    expect(r.status).toBe(200);
    expect(calls.find((c) => c[0] === "upsert")[1]).toEqual({ user_id: "me", bio: "hi" });
    calls.length = 0;
    await post({ table: "creator_portfolio_items", op: "delete", match: { creator_id: "victim", id: "p1" } });
    expect(calls.filter((c) => c[0] === "eq")).toEqual([["eq", "creator_id", "me"], ["eq", "id", "p1"]]);
  });

  it("refuses logged-out callers, other tables and other operations", async () => {
    expect((await post({ table: "creator_profiles", op: "update", values: {} }, false)).status).toBe(401);
    expect((await post({ table: "users", op: "update", values: { role: "admin" } })).status).toBe(400);
    expect((await post({ table: "creator_profiles", op: "delete" })).status).toBe(400);
  });
});

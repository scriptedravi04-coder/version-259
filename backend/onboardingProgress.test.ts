import { describe, it, expect } from "vitest";
import express from "express";
import { setupOnboardingProgressRoutes, normalisePhone, cleanAnswers } from "./onboardingProgress";

// Tiny fake of the Supabase calls this module makes.
function fakeClient({ missingTable = false } = {}) {
  const tables: Record<string, any[]> = { onboarding_progress: [], users: [{ user_id: "u_brand", phone: "" }, { user_id: "u_cr", phone: "+919876543210" }] };
  const missing = { message: "relation \"public.onboarding_progress\" does not exist", code: "42P01" };
  return {
    tables,
    from(name: string) {
      const rows = tables[name];
      const filters: Array<(r: any) => boolean> = [];
      const q: any = {
        select() { return q; },
        eq(col: string, val: any) { filters.push((r) => String(r[col]) === String(val)); return q; },
        or() { filters.push((r) => !r.phone); return q; },
        async maybeSingle() {
          if (missingTable && name === "onboarding_progress") return { data: null, error: missing };
          return { data: rows.find((r) => filters.every((f) => f(r))) || null, error: null };
        },
        async upsert(row: any) {
          if (missingTable && name === "onboarding_progress") return { error: missing };
          const i = rows.findIndex((r) => r.user_id === row.user_id);
          if (i >= 0) rows[i] = row; else rows.push(row);
          return { error: null };
        },
        update(patch: any) {
          const u: any = {
            eq(col: string, val: any) { filters.push((r) => String(r[col]) === String(val)); return u; },
            or() { filters.push((r) => !r.phone); return u; },
            then(ok: any) { rows.filter((r) => filters.every((f) => f(r))).forEach((r) => Object.assign(r, patch)); return Promise.resolve({ error: null }).then(ok); },
          };
          return u;
        },
      };
      return q;
    },
  };
}

function ctx(user: any, client: any) {
  const router = express.Router();
  const db: any = { users: [] };
  setupOnboardingProgressRoutes(router, { parseAuthUser: async () => user, getClient: () => client, getDb: () => db, saveDb: () => {} });
  const layer = (method: string): any => router.stack.find((l: any) => l.route?.path === "/onboarding/progress" && l.route.methods[method]).route.stack[0].handle;
  const call = async (method: string, body: any = {}) => {
    let status = 200; let json: any = null;
    const res: any = { status(s: number) { status = s; return res; }, json(j: any) { json = j; return res; } };
    await layer(method)({ body, headers: {} }, res, () => {});
    return { status, json };
  };
  return { call, db };
}

describe("onboarding progress (session 34)", () => {
  it("saves answers + step on the server and gives them back", async () => {
    const client = fakeClient();
    const { call } = ctx({ user_id: "u_cr", role: "creator", phone: "+919876543210" }, client);
    const r = await call("post", { flow: "creator_mobile", page: "about", pos: { step: 2 }, answers: { fullName: "Asha", dobDay: "04" }, basics_done: true });
    expect(r.status).toBe(200);
    expect(r.json.stored).toBe("server");
    const g = await call("get");
    expect(g.json.progress).toMatchObject({ user_id: "u_cr", role: "creator", page: "about", flow: "creator_mobile", basics_done: true });
    expect(g.json.progress.answers.dobDay).toBe("04");
  });

  it("rejects a flow of the other role and unknown pages", async () => {
    const { call } = ctx({ user_id: "u_cr", role: "creator" }, fakeClient());
    expect((await call("post", { flow: "brand_mobile", page: "identity" })).status).toBe(400);
    expect((await call("post", { flow: "creator_mobile", page: "DROP TABLE" })).status).toBe(400);
  });

  it("needs a login and a role", async () => {
    expect((await ctx(null, fakeClient()).call("get")).status).toBe(401);
    expect((await ctx({ user_id: "x" }, fakeClient()).call("post", { flow: "creator_mobile", page: "identity" })).status).toBe(400);
  });

  it("basics_done never goes back to false", async () => {
    const client = fakeClient();
    const { call } = ctx({ user_id: "u_cr", role: "creator" }, client);
    await call("post", { flow: "creator_desktop", page: "identity", basics_done: true });
    const r = await call("post", { flow: "creator_desktop", page: "identity", basics_done: false });
    expect(r.json.basics_done).toBe(true);
  });

  it("saves a missing phone (Google sign-up) but never overwrites one", async () => {
    const client = fakeClient();
    await ctx({ user_id: "u_brand", role: "brand", phone: "" }, client).call("post", { flow: "brand_mobile", page: "manager", phone: "98765 43210", basics_done: true });
    expect(client.tables.users.find((u) => u.user_id === "u_brand").phone).toBe("+919876543210");
    await ctx({ user_id: "u_cr", role: "creator", phone: "+919876543210" }, client).call("post", { flow: "creator_mobile", page: "identity", phone: "9123456789" });
    expect(client.tables.users.find((u) => u.user_id === "u_cr").phone).toBe("+919876543210");
    const bad = await ctx({ user_id: "u_brand", role: "brand", phone: "" }, client).call("post", { flow: "brand_mobile", page: "manager", phone: "12345" });
    expect(bad.status).toBe(400);
  });

  it("without the table: keeps it in the server's local store", async () => {
    const { call, db } = ctx({ user_id: "u_cr", role: "creator" }, fakeClient({ missingTable: true }));
    const r = await call("post", { flow: "creator_mobile", page: "rates", pos: { step: 8 } });
    expect(r.json.stored).toBe("server_local");
    expect(db.onboarding_progress[0].page).toBe("rates");
    expect((await call("get")).json.progress.page).toBe("rates");
  });

  it("phone + answer cleaning", () => {
    expect(normalisePhone("9876543210")).toBe("+919876543210");
    expect(normalisePhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalisePhone("5876543210")).toBe(null);
    expect(normalisePhone("+44 7700 900123")).toBe("+447700900123");
    expect(cleanAnswers({ a: 1, photo: "data:image/png;base64,xxx" })).toEqual({ a: 1 });
  });
});

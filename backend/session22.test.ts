// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { configureEphemeralStore, ephemeralSet, ephemeralGet, ephemeralTake, _resetEphemeral, hashCode } from "./ephemeralStore";
import { issueSignToken, consumeSignToken } from "./signTokens";
import { createSocketAccess } from "./socketAccess";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** A tiny stand-in for the Supabase table, shared like the real one would be. */
function fakeSupabase(rows = new Map<string, any>(), missing = false) {
  const err = missing ? { message: "Could not find the table 'public.ybex_ephemeral'", code: "PGRST205" } : null;
  return {
    rows,
    from: () => ({
      upsert: async (r: any) => { if (!err) rows.set(r.key, r); return { error: err }; },
      select: () => ({ eq: (_c: string, k: string) => ({ maybeSingle: async () => ({ data: err ? null : rows.get(k) || null, error: err }) }) }),
      delete: () => ({
        eq: (_c: string, k: string) => {
          const run = () => { const r = rows.get(k); rows.delete(k); return r; };
          const p: any = Promise.resolve().then(() => { if (!err) run(); return { error: err }; });
          p.select = async () => { if (err) return { data: null, error: err }; const r = run(); return { data: r ? [r] : [], error: null }; };
          return p;
        },
      }),
    }),
  };
}

describe("shared ephemeral store", () => {
  beforeEach(() => _resetEphemeral());

  it("a sign token issued on one instance works once on another", async () => {
    const shared = new Map();
    configureEphemeralStore(fakeSupabase(shared));
    const t = await issueSignToken("u1");
    _resetEphemeral(); // "instance B": empty memory, same table
    configureEphemeralStore(fakeSupabase(shared));
    expect(await consumeSignToken("u2", t)).toBe(false); // wrong user — and spent
    const t2 = await issueSignToken("u1");
    _resetEphemeral();
    configureEphemeralStore(fakeSupabase(shared));
    expect(await consumeSignToken("u1", t2)).toBe(true);
    expect(await consumeSignToken("u1", t2)).toBe(false);
    expect([...shared.keys()].some((k) => k.includes(t2))).toBe(false); // stored hashed
  });

  it("expired values are gone", async () => {
    configureEphemeralStore(fakeSupabase());
    await ephemeralSet("x", { a: 1 }, -1);
    expect(await ephemeralGet("x")).toBeNull();
    expect(await ephemeralTake("x")).toBeNull();
  });

  it("falls back to memory when the table is missing (old behaviour, not an error)", async () => {
    configureEphemeralStore(fakeSupabase(new Map(), true));
    const t = await issueSignToken("u1");
    expect(await consumeSignToken("u1", t)).toBe(true);
  });

  it("OTP codes are stored hashed and looked up from the shared store", () => {
    const s = read("backend/session_routes.ts");
    expect(s).toContain("codeHash: hashCode(key, code)");
    expect(s).toContain("record.codeHash !== hashCode(key, String(code))");
    expect(s).not.toMatch(/new Map<string, \{ code: string/);
    expect(hashCode("a@b.c", "123456")).not.toContain("123456");
    expect(read("backend/server.ts")).toContain("configureEphemeralStore(tempPrivileged)");
    expect(read("scripts/sql/ybex_ephemeral.sql")).toContain("enable row level security");
  });
});

describe("online status is private", () => {
  const db = {
    chat_threads: [{ id: "thread_ugc_o1", brand_id: "brand1", creator_id: "creator1" }],
    ugc_orders: [{ id: "o2", brand_id: "brand2", creator_id: "creator1" }],
    deals: [],
  };
  const access = createSocketAccess({ parseAuthUser: async () => null, getDb: () => db, getClient: () => null });

  it("a user's contacts are the other side of their deals", async () => {
    expect((await access.contactsOf({ user_id: "creator1" })).sort()).toEqual(["brand1", "brand2"]);
    expect(await access.contactsOf({ user_id: "brand1" })).toEqual(["creator1"]);
    expect(await access.contactsOf({ user_id: "nobody" })).toEqual([]);
  });

  it("the online list shows only contacts (staff see all)", async () => {
    const online = ["brand1", "brand2", "creator1", "stranger"];
    expect(await access.visibleOnline({ user_id: "brand1" }, online)).toEqual(["brand1", "creator1"]);
    expect(await access.visibleOnline({ user_id: "stranger" }, online)).toEqual(["stranger"]);
    expect(await access.visibleOnline({ user_id: "a", role: "admin" }, online)).toEqual(online);
    expect(await access.visibleOnline(null, online)).toEqual([]);
  });

  it("status changes go to contacts + admins, never io.emit", async () => {
    const sent: any[] = [];
    const io: any = { to(room: string) { const rooms = [room]; const t: any = { to: (r: string) => (rooms.push(r), t), emit: (e: string, p: any) => sent.push({ rooms, e, p }) }; return t; } };
    await access.emitStatus(io, { user_id: "brand1" }, "online");
    expect(sent[0].rooms.sort()).toEqual(["admins", "user_creator1"]);
    expect(sent[0].p).toEqual({ userId: "brand1", status: "online" });
    expect(read("backend/server.ts")).not.toContain('io.emit("user_status_change"');
  });
});

describe("session 22 · splits and leftovers", () => {
  it("OTP send limit is shared across instances", () => {
    const s = read("backend/session_routes.ts");
    expect(s).toContain("ephemeralGet(`otpsend:");
    expect(s).toContain("await otpSendLog.set(key, sends);");
    expect(s).not.toContain("new Map<string, number[]>()");
  });
  it("no empty catch blocks left in backend or frontend code", () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(process.cwd(), d), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    const files = [...walk("backend"), ...walk("src")].filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\./.test(f) && !/logIgnored\.ts$|ignored\.js$/.test(f));
    const hits = files.filter((f) => /catch\s*(\(\s*\w+\s*(:\s*any)?\s*\))?\s*\{\s*\}/.test(read(f)));
    expect(hits).toEqual([]);
  });
  it("split files are wired back in", () => {
    expect(read("backend/server.ts")).toContain("createStorageHelpers(() => ({ supabase, privilegedSupabase }))");
    expect(read("backend/campaigns_routes.ts")).toContain('export { createCampaignLifecycleHandlers } from "./campaign_lifecycle";');
  });
});

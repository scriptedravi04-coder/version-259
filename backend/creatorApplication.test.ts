import { describe, it, expect } from "vitest";
import { parseCount, formatIndian, normaliseApplicantMobile, validateApplication, makeCreatorApplicationHandler, approveCreatorApplication, applicantMetrics, WAITLIST_COLUMNS, USERS_COLUMNS, CREATOR_PROFILE_COLUMNS } from "./creatorApplication";

const good = {
  name: "Asha Verma", gender: "Female", email: "Asha@Example.in", country_code: "+91", mobile: "98765 43210",
  social_handle: "@Asha.Creates", city: "Jaipur", followers: "1.5L", avg_reach: "12,000", charges: "2,500",
  niche: "Beauty", collab_types: ["Paid", "Barter"], profile_photo_url: "https://cdn.example.com/a.jpg",
};

// Session 35: like Supabase, a write with a key that is not a real column fails as a whole
// ("Could not find the 'bio' column …"). The old fake accepted anything, so the live apply form
// could break while every test stayed green.
const COLUMNS: Record<string, string[]> = { waitlist: WAITLIST_COLUMNS, users: USERS_COLUMNS, creator_profiles: CREATOR_PROFILE_COLUMNS };
const unknownColumn = (name: string, rows: any[]) => {
  for (const r of rows) for (const k of Object.keys(r)) if (!COLUMNS[name].includes(k)) return { message: `Could not find the '${k}' column of '${name}' in the schema cache` };
  return null;
};

function fakeClient(opts: { failInsert?: boolean; users?: any[] } = {}) {
  const t: Record<string, any[]> = { waitlist: [], users: opts.users || [], creator_profiles: [] };
  const from = (name: string) => {
    const filters: Array<(r: any) => boolean> = [];
    const q: any = {
      select() { return q; },
      ilike(c: string, v: string) { filters.push((r) => String(r[c] || "").toLowerCase() === String(v).toLowerCase()); return q; },
      eq(c: string, v: any) { filters.push((r) => String(r[c]) === String(v)); return q; },
      limit() { return Promise.resolve({ data: t[name].filter((r) => filters.every((f) => f(r))), error: null }); },
      maybeSingle() { return Promise.resolve({ data: t[name].find((r) => filters.every((f) => f(r))) || null, error: null }); },
      insert(rows: any[]) { if (opts.failInsert) return Promise.resolve({ error: { message: "permission denied" } }); const bad = unknownColumn(name, rows); if (bad) return Promise.resolve({ error: bad }); t[name].push(...rows); return Promise.resolve({ error: null }); },
      upsert(rows: any[]) { const bad = unknownColumn(name, rows); if (bad) return Promise.resolve({ error: bad }); for (const r of rows) { const i = t[name].findIndex((x) => x.user_id === r.user_id); if (i >= 0) t[name][i] = { ...t[name][i], ...r }; else t[name].push(r); } return Promise.resolve({ error: null }); },
      update(patch: any) { const bad = unknownColumn(name, [patch]); if (bad) return { eq: () => Promise.resolve({ error: bad }) }; const u: any = { eq(c: string, v: any) { t[name].filter((r) => String(r[c]) === String(v)).forEach((r) => Object.assign(r, patch)); return Promise.resolve({ error: null }); } }; return u; },
    };
    return q;
  };
  return { t, from };
}
const call = async (handler: any, body: any) => {
  let status = 200; let json: any;
  const res: any = { status(s: number) { status = s; return res; }, json(j: any) { json = j; return res; } };
  await handler({ body }, res);
  return { status, json };
};

describe("numbers (session 34)", () => {
  it("1.5L is 1,50,000 — not 15", () => {
    expect(parseCount("1.5L")).toBe(150000);
    expect(parseCount("1.5 lakh")).toBe(150000);
    expect(parseCount("1,50,000")).toBe(150000);
    expect(parseCount("150K")).toBe(150000);
    expect(parseCount("1.2M")).toBe(1200000);
    expect(parseCount("2cr")).toBe(20000000);
    expect(parseCount("₹2,500")).toBe(2500);
    expect(parseCount("abc")).toBe(null);
    expect(formatIndian(150000)).toBe("1,50,000");
  });
  it("mobile: India 10 digits from 6–9, other codes 6–12 digits", () => {
    expect(normaliseApplicantMobile("+91", "98765 43210")).toBe("+919876543210");
    expect(normaliseApplicantMobile("+91", "5876543210")).toBe(null);
    expect(normaliseApplicantMobile("+44", "7700 900123")).toBe("+447700900123");
  });
});

describe("validation", () => {
  it("all basic details are mandatory", () => {
    const { errors } = validateApplication({});
    for (const k of ["photo", "name", "gender", "email", "mobile", "social_handle", "city", "followers", "avg_reach", "charges", "niche"]) expect(errors[k]).toBeTruthy();
  });
  it("cleans a good form; optional parts stay optional", () => {
    const { value } = validateApplication(good);
    expect(value).toMatchObject({ email: "asha@example.in", handle: "asha.creates", followers: 150000, avg_reach: 12000, price: 2500, mobile: "+919876543210", ugc_rating: null, sample_links: [] });
  });
});

describe("submit — waitlist only, real save", () => {
  it("creates only a Pending waitlist row — no creator profile, no Explore", async () => {
    const c = fakeClient();
    const db: any = {};
    const r = await call(makeCreatorApplicationHandler({ getClient: () => c, getDb: () => db, saveDb: () => {} }), good);
    expect(r.status).toBe(200);
    expect(c.t.waitlist).toHaveLength(1);
    // Only real waitlist columns are saved; the price lives in "charges" (there is no pricing column).
    expect(c.t.waitlist[0]).toMatchObject({ status: "Pending", followers: 150000, charges: "₹2,500", social_handle: "asha.creates", mobile: "+919876543210" });
    expect(c.t.waitlist[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.t.creator_profiles).toHaveLength(0);
    expect(c.t.waitlist[0].pricing).toBeUndefined();
  });
  it("database failure → error, never a fake success", async () => {
    const r = await call(makeCreatorApplicationHandler({ getClient: () => fakeClient({ failInsert: true }), getDb: () => ({}), saveDb: () => {} }), good);
    expect(r.status).toBe(500);
    expect(r.json.code).toBe("SAVE_FAILED");
  });
  it("email of a registered user: their account and profile are never touched", async () => {
    const c = fakeClient({ users: [{ user_id: "real1", email: "asha@example.in", auth_method: "password", name: "Real Asha" }] });
    await call(makeCreatorApplicationHandler({ getClient: () => c, getDb: () => ({}), saveDb: () => {} }), good);
    expect(c.t.users[0]).toEqual({ user_id: "real1", email: "asha@example.in", auth_method: "password", name: "Real Asha" });
    expect(c.t.waitlist[0].is_registered_user).toBe(true);
  });
  it("same email may apply again (no spam limit — the team checks by hand)", async () => {
    const c = fakeClient();
    const h = makeCreatorApplicationHandler({ getClient: () => c, getDb: () => ({}), saveDb: () => {} });
    for (let i = 0; i < 3; i++) expect((await call(h, good)).status).toBe(200);
    expect(c.t.waitlist).toHaveLength(3);
  });
});

describe("approve (admin)", () => {
  const entry = { id: "W1", ...good, email: "asha@example.in", social_handle: "asha.creates", followers: 150000, avg_reach: "12000", charges: "₹2,500", pricing: { ugc: 2500 } };
  it("one unclaimed profile; approving the same email again updates it (no duplicate)", async () => {
    const c = fakeClient();
    c.t.waitlist.push({ ...entry }, { ...entry, id: "W2" });
    const deps = { client: c, getDb: () => ({}), saveDb: () => {} };
    const a = await approveCreatorApplication(c.t.waitlist[0], deps);
    const b = await approveCreatorApplication(c.t.waitlist[1], deps);
    expect(a.ok && b.ok).toBe(true);
    expect(c.t.creator_profiles).toHaveLength(1);
    expect(c.t.creator_profiles[0]).toMatchObject({ follower_count: 150000, rate_card: { ugc: 2500 }, rate_story: 0, is_claimed: false });
    expect(c.t.waitlist.every((w) => w.status === "Approved")).toBe(true);
  });
  it("a real account with that email is never turned into an unclaimed one", async () => {
    const c = fakeClient({ users: [{ user_id: "real1", email: "asha@example.in", auth_method: "password" }] });
    c.t.waitlist.push({ ...entry });
    const r = await approveCreatorApplication(c.t.waitlist[0], { client: c, getDb: () => ({}), saveDb: () => {} });
    expect(r.ok).toBe(true);
    expect(c.t.users).toEqual([{ user_id: "real1", email: "asha@example.in", auth_method: "password" }]);
    expect(c.t.creator_profiles).toHaveLength(0);
  });
  it("score and engagement come from each creator's own followers and reach", () => {
    const a = applicantMetrics(150000, 12000);
    const b = applicantMetrics(20000, 6000);
    expect(a.engagement_rate).toBe(8);
    expect(b.engagement_rate).toBe(30);
    expect(a.performance_score).not.toBe(b.performance_score);
  });
});

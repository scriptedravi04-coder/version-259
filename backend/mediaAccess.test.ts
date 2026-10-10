// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import http from "http";
import express from "express";
import {
  parseStorageRef, ownersFromPath, canViewMedia, issueMediaKey, verifyMediaKey,
  isPrivateBucket, MEDIA_URL_TTL_SECONDS, MEDIA_KEY_TTL_MS,
} from "./mediaAccess";
import { setupMediaRoutes } from "./media_routes";
import { createSocketAccess, registerSocketAccess } from "./socketAccess";
import { privateStorageRef, mediaProxyUrl } from "../src/lib/mediaUrl";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const SB = "https://abc.supabase.co/storage/v1/object";

describe("parseStorageRef", () => {
  const cases: [string, any][] = [
    ["ugc-videos/thread_ugc_ord1-1712345678901.mp4", { bucket: "content-submissions", path: "ugc-videos/thread_ugc_ord1-1712345678901.mp4" }],
    ["content-submissions/campaign-deliverables/t1-1712345678901.mov", { bucket: "content-submissions", path: "campaign-deliverables/t1-1712345678901.mov" }],
    [`${SB}/public/content-submissions/ugc-videos/ord1/a.mp4`, { bucket: "content-submissions", path: "ugc-videos/ord1/a.mp4" }],
    [`${SB}/sign/content-submissions/chat-attachments/t1-1712345678901.png?token=xyz`, { bucket: "content-submissions", path: "chat-attachments/t1-1712345678901.png" }],
    ["https://ugc-videos/ord1/a.mp4", { bucket: "content-submissions", path: "ugc-videos/ord1/a.mp4" }],
    [`/api/media?k=abc&src=${encodeURIComponent("content-submissions/u1/file_x.mp4")}`, { bucket: "content-submissions", path: "u1/file_x.mp4" }],
    ["https://www.instagram.com/reel/abc/", null],
    [`${SB}/public/avatars/u1/me.png`, null],
    ["ugc-videos/../kyc-documents/x.png", null],
    ["blob:https://x/1", null],
    ["", null],
  ];
  it.each(cases)("%s", (src, want) => expect(parseStorageRef(src)).toEqual(want));

  it("the browser resolver reads the same references the server accepts", () => {
    for (const [src, want] of cases) {
      if (src.includes("..")) continue; // server-side rejection only
      const r = privateStorageRef(src);
      expect(r ? r : null).toEqual(want ? `${want.bucket}/${want.path}` : null);
    }
  });

  it("the proxy link ends with the file extension and round-trips on the server", () => {
    const url = mediaProxyUrl("ugc-videos/ord1/a.mp4")!;
    expect(url.startsWith("/api/media?")).toBe(true);
    expect(url).toMatch(/\.mp4$/);
    expect(parseStorageRef(url)).toEqual({ bucket: "content-submissions", path: "ugc-videos/ord1/a.mp4" });
  });
});

describe("ownersFromPath", () => {
  it("reads the thread/order id or the uploader", () => {
    expect(ownersFromPath("ugc-videos/ord1/clip.mp4").threadIds).toContain("ord1");
    expect(ownersFromPath("campaign-deliverables/thread_camp_d9-1712345678901.mp4").threadIds).toEqual(["thread_camp_d9"]);
    expect(ownersFromPath("u42/file_abc.mp4")).toEqual({ threadIds: [], uploaderId: "u42" });
  });
});

describe("canViewMedia", () => {
  const deps = (parties: Record<string, string[]>, shared: string[] = []) => ({
    isStaff: (u: any) => u.role === "admin",
    actingIds: (u: any) => [u.user_id, u.parent_brand_id].filter(Boolean),
    isThreadParty: async (u: any, t: string) => (parties[t] || []).includes(u.user_id) || (parties[t] || []).includes(u.parent_brand_id),
    sharesDealWith: async (u: any, other: string) => shared.includes(`${u.user_id}:${other}`),
  });
  const ref = { bucket: "content-submissions", path: "ugc-videos/thread_ugc_o1-1712345678901.mp4" };

  it("parties and staff yes, strangers and logged-out no", async () => {
    const d = deps({ thread_ugc_o1: ["brand1", "creator1"] });
    expect(await canViewMedia({ user_id: "brand1" }, ref, d)).toBe(true);
    expect(await canViewMedia({ user_id: "member", parent_brand_id: "brand1" }, ref, d)).toBe(true);
    expect(await canViewMedia({ user_id: "boss", role: "admin" }, ref, d)).toBe(true);
    expect(await canViewMedia({ user_id: "otherBrand" }, ref, d)).toBe(false);
    expect(await canViewMedia(null, ref, d)).toBe(false);
  });

  it("an /upload file: the uploader, or someone with a deal with them", async () => {
    const r = { bucket: "content-submissions", path: "creator1/file_a.mp4" };
    const d = deps({}, ["brand1:creator1"]);
    expect(await canViewMedia({ user_id: "creator1" }, r, d)).toBe(true);
    expect(await canViewMedia({ user_id: "brand1" }, r, d)).toBe(true);
    expect(await canViewMedia({ user_id: "brand2" }, r, d)).toBe(false);
  });

  it("KYC: owner and staff only, never a deal partner", async () => {
    const r = { bucket: "kyc-documents", path: "creator1/pan.png" };
    const d = deps({}, ["brand1:creator1"]);
    expect(await canViewMedia({ user_id: "creator1" }, r, d)).toBe(true);
    expect(await canViewMedia({ user_id: "brand1" }, r, d)).toBe(false);
  });
});

describe("media key", () => {
  it("opens for its user until it expires; a changed key fails", () => {
    const now = Date.now();
    const k = issueMediaKey("u1", now);
    expect(verifyMediaKey(k, now + 1000)).toBe("u1");
    expect(verifyMediaKey(k, now + MEDIA_KEY_TTL_MS + 1)).toBeNull();
    const [a, , c] = k.split(".");
    expect(verifyMediaKey(`${a}.${now + 10 ** 9}.${c}`, now)).toBeNull();
    expect(verifyMediaKey(`${Buffer.from("admin").toString("base64url")}.${now + 1000}.${c}`, now)).toBeNull();
    expect(verifyMediaKey("dev_bypass", now)).toBeNull();
  });
});

describe("buckets stay private", () => {
  it("deliverable and KYC buckets are private, image buckets public", () => {
    for (const b of ["content-submissions", "live-proofs", "ugc-assets", "kyc-documents"]) expect(isPrivateBucket(b)).toBe(true);
    for (const b of ["avatars", "brand-logos", "cover-images", "banner-images", "profile-assets"]) expect(isPrivateBucket(b)).toBe(false);
  });

  it("server.ts no longer computes bucket visibility itself (it used to force content-submissions public)", () => {
    const s = read("backend/server.ts") + read("backend/storageHelpers.ts"); // helpers moved out in session 22
    expect(s.match(/const isPublic = !isPrivateBucket\(bucketName\)/g)?.length).toBe(3);
    expect(s).not.toMatch(/const isPublic = !\[["']kyc-documents/);
  });

  it("uploads hand out proxy links, not storage URLs, for deliverables", () => {
    const m = read("backend/misc_routes.ts");
    expect(m).toContain("PRIVATE_MEDIA_BUCKETS.includes(targetBucket)");
    expect(m).toContain("publicUrl: `/api/media?src=");
  });

  it("/auth/me carries the media key and the frontend keeps it", () => {
    expect(read("backend/auth_routes.ts")).toContain("media_key: issueMediaKey(user.user_id)");
    expect(read("src/contexts/AuthContext.jsx")).toContain("rememberMediaKey(data)");
    expect(read("src/components/shared/VideoEmbedPreview.jsx")).toContain("mediaProxyUrl(clean)");
  });
});

describe("GET /api/media", () => {
  let server: http.Server;
  let base = "";
  const signed: string[] = [];
  const db = {
    users: [{ user_id: "brand1", role: "brand" }, { user_id: "stranger", role: "brand" }, { user_id: "gone", is_deleted: true }],
    chat_threads: [{ id: "thread_ugc_o1", deal_id: "o1", brand_id: "brand1", creator_id: "creator1" }],
    ugc_orders: [], deals: [],
  };
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (p: string, ttl: number) => {
          signed.push(`${bucket}/${p}:${ttl}`);
          return { data: { signedUrl: `https://abc.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=t` }, error: null };
        },
      }),
    },
  };

  beforeAll(async () => {
    registerSocketAccess(createSocketAccess({ parseAuthUser: async () => null, getDb: () => db, getClient: () => null }));
    const app = express();
    const router = express.Router();
    setupMediaRoutes(router, {
      parseAuthUser: async (req: any) => (req.headers.authorization === "Bearer brand1-token" ? { user_id: "brand1", role: "brand" } : null),
      getDb: () => db,
      getClient: () => client,
    });
    app.use("/api", router);
    server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(() => server?.close());

  const src = encodeURIComponent("ugc-videos/thread_ugc_o1-1712345678901.mp4");
  const get = (q: string, headers: any = {}) => fetch(`${base}/api/media?${q}`, { headers, redirect: "manual" });

  it("401 without a login", async () => {
    expect((await get(`src=${src}`)).status).toBe(401);
  });

  it("a party gets a short-lived signed redirect (Bearer or media key)", async () => {
    const r1 = await get(`src=${src}`, { authorization: "Bearer brand1-token" });
    expect(r1.status).toBe(302);
    expect(r1.headers.get("location")).toContain("/object/sign/content-submissions/ugc-videos/");
    expect(r1.headers.get("cache-control")).toContain("no-store");
    const r2 = await get(`k=${encodeURIComponent(issueMediaKey("brand1"))}&src=${src}`);
    expect(r2.status).toBe(302);
    expect(signed.every((s) => s.endsWith(`:${MEDIA_URL_TTL_SECONDS}`))).toBe(true);
  });

  it("403 for a logged-in stranger, 401 for a deleted account's key", async () => {
    expect((await get(`k=${encodeURIComponent(issueMediaKey("stranger"))}&src=${src}`)).status).toBe(403);
    expect((await get(`k=${encodeURIComponent(issueMediaKey("gone"))}&src=${src}`)).status).toBe(401);
  });

  it("400 for anything that is not a private file", async () => {
    const r = await get(`src=${encodeURIComponent("https://evil.example/x.mp4")}`, { authorization: "Bearer brand1-token" });
    expect(r.status).toBe(400);
  });
});

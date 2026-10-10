import { describe, it, expect } from "vitest";
import express from "express";
import { setupSupportRoutes } from "./support_routes";

// Session 34: owner replies inside their own support ticket (POST /support/tickets/:id/messages).
function ctx(user: any, tickets: any[]) {
  const app = express();
  const router = express.Router();
  const db: any = { support_tickets: tickets, ticket_messages: [], users: [] };
  setupSupportRoutes(app, router, {
    supabase: null, privilegedSupabase: null, getDb: () => db, saveDb: () => {},
    parseAuthUser: async () => user, sendNotification: async () => {}, logAdminAction: async () => {},
  });
  const handle: any = router.stack.find((l: any) => l.route?.path === "/support/tickets/:id/messages" && l.route.methods.post)!.route!.stack[0].handle;
  const call = async (id: string, body: any) => {
    let status = 200; let json: any = null;
    const res: any = { status(s: number) { status = s; return res; }, json(j: any) { json = j; return res; } };
    await handle({ params: { id }, body, headers: {} }, res, () => {});
    return { status, json };
  };
  return { call, db };
}

describe("support ticket — user reply (session 34)", () => {
  it("owner reply is saved; a RESOLVED ticket opens again", async () => {
    const { call, db } = ctx({ user_id: "u1", role: "creator" }, [{ ticket_id: "t1", user_id: "u1", status: "RESOLVED" }]);
    const r = await call("t1", { message: "  Still not paid  " });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("OPEN");
    expect(db.ticket_messages[0]).toMatchObject({ ticket_id: "t1", sender_id: "u1", sender_type: "user", message: "Still not paid" });
    expect(db.support_tickets[0].status).toBe("OPEN");
  });
  it("brand team member can reply on the parent brand's ticket", async () => {
    const { call } = ctx({ user_id: "m1", role: "brand", parent_brand_id: "b1" }, [{ ticket_id: "t1", user_id: "b1", status: "OPEN" }]);
    expect((await call("t1", { message: "Hi" })).status).toBe(200);
  });
  it("someone else's ticket → 403; closed → 409; empty / too long → 400; no login → 401", async () => {
    expect((await ctx({ user_id: "u2", role: "creator" }, [{ ticket_id: "t1", user_id: "u1" }]).call("t1", { message: "x" })).status).toBe(403);
    expect((await ctx({ user_id: "u1", role: "creator" }, [{ ticket_id: "t1", user_id: "u1", status: "CLOSED" }]).call("t1", { message: "x" })).status).toBe(409);
    expect((await ctx({ user_id: "u1", role: "creator" }, [{ ticket_id: "t1", user_id: "u1" }]).call("t1", { message: "   " })).status).toBe(400);
    expect((await ctx({ user_id: "u1", role: "creator" }, [{ ticket_id: "t1", user_id: "u1" }]).call("t1", { message: "a".repeat(2001) })).status).toBe(400);
    expect((await ctx(null, []).call("t1", { message: "x" })).status).toBe(401);
    expect((await ctx({ user_id: "u1", role: "creator" }, []).call("nope", { message: "x" })).status).toBe(404);
  });
  it("one reply per 3 seconds per user", async () => {
    const { call } = ctx({ user_id: "u9", role: "creator" }, [{ ticket_id: "t1", user_id: "u9", status: "OPEN" }]);
    expect((await call("t1", { message: "one" })).status).toBe(200);
    expect((await call("t1", { message: "two" })).status).toBe(429);
  });
});

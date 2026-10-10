import { describe, it, expect, vi } from "vitest";

const made = [];
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    const handlers = new Map();
    const s = {
      connected: false,
      on: vi.fn((e, f) => { handlers.set(f, e); }),
      off: vi.fn((e, f) => { handlers.delete(f); }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      _count: () => handlers.size,
    };
    made.push(s);
    return s;
  }),
}));
import { acquireSocket, _sharedSocketState } from "./sharedSocket";

describe("one socket per tab (session 31)", () => {
  it("two parts of the page share one connection; each removes only its own listeners", () => {
    vi.useFakeTimers();
    const a = acquireSocket("u1");
    const b = acquireSocket("u1");
    expect(made.length).toBe(1);
    a.on("x", () => {}); b.on("y", () => {});
    expect(made[0]._count()).toBe(2);
    a.release();
    expect(made[0]._count()).toBe(1);
    expect(made[0].disconnect).not.toHaveBeenCalled();
    b.release();
    vi.advanceTimersByTime(2100);
    expect(made[0].disconnect).toHaveBeenCalled();
    expect(_sharedSocketState()).toEqual({ open: false, leases: 0 });
    vi.useRealTimers();
  });

  it("a different account never reuses the old connection", () => {
    const a = acquireSocket("u1");
    const b = acquireSocket("u2");
    expect(b.socket).not.toBe(a.socket);
    a.release(); b.release();
  });

  it("session 36: a screen without the user id reuses the open connection (UGC order screens)", () => {
    const before = made.length;
    const a = acquireSocket("u9");
    const b = acquireSocket();          // BrandUGCOrders / ManageUGCOrdersView
    const c = acquireSocket("u9");      // open chat thread
    expect(made.length).toBe(before + 1);
    a.release(); b.release(); c.release();
  });
});

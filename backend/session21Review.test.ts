import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Session 21 — review of the changes made on AI Studio (v171c).

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

describe("login never creates accounts", () => {
  const s = read("backend/auth_routes.ts");
  const login = s.slice(s.indexOf('router.post("/auth/login"'), s.indexOf('router.post("/auth/login"') + 6000);

  it("an unknown email gets USER_NOT_FOUND, not a new (admin) account", () => {
    expect(login).toContain('code: "USER_NOT_FOUND"');
    expect(login).not.toContain("isAutoCreated");
    expect(login).not.toMatch(/cleanInput\.includes\("admin"\)/);
    expect(login).not.toMatch(/from\('users'\)\.insert\(newUserObj\)/);
    expect(login).toContain("let isMatch = false;");
  });
});

describe("accepting a counter offer", () => {
  const s = read("backend/deals_chat_routes.ts");
  const at = s.indexOf("const isCampaignAccept = isCampaignThread(thread);");
  const block = s.slice(at, at + 3000);

  it("requires a party of the deal", () => {
    expect(block).toContain("if (!role) return forbid(res, 'brand');");
    expect(block.indexOf("if (!role) return forbid")).toBeLessThan(block.indexOf("role === senderRole"));
  });

  it("stops the side that sent the latest offer, by side not by user id", () => {
    expect(block).toContain("latestOfferSender === thread.creator_id ? 'creator' : 'brand'");
    expect(block).toContain("if (role !== 'admin' && role === senderRole)");
    expect(block).not.toContain("user.user_id === latestOfferSender");
  });

  it("still accepts only the proposed amount on campaigns", () => {
    expect(s).toContain("if (!isCampaignAccept && req.body && (req.body.counter_amount || req.body.amount))");
  });
});

describe("mobile offer cards", () => {
  it("MobileMessageRow receives allMessages instead of reading an undefined variable", () => {
    const row = read("src/components/chat/mobile/MobileMessageRow.jsx");
    const params = row.slice(row.indexOf("export default function MobileMessageRow({"), row.indexOf("}) {", row.indexOf("export default function MobileMessageRow({")));
    expect(params).toContain("allMessages = []");
    expect(read("src/components/chat/mobile/ChatBoxMobile.jsx")).toContain("allMessages={uniqueMessages}");
  });
});

describe("admin user delete", () => {
  it("asks before deleting", () => {
    // Session 27 (Ravi's two-mode delete, rule 56): the trash button opens DeleteAccountPanel
    // instead of a window.confirm. One click still never deletes: a normal delete needs "DELETE"
    // typed, a complete wipe needs the admin password — and the panel says it cannot be undone.
    const s = read("src/components/admin/AdminUsersTab.jsx");
    const fn = s.slice(s.indexOf("const handleRemoveCreator"), s.indexOf("const handleRemoveCreator") + 500);
    expect(fn).not.toMatch(/api\.post/);
    expect(fn).toContain("setDeletingUser");
    const panel = read("src/components/admin/DeleteAccountPanel.jsx");
    expect(panel).toMatch(/confirmText\.trim\(\) === "DELETE"/);
    expect(panel).toMatch(/Boolean\(password\)/);
    expect(panel).toContain("cannot be undone");
  });
});

describe("empty db_mock.json", () => {
  it("is treated as a fresh store, not as corruption", () => {
    const s = read("backend/server.ts");
    expect(s).toContain("if (!data.trim()) {");
  });
});

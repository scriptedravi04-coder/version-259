import { describe, it, expect, beforeAll } from "vitest";
import { buildAudience, broadcastEmail, unsubscribeUrl } from "./emailBroadcasts";
import { verifyEmailLink } from "./emailLinks";

const src = () => ({
  users: [
    { user_id: "c1", email: "c1@m.in", name: "Cee", role: "creator" },
    { user_id: "c2", email: "c2@m.in", role: "creator", banned: true },
    { user_id: "c3", email: "c3@m.in", role: "creator", is_deleted: true },
    { user_id: "c4", email: "unsub@m.in", role: "creator" },
    { user_id: "b1", email: "b1@m.in", role: "brand" },
    { user_id: "a1", email: "a1@m.in", role: "brand" },
    { user_id: "u1", email: "unclaimed_x@ybex.io", role: "creator", auth_method: "unclaimed" },
  ],
  brandProfiles: [{ user_id: "b1", email: "b1@m.in", company_name: "B1" }, { user_id: "a1", email: "a1@m.in", is_agency: true }],
  creatorProfiles: [
    { user_id: "u1", email: "lead@m.in", name: "Lead", is_claimed: false },
    { user_id: "u2", email: "imported@m.in", is_claimed: false },
    { user_id: "u3", email: "rej@m.in", is_claimed: false, profile_status: "rejected" },
    { user_id: "c1", email: "c1@m.in", is_claimed: true },
  ],
  unsubscribed: new Set(["unsub@m.in"]),
  csvImported: new Set(["imported@m.in"]),
});
const emails = (a: any[]) => a.map((x) => x.email).sort();

describe("bulk email (session 36)", () => {
  beforeAll(() => { process.env.EMAIL_LINK_SECRET = "s"; });

  it("each audience gets only its own people", () => {
    expect(emails(buildAudience("creators", src()))).toEqual(["c1@m.in"]);
    expect(emails(buildAudience("brands", src()))).toEqual(["a1@m.in", "b1@m.in"]);
    expect(emails(buildAudience("agencies", src()))).toEqual(["a1@m.in"]);
    expect(emails(buildAudience("unclaimed_creators", src()))).toEqual(["lead@m.in"]);
    expect(emails(buildAudience("all", src()))).toEqual(["a1@m.in", "b1@m.in", "c1@m.in", "lead@m.in"]);
  });

  it("never: banned, deleted, unsubscribed, CSV-imported, rejected, fake", () => {
    const all = emails(buildAudience("all", src()));
    for (const e of ["c2@m.in", "c3@m.in", "unsub@m.in", "imported@m.in", "rej@m.in", "unclaimed_x@ybex.io"]) expect(all).not.toContain(e);
  });

  it("email has the CTA button (old bug) and a working unsubscribe link", () => {
    const { html, unsub } = broadcastEmail({ subject: "S", body_text: "Hello <b>", cta_label: "Open", cta_url: "/campaigns" }, { email: "c1@m.in", name: "Cee" });
    expect(html).toContain('href="https://ybexmedia.in/campaigns"');
    expect(html).toContain(">Open</a>");
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("Hello &lt;b&gt;");
    const t = new URL(unsub!).searchParams.get("t")!;
    expect(verifyEmailLink("unsub", "c1@m.in", t)).toBe(true);
    expect(verifyEmailLink("unsub", "x@m.in", t)).toBe(false);
    expect(unsubscribeUrl("C1@M.in")).toBe(unsub);
  });
});

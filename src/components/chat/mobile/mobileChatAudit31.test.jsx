import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
afterEach(() => cleanup());
vi.mock("../../payments/InvoiceModal", () => ({ default: () => null }));
import MobileMessageRow, { supersededReviewCards } from "./MobileMessageRow";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const hook = read("src/components/chat/mobile/useChatThreadMobile.js");

// Session 31 — mobile chat audit (Ravi: "5 ki 5 theek kr do", mobile only, desktop untouched).
describe("live-link correction request on mobile", () => {
  const request = {
    id: "m2",
    message_type: "live_links_resubmit_request",
    content: "❌ Resubmission requested by Brand: The link is private",
    metadata: { action: "live_links_resubmit_requested", status: "REVISION_REQUESTED_LINKS", feedback: "The link is private" },
  };

  it("brand sees a waiting card — never 'Approve & pay' on its own correction request", () => {
    render(<MobileMessageRow message={request} isBrand thread={{}} isLinkFixActive />);
    expect(screen.getByText("Brand asked for corrected links")).toBeTruthy();
    expect(screen.getByText("The link is private")).toBeTruthy();
    expect(screen.queryByText(/Approve & pay/i)).toBeNull();
    expect(screen.queryByText(/Submitted live campaign links/i)).toBeNull();
  });

  it("creator can decline (with a reason) or send the corrected link", async () => {
    const onDecline = vi.fn().mockResolvedValue(true);
    const onOpenLiveLink = vi.fn();
    render(<MobileMessageRow message={request} isBrand={false} thread={{}} isLinkFixActive
      onDeclineLinkResubmission={onDecline} onOpenLiveLink={onOpenLiveLink} />);
    fireEvent.click(screen.getByText("Send corrected link"));
    expect(onOpenLiveLink).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Decline request"));
    fireEvent.change(screen.getByPlaceholderText(/link I submitted/i), { target: { value: "Link is public now" } });
    fireEvent.click(screen.getAllByText("Decline request").pop());
    await Promise.resolve();
    expect(onDecline).toHaveBeenCalledWith("Link is public now");
  });

  it("an answered request shows no buttons", () => {
    render(<MobileMessageRow message={request} isBrand={false} thread={{}} isLinkFixActive={false} />);
    expect(screen.queryByText("Decline request")).toBeNull();
    expect(screen.getByText("Resolved")).toBeTruthy();
  });

  it("the earlier submitted-links card is superseded by the request (no Approve on it)", () => {
    const msgs = [{ message_type: "live_links_submitted", metadata: { links: [{ url: "https://x" }] } }, request];
    expect(supersededReviewCards(msgs).has(0)).toBe(true);
  });

  it("decline uses the desktop endpoints", () => {
    expect(hook).toContain("`/campaign/threads/${targetId}/decline-live-links-resubmission`");
    expect(hook).toContain("`/ugc/threads/${targetId}/decline-revisions`");
  });
});

describe("escrow, approve text, inbox events", () => {
  it("no invented ₹15,000: the pay amount is the deal amount, or payment stops", () => {
    expect(hook).not.toContain("|| 15000");
    expect(hook).toContain("const grossAmt = Number(getDealAmount(currentThread)) || 0;");
    expect(hook).toContain("if (!(grossAmt > 0))");
  });
  it("after Razorpay success the campaign /pay follow-up is sent, like desktop", () => {
    expect(hook).toContain("await api.post(`/campaign/threads/${currentThread.id}/pay`)");
  });
  it("a UGC collaboration draft approval does not claim the payout was released", () => {
    expect(hook).toContain("const releasesPayout = isUgcOrder && !isCollabOrder;");
    expect(hook).toContain("Draft approved — the creator can now post it and send the live link.");
  });
  it("the mobile inbox listens to events the server really sends", () => {
    const inbox = read("src/components/inbox/mobile/InboxMobile.jsx");
    for (const ev of ['"thread_updated"', '"new_notification"', '"online_users_list"', '"user_status_change"']) expect(inbox).toContain(`socket.on(${ev}`);
    for (const dead of ['"message:new"', '"thread:update"', '"threads:refresh"', '"users:online"', '"notification:new"']) expect(inbox).not.toContain(`socket.on(${dead}`);
  });
  it("creator home has no typed-in campaigns", () => {
    const home = read("src/pages/creator/CreatorHomeMobile.jsx");
    expect(home).not.toContain("FALLBACK_MATCHES");
    expect(home).not.toContain("cosmic eye");
  });
});

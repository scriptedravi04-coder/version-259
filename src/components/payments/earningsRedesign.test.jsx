// Session 43 — Ravi's Earnings design (Earnings_dc.html) on the mobile Earnings page.
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(async () => ({ data: { coupon: null } })),
  post: vi.fn(async () => ({ data: { code: "RAVI10" } })),
}));
vi.mock("../../lib/api", () => ({ api: apiMock }));
import CreatorEarningsMobile from "./CreatorEarningsMobile";
import { appliedLine } from "./CreatorCodeCard";

const tx = [
  { id: "t1", deal_id: "d1", brand_name: "Mamaearth", campaign_title: "1 Reel", creator_net_amount: 15000, payout_status: "HELD", created_at: "2026-10-02T10:00:00Z" },
  { id: "t2", deal_id: "d2", brand_name: "boAt", campaign_title: "2 Stories", creator_net_amount: 8500, payout_status: "HELD", created_at: "2026-09-28T10:00:00Z" },
  { id: "t3", deal_id: "d3", brand_name: "Nykaa", campaign_title: "Reel + Stories", creator_net_amount: 25000, payout_status: "PAID", utr_number: "UTR1", created_at: "2026-09-12T10:00:00Z" },
];
const eligible = [{ id: "d2", deal_id: "d2", brand_name: "boAt", deal_title: "2 Stories", creator_net_amount: 8500, payout_requested: false }];

const renderPage = (props = {}) =>
  render(
    <MemoryRouter>
      <CreatorEarningsMobile totalEarned={25000} inEscrow={23500} past28DaysEarned={0} transactions={tx}
        eligibleDeals={eligible} paymentMethods={[{ account_last4: "4821" }]} kycObj={{ status: "VERIFIED" }} {...props} />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("mobile Earnings — new design", () => {
  it("hero shows paid / in hold / ready from the server figures, a deal in the payout queue counted once", () => {
    renderPage();
    expect(screen.getByTestId("earnings-total").textContent).toBe("₹25,000");
    expect(screen.getByTestId("earnings-ready").textContent).toBe("₹8,500");
    expect(screen.getByTestId("earnings-hold").textContent).toBe("₹15,000"); // 23,500 unpaid − 8,500 ready
    expect(screen.getAllByTestId("earnings-row-queue")).toHaveLength(1);
    expect(screen.getAllByTestId("earnings-row-escrow")).toHaveLength(1); // t2 not listed twice
    expect(screen.getByText("Bank •••• 4821")).toBeTruthy();
    expect(screen.getByText("KYC verified")).toBeTruthy();
  });

  it("tabs filter All / In hold / Ready and show the empty steps", () => {
    renderPage({ transactions: [tx[2]], eligibleDeals: [] });
    fireEvent.click(screen.getByRole("tab", { name: "In hold" }));
    expect(screen.getByText("Nothing in secure hold")).toBeTruthy();
    expect(screen.getByText("Find deals")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /All/ }));
    expect(screen.getAllByTestId("earnings-row-disbursed")).toHaveLength(1);
  });

  it("ready row opens the payout request; no payout account → Add card", () => {
    const onNudgeAdmin = vi.fn();
    renderPage({ onNudgeAdmin, paymentMethods: [] });
    fireEvent.click(screen.getByTestId("earnings-row-queue"));
    expect(onNudgeAdmin).toHaveBeenCalledWith("d2");
    expect(screen.getByText("Add a payout account")).toBeTruthy();
  });

  it("no made-up numbers from the design sample", () => {
    const s = fs.readFileSync(path.join(process.cwd(), "src/components/payments/CreatorEarningsMobile.jsx"), "utf8");
    expect(s).not.toMatch(/Next payout in 2 days|HDFC Bank|12000|Released automatically/);
    expect(s).not.toContain('setActiveTab("secure payment hold")');
  });

  it("creator code card uses the existing coupon calls and describes an applied code", () => {
    const c = fs.readFileSync(path.join(process.cwd(), "src/components/payments/CreatorCodeCard.jsx"), "utf8");
    expect(c).toContain('api.get("creator/coupon")');
    expect(c).toContain('api.post("creator/coupon"');
    expect(appliedLine({ type: "zero_fee", deal_number: 1, deals_total: 3 })).toBe("0% fee · deal 1 of 3");
  });
});

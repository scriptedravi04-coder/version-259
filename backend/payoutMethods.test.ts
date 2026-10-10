import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parsePayoutMethod, toPublicPayoutMethod, payoutRequestBlock, toEligibleDeal, isEligibleForPayout } from "./payoutMethods";

describe("payout methods (session 24)", () => {
  it("accepts a valid UPI and clears the bank fields", () => {
    const { row } = parsePayoutMethod({ method_type: "UPI", account_details: { upi_id: "ravi@okhdfc" } });
    expect(row).toEqual({ upi_id: "ravi@okhdfc", bank_account_number: null, bank_ifsc: null, account_holder_name: null });
  });
  it("rejects bad UPI / account / IFSC / name", () => {
    expect(parsePayoutMethod({ method_type: "UPI", account_details: { upi_id: "nope" } }).error).toBeTruthy();
    expect(parsePayoutMethod({ method_type: "BANK", account_details: { account_no: "12", ifsc: "HDFC0001234", holder_name: "Ravi" } }).error).toBeTruthy();
    expect(parsePayoutMethod({ method_type: "BANK", account_details: { account_no: "123456789012", ifsc: "BAD", holder_name: "Ravi" } }).error).toBeTruthy();
    expect(parsePayoutMethod({ method_type: "BANK", account_details: { account_no: "123456789012", ifsc: "HDFC0001234", holder_name: "" } }).error).toBeTruthy();
  });
  it("bank row clears UPI; the browser never gets the full account number", () => {
    const { row } = parsePayoutMethod({ method_type: "BANK", account_details: { account_no: "1234 5678 9012", ifsc: "hdfc0001234", holder_name: "Ravi K" } });
    expect(row).toEqual({ upi_id: null, bank_account_number: "123456789012", bank_ifsc: "HDFC0001234", account_holder_name: "Ravi K" });
    const pub = toPublicPayoutMethod({ ...row, id: "pm1" });
    expect(pub.account_last4).toBe("9012");
    expect(JSON.stringify(pub)).not.toContain("123456789012");
  });
  it("payout request: WHO (owner) and WHEN (approved, escrow, not already paid)", () => {
    const deal = { id: "d1", creator_id: "c1", status: "APPROVED" };
    expect(payoutRequestBlock("c2", deal, { payout_status: "PENDING" })?.code).toBe("NOT_YOUR_DEAL");
    expect(payoutRequestBlock("c1", null, null)?.code).toBe("DEAL_NOT_FOUND");
    expect(payoutRequestBlock("c1", deal, null)?.code).toBe("NO_ESCROW");
    expect(payoutRequestBlock("c1", deal, { payout_status: "RELEASED" })?.code).toBe("ALREADY_PAID");
    expect(payoutRequestBlock("c1", deal, { payout_status: "PENDING", utr_number: "UTR1" })?.code).toBe("ALREADY_PAID");
    expect(payoutRequestBlock("c1", { ...deal, status: "ACTIVE" }, { payout_status: "PENDING" })?.code).toBe("NOT_APPROVED");
    expect(payoutRequestBlock("c1", deal, { payout_status: "PENDING" })).toBeNull();
    expect(payoutRequestBlock("c1", deal, { payout_status: "PROCESSING" })).toBeNull(); // reminder
  });
  it("eligible deals: no invented ₹5,000 / 85%; paid and unfunded deals are left out", () => {
    const noTx = toEligibleDeal({ id: "d1", status: "APPROVED" }, null);
    expect(noTx.amount).toBe(0);
    expect(noTx.creator_net_amount).toBeNull();
    expect(isEligibleForPayout(noTx)).toBe(false);
    const paid = toEligibleDeal({ id: "d2", status: "COMPLETED", agreed_amount: 10000 }, { payout_status: "RELEASED", creator_net_amount: 9000 });
    expect(isEligibleForPayout(paid)).toBe(false);
    const ready = toEligibleDeal({ id: "d3", status: "APPROVED", agreed_amount: 10000 }, { payout_status: "PROCESSING", creator_net_amount: 8820 });
    expect(ready.creator_net_amount).toBe(8820);
    expect(ready.payout_requested).toBe(true);
    expect(isEligibleForPayout(ready)).toBe(true);
  });
  it("routes use these rules (no 5000 / 0.85 left in payment_routes)", () => {
    const s = fs.readFileSync(path.join(__dirname, "payment_routes.ts"), "utf8");
    expect(s).toContain("payoutRequestBlock(userId, deal, tx)");
    expect(s).toContain("parsePayoutMethod(req.body || {})");
    expect(s).toContain("toPublicPayoutMethod(m)");
    expect(s).not.toMatch(/\|\| 5000|\* 0\.85/);
  });
});

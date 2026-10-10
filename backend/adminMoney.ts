// Session 38 (Ravi: "PHELE YE SAB THEEK KRO"). Admin money rules in one place, kept pure so
// they are tested on their own (backend/adminMoney.test.ts).

const up = (v: any) => String(v ?? "").trim().toUpperCase();

/** Money already sent to the creator. */
export function isPaidOut(tx: any): boolean {
  if (!tx) return false;
  const ps = up(tx.payout_status);
  return ["PAID", "RELEASED", "COMPLETED"].includes(ps) || Boolean(String(tx.payout_reference || tx.utr_number || "").trim());
}

/** Money already returned to the brand (or the refund is on its way). */
export function isRefunded(tx: any): boolean {
  if (!tx) return false;
  return up(tx.status) === "REFUNDED" || up(tx.payout_status) === "REFUNDED" || up(tx.refund_status) === "PROCESSED";
}

/** Brand money the platform is holding right now: paid in, not paid out, not refunded. */
export function isEscrowHeld(tx: any): boolean {
  if (!tx) return false;
  const st = up(tx.status);
  if (st !== "SUCCESS" && st !== "ESCROW_HELD") return false;
  return !isPaidOut(tx) && !isRefunded(tx);
}

/** The creator has asked for this payout and it has not been sent yet. */
export function isPayoutRequested(tx: any): boolean {
  if (!tx || isPaidOut(tx) || isRefunded(tx)) return false;
  return tx.payout_requested === true || up(tx.payout_status) === "PROCESSING";
}

type Block = { status: number; code: string; error: string } | null;

/** Admin "Mark payout paid": refuse a second payout and a payout on refunded money. */
export function payoutReleaseBlock(tx: any): Block {
  if (!tx) return null; // the route resolves the creator/amount from the deal itself
  if (isRefunded(tx)) {
    return { status: 409, code: "ALREADY_REFUNDED", error: "This payment was refunded to the brand, so it can't be paid out to the creator." };
  }
  if (isPaidOut(tx)) {
    const ref = String(tx.payout_reference || tx.utr_number || "").trim();
    return { status: 409, code: "ALREADY_PAID", error: `This payout is already marked paid${ref ? ` (UTR ${ref})` : ""}.` };
  }
  return null;
}

/** Admin campaign refund: never more than was paid, never after the creator was paid, never twice. */
export function refundBlock(tx: any, amount: number, targetStatus: string): Block {
  if (!tx) return null;
  if (isPaidOut(tx)) {
    return { status: 409, code: "ALREADY_PAID_OUT", error: "The creator has already been paid for this deal, so it can't be refunded here." };
  }
  if (up(tx.refund_status) === "PROCESSED" || up(tx.status) === "REFUNDED") {
    return { status: 409, code: "ALREADY_REFUNDED", error: "This payment is already marked refunded." };
  }
  const paid = Number(tx.gross_amount ?? tx.amount ?? 0) || 0;
  if (paid > 0 && Number(amount) > paid + 0.005) {
    return { status: 400, code: "REFUND_TOO_HIGH", error: `Refund can't be more than the amount paid (₹${paid.toLocaleString("en-IN")}).` };
  }
  void targetStatus;
  return null;
}

/**
 * Where to send a creator's payout. The creator's own saved method (Earnings → payout details,
 * table creator_payment_methods) wins; profile / KYC fields fill in only when it is missing.
 * Exactly one destination comes from the saved method: UPI or bank, never a mix.
 */
export function pickPayoutAccount(method: any, profile: any, kyc: any) {
  if (method && (method.upi_id || method.bank_account_number)) {
    const isUpi = Boolean(method.upi_id);
    return {
      account_holder_name: method.account_holder_name || profile?.name || kyc?.full_name || null,
      bank_name: isUpi ? null : (method.bank_name || null),
      account_number: isUpi ? null : method.bank_account_number,
      ifsc_code: isUpi ? null : (method.bank_ifsc || null),
      upi_id: isUpi ? method.upi_id : null,
      verified: true,
      source: "creator_payment_methods",
    };
  }
  if (!profile && !kyc) return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (profile?.[k]) return profile[k];
      if (kyc?.[k]) return kyc[k];
    }
    return null;
  };
  const upi = pick("upi_id", "vpa");
  const acct = pick("bank_account_number", "account_number", "bank_account_no");
  return {
    account_holder_name: pick("beneficiary_name", "account_holder_name", "bank_holder_name", "full_name"),
    bank_name: pick("bank_name"),
    account_number: acct,
    ifsc_code: pick("bank_ifsc", "ifsc_code"),
    upi_id: upi,
    verified: Boolean(profile?.payout_verified || profile?.bank_verified || upi || acct),
    source: "profile",
  };
}

/**
 * Supabase returns at most 1000 rows per request. Reads every page.
 * `makeQuery(from, to)` must build a fresh query each time (a used builder can't be reused).
 */
export async function fetchAllRows(makeQuery: (from: number, to: number) => any, pageSize = 1000, maxRows = 100000): Promise<{ data: any[]; error: any }> {
  const out: any[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) return { data: out, error };
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: out, error: null };
}

import React, { useState } from "react";
import MobileSheet, { SheetHeader } from "../../chat/mobile/MobileSheet";
import { api } from "../../../lib/api";
import { toast } from "sonner";

// Session 24. Add / change where payouts go (UPI or bank) on mobile. POST
// /creator/payment-methods; the server validates the same rules (backend/payoutMethods.ts).
// Before this, mobile "Add payout method" / "Edit" went to a settings page with no payout screen.

const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;

export function validatePayoutForm(type, f) {
  if (type === "UPI") return UPI_RE.test(String(f.upi || "").trim()) ? null : "Enter a valid UPI ID, like name@bank.";
  const acc = String(f.account || "").replace(/\s+/g, "");
  if (!ACCOUNT_RE.test(acc)) return "Account number should be 9 to 18 digits.";
  if (acc !== String(f.confirm || "").replace(/\s+/g, "")) return "Account numbers don't match.";
  if (!IFSC_RE.test(String(f.ifsc || "").trim().toUpperCase())) return "Enter a valid IFSC code, like HDFC0001234.";
  if (String(f.holder || "").trim().length < 2) return "Enter the name as per bank records.";
  return null;
}

const input = {
  width: "100%",
  height: 44,
  border: "1px solid #E4E4EC",
  borderRadius: 12,
  padding: "0 12px",
  font: "500 14px 'DM Sans',sans-serif",
  boxSizing: "border-box",
};
const label = { font: "600 10px 'DM Sans',sans-serif", letterSpacing: "1px", textTransform: "uppercase", color: "#6B7280", marginBottom: 6, display: "block" };

export default function PayoutMethodSheet({ current, onClose, onSaved }) {
  const [type, setType] = useState(current?.method_type === "BANK" ? "BANK" : "UPI");
  const [f, setF] = useState({ upi: current?.upi_id || "", account: "", confirm: "", ifsc: current?.bank_ifsc || "", holder: current?.account_holder_name || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const problem = validatePayoutForm(type, f);

  const save = async () => {
    if (busy) return;
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const body =
        type === "UPI"
          ? { method_type: "UPI", account_details: { upi_id: f.upi.trim() } }
          : { method_type: "BANK", account_details: { account_no: f.account.replace(/\s+/g, ""), ifsc: f.ifsc.trim().toUpperCase(), holder_name: f.holder.trim() } };
      const { data } = await api.post("creator/payment-methods", body);
      toast.success("Payout details saved.");
      onSaved?.(data?.method || null);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || "Couldn't save your payout details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <MobileSheet onClose={onClose}>
        <SheetHeader
          title={current ? "Change payout account" : "Add payout account"}
          subtitle="Approved payouts are sent here. Only you and the Ybex finance team can see it."
          onClose={onClose}
        />
        <div style={{ marginTop: 16, display: "flex", gap: 6, padding: 4, background: "#F2F2F7", borderRadius: 12 }}>
          {[["UPI", "UPI"], ["BANK", "Bank account"]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              style={{ flex: 1, height: 36, border: "none", borderRadius: 9, background: type === v ? "#fff" : "transparent", font: "600 13px 'DM Sans',sans-serif", color: type === v ? "#101014" : "#6B7280", cursor: "pointer" }}
            >
              {l}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {type === "UPI" ? (
            <div>
              <span style={label}>UPI ID</span>
              <input style={input} value={f.upi} onChange={set("upi")} placeholder="yourname@bank" autoCapitalize="none" autoCorrect="off" />
            </div>
          ) : (
            <>
              <div>
                <span style={label}>Account holder name</span>
                <input style={input} value={f.holder} onChange={set("holder")} placeholder="As per bank records" />
              </div>
              <div>
                <span style={label}>Account number</span>
                <input style={input} value={f.account} onChange={set("account")} inputMode="numeric" type="password" placeholder={current?.account_last4 ? `Current ••${current.account_last4}` : "Account number"} />
              </div>
              <div>
                <span style={label}>Re-enter account number</span>
                <input style={input} value={f.confirm} onChange={set("confirm")} inputMode="numeric" placeholder="Account number" />
              </div>
              <div>
                <span style={label}>IFSC</span>
                <input style={{ ...input, textTransform: "uppercase" }} value={f.ifsc} onChange={set("ifsc")} placeholder="HDFC0001234" autoCapitalize="characters" />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || Boolean(problem)}
            style={{ marginTop: 4, height: 48, border: "none", borderRadius: 14, background: busy || problem ? "#E9E3F8" : "#7C3AED", color: busy || problem ? "#A89BCB" : "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: busy || problem ? "not-allowed" : "pointer" }}
          >
            {busy ? "Saving…" : "Save payout account"}
          </button>
        </div>
      </MobileSheet>
    </div>
  );
}

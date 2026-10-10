import React, { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import ModalPortal from "../common/ModalPortal";
import ButtonSpinner from "../common/ButtonSpinner";
import useBusy from "../../lib/useBusy";

import { PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 33: this form was a stub — "Submit" only closed it and no ticket was ever created
// (Help Center, Help category, My tickets, brand + creator mobile help, account status).
// Now it posts to the existing POST /support/tickets (support_routes.ts).
const CATEGORIES = ["Payments & Earnings", "Campaigns & Deals", "UGC orders", "Profile & KYC", "Account & Login", "Trust & Safety", "Other"];

export default function TicketForm({ onClose, onCreated, defaultCategory = "", orderId = null }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(defaultCategory || CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const { isBusy, anyBusy, run } = useBusy();

  const submit = (e) => run("submit", async () => {
    e?.preventDefault?.();
    if (!message.trim()) { toast.error("Please describe the problem."); return; }
    try {
      const { data } = await api.post("/support/tickets", {
        subject: subject.trim() || undefined,
        category,
        issue_category: category,
        message: message.trim(),
        order_id: orderId || undefined,
      });
      toast.success("Ticket sent. Our team will reply here and by notification.");
      onCreated?.(data);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not send the ticket. Please try again.");
    }
  });

  return (
    <ModalPortal>
      <PopupBackdrop className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={() => !anyBusy && onClose?.()}>
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()} data-testid="ticket-form"
          className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-2xl p-5 relative max-h-[90vh] overflow-y-auto"
          style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
          <PopupPanel kind="auto" below={640} onClose={() => !anyBusy && onClose?.()} className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Contact support</h2>
              <p className="text-xs text-gray-500 mt-0.5">We usually reply within a few hours.</p>
            </div>
            <button type="button" onClick={onClose} disabled={anyBusy} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
          </PopupPanel>
          <label className="block mt-4 text-xs font-semibold text-gray-700">Topic</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="block mt-3 text-xs font-semibold text-gray-700">Subject (optional)</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} placeholder="Short summary" className="mt-1.5 w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm" />
          <label className="block mt-3 text-xs font-semibold text-gray-700">What happened?</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} placeholder="Tell us what you were doing and what went wrong." className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm resize-none" />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onClose} disabled={anyBusy} className="h-11 px-4 rounded-xl bg-gray-100 text-sm font-semibold text-gray-800">Cancel</button>
            <button type="submit" disabled={anyBusy} className="flex-1 h-11 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {isBusy("submit") && <ButtonSpinner />} Send ticket
            </button>
          </div>
        </form>
      </PopupBackdrop>
    </ModalPortal>
  );
}

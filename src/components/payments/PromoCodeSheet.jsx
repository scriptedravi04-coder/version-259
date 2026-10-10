import React, { useState } from "react";
import { Tag, X } from "lucide-react";
import CreatorPromoCode from "./CreatorPromoCode";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 36: the same promo box, opened from Explore UGC and the deal chat ("Have a code? Apply").
export function PromoCodeLink({ label = "Have a promo code? Lower your fee", className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="promo-link"
        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4f46e5] ${className}`}>
        <Tag size={13} /> {label}
      </button>
      <Presence>{open && (
        <PopupBackdrop className="fixed inset-0 z-[110] bg-black/40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <PopupPanel kind="auto" below={640} onClose={() => setOpen(false)} className="w-full sm:max-w-md p-3 sm:p-0" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <div className="flex justify-end mb-2"><button onClick={() => setOpen(false)} aria-label="Close" className="p-2 rounded-full bg-white shadow"><X size={16} /></button></div>
            <CreatorPromoCode />
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </>
  );
}
export default PromoCodeLink;

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, Check } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { ignored } from "../../utils/ignored";

// Session 41 (Ravi) — "What's new": like the Terms popup, but it never blocks the app. The admin
// writes it (Admin → What's new) and publishes; each user sees each update once. The Terms popup
// sits above this one (z-index 200), so Terms always comes first.
const HIDE_ON = ["/login", "/signup", "/onboarding", "/verify", "/admin", "/chat"];

export default function WhatsNewPopup() {
  const { user } = useAuth() || {};
  const location = useLocation();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);

  useEffect(() => {
    if (!user?.user_id || (user.role !== "creator" && user.role !== "brand")) return undefined;
    let cancelled = false;
    // A short wait so it doesn't land on top of the page while it is still loading.
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("whats-new/latest");
        if (!cancelled) setItem(data?.item || null);
      } catch (e) { ignored("WhatsNew:load", e); }
    }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user?.user_id, user?.role]);

  const hidden = !item || location.pathname === "/" || HIDE_ON.some((p) => location.pathname.startsWith(p)) || location.pathname.includes("/inbox");

  const close = async (thenGo) => {
    const id = item?.id;
    setItem(null);
    if (id) api.post(`whats-new/${id}/seen`).catch((e) => ignored("WhatsNew:seen", e));
    if (thenGo) navigate(thenGo);
  };

  const points = Array.isArray(item?.points) ? item.points : [];

  return (
    <AnimatePresence>
      {!hidden && (
        <div key="wn" className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" data-testid="whats-new">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/55" onClick={() => close()} />
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full sm:max-w-md bg-white rounded-t-[26px] sm:rounded-[24px] px-6 pt-6"
            style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif", willChange: "transform" }}
          >
            <div className="w-11 h-11 rounded-2xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center">
              <Megaphone size={20} />
            </div>
            <div className="mt-3 text-[11px] font-bold tracking-wider uppercase text-[#7C3AED]">What's new</div>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight text-[#0A0A0A]">{item.title}</h2>
            <ul className="mt-4 space-y-3">
              {points.map((p, i) => (
                <li key={i} className="flex gap-3 text-[14.5px] leading-[1.5] text-[#374151]">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3} /></span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              {item.cta_url ? (
                <>
                  <button type="button" onClick={() => close()} className="flex-1 h-12 rounded-[14px] border border-[#E5E5EA] text-[14.5px] font-bold text-[#374151]">Later</button>
                  <button type="button" onClick={() => close(item.cta_url)} className="flex-[1.4] h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold" data-testid="whats-new-cta">{item.cta_label || "Try it"}</button>
                </>
              ) : (
                <button type="button" onClick={() => close()} className="w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold" data-testid="whats-new-ok">Got it</button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

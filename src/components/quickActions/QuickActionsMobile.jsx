import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Zap, X, BadgeCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { ignored } from "../../utils/ignored";
import { buildCreatorInviteActions, buildBrandApplicationActions, buildDealTurnActions, quickActionHiddenOn } from "./quickActionsData";
import { getInboxChip } from "../chat/mobile/chatStageMap";

// Session 41 (Ravi) — "Quick action" popup on phones (look borrowed from a ride app: a light-green
// sheet, "⚡ Quick action (N)", one card per thing waiting for you).
//   creator → a brand invited you to a campaign      (same calls as CreatorReviewInvitationModal)
//   brand   → a creator applied to your campaign      (same calls as BrandCampaignApplicants)
// It opens whenever the app is opened and something is waiting. ✕ hides it until the next app
// open; a new item makes it come back. Accept opens the chat; Decline asks why first.

const DECLINE_REASONS = {
  creator: ["Budget too low", "Deliverables not aligned", "Busy / Not available", "Other"],
  brand: ["Not the right fit", "Budget too high", "Audience doesn't match", "Other"],
};
const SEEN_KEY = "ybex_quick_actions_closed";

function readClosed() {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"); } catch (e) { ignored("QuickActions:read", e); return []; }
}
function writeClosed(ids) {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch (e) { ignored("QuickActions:write", e); }
}

export default function QuickActionsMobile() {
  const { user } = useAuth() || {};
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.role === "brand" ? "brand" : user?.role === "creator" ? "creator" : null;

  const [items, setItems] = useState([]);
  const [closedIds, setClosedIds] = useState(readClosed);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(null); // "accept" | "decline"
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [otherText, setOtherText] = useState("");

  const load = useCallback(async () => {
    if (!role || !isMobile) return;
    try {
      // Deals where it's your turn (sign, review, reupload) — same chat list the inbox reads.
      const threadsReq = api.get("chat/v2/threads").then((r) => {
        const d = r?.data;
        return Array.isArray(d) ? d : Array.isArray(d?.threads) ? d.threads : [];
      }).catch(() => []);
      if (role === "creator") {
        const [{ data }, threads] = await Promise.all([api.get("creators/invitations"), threadsReq]);
        setItems([...buildCreatorInviteActions(data), ...buildDealTurnActions(threads, false, getInboxChip)]);
      } else {
        const { data: campaigns } = await api.get("campaigns?mine=true");
        const list = Array.isArray(campaigns) ? campaigns : Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [];
        // Only campaigns that have applicants; newest first; at most 6 calls.
        const withApplicants = list
          .filter((c) => (c.applicants?.length || c.applicant_count || c.applications_count || 0) > 0)
          .slice(0, 6);
        const results = await Promise.allSettled(
          withApplicants.map((c) => api.get(`/campaigns/${c.campaign_id || c.id}/applications`).then((r) => ({ c, apps: r.data })))
        );
        const threads = await threadsReq;
        setItems([
          ...buildBrandApplicationActions(results.filter((r) => r.status === "fulfilled").map((r) => r.value)),
          ...buildDealTurnActions(threads, true, getInboxChip),
        ]);
      }
    } catch (e) {
      ignored("QuickActions:load", e);
    }
  }, [role, isMobile]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { types: ["invitation", "application", "campaign", "deal", "chat"], intervalMs: 90000, enabled: Boolean(role && isMobile) });

  const open = useMemo(() => items.filter((it) => !closedIds.includes(it.id)), [items, closedIds]);
  const current = open[Math.min(idx, Math.max(open.length - 1, 0))];
  const hidden = !role || !isMobile || quickActionHiddenOn(location.pathname) || open.length === 0;

  useEffect(() => { if (idx > open.length - 1) setIdx(Math.max(open.length - 1, 0)); }, [open.length, idx]);
  useEffect(() => { setDeclining(false); setReason(""); setOtherText(""); }, [current?.id]);

  const closeAll = () => {
    const ids = [...new Set([...closedIds, ...open.map((o) => o.id)])];
    setClosedIds(ids);
    writeClosed(ids);
  };
  const dropItem = (id) => setItems((list) => list.filter((it) => it.id !== id));
  const closeOne = (id) => { const ids = [...new Set([...closedIds, id])]; setClosedIds(ids); writeClosed(ids); };
  const go = (step) => { setDir(step); setIdx((i) => (i + step + open.length) % open.length); };

  const accept = async () => {
    if (!current || busy) return;
    if (current.kind === "deal") {
      closeOne(current.id);
      navigate(`/chat/${current.threadId}`);
      return;
    }
    setBusy("accept");
    try {
      if (current.kind === "invite") {
        const res = await api.post(`/creators/invitations/${current.raw.id}/accept`);
        toast.success("Invitation accepted! Chat is open.");
        dropItem(current.id);
        const threadId = res?.data?.thread_id;
        navigate(threadId ? `/chat/${threadId}` : "/creator/inbox");
      } else {
        const { data } = await api.post(`/campaigns/${current.campaignId}/applications/${current.raw.application_id}/action`, { action: "accept" });
        toast.success(`${current.title} is shortlisted. Opening chat.`);
        dropItem(current.id);
        navigate(data?.thread_id ? `/chat/${data.thread_id}` : "/brand/inbox");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not accept. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const finalReason = reason === "Other" ? otherText.trim() : reason;
  const decline = async () => {
    if (!current || busy || !finalReason) return;
    setBusy("decline");
    try {
      if (current.kind === "invite") {
        await api.post(`/creators/invitations/${current.raw.id}/decline`, { reason: finalReason });
      } else {
        await api.post(`/campaigns/${current.campaignId}/applications/${current.raw.application_id}/action`, { action: "reject", reason: finalReason });
      }
      toast.success("Declined. They've been told why.");
      dropItem(current.id);
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not decline. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AnimatePresence>
      {!hidden && current && (
        <div key="qa" style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} data-testid="quick-actions">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={closeAll}
            style={{ position: "absolute", inset: 0, background: "rgba(18,18,26,.45)" }}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40, mass: 0.9 }}
            style={{
              // Session 43 (Ravi): deeper green at the top, lighter towards the bottom.
              position: "relative", background: "linear-gradient(180deg, #A3E635 0%, #C5F27A 38%, #ECFCCB 100%)", borderRadius: "26px 26px 0 0", willChange: "transform",
              padding: "18px 16px calc(18px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 14px" }}>
              <Zap size={22} color="#F59E0B" fill="#FACC15" />
              <div style={{ flex: 1, font: "800 17px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Quick action ({open.length})</div>
              <button type="button" onClick={closeAll} aria-label="Close" data-testid="quick-actions-close"
                style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={22} color="#0A0A0A" />
              </button>
            </div>

            <div style={{ position: "relative", overflow: "hidden", borderRadius: 22 }}>
              <AnimatePresence initial={false} mode="popLayout" custom={dir}>
                <motion.div
                  key={current.id}
                  initial={{ x: dir > 0 ? "70%" : "-70%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ x: dir > 0 ? "-70%" : "70%", opacity: 0, transition: { duration: 0.2 } }}
                  drag={open.length > 1 && !declining ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.3}
                  onDragEnd={(_e, info) => { if (info.offset.x < -60) go(1); else if (info.offset.x > 60) go(-1); }}
                  style={{ background: "#fff", borderRadius: 22, padding: 16, touchAction: "pan-y", willChange: "transform" }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {current.photo ? (
                      <img src={current.photo} alt="" style={{ width: 56, height: 56, borderRadius: current.kind === "invite" ? 16 : 28, objectFit: "cover", flexShrink: 0, background: "#F2F2F7" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: current.kind === "invite" ? 16 : 28, background: "#F5F0FF", color: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", font: "800 20px 'DM Sans',sans-serif", flexShrink: 0 }}>
                        {(current.title || "?").trim()[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ font: "800 16px 'DM Sans',sans-serif", color: "#0A0A0A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.title}</span>
                        {current.verified && <BadgeCheck size={16} color="#16A34A" />}
                      </div>
                      <div style={{ marginTop: 2, font: "600 12.5px 'DM Sans',sans-serif", color: "#6B7280" }}>{current.subtitle}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: "#F7F7FA", font: "600 13px/1.45 'DM Sans',sans-serif", color: "#0A0A0A" }}>
                    {current.headline}
                  </div>

                  {current.amount && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }} data-testid="quick-actions-amount">
                      <span style={{ font: "600 12.5px 'DM Sans',sans-serif", color: "#6B7280" }}>{current.amountLabel || "Budget offered"}</span>
                      <span style={{ font: "800 28px/1 'DM Sans',sans-serif", letterSpacing: "-0.02em", color: "#047857" }}>{current.amount}</span>
                    </div>
                  )}

                  {Array.isArray(current.details) && current.details.length > 0 ? (
                    <div style={{ marginTop: 12, borderTop: "1px solid #EEEEF2" }} data-testid="quick-actions-details">
                      {current.details.map((d) => (
                        <div key={d.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F2F5" }}>
                          <span style={{ font: "500 12.5px 'DM Sans',sans-serif", color: "#6B7280", flexShrink: 0 }}>{d.label}</span>
                          <span style={{ font: "700 12.5px/1.35 'DM Sans',sans-serif", color: "#0A0A0A", textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : current.facts.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {current.facts.map((f) => (
                        <span key={f} style={{ padding: "5px 10px", borderRadius: 999, background: "#F5F0FF", color: "#5B21B6", font: "700 11.5px 'DM Sans',sans-serif" }}>{f}</span>
                      ))}
                    </div>
                  )}
                  {current.description && (
                    <div style={{ marginTop: 10, font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#374151", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {current.description}
                    </div>
                  )}
                  {current.note && current.note !== current.description && (
                    <div style={{ marginTop: 10, padding: "8px 11px", borderLeft: "3px solid #C4B5FD", background: "#FAF7FF", borderRadius: "0 10px 10px 0", font: "italic 400 12.5px/1.5 'DM Sans',sans-serif", color: "#4B5563", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      “{current.note}”
                    </div>
                  )}

                  {declining ? (
                    <div style={{ marginTop: 14 }} data-testid="quick-actions-decline">
                      <div style={{ font: "700 12.5px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Why are you declining?</div>
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {DECLINE_REASONS[role].map((r) => (
                          <button key={r} type="button" onClick={() => setReason(r)}
                            style={{ padding: "7px 11px", borderRadius: 999, border: reason === r ? "1.5px solid #7C3AED" : "1px solid #E5E5EA", background: reason === r ? "#F5F0FF" : "#fff", color: reason === r ? "#7C3AED" : "#374151", font: "600 12px 'DM Sans',sans-serif" }}>
                            {r}
                          </button>
                        ))}
                      </div>
                      {reason === "Other" && (
                        <textarea value={otherText} onChange={(e) => setOtherText(e.target.value.slice(0, 300))} placeholder="Tell them in a line"
                          style={{ marginTop: 8, width: "100%", height: 64, borderRadius: 12, border: "1px solid #E5E5EA", padding: "9px 11px", font: "400 13px 'DM Sans',sans-serif", resize: "none", boxSizing: "border-box" }} />
                      )}
                      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                        <button type="button" onClick={() => setDeclining(false)}
                          style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid #E5E5EA", background: "#fff", font: "700 14px 'DM Sans',sans-serif", color: "#374151" }}>Back</button>
                        <button type="button" onClick={decline} disabled={!finalReason || busy === "decline"} data-testid="quick-actions-decline-send"
                          style={{ flex: 1.4, height: 46, borderRadius: 14, border: "none", background: "#DC2626", color: "#fff", font: "700 14px 'DM Sans',sans-serif", opacity: !finalReason || busy ? 0.55 : 1 }}>
                          {busy === "decline" ? "Declining…" : "Decline"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                      {current.kind !== "deal" && (
                      <button type="button" onClick={() => setDeclining(true)} aria-label="Decline" data-testid="quick-actions-decline-open"
                        style={{ width: 54, height: 50, borderRadius: 14, border: "1.5px solid #D4D4D8", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X size={22} color="#374151" />
                      </button>
                      )}
                      <button type="button" onClick={accept} disabled={busy === "accept"} data-testid="quick-actions-accept"
                        style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: "#7C3AED", color: "#fff", font: "800 15px 'DM Sans',sans-serif", opacity: busy ? 0.7 : 1 }}>
                        {busy === "accept" ? "Opening chat…" : current.acceptLabel}
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {open.length > 1 && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <button type="button" onClick={() => go(-1)} aria-label="Previous" style={{ border: "none", background: "transparent" }}><ChevronLeft size={20} /></button>
                <div style={{ display: "flex", gap: 5 }}>
                  {open.map((o, i) => (
                    <span key={o.id} style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3, background: i === idx ? "#0A0A0A" : "rgba(10,10,10,.25)", transition: "width .2s" }} />
                  ))}
                </div>
                <button type="button" onClick={() => go(1)} aria-label="Next" style={{ border: "none", background: "transparent" }}><ChevronRight size={20} /></button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

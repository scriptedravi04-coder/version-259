import React, { useState } from "react";
import { X, Send, Calendar, DollarSign, Package, FileText, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api } from "../../lib/api";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../common/ButtonSpinner";
import ModalPortal from "../common/ModalPortal";
import useScrollLock from "../../lib/useScrollLock";
import useIsMobile from "../../hooks/useIsMobile";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
function InviteToCampaignModalBody({
  isOpen = true,
  onClose,
  creator,
  onInviteSent,
  onCreateCampaign = null, // session 30: page-provided route to Create campaign
  campaigns = null, // session 30: the brand's live campaigns (loaded by the page) to prefill from
}) {
  const [campaignTitle, setCampaignTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [timeline, setTimeline] = useState("");
  const [pitch, setPitch] = useState("");

  const { isBusy, anyBusy, run } = useBusy();
  const isMobile = useIsMobile();
  const [pickedId, setPickedId] = useState(null);
  useScrollLock(Boolean(isOpen && creator));

  if (!isOpen || !creator) return null;

  const creatorName = creator.name || creator.full_name || "Creator";
  const creatorPhoto = creator.photo || creator.profile_photo_url || creator.picture;
  const creatorHandle = creator.instagram_handle || creator.handle || creator.instagram || "";
  const creatorNiche = creator.category || creator.content_niches || "";

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!pitch.trim()) {
      toast.error("Please include a brief or pitch message for the creator.");
      return;
    }
    // The invite becomes a real campaign deal when the creator accepts, so it needs a fee.
    // Same ₹3,000 floor as a counter offer; the server checks it again.
    const feeNumber = Number(String(budget).replace(/[^0-9.]/g, ""));
    if (!feeNumber || feeNumber < 3000) {
      toast.error("Please enter the fee you are offering (₹3,000 or more).");
      return;
    }

    run("send_invite", async () => {
      try {
        const creatorId = creator.user_id || creator.id;
        const res = await api.post(`/creators/${creatorId}/send-brief`, {
          campaign_title: campaignTitle.trim() || undefined,
          campaign_description: pitch.trim(),
          budget_range: budget.trim(),
          deliverables: deliverables.trim() || undefined,
          timeline: timeline.trim() || undefined,
          message: pitch.trim(),
          pitch: pitch.trim(),
        });

        // Prompt requirement: Brand sees exact success toast and do NOT open chat thread
        toast.success(
          res.data?.note ||
          res.data?.message ||
          "Invitation sent to creator! Chat will open once the creator accepts your invitation."
        );

        if (onInviteSent) onInviteSent(res.data);
        onClose();
      } catch (err) {
        toast.error(
          err.response?.data?.error ||
          err.response?.data?.detail ||
          "Failed to send campaign invitation. Please try again."
        );
      }
    });
  };

  // Session 30 — EX-05 mobile invite sheet (Ravi's design). Same submit (handleSubmit → the same
  // send-brief call and payload). Picking a campaign only prefills the fields.
  const firstName = creatorName.split(" ")[0];
  const reelRate = Number(creator.rate_reel || creator.reel_rate || creator.rate_card?.reels || creator.rate_card?.reel || 0) || null;
  const pick = (camp) => {
    const cid = camp.campaign_id || camp.id;
    setPickedId(cid);
    setCampaignTitle(camp.title || "");
    if (camp.deliverables && !deliverables) setDeliverables(String(camp.deliverables));
    if (!pitch.trim()) setPitch(camp.description || camp.brief || `We'd love to have you on ${camp.title || "our campaign"}.`);
    if (!budget && reelRate) setBudget(String(reelRate));
  };
  const campLine = (camp) => {
    const f = (v) => `₹${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}K` : Number(v)}`;
    const bits = [];
    if (camp.budget_min === 0) bits.push("Barter");
    else if (camp.budget_min && camp.budget_max && camp.budget_max > camp.budget_min) bits.push(`${f(camp.budget_min)}–${f(camp.budget_max)}`);
    else if (camp.budget_min || camp.budget_max) bits.push(f(camp.budget_min || camp.budget_max));
    const end = camp.deadline || camp.end_date;
    if (end && !Number.isNaN(new Date(end).getTime())) bits.push(`closes ${new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`);
    return bits.join(" · ");
  };
  if (isMobile) {
    return (
      <ModalPortal>
        <PopupBackdrop className="fixed inset-0 z-[9998] bg-[rgba(10,10,14,.45)]" onClick={() => !anyBusy && onClose()} />
        <PopupPanel as="form" kind="sheet" onClose={() => !anyBusy && onClose()} onSubmit={handleSubmit} className="fixed inset-x-0 bottom-0 z-[9999] bg-white rounded-t-[26px] px-[18px] pt-2.5 flex flex-col gap-3 max-h-[88dvh] overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 -20px 40px -20px rgba(0,0,0,.3)" }}>
          <div className="w-10 h-[5px] rounded-full bg-[#E0E0E6] self-center" />
          <div className="text-[17px] font-bold">Invite {firstName} to a campaign</div>
          <div className="flex flex-col gap-2">
            {campaigns === null ? (
              [0, 1].map((k) => <div key={k} className="h-[60px] rounded-2xl bg-[#EFEFF4] animate-pulse" />)
            ) : campaigns.length === 0 ? (
              <div className="text-[13px] text-[#6B7280]">You have no live campaigns. Write the offer below, or create a campaign first.</div>
            ) : campaigns.map((camp) => {
              const cid = camp.campaign_id || camp.id;
              const on = pickedId === cid;
              return (
                <button type="button" key={cid} onClick={() => pick(camp)} className="min-h-[60px] rounded-2xl px-3.5 py-2.5 text-left flex items-center gap-3 transition"
                  style={{ border: on ? "1.5px solid #7C3AED" : "1px solid #E6E6EE", background: on ? "#F3EDFF" : "#fff" }}>
                  <span className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center" style={{ borderColor: on ? "#7C3AED" : "#D4D4DE" }}>{on && <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED]" />}</span>
                  <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{camp.title || "Campaign"}</span>{campLine(camp) && <span className="block text-xs text-[#6B7280] truncate">{campLine(camp)}</span>}</span>
                </button>
              );
            })}
            {onCreateCampaign && (
              <button type="button" onClick={() => { onClose(); onCreateCampaign(); }} className="h-11 text-[13.5px] font-semibold text-[#7C3AED] text-left">+ Create a new campaign</button>
            )}
          </div>
          {!pickedId && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-[#374151]">Campaign title</span>
              <input value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} placeholder="e.g. Summer launch reel" className="h-[50px] rounded-[14px] border border-[#E0E0E8] px-3.5 text-[15px] outline-none focus:border-[#7C3AED]" />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#374151]">Deliverables</span>
            <input value={deliverables} onChange={(e) => setDeliverables(e.target.value)} placeholder="e.g. 1 Reel + 2 Stories" className="h-[50px] rounded-[14px] border border-[#E0E0E8] px-3.5 text-[15px] outline-none focus:border-[#7C3AED]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#374151]">Your offer (₹)</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="3000 or more" className="h-[50px] rounded-[14px] border border-[#E0E0E8] px-3.5 text-[17px] font-bold outline-none focus:border-[#7C3AED]" />
            {reelRate && <span className="text-[11.5px] text-[#6B7280]">{firstName}'s rate card: ₹{reelRate.toLocaleString("en-IN")} per reel</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#374151]">Message</span>
            <textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3} placeholder="What you'd like them to make" className="rounded-[14px] border border-[#E0E0E8] px-3.5 py-3 text-[14px] outline-none focus:border-[#7C3AED] resize-none" />
          </label>
          <button type="submit" disabled={isBusy("send_invite")} className="h-[50px] rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-60">
            {isBusy("send_invite") ? <ButtonSpinner /> : <Send size={16} />} Send invite
          </button>
          <div className="text-center text-xs text-[#6B7280]">No money moves until you hire them.</div>
        </PopupPanel>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal>
    <AnimatePresence>
      <PopupBackdrop 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && !anyBusy) onClose();
        }}
      >
        <PopupPanel kind="modal"
          className="bg-white rounded-3xl border border-[var(--border-default)] shadow-2xl max-w-lg w-full p-6 sm:p-7 relative my-8"
        >
          {/* Dismiss button (top-right X) */}
          <button
            type="button"
            onClick={onClose}
            disabled={anyBusy}
            aria-label="Close modal"
            className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 disabled:opacity-50"
          >
            <X size={18} />
          </button>

          {/* Modal Header with Creator Brief Preview */}
          <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-[var(--border-default)]">
            {creatorPhoto ? (
              <img
                src={creatorPhoto}
                alt={creatorName}
                className="w-12 h-12 rounded-2xl object-cover border border-black/5 shrink-0 shadow-xs"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--violet-soft)] to-purple-100 text-[var(--violet)] font-bold flex items-center justify-center text-base shrink-0 border border-purple-200">
                {creatorName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--violet)] bg-[var(--violet-soft)] px-2 py-0.5 rounded-full">
                  Direct Invitation
                </span>
                {creatorNiche && (
                  <span className="text-[10px] text-gray-400 font-medium truncate max-w-[120px]">
                    • {creatorNiche.split(",")[0]}
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] truncate mt-0.5">
                Invite {creatorName}
              </h3>
              {creatorHandle && (
                <p className="text-xs text-gray-500 font-medium">@{creatorHandle.replace('@', '')}</p>
              )}
            </div>
          </div>

          {/* Form */}
          <form data-testid="invite-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Campaign Name */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText size={12} className="text-gray-400" /> Campaign Name
              </label>
              <input
                type="text"
                required
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="e.g. Summer Skincare Product Launch"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            {/* Proposed Budget & Timeline Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <DollarSign size={12} className="text-gray-400" /> Your Offer (₹, min 3,000)
                </label>
                <input
                  type="text"
                  required
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 54,903 or ₹15,000"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Calendar size={12} className="text-gray-400" /> Timeline / Deadline
                </label>
                <input
                  type="text"
                  required
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  placeholder="e.g. 7-10 days (a number means days)"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Deliverables */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Package size={12} className="text-gray-400" /> Deliverables Requested
              </label>
              <input
                type="text"
                required
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
                placeholder="e.g. 1 Dedicated Reel + 2 Story frames"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
              />
              <p className="text-[10px] text-gray-400 mt-1">Specify formats so the creator understands the required content.</p>
            </div>

            {/* Pitch / Message */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Send size={12} className="text-gray-400" /> Pitch & Campaign Brief
              </label>
              <textarea
                required
                rows={3}
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                placeholder="Describe your brand goals, creative angles, key talking points, or product details..."
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400 resize-none"
              />
            </div>

            {/* Explainer Note */}
            <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3 flex items-start gap-2.5 text-amber-900 text-xs">
              <CheckCircle2 size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-snug text-[11px]">
                <strong>Gated Privacy Protection:</strong> Chat will remain locked until {creatorName} reviews and accepts your invitation.
              </p>
            </div>

            {/* Action Buttons: Strict ARCHITECTURE.md Alignment */}
            {/* Left: Dismissive / Secondary; Right: Affirmative / Primary */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-default)]">
              <button
                type="button"
                onClick={onClose}
                disabled={anyBusy}
                className="btn-secondary py-2.5 px-5 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={anyBusy}
                className="btn-primary py-2.5 px-6 text-xs font-semibold cursor-pointer shadow-md"
              >
                {isBusy("send_invite") ? (
                  <ButtonSpinner label="Sending Invitation..." />
                ) : (
                  <>
                    <Send size={14} /> Send Invitation
                  </>
                )}
              </button>
            </div>
          </form>
        </PopupPanel>
      </PopupBackdrop>
    </AnimatePresence>
    </ModalPortal>
  );
}

// Session 37: stays mounted for its closing animation.
export default function InviteToCampaignModal(props) {
  return <Presence>{props.isOpen && props.creator && <InviteToCampaignModalBody key="invitetocampaignmodal" {...props} />}</Presence>;
}


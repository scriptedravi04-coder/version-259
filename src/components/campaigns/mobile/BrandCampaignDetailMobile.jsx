import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Lightbulb, ChevronLeft, MoreHorizontal, Share2, Plus, Users, ChevronRight, Pencil, Pause, Play, X } from "lucide-react";
import { api } from "../../../lib/api";
import ApplicantCard from "../ApplicantCard";
import ExportAnalyticsPdfButton from "../../common/ExportAnalyticsPdfButton";
import ModalPortal from "../../common/ModalPortal";
import useScrollLock from "../../../lib/useScrollLock";
import ButtonSpinner from "../../common/ButtonSpinner";

import { Presence, PopupBackdrop, PopupPanel } from "../../common/Popup";
import PersonPhoto from "../../common/PersonPhoto";
import { publicOrigin } from "../../../lib/publicUrl";
// Session 30: Ravi's brand mobile design — MG-04 campaign detail, MG-05 no pitches, MG-06 actions.
// Data + applicant actions come from BrandCampaignApplicants.jsx (locked page, calls unchanged).
// The three calls in this file are the new, Ravi-approved campaign actions (backend/campaignManage.ts):
//   POST /campaigns/:id/applications-paused · POST /campaigns/:id/close · GET /campaigns/:id/matching-creators

const lower = (s) => String(s || "").toLowerCase().trim();
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

function budgetText(c) {
  if (!c) return "";
  if (c.budget_min === 0) return "Barter";
  const min = Number(c.budget_min || 0), max = Number(c.budget_max || 0);
  if (min && max && max > min) return `${inr(min)} – ${inr(max)} per creator`;
  if (min || max) return `${inr(min || max)} per creator`;
  return "";
}

function closesText(c) {
  const end = c?.deadline || c?.end_date;
  if (!end) return "";
  const t = new Date(end);
  if (Number.isNaN(t.getTime())) return "";
  const d = Math.ceil((t.getTime() - Date.now()) / 86400000);
  const date = t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (d < 0) return `Closed ${date}`;
  return `Closes ${date} · ${d} day${d === 1 ? "" : "s"} left`;
}

function Chip({ bg, fg, children }) {
  return <span className="h-[22px] px-2 rounded-[7px] inline-flex items-center text-[10px] font-bold tracking-[.5px] uppercase whitespace-nowrap shrink-0" style={{ background: bg, color: fg }}>{children}</span>;
}

function Stat({ value, label, dot }) {
  return (
    <div className="bg-white border border-[#E6E6EE] rounded-2xl p-3 min-w-0">
      <div className="flex items-center justify-between"><span className="text-xl font-bold">{value}</span>{dot && <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />}</div>
      <div className="mt-0.5 text-[11.5px] font-medium text-[#6B7280] truncate">{label}</div>
    </div>
  );
}

export default function BrandCampaignDetailMobile({
  campaignId, campaign, applicants = [], aiRoi, isPredictingRoi, onPredictRoi,
  onShortlist, onReject, onProfileView, onChat, onReload, hiredCreatorIds = null,
}) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null); // null | "actions" | "confirm-close"
  const [busy, setBusy] = useState(null);
  const [matching, setMatching] = useState(null);
  const listRef = useRef(null);
  useScrollLock(Boolean(sheet));

  const id = campaignId || campaign?.campaign_id || campaign?.id;
  const status = lower(campaign?.status);
  const isClosed = status === "completed" || Boolean(campaign?.closed_at);
  const isPaused = Boolean(campaign?.applications_paused) && !isClosed;
  const isLive = (status === "live" || status === "approved") && !isClosed;
  const pending = applicants.filter((a) => ["pending", "applied", "new", ""].includes(lower(a.status))).length;
  const shortlisted = applicants.filter((a) => ["accepted", "shortlisted", "approved"].includes(lower(a.status))).length;
  const noPitches = applicants.length === 0;

  const [applicantTab, setApplicantTab] = useState("under_review"); // "under_review" | "shortlisted" | "hired" | "passed" | "all"
  const [playerIndex, setPlayerIndex] = useState(null);

  const underReviewList = applicants.filter((a) => ["pending", "applied", "new", ""].includes(lower(a.status)));
  // Session 33: hired = escrow funded (from the deal threads, see src/lib/hiredCreators.js).
  const isHired = (a) => ["hired", "deal_active", "completed"].includes(lower(a.status)) || Boolean(hiredCreatorIds && hiredCreatorIds.has(String(a.creator_id)));
  const shortlistedList = applicants.filter((a) => ["accepted", "shortlisted", "approved"].includes(lower(a.status)) && !isHired(a));
  const hiredList = applicants.filter(isHired);
  const passedList = applicants.filter((a) => ["rejected", "declined", "passed"].includes(lower(a.status)));

  const currentList =
    applicantTab === "under_review"
      ? underReviewList
      : applicantTab === "shortlisted"
      ? shortlistedList
      : applicantTab === "hired"
      ? hiredList
      : applicantTab === "passed"
      ? passedList
      : applicants;

  useEffect(() => {
    if (!id || !noPitches) return;
    let alive = true;
    api.get(`/campaigns/${id}/matching-creators`).then(({ data }) => { if (alive) setMatching(data); }).catch(() => {});
    return () => { alive = false; };
  }, [id, noPitches]);

  const shareLink = async () => {
    const url = `${publicOrigin()}/campaigns/${id}`;
    const title = campaign?.title || "Campaign on Ybex";
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Brief link copied");
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Could not share the link.");
    }
  };

  const togglePause = async () => {
    setBusy("pause");
    try {
      await api.post(`/campaigns/${id}/applications-paused`, { paused: !isPaused });
      toast.success(isPaused ? "New applications are open again" : "New applications paused");
      setSheet(null);
      await onReload?.({ silent: true });
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not update the campaign.");
    } finally { setBusy(null); }
  };

  const closeCampaign = async () => {
    setBusy("close");
    try {
      await api.post(`/campaigns/${id}/close`);
      toast.success("Campaign closed. Hired creators keep their deals.");
      setSheet(null);
      await onReload?.({ silent: true });
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not close the campaign.");
    } finally { setBusy(null); }
  };

  const chip = isClosed ? ["#EEF2FF", "#4338CA", "Closed"] : isPaused ? ["#FEF3C7", "#B45309", "Paused"] : isLive ? ["#DCFCE7", "#15803D", "Live"] : ["#F1F1F5", "#4B5563", campaign?.status || "Draft"];
  const plats = Array.isArray(campaign?.platforms) ? campaign.platforms.filter(Boolean).join(", ") : "";

  return (
    <div className="w-full text-left text-[#0A0A0A] pb-10" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="brand-campaign-detail-mobile">
      <div className="h-[54px] flex items-center gap-2.5">
        <button type="button" onClick={() => navigate("/brand/campaigns")} aria-label="Back" className="w-10 h-10 rounded-[13px] bg-white border border-[#ECECF0] flex items-center justify-center"><ChevronLeft size={18} /></button>
        <div className="flex-1 min-w-0 text-[17px] font-bold tracking-[-.4px] truncate">Campaign</div>
        <button type="button" onClick={() => setSheet("actions")} aria-label="Campaign actions" className="w-10 h-10 rounded-[13px] bg-white border border-[#ECECF0] flex items-center justify-center"><MoreHorizontal size={18} /></button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-3.5">
          <div className="flex items-center gap-2 flex-wrap"><Chip bg={chip[0]} fg={chip[1]}>{chip[2]}</Chip><span className="text-xs font-medium text-[#6B7280]">{closesText(campaign)}</span></div>
          <div className="mt-2.5 text-[19px] font-bold leading-tight">{campaign?.title || "Campaign"}</div>
          {plats && <div className="mt-1 text-[12.5px] text-[#6B7280]">{plats}</div>}
          {budgetText(campaign) && <div className="mt-2 text-sm font-semibold text-[#15803D]">{budgetText(campaign)}</div>}
          {isPaused && <div className="mt-2.5 text-xs text-[#B45309]">New applications are paused. Existing applicants and deals continue.</div>}
        </div>

        {noPitches ? (
          <>
            <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-3.5 flex flex-col items-center text-center gap-2">
              <div className="w-[52px] h-[52px] rounded-2xl bg-[#F1F1F5] flex items-center justify-center"><Users size={26} color="#4B5563" /></div>
              <div className="mt-1 text-base font-bold">No pitches yet</div>
              <div className="text-[13px] leading-normal text-[#6B7280]">Sharing the brief link gets pitches faster.</div>
              <div className="w-full mt-2 flex flex-col gap-2">
                <button type="button" onClick={shareLink} className="h-[50px] rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center gap-2 text-[15px] font-semibold"><Share2 size={17} /> Share brief link</button>
                <button type="button" onClick={() => navigate("/creators")} className="h-[50px] rounded-2xl bg-[#F3EDFF] text-[#7C3AED] flex items-center justify-center gap-2 text-[15px] font-semibold"><Plus size={17} /> Invite creators</button>
              </div>
            </div>
            {matching && matching.count > 0 && (
              <button type="button" onClick={() => navigate(Array.isArray(matching?.categories) && matching.categories[0] ? `/creators?niche=${encodeURIComponent(matching.categories[0])}` : "/creators")} className="bg-white border border-[#E6E6EE] rounded-[20px] px-3.5 py-3 min-h-[60px] flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-[11px] bg-[#DCFCE7] flex items-center justify-center shrink-0"><Users size={18} color="#15803D" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold">{matching.count} creator{matching.count === 1 ? "" : "s"} match this brief</div>
                  {matching.categories?.length > 0 && <div className="mt-0.5 text-xs text-[#6B7280] truncate capitalize">{matching.categories.join(" · ")}</div>}
                </div>
                <ChevronRight size={16} color="#9CA3AF" />
              </button>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setApplicantTab("all"); listRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                className="text-left cursor-pointer active:scale-[0.98] transition"
              >
                <Stat value={applicants.length} label="Applicants" dot={pending > 0} />
              </button>
              <button
                type="button"
                onClick={() => { setApplicantTab("under_review"); listRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                className="text-left cursor-pointer active:scale-[0.98] transition"
              >
                <Stat value={pending} label="New" />
              </button>
              <button
                type="button"
                onClick={() => { setApplicantTab("shortlisted"); listRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                className="text-left cursor-pointer active:scale-[0.98] transition"
              >
                <Stat value={shortlisted} label="Shortlisted" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setApplicantTab("under_review"); listRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              className="h-[50px] rounded-2xl bg-[#7C3AED] text-white text-[15px] font-semibold"
              style={{ boxShadow: "0 12px 22px -14px rgba(124,58,237,.9)" }}
            >
              Review {applicants.length} applicant{applicants.length === 1 ? "" : "s"}
            </button>
            <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F3EDFF] flex items-center justify-center shrink-0"><Lightbulb size={20} color="#7C3AED" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">Predict ROI for this pool</div>
                  <div className="mt-0.5 text-xs text-[#6B7280]">Estimated reach from {applicants.length} pitch{applicants.length === 1 ? "" : "es"}</div>
                </div>
                <button type="button" onClick={onPredictRoi} disabled={isPredictingRoi} className="h-9 px-3 rounded-[11px] bg-[#F3EDFF] text-[#7C3AED] text-[12.5px] font-semibold disabled:opacity-60 flex items-center gap-1.5">
                  {isPredictingRoi && <ButtonSpinner />} Predict
                </button>
              </div>
              {aiRoi && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {aiRoi.estimatedReach != null && <div><div className="text-sm font-bold">{Number(aiRoi.estimatedReach).toLocaleString("en-IN")}</div><div className="text-[10.5px] text-[#6B7280]">Est. reach</div></div>}
                  {aiRoi.estimatedEngagement != null && <div><div className="text-sm font-bold">{Number(aiRoi.estimatedEngagement).toLocaleString("en-IN")}</div><div className="text-[10.5px] text-[#6B7280]">Est. engagement</div></div>}
                  {aiRoi.roiMultiplier != null && <div><div className="text-sm font-bold text-[#15803D]">{aiRoi.roiMultiplier}x</div><div className="text-[10.5px] text-[#6B7280]">ROI (estimate)</div></div>}
                  {aiRoi.analysis && <p className="col-span-3 text-xs text-[#6B7280] text-left leading-relaxed">{aiRoi.analysis}</p>}
                </div>
              )}
            </div>
            <div ref={listRef} className="flex flex-col gap-2.5 pt-1.5 scroll-mt-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11.5px] font-bold tracking-[1px] uppercase text-[#6B7280]">Pitches</span>
                <span className="text-[11px] font-semibold text-[#7C3AED]">{currentList.length} shown</span>
              </div>
              {/* AP-01 / AP-04 Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setApplicantTab("under_review")}
                  className={`h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    applicantTab === "under_review" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E6E6EE] text-[#4B5563]"
                  }`}
                >
                  Under review · {underReviewList.length}
                </button>
                <button
                  type="button"
                  onClick={() => setApplicantTab("shortlisted")}
                  className={`h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    applicantTab === "shortlisted" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E6E6EE] text-[#4B5563]"
                  }`}
                >
                  Shortlisted · {shortlistedList.length}
                </button>
                <button
                  type="button"
                  onClick={() => setApplicantTab("hired")}
                  className={`h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    applicantTab === "hired" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E6E6EE] text-[#4B5563]"
                  }`}
                >
                  Hired · {hiredList.length}
                </button>
                <button
                  type="button"
                  onClick={() => setApplicantTab("passed")}
                  className={`h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    applicantTab === "passed" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E6E6EE] text-[#4B5563]"
                  }`}
                >
                  Passed · {passedList.length}
                </button>
                <button
                  type="button"
                  onClick={() => setApplicantTab("all")}
                  className={`h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    applicantTab === "all" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E6E6EE] text-[#4B5563]"
                  }`}
                >
                  All · {applicants.length}
                </button>
              </div>
            </div>
            {currentList.length === 0 ? (
              <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-6 text-center text-[#6B7280] text-xs">
                No applicants in this category.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {currentList.map((app, i) => (
                  <div key={(app.application_id || app.id || i) + "-" + i} className="relative">
                    <ApplicantCard
                      applicant={app}
                      onShortlist={onShortlist}
                      onReject={onReject}
                      onViewProfile={onProfileView}
                      onChat={onChat}
                    />
                    <button
                      type="button"
                      onClick={() => setPlayerIndex(i)}
                      className="mt-2 w-full py-2 bg-[#F3EDFF] hover:bg-[#EAE0FF] text-[#7C3AED] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <span>Open pitch details &amp; player</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white border border-[#E6E6EE] rounded-[20px] px-3.5 py-3">
              <ExportAnalyticsPdfButton campaign={campaign} applicants={applicants} aiRoi={aiRoi} buttonText="Download analysis report" />
            </div>
          </>
        )}
      </div>

      <Presence>{sheet && (
        <ModalPortal>
          <PopupBackdrop className="fixed inset-0 z-[70] bg-[rgba(10,10,14,.45)]" onClick={() => !busy && setSheet(null)} />
          <PopupPanel kind="sheet" onClose={() => !busy && setSheet(null)} className="fixed left-0 right-0 bottom-0 z-[71] bg-white rounded-t-[26px] px-[18px] pt-2.5 flex flex-col gap-3.5" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 -20px 40px -20px rgba(0,0,0,.3)" }}>
            <div className="w-10 h-[5px] rounded-full bg-[#E0E0E6] self-center" />
            {sheet === "actions" ? (
              <>
                <div>
                  <div className="text-[17px] font-bold leading-snug">{campaign?.title || "Campaign"}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#6B7280]">{chip[2]} · {applicants.length} applicant{applicants.length === 1 ? "" : "s"}</div>
                </div>
                <div className="flex flex-col">
                  <SheetRow icon={<Pencil size={19} />} label="Edit brief" onClick={() => navigate(`/brand/campaigns/create?edit=${id}`)} />
                  <SheetRow icon={<Share2 size={19} />} label="Share brief link" onClick={() => { setSheet(null); shareLink(); }} />
                  {!isClosed && isLive && (
                    <SheetRow icon={isPaused ? <Play size={19} /> : <Pause size={19} />} label={isPaused ? "Resume new applications" : "Pause new applications"} busy={busy === "pause"} onClick={togglePause} />
                  )}
                  {!isClosed && isLive && (
                    <button type="button" onClick={() => setSheet("confirm-close")} className="pt-3 pb-0.5 flex items-start gap-3.5 text-left">
                      <X size={19} color="#B91C1C" className="shrink-0" />
                      <div><div className="text-[15px] font-semibold text-[#B91C1C]">Close campaign</div><div className="mt-0.5 text-xs text-[#6B7280]">Hired creators keep their deals. New pitches stop.</div></div>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold">Close this campaign?</div>
                <div className="-mt-1.5 text-[13.5px] leading-normal text-[#6B7280]">New pitches stop and it moves to Completed. Hired creators keep their deals. This can't be undone from the app.</div>
                <div className="flex items-center gap-2.5">
                  <button type="button" onClick={() => !busy && setSheet(null)} className="flex-1 h-[50px] rounded-2xl bg-white border border-[#E0E0E8] text-[15px] font-semibold">Cancel</button>
                  <button type="button" onClick={closeCampaign} disabled={busy === "close"} className="flex-1 h-[50px] rounded-2xl bg-[#FEF2F2] text-[#B91C1C] flex items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-60">{busy === "close" && <ButtonSpinner />} Close campaign</button>
                </div>
              </>
            )}
            {sheet === "actions" && (
              <button type="button" onClick={() => !busy && setSheet(null)} className="h-[50px] rounded-2xl bg-white border border-[#E0E0E8] text-[15px] font-semibold">Cancel</button>
            )}
          </PopupPanel>
        </ModalPortal>
      )}</Presence>

      {/* AP-02: Full-screen pitch player */}
      <Presence>{playerIndex !== null && currentList[playerIndex] && (
        <ModalPortal>
          <PopupBackdrop className="fixed inset-0 z-[80] bg-[#0A0A0A] text-white flex flex-col justify-between overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", fontFamily: "'DM Sans', sans-serif" }}>
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between z-10 shrink-0">
              <button
                type="button"
                onClick={() => setPlayerIndex(null)}
                className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="h-7 px-3 rounded-lg bg-black/50 backdrop-blur-md flex items-center text-xs font-bold text-white">
                Pitch {playerIndex + 1} of {currentList.length}
              </div>
              <div className="w-9" />
            </div>

            {/* Pitch Body / Video */}
            <div className="flex-1 flex flex-col justify-center px-4 relative overflow-y-auto">
              {currentList[playerIndex].pitch_video_url || currentList[playerIndex].video_url ? (
                <div className="w-full max-h-[50vh] rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                  <video preload="metadata"
                    src={currentList[playerIndex].pitch_video_url || currentList[playerIndex].video_url}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full max-h-[50vh] object-contain"
                  />
                </div>
              ) : (
                <div className="p-6 rounded-3xl bg-white/10 backdrop-blur-md border border-white/10 text-center space-y-4 max-w-sm mx-auto">
                  <PersonPhoto
                    src={currentList[playerIndex].profile_photo_url || currentList[playerIndex].photo}
                    name={currentList[playerIndex].full_name || currentList[playerIndex].name}
                    alt=""
                    className="w-20 h-20 rounded-2xl object-cover mx-auto border-2 border-white/20 shadow-lg"
                    textClassName="text-2xl"
                  />
                  <div>
                    <h3 className="text-xl font-bold text-white">{currentList[playerIndex].full_name || currentList[playerIndex].name || "Creator"}</h3>
                    <p className="text-xs text-white/70 mt-1">
                      {currentList[playerIndex].category || "Creator"} · {currentList[playerIndex].city || "India"}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-left text-xs text-white/90 italic leading-relaxed">
                    &ldquo;{currentList[playerIndex].pitch_text || currentList[playerIndex].message || "Ready to create engaging content tailored to your brief."}&rdquo;
                  </div>
                  <div className="text-sm font-bold text-emerald-400">
                    Bid: {currentList[playerIndex].proposed_amount ? `₹${Number(currentList[playerIndex].proposed_amount).toLocaleString("en-IN")}` : "Bid not set"}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-black/80 backdrop-blur-md border-t border-white/10 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between text-xs text-white/70">
                <button
                  type="button"
                  disabled={playerIndex <= 0}
                  onClick={() => setPlayerIndex(playerIndex - 1)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  ← Previous
                </button>
                <span className="truncate max-w-[150px]">{currentList[playerIndex].full_name || currentList[playerIndex].name}</span>
                <button
                  type="button"
                  disabled={playerIndex >= currentList.length - 1}
                  onClick={() => setPlayerIndex(playerIndex + 1)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  Next →
                </button>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const item = currentList[playerIndex];
                    setPlayerIndex(null);
                    onReject?.(item);
                  }}
                  className="h-11 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <X size={15} /> Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const item = currentList[playerIndex];
                    setPlayerIndex(null);
                    onShortlist?.(item);
                  }}
                  className="flex-1 h-11 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-purple-900/40"
                >
                  Shortlist &amp; Chat
                </button>
              </div>
            </div>
          </PopupBackdrop>
        </ModalPortal>
      )}</Presence>
    </div>
  );
}

function SheetRow({ icon, label, onClick, busy }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="h-[52px] flex items-center gap-3.5 border-b border-[#F0F0F4] text-left disabled:opacity-60">
      <span className="shrink-0">{busy ? <ButtonSpinner /> : icon}</span>
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  );
}

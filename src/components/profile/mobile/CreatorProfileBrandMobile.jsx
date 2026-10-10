import React from "react";
import { ChevronLeft, Share2, BadgeCheck, Bookmark, Send, Star } from "lucide-react";

// Session 30: Ravi's brand mobile design — EX-04 creator profile (brand viewing a creator).
// UI ONLY: no server calls here. CreatorPublicView.jsx loads the profile and passes handlers.
// Only real values: rating shows only when reviews exist, rate-card rows only when a rate is set,
// stats only when the profile has them. No generated numbers.

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};
const compact = (v) => {
  const x = n(v);
  if (x === null) return null;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(x >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(x));
};
const inr = (v) => `₹${Number(v).toLocaleString("en-IN")}`;

export function rateCardRows(c) {
  const rc = c?.rate_card || {};
  return [
    { key: "reel", label: "Instagram Reel", hint: "Reel post", value: n(c?.rate_reel || c?.reel_rate || rc.reels || rc.reel) },
    { key: "story", label: "Instagram Story", hint: "Story", value: n(c?.rate_story || c?.story_rate || rc.stories || rc.story) },
    { key: "yt", label: "YouTube video", hint: "Integration", value: n(c?.rate_yt_video || c?.youtube_video_rate || rc.yt_video || rc.youtube_integration) },
    { key: "ugc", label: "UGC video", hint: "No post · you get the file", value: n(c?.rate_ugc || rc.ugc || rc.ugc_video) },
  ].filter((r) => r.value !== null);
}

export default function CreatorProfileBrandMobile({ creator: c, reviews = [], isSaved, onBack, onShare, onSave, onInvite, canInvite }) {
  const name = c?.name || c?.full_name || "Creator";
  const photo = c?.photo || c?.profile_photo_url || c?.picture || null;
  const cover = c?.cover_image || null;
  const handle = c?.instagram_handle ? `@${String(c.instagram_handle).replace(/^@/, "")}` : null;
  const place = c?.city || c?.state || null;
  const avg = reviews.length ? (reviews.reduce((a, r) => a + Number(r.rating || r.overall_rating || 0), 0) / reviews.length) : null;
  const collabs = n(c?.completed_collabs || c?.total_collabs || c?.collabs_count);
  const cats = [c?.category, ...(Array.isArray(c?.sub_categories) ? c.sub_categories : [])].filter(Boolean).slice(0, 4);
  const followers = compact(c?.follower_count || c?.followers_instagram || c?.ig_followers);
  const reach = compact(c?.avg_views_30d);
  const er = n(c?.engagement_rate);
  const stats = [
    followers && { v: followers, l: "Followers" },
    reach && { v: reach, l: "Avg reach" },
    er && { v: `${Number(er).toFixed(1)}%`, l: "Engagement" },
  ].filter(Boolean);
  const rates = rateCardRows(c);
  const meta = [handle, place, avg !== null ? `★ ${avg.toFixed(1)}` : null, collabs ? `${collabs} collab${collabs === 1 ? "" : "s"}` : null].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#F4F4F8] text-[#0A0A0A] pb-32" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="creator-profile-brand-mobile">
      <div className="relative h-[230px] bg-[#2A2140] overflow-hidden">
        {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : photo ? <img src={photo} alt="" className="w-full h-full object-cover blur-md scale-110 opacity-70" /> : null}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/45 to-transparent px-3 flex justify-between" style={{ paddingTop: 10 /* Session 43: #root starts below the clock */, paddingBottom: 24 }}>
          <button type="button" onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-[13px] bg-white/90 flex items-center justify-center"><ChevronLeft size={18} /></button>
          <button type="button" onClick={onShare} aria-label="Share profile" className="w-10 h-10 rounded-[13px] bg-white/90 flex items-center justify-center"><Share2 size={18} /></button>
        </div>
      </div>

      <div className="px-4 -mt-10 relative">
        <div className="w-20 h-20 rounded-[24px] border-[3px] border-[#F4F4F8] bg-[#EFE6FF] overflow-hidden flex items-center justify-center text-2xl font-bold text-[#7C3AED]">
          {photo ? <img src={photo} alt={name} className="w-full h-full object-cover" /> : name.charAt(0).toUpperCase()}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <h1 className="text-[22px] font-bold tracking-[-.6px] truncate">{name}</h1>
          {(c?.verified || c?.is_verified || c?.kyc_verified) && <BadgeCheck size={18} color="#7C3AED" className="shrink-0" />}
        </div>
        {meta.length > 0 && (
          <div className="mt-0.5 text-[13px] text-[#6B7280] flex items-center gap-1 flex-wrap">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-1">{i > 0 && <span>·</span>}{m.startsWith("★") ? <><Star size={12} fill="#F59E0B" color="#F59E0B" />{m.slice(2)}</> : m}</span>
            ))}
          </div>
        )}
        {cats.length > 0 && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {cats.map((t) => <span key={t} className="h-7 px-2.5 rounded-lg bg-white border border-[#E6E6EE] text-xs font-semibold text-[#374151] flex items-center capitalize">{t}</span>)}
          </div>
        )}

        {stats.length > 0 && (
          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0,1fr))` }}>
            {stats.map((s) => (
              <div key={s.l} className="bg-white border border-[#E6E6EE] rounded-2xl p-3 min-w-0">
                <div className="text-lg font-bold">{s.v}</div>
                <div className="text-[11.5px] font-medium text-[#6B7280]">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {c?.bio && <p className="mt-4 text-[13.5px] leading-relaxed text-[#374151]">{c.bio}</p>}

        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[11.5px] font-bold tracking-[1px] uppercase text-[#6B7280]">Rate card</span>
        </div>
        <div className="mt-2 bg-white border border-[#E6E6EE] rounded-[20px] overflow-hidden">
          {rates.length === 0 ? (
            <div className="px-3.5 py-4 text-[13px] text-[#6B7280]">No rates listed yet — send an invite with your offer.</div>
          ) : rates.map((r, i) => (
            <div key={r.key} className={`flex items-center gap-3 px-3.5 py-3 ${i ? "border-t border-[#F0F0F4]" : ""}`}>
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{r.label}</div><div className="text-xs text-[#6B7280]">{r.hint}</div></div>
              <div className="text-[15px] font-bold">{inr(r.value)}</div>
            </div>
          ))}
        </div>

        {reviews.length > 0 && (
          <>
            <div className="mt-4 px-1 text-[11.5px] font-bold tracking-[1px] uppercase text-[#6B7280]">Brand reviews</div>
            <div className="mt-2 flex flex-col gap-2">
              {reviews.slice(0, 3).map((r, i) => (
                <div key={r.id || i} className="bg-white border border-[#E6E6EE] rounded-2xl px-3.5 py-3">
                  <div className="flex items-center gap-1 text-xs font-semibold"><Star size={12} fill="#F59E0B" color="#F59E0B" /> {Number(r.rating || r.overall_rating || 0).toFixed(1)}<span className="text-[#6B7280] font-normal truncate">· {r.brand_name || r.reviewer_name || "Brand"}</span></div>
                  {r.comment && <p className="mt-1 text-[13px] text-[#374151] line-clamp-3">{r.comment}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 z-40 bg-white border-t border-[#ECECF0] px-4 pt-3 flex gap-2.5 md:hidden" style={{ bottom: "calc(76px + env(safe-area-inset-bottom, 0px))", paddingBottom: 12 }}>
        <button type="button" onClick={onSave} className="h-[50px] px-4 rounded-2xl bg-white border border-[#E0E0E8] flex items-center justify-center gap-2 text-[15px] font-semibold">
          <Bookmark size={17} fill={isSaved ? "#7C3AED" : "none"} color={isSaved ? "#7C3AED" : "#0A0A0A"} /> {isSaved ? "Saved" : "Save"}
        </button>
        {canInvite && (
          <button type="button" onClick={onInvite} className="flex-1 h-[50px] rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center gap-2 text-[15px] font-semibold" style={{ boxShadow: "0 12px 22px -14px rgba(124,58,237,.9)" }}>
            <Send size={16} /> Invite to campaign
          </button>
        )}
      </div>
    </div>
  );
}

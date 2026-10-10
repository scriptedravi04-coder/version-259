import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  Building, MapPin, Globe, CheckCircle, ShieldCheck, Briefcase, Plus, 
  ExternalLink, Edit2, Share2, ArrowLeft, ChevronRight, Check
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";
import AgencyBadge from "../../components/common/AgencyBadge";
import { safeLower } from "../../utils/safeFormat";

export default function BrandPublicView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [profile, setProfile] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);

    async function fetchBrand() {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        let bData = null;

        // 1. Try API /brands/:id
        const res = await api.get(`brands/${id}`).catch(() => null);
        if (res?.data && !res.data.error) {
          bData = res.data;
        }

        // 2. Try Supabase fallback if needed
        if (!bData && supabase) {
          const { data } = await supabase
            .from("brand_profiles")
            .select("*")
            .or(`user_id.eq.${id},company_name.ilike.${id}`) // brand_profiles has no id column (session 35)
            .maybeSingle();
          if (data) bData = data;
        }

        if (!active) return;

        if (bData) {
          setProfile(bData);

          // Fetch active campaigns for this brand
          const targetUserId = bData.user_id || bData.id;
          if (supabase && targetUserId) {
            const { data: camps } = await supabase
              .from("campaigns")
              .select("*")
              .eq("brand_user_id", targetUserId);
            if (camps && active) {
              setCampaigns(camps.filter((c) => !c.closed_at));
            }
          } else {
            const campsRes = await api.get("campaigns").catch(() => null);
            if (campsRes?.data && active) {
              const list = Array.isArray(campsRes.data) ? campsRes.data : [];
              const filtered = list.filter(
                (c) =>
                  c.brand_user_id === targetUserId ||
                  (bData.company_name &&
                    c.brand_name?.toLowerCase().includes(bData.company_name.toLowerCase()))
              );
              setCampaigns(filtered.filter((c) => !c.closed_at));
            }
          }
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error("Error fetching public brand:", err);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchBrand();

    return () => {
      active = false;
    };
  }, [id]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: profile?.company_name || "Brand Profile",
          text: `Check out ${profile?.company_name || "this brand"} on Ybex`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied!");
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Could not share the link.");
    }
  };

  const isOwner = Boolean(
    user && (user.user_id === profile?.user_id || user.id === profile?.user_id)
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center py-12 px-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center animate-pulse">
          <Building className="text-[#7C3AED] w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-slate-500 mt-4">Loading brand profile…</p>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Building className="text-slate-400 w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-4">Brand not found</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          The brand profile you're looking for doesn't exist or has been removed.
        </p>
        <Link
          to="/explore"
          className="mt-6 px-5 py-2.5 rounded-xl bg-[#7C3AED] text-white font-bold text-sm hover:bg-[#6D28D9] transition"
        >
          Explore creators & brands
        </Link>
      </div>
    );
  }

  const brandName = profile.company_name || "Brand Partner";
  const brandInitials = brandName.charAt(0).toUpperCase();
  const isVerified = Boolean(profile.verified);
  const location = [profile.city, profile.state].filter(Boolean).join(", ") || profile.location || "India";
  const metaLine = [profile.industry, location].filter(Boolean).join(" · ");
  const description = profile.description ? profile.description.replace(/\[cover_image\]:.*/g, "").trim() : "";

  // Mobile layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#F4F4F8] flex flex-col pb-24">
        {/* Mobile Header Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 active:scale-95 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="font-bold text-sm text-slate-900 truncate max-w-[200px] font-display">
            {brandName}
          </div>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 active:scale-95 transition"
          >
            <Share2 size={16} />
          </button>
        </header>

        {/* Cover + Avatar Header */}
        <div className="relative">
          <div className="h-28 bg-slate-200 overflow-hidden">
            {profile.cover_image && (
              <img src={profile.cover_image} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="px-5 -mt-8 relative">
            <div className="w-16 h-16 rounded-2xl border-4 border-white bg-white shadow-sm overflow-hidden flex items-center justify-center text-xl font-bold text-slate-900">
              {profile.logo ? (
                <img src={profile.logo} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-black text-xl text-[#7C3AED] font-display">{brandInitials}</span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{brandName}</h1>
              {isVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700">
                  <Check size={10} strokeWidth={3} /> Verified
                </span>
              )}
              {profile.is_agency && <AgencyBadge size="sm" />}
            </div>

            {metaLine && <p className="text-xs text-slate-600 mt-1">{metaLine}</p>}

            {profile.website && (
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#7C3AED] mt-1.5 hover:underline"
              >
                <Globe size={12} /> {profile.website.replace(/^https?:\/\//, "")} <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-5 pt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleShare}
            className="h-11 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-2xs"
          >
            <Share2 size={13} /> Share Profile
          </button>
          {isOwner ? (
            <button
              type="button"
              onClick={() => navigate("/brand/settings")}
              className="h-11 rounded-xl bg-[#7C3AED] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-xs"
            >
              <Edit2 size={13} /> Edit Profile
            </button>
          ) : (
            <Link
              to="/campaigns"
              className="h-11 rounded-xl bg-[#7C3AED] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-xs"
            >
              <Briefcase size={13} /> View Briefs
            </Link>
          )}
        </div>

        {/* About Section */}
        <div className="px-5 pt-5">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2 font-display">About us</h3>
            {description ? (
              <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">No description provided yet.</p>
            )}
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="px-5 pt-4">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2.5 px-1 font-display">
            Active Campaigns ({campaigns.length})
          </h3>
          {campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl p-5 text-center border border-slate-200/80 shadow-2xs">
              <Briefcase size={24} className="text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-medium mt-2">No active campaigns right now</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {campaigns.map((c) => (
                <Link
                  key={c.id || c.campaign_id}
                  to={`/campaigns/${c.id || c.campaign_id}`}
                  className="block bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs hover:border-purple-300 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 leading-snug font-display">{c.title}</h4>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 uppercase">
                      Open
                    </span>
                  </div>
                  {c.deliverables && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{c.deliverables}</p>
                  )}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-bold text-[#7C3AED]">
                      {c.budget_min ? `₹${Number(c.budget_min).toLocaleString("en-IN")}` : "Flexible"}
                      {c.budget_max ? ` – ₹${Number(c.budget_max).toLocaleString("en-IN")}` : ""}
                    </span>
                    <span className="text-slate-400 font-medium flex items-center gap-0.5">
                      View brief <ChevronRight size={13} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="w-full max-w-5xl mx-auto py-6 px-4 md:px-8 space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
        >
          <Share2 size={13} /> Share Profile
        </button>
      </div>

      {/* Hero Cover Card */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="h-44 md:h-56 bg-slate-200 relative overflow-hidden">
          {profile.cover_image && (
            <img src={profile.cover_image} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="px-6 md:px-8 pb-6 pt-0 relative">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 -mt-12 md:-mt-14 mb-4">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
              {profile.logo ? (
                <img src={profile.logo} alt="" className="w-full h-full object-contain p-1" />
              ) : (
                <span className="font-black text-3xl text-[#7C3AED] font-display">{brandInitials}</span>
              )}
            </div>
            {isOwner && (
              <Link
                to="/brand/settings"
                className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center gap-2 transition"
              >
                <Edit2 size={13} /> Edit Company Info
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 font-display">{brandName}</h1>
            {isVerified && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700">
                <CheckCircle size={13} /> Verified Brand
              </span>
            )}
            {profile.is_agency && <AgencyBadge size="md" />}
          </div>

          <p className="text-sm text-slate-600 font-medium mt-1 flex items-center gap-2 flex-wrap">
            {profile.industry && <span>{profile.industry}</span>}
            {location && (
              <>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <MapPin size={13} /> {location}
                </span>
              </>
            )}
            {profile.team_size && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{profile.team_size} team</span>
              </>
            )}
          </p>

          {profile.website && (
            <div className="mt-2.5">
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#7C3AED] hover:underline"
              >
                <Globe size={13} /> {profile.website} <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: About */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-base font-black text-slate-900 font-display">About the Brand</h2>
            {description ? (
              <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">No description provided yet.</p>
            )}
          </div>

          {/* Active Campaigns */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 font-display">
                Open Sponsorship Briefs ({campaigns.length})
              </h2>
            </div>
            {campaigns.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                No active campaign briefs at this time.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <Link
                    key={c.id || c.campaign_id}
                    to={`/campaigns/${c.id || c.campaign_id}`}
                    className="py-4 block hover:bg-slate-50/70 -mx-3 px-3 rounded-2xl transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm font-display">{c.title}</h3>
                        {c.deliverables && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{c.deliverables}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-[#7C3AED]">
                        {c.budget_min ? `₹${Number(c.budget_min).toLocaleString("en-IN")}` : "Flexible"}
                        {c.budget_max ? ` – ₹${Number(c.budget_max).toLocaleString("en-IN")}` : ""}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Fast Overview */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Company Highlights</h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Verification</span>
                <span className={`font-bold ${isVerified ? "text-emerald-600" : "text-amber-600"}`}>
                  {isVerified ? "KYC Approved" : "Pending Verification"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Secure Payment Hold Security</span>
                <span className="font-bold text-emerald-600">100% Protected</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Live Briefs</span>
                <span className="font-bold text-slate-900">{campaigns.length} campaigns</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

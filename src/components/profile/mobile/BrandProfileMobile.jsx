import React, { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Settings,
  Package,
  Globe,
  Shield,
  ShieldAlert,
  CreditCard,
  FileText,
  MonitorSmartphone,
  HelpCircle,
  Check,
  CheckCircle,
  Building,
  User,
  Share2,
  Edit2,
  MapPin,
  Briefcase,
  Gift,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../lib/api";
import { useAuth } from "../../../contexts/AuthContext";
import ModalPortal from "../../../components/common/ModalPortal";

import useBrandProfileData, { toList } from "./brand/useBrandProfileData";
import PublicProfileScreen from "./brand/PublicProfileScreen";
import CompanyDetailsScreen from "./brand/CompanyDetailsScreen";
import PreferencesScreen from "./brand/PreferencesScreen";
import ContactScreen from "./brand/ContactScreen";
import KycScreen from "./brand/KycScreen";
import LegalScreen from "./brand/LegalScreen";
import PaymentsScreen from "./brand/PaymentsScreen";
import SessionsScreen from "./brand/SessionsScreen";
import ReferScreen from "./brand/ReferScreen";
import AccountScreen from "./brand/AccountScreen";
import { referralRewardText } from "../../../utils/referral";
import HelpScreen from "./brand/HelpScreen";

import { Presence, PopupBackdrop, PopupPanel } from "../../common/Popup";
import { AGENCY_TYPES } from "../../../constants/agencyTypes";
import { publicOrigin } from "../../../lib/publicUrl";
// Brand Profile on mobile — the hub (mockup screen 1a) plus the ten push-route
// sub-screens (1b–1k), driven off a single `section` query param the same way
// CreatorMobileProfile.jsx drives its own sub-views. No desktop component is
// modified; BrandProfile.jsx and BrandSettings.jsx just mount this behind
// useIsMobile().

const SECTIONS = [
  "public", "company", "preferences", "contact", "kyc",
  "legal", "payments", "sessions", "refer", "help",
];

const ESCROW_HELD_STATUSES = [
  "deposited", "held", "in_escrow", "video_submitted", "pending", "escrow_held", "active", "approved",
];


export default function BrandProfileMobile({ brandData = null, parentLoading = false, campaigns: campaignsProp = null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAgencySheet, setShowAgencySheet] = useState(false);
  const [selectedAgencyType, setSelectedAgencyType] = useState(AGENCY_TYPES[0]);
  const [savingAgency, setSavingAgency] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      toast.error("Error signing out");
    }
  };

  const rawSection = searchParams.get("section") || searchParams.get("subscreen");
  const section = SECTIONS.includes(rawSection) ? rawSection : null;

  const goTo = useCallback((next) => {
    if (next) setSearchParams({ section: next });
    else setSearchParams({});
  }, [setSearchParams]);

  const goHub = useCallback(() => goTo(null), [goTo]);

  // BottomNav fires this when the account tab is tapped, so re-tapping "Brand"
  // comes back to the hub instead of leaving a sub-screen open.
  useEffect(() => {
    const handleReset = () => goHub();
    window.addEventListener("reset-mobile-profile-hub", handleReset);
    return () => window.removeEventListener("reset-mobile-profile-hub", handleReset);
  }, [goHub]);

  // Shared brand profile row + save, mirroring BrandSettings.jsx.
  const { profile, loading: profileLoading, saving, save, uploadImage } =
    useBrandProfileData(parentLoading ? null : brandData);

  // Live KYC — GET verifications/me, the same source BrandKyc.jsx uses. There is no
  // kyc_status column on brand_profiles to read instead.
  const [kyc, setKyc] = useState(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [sessionCount, setSessionCount] = useState(null);
  const [escrowAmount, setEscrowAmount] = useState(null);
  const [campaigns, setCampaigns] = useState(campaignsProp || []);

  useEffect(() => {
    if (Array.isArray(campaignsProp)) setCampaigns(campaignsProp);
  }, [campaignsProp]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get("verifications/me").catch(() => ({ data: null }));
        if (!cancelled) setKyc(data && data.status !== "NOT_SUBMITTED" ? data : null);
      } catch (e) {
        console.warn("Error fetching brand KYC status:", e);
      } finally {
        if (!cancelled) setKycLoading(false);
      }
    })();

    (async () => {
      try {
        const { data } = await api.get("sessions", { bypassCache: true }).catch(() => ({ data: null }));
        if (!cancelled && Array.isArray(data)) setSessionCount(data.length);
      } catch (e) {
        console.warn("Error fetching sessions:", e);
      }
    })();

    (async () => {
      try {
        const { data } = await api.get("escrow-transactions").catch(() => ({ data: null }));
        if (!cancelled && Array.isArray(data)) {
          const active = data
            .filter((t) => ESCROW_HELD_STATUSES.includes((t.status || "").toLowerCase()))
            .reduce((acc, t) => acc + (Number(t.amount || t.gross_amount) || 0), 0);
          setEscrowAmount(active);
        }
      } catch (e) {
        console.warn("Error fetching escrow totals:", e);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // When mounted from BrandSettings (/brand/account) there's no campaigns prop, so
  // fetch the same list BrandProfile.jsx fetches.
  useEffect(() => {
    if (Array.isArray(campaignsProp) || !user?.user_id) return;
    let cancelled = false;
    (async () => {
      try {
        // Session 33: the brand's own list from the server (team members included), not a
        // browser read of the campaigns table + every brand's public list.
        const res = await api.get("campaigns?mine=true").catch(() => null);
        if (!cancelled && Array.isArray(res?.data)) setCampaigns(res.data);
      } catch (e) {
        console.warn("Error fetching campaigns:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [campaignsProp, user?.user_id]);

  // Session 33: the reward comes from the admin's referral settings (GET /referral/stats →
  // reward_amount). It used to say ₹1,000 here whatever the admin set; no amount → no number.
  const [refReward, setRefReward] = useState("");
  useEffect(() => {
    let alive = true;
    api.get("referral/stats").then(({ data }) => { if (alive) setRefReward(referralRewardText(data) || ""); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // ---- Sub-screens (1b–1k) ----
  // The editable screens hold their own draft state, so they're keyed on load
  // completion to pick up the fetched row instead of keeping an empty draft.
  const formKey = profileLoading ? "loading" : "ready";

  if (section === "public") {
    return <PublicProfileScreen onBack={goHub} profile={profile} loading={profileLoading} campaigns={campaigns} kyc={kyc} />;
  }
  if (section === "company") {
    return <CompanyDetailsScreen key={formKey} onBack={goHub} profile={profile} saving={saving} onSave={save} uploadImage={uploadImage} />;
  }
  if (section === "preferences") {
    return <PreferencesScreen key={formKey} onBack={goHub} profile={profile} saving={saving} onSave={save} />;
  }
  if (section === "contact") {
    return <ContactScreen key={formKey} onBack={goHub} profile={profile} saving={saving} onSave={save} />;
  }
  if (section === "kyc") return <KycScreen onBack={goHub} kyc={kyc} loading={kycLoading} />;
  if (section === "legal") return <LegalScreen onBack={goHub} />;
  if (section === "payments") return <PaymentsScreen onBack={goHub} />;
  if (section === "sessions") return <SessionsScreen onBack={goHub} />;
  if (section === "account") return <AccountScreen onBack={goHub} onOpen={goTo} onDeleted={logout} />;
  if (section === "refer") return <ReferScreen onBack={goHub} />;
  if (section === "help") return <HelpScreen onBack={goHub} />;

  // ---- Hub (1a) ----
  const brand = {
    name: profile.company_name || "Your brand",
    initials: String(profile.company_name || "B").charAt(0).toUpperCase(),
    industry: profile.industry || "—",
    teamSize: profile.teamSize || "—",
    location: profile.location || "India",
    isAgency: Boolean(profile.is_agency),
    isProfileComplete: Boolean(profile.industry && profile.description),
    hasNiches: toList(profile.niches).length > 0,
    hasPoc: Boolean(profile.pocName || profile.pocPhone || profile.pocEmail),
  };

  const kycStatusColor = {
    approved: { bg: "#E9F7EE", text: "#1B7F45", label: "APPROVED" },
    pending: { bg: "#FEF3C7", text: "#92400E", label: "UNDER REVIEW" },
    under_review: { bg: "#FEF3C7", text: "#92400E", label: "UNDER REVIEW" },
    submitted: { bg: "#FEF3C7", text: "#92400E", label: "UNDER REVIEW" },
    rejected: { bg: "#FEE2E2", text: "#DC2626", label: "REJECTED" },
  };
  const normalizedKyc = (kyc?.status || "").toLowerCase();
  const kycBadge = kycStatusColor[normalizedKyc] || { bg: "#F1F5F9", text: "#475569", label: "NOT STARTED" };
  const kycVerified = normalizedKyc === "approved";
  // Session 41 (Ravi): KYC sent and waiting for admin → "Under review", never "Finish KYC".
  const kycInReview = ["pending", "under_review", "submitted"].includes(normalizedKyc);

  const escrowDisplay = escrowAmount === null ? "…" : `₹${Number(escrowAmount).toLocaleString("en-IN")}`;

  const calculateBrandProfileStrength = () => {
    let score = 0;
    const tips = [];
    if (profile.company_name) score += 15;
    else tips.push("Add company name");
    if (profile.logo) score += 20;
    else tips.push("Upload company logo");
    if (profile.description) score += 15;
    else tips.push("Add company overview");
    if (profile.industry) score += 15;
    else tips.push("Select industry");
    if (brand.hasNiches) score += 15;
    else tips.push("Set campaign preferences");
    if (brand.hasPoc) score += 10;
    else tips.push("Add point of contact");
    if (kycVerified) score += 10;
    else tips.push("Complete KYC verification");

    const tip = tips.length > 0 ? `Next: ${tips[0]}` : "Your brand profile is fully completed and verified!";
    return { score: Math.min(100, score), tip };
  };

  const { score: profileStrength, tip: profileStrengthTip } = calculateBrandProfileStrength();

  const handleShareProfile = async () => {
    const shareUrl = `${publicOrigin()}/brand/${user?.parent_brand_id || user?.user_id || user?.id || ''}`; // team members share the brand, not themselves
    if (navigator.share) {
      try {
        await navigator.share({
          title: brand.name,
          text: `Check out ${brand.name} on Ybex`,
          url: shareUrl,
        });
        return;
      } catch (e) {
        // user closed share dialog
      }
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Profile link copied to clipboard!");
      } catch (e) {
        toast.error("Failed to copy link");
      }
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-32">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 font-display tracking-tight">Company Profile</h1>
          <p className="text-[11px] font-bold text-slate-400">Settings &amp; Brand Hub</p>
        </div>
      </header>

      <div className="px-5 py-4 space-y-6">
        {/* Open Identity Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative w-18 h-18 rounded-2xl border-2 border-purple-200 bg-slate-100 overflow-hidden shrink-0 shadow-xs flex items-center justify-center">
              {profile.logo ? (
                <img
                  src={profile.logo}
                  alt={brand.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-black text-2xl text-[#7C3AED] font-display">
                  {brand.initials}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-lg font-black text-slate-900 truncate font-display">
                  {brand.name}
                </h2>
                {!kycLoading && (
                  <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-wider uppercase ${kycVerified ? 'bg-green-100 text-green-700' : kycInReview ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>
                    {kycVerified ? "KYC Approved" : kycInReview ? "KYC under review" : "KYC not done"}
                  </span>
                )}
                {brand.isAgency && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-wider uppercase bg-purple-100 text-purple-700">
                    AGENCY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 font-bold truncate mt-0.5">
                {brand.industry} · {brand.teamSize}
              </p>
              <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-1 truncate">
                <MapPin size={12} className="shrink-0 text-slate-400" />
                {brand.location}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => goTo("company")}
              className="py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
            >
              <Edit2 size={13} /> Edit Company Info
            </button>
            <button
              type="button"
              onClick={() => goTo("public")}
              className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
            >
              Public Profile <ExternalLink size={12} />
            </button>
          </div>
        </div>

        {/* KYC under review: calm note + see what was sent (no "Finish KYC" — it is done). */}
        {!kycLoading && kycInReview && (
          <button
            type="button"
            onClick={() => goTo("kyc")}
            data-testid="brand-kyc-under-review"
            className="w-full text-left bg-amber-50/60 rounded-2xl p-4 flex items-start gap-3 active:scale-[0.99] transition-transform"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <Shield size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">KYC under review</h4>
              <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-0.5">
                We're checking your details. You'll get a notification when your Verified Brand badge is on.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold text-[#7C3AED]">View submitted details →</span>
            </div>
          </button>
        )}

        {/* KYC Verification Banner (KYC not sent yet, or rejected) */}
        {!kycLoading && !kycVerified && !kycInReview && (
          <div className="bg-amber-50/60 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-[#E8552F] flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Finish KYC for Verified Brand Status
                </h4>
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-0.5">
                  Verify business PAN and GST to unlock the verified badge, payments and higher creator applications.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => goTo("kyc")}
              className="w-full py-2.5 bg-[#E8552F] hover:bg-[#D44723] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
            >
              <Shield size={13} /> {normalizedKyc === "rejected" ? "Re-submit KYC" : "Start KYC Verification"}
            </button>
          </div>
        )}

        {/* Agency Banner (only when not yet an agency) */}
        {!brand.isAgency && (
          <div className="bg-purple-50/60 rounded-2xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-[#7C3AED] flex items-center justify-center shrink-0 mt-0.5">
                <Package size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-slate-900">Are you an agency?</h4>
                  <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded">
                    NEW
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                  Claim an agency badge and manage multiple brand profiles from one login.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAgencySheet(true)}
              className="text-xs font-bold text-[#7C3AED] hover:text-[#6D28D9] flex items-center gap-1 pt-1 cursor-pointer"
            >
              Claim your agency badge <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* GROUP 1: COMPANY DETAILS */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
            Company Details
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => goTo("company")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-[#7C3AED] flex items-center justify-center shrink-0">
                  <Building size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Company info</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => goTo("preferences")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Globe size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Campaign preferences</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => goTo("contact")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <User size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Point of contact</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* GROUP 2: CAMPAIGNS & ESCROW */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
            Campaigns &amp; Payment Hold
          </span>
          <div className="divide-y divide-slate-100">
            <Link
              to="/brand/campaigns"
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Briefcase size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Active campaigns</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </Link>

            <button
              type="button"
              onClick={() => goTo("payments")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <CreditCard size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Payouts</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* GROUP 3: COMPLIANCE & SECURITY */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
            Compliance &amp; Security
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => goTo("kyc")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Shield size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">KYC compliance</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => goTo("account")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Settings size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Account</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* GROUP 4: ACCOUNT & SUPPORT */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
            Account &amp; Support
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => goTo("refer")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                  <Gift size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Refer &amp; earn</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => goTo("help")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                  <HelpCircle size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Help centre</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setShowLogoutModal(true)}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-rose-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <LogOut size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-rose-600">Log out</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Refer Banner Promo */}
        <button
          type="button"
          onClick={() => goTo("refer")}
          className="w-full rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white p-4 flex items-center justify-between shadow-xs hover:opacity-95 transition-opacity text-left active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shrink-0">
              🎁
            </div>
            <div>
              <h4 className="font-black text-xs text-white">{refReward ? `Refer & earn — get ${refReward}` : "Refer & earn"}</h4>
              <p className="text-[11px] text-white/80 font-medium">Credited when their first campaign completes.</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-white/70 shrink-0" />
        </button>

        {/* ST-06: Log Out Sheet */}
        <Presence>{showLogoutModal && (
          <ModalPortal>
            <PopupBackdrop
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center"
              onClick={() => setShowLogoutModal(false)}
            >
              <PopupPanel kind="sheet" onClose={() => setShowLogoutModal(false)}
                className="w-full max-w-md bg-white rounded-t-[26px] p-5 pb-8 space-y-4 shadow-xl"
                style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto" />
                <div>
                  <h3 className="text-lg font-bold text-slate-900 font-display">Log out of Ybex?</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    You'll need your phone number and an OTP to sign back in.
                  </p>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowLogoutModal(false)}
                    className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors flex items-center justify-center cursor-pointer active:scale-[0.99]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-sm rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <LogOut size={16} /> Log out
                  </button>
                </div>
              </PopupPanel>
            </PopupBackdrop>
          </ModalPortal>
        )}</Presence>

        {/* PR-01: Agency Claim Sheet */}
        <Presence>{showAgencySheet && (
          <ModalPortal>
            <PopupBackdrop
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center"
              onClick={() => !savingAgency && setShowAgencySheet(false)}
            >
              <PopupPanel kind="sheet" onClose={() => !savingAgency && setShowAgencySheet(false)}
                className="w-full max-w-md bg-white rounded-t-[26px] p-5 pb-8 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto"
                style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 font-display">Claim Agency Badge</h3>
                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded">
                      AGENCY
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Select your agency model. An Agency badge will appear on your profile and campaign briefs.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  {AGENCY_TYPES.map((type) => {
                    const isSelected = selectedAgencyType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedAgencyType(type)}
                        className={`w-full p-3.5 rounded-2xl text-left border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "bg-purple-50/70 border-[#7C3AED] text-[#7C3AED]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>{type}</span>
                        {isSelected && <Check size={16} className="text-[#7C3AED]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingAgency}
                    onClick={() => setShowAgencySheet(false)}
                    className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors flex items-center justify-center cursor-pointer active:scale-[0.99] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingAgency}
                    onClick={async () => {
                      try {
                        setSavingAgency(true);
                        await save({ is_agency: true, agency_type: selectedAgencyType });
                        setShowAgencySheet(false);
                        toast.success("Agency badge claimed!");
                      } catch (err) {
                        toast.error("Failed to update agency status");
                      } finally {
                        setSavingAgency(false);
                      }
                    }}
                    className="flex-1 py-3.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-sm rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                  >
                    {savingAgency ? "Saving…" : "Claim Badge"}
                  </button>
                </div>
              </PopupPanel>
            </PopupBackdrop>
          </ModalPortal>
        )}</Presence>
      </div>
    </div>
  );
}

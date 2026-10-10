import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Send, CreditCard, Gift, Bell, MessageCircle, CheckCircle2, ChevronRight, Clock, FileText, Calendar, ShieldCheck, User, Plus, RefreshCw, AlertCircle, ArrowRight, X, Building, Package, Video, Tag, Share2, Check, Phone, Search, Mail, Eye, Users } from "lucide-react";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import PullToRefresh from "../../components/common/PullToRefresh";
import { trustedBrands } from "../../lib/constants/trustedBrands";
import { getCampaignStats, getCampaignAvatars } from "../../utils/campaignStats";
import { realAppliedCount, realViewCount } from "../../utils/campaignStatsForViewer";
import { draftSet } from "../../lib/userDraft";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { snapshotGet, hasSnapshots } from "../../lib/apiSnapshot";

// Session 42: inside the feed loader `api` is either the real client or the saved-answers one.
const liveApi = api;
const SNAPSHOT_API = { get: snapshotGet };

// Session 42: home paints from saved answers when these exist (src/lib/apiSnapshot.js).
const BRAND_HOME_SNAPSHOT_URLS = ["brands/me", "campaigns?mine=true", "ugc/orders/brand"];

// Rotating Trust & Value propositions for Brand (Short, Cute, Centered)
const BRAND_TRUST_ITEMS = [
  { title: "100% KYC-verified creators", text: "payments in a secure payment hold" },
  { title: "Secure Payment Hold Protected Deals", text: "funds released on approval" },
  { title: "Zero Platform Fee", text: "transparent direct pricing" },
  { title: "Legally Binding Contracts", text: "built-in IP copyright deed" },
  { title: "Guaranteed SLA", text: "on-time video deliverables" },
];

// Default Hero Banners for Brand Home when CMS banners are empty
const DEFAULT_BRAND_BANNERS = [
  {
    id: "brand-banner-1",
    title: "10k+ Pre-vetted UGC Creators",
    subtitle: "Source authentic video ads with secure payment protection",
    image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop",
    link: "/brand/campaigns/create",
    badge: "SECURE PAYMENT HOLD SECURED",
  },
  {
    id: "brand-banner-2",
    title: "Instant UGC Video Deliverables",
    subtitle: "Receive raw 4K footage & ad hooks in under 48 hours",
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop",
    link: "/brand/ugc/post",
    badge: "FAST TURNAROUND",
  },
  {
    id: "brand-banner-3",
    title: "Invite Verified Creators Directly",
    subtitle: "Browse top-performing niches in Fashion, Tech & D2C",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop",
    link: "/brand/discover",
    badge: "DIRECT PITCH",
  },
];

// High-converting Campaign Templates
const CAMPAIGN_TEMPLATES = [
  {
    id: "unboxing-review",
    title: "Product unboxing & honest review",
    deliverableSummary: "1 Reel + 2 Stories",
    icon: Package,
    iconBg: "#FFF1E6",
    iconColor: "#EA580C",
    deliverablesText: "1 Instagram Reel (30-60s) + 2 Follow-up Stories with sticker link",
    requirementsText:
      "Creator will receive the product sample and produce an authentic unboxing video with honest review, showcasing product packaging, texture, and real application. Clear call-to-action to check link in bio.",
    budget: "6000",
    category: "Lifestyle & D2C",
  },
  {
    id: "festive-discount",
    title: "Festive discount announcement",
    deliverableSummary: "Scripted hook + CTA",
    icon: Tag,
    iconBg: "#FFF0F5",
    iconColor: "#DB2777",
    deliverablesText: "1 High-energy Promo Reel (15-30s) with exclusive coupon code pinned",
    requirementsText:
      "High-energy hook announcing limited-time festive discount and exclusive coupon code. Highlight key product benefits and urge followers to shop before the festive offer ends.",
    budget: "7500",
    category: "Festive & E-Commerce",
  },
  {
    id: "aesthetic-broll",
    title: "Aesthetic UGC B-roll pack",
    deliverableSummary: "Raw 4K footage for ads",
    icon: Video,
    iconBg: "#E0F2FE",
    iconColor: "#0284C7",
    deliverablesText: "5 Raw B-Roll Video Clips (4K 60fps) + 3 Hook variations",
    requirementsText:
      "High aesthetic visual clips in 4K resolution. Clean background, natural lighting, macro product shots, aesthetic handling, and 3 hook variations for Meta performance ads.",
    budget: "8500",
    category: "Performance Ads",
  },
];



// Live Social Proof feed events
const SOCIAL_PROOF_EVENTS = [
  { text: "Neha S. closed a deal with Sugar Cosmetics", amount: "₹25,000", tag: "18 today" },
  { text: "Rohan M. uploaded 4K UGC Deliverables", amount: "₹18,500", tag: "Secure payment hold secured" },
  { text: "Kavita R. approved 3 video drafts for Mamaearth", amount: "₹34,000", tag: "12 min ago" },
  { text: "Pooja V. completed unboxing reel for Minimalist", amount: "₹32,000", tag: "Just now" },
];

export default function BrandHomeMobile({ user }) {
  const navigate = useNavigate();

  // Loading and sync states
  const [loading, setLoading] = useState(true);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Data states
  const [banners, setBanners] = useState(DEFAULT_BRAND_BANNERS);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);
  const [brandProfile, setBrandProfile] = useState(null);
  const [kycStatus, setKycStatus] = useState(null); // 'approved', 'pending', null
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadChatMessages, setUnreadChatMessages] = useState(0);

  // Active brief and campaign data
  const [campaigns, setCampaigns] = useState([]);
  const [ugcOrders, setUgcOrders] = useState([]);
  const [activeBriefs, setActiveBriefs] = useState([]);

  // Stats
  const [stats, setStats] = useState({
    activeCollabs: 0,
    applicantsCount: 0,
    totalSpent: 0,
    totalCampaigns: 0,
    draftsToReviewCount: 0,
    liveLinksToApproveCount: 0,
    counteredPitchesCount: 0,
    sampleDeliveriesCount: 0,
  });

  // Featured Creators
  const [featuredCreators, setFeaturedCreators] = useState([]);

  // Carousel & Rotator states
  const [onboardingStepIdx, setOnboardingStepIdx] = useState(0);
  const [socialProofIdx, setSocialProofIdx] = useState(0);
  const [trustIdx, setTrustIdx] = useState(0);

  // Carousel touch handlers
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const handleTouchStart = (e) => {
    if (e.targetTouches?.[0]) {
      touchStartX.current = e.targetTouches[0].clientX;
    }
  };
  const handleTouchEnd = (e) => {
    if (e.changedTouches?.[0]) {
      touchEndX.current = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX.current;
      if (diff > 45 && banners.length > 1) {
        setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
      } else if (diff < -45 && banners.length > 1) {
        setCurrentBannerIdx((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }
  };

  // Modals
  const [isScheduleCallModalOpen, setIsScheduleCallModalOpen] = useState(false);
  const [scheduleCallDate, setScheduleCallDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [scheduleCallTime, setScheduleCallTime] = useState("02:30 PM");
  const [scheduleCallNote, setScheduleCallNote] = useState("");
  const [scheduleCallSubmitting, setScheduleCallSubmitting] = useState(false);

  // Update clock every minute for relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Banner rotation interval (every 4s)
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Social proof ticker rotation (every 4s)
  useEffect(() => {
    const interval = setInterval(() => {
      setSocialProofIdx((prev) => (SOCIAL_PROOF_EVENTS.length ? (prev + 1) % SOCIAL_PROOF_EVENTS.length : 0));
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Onboarding tasks rotation (every 4s). Session 41: the card now slides; a swipe moves it by hand
  // and pauses the auto-slide for a few seconds so it doesn't jump under the finger.
  const importantPauseUntil = useRef(0);
  const [importantDir, setImportantDir] = useState(1);
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() < importantPauseUntil.current) return;
      setImportantDir(1);
      setOnboardingStepIdx((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);
  const swipeImportant = (step) => {
    importantPauseUntil.current = Date.now() + 7000;
    setImportantDir(step);
    setOnboardingStepIdx((prev) => (prev + step + 3) % 3);
  };

  // Rotating trust line timer (every 3.5s like CreatorHomeMobile)
  useEffect(() => {
    const timer = setInterval(() => {
      setTrustIdx((prev) => (prev + 1) % BRAND_TRUST_ITEMS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  // Main data loader function
  const fetchBrandFeedData = useCallback(
    async (isBackground = false, mode = "network") => {
      // Session 42: "snapshot" paints the last saved answers at once; "quiet" refreshes behind them.
      const api = mode === "snapshot" ? SNAPSHOT_API : liveApi;
      if (mode === "network") {
        if (!isBackground) setLoading(true);
        else setIsRefreshingFeed(true);
      }

      const brandUserId = user?.parent_brand_id || user?.user_id || user?.id;

      try {
        const results = await Promise.allSettled([
          // 0: Brand Profile
          // Session 41: there is no GET /brands/profile (only POST) — this always failed, so the
          // header showed initials instead of the logo uploaded in onboarding.
          api.get("brands/me").catch(() => null),
          // 1: Brand KYC
          // Through the server (session 22): no direct `brand_kyc` read from the browser.
          api.get("/verifications/me").then((r) => ({ data: r?.data?.status ? { status: r.data.status } : null })).catch(() => ({ data: null })),
          // 2: Campaigns
          api.get("campaigns?mine=true").catch(() => ({ data: [] })),
          // 3: UGC Orders
          api.get("ugc/orders/brand").catch(() => ({ data: [] })),
          // 4: Banners (Admin Panel Real Banners)
          api.get("banners?audience=brand").catch(() => ({ data: [] })),
          // 5: Chat Threads
          api.get("chat/v2/threads").catch(() => ({ data: [] })),
          // 6: Notifications count
          // Through the server (session 22): no direct `notifications` read from the browser.
          api.get("/notifications?unread=true").then((r) => ({ count: Array.isArray(r?.data) ? r.data.filter((n) => !n.read && !n.is_read).length : 0 })).catch(() => ({ count: 0 })),
          // 7: Transactions / Spent
          api.get("transactions").catch(() => ({ data: [] })),
          // 8: Creators Explore sample
          api.get("creators/explore").catch(() => ({ data: [] })),
          // 9: UGC Briefs posted by Brand
          api.get("ugc/briefs/my").catch(() => ({ data: [] })),
        ]);

        // Process Brand Profile
        if (results[0].status === "fulfilled" && results[0].value?.data) {
          setBrandProfile(results[0].value.data);
        }

        // Process KYC
        if (results[1].status === "fulfilled" && results[1].value?.data) {
          setKycStatus(results[1].value.data.status);
        } else {
          setKycStatus(user?.kyc_verified ? "approved" : null);
        }

        // Process Campaigns
        let fetchedCampaigns = [];
        if (results[2].status === "fulfilled") {
          const cData = results[2].value?.data;
          fetchedCampaigns = Array.isArray(cData) ? cData : [];
          setCampaigns(fetchedCampaigns);
        }

        // Process UGC Orders
        let fetchedOrders = [];
        if (results[3].status === "fulfilled") {
          const oData = results[3].value?.data;
          fetchedOrders = oData?.orders || (Array.isArray(oData) ? oData : []);
          setUgcOrders(fetchedOrders);
        }

        // Process UGC Briefs
        let fetchedUgcBriefs = [];
        if (results[9]?.status === "fulfilled") {
          const ubData = results[9].value?.data;
          fetchedUgcBriefs = ubData?.briefs || (Array.isArray(ubData) ? ubData : []);
        }

        // Process Banners (Admin Panel Real Banners)
        if (results[4].status === "fulfilled") {
          const bData = results[4].value?.data;
          const rawBanners = Array.isArray(bData) ? bData : (bData?.banners || []);
          if (rawBanners.length > 0) {
            const mapped = rawBanners
              .map((b) => ({
                id: b.id,
                title: b.title || "Featured Promotion",
                subtitle: b.description || b.subtitle || "",
                image: b.imgUrl || b.image_url || b.image || b.banner_image,
                banner_image: b.imgUrl || b.image_url || b.image || b.banner_image,
                link: b.link || b.link_url || "/brand/campaigns/create",
                badge: b.tag || b.placement || "PAYMENT HOLD SECURED",
              }))
              .filter((b) => Boolean(b.image));
            if (mapped.length > 0) {
              setBanners(mapped);
            } else {
              setBanners(DEFAULT_BRAND_BANNERS);
            }
          } else {
            setBanners(DEFAULT_BRAND_BANNERS);
          }
        }

        // Process Chat Threads
        if (results[5].status === "fulfilled" && Array.isArray(results[5].value?.data)) {
          const unreadCount = results[5].value.data.filter(
            (t) =>
              t.unread_brand ||
              t.unread === true ||
              (t.last_message_sender && t.last_message_sender !== user?.user_id && !t.read)
          ).length;
          setUnreadChatMessages(unreadCount);
        }

        // Process Notifications
        if (results[6].status === "fulfilled") {
          setUnreadNotifications(results[6].value?.count || 0);
        }

        // Process Transactions / Spent
        let totalSpentAmount = 0;
        if (results[7].status === "fulfilled") {
          const txns = results[7].value?.data;
          if (Array.isArray(txns)) {
            totalSpentAmount = txns
              .filter((t) => t.status === "SUCCESS" || t.status === "PAID")
              .reduce((sum, t) => sum + Number(t.gross_amount || t.amount || 0), 0);
          }
        }

        // Process Creators for explore cards
        let crList = [];
        if (results[8].status === "fulfilled" && Array.isArray(results[8].value?.data) && results[8].value.data.length > 0) {
          crList = results[8].value.data;
        } else {
          try {
            const { data: dbCr } = await supabase.from('creator_profiles').select('*').limit(15);
            if (Array.isArray(dbCr) && dbCr.length > 0) {
              crList = dbCr;
            }
          } catch (e) {
            console.warn("Direct creator_profiles fallback failed", e);
          }
        }

        if (crList.length > 0) {
          const glowPalettes = [
            "#F59E0B",
            "#7C3AED",
            "#22C55E",
            "#64748B",
            "#F43F5E",
            "#EC4899",
            "#B45309",
            "#0EA5E9",
            "#F97316",
          ];
          const mapped = crList.slice(0, 9).map((c, i) => {
            const followersNum = Number(c.avg_reach || c.average_reach || c.followers_count || c.reach || 50000);
            const reachStr =
              followersNum >= 1000000
                ? `${(followersNum / 1000000).toFixed(1)}M`
                : followersNum >= 1000
                ? `${Math.round(followersNum / 1000)}K`
                : `${followersNum}`;
            return {
              id: c.user_id || c.id || `cr-${i}`,
              name: c.name || c.full_name || c.displayName || c.username || "Creator",
              reach: reachStr,
              reachNum: followersNum,
              photo:
                c.avatar_url ||
                c.photo ||
                c.profile_image ||
                c.profile_picture_url ||
                null,
              glowColor: c.glowColor || glowPalettes[i % glowPalettes.length],
            };
          });
          setFeaturedCreators(mapped);
        } else {
          setFeaturedCreators([]);
        }

        // Calculate Action Items Counts
        let draftsReviewCount = 0;
        let liveLinksApproveCount = 0;
        let counteredCount = 0;
        let sampleDeliveriesCount = 0;

        // From UGC Orders
        fetchedOrders.forEach((o) => {
          const status = (o.brand_status || o.status || o.stage || "").toUpperCase();
          if (
            status === "SUBMITTED" ||
            status === "CONTENT_SUBMITTED" ||
            status === "DELIVERED" ||
            status === "DRAFT_SUBMITTED" ||
            status === "PENDING_REVIEW"
          ) {
            draftsReviewCount++;
          }
          if (
            status === "AWAITING_LIVE_LINK" ||
            status === "LIVE_LINK_SUBMITTED" ||
            status === "PROOF_SUBMITTED" ||
            Boolean(o.live_link && !o.live_link_approved_at)
          ) {
            liveLinksApproveCount++;
          }
          if (status === "PRICE_COUNTERED" || status === "NEGOTIATING") {
            counteredCount++;
          }
          if (status === "SAMPLE_SHIPPED" || status === "SAMPLE_DELIVERED") {
            sampleDeliveriesCount++;
          }
        });

        // Compute total applicants from campaigns
        let totalApplicants = 0;
        fetchedCampaigns.forEach((c) => {
          totalApplicants += Number(c.applications_count || c.applicants_count || 0);
        });

        // Compile Stats
        setStats({
          activeCollabs: fetchedOrders.filter(
            (o) =>
              (o.status || "").toUpperCase() !== "COMPLETED" &&
              (o.status || "").toUpperCase() !== "CANCELLED"
          ).length,
          applicantsCount: totalApplicants,
          totalSpent: totalSpentAmount,
          totalCampaigns: fetchedCampaigns.length,
          draftsToReviewCount: draftsReviewCount,
          liveLinksToApproveCount: liveLinksApproveCount,
          counteredPitchesCount: counteredCount,
          sampleDeliveriesCount: sampleDeliveriesCount,
        });

        // Active Briefs for Horizontal Carousel
        const allBrandCampaigns = [...fetchedCampaigns];
        if (Array.isArray(fetchedUgcBriefs)) {
          fetchedUgcBriefs.forEach((b) => {
            const bId = b.id || b.brief_id;
            if (!allBrandCampaigns.some((c) => (c.campaign_id || c.id) === bId)) {
              allBrandCampaigns.push({
                ...b,
                campaign_id: bId,
                id: bId,
                title: b.title || b.product_name || "UGC Video Brief",
                deliverables: b.deliverable_type || b.format || "UGC Video",
                status: b.status || "live",
                isUgc: true,
                deadline: b.deadline,
              });
            }
          });
        }

        const activeList = allBrandCampaigns
          .filter((c) => {
            const st = (c.status || c.stage || "").toLowerCase();
            return st === "live" || st === "shortlisting" || st === "in production" || st === "active" || st === "approved";
          })
          .map((c) => {
            let badgeText = "LIVE";
            let badgeBg = "#DCFCE7";
            let badgeColor = "#15803D";
            const s = (c.status || c.stage || "").toLowerCase();
            if (s === "shortlisting") {
              badgeText = "SHORTLISTING";
              badgeBg = "#FEF3C7";
              badgeColor = "#B45309";
            } else if (s === "in production") {
              badgeText = "IN PRODUCTION";
              badgeBg = "#F3EDFF";
              badgeColor = "#7C3AED";
            }

            // Clean format deliverables (prevent text collision like Short1)
            let typeStr = "UGC edited · 30s";
            if (Array.isArray(c.deliverables)) {
              typeStr = c.deliverables.filter(Boolean).join(" · ");
            } else if (typeof c.deliverables === "string" && c.deliverables.trim()) {
              typeStr = c.deliverables;
            } else if (c.category) {
              typeStr = `${c.category}${c.platform ? ` · ${c.platform}` : ""}`;
            }

            // Session 38 (Ravi): this is the brand's own home — only real numbers and real
            // applicant photos here. Generated views / applied / faces are for creators only.
            const appliedCount = realAppliedCount(c);
            const viewsCount = realViewCount(c);
            const avatars = (Array.isArray(c.applicants) ? c.applicants : [])
              .map((a) => a.creator_photo || a.photo || a.avatar_url)
              .filter(Boolean)
              .slice(0, 4);

            return {
              id: c.campaign_id || c.id,
              title: c.title || "Collaboration Campaign",
              type: typeStr,
              daysLeft: c.deadline
                ? `${Math.max(1, Math.ceil((new Date(c.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left`
                : "Active",
              views: viewsCount,
              appliedCount: appliedCount,
              avatars: avatars,
              isUgc: Boolean(c.isUgc),
              badgeText,
              badgeBg,
              badgeColor,
            };
          });

        setActiveBriefs(activeList);
        setLastRefreshedAt(new Date());
      } catch (err) {
        console.warn("Brand home feed loading warning:", err);
      } finally {
        setLoading(false);
        setIsRefreshingFeed(false);
      }
    },
    [user]
  );

  // Session 28: same live refresh as desktop — background reload, no spinner.
  useLiveRefresh(() => fetchBrandFeedData(true), { types: ["application", "deal", "kyc", "verification", "campaign", "payment", "escrow"], intervalMs: 120000 });

  // Initial load — Session 42: saved answers first (instant), then the server.
  useEffect(() => {
    if (user && hasSnapshots(BRAND_HOME_SNAPSHOT_URLS)) {
      fetchBrandFeedData(false, "snapshot").then(() => fetchBrandFeedData(false, "quiet"));
    } else {
      fetchBrandFeedData(false);
    }
  }, [fetchBrandFeedData]);

  // Pull-to-refresh handler
  const handlePullRefresh = async () => {
    await fetchBrandFeedData(true);
    toast.success("Collaboration updates synced");
  };

  // Brand Name & Initials
  const brandName =
    brandProfile?.company_name ||
    user?.company_name ||
    user?.name ||
    user?.full_name ||
    "Your brand"; // Session 42: was the demo name "Team Nexus" (rule 88)

  const brandInitials = useMemo(() => {
    const parts = brandName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (brandName.substring(0, 2) || "NB").toUpperCase();
  }, [brandName]);

  // Approval badge details
  const approvalBadge = useMemo(() => {
    // Session 41 (Ravi): "APPROVED" only when the admin approved the KYC. It used to fall back to
    // the account status (approved from the waitlist) and to a default "APPROVED" chip.
    const st = String(kycStatus || "").toLowerCase();
    if (st === "approved" || user?.kyc_verified) {
      return { label: "APPROVED", bg: "#DCFCE7", color: "#15803D" };
    }
    if (st === "pending" || st === "under_review" || st === "submitted") {
      return { label: "UNDER REVIEW", bg: "#FEF3C7", color: "#B45309" };
    }
    if (st === "rejected") {
      return { label: "KYC REJECTED", bg: "#FEE2E2", color: "#B91C1C" };
    }
    return { label: "KYC PENDING", bg: "#F1F5F9", color: "#475569" };
  }, [kycStatus, user]);

  // Greeting
  const greeting = useMemo(() => {
    const isNew = campaigns.length === 0 && ugcOrders.length === 0;
    if (isNew) return "Welcome to YBEX";
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  }, [campaigns.length, ugcOrders.length]);

  // Relative last updated text
  const lastUpdatedText = useMemo(() => {
    if (!lastRefreshedAt) return "Live";
    const diffSec = Math.floor((now - lastRefreshedAt.getTime()) / 1000);
    if (diffSec < 45) return "Just updated";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    return "Synced";
  }, [lastRefreshedAt, now]);

  // Determine if this is a new brand or active brand
  const isNewBrand = campaigns.length === 0 && ugcOrders.length === 0;

  // Onboarding tasks definition for New Brand
  const onboardingTasks = useMemo(() => {
    const tasks = [];
    const hasProfile = Boolean(brandProfile?.company_name && brandProfile?.website);
    const hasKyc = Boolean(kycStatus === "approved" || user?.kyc_verified);
    const hasCampaign = campaigns.length > 0;

    if (!hasProfile) {
      tasks.push({
        id: "profile",
        title: "Complete your profile",
        desc: "Add logo, category & website",
        btnText: "Complete",
        icon: User,
        iconBg: "#F3EDFF",
        iconColor: "#7C3AED",
        onClick: () => navigate("/brand/profile"),
      });
    }

    if (!hasKyc) {
      tasks.push({
        id: "kyc",
        title: "Complete your KYC",
        desc: "Verify GST / PAN to pay creators",
        btnText: "Verify",
        icon: ShieldCheck,
        iconBg: "#E9F7F0",
        iconColor: "#059669",
        onClick: () => navigate("/brand/kyc"),
      });
    }

    if (!hasCampaign) {
      tasks.push({
        id: "first_brief",
        title: "Post your first brief",
        desc: "Reach 10k+ verified UGC creators",
        btnText: "Launch",
        icon: Send,
        iconBg: "#FFF1E6",
        iconColor: "#EA580C",
        onClick: () => navigate("/brand/campaigns/create"),
      });
    }

    return tasks;
  }, [brandProfile, kycStatus, user, campaigns.length, navigate]);

  // Needs your action items for Active Brand (100% real actions only: UGC orders or Campaign chat/applicants)
  const needsActionItems = useMemo(() => {
    const items = [];

    // 1. UGC Orders: Drafts waiting for review -> Redirects to UGC Manage Orders
    if (stats.draftsToReviewCount > 0) {
      items.push({
        id: "drafts",
        icon: FileText,
        iconBg: "#FFF0F5",
        iconColor: "#DB2777",
        title: `${stats.draftsToReviewCount} UGC draft${stats.draftsToReviewCount > 1 ? "s" : ""} waiting for review`,
        subtitle: "Review deliverable & approve or request edits",
        subColor: "#B45309",
        btnText: "Review",
        btnBg: "#7C3AED",
        btnColor: "#fff",
        onClick: () => navigate("/brand/ugc/orders"),
      });
    }

    // 2. UGC Orders: Live reel link uploaded -> Redirects to UGC Manage Orders
    if (stats.liveLinksToApproveCount > 0) {
      items.push({
        id: "livelinks",
        icon: Clock,
        iconBg: "#FEF3C7",
        iconColor: "#B45309",
        title: `${stats.liveLinksToApproveCount} live reel link${stats.liveLinksToApproveCount > 1 ? "s" : ""} uploaded`,
        subtitle: "Approve link to release creator payout",
        subColor: "#B45309",
        btnText: "Approve",
        btnBg: "#F3EDFF",
        btnColor: "#7C3AED",
        onClick: () => navigate("/brand/ugc/orders"),
      });
    }

    // 3. UGC Orders: Sample shipped / delivery in progress -> Redirects to UGC Manage Orders
    if (stats.sampleDeliveriesCount > 0) {
      items.push({
        id: "sample_deliveries",
        icon: Package,
        iconBg: "#E9F7F0",
        iconColor: "#059669",
        title: `${stats.sampleDeliveriesCount} product sample shipment${stats.sampleDeliveriesCount > 1 ? "s" : ""}`,
        subtitle: "Track courier delivery & dispatch status",
        subColor: "#6B7280",
        btnText: "Track",
        btnBg: "#E9F7F0",
        btnColor: "#059669",
        onClick: () => navigate("/brand/ugc/orders"),
      });
    }

    // 4. Campaign Chat: Unread creator messages -> Redirects to Campaign Chat
    if (unreadChatMessages > 0) {
      items.push({
        id: "unread_chat",
        icon: MessageCircle,
        iconBg: "#F3EDFF",
        iconColor: "#7C3AED",
        title: `${unreadChatMessages} unread message${unreadChatMessages > 1 ? "s" : ""} in Partner Inbox`,
        subtitle: "Creators waiting for reply & script review",
        subColor: "#6B7280",
        btnText: "Open Chat",
        btnBg: "#7C3AED",
        btnColor: "#fff",
        onClick: () => navigate("/brand/inbox"),
      });
    }

    // 5. Campaign: Counter offers received -> Redirects to Campaign Chat
    if (stats.counteredPitchesCount > 0) {
      items.push({
        id: "countered",
        icon: MessageCircle,
        iconBg: "#FFF1E6",
        iconColor: "#EA580C",
        title: `${stats.counteredPitchesCount} creator counter offer${stats.counteredPitchesCount > 1 ? "s" : ""}`,
        subtitle: "Review countered pricing & terms in Chat",
        subColor: "#B45309",
        btnText: "Respond",
        btnBg: "#F3EDFF",
        btnColor: "#7C3AED",
        onClick: () => navigate("/brand/inbox"),
      });
    }

    // 6. Campaign: New applicants pitched -> Redirects to Campaigns
    if (stats.applicantsCount > 0) {
      items.push({
        id: "applicants",
        icon: User,
        iconBg: "#E0F2FE",
        iconColor: "#0284C7",
        title: `${stats.applicantsCount} new applicant${stats.applicantsCount > 1 ? "s" : ""} pitched`,
        subtitle: "Review creator profiles & shortlist for brief",
        subColor: "#0284C7",
        btnText: "Review",
        btnBg: "#F3EDFF",
        btnColor: "#7C3AED",
        onClick: () => navigate("/brand/campaigns"),
      });
    }

    // If nothing pending, returns empty array (section will be hidden completely)
    return items;
  }, [
    stats.draftsToReviewCount,
    stats.liveLinksToApproveCount,
    stats.sampleDeliveriesCount,
    stats.counteredPitchesCount,
    stats.applicantsCount,
    unreadChatMessages,
    navigate,
  ]);

  // Handle Template Selection
  const handleUseTemplate = (tmpl) => {
    try {
      const templateState = {
        currentStep: 2,
        campaignTitle: tmpl.title,
        requirementsText: tmpl.requirementsText,
        deliverablesText: tmpl.deliverablesText,
        budget: tmpl.budget,
        budgetType: "Per Influencer",
        collabMode: "Paid",
        selectedPlatforms: ["Instagram"],
        selectedCategories: [tmpl.category],
        // Session 33: the create screen opens in range mode (₹8,000–18,000) unless told otherwise,
        // so the template's fee was lost.
        isBudgetRange: false,
      };
      draftSet("campaign_draft", JSON.stringify(templateState));
      toast.success(`Template loaded: ${tmpl.title}`);
      navigate("/brand/campaigns/create");
    } catch (e) {
      console.error(e);
      navigate("/brand/campaigns/create");
    }
  };

  // Handle WhatsApp Support Click with Live Official WhatsApp Number (+91 87640 04299)
  const handleOpenWhatsApp = () => {
    const text = encodeURIComponent(
      `Hi YBEX Team, I am ${brandName} (Brand ID: ${user?.user_id || user?.id || ""}). I need assistance shortlisting verified creators for our brand campaign.`
    );
    window.open(`https://wa.me/918764004299?text=${text}`, "_blank");
  };

  // Handle Contact Us / Real Email with Auto-fetched Brand Details
  const handleContactEmail = () => {
    const emailTo = "support@ybexmedia.in";
    const subject = encodeURIComponent(`Campaign Manager Assistance Request — ${brandName}`);
    const bodyContent =
`Hi YBEX Team / Campaign Manager,

I am reaching out regarding creator shortlisting & campaign management for ${brandName}.

Brand Details:
• Brand / Company: ${brandName}
• Representative: ${user?.name || user?.full_name || brandName}
• Registered Email: ${user?.email || "N/A"}
• Phone: ${user?.phone || "+91 87640 04299"}
• Website / Social: ${brandProfile?.website || brandProfile?.instagram || "N/A"}

Requirements:
• Assistance needed for shortlisting 10+ verified creators
• Campaign Category / Niche: ${brandProfile?.category || "Lifestyle / D2C / UGC Ads"}
• Preferred Timeline: Immediate / This week

Looking forward to connecting with our dedicated manager.

Best regards,
${user?.name || user?.full_name || brandName}
${brandName}`;

    const mailtoUrl = `mailto:${emailTo}?subject=${subject}&body=${encodeURIComponent(bodyContent)}`;

    // Background tracking ticket
    api.post("/support/tickets", {
      subject: `Campaign Manager Assistance Request from ${brandName}`,
      category: "campaign_manager_call",
      priority: "high",
      message: bodyContent,
    }).catch(() => {});

    window.location.href = mailtoUrl;
  };

  // Handle Schedule Call Submit
  const handleScheduleCallSubmit = async (e) => {
    e.preventDefault();
    setScheduleCallSubmitting(true);
    try {
      // Call support ticket endpoint to record the booking in backend
      await api
        .post("/support/tickets", {
          subject: `Campaign Manager Call Request from ${brandName}`,
          category: "campaign_manager_call",
          priority: "high",
          message: `Brand: ${brandName}\nScheduled Date: ${scheduleCallDate}\nPreferred Time: ${scheduleCallTime}\nNotes: ${
            scheduleCallNote || "Assistance needed for 10+ creator shortlisting."
          }\nContact: ${user?.phone || user?.email || "Not specified"}`,
        })
        .catch((err) => {
          console.warn("Silent fallback for schedule ticket:", err);
        });

      toast.success("Call scheduled! Your dedicated Campaign Manager will reach out.");
      setIsScheduleCallModalOpen(false);
      setScheduleCallNote("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to schedule call. Opening WhatsApp instead.");
      handleOpenWhatsApp();
    } finally {
      setScheduleCallSubmitting(false);
    }
  };

  // Format currency
  const formatAmount = (num) => {
    if (!num || isNaN(num)) return "₹0";
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `₹${(num / 1000).toFixed(1)}k`;
    return `₹${Number(num).toLocaleString("en-IN")}`;
  };

  const activeBanner = banners[currentBannerIdx] || banners[0] || DEFAULT_BRAND_BANNERS[0];

  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      isRefreshing={isRefreshingFeed}
      pullingText="Pull down to refresh"
      releaseText="Release to sync collaborations"
      refreshingText="Fetching latest collaboration updates..."
      successText="Collaboration updates synced"
      lastUpdatedText={lastUpdatedText}
      className="w-full min-h-screen bg-[#D6C3FF]"
    >
      <div className="w-full min-h-screen bg-[#F4F4F8] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-28 select-none">
        {/* 1 · Header U-Box with Banner */}
        <div
          data-statusbar="#D6C3FF"
          style={{
            position: "relative",
            flexShrink: 0,
            // Session 43 (Ravi): darker at the top (continues behind the clock), light lower down.
            background:
              "radial-gradient(90% 60% at 0% 30%, #F1E8FF 0%, rgba(241,232,255,0) 70%), linear-gradient(180deg, #D6C3FF 0%, #E6DAFF 30%, #F6F1FF 100%)",
            borderRadius: "0 0 32px 32px",
            borderBottom: "1px solid #E7DCFF",
            paddingBottom: "36px",
            paddingTop: "14px",
          }}
        >
          {/* Elastic overscroll background extension so pulling down never reveals any cut or blank gap */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "-500px",
              height: "500px",
              background: "#D6C3FF",
              pointerEvents: "none",
            }}
          />
          {/* User Greeting & Header Actions Row */}
          <div
            style={{
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
            }}
          >
            {/* Brand Avatar -> opens profile */}
            <button
              type="button"
              onClick={() => navigate("/brand/profile")}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "13px",
                background: "#0A0A0A",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "800 14px 'DM Sans', sans-serif",
                color: "#fff",
                overflow: "hidden",
                border: "none",
                cursor: "pointer",
              }}
              aria-label="Brand Profile"
            >
              {brandProfile?.logo || user?.photo || user?.picture ? (
                <img
                  src={brandProfile?.logo || user?.photo || user?.picture}
                  alt={brandName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{brandInitials}</span>
              )}
            </button>

            {/* Greeting text and Brand status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: "500 11.5px 'DM Sans', sans-serif",
                  color: "#6B7280",
                }}
              >
                {greeting}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    font: "700 17px 'DM Sans', sans-serif",
                    letterSpacing: "-0.4px",
                    color: "#0A0A0A",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "160px",
                  }}
                >
                  {brandName}
                </span>
                <span
                  style={{
                    height: "18px",
                    padding: "0 6px",
                    borderRadius: "6px",
                    background: approvalBadge.bg,
                    display: "flex",
                    alignItems: "center",
                    font: "800 8.5px 'DM Sans', sans-serif",
                    letterSpacing: "0.5px",
                    color: approvalBadge.color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {approvalBadge.label}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {/* Session 41 (Ravi): header keeps only the bell — Inbox is already a bottom tab. */}
            {/* Notification Bell -> opens notifications */}
            <button
              type="button"
              onClick={() => navigate("/brand/notifications")}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "13px",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                flexShrink: 0,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
              }}
              aria-label="Notifications"
            >
              <Bell size={17} strokeWidth={1.9} color="#1F2937" />
              {unreadNotifications > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-4px",
                    height: "17px",
                    padding: "0 5px",
                    borderRadius: "9px",
                    background: "#7C3AED",
                    display: "flex",
                    alignItems: "center",
                    font: "700 9.5px 'DM Sans', sans-serif",
                    color: "#fff",
                    border: "1.5px solid #fff",
                  }}
                >
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </div>
              )}
            </button>
            </div>
          </div>

          {/* Brand Hero Banner with CMS Support (Graphic banner with ambient backdrop matching CreatorHomeMobile) */}
          {banners.length > 0 && activeBanner && (
            <div
              style={{
                margin: "12px 14px 0",
                borderRadius: "20px",
                overflow: "hidden",
                background: "#09090B",
                border: "1px solid #E7DCFF",
                boxShadow: "0 14px 28px -20px rgba(76,29,149,0.45)",
                position: "relative",
                cursor: "pointer",
              }}
              data-splash-target="hero"
              className="aspect-[2.9/1] min-h-[112px] flex items-center justify-center"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={() => {
                if (activeBanner?.link) navigate(activeBanner.link);
              }}
            >
              {/* Ambient blurred backdrop so any aspect ratio blends seamlessly without letterbox bars */}
              <img
                src={activeBanner.image || activeBanner.banner_image || activeBanner.imgUrl || DEFAULT_BRAND_BANNERS[0].image}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-75"
              />
              {/* Foreground Banner - object-contain ensures 100% of text and graphics remain intact */}
              <img
                src={activeBanner.image || activeBanner.banner_image || activeBanner.imgUrl || DEFAULT_BRAND_BANNERS[0].image}
                alt={activeBanner.title || "Banner"}
                className="relative z-10 w-full h-full object-contain"
              />

              {/* Optional badge */}
              {activeBanner.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    zIndex: 20,
                    height: "18px",
                    padding: "0 6px",
                    borderRadius: "6px",
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(6px)",
                    display: "flex",
                    alignItems: "center",
                    font: "700 8.5px 'DM Sans', sans-serif",
                    color: "#fff",
                    letterSpacing: "0.5px",
                  }}
                >
                  {activeBanner.badge}
                </div>
              )}

              {/* Pagination Dots */}
              {banners.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    right: "10px",
                    bottom: "10px",
                    display: "flex",
                    gap: "4px",
                    pointerEvents: "none",
                    zIndex: 20,
                  }}
                >
                  {banners.map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: idx === currentBannerIdx ? "12px" : "4px",
                        height: "4px",
                        borderRadius: "2px",
                        background: idx === currentBannerIdx ? "#fff" : "rgba(255,255,255,0.45)",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cute, Compact, Centered Rotating Trust Line */}
          <div
            style={{
              margin: "9px 14px 0",
              height: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={trustIdx}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#16A34A" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M10.6 16.4l-3.8-3.8 1.3-1.3 2.5 2.5 5.3-5.3 1.3 1.3z" fill="#fff" />
                </svg>
                <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#15803D" }}>
                  {BRAND_TRUST_ITEMS[trustIdx]?.title || "100% KYC-verified creators"}
                </span>
                <span style={{ font: "500 11px 'DM Sans', sans-serif", color: "#6B7280" }}>
                  · {BRAND_TRUST_ITEMS[trustIdx]?.text || "payments in a secure payment hold"}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* 2 · Floating Quick Bar (4 shortcuts - matched Creator spacing) */}
        <div
          style={{
            flexShrink: 0,
            margin: "-22px 14px 0",
            background: "#fff",
            borderRadius: "22px",
            border: "1px solid #ECE7F7",
            boxShadow: "0 18px 34px -26px rgba(76,29,149,0.55)",
            padding: "13px 4px 12px",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            position: "relative",
            zIndex: 10,
          }}
        >
          {/* Create UGC */}
          <button
            type="button"
            onClick={() => navigate("/brand/ugc/post")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#FFF1E6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <Zap size={21} strokeWidth={1.9} color="#EA580C" />
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              Create UGC
            </span>
          </button>

          {/* Session 43 (Ravi): Refer & Earn · New campaign · Payouts · Create UGC */}
          {/* Campaign */}
          <button
            type="button"
            onClick={() => navigate("/brand/campaigns/create")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#F3EDFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <Send size={20} strokeWidth={1.9} color="#7C3AED" />
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              New campaign
            </span>
          </button>

          {/* Payouts */}
          <button
            type="button"
            onClick={() => navigate("/brand/payments")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#E9F7F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <CreditCard size={21} strokeWidth={1.9} color="#059669" />
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              Payouts
            </span>
          </button>

          {/* Refer & Earn */}
          <button
            type="button"
            onClick={() => navigate("/brand/account?section=refer")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#FFF0F5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <Gift size={21} strokeWidth={1.9} color="#DB2777" />
              <div
                style={{
                  position: "absolute",
                  top: "-6px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  height: "16px",
                  padding: "0 6px",
                  borderRadius: "8px",
                  background: "#0A0A0A",
                  display: "flex",
                  alignItems: "center",
                  font: "800 8.5px 'DM Sans', sans-serif",
                  letterSpacing: "0.5px",
                  color: "#fff",
                }}
              >
                NEW
              </div>
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              Refer & Earn
            </span>
          </button>
        </div>

        {/* 3 · Conditional Action Section: NEW BRAND ONBOARDING vs ACTIVE BRAND ACTIONS */}
        {isNewBrand ? (
          // NEW BRAND ONBOARDING CAROUSEL (Auto-rotates, 1/3, 2/3, 3/3)
          onboardingTasks.length > 0 && (
            <div style={{ flexShrink: 0, padding: "16px 14px 0" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 2px 8px",
                }}
              >
                <span
                  style={{
                    font: "700 10px 'DM Sans', sans-serif",
                    letterSpacing: "1.1px",
                    color: "#9CA3AF",
                    whiteSpace: "nowrap",
                  }}
                >
                  IMPORTANT FOR YOU ·{" "}
                  {onboardingTasks.length > 1
                    ? `${(onboardingStepIdx % onboardingTasks.length) + 1}/${onboardingTasks.length}`
                    : "1/1"}
                </span>
                {onboardingTasks.length > 1 && (
                  <div style={{ display: "flex", gap: "4px" }}>
                    {onboardingTasks.map((_, i) => (
                      <div
                        key={i}
                        style={{
                          height: "4px",
                          width: i === onboardingStepIdx % onboardingTasks.length ? "14px" : "4px",
                          borderRadius: "2px",
                          background:
                            i === onboardingStepIdx % onboardingTasks.length ? "#7C3AED" : "#D4D4DC",
                          transition: "all 0.3s ease",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Current Active Onboarding Card */}
              {(() => {
                const currentTask =
                  onboardingTasks[onboardingStepIdx % onboardingTasks.length] || onboardingTasks[0];
                const IconComponent = currentTask.icon;
                return (
                  <div style={{ position: "relative", overflow: "hidden", borderRadius: "18px" }}>
                  <AnimatePresence initial={false} mode="popLayout" custom={importantDir}>
                  <motion.div
                    key={onboardingStepIdx % onboardingTasks.length}
                    custom={importantDir}
                    data-testid="important-card"
                    initial={{ x: importantDir > 0 ? "60%" : "-60%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
                    exit={{ x: importantDir > 0 ? "-60%" : "60%", opacity: 0, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                    drag={onboardingTasks.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.35}
                    onDragStart={() => { importantPauseUntil.current = Date.now() + 7000; }}
                    onDragEnd={(_e, info) => {
                      if (info.offset.x < -50 || info.velocity.x < -400) swipeImportant(1);
                      else if (info.offset.x > 50 || info.velocity.x > 400) swipeImportant(-1);
                    }}
                    style={{
                      touchAction: "pan-y",
                      willChange: "transform",
                      background: "#fff",
                      border: "1px solid #E6E6EE",
                      borderRadius: "18px",
                      padding: "11px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "11px",
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "13px",
                        background: currentTask.iconBg,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <IconComponent size={18} strokeWidth={1.9} color={currentTask.iconColor} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          font: "600 13.5px 'DM Sans', sans-serif",
                          color: "#0A0A0A",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {currentTask.title}
                      </div>
                      <div
                        style={{
                          marginTop: "2px",
                          font: "400 11px 'DM Sans', sans-serif",
                          color: "#6B7280",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {currentTask.desc}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={currentTask.onClick}
                      style={{
                        height: "32px",
                        padding: "0 13px",
                        borderRadius: "11px",
                        background: "#7C3AED",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        flexShrink: 0,
                        font: "600 11.5px 'DM Sans', sans-serif",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {currentTask.btnText}
                    </button>
                  </motion.div>
                  </AnimatePresence>
                  </div>
                );
              })()}
            </div>
          )
        ) : (
          // ACTIVE BRAND: NEEDS YOUR ACTION LIST (Only rendered if there are real pending items)
          needsActionItems.length > 0 && (
            <div style={{ flexShrink: 0, padding: "16px 14px 0" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 2px 8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      font: "700 10px 'DM Sans', sans-serif",
                      letterSpacing: "1.1px",
                      color: "#9CA3AF",
                      whiteSpace: "nowrap",
                    }}
                  >
                    NEEDS YOUR ACTION
                  </span>
                  <span
                    style={{
                      height: "16px",
                      padding: "0 5px",
                      borderRadius: "8px",
                      background: "#7C3AED",
                      display: "flex",
                      alignItems: "center",
                      font: "700 9px 'DM Sans', sans-serif",
                      color: "#fff",
                    }}
                  >
                    {needsActionItems.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/brand/ugc/orders")}
                  style={{
                    font: "600 11.5px 'DM Sans', sans-serif",
                    color: "#7C3AED",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  View all
                </button>
              </div>

              <div
                style={{
                  background: "#fff",
                  border: "1px solid #E6E6EE",
                  borderRadius: "18px",
                  padding: "2px 12px",
                }}
              >
                {needsActionItems.map((item, idx) => {
                  const ItemIcon = item.icon;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 0",
                        borderTop: idx > 0 ? "1px solid #F1F1F6" : "none",
                      }}
                    >
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "11px",
                          background: item.iconBg,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ItemIcon size={16} strokeWidth={1.9} color={item.iconColor} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            font: "600 12.5px 'DM Sans', sans-serif",
                            color: "#0A0A0A",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.title}
                        </div>
                        <div
                          style={{
                            marginTop: "2px",
                            font: "500 10.5px 'DM Sans', sans-serif",
                            color: item.subColor || "#6B7280",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.subtitle}
                        </div>
                      </div>

                      {item.btnText && (
                        <button
                          type="button"
                          onClick={item.onClick}
                          style={{
                            height: "28px",
                            padding: "0 11px",
                            borderRadius: "9px",
                            background: item.btnBg,
                            border: "none",
                            display: "flex",
                            alignItems: "center",
                            flexShrink: 0,
                            font: "600 11px 'DM Sans', sans-serif",
                            color: item.btnColor,
                            cursor: "pointer",
                          }}
                        >
                          {item.btnText}
                        </button>
                      )}

                      {item.hasChevron && (
                        <button
                          type="button"
                          onClick={item.onClick}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          <ChevronRight size={14} color="#C4C4CC" strokeWidth={2.2} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* 5 · Active Briefs Carousel (If brand has active briefs) */}
        {!isNewBrand && activeBriefs.length > 0 && (
          <div style={{ flexShrink: 0, padding: "18px 0 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                padding: "0 14px",
              }}
            >
              <span
                style={{
                  font: "700 16px 'DM Sans', sans-serif",
                  letterSpacing: "-0.4px",
                  color: "#0A0A0A",
                  whiteSpace: "nowrap",
                }}
              >
                Your Active Briefs
              </span>
              <button
                type="button"
                onClick={() => navigate("/brand/campaigns")}
                style={{
                  font: "600 12px 'DM Sans', sans-serif",
                  color: "#7C3AED",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                View all
              </button>
            </div>

            <div
              style={{
                padding: "9px 0 0 14px",
                display: "flex",
                gap: "8px",
                overflowX: "auto",
              }}
              className="no-scrollbar scroll-smooth"
            >
              {activeBriefs.map((brief) => (
                <div
                  key={brief.id}
                  onClick={() => navigate(`/brand/campaigns`)}
                  style={{
                    width: "256px",
                    flexShrink: 0,
                    background: "#fff",
                    border: "1px solid #E6E6EE",
                    borderRadius: "18px",
                    padding: "13px",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        height: "21px",
                        padding: "0 7px",
                        borderRadius: "7px",
                        background: brief.badgeBg,
                        display: "flex",
                        alignItems: "center",
                        font: "700 9.5px 'DM Sans', sans-serif",
                        letterSpacing: "0.4px",
                        color: brief.badgeColor,
                      }}
                    >
                      {brief.badgeText}
                    </div>
                    <span style={{ font: "500 10.5px 'DM Sans', sans-serif", color: "#9CA3AF" }}>
                      {brief.daysLeft}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: "9px",
                      font: "700 14px/1.3 'DM Sans', sans-serif",
                      color: "#0A0A0A",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {brief.title}
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      font: "400 11px 'DM Sans', sans-serif",
                      color: "#6B7280",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {brief.type}
                  </div>

                  {/* Desktop-identical Footer Stats (Views + Real Creator Avatars + Applied Count) */}
                  <div
                    style={{
                      marginTop: "12px",
                      paddingTop: "10px",
                      borderTop: "1px solid #F1F1F6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    {/* Left: Views with Eye icon */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4.5px" }}>
                      {brief.views != null && (<>
                      <Eye size={12} strokeWidth={2.2} color="#9CA3AF" />
                      <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#6B7280" }}>
                        {brief.views} Views
                      </span>
                      </>)}
                    </div>

                    {/* Right: Overlapping Creator Avatars + Applied Count + Arrow */}
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        {brief.avatars.map((avatarUrl, idx) => (
                          <img
                            key={idx}
                            src={avatarUrl}
                            alt="creator"
                            style={{
                              width: "18px",
                              height: "18px",
                              borderRadius: "50%",
                              border: "1.5px solid #fff",
                              objectFit: "cover",
                              marginLeft: idx === 0 ? 0 : "-6px",
                              background: "#E5E7EB",
                            }}
                            loading="lazy"
                          />
                        ))}
                      </div>
                      <span
                        style={{
                          font: "700 11px 'DM Sans', sans-serif",
                          color: "#7C3AED",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {brief.appliedCount} applied
                      </span>
                      <ChevronRight size={13} color="#9CA3AF" strokeWidth={2.2} style={{ flexShrink: 0 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6 · Launch in 2 minutes (Campaign Templates) */}
        <div style={{ flexShrink: 0, padding: "18px 14px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div>
              <div
                style={{
                  font: "700 16px 'DM Sans', sans-serif",
                  letterSpacing: "-0.4px",
                  color: "#0A0A0A",
                  whiteSpace: "nowrap",
                }}
              >
                Launch in 2 minutes
              </div>
              <div
                style={{
                  marginTop: "2px",
                  font: "400 11px 'DM Sans', sans-serif",
                  color: "#6B7280",
                }}
              >
                Pick a template, we pre-fill the brief
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/brand/campaigns/create")}
              style={{
                font: "600 12px 'DM Sans', sans-serif",
                color: "#7C3AED",
                whiteSpace: "nowrap",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              Write my own
            </button>
          </div>

          {/* Horizontal Templates Slider */}
          <div
            style={{
              padding: "10px 0 0",
              display: "flex",
              gap: "8px",
              overflowX: "auto",
            }}
            className="no-scrollbar scroll-smooth"
          >
            {CAMPAIGN_TEMPLATES.map((tmpl) => {
              const TmplIcon = tmpl.icon;
              return (
                <div
                  key={tmpl.id}
                  style={{
                    width: "210px",
                    flexShrink: 0,
                    background: "#fff",
                    border: "1px solid #E6E6EE",
                    borderRadius: "18px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "11px",
                      background: tmpl.iconBg,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <TmplIcon size={16} strokeWidth={1.9} color={tmpl.iconColor} />
                  </div>

                  <div
                    style={{
                      marginTop: "10px",
                      font: "600 13px/1.3 'DM Sans', sans-serif",
                      color: "#0A0A0A",
                      minHeight: "34px",
                    }}
                  >
                    {tmpl.title}
                  </div>
                  <div
                    style={{
                      marginTop: "3px",
                      font: "400 10.5px/1.4 'DM Sans', sans-serif",
                      color: "#6B7280",
                    }}
                  >
                    {tmpl.deliverableSummary}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUseTemplate(tmpl)}
                    style={{
                      marginTop: "12px",
                      height: "34px",
                      borderRadius: "10px",
                      background: "#F3EDFF",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "600 11.5px 'DM Sans', sans-serif",
                      color: "#7C3AED",
                      cursor: "pointer",
                      transition: "background 0.2s ease",
                    }}
                  >
                    Use template
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 7 · Live Social Proof Feed Ticker */}
        <div style={{ flexShrink: 0, padding: "16px 14px 0" }}>
          {(() => {
            const currentEvent = SOCIAL_PROOF_EVENTS[socialProofIdx];
            return (
              <div
                style={{
                  height: "36px",
                  padding: "0 12px",
                  borderRadius: "12px",
                  background: "#fff",
                  border: "1px solid #E6E6EE",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "4px",
                    background: "#22C55E",
                    boxShadow: "0 0 0 3px #DCFCE7",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    font: "500 11px 'DM Sans', sans-serif",
                    color: "#374151",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <b style={{ fontWeight: 700, color: "#0A0A0A" }}>{currentEvent.text}</b> ·{" "}
                  {currentEvent.amount}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    font: "700 10.5px 'DM Sans', sans-serif",
                    color: "#059669",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentEvent.tag}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Session 30: shown only when real creators load — no sample people. */}
        {featuredCreators.length > 0 && (<>
        {/* 8 · Meet the Creators (3-column Masonry Layout with Glowing Blur) */}
        <div
          style={{
            flexShrink: 0,
            padding: "16px 14px 0",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <span
            style={{
              font: "700 16px 'DM Sans', sans-serif",
              letterSpacing: "-0.4px",
              color: "#0A0A0A",
              whiteSpace: "nowrap",
            }}
          >
            Meet the Creators
          </span>
          <button
            type="button"
            onClick={() => navigate("/brand/discover")}
            style={{
              font: "600 12px 'DM Sans', sans-serif",
              color: "#7C3AED",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Explore
          </button>
        </div>

        {/* 3-column Staggered Grid with Bottom Frosted Glass Overlay */}
        <div
          style={{
            flexShrink: 0,
            position: "relative",
            marginTop: "10px",
            height: "520px",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "6px 14px 0", display: "flex", gap: "9px" }}>
            {/* Column 1 */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingTop: "6px",
              }}
            >
              {featuredCreators.slice(0, 3).map((cr, idx) => (
                <motion.div
                  key={cr.id}
                  animate={{ y: [0, -3.5, 0] }}
                  transition={{
                    duration: 6.2 + idx * 0.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: idx * 0.4,
                  }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => navigate(`/creator/${cr.id}`)}
                  style={{
                    position: "relative",
                    flexShrink: 0,
                    height: "150px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: "12px 5px -6px",
                      borderRadius: "20px",
                      background: cr.glowColor,
                      opacity: 0.55,
                      filter: "blur(18px)",
                      transform: "translateZ(0)",
                    }}
                  />
                  <div
                    style={{
                      position: "relative",
                      height: "100%",
                      borderRadius: "18px",
                      overflow: "hidden",
                      background: "#16161B",
                      boxShadow: "0 10px 22px -12px rgba(18,18,26,0.65)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {cr.photo ? (
                      <img
                        src={cr.photo}
                        alt={cr.name}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/70 text-3xl font-bold">
                        {(cr.name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: "26px 8px 8px",
                        background:
                          "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.88) 100%)",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          font: "700 12px/1.2 'DM Sans', sans-serif",
                          color: "#fff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                        }}
                      >
                        {cr.name}
                      </div>
                      <div
                        style={{
                          marginTop: "2px",
                          display: "flex",
                          alignItems: "baseline",
                          gap: "4px",
                        }}
                      >
                        <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#fff" }}>
                          {cr.reach}
                        </span>
                        <span
                          style={{
                            font: "600 7.5px 'DM Sans', sans-serif",
                            letterSpacing: "0.5px",
                            color: "rgba(255,255,255,0.75)",
                          }}
                        >
                          AVG REACH
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Column 2 */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingTop: "24px",
              }}
            >
              {featuredCreators.slice(3, 6).map((cr, idx) => (
                <motion.div
                  key={cr.id}
                  animate={{ y: [0, -4, 0] }}
                  transition={{
                    duration: 6.8 + idx * 0.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.6 + idx * 0.35,
                  }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => navigate(`/creator/${cr.id}`)}
                  style={{
                    position: "relative",
                    flexShrink: 0,
                    height: "154px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: "12px 5px -6px",
                      borderRadius: "20px",
                      background: cr.glowColor,
                      opacity: 0.55,
                      filter: "blur(18px)",
                      transform: "translateZ(0)",
                    }}
                  />
                  <div
                    style={{
                      position: "relative",
                      height: "100%",
                      borderRadius: "18px",
                      overflow: "hidden",
                      background: "#16161B",
                      boxShadow: "0 10px 22px -12px rgba(18,18,26,0.65)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {cr.photo ? (
                      <img
                        src={cr.photo}
                        alt={cr.name}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/70 text-3xl font-bold">
                        {(cr.name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: "26px 8px 8px",
                        background:
                          "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.88) 100%)",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          font: "700 12px/1.2 'DM Sans', sans-serif",
                          color: "#fff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                        }}
                      >
                        {cr.name}
                      </div>
                      <div
                        style={{
                          marginTop: "2px",
                          display: "flex",
                          alignItems: "baseline",
                          gap: "4px",
                        }}
                      >
                        <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#fff" }}>
                          {cr.reach}
                        </span>
                        <span
                          style={{
                            font: "600 7.5px 'DM Sans', sans-serif",
                            letterSpacing: "0.5px",
                            color: "rgba(255,255,255,0.75)",
                          }}
                        >
                          AVG REACH
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Column 3 */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingTop: "0px",
              }}
            >
              {featuredCreators.slice(6, 9).map((cr, idx) => (
                <motion.div
                  key={cr.id}
                  animate={{ y: [0, -3.5, 0] }}
                  transition={{
                    duration: 6.5 + idx * 0.55,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.3 + idx * 0.3,
                  }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => navigate(`/creator/${cr.id}`)}
                  style={{
                    position: "relative",
                    flexShrink: 0,
                    height: "148px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: "12px 5px -6px",
                      borderRadius: "20px",
                      background: cr.glowColor,
                      opacity: 0.55,
                      filter: "blur(18px)",
                      transform: "translateZ(0)",
                    }}
                  />
                  <div
                    style={{
                      position: "relative",
                      height: "100%",
                      borderRadius: "18px",
                      overflow: "hidden",
                      background: "#16161B",
                      boxShadow: "0 10px 22px -12px rgba(18,18,26,0.65)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {cr.photo ? (
                      <img
                        src={cr.photo}
                        alt={cr.name}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/70 text-3xl font-bold">
                        {(cr.name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: "26px 8px 8px",
                        background:
                          "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.88) 100%)",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          font: "700 12px/1.2 'DM Sans', sans-serif",
                          color: "#fff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                        }}
                      >
                        {cr.name}
                      </div>
                      <div
                        style={{
                          marginTop: "2px",
                          display: "flex",
                          alignItems: "baseline",
                          gap: "4px",
                        }}
                      >
                        <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#fff" }}>
                          {cr.reach}
                        </span>
                        <span
                          style={{
                            font: "600 7.5px 'DM Sans', sans-serif",
                            letterSpacing: "0.5px",
                            color: "rgba(255,255,255,0.75)",
                          }}
                        >
                          AVG REACH
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bottom Frosted Blur + 10k+ verified creators CTA */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "180px",
              background:
                "linear-gradient(180deg, rgba(244,244,248,0) 0%, rgba(244,244,248,0.85) 45%, #F4F4F8 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0 24px 16px",
              textAlign: "center",
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                font: "700 15px 'DM Sans', sans-serif",
                letterSpacing: "-0.3px",
                color: "#0A0A0A",
              }}
            >
              10k+ verified creators
            </div>
            <div
              style={{
                marginTop: "3px",
                font: "400 11.5px 'DM Sans', sans-serif",
                color: "#6B7280",
              }}
            >
              Browse by niche, city and reach
            </div>
            <button
              type="button"
              onClick={() => navigate("/brand/discover")}
              style={{
                marginTop: "12px",
                height: "40px",
                padding: "0 20px",
                borderRadius: "12px",
                background: "#7C3AED",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                boxShadow: "0 10px 20px -12px rgba(124,58,237,1)",
                cursor: "pointer",
              }}
            >
              <span style={{ font: "600 12.5px 'DM Sans', sans-serif", color: "#fff" }}>
                Explore more
              </span>
              <ArrowRight size={14} color="#fff" strokeWidth={2.3} />
            </button>
          </div>
        </div>

        </>)}
        {/* 9 · Dedicated Campaign Manager Support Card */}
        <div style={{ flexShrink: 0, padding: "14px 14px 0" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #E6E6EE",
              borderRadius: "18px",
              padding: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "20px",
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "#EFE6FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop"
                  alt="Campaign Manager"
                  className="w-full h-full object-cover"
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "600 13px/1.3 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                  Need help shortlisting 10+ creators?
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    font: "400 11px 'DM Sans', sans-serif",
                    color: "#6B7280",
                  }}
                >
                  Talk to your dedicated Campaign Manager
                </div>
              </div>
            </div>

            {/* Support Actions: Contact Us (Mail) & WhatsApp (+91 87640 04299) */}
            <div style={{ marginTop: "11px", display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handleContactEmail}
                style={{
                  flex: 1,
                  height: "36px",
                  borderRadius: "11px",
                  background: "#F3EDFF",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <Mail size={14} color="#7C3AED" strokeWidth={1.9} />
                <span style={{ font: "600 12px 'DM Sans', sans-serif", color: "#7C3AED" }}>
                  Contact Us
                </span>
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                style={{
                  flex: 1,
                  height: "36px",
                  borderRadius: "11px",
                  background: "#16A34A",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <MessageCircle size={14} color="#fff" strokeWidth={1.9} />
                <span style={{ font: "600 12px 'DM Sans', sans-serif", color: "#fff" }}>
                  WhatsApp
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 10 · Brands growing with YBEX (Connected directly to trustedBrands constant) */}
        <div style={{ flexShrink: 0, padding: "14px 14px 18px" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #E6E6EE",
              borderRadius: "18px",
              padding: "11px 12px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              {trustedBrands.map((brand, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "relative",
                    width: "28px",
                    height: "28px",
                    borderRadius: "14px",
                    border: "2px solid #fff",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    overflow: "hidden",
                    marginLeft: idx === 0 ? 0 : "-8px",
                    zIndex: trustedBrands.length - idx,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={brand.logoUrl}
                    alt={`Trusted Brand ${idx + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.parentElement.style.backgroundColor = "#F3F4F6";
                    }}
                  />
                </div>
              ))}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: "600 12.5px 'DM Sans', sans-serif",
                  color: "#0A0A0A",
                  whiteSpace: "nowrap",
                }}
              >
                Brands growing with YBEX
              </div>
              <div
                style={{
                  font: "400 10.5px 'DM Sans', sans-serif",
                  color: "#6B7280",
                  whiteSpace: "nowrap",
                }}
              >
                Leading brands found their creators here
              </div>
            </div>
          </div>
        </div>

        {/* Schedule Call Interactive Modal */}
        {isScheduleCallModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(10,10,10,0.55)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
            onClick={() => setIsScheduleCallModalOpen(false)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "440px",
                background: "#fff",
                borderRadius: "28px 28px 0 0",
                padding: "24px 20px 32px",
                boxShadow: "0 -20px 40px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h3
                    style={{
                      font: "700 18px 'DM Sans', sans-serif",
                      color: "#0A0A0A",
                      letterSpacing: "-0.4px",
                    }}
                  >
                    Schedule Call with Strategist
                  </h3>
                  <p style={{ font: "400 12px 'DM Sans', sans-serif", color: "#6B7280" }}>
                    Get personalized recommendations for 10+ creator campaigns
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScheduleCallModalOpen(false)}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "16px",
                    background: "#F4F4F8",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={16} color="#6B7280" />
                </button>
              </div>

              <form onSubmit={handleScheduleCallSubmit}>
                <div style={{ marginBottom: "14px" }}>
                  <label
                    style={{
                      display: "block",
                      font: "600 12px 'DM Sans', sans-serif",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Preferred Date
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduleCallDate}
                    onChange={(e) => setScheduleCallDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    style={{
                      width: "100%",
                      height: "44px",
                      borderRadius: "12px",
                      border: "1px solid #E5E7EB",
                      padding: "0 12px",
                      font: "500 14px 'DM Sans', sans-serif",
                      color: "#0A0A0A",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label
                    style={{
                      display: "block",
                      font: "600 12px 'DM Sans', sans-serif",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Preferred Time Slot
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {["11:30 AM", "02:30 PM", "04:30 PM", "06:00 PM"].map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setScheduleCallTime(slot)}
                        style={{
                          height: "38px",
                          borderRadius: "10px",
                          border:
                            scheduleCallTime === slot ? "1.5px solid #7C3AED" : "1px solid #E5E7EB",
                          background: scheduleCallTime === slot ? "#F3EDFF" : "#fff",
                          color: scheduleCallTime === slot ? "#7C3AED" : "#374151",
                          font: "600 12px 'DM Sans', sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      font: "600 12px 'DM Sans', sans-serif",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Brief Requirement or Note (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Need 15 D2C creators for Diwali unboxing campaign"
                    value={scheduleCallNote}
                    onChange={(e) => setScheduleCallNote(e.target.value)}
                    style={{
                      width: "100%",
                      borderRadius: "12px",
                      border: "1px solid #E5E7EB",
                      padding: "10px 12px",
                      font: "400 13px 'DM Sans', sans-serif",
                      color: "#0A0A0A",
                      outline: "none",
                      boxSizing: "border-box",
                      resize: "none",
                    }}
                  />
                </div>

                {/* Strict Button Alignment Architecture: Cancel on Left, Submit on Right */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setIsScheduleCallModalOpen(false)}
                    style={{
                      flex: 1,
                      height: "44px",
                      borderRadius: "12px",
                      background: "#F4F4F8",
                      border: "none",
                      font: "600 13px 'DM Sans', sans-serif",
                      color: "#6B7280",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={scheduleCallSubmitting}
                    style={{
                      flex: 2,
                      height: "44px",
                      borderRadius: "12px",
                      background: "#7C3AED",
                      border: "none",
                      font: "700 13px 'DM Sans', sans-serif",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      boxShadow: "0 10px 20px -10px rgba(124,58,237,0.8)",
                    }}
                  >
                    {scheduleCallSubmitting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Confirm Schedule Call</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

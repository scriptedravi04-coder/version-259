import { acquireSocket } from "../../lib/sharedSocket";
import { ownDb } from "../../lib/ownDb";
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { t } from "@/lib/typography";
import { Badge } from "../common/Badge";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence, animate } from "framer-motion";
import { supabase } from "../../lib/supabase";
import { revealChildren } from "../../lib/motion";
import { 
  Megaphone, Users2, ShieldAlert, Building, Coins, LayoutGrid, Bell, X, 
  ChevronRight, MessageCircle, FileText, CheckCircle, ArrowRight, Eye, Briefcase, Plus, AlertTriangle, TrendingUp, TrendingDown, Minus, HelpCircle,
  FileVideo, ArrowUpRight, Award, Clock
} from "lucide-react";
import ActivityFeed from "./ActivityFeed";
import CampaignMiniList from "../campaigns/CampaignMiniList";
import QuickActions from "./QuickActions";
import NotificationBell from "../shared/NotificationBell";
import TrustedBrandsWidget from "./TrustedBrandsWidget";
import TrustBadgeRotator from "../TrustBadgeRotator";
import PullToRefresh from "../common/PullToRefresh";
import { useLiveRefresh } from "../../lib/liveRefresh";
import ImportantForYou from "./ImportantForYou";
import { buildBrandTasks } from "../../lib/brandTasks";
import { EstimateValue, estimateText, estimateForCreator } from "../../components/common/AudienceEstimate";


const brandHeroBannersList = [
  {
    id: "b1",
    title: "Launch UGC Campaigns",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop",
    link: "/campaigns/create"
  },
  {
    id: "b2",
    title: "Discover Creators",
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=600&auto=format&fit=crop",
    link: "/explore"
  }
];

// Numeric helper
const formatNumber = (num) => {
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(num);
};

// Animated Number Component exactly matching CreatorDashboard
const AnimatedNumber = ({ value, prefix = "", format = false }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v)
    });
    return controls.stop;
  }, [value]);
  
  const formatted = format ? formatNumber(display) : Math.floor(display);
  return <span>{prefix}{formatted}</span>;
};



export default function BrandDashboard({ user }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [stats, setStats] = useState({
    campaignsCount: 0,
    applicantsCount: 0,
    dealsCount: 0,
    amountSpent: 0
  });
  const [campaigns, setCampaigns] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topPerformers, setTopPerformers] = useState([]);
  
  // KYC and Messaging states
  const [kycVerified, setKycVerified] = useState(false);
  const [kycStatusText, setKycStatusText] = useState("");
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [showKycBanner, setShowKycBanner] = useState(true);

  const [currentStatIndex, setCurrentStatIndex] = useState(0);
  // Session 34: real data for the "Important for you" card (src/lib/brandTasks.js).
  const [taskUgcOrders, setTaskUgcOrders] = useState([]);
  const [taskThreads, setTaskThreads] = useState([]);
  const [taskApplications, setTaskApplications] = useState([]);
  const [brandProfileRow, setBrandProfileRow] = useState(null);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);

  // Notification states
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [adminPopup, setAdminPopup] = useState(null);

  const handleDismissPopup = async () => {
    if (!adminPopup) return;
    const notifId = adminPopup.notif_id || adminPopup.id;
    try {
      await api.post(`/notifications/${notifId}/read`);
      setAdminPopup(null);
    } catch (e) {
      console.error(e);
      setAdminPopup(null);
    }
  };

  const loadData = async () => {
    let mounted = true;
    try {
      const brandUserId = user?.parent_brand_id || user?.user_id || user?.id;
      // Session 34: started now, read at the end — UGC orders + company profile for "Important for you".
      const taskExtrasP = Promise.all([
        api.get('ugc/orders/brand').then((r) => (Array.isArray(r?.data) ? r.data : null)).catch(() => null),
        api.get('brands/me').then((r) => r?.data || null).catch(() => undefined),
      ]);

      // 1. Fetch campaigns from backend
      const { data: campsApi } = await api.get('campaigns?mine=true').catch(err => {
        console.error(err);
        toast.error("Failed to load campaigns.");
        return { data: [] };
      });
      const campaignsList = Array.isArray(campsApi) ? campsApi : [];
      const campaignsCount = campaignsList.length;
      if (mounted) setCampaigns(campaignsList);

      // Fetch active banners from Supabase public.banners table
      try {
        const { data: bannersDb, error: bannersErr } = await supabase
          .from('banners')
          .select('*')
          .eq('active', true);

        if (!bannersErr && bannersDb && Array.isArray(bannersDb)) {
          const now = new Date();
          const validBanners = bannersDb.filter(b => {
            const target = (b.target_dashboard || '').toLowerCase();
            const matchesTarget = target === 'brand' || target === 'all' || target === 'both';
            if (!matchesTarget) return false;

            if (b.active === false) return false;

            if (b.start_date) {
              const startDate = new Date(b.start_date);
              if (startDate > now) return false;
            }

            if (b.end_date) {
              const endDate = new Date(b.end_date);
              if (typeof b.end_date === 'string' && b.end_date.length === 10) {
                endDate.setHours(23, 59, 59, 999);
              }
              if (endDate < now) return false;
            }

            return true;
          });

          if (mounted) setBanners(validBanners);
        } else {
          if (mounted) setBanners([]);
        }
      } catch (bannerErr) {
        console.warn("Failed to query public.banners from Supabase:", bannerErr);
        if (mounted) setBanners([]);
      }

      // 2. Calculate real counts & trends for current vs previous 30-day period
      const nowMs = Date.now();
      const period30Ms = 30 * 24 * 60 * 60 * 1000;
      const period60Ms = 60 * 24 * 60 * 60 * 1000;

      // Check account creation timestamp to verify if 30-day historical comparison data exists
      let brandCreatedAtMs = user?.created_at ? new Date(user.created_at).getTime() : null;
      if (!brandCreatedAtMs) {
        const { data: bp } = await supabase
          .from('brand_profiles')
          .select('created_at')
          .eq('user_id', brandUserId)
          .maybeSingle();
        if (bp?.created_at) {
          brandCreatedAtMs = new Date(bp.created_at).getTime();
        }
      }

      // Account must be at least 30 days old to have a full previous 30-day comparison window
      const hasHistoricalData = brandCreatedAtMs ? (nowMs - brandCreatedAtMs >= period30Ms) : false;

      // Query campaigns from Supabase with created_at
      const { data: campaignsDb } = await supabase
        .from('campaigns')
        .select('campaign_id, created_at')
        .eq('brand_user_id', brandUserId);

      const dbCampaignsList = campaignsDb || [];
      const totalCampaigns = Math.max(campaignsList.length, dbCampaignsList.length);

      let currCampaigns = 0;
      let prevCampaigns = 0;
      (dbCampaignsList.length > 0 ? dbCampaignsList : campaignsList).forEach(c => {
        if (!c.created_at) return;
        const cat = new Date(c.created_at).getTime();
        if (cat >= nowMs - period30Ms) {
          currCampaigns++;
        } else if (cat >= nowMs - period60Ms) {
          prevCampaigns++;
        }
      });

      // Query campaign applications for brand's campaigns
      const campaignIds = (dbCampaignsList.length > 0 ? dbCampaignsList : campaignsList).map(c => c.campaign_id).filter(Boolean);
      let totalApplicants = 0;
      let currApplicants = 0;
      let prevApplicants = 0;

      if (campaignIds.length > 0) {
        // Session 25: through the server — the browser no longer reads campaign_applications.
        const appsList = await api.get('/brands/me/application-stats').then((r) => r?.data?.applications || []).catch(() => []);
        totalApplicants = appsList.length;
        if (mounted) setTaskApplications(appsList);
        appsList.forEach(a => {
          const at = a.applied_at || a.created_at;
          if (!at) return;
          const appTime = new Date(at).getTime();
          if (appTime >= nowMs - period30Ms) {
            currApplicants++;
          } else if (appTime >= nowMs - period60Ms) {
            prevApplicants++;
          }
        });
      }

      // Query deals
      // Through the server (session 22): the browser may no longer read `deals` directly.
      const dealsList = await api.get('/brands/me/deal-stats').then((r) => r?.data?.deals || []).catch(() => []);
      const activeDeals = dealsList.filter(d => d.status !== 'COMPLETED' && d.status !== 'DISPUTED').length;

      let currDeals = 0;
      let prevDeals = 0;
      dealsList.forEach(d => {
        if (!d.created_at) return;
        const dt = new Date(d.created_at).getTime();
        if (dt >= nowMs - period30Ms) {
          currDeals++;
        } else if (dt >= nowMs - period60Ms) {
          prevDeals++;
        }
      });

      // Query transactions / spent amount
      let totalSpent = 0;
      let currSpent = 0;
      let prevSpent = 0;

      try {
        const { data: txns } = await api.get('transactions').catch(err => {
          console.error(err);
          toast.error("Failed to load transactions.");
          return { data: [] };
        });
        if (txns && Array.isArray(txns)) {
          const completedTxns = txns.filter(t => t.status === 'SUCCESS' || t.status === 'PAID');
          completedTxns.forEach(t => {
            const amt = Number(t.gross_amount || t.amount || 0);
            totalSpent += amt;
            const tt = t.created_at ? new Date(t.created_at).getTime() : 0;
            if (tt >= nowMs - period30Ms) {
              currSpent += amt;
            } else if (tt >= nowMs - period60Ms) {
              prevSpent += amt;
            }
          });
        }
      } catch (err) {
        console.warn("Failed to load transactions for brand dashboard spent:", err);
      }

      const calcTrend = (curr, prev) => {
        if (!hasHistoricalData) return null;
        if (prev > 0) {
          const diff = curr - prev;
          const pct = Math.round((diff / prev) * 100);
          if (pct > 0) {
            return { trend: `+${pct}%`, trendValue: "vs prev 30d", isPositive: true, isNegative: false };
          } else if (pct < 0) {
            return { trend: `${pct}%`, trendValue: "vs prev 30d", isPositive: false, isNegative: true };
          } else {
            return { trend: "0%", trendValue: "No change", isPositive: false, isNegative: false };
          }
        } else {
          if (curr > 0) {
            return { trend: `+${curr}`, trendValue: "new this period", isPositive: true, isNegative: false };
          } else {
            return { trend: "0%", trendValue: "No change", isPositive: false, isNegative: false };
          }
        }
      };

      if (mounted) {
        setStats({
          campaignsCount: totalCampaigns,
          applicantsCount: totalApplicants,
          dealsCount: activeDeals,
          amountSpent: totalSpent,
          campaignsTrend: calcTrend(currCampaigns, prevCampaigns),
          applicantsTrend: calcTrend(currApplicants, prevApplicants),
          dealsTrend: calcTrend(currDeals, prevDeals),
          spentTrend: calcTrend(currSpent, prevSpent)
        });
      }

      // 4. Fetch KYC corporate verification from brand_kyc table directly
      // Through the server (session 22): the browser may no longer read `brand_kyc` directly.
      const kycDb = await api.get('/verifications/me').then((r) => (r?.data?.status ? { status: r.data.status } : null)).catch(() => null);

      if (mounted) {
        if (kycDb) {
          const status = kycDb.status || undefined;
          setKycStatusText(status);
          if (status === "approved" || status === "APPROVED") {
            setKycVerified(true);
          } else {
            setKycVerified(false);
          }
        } else {
          setKycStatusText("");
          setKycVerified(false);
        }
      }

      // 5. Fetch chat threads for unread messages
      const { data: threadsData } = await api.get('chat/v2/threads').catch(err => {
        console.error(err);
        toast.error("Failed to load chat threads.");
        return { data: [] };
      });
      if (mounted && Array.isArray(threadsData)) {
        setTaskThreads(threadsData);
        const unreadThreads = threadsData.filter(t => t.unread_brand || t.unread === true || (t.last_message_sender && t.last_message_sender !== user?.user_id && !t.read));
        setHasUnreadMessages(unreadThreads.length > 0);
        setChatUnreadCount(unreadThreads.length);
      }

      // Session 34: UGC orders + company profile for "Important for you".
      const [ugcOrdersList, brandRow] = await taskExtrasP;
      if (mounted) {
        if (ugcOrdersList) setTaskUgcOrders(ugcOrdersList);
        if (brandRow !== undefined) setBrandProfileRow(brandRow);
        setTasksLoaded(true);
      }

      // 6. Fetch Brand Top Performers
      try {
        const { data: topPerfData } = await api.get('brand/top-performers').catch(() => ({ data: [] }));
        if (mounted) {
          setTopPerformers(Array.isArray(topPerfData) ? topPerfData : []);
        }
      } catch (err) {
        if (mounted) setTopPerformers([]);
      }

    } catch (e) {
      console.warn("Failed retrieving brand metrics", e);
    } finally {
      if (mounted) setLoading(false);
    }
  };

  const loadNotifications = async () => {
    if (!user) return;
    try {
      // Through the server (session 22): the browser may no longer read `notifications` directly.
      const all = await api.get('/notifications').then((r) => (Array.isArray(r?.data) ? r.data : [])).catch(() => []);
      const notifs = all.slice(0, 20);
      const uCount = all.filter((n) => !n.read && !n.is_read).length;

      if (notifs && notifs.length > 0) {
        setNotifications(notifs);
        setUnreadCount(uCount || 0);
        const adminCustomMsg = notifs.find(n => n.type === 'admin_custom_message' && !n.read);
        if (adminCustomMsg) {
          setAdminPopup(adminCustomMsg);
        }
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.warn("Could not fetch brand notifications", err);
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      if (user) {
        await ownDb
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.user_id);
      }
    } catch (e) {
      console.warn(e);
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  // Session 34 (Ravi): "Important for you" = real brand tasks only, same card as the creator
  // dashboard. Order + sources: src/lib/brandTasks.js. Desktop only (mobile = BrandHomeMobile).
  const importantTasks = React.useMemo(() => buildBrandTasks({
    ugcOrders: taskUgcOrders,
    threads: taskThreads,
    applications: taskApplications,
    campaigns,
    kycStatus: kycStatusText,
    kycVerified,
    profile: brandProfileRow,
    profileLoaded: tasksLoaded && brandProfileRow !== null,
  }), [taskUgcOrders, taskThreads, taskApplications, campaigns, kycStatusText, kycVerified, brandProfileRow, tasksLoaded]);
  const handleTaskAction = (task) => {
    if (task?.action?.to) navigate(task.action.to);
  };

  useEffect(() => {
    loadData();
    loadNotifications();

    if (!user) return;
    // Live updates over our own authenticated socket (session 22) instead of Supabase realtime,
    // which needed the notifications table to be readable by anyone.
    // Session 31: one shared connection per tab (src/lib/sharedSocket.js).
    const socket = acquireSocket(user.user_id);
    const onNotif = (notif) => {
      if (!notif || notif.user_id !== user.user_id) return;
      const id = notif.notif_id || notif.id;
      setNotifications((n) => (n.some((x) => (x.notif_id || x.id) === id) ? n : [notif, ...n]));
      setUnreadCount((c) => c + 1);
    };
    socket.on("new_notification", onNotif);

    return () => socket.release();
  }, [user?.user_id]);

  // Session 28: new applicants, deals, KYC decisions → counts and tasks update without a refresh.
  useLiveRefresh(() => loadData(), { types: ["application", "deal", "kyc", "verification", "campaign", "payment", "escrow"], intervalMs: 120000 });

  // Rotators for carousels
  useEffect(() => {
    const statInterval = setInterval(() => {
      setCurrentStatIndex((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(statInterval);
  }, []);

  const displayBanners = banners.length > 0 ? banners : brandHeroBannersList;

  useEffect(() => {
    if (displayBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % displayBanners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [displayBanners.length]);

  // Entrance
  useEffect(() => {
    if (!loading && containerRef.current) {
      // Session 37: blocks fade in once data is ready (shared motion, GSAP removed)
      return revealChildren(containerRef.current.querySelectorAll(".gsap-reveal"));
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="w-full max-w-none animate-pulse pb-8">
        <div className="h-10 bg-gray-200 dark:bg-zinc-800 rounded-xl w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1,2,3,4].map(k => (
            <div key={k} className="h-28 bg-gray-200 dark:bg-zinc-800 rounded-3xl p-5 border border-[var(--border-default)]"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-96 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
          <div className="h-96 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
        </div>
      </div>
    );
  }

  const localHour = new Date().getHours();
  const timeGreeting = localHour < 12 ? "Good Morning" : localHour < 17 ? "Good Afternoon" : "Good Evening";
  const rawBrandName = user?.name || user?.full_name || user?.company_name || user?.companyName || user?.display_name || user?.displayName || user?.email?.split('@')[0] || "Brand Partner";
  const cleanBrandName = typeof rawBrandName === 'string' ? rawBrandName.trim() : String(rawBrandName || '').trim();
  const brandName = cleanBrandName ? (cleanBrandName.split(/\s+/)[0] || cleanBrandName) : "Brand Partner";



  // 4 Stats list with real-time sparkline approximations
  const customStatsData = [
    { 
      label: "Total Campaigns", 
      value: stats.campaignsCount, 
      trendInfo: stats.campaignsTrend,
      color: "var(--violet)", 
      chartData: stats.campaignsCount > 0 ? [{v: 0},{v: Math.max(0, stats.campaignsCount * 0.3)},{v: Math.max(1, stats.campaignsCount * 0.7)},{v: stats.campaignsCount}] : [{v: 0},{v: 0},{v: 0},{v: 0}] 
    },
    { 
      label: "Applicants Pitched", 
      value: stats.applicantsCount, 
      trendInfo: stats.applicantsTrend,
      color: "#EC4899", 
      chartData: stats.applicantsCount > 0 ? [{v: 0},{v: Math.max(1, stats.applicantsCount * 0.4)},{v: Math.max(2, stats.applicantsCount * 0.8)},{v: stats.applicantsCount}] : [{v: 0},{v: 0},{v: 0},{v: 0}] 
    },
    { 
      label: "Active Collaborations", 
      value: stats.dealsCount, 
      trendInfo: stats.dealsTrend,
      color: "#10B981", 
      chartData: stats.dealsCount > 0 ? [{v: 0},{v: Math.max(0, stats.dealsCount * 0.3)},{v: Math.max(1, stats.dealsCount * 0.6)},{v: stats.dealsCount}] : [{v: 0},{v: 0},{v: 0},{v: 0}] 
    },
    { 
      label: "SLA Amount Spent", 
      value: stats.amountSpent, 
      prefix: "₹", 
      format: true, 
      trendInfo: stats.spentTrend,
      color: "#F59E0B", 
      chartData: stats.amountSpent > 0 ? [{v: 0},{v: stats.amountSpent * 0.3},{v: stats.amountSpent * 0.75},{v: stats.amountSpent}] : [{v: 0},{v: 0},{v: 0},{v: 0}] 
    }
  ];

  return (
    <PullToRefresh
      onRefresh={loadData}
      pullingText="Pull to refresh feed"
      releaseText="Release to sync campaigns & deals"
      refreshingText="Fetching latest collaboration updates..."
      successText="Brand collaborations & stats synced"
      className="w-full"
    >
      <div ref={containerRef} className="text-[var(--text-primary)] text-left w-full max-w-none relative overflow-x-hidden pb-8" data-testid="brand-dashboard">
      {/* Background Decorative Radial Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--violet)]/4 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/2 rounded-full filter blur-3xl pointer-events-none" />

      {/* Header section with brand greeting */}
      <div className="hidden md:flex mb-6 justify-between items-center relative z-40 gsap-reveal">
        <div className="flex items-center gap-3">
          <div className="hidden md:block w-10 h-10 rounded-full overflow-hidden border border-[var(--border-default)] relative shrink-0">
             <img 
               src={user?.photo || undefined} 
               alt="Brand Logo" 
               className="w-full h-full object-cover" 
             />
          </div>
          <div>
            <h2 className={"text-lg sm:text-xl font-bold tracking-tight"}>
              {timeGreeting}, Team {brandName}
            </h2>
            <div className="hidden md:flex text-[11px] text-[var(--text-secondary)] items-center gap-1.5 flex-wrap">
              Console status: {kycVerified ? (
                <Badge variant="success">Approved Partner</Badge>
              ) : (kycStatusText?.toUpperCase() === "PENDING" || kycStatusText?.toUpperCase() === "UNDER_REVIEW") ? (
                <Badge variant="info">KYC Under Review</Badge>
              ) : (
                <Badge variant="warning">KYC Unverified</Badge>
              )}
  
              <TrustBadgeRotator page="brandDashboard" className="hidden md:block" />
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button 
            onClick={() => navigate("/brand/inbox")}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-[12px] sm:rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] flex items-center justify-center relative shadow-sm hover:bg-[var(--bg-elevated)] transition-all cursor-pointer"
            title="Brand Inbox"
          >
            <MessageCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-secondary)]" />
            {chatUnreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-[var(--violet)] rounded-full text-white text-[8px] sm:text-[10px] font-bold flex items-center justify-center border border-white animate-pulse">
                {chatUnreadCount}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* KYC Warning / Status Banner */}
      {!kycVerified && showKycBanner && (
        <>
          {(kycStatusText === "pending" || kycStatusText === "PENDING" || kycStatusText === "UNDER_REVIEW") ? (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-blue-500/5 border border-blue-500/25 rounded-2xl text-blue-700 gap-3 relative z-10 gsap-reveal">
              <div className="flex items-start gap-3">
                <Clock className="text-blue-700 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-bold text-xs text-blue-300">Corporate KYC Compliance check Under Review ⏳</p>
                  <p className="text-[10px] text-blue-700/80 mt-1 leading-relaxed">
                    Our compliance managers are validating your billing details. Resubmission is locked during verification.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <Link to="/kyc/status" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-xl transition-all shadow-md">
                  Check Status
                </Link>
                <button onClick={() => setShowKycBanner(false)} className="p-1 hover:bg-blue-500/10 rounded-lg text-blue-700/70 hover:text-blue-700 cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-amber-500/5 border border-amber-500/25 rounded-2xl text-amber-600 gap-3 relative z-10 gsap-reveal">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-bold text-xs text-amber-600">Corporate Identity Verification is Pending</p>
                  <p className="text-[10px] text-amber-600/80 mt-1 leading-relaxed">
                    Please complete your business registration upload (GSTIN / Corporate PAN) to unlock payments and recruit premium verified creators.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <Link to="/brand/kyc" className="px-3 py-1.5 bg-amber-500 text-[var(--bg-base)] text-[10px] font-bold rounded-xl transition-all shadow-md hover:scale-[1.02] cursor-pointer">
                  Complete KYC Now
                </Link>
                <button onClick={() => setShowKycBanner(false)} className="p-1 hover:bg-amber-500/10 rounded-lg text-amber-600/70 hover:text-amber-600 cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* HERO BANNER SECTION (lg-span-3) + IMPORTANT FOR YOU (lg-span-1) */}
      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8 relative z-10 gsap-reveal">
        
        {/* Left: Auto-rotating brand marketing carousel (standard 3:1 aspect ratio matching 1200x400 banner spec) */}
        <div className="lg:col-span-3">
          <div className="bg-[var(--bg-card)] rounded-[16px] lg:rounded-[24px] relative overflow-hidden flex flex-col justify-center border border-[var(--border-default)] w-full aspect-[2.8/1] sm:aspect-[3/1] min-h-[120px] max-h-[300px] group shadow-md">
             
               <>
               {(banners.length > 0 ? banners : brandHeroBannersList).map((banner, idx) => {
                 const ctaUrl = banner.cta_url || banner.link_url || banner.link;
                 const hasLink = Boolean(ctaUrl && ctaUrl !== "#");
                 const isCurrent = idx === currentBannerIdx;
                 return (
                   <div 
                     key={banner.id || idx} 
                     onClick={() => {
                       if (hasLink) {
                         if (ctaUrl.startsWith('http')) {
                           window.open(ctaUrl, '_blank');
                         } else {
                           navigate(ctaUrl);
                         }
                       }
                     }}
                     className={`absolute inset-0 transition-all duration-700 ${isCurrent ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 pointer-events-none scale-95'} ${hasLink ? 'cursor-pointer' : ''}`}
                   >
                     <img 
                       src={banner.image_url || banner.imgUrl || banner.image} 
                       alt={banner.title || "Banner"} 
                       className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-[4000ms] ease-out" 
                       referrerPolicy="no-referrer"
                     />
                   </div>
                 );
               })}
               
               {/* Slider Dots */}
               {(banners.length > 0 ? banners : brandHeroBannersList).length > 1 && (
                 <div className="absolute bottom-2 sm:bottom-4 left-4 md:left-10 flex items-center gap-1.5 z-20">
                   {(banners.length > 0 ? banners : brandHeroBannersList).map((_, idx) => (
                     <button 
                       key={idx}
                       onClick={(e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         setCurrentBannerIdx(idx);
                       }}
                       className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${idx === currentBannerIdx ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/80"}`}
                       title={`Slide ${idx + 1}`}
                     />
                   ))}
                 </div>
               )}
               </>
 
          </div>
        </div>

        {/* Right: Important for you (session 34 — same card as the creator dashboard) */}
        <div className="hidden sm:block lg:col-span-1 min-w-0 md:h-[260px] lg:h-[280px]" data-testid="brand-important-for-you">
          <ImportantForYou tasks={importantTasks} onAction={handleTaskAction} loading={!tasksLoaded && importantTasks.length === 0} />
        </div>
      </div>

      {/* Mobile 2-Column Compact Stats & Important Row */}
      <div className="sm:hidden grid grid-cols-2 gap-3 mb-6 relative z-10 gsap-reveal">
         {/* Left Box: Stats Auto-Scroller */}
         <div className="bg-[var(--bg-card)] rounded-[16px] p-2.5 sm:p-3 border border-[var(--border-default)] shadow-sm flex flex-col relative aspect-square overflow-hidden">
            <div className="mb-2 shrink-0">
               <h4 className="text-xs font-bold">Stats</h4>
               <p className="text-[9px] font-medium mt-0.5 leading-snug text-gray-500">Your progress</p>
            </div>
            <div className="flex-1 relative flex flex-col justify-center">
               <AnimatePresence mode="wait">
                  {customStatsData[currentStatIndex] && (() => {
                     const s = customStatsData[currentStatIndex];
                     return (
                        <motion.div key={currentStatIndex} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.35 }} className="flex flex-col items-center text-center">
                           <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{s.label}</span>
                           <div className="font-mono font-bold tracking-tight text-lg my-0.5 text-gray-900">
                              <AnimatedNumber value={s.value} format={s.format} prefix={s.prefix || ""} />
                           </div>
                            {s.trendInfo && (
                               <span className={`inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                                  s.trendInfo.isPositive 
                                     ? "text-emerald-600 bg-emerald-50" 
                                     : s.trendInfo.isNegative
                                     ? "text-rose-600 bg-rose-50"
                                     : "text-gray-500 bg-gray-100"
                               }`}>
                                  {s.trendInfo.isPositive ? (
                                     <TrendingUp size={8} />
                                  ) : s.trendInfo.isNegative ? (
                                     <TrendingDown size={8} />
                                  ) : (
                                     <Minus size={8} />
                                  )}
                      
                                  <span>{s.trendInfo.trend}</span>
                               </span>
                           )}
                
                        </motion.div>
                     );
                  })()}
               </AnimatePresence>
            </div>
            {/* Slider Dots */}
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-20">
               {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${idx === currentStatIndex ? "w-4 bg-[var(--violet)]" : "w-1.5 bg-neutral-200"}`} />
               ))}
            </div>
         </div>

         {/* Session 34: the old small "Important For You" box was here (never shown — phones get
             BrandHomeMobile). The real card is the desktop one above. */}
      </div>

      {/* STATS ROW WITH SPARKLINE CHARTS (Desktop Only) */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 relative z-10 gsap-reveal">
         {customStatsData.map((s, i) => (
           <div 
             key={i} 
             className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[24px] pt-5 px-5 pb-0 shadow-sm relative overflow-hidden group min-h-[145px] flex flex-col justify-between hover:border-[var(--text-tertiary)]/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.02)] transition-all cursor-default"
           >
             
             <div className="relative z-10 flex flex-col items-start">
               <span className={'text-[10px] font-bold uppercase tracking-wider'}>{s.label}</span>
               <div className={`font-mono font-bold tracking-tight text-lg my-1.5`}>
                 <AnimatedNumber value={s.value} format={s.format} prefix={s.prefix} />
               </div>
               
               {/* Spark trend badge */}
               {s.trendInfo ? (
                 <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[9px] font-bold ${
                   s.trendInfo.isPositive 
                     ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" 
                     : s.trendInfo.isNegative
                     ? "bg-rose-50 text-rose-700 border-rose-200/50"
                     : "bg-gray-100/70 text-gray-500 border-gray-200/50"
                 }`}>
                   {s.trendInfo.isPositive ? (
                     <TrendingUp size={10} />
                   ) : s.trendInfo.isNegative ? (
                     <TrendingDown size={10} />
                   ) : (
                     <Minus size={10} />
                   )}
       
                   <span>{s.trendInfo.trend}</span>
                   {s.trendInfo.trendValue && <span className="opacity-75 ml-0.5">({s.trendInfo.trendValue})</span>}
                 </div>
               ) : null}
             </div>
             
             {/* Dynamic Recharts Sparkline at the Bottom */}
             <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none opacity-60 group-hover:opacity-90 mt-auto translate-y-1 group-hover:translate-y-0 transition-all duration-300">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={s.chartData} margin={{ top: 0, left: 0, right: 0, bottom: 0 }}>
                   <defs>
                     <linearGradient id={`brand-gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                       <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                     </linearGradient>
                   </defs>
                   <Area 
                     type="monotone" 
                     dataKey="v" 
                     stroke={s.color} 
                     strokeWidth={2} 
                     fillOpacity={1} 
                     fill={`url(#brand-gradient-${i})`} 
                   />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
           </div>
         ))}
      </div>
      
      <TrustedBrandsWidget userType="brand" />

      {/* QUICK ACTIONS PANEL (Bento Grid) */}
      <div className="mb-10 relative z-10 gsap-reveal">
        <QuickActions />
      </div>

      {/* ACTIVE CAMPAIGNS SLIDER SECTION (Full Width) */}
      <div className="mb-10 relative z-10 gsap-reveal w-full">
        <CampaignMiniList campaigns={campaigns} />
      </div>

      {/* TOP PERFORMING PARTNERS INSIGHTS WIDGET */}
      <div className="mb-10 relative z-10 gsap-reveal">
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
            <div>
              <h3 className="font-sans font-bold text-xl text-[var(--text-primary)] flex items-center gap-2">
                🏆 Top Performing Partners
                <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Beta
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 font-normal leading-tight">
                Your highest-scoring creator partners, ranked by verified campaign audience reach, timeliness, and satisfaction.
              </p>
            </div>
            {topPerformers.length > 0 && (
              <span className="text-xs font-bold text-[var(--text-primary)] bg-[var(--violet)]/10 px-3 py-1 rounded-full mt-2 sm:mt-0">
                {topPerformers.length} verified creators
              </span>
            )}
          </div>

          {topPerformers.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50">
              <p className="text-xs font-semibold text-gray-400">
                This feature is still in training/beta.
              </p>
              <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                We're refining how top partners are ranked. Check back soon — this section will populate automatically once ready.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topPerformers.map((item, index) => {
                return (
                  <div 
                    key={item.deal_id || index}
                    className="flex flex-col justify-between p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--violet)]/30 transition-all hover:shadow-xs"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        {item.creator_avatar ? (
                          <img 
                            src={item.creator_avatar} 
                            alt={item.creator_name} 
                            className="w-11 h-11 rounded-full object-cover border border-gray-100" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-[var(--violet)]/10 text-[var(--text-primary)] flex items-center justify-center font-bold font-sans text-sm shrink-0">
                            {item.creator_name?.charAt(0).toUpperCase()}
                          </div>
                        )}
            
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-[var(--text-primary)] leading-tight">
                              {item.creator_name}
                            </span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                              item.performance_tier === "PLATINUM" ? "bg-purple-100 text-purple-700" :
                              item.performance_tier === "GOLD" ? "bg-amber-100 text-amber-700" :
                              item.performance_tier === "SILVER" ? "bg-slate-100 text-slate-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              {item.performance_tier}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            @{item.instagram_handle}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4 bg-white/50 p-3 rounded-xl border border-gray-100">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-400 font-medium">Performance Score</span>
                          <EstimateValue creator={item} kind="performance" className="font-mono font-bold text-xs text-gray-800" pillClassName="text-[8px]" />
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-400 font-medium">Verified Reach</span>
                          <span className="font-mono font-bold text-xs text-gray-800">{(item.delivered_reach || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-400 font-medium">Delivery Efficiency</span>
                          <span className="font-mono font-bold text-xs text-emerald-600">
                            {item.promised_reach > 0 ? `+${Math.round((item.delivered_reach / item.promised_reach) * 100)}%` : '+0%'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        navigate(`/chat/${item.creator_id}`);
                      }}
                      className="w-full py-2.5 bg-white border border-[var(--violet)]/20 hover:border-[var(--violet)] hover:bg-[var(--violet)]/5 text-[var(--text-primary)] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                       Re-Collaborate
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Admin Custom Message Popup */}
      <AnimatePresence>
        {adminPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleDismissPopup}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-white border border-gray-100 rounded-3xl p-6 shadow-2xl z-10 font-sans overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#A855F7] to-[#C084FC]" />
              
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-purple-50 rounded-2xl text-[var(--text-primary)] shrink-0">
                  <Bell size={24} className="animate-bounce" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-widest block mb-1">Official Notification</span>
                  <h4 className="text-lg font-bold text-gray-900 leading-tight">Message from YBEX Admin</h4>
                </div>
                <button 
                  onClick={handleDismissPopup}
                  className="ml-auto p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 mb-6">
                <p className="text-sm font-semibold text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {adminPopup.message}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={handleDismissPopup}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition-colors shadow-md"
                >
                  Got it, thanks!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </PullToRefresh>
  );
}

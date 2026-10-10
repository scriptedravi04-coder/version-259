import React, { Suspense } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate, useParams, useNavigationType } from "react-router-dom";
import { Toaster } from "sonner";
import { motion, MotionConfig } from "framer-motion";
import { pageMotion, pageDirection } from "./lib/motion";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import useIsMobile from "./hooks/useIsMobile";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LoadingProvider } from "./contexts/LoadingContext";
import GlobalLoader from "./components/layout/GlobalLoader";
import { useLoading } from "./contexts/LoadingContext";
import ColdStartSplash from "./components/layout/ColdStartSplash";
import AppLaunchSplash from "./components/layout/AppLaunchSplash";
import NotificationPopup from "./components/NotificationPopup";
import TermsUpdateGate from "./components/legal/TermsUpdateGate";
import WhatsNewPopup from "./components/whatsNew/WhatsNewPopup";
import PushPermissionScreen from "./components/push/PushPermissionScreen";
import ReferralClaimer from "./components/referral/ReferralClaimer";
import { ReferralLanding, CreatorCodeLanding } from "./components/referral/ReferralLinkRoutes";
import GoogleAnalytics from "./components/GoogleAnalytics";
import Layout from "./components/layout/Layout";
import PageSkeleton from "./components/layout/PageSkeleton";
import PageErrorBoundary from "./components/PageErrorBoundary";
import StatusBarSync from "./components/layout/StatusBarSync";
import { isStandalone } from "./lib/standalone";

// Immediate critical routes for instant first paint
import Landing from "./pages/dashboard/Landing";
import Login from "./pages/auth/Login";
import AdminQuickEntry from "./pages/admin/AdminQuickEntry";
import Signup from "./pages/auth/Signup";
import Dashboard from "./pages/dashboard/Dashboard";
import { isFinishLater } from "./lib/onboardingLater";

// Helper to safely load dynamic imports with auto-retry and cache-busting on stale bundle chunks
const isChunkLoadError = (err) => {
  const msg = (err?.message || String(err || "")).toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("invalid hook call") ||
    msg.includes("reading 'usecontext'") ||
    err?.name === "ChunkLoadError"
  );
};

const lazyWithRetry = (componentImport) =>
  React.lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.warn("[App] Dynamic import failed, retrying module...", error);
      // Wait briefly before retrying
      await new Promise((r) => setTimeout(r, 400));
      try {
        return await componentImport();
      } catch (retryErr) {
        if (isChunkLoadError(retryErr)) {
          const lastReload = parseInt(sessionStorage.getItem("last_chunk_reload_ts") || "0", 10);
          const now = Date.now();
          if (now - lastReload > 15000) {
            sessionStorage.setItem("last_chunk_reload_ts", String(now));
            console.info("[App] Chunk loading error detected; automatically reloading page to get fresh assets...");
            window.location.reload();
            return new Promise(() => {}); // prevent further error propagation while reloading
          }
        }
        throw retryErr;
      }
    }
  });

// Code-split dynamic routes for ultra-fast initial bundle loading
const VerifyEmail = lazyWithRetry(() => import("./pages/auth/VerifyEmail"));
const AppWelcome = lazyWithRetry(() => import("./pages/app/AppWelcome"));
const AppContinue = lazyWithRetry(() => import("./pages/app/AppContinue"));
const ForgotPassword = lazyWithRetry(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/auth/ResetPassword"));
const AuthCallback = lazyWithRetry(() => import("./pages/auth/AuthCallback"));
const Onboarding = lazyWithRetry(() => import("./pages/auth/Onboarding"));
const AccountStatus = lazyWithRetry(() => import("./pages/auth/AccountStatus"));
const Explore = lazyWithRetry(() => import("./pages/dashboard/Explore"));
const CreatorPublicView = lazyWithRetry(() => import("./pages/creator/CreatorPublicView"));
const PublicCreatorApply = lazyWithRetry(() => import("./pages/creator/PublicCreatorApply"));
const CreatorProfile = lazyWithRetry(() => import("./pages/creator/CreatorProfile"));
const CreatorSettings = lazyWithRetry(() => import("./pages/creator/CreatorSettings"));
const BrandProfile = lazyWithRetry(() => import("./pages/brand/BrandProfile"));
const BrandPublicView = lazyWithRetry(() => import("./pages/brand/BrandPublicView"));
const BrandSettings = lazyWithRetry(() => import("./pages/brand/BrandSettings"));
// const Dashboard removed
const Campaigns = lazyWithRetry(() => import("./pages/campaigns/Campaigns"));
const CampaignDetail = lazyWithRetry(() => import("./pages/campaigns/CampaignDetail"));
const Collabs = lazyWithRetry(() => import("./pages/collabs/Collabs"));
const DealDetail = lazyWithRetry(() => import("./pages/collabs/DealDetail"));
const AddCollab = lazyWithRetry(() => import("./pages/collabs/AddCollab"));
const UploadedCollab = lazyWithRetry(() => import("./pages/collabs/UploadedCollab"));
const Leaderboard = lazyWithRetry(() => import("./pages/dashboard/Leaderboard"));
const Notifications = lazyWithRetry(() => import("./pages/dashboard/Notifications"));
const Settings = lazyWithRetry(() => import("./pages/dashboard/Settings"));
const Earnings = lazyWithRetry(() => import("./pages/dashboard/Earnings"));
const Chat = lazyWithRetry(() => import("./pages/dashboard/Chat"));
const Admin = lazyWithRetry(() => import("./pages/admin/Admin"));
const AdminLogin = lazyWithRetry(() => import("./pages/admin/AdminLogin"));
const UgcOrders = lazyWithRetry(() => import("./pages/ugc/UgcOrders"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/dashboard/PrivacyPolicy"));
const DeleteAccount = lazyWithRetry(() => import("./pages/legal/DeleteAccount"));
const InfoHub = lazyWithRetry(() => import("./pages/dashboard/InfoHub"));
const CreatorCampaignFlow = lazyWithRetry(() => import("./pages/creator/CreatorCampaignFlow"));
const Refer = lazyWithRetry(() => import("./pages/dashboard/Refer"));

// Help Center
const HelpCenter = lazyWithRetry(() => import("./pages/help/HelpCenter"));
const HelpCategory = lazyWithRetry(() => import("./pages/help/HelpCategory"));
const HelpTickets = lazyWithRetry(() => import("./pages/help/HelpTickets"));

// Blog & Journal Pages
const BlogIndex = lazyWithRetry(() => import("./pages/blog/BlogIndex"));
const BlogPostDetail = lazyWithRetry(() => import("./pages/blog/BlogPostDetail"));

// Brand Specific Pages
const BrandCampaigns = lazyWithRetry(() => import("./pages/brand/BrandCampaigns"));
const BrandCampaignCreate = lazyWithRetry(() => import("./pages/brand/BrandCampaignCreate"));
const BrandCampaignApplicants = lazyWithRetry(() => import("./pages/brand/BrandCampaignApplicants"));
const BrandInbox = lazyWithRetry(() => import("./pages/brand/BrandInbox"));
const BrandNotifications = lazyWithRetry(() => import("./pages/brand/BrandNotifications"));
const CreatorInbox = lazyWithRetry(() => import("./pages/creator/CreatorInbox"));
const CreatorNotifications = lazyWithRetry(() => import("./pages/creator/CreatorNotifications"));
const BrandPayments = lazyWithRetry(() => import("./pages/brand/BrandPayments"));
const BrandKyc = lazyWithRetry(() => import("./pages/brand/BrandKyc"));

const CreatorKyc = lazyWithRetry(() => import("./pages/creator/CreatorKyc"));
const KYCStatus = lazyWithRetry(() => import("./pages/kyc/KYCStatus"));
import { api } from "./lib/api";

// Dashboard is imported eagerly above for instant access
const PublicUGC = lazyWithRetry(() => import("./pages/ugc/PublicUGC"));
const BrandInstantUGC = lazyWithRetry(() => import("./pages/brand/BrandInstantUGC"));
const BrandUGCBriefs = lazyWithRetry(() => import("./pages/brand/BrandUGCBriefs"));
const BrandUGCPost = lazyWithRetry(() => import("./pages/brand/BrandUGCPost"));
const BrandUGCOrders = lazyWithRetry(() => import("./pages/brand/BrandUGCOrders"));
const BrandUGCPayments = lazyWithRetry(() => import("./pages/brand/BrandUGCPayments"));
const CreatorUGCBrowse = lazyWithRetry(() => import("./pages/creator/CreatorUGCBrowse"));
const CreatorUGCOrders = lazyWithRetry(() => import("./pages/creator/CreatorUGCOrders"));
const CreatorUGCEarnings = lazyWithRetry(() => import("./pages/creator/CreatorUGCEarnings"));

const BrandConstructionScene = () => (
  <div className="relative w-64 h-64 mx-auto my-6 select-none pointer-events-none drop-shadow-2xl">
    <motion.div animate={{x: [-10, 10, -10]}} transition={{duration: 6, repeat: Infinity, ease: 'easeInOut'}} className="absolute top-4 right-8 text-[var(--text-primary)]/10">
       <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 19c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5c-.179 0-.353.021-.522.062C16.48 7.618 14.417 6 12 6c-2.417 0-4.48 1.618-4.978 4.062a4.48 4.48 0 0 0-.522-.062C4.015 10 2 12.015 2 14.5S4.015 19 6.5 19h11z"/></svg>
    </motion.div>
    <motion.div animate={{x: [15, -5, 15]}} transition={{duration: 5, repeat: Infinity, ease: 'easeInOut'}} className="absolute top-12 left-0 text-[var(--text-primary)]/5">
       <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 19c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5c-.179 0-.353.021-.522.062C16.48 7.618 14.417 6 12 6c-2.417 0-4.48 1.618-4.978 4.062a4.48 4.48 0 0 0-.522-.062C4.015 10 2 12.015 2 14.5S4.015 19 6.5 19h11z"/></svg>
    </motion.div>

    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-48 shadow-2xl z-10">
      <div className="bg-[var(--bg-card)] p-2 rounded-t-xl border-x-4 border-t-4 border-[#24283B] relative overflow-hidden h-28">
         <div className="absolute inset-0 bg-black rounded m-1 border border-[var(--border-default)]"></div>
      </div>
      <div className="bg-[#24283B] h-4 w-52 -ml-2 rounded-b-xl relative shadow-xl">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-[#414868] rounded-b-lg"></div>
      </div>
    </div>

    <motion.div className="absolute top-16 right-4 text-[var(--text-primary)]/20 z-0" animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>
    </motion.div>

    <div className="absolute bottom-8 left-10 w-6 h-40 bg-amber-500 rounded border-x-4 border-amber-600 z-10 flex flex-col justify-evenly items-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
      {[1,2,3,4].map(i => <div key={i} className="w-3 h-3 border-2 border-amber-600/50 rounded-sm"></div>)}
    </div>

    <div className="absolute bottom-[10.5rem] left-8 w-10 h-10 bg-[var(--bg-card)] rounded-t-lg rounded-bl-sm border-2 border-amber-500 z-20 overflow-hidden shadow-lg">
       <div className="w-full h-1/2 bg-blue-400/20 backdrop-blur border-b border-[var(--border-default)]"></div>
    </div>

    <motion.div className="absolute bottom-[11rem] left-10 w-44 h-5 bg-amber-500 border-y-4 border-amber-600 origin-left z-10 rounded-r-md shadow-lg" animate={{ rotate: [-2, 2, -2] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
      <motion.div className="absolute top-2 left-28 w-1 h-20 bg-foreground/30 flex flex-col items-center justify-end origin-top" animate={{ y: [-5, 5, -5] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <div className="w-5 h-3 bg-slate-600 rounded-t-sm shadow shadow-black border border-white/20"></div>
        <div className="w-16 h-16 bg-gradient-to-br from-[#7AA2F7] to-[#3b82f6] rounded-xl shadow-xl shadow-[#7AA2F7]/40 border-2 border-[#a7c5fb] p-2 flex items-center justify-center text-[var(--text-primary)] relative">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.5 7c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5 1.5.67 1.5 1.5zm-5 5L7 12.5 5 15v4h14v-1.5l-4.5-5.5-5 6z"/></svg>
        </div>
      </motion.div>
    </motion.div>

    <div className="absolute bottom-12 left-1/2 -translate-x-[40%] w-56 h-6 z-30 -rotate-6 overflow-hidden rounded-sm shadow-2xl shadow-black/80 border-y-2 border-amber-500 bg-amber-400">
      <motion.div className="h-full w-[200%]" animate={{ x: [0, -40] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(0,0,0,0.8) 15px, rgba(0,0,0,0.8) 30px)' }} />
    </div>

    <div className="absolute bottom-4 left-[20%] z-20 transition-transform hover:scale-110">
       <div className="w-5 h-2 bg-orange-600 rounded-full mx-auto" />
       <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[20px] border-l-transparent border-r-transparent border-b-orange-500 absolute bottom-1 left-1/2 -translate-x-1/2" />
       <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-2 bg-white rounded-sm drop-shadow-md"></div>
    </div>
    
    <div className="absolute bottom-6 right-[20%] z-20 scale-75 transform drop-shadow-lg">
       <div className="w-5 h-2 bg-orange-600 rounded-full mx-auto" />
       <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[20px] border-l-transparent border-r-transparent border-b-orange-500 absolute bottom-1 left-1/2 -translate-x-1/2" />
       <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-2 bg-white rounded-sm drop-shadow-md"></div>
    </div>
  </div>
);

const CreatorUpgradeScene = () => (
  <div className="relative w-64 h-64 mx-auto my-6 select-none pointer-events-none drop-shadow-2xl">
     <motion.div animate={{y: [40, 160], opacity: [0, 1, 0]}} transition={{duration: 0.8, repeat: Infinity, ease: 'linear'}} className="absolute top-0 right-16 w-0.5 h-16 bg-blue-400/20 rounded-full" />
     <motion.div animate={{y: [20, 150], opacity: [0, 1, 0]}} transition={{duration: 0.6, repeat: Infinity, ease: 'linear'}} className="absolute top-10 left-16 w-1 h-8 bg-purple-400/30 rounded-full" />

     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full flex items-center justify-center">
        <div className="w-24 h-24 rounded-full bg-[var(--bg-card)]/80 backdrop-blur border border-[var(--border-default)] flex items-center justify-center shadow-2xl">
           <svg className="w-8 h-8 text-blue-500/30" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
        </div>
     </div>
     
     <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-12 border border-[#9D7CFF]/20 rounded-[50%] [transform:rotate(-20deg)]" animate={{ rotateZ: [-20, -20] }}>
       <motion.div animate={{ x: [-20, 200, -20], zIndex: [0, 10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="w-3 h-3 bg-[#9D7CFF] rounded-full shadow-[0_0_15px_#9D7CFF] transform -translate-y-1.5" />
     </motion.div>

     <motion.div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center" animate={{ y: [-5, 5, -5] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
        <div className="relative w-14 h-24 bg-gradient-to-b from-white to-slate-200 rounded-t-full shadow-[0_10px_20px_rgba(0,0,0,0.5)] border border-slate-300 overflow-hidden flex flex-col items-center pt-4">
           <div className="w-6 h-6 bg-[var(--bg-card)] rounded-full border-4 border-blue-500 relative flex items-center justify-center">
             <div className="w-1.5 h-1.5 bg-[var(--bg-elevated)]0 rounded-full absolute top-0.5 left-0.5"></div>
           </div>
           <div className="absolute bottom-0 w-full h-8 bg-slate-300 border-t border-slate-400 opacity-50"></div>
        </div>
        
        <div className="absolute top-[4.5rem] -left-[14px] w-5 h-8 bg-gradient-to-tr from-red-600 to-red-500 rounded-bl-xl origin-right -rotate-12 border border-red-700 shadow-md"></div>
        <div className="absolute top-[4.5rem] -right-[14px] w-5 h-8 bg-gradient-to-tl from-red-600 to-red-500 rounded-br-xl origin-left rotate-12 border border-red-700 shadow-md"></div>
        <div className="absolute top-[5rem] left-1/2 -translate-x-1/2 w-2 h-6 bg-red-800 rounded-b-md z-[-1]"></div>

        <motion.div 
           className="w-8 h-16 bg-gradient-to-b from-orange-400 via-yellow-400 to-transparent rounded-b-full mt-[-2px] blur-[2px]"
           animate={{ scaleY: [0.9, 1.2, 0.9], opacity: [0.8, 1, 0.8] }}
           transition={{ duration: 0.1, repeat: Infinity, ease: "linear" }}
        />
     </motion.div>
  </div>
);

function ProtectedRoute({ children, requireOnboarded = true }) {
  const { user, loading } = useAuth();
  if (loading) return (
      <div className="flex flex-col min-h-screen p-6 md:p-8 bg-[var(--bg-base)] w-full">
        <PageSkeleton />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  const isAdminUser = user.role === 'admin' || user.team_role === 'sub_admin';
  // Session 39 (M8): a creator who tapped "Finish later" after the basics may use the app.
  const finishLater = (user.role || "creator") === "creator" && isFinishLater(user.user_id || user.id);
  if (requireOnboarded && !isAdminUser && !finishLater && !user.onboarded && !user.onboarding_completed && !user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return children;
}


// Session 39 (M34, Ravi): creators don't get the Explore creators page — they go Home.
function NotForCreators({ children }) {
  const { user, loading } = useAuth();
  if (loading) return children;
  if (user && (user.role || "creator") === "creator") return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
      <div className="flex flex-col min-h-screen p-6 md:p-8 bg-[var(--bg-base)] w-full">
        <PageSkeleton />
      </div>
    );
  if (!user) return <Navigate to="/ybx-admin" replace />;
  const isAdminUser = user.role === 'admin' || user.team_role === 'sub_admin';
  if (!isAdminUser) return <Navigate to="/dashboard" replace />;
  return children;
}

function BrandRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
      <div className="flex flex-col min-h-screen p-6 md:p-8 bg-[var(--bg-base)] w-full">
        <PageSkeleton />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'brand') return <Navigate to="/dashboard" replace />;
  if (!user.onboarded && !user.onboarding_completed && !user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return children;
}

// Session 37: route change = one short fade (desktop, tab switches) or a small slide on phones
// (deeper page from the right, back from the left). The old page leaves instantly, so a tap
// never waits for an animation (before: 0.35 s out + 0.35 s in on every navigation).
const PageDirectionContext = React.createContext("none");

function Page({ children }) {
  const location = useLocation();
  const direction = React.useContext(PageDirectionContext);
  const isMobile = useIsMobile();
  const isChatRoute = location.pathname.startsWith("/chat")
    || location.pathname.startsWith("/brand/inbox")
    || location.pathname.startsWith("/creator/inbox");
  const motionProps = pageMotion(isMobile ? direction : "none");

  return (
    <motion.div 
      className={`flex flex-col w-full relative ${isChatRoute ? 'h-full flex-1' : ''}`} 
      {...motionProps}
    >
      {/* Every route renders through <Page>, so one boundary here covers all 77 of them.
          Keyed on the pathname so navigating away from a broken page clears the error. */}
      <PageErrorBoundary routeKey={location.pathname}>
        <Suspense fallback={<PageSkeleton />}>
          {children}
        </Suspense>
      </PageErrorBoundary>
    </motion.div>
  );
}

function KycRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    async function checkStatus() {
      if (!user) return;
      try {
        const { data } = await api.get("verifications/me").catch(() => ({ data: null }));
        const status = data?.status;
        if (status === "approved" || status === "APPROVED" || status === "pending" || status === "PENDING" || status === "UNDER_REVIEW" || user.verified) {
          navigate("/kyc/status", { replace: true });
        } else if (user.role === "brand") {
          navigate("/brand/kyc", { replace: true });
        } else {
          navigate("/creator/kyc", { replace: true });
        }
      } catch (e) {
        if (user.role === "brand") {
          navigate("/brand/kyc", { replace: true });
        } else {
          navigate("/creator/kyc", { replace: true });
        }
      }
    }
    checkStatus();
  }, [user, navigate]);

  return (
    <div className="flex flex-col w-full min-h-screen bg-[var(--bg-base)] p-6 md:p-8">
      <PageSkeleton />
    </div>
  );
}

function ProfileDispatcher() {
  const { user } = useAuth();
  if (user?.role === "brand") {
    return <BrandProfile />;
  }
  return <CreatorProfile />;
}

// Unknown URLs used to redirect silently to "/", so a mistyped or stale link looked like the
// app had thrown the user out. Say what happened and offer the way back.
// Session 42: inside the installed app, "/" and "/login" (plain, no ?ref= / ?next= links) open the
// app welcome instead of the website pages. Browser tabs are unchanged.
function InstalledAppGoesToApp({ children }) {
  const location = useLocation();
  if (isStandalone() && !location.search) return <Navigate to="/app" replace />;
  return children;
}

function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-16">
      <p className="text-xs font-bold tracking-widest uppercase text-[var(--text-tertiary)]">Error 404</p>
      <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-[var(--text-primary)]">This page doesn't exist</h1>
      <p className="mt-3 max-w-md text-sm md:text-base text-[var(--text-secondary)]">The link may be old or mistyped.</p>
      <a href="/" className="mt-8 inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[var(--violet)] text-white font-bold text-sm">Go to home</a>
    </div>
  );
}

function RouteLoaderFallback() {
  // Session 30 (loader design 14b): while a page's code loads, the 2px top bar runs too.
  const loadingCtx = useLoading();
  React.useEffect(() => {
    loadingCtx?.startLoading?.();
    return () => loadingCtx?.stopLoading?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-[70vh] w-full flex flex-col items-center justify-start py-6 px-4 md:px-8">
      <PageSkeleton />
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPath = React.useRef(location.pathname);
  const direction = React.useMemo(
    () => pageDirection(prevPath.current, location.pathname, navType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.pathname]
  );
  React.useEffect(() => { prevPath.current = location.pathname; }, [location.pathname]);
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Suspense fallback={<RouteLoaderFallback />}>
      <PageDirectionContext.Provider value={direction}>
        <Routes location={location} key={location.pathname}>
          {/* Session 42: the installed app starts at /app (manifest start_url). Inside the app, the
              website landing and the website login send people there too. */}
          <Route path="/app" element={<Suspense fallback={<div className="min-h-[100dvh] bg-[#EFE9FB]" />}><AppWelcome /></Suspense>} />
          <Route path="/app/continue/:role" element={<Suspense fallback={<div className="min-h-[100dvh] bg-[#F2F2F7]" />}><AppContinue /></Suspense>} />
          <Route path="/" element={<InstalledAppGoesToApp><Layout><Page><Landing /></Page></Layout></InstalledAppGoesToApp>} />
          <Route path="/login" element={<InstalledAppGoesToApp><Layout><Page><Login /></Page></Layout></InstalledAppGoesToApp>} />
          <Route path="/forgot-password" element={<Layout><Page><ForgotPassword /></Page></Layout>} />
          <Route path="/reset-password" element={<Layout><Page><ResetPassword /></Page></Layout>} />
          <Route path="/account-status" element={<Layout><Page><AccountStatus /></Page></Layout>} />
          <Route path="/signup" element={<Layout><Page><Signup /></Page></Layout>} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/onboarding" element={<ProtectedRoute requireOnboarded={false}><Layout><Page><Onboarding /></Page></Layout></ProtectedRoute>} />
          <Route path="/creators" element={<NotForCreators><Layout><Page><Explore /></Page></Layout></NotForCreators>} />
          <Route path="/explore" element={<NotForCreators><Layout><Page><Explore /></Page></Layout></NotForCreators>} />
          <Route path="/apply-creator" element={<Page><PublicCreatorApply /></Page>} />
          <Route path="/apply" element={<Page><PublicCreatorApply /></Page>} />
          <Route path="/creator/:id" element={<Layout><Page><CreatorPublicView /></Page></Layout>} />
          <Route path="/profile" element={<ProtectedRoute><Layout><Page><ProfileDispatcher /></Page></Layout></ProtectedRoute>} />
          <Route path="/profile/overview" element={<ProtectedRoute><Layout><Page><ProfileDispatcher /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/profile" element={<ProtectedRoute><Layout><Page><CreatorProfile /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand/profile" element={<ProtectedRoute><Layout><Page><BrandProfile /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/settings" element={<ProtectedRoute><Layout><Page><CreatorSettings /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand/settings" element={<ProtectedRoute><Layout><Page><BrandSettings /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand/account" element={<BrandRoute><Layout><Page><BrandSettings /></Page></Layout></BrandRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute requireOnboarded><Layout><Page><Dashboard /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand" element={<BrandRoute><Layout><Page><Dashboard /></Page></Layout></BrandRoute>} />
          <Route path="/brand/dashboard" element={<BrandRoute><Layout><Page><Dashboard /></Page></Layout></BrandRoute>} />
          <Route path="/brand/discover" element={<Layout><Page><Explore /></Page></Layout>} />
          <Route path="/campaigns" element={<Layout><Page><Campaigns /></Page></Layout>} />
          <Route path="/campaigns/:id" element={<Layout><Page><CampaignDetail /></Page></Layout>} />
          <Route path="/deals" element={<ProtectedRoute><Layout><Page><Collabs /></Page></Layout></ProtectedRoute>} />
          <Route path="/collabs" element={<ProtectedRoute><Layout><Page><Collabs /></Page></Layout></ProtectedRoute>} />
          <Route path="/deals/:id" element={<ProtectedRoute><Layout><Page><DealDetail /></Page></Layout></ProtectedRoute>} />
          <Route path="/deals/:id/add-collab" element={<ProtectedRoute><Layout><Page><AddCollab /></Page></Layout></ProtectedRoute>} />
          <Route path="/deals/:id/uploaded-collab" element={<ProtectedRoute><Layout><Page><UploadedCollab /></Page></Layout></ProtectedRoute>} />
          <Route path="/inbox" element={<ProtectedRoute><Layout><Page><Chat /></Page></Layout></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><Layout><Page><Chat /></Page></Layout></ProtectedRoute>} />
          <Route path="/chat/:userId" element={<ProtectedRoute><Layout><Page><Chat /></Page></Layout></ProtectedRoute>} />
          {/* Session 35: some notifications link to /messages/:id (campaign approved, payment released). */}
          <Route path="/messages/:id" element={<MessagesRedirect />} />
          <Route path="/messages" element={<Navigate to="/chat" replace />} />
          {/* Session 36: referral + creator-code links */}
          <Route path="/r/:code" element={<ReferralLanding />} />
          <Route path="/code/:code" element={<CreatorCodeLanding />} />

          {/* Brand Dedicated Routes */}
          <Route path="/brand/campaigns" element={<BrandRoute><Layout><Page><BrandCampaigns /></Page></Layout></BrandRoute>} />
          <Route path="/brand/campaigns/create" element={<BrandRoute><Layout><Page><BrandCampaignCreate /></Page></Layout></BrandRoute>} />
          <Route path="/brand/campaigns/:id/applicants" element={<BrandRoute><Layout><Page><BrandCampaignApplicants /></Page></Layout></BrandRoute>} />
          <Route path="/brand/inbox" element={<BrandRoute><Layout><Page><BrandInbox /></Page></Layout></BrandRoute>} />
          <Route path="/brand/inbox/:userId" element={<BrandRoute><Layout><Page><BrandInbox /></Page></Layout></BrandRoute>} />
          <Route path="/brand/notifications" element={<BrandRoute><Layout><Page><BrandNotifications /></Page></Layout></BrandRoute>} />
          <Route path="/creator/inbox" element={<ProtectedRoute><Layout><Page><CreatorInbox /></Page></Layout></ProtectedRoute>} />
          {/* Session 41: UGC "Chat with Brand" opens /creator/inbox/<thread> — this page was missing (404). */}
          <Route path="/creator/inbox/:userId" element={<ProtectedRoute><Layout><Page><CreatorInbox /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/notifications" element={<ProtectedRoute><Layout><Page><CreatorNotifications /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand/payments" element={<BrandRoute><Layout><Page><BrandPayments /></Page></Layout></BrandRoute>} />
          <Route path="/brand/kyc" element={<BrandRoute><Layout><Page><BrandKyc /></Page></Layout></BrandRoute>} />
          
          {/* Compliance and KYC Verification Routes */}
          <Route path="/kyc" element={<ProtectedRoute><Layout><Page><KycRedirect /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/kyc" element={<ProtectedRoute><Layout><Page><CreatorKycMobileAware /></Page></Layout></ProtectedRoute>} />
          <Route path="/kyc/status" element={<ProtectedRoute><Layout><Page><KycStatusMobileAware /></Page></Layout></ProtectedRoute>} />
          
          {/* Brand UGC */}
          <Route path="/brand/ugc/instant" element={<BrandRoute><Layout><Page><BrandInstantUGC /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/briefs" element={<BrandRoute><Layout><Page><BrandInstantUGC /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/post" element={<BrandRoute><Layout><Page><BrandUGCPost /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/orders" element={<BrandRoute><Layout><Page><BrandUGCOrders /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/payments" element={<BrandRoute><Layout><Page><BrandUGCPayments /></Page></Layout></BrandRoute>} />
          <Route path="/brand/:id" element={<Layout><Page><BrandPublicView /></Page></Layout>} />
          <Route path="/brands/:id" element={<Layout><Page><BrandPublicView /></Page></Layout>} />
          
          {/* Creator UGC & Deals */}
          <Route path="/creator/ugc" element={<ProtectedRoute><Layout><Page><CreatorUGCBrowse /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/ugc/browse" element={<ProtectedRoute><Layout><Page><CreatorUGCBrowse defaultTab="browse" /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/ugc/orders" element={<ProtectedRoute><Layout><Page><CreatorUGCBrowse defaultTab="orders" /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/ugc/earnings" element={<ProtectedRoute><Layout><Page><CreatorUGCEarnings /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/deals" element={<ProtectedRoute><Layout><Page><Collabs /></Page></Layout></ProtectedRoute>} />

          <Route path="/ugc" element={<Layout><Page><PublicUGC /></Page></Layout>} />
          <Route path="/leaderboard" element={<Layout><Page><Leaderboard /></Page></Layout>} />
          <Route path="/notifications" element={<ProtectedRoute><Layout><Page><Notifications /></Page></Layout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Layout><Page><Settings /></Page></Layout></ProtectedRoute>} />
          <Route path="/earnings" element={<ProtectedRoute><Layout><Page><Earnings /></Page></Layout></ProtectedRoute>} />
          <Route path="/refer" element={<ProtectedRoute><Layout><Page><Refer /></Page></Layout></ProtectedRoute>} />
          <Route path="/admin/ybx" element={<AdminQuickEntry />} />
          <Route path="/admin" element={<AdminRoute><Layout><Page><Admin /></Page></Layout></AdminRoute>} />
          <Route path="/ybx-admin" element={<Page><AdminLogin /></Page>} />
          <Route path="/y-admin" element={<Page><AdminLogin /></Page>} />
          <Route path="/y.admin" element={<Page><AdminLogin /></Page>} />
          <Route path="/admin-login" element={<Page><AdminLogin /></Page>} />
          <Route path="/ugc-orders" element={<Layout><Page><UgcOrders /></Page></Layout>} />
          <Route path="/privacy-policy" element={<Layout><Page><PrivacyPolicy /></Page></Layout>} />
          <Route path="/delete-account" element={<Layout><Page><DeleteAccount /></Page></Layout>} />
          {/* Session 34: short legal addresses (signup used /terms and /privacy, which did not exist) */}
          <Route path="/terms" element={<Navigate to="/info/terms" replace />} />
          <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
          <Route path="/refunds" element={<Navigate to="/info/refunds" replace />} />
          <Route path="/info/:slug" element={<Layout><Page><InfoHub /></Page></Layout>} />
          <Route path="/creator-campaign-flow" element={<Layout><Page><CreatorCampaignFlow /></Page></Layout>} />
          
          {/* Blog & Journal */}
          <Route path="/blog" element={<Layout><Page><BlogIndex /></Page></Layout>} />
          <Route path="/blog/:slug" element={<Layout><Page><BlogPostDetail /></Page></Layout>} />

          {/* Help Center */}
          <Route path="/help" element={<Layout><Page><HelpCenter /></Page></Layout>} />
          <Route path="/help/category/:category" element={<Layout><Page><HelpCategory /></Page></Layout>} />
          <Route path="/help/tickets" element={<Layout><Page><HelpTickets /></Page></Layout>} />
          <Route path="/support/tickets/:ticketId" element={<Layout><Page><HelpTickets /></Page></Layout>} />

          <Route path="*" element={<Layout><Page><NotFoundPage /></Page></Layout>} />
        </Routes>
      </PageDirectionContext.Provider>
    </Suspense>
  );
}

// Session 35: on a phone, a creator's KYC opens the mobile KYC screen in Profile (same calls as
// desktop CreatorKyc: GET verifications/me, upload?bucket=kyc-documents, creator KYC submit),
// not the desktop page squeezed down. Brands and desktop keep their pages.
function CreatorKycMobileAware() {
  const isMobile = useIsMobile();
  if (isMobile) return <Navigate to="/creator/settings?section=kyc" replace />;
  return <CreatorKyc />;
}
function KycStatusMobileAware() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  if (isMobile && user?.role === "creator") return <Navigate to="/creator/settings?section=kyc" replace />;
  return <KYCStatus />;
}

// Old notification links (/messages/:threadId) open the same chat as /chat/:threadId.
function MessagesRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/chat/${encodeURIComponent(id)}` : "/chat"} replace />;
}

export default function App() {
  const [maintenance, setMaintenance] = React.useState(null);

  React.useEffect(() => {
     fetch('/api/system-status')
       .then(r => r.json())
       .then(d => setMaintenance(d))
       .catch(() => {});
  }, []);

  return (
    <div className="App">
      {/* Session 37: phones with "reduce motion" on get fades instead of slides, app-wide. */}
      <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <GoogleAnalytics />
        <ThemeProvider>
          <AuthProvider>
            <LoadingProvider>
              <ColdStartSplash />
              <AppLaunchSplash />
              <GlobalLoader />
              <NotificationPopup />
              <TermsUpdateGate />
              <WhatsNewPopup />
              <PushPermissionScreen />
              <ReferralClaimer />
              <TabWarmup />
              <StatusBarSync />
              {/* Session 43 (Ravi): the "Optimized for Desktop Experience" popup is gone — the app is built for phones now. */}
              <MaintenanceWrapper maintenance={maintenance}>
                <AnimatedRoutes />
              </MaintenanceWrapper>
      <Toaster position="top-right" theme="light" richColors />
            </LoadingProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      </MotionConfig>
    </div>
  );
}

// Session 42 (Ravi: "tapping Chats / Campaigns loads again like a website"). Once the home screen is
// up, the phone quietly downloads the pages behind the bottom tabs, so a tap opens them at once.
// Only files are fetched here — no data, no server calls.
function TabWarmup() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  React.useEffect(() => {
    if (!user?.user_id || !isMobile) return undefined;
    const isCreator = user.role === "creator";
    const pages = isCreator
      ? [() => import("./pages/creator/CreatorInbox"), () => import("./pages/campaigns/Campaigns"), () => import("./pages/creator/CreatorUGCBrowse"), () => import("./pages/creator/CreatorProfile")]
      : [() => import("./pages/brand/BrandInbox"), () => import("./pages/brand/BrandCampaigns"), () => import("./pages/dashboard/Explore"), () => import("./pages/brand/BrandProfile")];
    const t = setTimeout(() => {
      pages.forEach((load, i) => setTimeout(() => load().catch(() => {}), i * 400));
    }, 2500);
    return () => clearTimeout(t);
  }, [user?.user_id, user?.role, isMobile]);
  return null;
}

function MaintenanceWrapper({ children, maintenance }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  if (loading) return children;

  const publicRoutes = ['/', '/login', '/signup', '/register', '/onboarding', '/forgot-password', '/reset-password', '/blog'];
  if (publicRoutes.includes(location.pathname) || location.pathname.startsWith('/blog') || !user || user.role === 'admin') {
     return children;
  }

  const isCreatorMaintenance = user.role === 'creator' && maintenance?.maintenance_mode_creator;
  const isBrandMaintenance = user.role === 'brand' && maintenance?.maintenance_mode_brand;

  if (isCreatorMaintenance) {
     return (
       <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-6 text-center overflow-hidden relative">
          <div className="absolute inset-0 bg-blue-500/5 animate-pulse" style={{ animationDuration: '4s' }}></div>
          <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center">
             <CreatorUpgradeScene />
             <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4 text-[var(--text-primary)]">
               App <span className="text-blue-400">Upgrade</span>
             </h1>
             <p className="text-[var(--text-primary)]/60 text-lg mb-8">
               {maintenance?.message || "We're adding some cool new features. We'll be back online in a few hours!"}
             </p>
             <div className="flex flex-col items-center gap-4 mt-4">
                <div className="flex items-center gap-2 justify-center text-sm font-medium text-blue-400 bg-blue-400/10 px-4 py-2 rounded-full border border-blue-400/20 inline-flex">
                   <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span> Scheduled Tune-Up
                </div>
                <div className="flex items-center gap-4 mt-2">
                   <a href="mailto:support@ybexmedia.in" className="text-xs text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 border border-[var(--border-default)] px-4 py-2 rounded-full hover:bg-foreground/5 bg-[var(--bg-elevated)]">
                      ✉️ Email Support
                   </a>
                   <a href="tel:+18001234567" className="text-xs text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 border border-[var(--border-default)] px-4 py-2 rounded-full hover:bg-foreground/5 bg-[var(--bg-elevated)]">
                      📞 Call Team
                   </a>
                </div>
                
                <button
                   onClick={async () => {
                      await logout();
                      navigate("/login");
                   }}
                   className="mt-6 text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1.5 border border-red-500/10 hover:border-red-500/30 px-5 py-2.5 rounded-full bg-red-500/5 hover:bg-red-500/10 transition-all cursor-pointer shadow-sm"
                >
                   🔓 Log Out / Change Account
                </button>
             </div>
          </div>
       </div>
     );
  }

  if (isBrandMaintenance) {
     return (
       <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-6 text-center overflow-hidden relative">
          <div className="absolute inset-0 bg-amber-500/5 animate-pulse" style={{ animationDuration: '3s' }}></div>
          <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center">
             <BrandConstructionScene />
             <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4 text-[var(--text-primary)]">
               Quick <span className="text-amber-500">Update</span>
             </h1>
             <p className="text-[var(--text-primary)]/60 text-lg mb-8">
               {maintenance?.message || "We are making the platform better for you. Back online shortly!"}
             </p>
             <div className="flex flex-col items-center gap-4 mt-4">
                <div className="flex items-center gap-2 justify-center text-sm font-medium text-amber-500 bg-amber-500/10 px-4 py-2 rounded-full border border-amber-500/20 inline-flex">
                   <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Offline for Upgrades
                </div>
                <div className="flex items-center gap-4 mt-2">
                   <a href="mailto:support@ybexmedia.in" className="text-xs text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 border border-[var(--border-default)] px-4 py-2 rounded-full hover:bg-foreground/5 bg-[var(--bg-elevated)]">
                      ✉️ Email Support
                   </a>
                   <a href="tel:+18001234567" className="text-xs text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 border border-[var(--border-default)] px-4 py-2 rounded-full hover:bg-foreground/5 bg-[var(--bg-elevated)]">
                      📞 Call Team
                   </a>
                </div>

                <button
                   onClick={async () => {
                      await logout();
                      navigate("/login");
                   }}
                   className="mt-6 text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1.5 border border-red-500/10 hover:border-red-500/30 px-5 py-2.5 rounded-full bg-red-500/5 hover:bg-red-500/10 transition-all cursor-pointer shadow-sm"
                >
                   🔓 Log Out / Change Account
                </button>
             </div>
          </div>
       </div>
     );
  }
  
  return children;
}

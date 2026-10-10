import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import CreatorOnboarding from "../../pages/onboarding/CreatorOnboarding";
import CreatorOnboardingMobile from "../../pages/onboarding/CreatorOnboardingMobile";
import BrandOnboardingFlow from "../../components/Onboarding/BrandOnboardingFlow";
import BrandOnboardingMobile from "../../pages/onboarding/BrandOnboardingMobile";
import useIsMobile from "../../hooks/useIsMobile";
import { LogOut, User, Building2 } from "lucide-react";
import { ignored } from "../../utils/ignored";

export default function Onboarding() {
  const { user, refreshUser, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [savingRole, setSavingRole] = useState(false);
  const autoTried = useRef(false);

  // An account with no role (e.g. a Google sign-up) used to fall through to the creator form,
  // even for a brand. Save the role first — from the sign-up link if it carries one, otherwise
  // by asking.
  const chooseRole = async (role) => {
    if (savingRole) return;
    setSavingRole(true);
    try {
      await api.post("auth/role", { role });
      await refreshUser();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save your account type. Please try again.");
    } finally {
      setSavingRole(false);
    }
  };

  useEffect(() => {
    if (!user || user.role || autoTried.current) return;
    const fromLink = new URLSearchParams(location.search).get("role");
    if (fromLink === "creator" || fromLink === "brand") {
      autoTried.current = true;
      chooseRole(fromLink);
    }
  }, [user, location.search]);

  useEffect(() => {
    // If they finish onboarding, send them off — except while the phone onboarding is showing its
    // last "this is how creators see you" preview (session 41: the brand preview used to be skipped
    // because the saved account flipped to onboarded and this sent them to the dashboard at once).
    let previewOpen = false;
    try { previewOpen = sessionStorage.getItem("ybex_onboarding_preview") === "1"; } catch (e) { ignored("Onboarding:preview", e); }
    if (!previewOpen && (user?.onboarding_completed || user?.onboarding_complete || user?.onboarded)) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)]">Loading...</div>;

  if (!user.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)] p-6">
        <div className="w-full max-w-md">
          <h1 className="text-xl font-bold text-center">How will you use Ybex?</h1>
          <p className="text-sm text-[var(--text-secondary)] text-center mt-1 mb-6">Pick one to set up your account.</p>
          <div className="grid gap-3">
            <button
              type="button"
              disabled={savingRole}
              onClick={() => chooseRole("creator")}
              className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--violet)] text-left disabled:opacity-60 cursor-pointer"
            >
              <User size={22} className="text-[var(--violet)] shrink-0" />
              <span><span className="block font-bold text-sm">I'm a Creator</span><span className="block text-xs text-[var(--text-secondary)]">Get brand deals and UGC orders</span></span>
            </button>
            <button
              type="button"
              disabled={savingRole}
              onClick={() => chooseRole("brand")}
              className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--violet)] text-left disabled:opacity-60 cursor-pointer"
            >
              <Building2 size={22} className="text-[var(--violet)] shrink-0" />
              <span><span className="block font-bold text-sm">I'm a Brand</span><span className="block text-xs text-[var(--text-secondary)]">Run campaigns and order UGC</span></span>
            </button>
          </div>
          <button type="button" onClick={() => logout()} className="mt-6 w-full text-xs text-[var(--text-secondary)] hover:underline cursor-pointer">Log out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans relative overflow-x-hidden w-full max-w-full">
      {user?.role === 'brand' ? (
        isMobile ? (
          <BrandOnboardingMobile
            user={user}
            onComplete={async () => {
              setUser({ ...user, onboarding_completed: true });
              try { await refreshUser(); } catch (e) { ignored("Onboarding:95", e); }
            }}
          />
        ) : (
          <BrandOnboardingFlow 
            user={user} 
            onComplete={async () => {
              setUser({ ...user, onboarding_completed: true });
              try { await refreshUser(); } catch (e) { ignored("Onboarding:103", e); }
              navigate('/dashboard');
            }} 
          />
        )
      ) : isMobile ? (
        <CreatorOnboardingMobile
          user={user}
          onComplete={async () => {
            setUser({ ...user, onboarding_completed: true });
            try { await refreshUser(); } catch (e) { ignored("Onboarding:113", e); }
          }}
        />
      ) : (
        <CreatorOnboarding 
          user={user} 
          onComplete={async () => {
            setUser({ ...user, onboarding_completed: true });
            try { await refreshUser(); } catch (e) { ignored("Onboarding:121", e); }
            navigate('/dashboard');
          }} 
        />
      )}
      
      <button
        onClick={() => logout()}
        className="hidden sm:flex fixed bottom-4 left-4 z-50 items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg shadow-sm border border-red-100 transition-colors text-xs font-semibold dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/40"
      >
        <LogOut size={14} />
        Log Out
      </button>
    </div>
  );
}

import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { postLoginPath } from "../auth/Login";
import { captureRefFromUrl } from "../../lib/referralCapture";
import LandingMobileHero from "../../components/landing/LandingMobileHero";
import useDemoLogin from "../../lib/useDemoLogin";

// Session 42 (Ravi): what the installed app shows when nobody is logged in. Logged in → straight to
// the dashboard. The website landing page is never shown inside the app.
// Session 43 (v280): this IS the screen Ravi's new design replaces. v279 put the design on the
// website's "/" only, and the installed app never opens "/" (start_url /app), so the phone kept the
// old screen. Now the app shows the same hero; Creator / Brand / Log in go to the app's email screen.
export default function AppWelcome() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const demoOn = useDemoLogin();

  useEffect(() => { try { captureRefFromUrl(); } catch { /* no referral in the link */ } }, []);

  useEffect(() => {
    if (!loading && user) navigate(postLoginPath(user), { replace: true });
  }, [user, loading, navigate]);

  // Login check still running: keep the purple of the launch splash (no flash).
  if (loading || user) return <div className="min-h-[100dvh] bg-[#7E00DC]" aria-busy="true" />;

  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-[#F7F5FC]"
      style={{ fontFamily: "'DM Sans', sans-serif", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
      data-testid="app-welcome"
    >
      <LandingMobileHero inApp />
      {demoOn && (
        <div className="mt-5 text-center">
          <Link to="/login?demo=1" className="text-[12.5px] font-semibold text-[#7C3AED] underline underline-offset-2" data-testid="app-demo-link">
            Demo access (test server)
          </Link>
        </div>
      )}
    </div>
  );
}

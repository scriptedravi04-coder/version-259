import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Mail, Eye, EyeOff, Check, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { safeStorage } from "../../utils/storage";
import { rememberMediaKey } from "../../lib/mediaKey";
import { storedReferral } from "../../lib/referralCapture";
import { postLoginPath } from "../auth/Login";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import { EMAIL_RE, randomPassword } from "../../lib/standalone";

// Session 42 (Ravi): one email box. The app finds out if the account exists:
//   exists, same role   → "Continue with OTP" (big) · "Use password instead" (small, below)
//   exists, other role  → offer that role, or another email
//   new email           → name + mobile (+ optional password) → email code → onboarding
// Every step uses existing server routes; only POST /auth/check-email and /auth/login-otp are new.
const ROLE_LABEL = { creator: "Creator", brand: "Brand / Agency" };
const RESEND_SECONDS = 30;

// Session 43 (Ravi): no icon chip (the sparkle looked AI-made) — one plain line that says which
// side you are on, so you know where you are.
const ROLE_LINE = { creator: "a Creator", brand: "a Brand / Agency" };
function Shell({ onBack, role, mode = "in", children }) {
  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-[#F2F2F7] text-[#0A0A0A]"
      style={{ fontFamily: "'DM Sans', sans-serif", paddingTop: 8 /* Session 43: #root starts below the clock */, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
    >
      <div className="relative flex items-center justify-center h-14 px-4">
        <button type="button" onClick={onBack} aria-label="Back" className="absolute left-3 w-10 h-10 rounded-full flex items-center justify-center active:bg-black/5" data-testid="app-back">
          <ArrowLeft size={22} />
        </button>
        <span className="text-[13px] text-[#6B7280]" data-testid="app-role-line">
          {mode === "up" ? "You're signing up as " : "You're signing in as "}
          <span className="font-semibold text-[#0A0A0A]">{ROLE_LINE[role] || ROLE_LINE.creator}</span>
        </span>
      </div>
      <div className="flex-1 flex flex-col px-6">{children}</div>
    </div>
  );
}

function Primary({ children, disabled, onClick, testId, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="w-full h-[54px] rounded-2xl bg-[#7C3AED] text-white text-[16px] font-semibold disabled:bg-[#E9E5F5] disabled:text-[#A39DB8] active:scale-[0.99] transition-[transform,background-color] flex items-center justify-center gap-2"
    >
      {children}
    </button>
  );
}

function CodeBoxes({ value, onChange, autoFocus = true, testId }) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 250); }, [autoFocus]);
  return (
    <label className="relative block mt-6" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        className="absolute inset-0 w-full h-full opacity-0"
        data-testid={testId}
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => {
          const active = i === Math.min(value.length, 5);
          return (
            <div
              key={i}
              className={`h-14 rounded-xl bg-white flex items-center justify-center text-[22px] font-bold border ${active ? "border-[#7C3AED] ring-4 ring-[#7C3AED]/10" : "border-[#E5E2EE]"}`}
            >
              {value[i] || ""}
            </div>
          );
        })}
      </div>
    </label>
  );
}

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(RESEND_SECONDS)];
}

const step = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.18 } },
};

export default function AppContinue() {
  const { role: roleParam } = useParams();
  const navigate = useNavigate();
  const { user, loading, login, signup, setUser } = useAuth();
  const { isBusy, anyBusy, run } = useBusy();

  const [role, setRole] = useState(roleParam === "brand" ? "brand" : "creator");
  const [stage, setStage] = useState("email"); // email | account | otp | password | mismatch | admin | signup | verify
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState(null); // answer of /auth/check-email
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [ownPassword, setOwnPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [resendLeft, startResend] = useCountdown();
  const emailRef = useRef(null);

  const cleanEmail = email.trim().toLowerCase();
  const emailOk = EMAIL_RE.test(cleanEmail);

  // Already logged in (e.g. back button after login): leave the auth screens.
  useEffect(() => {
    if (!loading && user) navigate(postLoginPath(user), { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => { setError(""); }, [stage]);
  useEffect(() => { if (stage === "email") setTimeout(() => emailRef.current?.focus(), 300); }, [stage]);

  const back = () => {
    if (stage === "email") return navigate("/app", { replace: true });
    if (stage === "otp" || stage === "password") return setStage("account");
    if (stage === "verify") return setStage("signup");
    setCode(""); setPassword("");
    setStage("email");
  };

  const finishLogin = (data) => {
    safeStorage.setItem("ybex_token", data.token);
    safeStorage.setItem("ybex_user", JSON.stringify(data.user));
    try { rememberMediaKey(data); } catch { /* older answer without media key */ }
    setUser(data.user);
    navigate(postLoginPath(data.user), { replace: true });
  };

  const accountStatusError = (err) => {
    const d = err?.response?.data || {};
    if (["ACCOUNT_DELETED", "ACCOUNT_BANNED", "ACCOUNT_SUSPENDED"].includes(d.code)) {
      navigate("/account-status", { state: { status: d.code, message: d.detail, user_id: d.user_id, role: d.role } });
      return true;
    }
    return false;
  };

  // 1. Email → does the account exist?
  const checkEmail = () => run("check", async () => {
    if (!emailOk) { setError("Please enter a valid email address."); return; }
    try {
      const { data } = await api.post("auth/check-email", { email: cleanEmail });
      setAccount(data);
      if (!data?.exists) { setStage("signup"); return; }
      if (data.role === "admin") { setStage("admin"); return; }
      if (data.role && data.role !== role) { setStage("mismatch"); return; }
      setStage("account");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not check this email. Please try again.");
    }
  });

  // 2a. Send the login code.
  const sendLoginCode = () => run("send", async () => {
    try {
      const { data } = await api.post("auth/login-otp", { email: cleanEmail, app_role: role });
      setCode(data?.otp || ""); // test mode only: the server returns the code
      startResend();
      setStage("otp");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not send the code. Please try again.");
    }
  });

  // 2b. Check the login code.
  const verifyLoginCode = (value = code) => run("verify", async () => {
    if (value.length !== 6) return;
    try {
      const { data } = await api.post("auth/login", { email: cleanEmail, otp: value, app_role: role });
      if (data?.token) finishLogin(data);
      else setError("Could not log in. Please try again.");
    } catch (err) {
      if (accountStatusError(err)) return;
      if (err?.response?.data?.code === "ADMIN_ACCOUNT") { setStage("admin"); return; }
      setCode("");
      setError(err?.response?.data?.detail || "That code did not work. Please try again.");
    }
  });

  // 2c. Password instead.
  const passwordLogin = () => run("password", async () => {
    try {
      const u = await login(cleanEmail, password, role);
      if (u?.requiresVerification) { setStage("signup"); return; }
      navigate(postLoginPath(u), { replace: true });
    } catch (err) {
      if (accountStatusError(err)) return;
      if (err?.response?.data?.code === "ADMIN_ACCOUNT") { setStage("admin"); return; }
      setError(err?.response?.data?.detail || "Wrong email or password.");
    }
  });

  // 3. New account.
  const createAccount = () => run("signup", async () => {
    const fullName = name.trim();
    let mobile = phone.replace(/\D/g, "");
    if (mobile.length === 12 && mobile.startsWith("91")) mobile = mobile.slice(2);
    if (!fullName) { setError(role === "brand" ? "Please enter your company or brand name." : "Please enter your name."); return; }
    if (!/^[6-9]\d{9}$/.test(mobile)) { setError("Please enter a valid 10-digit mobile number."); return; }
    if (ownPassword && newPassword.length < 8) { setError("Password needs at least 8 characters."); return; }
    if (!agree) { setError("Please confirm you are 18+ and agree to the Terms and Privacy Policy."); return; }
    try {
      const res = await signup(fullName, cleanEmail, ownPassword ? newPassword : randomPassword(), role, `+91${mobile}`, storedReferral() || "");
      if (res?.requiresVerification) {
        setCode(res.otp || "");
        startResend();
        setStage("verify");
      } else if (res) {
        navigate(`/onboarding?role=${role}`, { replace: true });
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create the account. Please try again.");
    }
  });

  const verifySignupCode = (value = code) => run("verify", async () => {
    if (value.length !== 6) return;
    try {
      const { data } = await api.post("auth/verify-email", { email: cleanEmail, otp: value });
      if (data?.token && data?.user) {
        safeStorage.setItem("ybex_token", data.token);
        safeStorage.setItem("ybex_user", JSON.stringify(data.user));
        try { rememberMediaKey(data); } catch { /* fine */ }
        setUser(data.user);
        navigate(postLoginPath(data.user) === "/dashboard" ? "/dashboard" : `/onboarding?role=${role}`, { replace: true });
      } else {
        setError("Could not verify. Please try again.");
      }
    } catch (err) {
      setCode("");
      setError(err?.response?.data?.detail || "That code did not work. Please try again.");
    }
  });

  const resend = (kind) => run("resend", async () => {
    try {
      if (kind === "login") {
        const { data } = await api.post("auth/login-otp", { email: cleanEmail, app_role: role });
        if (data?.otp) setCode(data.otp);
      } else {
        const { data } = await api.post("auth/resend-verification-otp", { email: cleanEmail });
        if (data?.otp) setCode(data.otp);
      }
      startResend();
      toast.success("New code sent");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not send a new code.");
    }
  });

  const otherRole = useMemo(() => (account?.role === "brand" ? "brand" : "creator"), [account]);

  const ErrorLine = error ? <p className="mt-3 text-[13px] text-[#DC2626]" role="alert" data-testid="app-error">{error}</p> : null;
  const Terms = (
    <p className="mt-auto pt-8 text-center text-[12px] leading-relaxed text-[#8A8799]">
      By continuing you accept the <a href="/info/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a> and{" "}
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>.
    </p>
  );
  const EmailChip = (
    <button type="button" onClick={() => setStage("email")} className="mt-2 inline-flex items-center gap-1.5 text-[14px] text-[#6B7280]">
      <Mail size={14} /> <span className="font-medium text-[#0A0A0A]">{cleanEmail}</span> <span className="text-[#7C3AED] font-semibold">Change</span>
    </button>
  );

  return (
    <Shell onBack={back} role={role} mode={stage === "signup" || stage === "verify" ? "up" : "in"}>
      <AnimatePresence mode="wait">
        {stage === "email" && (
          <motion.form key="email" {...step} className="flex-1 flex flex-col" onSubmit={(e) => { e.preventDefault(); checkEmail(); }}>
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">What's your email?</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">We'll log you in, or make a new account if you're new here.</p>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-7 w-full h-[56px] rounded-2xl bg-white border border-[#E5E2EE] px-4 text-[17px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10"
              data-testid="app-email"
            />
            {ErrorLine}
            <div className="mt-5">
              <Primary type="submit" disabled={!emailOk || anyBusy} testId="app-email-continue">
                {isBusy("check") ? <ButtonSpinner /> : "Continue"}
              </Primary>
            </div>
            {Terms}
          </motion.form>
        )}

        {stage === "account" && (
          <motion.div key="account" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Welcome back</h1>
            {EmailChip}
            <p className="mt-5 text-[15px] text-[#6B7280]">We'll email you a 6-digit code to log in.</p>
            {ErrorLine}
            <div className="mt-6">
              <Primary onClick={sendLoginCode} disabled={anyBusy} testId="app-continue-otp">
                {isBusy("send") ? <ButtonSpinner /> : "Continue with OTP"}
              </Primary>
            </div>
            {account?.has_password && (
              <button type="button" onClick={() => setStage("password")} className="mt-5 text-[14px] font-semibold text-[#7C3AED] self-center" data-testid="app-use-password">
                Use password instead
              </button>
            )}
          </motion.div>
        )}

        {stage === "otp" && (
          <motion.div key="otp" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Enter the code</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">Sent to <span className="font-medium text-[#0A0A0A]">{cleanEmail}</span>. Check spam if you don't see it.</p>
            <CodeBoxes value={code} onChange={(v) => { setCode(v); if (v.length === 6) verifyLoginCode(v); }} testId="app-login-code" />
            {ErrorLine}
            <div className="mt-6">
              <Primary onClick={() => verifyLoginCode()} disabled={code.length !== 6 || anyBusy} testId="app-login-verify">
                {isBusy("verify") ? <ButtonSpinner /> : "Log in"}
              </Primary>
            </div>
            <div className="mt-5 flex items-center justify-between text-[14px]">
              <button type="button" disabled={resendLeft > 0 || anyBusy} onClick={() => resend("login")} className="font-semibold text-[#7C3AED] disabled:text-[#A39DB8]">
                {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
              </button>
              {account?.has_password && (
                <button type="button" onClick={() => setStage("password")} className="font-semibold text-[#6B7280]">Use password</button>
              )}
            </div>
          </motion.div>
        )}

        {stage === "password" && (
          <motion.form key="password" {...step} className="flex-1 flex flex-col" onSubmit={(e) => { e.preventDefault(); passwordLogin(); }}>
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Your password</h1>
            {EmailChip}
            <div className="relative mt-6">
              <input
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[56px] rounded-2xl bg-white border border-[#E5E2EE] pl-4 pr-12 text-[17px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10"
                placeholder="Password"
                autoFocus
                data-testid="app-password"
              />
              <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#6B7280]" aria-label={showPass ? "Hide password" : "Show password"}>
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {ErrorLine}
            <div className="mt-5">
              <Primary type="submit" disabled={!password || anyBusy} testId="app-password-login">
                {isBusy("password") ? <ButtonSpinner /> : "Log in"}
              </Primary>
            </div>
            <div className="mt-5 flex items-center justify-between text-[14px]">
              <button type="button" onClick={() => navigate(`/forgot-password?email=${encodeURIComponent(cleanEmail)}`)} className="font-semibold text-[#6B7280]">Forgot password?</button>
              <button type="button" onClick={sendLoginCode} disabled={anyBusy} className="font-semibold text-[#7C3AED]">Use OTP instead</button>
            </div>
          </motion.form>
        )}

        {stage === "admin" && (
          <motion.div key="admin" {...step} className="flex-1 flex flex-col" data-testid="app-admin-email">
            <div className="mt-6 w-12 h-12 rounded-2xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center"><ShieldAlert size={22} /></div>
            <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] leading-tight">This is a Ybex admin account</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">{cleanEmail} belongs to the Ybex team. It can't be used as {ROLE_LINE[role] || ROLE_LINE.creator}.</p>
            <div className="mt-8"><Primary onClick={() => { setStage("email"); setTimeout(() => emailRef.current?.select?.(), 320); }} testId="app-admin-other">Use another email</Primary></div>
            <button type="button" onClick={() => navigate("/ybx-admin")} className="mt-4 text-[14px] font-semibold text-[#7C3AED]" data-testid="app-admin-open">Open admin panel</button>
          </motion.div>
        )}

        {stage === "mismatch" && (
          <motion.div key="mismatch" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[26px] font-bold tracking-[-0.02em] leading-tight">
              This email is a {ROLE_LABEL[otherRole]} account
            </h1>
            {EmailChip}
            <p className="mt-4 text-[15px] text-[#6B7280]">
              One email is one account. Log in as {otherRole === "brand" ? "a brand" : "a creator"}, or use a different email for a {ROLE_LABEL[role].toLowerCase()} account.
            </p>
            <div className="mt-7">
              <Primary onClick={() => { setRole(otherRole); navigate(`/app/continue/${otherRole}`, { replace: true }); setStage("account"); }} testId="app-switch-role">
                Continue as {ROLE_LABEL[otherRole]}
              </Primary>
            </div>
            <button type="button" onClick={() => { setEmail(""); setStage("email"); }} className="mt-5 text-[14px] font-semibold text-[#7C3AED] self-center">
              Use another email
            </button>
          </motion.div>
        )}

        {stage === "signup" && (
          <motion.form key="signup" {...step} className="flex-1 flex flex-col" onSubmit={(e) => { e.preventDefault(); createAccount(); }}>
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Create your account</h1>
            {EmailChip}
            <div className="mt-6 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete={role === "brand" ? "organization" : "name"}
                placeholder={role === "brand" ? "Company or brand name" : "Your full name"}
                className="w-full h-[56px] rounded-2xl bg-white border border-[#E5E2EE] px-4 text-[17px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10"
                data-testid="app-signup-name"
              />
              <div className="flex items-center h-[56px] rounded-2xl bg-white border border-[#E5E2EE] focus-within:border-[#7C3AED] focus-within:ring-4 focus-within:ring-[#7C3AED]/10">
                <span className="pl-4 pr-2 text-[17px] text-[#6B7280]">+91</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 12))}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="Mobile number"
                  className="flex-1 h-full bg-transparent pr-4 text-[17px] outline-none"
                  data-testid="app-signup-phone"
                />
              </div>
              {ownPassword ? (
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Password (8+ characters)"
                  className="w-full h-[56px] rounded-2xl bg-white border border-[#E5E2EE] px-4 text-[17px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10"
                  data-testid="app-signup-password"
                />
              ) : null}
            </div>
            <label className="mt-4 flex items-start gap-3 text-[13px] leading-snug text-[#4B4760] cursor-pointer select-none">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="sr-only" data-testid="app-signup-agree" />
              <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${agree ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "bg-white border-[#CFCBDD]"}`}>
                {agree && <Check size={14} strokeWidth={3} />}
              </span>
              <span>
                I am 18 or older and agree to the <a href="/info/terms" target="_blank" rel="noopener noreferrer" className="text-[#7C3AED] font-semibold">Terms</a> and{" "}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#7C3AED] font-semibold">Privacy Policy</a>, including emails about campaigns, my account and Ybex updates.
              </span>
            </label>
            {ErrorLine}
            <div className="mt-5">
              <Primary type="submit" disabled={anyBusy} testId="app-signup-continue">
                {isBusy("signup") ? <ButtonSpinner /> : "Continue with OTP"}
              </Primary>
            </div>
            <button type="button" onClick={() => setOwnPassword((v) => !v)} className="mt-5 text-[14px] font-semibold text-[#7C3AED] self-center" data-testid="app-signup-own-password">
              {ownPassword ? "Skip the password, use codes" : "Set a password instead"}
            </button>
          </motion.form>
        )}

        {stage === "verify" && (
          <motion.div key="verify" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Verify your email</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">We sent a 6-digit code to <span className="font-medium text-[#0A0A0A]">{cleanEmail}</span>.</p>
            <CodeBoxes value={code} onChange={(v) => { setCode(v); if (v.length === 6) verifySignupCode(v); }} testId="app-verify-code" />
            {ErrorLine}
            <div className="mt-6">
              <Primary onClick={() => verifySignupCode()} disabled={code.length !== 6 || anyBusy} testId="app-verify-continue">
                {isBusy("verify") ? <ButtonSpinner /> : "Verify and continue"}
              </Primary>
            </div>
            <button type="button" disabled={resendLeft > 0 || anyBusy} onClick={() => resend("signup")} className="mt-5 text-[14px] font-semibold text-[#7C3AED] disabled:text-[#A39DB8] self-center">
              {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

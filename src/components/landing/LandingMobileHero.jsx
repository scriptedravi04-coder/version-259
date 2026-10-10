import React from "react";
import { Link } from "react-router-dom";

// Session 43 (Ravi): mobile entry screen, from his design. Purple hero + live campaign card +
// "secure payment hold" chip, then the two role cards. One orchestrated load animation, reduced-motion
// safe. The status bar goes purple here via data-statusbar (StatusBarSync).
const CREATORS = [
  { initials: "RK", name: "Riya Kapoor", status: "Approved", color: "#0E9F6E", bg: "#E3F7EE", ring: "#F6B8C6" },
  { initials: "AS", name: "Arjun Singh", status: "In review", color: "#7C3AED", bg: "#F2EAFF", ring: "#B8C6F6" },
  { initials: "NM", name: "Neha Mehta", status: "Shooting", color: "#B45309", bg: "#FFF6E6", ring: "#7FD9C4" },
];

// Session 43 (v280): the installed app starts at /app (AppWelcome), never at "/", so v279's hero was
// only ever seen in a browser tab. `inApp` = the same screen inside the installed app: shown at every
// width, and the buttons go to the app's own email screen (/app/continue/:role) instead of /signup.
export default function LandingMobileHero({ inApp = false }) {
  const loginTo = inApp ? "/app/continue/creator" : "/login";
  const creatorTo = inApp ? "/app/continue/creator" : "/signup?role=creator";
  const brandTo = inApp ? "/app/continue/brand" : "/signup?role=brand";
  return (
    <div className={inApp ? "yb-hero-anim" : "md:hidden yb-hero-anim"} data-testid="landing-mobile-hero">
      <section
        data-statusbar="#8A00F0"
        className="relative px-5 pt-3 pb-9 rounded-b-[34px] overflow-hidden"
        style={{ background: "linear-gradient(165deg,#9B00FF 0%,#6E00C8 52%,#3A0080 100%)" }}
      >
        <div className="flex items-center justify-between">
          <div className="text-white text-[26px] font-extrabold tracking-tight">Ybex<span style={{ color: "#C9A3FF" }}>.</span></div>
          <Link to={loginTo} data-testid="hero-login" className="px-4 h-9 inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm text-white text-[14px] font-semibold border border-white/20 active:scale-95 transition">
            Log in
          </Link>
        </div>

        <h1 className="mt-6 text-white text-[32px] leading-[1.12] font-extrabold tracking-[-0.5px]">
          Hire creators.<br />Pay only on delivery.
        </h1>

        {/* Live campaign card */}
        <div className="yb-hero-card mt-6 bg-white rounded-[22px] p-4 shadow-[0_18px_40px_rgba(46,0,102,.35)]">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="text-[16px] font-extrabold text-[#14111C] truncate">Diwali Glow Campaign</div>
              <div className="text-[12.5px] text-[#8A8594] mt-0.5">3 creators · Reels</div>
            </div>
            <span className="inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-[#E3F7EE] text-[#0E9F6E] text-[12px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0E9F6E]" /> LIVE
            </span>
          </div>
          <div className="mt-3 space-y-2.5">
            {CREATORS.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0" style={{ background: c.ring }}>{c.initials}</span>
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-[#14111C] truncate">{c.name}</span>
                <span className="text-[13px] font-bold" style={{ color: c.color }}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Secure payment hold chip */}
        <div className="yb-hero-chip -mt-3 ml-auto w-max flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-white shadow-[0_10px_24px_rgba(46,0,102,.4)]" style={{ background: "linear-gradient(135deg,#7A1FD6,#4A009C)" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          <div className="leading-tight">
            <div className="text-[16px] font-extrabold">₹45,000</div>
            <div className="text-[11.5px] text-white/85 -mt-0.5">Held safely till approval</div>
          </div>
        </div>
      </section>

      {/* Role cards */}
      <div className="px-5 mt-5 grid grid-cols-2 gap-3.5">
        <RoleCard
          to={creatorTo}
          testId="app-role-creator"
          title="I'm a Creator"
          sub="Get paid brand deals. Free to join."
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.5-2.5v9L15 14M4 7h11v10H4z" /></svg>}
        />
        <RoleCard
          to={brandTo}
          testId="app-role-brand"
          title="I'm a Brand"
          sub="Or an agency. Hire creators, pay safely."
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>}
        />
      </div>

      {/* Trust line */}
      <div className="px-5 mt-4 flex items-center justify-center gap-5 text-[12.5px] font-semibold text-[#6B6578]">
        <span className="inline-flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0E9F6E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          Secure payment hold
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></svg>
          Legal contracts
        </span>
      </div>
    </div>
  );
}

function RoleCard({ to, title, sub, icon, testId }) {
  return (
    <Link to={to} data-testid={testId} className="yb-role-card bg-white rounded-[20px] p-4 flex flex-col gap-3 border border-[#EFECF6] shadow-[0_4px_14px_rgba(46,0,102,.06)] active:scale-[0.98] transition">
      <span className="w-11 h-11 rounded-[14px] bg-[#F3EBFF] flex items-center justify-center">{icon}</span>
      <div>
        <div className="text-[16px] font-extrabold text-[#14111C]">{title}</div>
        <div className="text-[12.5px] text-[#6B6578] mt-1 leading-snug">{sub}</div>
      </div>
      <span className="mt-1 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#9B00FF,#5A00C8)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </Link>
  );
}

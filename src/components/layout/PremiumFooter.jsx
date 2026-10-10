import React from "react";
import { Instagram } from "lucide-react";

export default function PremiumFooter({ headline, subtitle, showInstagram, clearBottomBar = false }) {
  return (
    <>
      {/* Session 41 (Ravi: "footers sare rakhne hain"): back on phones too. Chat / inbox never get
          one (no-footer list in Layout). On a page with its own fixed bottom bar (campaign Apply bar)
          `clearBottomBar` leaves room under the footer so the bar never covers it. */}
      <footer className={`w-full mt-8 md:mt-12 border-t border-[var(--border-default)] bg-transparent pt-8 md:pt-12 px-6 ${clearBottomBar ? "pb-[170px] md:pb-10" : "pb-10"}`} data-testid="premium-footer">
        <div className="max-w-none">
          {/* Big Headline */}
          <div className="mb-3 w-full relative">
            {headline && headline.map((line, index) => (
              <h2 
                key={index} 
                className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] opacity-15 leading-[1.1] relative z-10"
              >
                {line}
              </h2>
            ))}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-sm md:text-base font-semibold text-[var(--text-tertiary)] max-w-xl mb-8">
              {subtitle}
            </p>
          )}

          {/* Bottom Row */}
          {showInstagram && (
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-6 border-t border-[var(--border-default)]">
              <div className="flex flex-wrap items-center gap-4">
                <a 
                  href="https://instagram.com/ybex.in" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--violet)] transition-colors px-3 py-2 rounded-lg hover:bg-[var(--violet)]/10"
                >
                  <Instagram size={16} /> @ybex.in
                </a>
              </div>
            </div>
          )}
        </div>
      </footer>
    </>
  );
}

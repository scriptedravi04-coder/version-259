import React, { useState } from "react";

// Session 43 (Ravi): brand cards showed only a "C" / "S" letter even when the brand has a logo.
// Shows the real logo; falls back to the first letter when there is no logo, when the server
// sent only a generated initials picture, or when the picture fails to load.
export function realLogoUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/dicebear\.com|ui-avatars\.com/i.test(u)) return "";
  return u;
}

export default function BrandLogo({ src, name, size = 34, radius = 11, className = "", testId }) {
  const [broken, setBroken] = useState(false);
  const url = realLogoUrl(src);
  const letter = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0 };
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name ? `${name} logo` : ""}
        onError={() => setBroken(true)}
        loading="lazy"
        data-testid={testId}
        className={`bg-white border border-[#EEF1F5] object-contain ${className}`}
        style={{ ...box, padding: Math.max(2, Math.round(size * 0.08)) }}
      />
    );
  }
  return (
    <div
      data-testid={testId}
      className={`bg-gradient-to-br from-[#A78BFA] to-[#5B21B6] flex items-center justify-center font-bold text-white ${className}`}
      style={{ ...box, fontSize: Math.round(size * 0.4) }}
    >
      {letter}
    </div>
  );
}

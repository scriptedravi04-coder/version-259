import React from "react";

// Session 23 — Loader design 14c ("data loading: skeletons shaped like the content").
// While a page's DATA loads, its header / nav / tabs render right away and only the parts
// waiting on the API show these, in their final shape — nothing jumps when the data lands.
// #EFEFF4 → #F7F7FA shimmer, 1.6s linear; static under prefers-reduced-motion.
// Rules: ARCHITECTURE.md "Loading states".

const css = `
@keyframes ybShim { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.yb-shim { background: linear-gradient(90deg, #EFEFF4 25%, #F7F7FA 37%, #EFEFF4 63%); background-size: 400% 100%;
  animation: ybShim 1.6s linear infinite; border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { .yb-shim { animation: none; background: #EFEFF4; } }
`;

export function Shimmer({ className = "", style }) {
  return <div className={`yb-shim ${className}`} style={style} aria-hidden="true" />;
}

function Frame({ label, children, className = "" }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label={label}>
      <style>{css}</style>
      {children}
    </div>
  );
}

/** Explore / any grid of person or brand cards. */
export function CardGridSkeleton({ count = 6, label = "Loading" }) {
  return (
    <Frame label={label} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card,#fff)] p-4">
          <div className="flex items-center gap-3">
            <Shimmer className="w-12 h-12 !rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Shimmer className="h-3.5 w-2/3" />
              <Shimmer className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Shimmer className="h-10" /><Shimmer className="h-10" /><Shimmer className="h-10" />
          </div>
          <Shimmer className="mt-4 h-9 w-full !rounded-xl" />
        </div>
      ))}
    </Frame>
  );
}

/** Campaign / deal / collab detail pages. */
export function DetailSkeleton({ label = "Loading details" }) {
  return (
    <Frame label={label} className="w-full max-w-[1200px] mx-auto px-4 md:px-6 py-6">
      <Shimmer className="h-4 w-24" />
      <Shimmer className="mt-4 h-8 w-2/3 md:w-1/2" />
      <div className="mt-3 flex gap-2"><Shimmer className="h-6 w-20 !rounded-full" /><Shimmer className="h-6 w-24 !rounded-full" /><Shimmer className="h-6 w-16 !rounded-full" /></div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card,#fff)] p-5">
          <Shimmer className="h-4 w-1/3" /><Shimmer className="h-3 w-full" /><Shimmer className="h-3 w-11/12" /><Shimmer className="h-3 w-4/5" />
          <Shimmer className="mt-2 h-40 w-full !rounded-xl" />
        </div>
        <div className="space-y-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card,#fff)] p-5">
          <Shimmer className="h-4 w-1/2" /><Shimmer className="h-10 w-full" /><Shimmer className="h-10 w-full" /><Shimmer className="h-11 w-full !rounded-xl" />
        </div>
      </div>
    </Frame>
  );
}

/** Creator / brand profile pages. */
export function ProfileSkeleton({ label = "Loading profile" }) {
  return (
    <Frame label={label} className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-4">
      <Shimmer className="h-36 md:h-48 w-full !rounded-2xl" />
      <div className="-mt-10 px-4 flex items-end gap-4">
        <Shimmer className="w-24 h-24 !rounded-full border-4 border-[var(--bg-base,#F7F7FA)] shrink-0" />
        <div className="flex-1 pb-2 space-y-2"><Shimmer className="h-5 w-48" /><Shimmer className="h-3 w-32" /></div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3"><Shimmer className="h-16" /><Shimmer className="h-16" /><Shimmer className="h-16" /></div>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Shimmer key={i} className="aspect-[9/16] w-full !rounded-xl" />)}
      </div>
    </Frame>
  );
}

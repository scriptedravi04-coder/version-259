import React from "react";
import { motion } from "framer-motion";
import { Star, ShieldCheck, Building2, UserCheck, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { useState, useEffect } from "react";

function ReviewCard({ review }) {
  const isBrand = review.type === "brand";

  return (
    <div
      id={`review-card-${review.id}`}
      className={`w-full p-5 sm:p-6 rounded-2xl bg-white border transition-all duration-300 group flex flex-col justify-between relative overflow-hidden mb-5 ${
        isBrand
          ? "border-emerald-200 hover:border-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.06)] hover:shadow-lg"
          : "border-gray-200/90 hover:border-[#5846E0]/40 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-lg"
      }`}
    >
      <div>
        {/* Top Bar: Profile */}
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={review.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(review.name || "User")}&background=5846E0&color=fff`}
                alt={review.name}
                className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-xs"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(review.name || "User")}&background=5846E0&color=fff`;
                }}
              />
            </div>
            <div className="truncate">
              <h4 className="font-display font-bold text-sm text-[#111827] truncate flex items-center gap-1">
                {review.name}
              </h4>
              <p className="text-xs text-gray-500 truncate">
                {review.handle}{review.location ? ` • ${review.location}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Star rating — from the admin form (1–5); old rows without a rating count as 5 */}
        <div className="flex items-center gap-0.5 mb-2" aria-label={`${review.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-3.5 h-3.5 ${n <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
          ))}
        </div>

        {/* Quote Text */}
        <p className="text-xs sm:text-sm text-gray-600 leading-relaxed italic line-clamp-3">
          "{review.quote}"
        </p>
      </div>

      {/* Footer Metric Pill */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-400 truncate max-w-[150px]">
          {review.role || review.category}
        </span>
        {review.metric && (
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
              review.metricColor === "green" || (isBrand && (!review.metricColor || review.metricColor === "green"))
                ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                : review.metricColor === "blue"
                  ? "text-blue-700 bg-blue-50 border border-blue-200"
                  : "text-[#5846E0] bg-[#5846E0]/10 border border-[#5846E0]/20"
            }`}
          >
            {review.metric}
          </span>
        )}
      </div>
    </div>
  );
}

// Session 31 (Ravi): only reviews added by the admin are shown. The 18 built-in reviews (with real
// brand names) are gone; with no admin reviews the whole section is hidden. One type missing (e.g.
// only creator reviews) no longer fills the other column with invented ones.
export const reviewRating = (r) => {
  const n = Math.round(Number(r?.rating));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 5;
};

/** Split admin reviews into the three columns without inventing any. */
export function arrangeReviews(list) {
  const creators = list.filter((r) => r.type !== "brand");
  const brands = list.filter((r) => r.type === "brand");
  if (creators.length && brands.length) {
    const mid = Math.ceil(creators.length / 2);
    const top = creators.slice(0, mid);
    const bottom = creators.slice(mid);
    return [top, brands, bottom.length ? bottom : top];
  }
  // Only one kind: spread it over the columns.
  const cols = [[], [], []];
  list.forEach((r, i) => cols[i % 3].push(r));
  return cols.map((c) => (c.length ? c : list));
}

export default function ReviewsSection() {
  const [reviewsData, setReviewsData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    api
      .get("/landing-reviews", { bypassCache: true })
      .then((res) => {
        if (isMounted && Array.isArray(res?.data)) setReviewsData(res.data.filter((r) => r && (r.content || "").trim()));
      })
      .catch((err) => {
        console.error("Failed to load landing reviews from backend:", err);
      })
      .finally(() => { if (isMounted) setLoaded(true); });
    return () => {
      isMounted = false;
    };
  }, []);

  const mapRev = (r) => {
    const roleParts = (r.author_role || "").split(" • ");
    const handle = roleParts[0] || r.author_role || "";
    const location = roleParts.length > 1 ? roleParts.slice(1).join(" • ") : "";
    return {
      id: r.id,
      name: r.author_name || (r.type === "brand" ? "Brand" : "Creator"),
      handle: handle,
      location: location,
      avatar: r.author_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.author_name || "User")}&background=5846E0&color=fff`,
      role: r.category || (r.type === "brand" ? "Brand Partner" : "Creator"),
      category: r.category,
      rating: reviewRating(r),
      quote: r.content || "",
      metric: r.highlight_text,
      metricColor: r.highlight_color || (r.type === "brand" ? "green" : "purple"),
      type: r.type === "brand" ? "brand" : "creator"
    };
  };

  // No admin reviews (or still loading) → no section at all.
  if (!loaded || reviewsData.length === 0) return null;

  const mapped = reviewsData.map(mapRev);
  const [col1Items, col2Items, col3Items] = arrangeReviews(mapped);
  // A few reviews: show them still, side by side. Enough to fill the columns: the scrolling wall.
  const scrolling = mapped.length >= 6;
  const loop = (items) => (scrolling ? [...items, ...items] : items);
  const seamlessCol1 = loop(col1Items);
  const seamlessCol2 = loop(col2Items);
  const seamlessCol3 = loop(col3Items);

  return (
    <section
      className="py-16 sm:py-24 bg-[#FAFAFC] relative overflow-hidden"
      data-testid="reviews-section"
    >
      {/* Background Soft Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full bg-[#5846E0]/5 blur-[140px]" />
      </div>

      <div className="relative max-w-none px-4 sm:px-6 lg:px-8 z-10 mb-12 text-center">
        {/* Section Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-black text-[#111827] tracking-tight"
        >
          Loved by <span className="bg-gradient-to-r from-[var(--violet)] to-[#5B3EE0] bg-clip-text text-transparent">Creators</span>. Trusted by <span className="bg-gradient-to-r from-[var(--violet)] to-[#5B3EE0] bg-clip-text text-transparent">Brands</span>.
        </motion.h2>
      </div>

      {/* ================= 3-COLUMN INFINITE VERTICAL MARQUEE ================= */}
      {!scrolling ? (
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-5">
          {mapped.map((review) => (
            <ReviewCard key={`static-${review.id}`} review={review} />
          ))}
        </div>
      ) : (
      <div className="relative z-10 max-w-none px-4 sm:px-6 lg:px-8 h-[640px] md:h-[700px] overflow-hidden marquee-col-container">
        {/* Top & Bottom Gradient Fades */}
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[#FAFAFC] via-[#FAFAFC]/80 to-transparent z-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#FAFAFC] via-[#FAFAFC]/80 to-transparent z-20 pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
          {/* COLUMN 1: Creator Reviews (Scrolls UP) */}
          <div className="overflow-hidden">
            <div className="marquee-col-up">
              {seamlessCol1.map((review, index) => (
                <ReviewCard key={`col1-${review.id}-${index}`} review={review} />
              ))}
            </div>
          </div>

          {/* COLUMN 2: Brand Reviews (Scrolls DOWN - Middle Column) */}
          <div className="overflow-hidden hidden md:block">
            <div className="marquee-col-down">
              {seamlessCol2.map((review, index) => (
                <ReviewCard key={`col2-${review.id}-${index}`} review={review} />
              ))}
            </div>
          </div>

          {/* COLUMN 3: Creator Reviews (Scrolls UP - Right Column) */}
          <div className="overflow-hidden hidden md:block">
            <div className="marquee-col-up">
              {seamlessCol3.map((review, index) => (
                <ReviewCard key={`col3-${review.id}-${index}`} review={review} />
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Bottom Trust Note */}
      <div className="relative z-10 max-w-none px-4 mt-10 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 bg-white px-4 py-2 rounded-full border border-gray-200/80 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>All reviews verified from active creators and brands registered on Ybex</span>
        </div>
      </div>
    </section>
  );
}

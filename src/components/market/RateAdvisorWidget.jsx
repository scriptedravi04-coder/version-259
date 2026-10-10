import React, { useState } from "react";
import { 
  Calculator, 
  IndianRupee, 
  ArrowRight, 
  CheckCircle2, 
  TrendingUp, 
  Globe, 
  Lightbulb, 
  Info,
  RefreshCw
} from "lucide-react";

export default function RateAdvisorWidget({ initialNiche = "Fashion & Lifestyle", initialFollowers = 50000, onApplyRate }) {
  const [niche, setNiche] = useState(initialNiche);
  const [followers, setFollowers] = useState(initialFollowers);
  const [deliverable, setDeliverable] = useState("Reel (30s-60s)");
  const [proposedRate, setProposedRate] = useState(15000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const calculateBenchmark = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/market-intelligence/rate-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          follower_count: followers,
          platform: "Instagram",
          deliverable_type: deliverable,
          proposed_rate: proposedRate,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setResult(json.data);
      }
    } catch (err) {
      console.warn("Failed to query rate advisor:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
            <Calculator size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              AI Market Rate Benchmark & Pricing Advisor
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Grounded in current Indian creator economy pricing index (CPM, Reel standards & Barter thresholds).
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
        {/* Controls */}
        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] block mb-1">
              Category / Niche
            </label>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)] focus:outline-indigo-500"
            >
              <option value="Fashion & Lifestyle">Fashion & Lifestyle</option>
              <option value="Tech & Gadgets">Tech & Gadgets</option>
              <option value="Beauty & Skincare">Beauty & Skincare</option>
              <option value="Fitness & Health">Fitness & Health</option>
              <option value="Finance & Crypto">Finance & Crypto</option>
              <option value="Food & Travel">Food & Travel</option>
              <option value="Gaming & Esports">Gaming & Esports</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-[var(--text-secondary)] mb-1">
              <span>Creator Followers</span>
              <span className="text-[var(--text-primary)] font-black">{Number(followers).toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="5000"
              max="1000000"
              step="5000"
              value={followers}
              onChange={(e) => setFollowers(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] block mb-1">
              Deliverable Type
            </label>
            <select
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)] focus:outline-indigo-500"
            >
              <option value="Reel (30s-60s)">Reel (30s-60s Dedicated)</option>
              <option value="Reel (Integrated)">Reel (15s Integrated)</option>
              <option value="Story + Link Sticker">Story + Link Sticker</option>
              <option value="Carousel Post (3-5 slides)">Carousel Post (3-5 slides)</option>
              <option value="YouTube Dedicated (5-8 min)">YouTube Dedicated (5-8 min)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] block mb-1">
              Proposed / Asking Price (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-[var(--text-secondary)]">₹</span>
              <input
                type="number"
                value={proposedRate}
                onChange={(e) => setProposedRate(Number(e.target.value))}
                className="w-full pl-7 pr-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)] focus:outline-indigo-500"
              />
            </div>
          </div>

          {/* Button Row strictly adhering to Rule AGENTS_md: Primary on the right */}
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={calculateBenchmark}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm ml-auto"
            >
              <Lightbulb size={14} className={loading ? "animate-spin" : ""} />
              <span>{loading ? "Analyzing Search Grounding..." : "Calculate Fair Benchmark"}</span>
            </button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="p-4 rounded-xl bg-[var(--bg-elevated)]/50 border border-[var(--border-default)] flex flex-col justify-between">
          {result ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Market Valuation Status
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  result.market_status === "fair"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : result.market_status === "below_market"
                    ? "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
                    : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                }`}>
                  {result.status_label || "Fair Market Price"}
                </span>
              </div>

              <div>
                <div className="text-xs text-[var(--text-secondary)]">Recommended Fair Range:</div>
                <div className="text-xl font-black text-[var(--text-primary)] mt-0.5">
                  ₹{Number(result.min_rate).toLocaleString()} – ₹{Number(result.max_rate).toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] font-medium mt-0.5">
                  Standard Median: <span className="font-bold text-[var(--text-primary)]">₹{Number(result.median_rate).toLocaleString()}</span> • {result.cpm_estimate}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-1 font-bold text-[var(--text-primary)] mb-1">
                  <Info size={13} className="text-indigo-500" />
                  <span>Market Analysis</span>
                </div>
                {result.verdict}
              </div>

              {result.tips?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    <Lightbulb size={12} className="text-amber-500" />
                    <span>Negotiation Tactics</span>
                  </div>
                  {result.tips.map((tip, idx) => (
                    <div key={idx} className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                      <span className="text-indigo-500 font-bold">•</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}

              {onApplyRate && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onApplyRate(result.median_rate)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-xs ml-auto"
                  >
                    <span>Apply Median (₹{Number(result.median_rate).toLocaleString()})</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary)]">
              <Calculator size={32} className="text-indigo-500/40 mb-2" />
              <p className="text-xs font-semibold">Select creator tier and deliverable</p>
              <p className="text-[11px] mt-1 max-w-xs">
                Click &quot;Calculate Fair Benchmark&quot; to ground rates against live 2025/2026 commercial standards.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

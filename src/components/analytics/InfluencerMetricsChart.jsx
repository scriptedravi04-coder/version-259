import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { supabase } from "../../lib/supabase";
import { TrendingUp, Users, Eye, RefreshCw } from "lucide-react";

/**
 * InfluencerMetricsChart Component
 * Built using D3.js to render dual-axis interactive line charts for Reach and Engagement trends.
 * Pulls telemetry directly from Supabase 'campaign_performance_metrics' (or /api fallback)
 * adhering to the schema defined in 'src/unique_features.js'.
 */
export default function InfluencerMetricsChart({
  entityId,
  initialData = null,
  height = 280,
  showSummary = true,
  title = "Audience Reach & Engagement Velocity",
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const [telemetry, setTelemetry] = useState(initialData);
  const [loading, setLoading] = useState(!initialData && !!entityId);
  const [error, setError] = useState(null);
  const [activeMetric, setActiveMetric] = useState("both"); // 'both' | 'reach' | 'engagement'
  const [hoveredData, setHoveredData] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Fetch telemetry from Supabase backend or API fallback
  const fetchMetrics = async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Attempt Supabase direct query first
      if (supabase) {
        try {
          const { data: sbData, error: sbError } = await supabase
            .from("campaign_performance_metrics")
            .select("*")
            .eq("deal_id", entityId)
            .maybeSingle();

          if (!sbError && sbData && sbData.time_series?.length > 0) {
            setTelemetry(sbData);
            setLoading(false);
            return;
          }
        } catch {
          // Table fallback
        }
      }

      // 2. Fetch from backend API endpoint
      const res = await fetch(`/api/market-intelligence/performance/${encodeURIComponent(entityId)}`);
      const json = await res.json();

      // Only measured numbers (session 27). No data → an empty state, never a made-up graph.
      if (res.ok && json.success && json.data) {
        setTelemetry(json.data);
      } else if (res.ok && json.success) {
        setTelemetry(null);
      } else {
        throw new Error(json.error || "Unable to load performance telemetry");
      }
    } catch (err) {
      console.warn("Performance telemetry fetch notice:", err);
      setTelemetry(null);
      setError(err?.message || "Unable to load performance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialData) {
      setTelemetry(initialData);
    } else if (entityId) {
      fetchMetrics();
    }
  }, [entityId, initialData]);

  const series = useMemo(() => {
    return telemetry?.time_series || [];
  }, [telemetry]);

  const summary = useMemo(() => {
    if (telemetry?.summary) return telemetry.summary;
    if (series.length === 0) return null;
    const last = series[series.length - 1];
    const totalViews = series.reduce((sum, d) => sum + (d.views || 0), 0);
    const avgEng = series.reduce((sum, d) => sum + (d.engagement_rate || 0), 0) / series.length;
    return {
      total_reach: last.reach || 0,
      total_views: totalViews,
      avg_engagement_rate: Math.round(avgEng * 10) / 10,
    };
  }, [telemetry, series]);

  // D3 Chart Rendering
  useEffect(() => {
    if (!svgRef.current || !series || series.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const containerWidth = containerRef.current
      ? containerRef.current.clientWidth
      : 600;
    const width = Math.max(containerWidth, 340);
    const margin = { top: 20, right: 45, bottom: 35, left: 55 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height);

    // Defs for Gradients and ClipPath
    const defs = svg.append("defs");

    // Reach Area Gradient
    const reachGradient = defs
      .append("linearGradient")
      .attr("id", `reach-grad-${entityId || "default"}`)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    reachGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#7C5CFF")
      .attr("stop-opacity", 0.35);

    reachGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#7C5CFF")
      .attr("stop-opacity", 0.0);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale
    const xScale = d3
      .scalePoint()
      .domain(series.map((d) => d.date))
      .range([0, innerWidth])
      .padding(0.1);

    // Y Scale Left (Reach)
    const maxReach = d3.max(series, (d) => d.reach) || 10000;
    const yScaleReach = d3
      .scaleLinear()
      .domain([0, maxReach * 1.15])
      .range([innerHeight, 0])
      .nice();

    // Y Scale Right (Engagement Rate %)
    const maxEng = d3.max(series, (d) => d.engagement_rate) || 8;
    const yScaleEng = d3
      .scaleLinear()
      .domain([0, Math.max(maxEng * 1.25, 6)])
      .range([innerHeight, 0])
      .nice();

    // Gridlines (Horizontal)
    const yGrid = d3
      .axisLeft(yScaleReach)
      .ticks(5)
      .tickSize(-innerWidth)
      .tickFormat("");

    g.append("g")
      .attr("class", "grid")
      .call(yGrid)
      .selectAll("line")
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.07)
      .attr("stroke-dasharray", "3,3");

    g.select(".grid .domain").remove();

    // X Axis
    const xAxis = d3.axisBottom(xScale).tickSize(0).tickPadding(12);
    const xAxisGroup = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisGroup.select(".domain").attr("stroke", "currentColor").attr("stroke-opacity", 0.15);
    xAxisGroup
      .selectAll("text")
      .attr("fill", "currentColor")
      .attr("opacity", 0.6)
      .style("font-size", "11px")
      .style("font-family", "inherit");

    // Y Axis Left (Reach)
    const yAxisLeft = d3
      .axisLeft(yScaleReach)
      .ticks(5)
      .tickSize(0)
      .tickPadding(8)
      .tickFormat((d) => (d >= 1000000 ? `${(d / 1000000).toFixed(1)}M` : d >= 1000 ? `${Math.round(d / 1000)}k` : d));

    const yAxisLeftGroup = g.append("g").call(yAxisLeft);
    yAxisLeftGroup.select(".domain").remove();
    yAxisLeftGroup
      .selectAll("text")
      .attr("fill", "#7C5CFF")
      .style("font-size", "10px")
      .style("font-weight", "600");

    // Y Axis Right (Engagement %)
    const yAxisRight = d3
      .axisRight(yScaleEng)
      .ticks(5)
      .tickSize(0)
      .tickPadding(8)
      .tickFormat((d) => `${d}%`);

    const yAxisRightGroup = g
      .append("g")
      .attr("transform", `translate(${innerWidth},0)`)
      .call(yAxisRight);
    yAxisRightGroup.select(".domain").remove();
    yAxisRightGroup
      .selectAll("text")
      .attr("fill", "#10B981")
      .style("font-size", "10px")
      .style("font-weight", "600");

    // Reach Area Generator
    const reachArea = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScaleReach(d.reach))
      .curve(d3.curveMonotoneX);

    // Reach Line Generator
    const reachLine = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScaleReach(d.reach))
      .curve(d3.curveMonotoneX);

    // Engagement Line Generator
    const engLine = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScaleEng(d.engagement_rate))
      .curve(d3.curveMonotoneX);

    // Draw Reach Area & Line if active
    if (activeMetric === "both" || activeMetric === "reach") {
      g.append("path")
        .datum(series)
        .attr("fill", `url(#reach-grad-${entityId || "default"})`)
        .attr("d", reachArea);

      const reachPath = g
        .append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", "#7C5CFF")
        .attr("stroke-width", 2.5)
        .attr("d", reachLine);

      // Animation
      const totalLength = reachPath.node()?.getTotalLength() || 600;
      reachPath
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    }

    // Draw Engagement Line if active
    if (activeMetric === "both" || activeMetric === "engagement") {
      const engPath = g
        .append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", "#10B981")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", activeMetric === "both" ? "4,3" : "none")
        .attr("d", engLine);

      const totalLength = engPath.node()?.getTotalLength() || 600;
      engPath
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(900)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    }

    // Crosshair line
    const crosshair = g
      .append("line")
      .attr("class", "crosshair")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.25)
      .attr("stroke-dasharray", "4,4")
      .style("opacity", 0)
      .style("pointer-events", "none");

    // Dot indicators
    const reachDot = g
      .append("circle")
      .attr("r", 5)
      .attr("fill", "#7C5CFF")
      .attr("stroke", "#FFFFFF")
      .attr("stroke-width", 2)
      .style("opacity", 0)
      .style("pointer-events", "none");

    const engDot = g
      .append("circle")
      .attr("r", 4.5)
      .attr("fill", "#10B981")
      .attr("stroke", "#FFFFFF")
      .attr("stroke-width", 2)
      .style("opacity", 0)
      .style("pointer-events", "none");

    // Interactive Overlay for Mouse Tracking
    const overlay = g
      .append("rect")
      .attr("class", "overlay")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair");

    overlay
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const eachBand = innerWidth / (series.length - 1 || 1);
        const index = Math.min(
          Math.max(Math.round(mx / eachBand), 0),
          series.length - 1
        );
        const selected = series[index];
        if (!selected) return;

        const xPos = xScale(selected.date);
        const yReach = yScaleReach(selected.reach);
        const yEng = yScaleEng(selected.engagement_rate);

        crosshair.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);

        if (activeMetric === "both" || activeMetric === "reach") {
          reachDot.attr("cx", xPos).attr("cy", yReach).style("opacity", 1);
        }
        if (activeMetric === "both" || activeMetric === "engagement") {
          engDot.attr("cx", xPos).attr("cy", yEng).style("opacity", 1);
        }

        const rect = containerRef.current?.getBoundingClientRect();
        setHoveredData(selected);
        setTooltipPos({
          x: (rect ? rect.left : 0) + margin.left + xPos,
          y: (rect ? rect.top : 0) + margin.top + Math.min(yReach, yEng),
        });
      })
      .on("mouseleave", function () {
        crosshair.style("opacity", 0);
        reachDot.style("opacity", 0);
        engDot.style("opacity", 0);
        setHoveredData(null);
      });
  }, [series, height, activeMetric, entityId]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)]/50 p-5 backdrop-blur-xs transition-all shadow-xs"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-[#7C5CFF]" />
            <h4 className="text-sm font-bold text-[var(--text-primary)]">{title}</h4>
            <span className="text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 px-2 py-0.5 rounded-full font-semibold">
              D3.js Real-Time
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
            Synchronized with Supabase & Google Grounded metrics
          </p>
        </div>

        {/* Metric Mode Filter */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-default)] text-xs">
          <button
            type="button"
            onClick={() => setActiveMetric("both")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              activeMetric === "both"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Dual Axis
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric("reach")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeMetric === "reach"
                ? "bg-[#7C5CFF]/15 text-[#7C5CFF] shadow-xs"
                : "text-[var(--text-tertiary)] hover:text-[#7C5CFF]"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#7C5CFF]"></span>
            Reach
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric("engagement")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeMetric === "engagement"
                ? "bg-emerald-500/15 text-emerald-500 shadow-xs"
                : "text-[var(--text-tertiary)] hover:text-emerald-500"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
            Engagement %
          </button>
          <button
            type="button"
            onClick={fetchMetrics}
            title="Refresh from Supabase"
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] rounded-lg transition-colors ml-1"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      {showSummary && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)]/60 rounded-xl p-3">
            <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider block">
              Cumulative Reach
            </span>
            <span className="text-base font-bold text-[#7C5CFF] font-mono mt-0.5 block">
              {(summary.total_reach || 0).toLocaleString()}
            </span>
          </div>
          <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)]/60 rounded-xl p-3">
            <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider block">
              Avg. Engagement
            </span>
            <span className="text-base font-bold text-emerald-500 font-mono mt-0.5 block">
              {summary.avg_engagement_rate}%
            </span>
          </div>
          <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)]/60 rounded-xl p-3">
            <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider block">
              Audience Impressions
            </span>
            <span className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5 block">
              {(summary.total_views || 0).toLocaleString()}
            </span>
          </div>
          {summary.benchmark_outperformance_pct != null && (
          <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)]/60 rounded-xl p-3">
            <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider block">
              Category Delta
            </span>
            <span className="text-base font-bold text-indigo-400 font-mono mt-0.5 block">
              {summary.benchmark_outperformance_pct > 0 ? '+' : ''}{summary.benchmark_outperformance_pct}%
            </span>
          </div>
          )}
        </div>
      )}

      {/* SVG Container */}
      <div className="relative w-full overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-card)]/70 backdrop-blur-xs z-10 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] font-mono">
              <RefreshCw size={14} className="animate-spin text-[#7C5CFF]" />
              Syncing Supabase telemetry...
            </div>
          </div>
        )}
        {!loading && series.length === 0 && (
          <div className="py-10 text-center text-xs text-[var(--text-tertiary)]">
            {error ? "Could not load performance data." : "No performance data recorded yet."}
          </div>
        )}
        <svg ref={svgRef} className="w-full text-[var(--text-primary)] overflow-visible" />
      </div>

      {/* D3 Hover Tooltip */}
      {hoveredData && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full mb-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-3 shadow-2xl text-xs backdrop-blur-md transition-all animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y - 10}px`,
          }}
        >
          <div className="font-bold text-[var(--text-primary)] border-b border-[var(--border-default)]/60 pb-1.5 mb-1.5 flex items-center justify-between gap-3">
            <span>{hoveredData.date}</span>
            <span className="text-[10px] text-indigo-400 font-mono">Verified Post Telemetry</span>
          </div>
          <div className="space-y-1 font-mono text-[11px]">
            <div className="flex items-center justify-between gap-4 text-[#7C5CFF]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFF]"></span> Reach:
              </span>
              <span className="font-bold">{hoveredData.reach?.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-emerald-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Engagement:
              </span>
              <span className="font-bold">{hoveredData.engagement_rate}%</span>
            </div>
            {hoveredData.views && (
              <div className="flex items-center justify-between gap-4 text-[var(--text-secondary)]">
                <span>Impressions:</span>
                <span>{hoveredData.views?.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { Clock, Upload } from "lucide-react";

export function MobileShortlistedCard({ campaignTitle, budget, isBrand }) {
  const alignSide = isBrand ? "flex-end" : "flex-start";
  const radius = isBrand ? "20px 20px 8px 20px" : "20px 20px 20px 8px";

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        borderRadius: radius,
        overflow: "hidden",
        background: "linear-gradient(165deg,#7C3AED,#5B21B6)",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
      }}
    >
      <div style={{ padding: "16px 14px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 20,
            background: "rgba(255,255,255,.18)",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: 3, background: "#fff" }} />
          <span
            style={{
              font: "600 9.5px 'DM Sans',sans-serif",
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#fff",
            }}
          >
            Shortlisted
          </span>
        </div>
        <div
          style={{
            marginTop: 14,
            font: "700 19px/1.15 'DM Sans',sans-serif",
            letterSpacing: "-1px",
            color: "#fff",
          }}
        >
          You're in 🎉
        </div>
        <div style={{ marginTop: 8, font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#FFFFFF" }}>
          You have been shortlisted for {campaignTitle || "this campaign"}. Next step: finalize terms.
        </div>
        <div style={{ marginTop: 15, display: "flex", gap: 7, flexWrap: "wrap" }}>
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 12,
              background: "rgba(255,255,255,.16)",
              font: "500 11px 'DM Sans',sans-serif",
              color: "#fff",
            }}
          >
            1 Reel + 2 Stories
          </span>
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 12,
              background: "rgba(255,255,255,.16)",
              font: "500 11px 'DM Sans',sans-serif",
              color: "#fff",
            }}
          >
            7 days
          </span>
          {Number(budget) > 0 && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 12,
                background: "rgba(255,255,255,.16)",
                font: "500 11px 'DM Sans',sans-serif",
                color: "#fff",
              }}
            >
              Budget ₹{Number(budget).toLocaleString("en-IN")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileBriefCard({ brief, timeText }) {
  const rows = [
    brief?.product_name && ["Product", brief.product_name],
    brief?.deadline_display && ["Deadline", brief.deadline_display],
    (brief?.dos || [])[0] && ["Do", brief.dos[0]],
    (brief?.donts || [])[0] && ["Don't", brief.donts[0]],
  ].filter(Boolean);

  return (
    <div
      style={{
        alignSelf: "stretch",
        background: "#fff",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 10px 24px -20px rgba(18,18,26,.4)",
      }}
    >
      <div style={{ padding: "14px 15px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ font: "600 10px 'DM Sans',sans-serif", letterSpacing: ".8px", textTransform: "uppercase", color: "#7C3AED" }}>
          Brief
        </div>
        <div style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6B7280" }}>{timeText}</div>
      </div>
      <div style={{ padding: "8px 15px 15px" }}>
        <div style={{ font: "600 15px 'DM Sans',sans-serif", color: "#0A0A0A" }}>{brief?.title || "UGC Deliverable"}</div>
        {rows.length > 0 && (
          <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 7 }}>
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ font: "400 12.5px 'DM Sans',sans-serif", color: "#6B7280" }}>{label}</span>
                <span style={{ font: "500 12.5px 'DM Sans',sans-serif", color: "#0A0A0A" }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function useCountdown(deadlineIso) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!deadlineIso) return;
    const tick = () => {
      const diff = new Date(deadlineIso).getTime() - Date.now();
      if (diff <= 0) {
        setLabel("Deadline passed");
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hrs = Math.floor((diff % 86400000) / 3600000);
      setLabel(days > 0 ? `${days} day${days === 1 ? "" : "s"} ${hrs} hrs left` : `${hrs} hrs left`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [deadlineIso]);
  return label;
}

export function MobileClaimedCard({ brief, deadlineIso, onOpenUpload }) {
  const countdown = useCountdown(deadlineIso);
  return (
    <div
      style={{
        alignSelf: "stretch",
        background: "#fff",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 10px 24px -20px rgba(18,18,26,.4)",
      }}
    >
      <div style={{ padding: "14px 15px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ font: "600 10px 'DM Sans',sans-serif", letterSpacing: ".8px", textTransform: "uppercase", color: "#059669" }}>
          Claimed · Ready to produce
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, font: "500 11.5px 'DM Sans',sans-serif", color: "#D97706" }}>
          <Clock size={12} />
          <span>{countdown || "7 days"}</span>
        </div>
      </div>
      <div style={{ padding: "9px 15px 15px" }}>
        <div style={{ font: "600 15px 'DM Sans',sans-serif", color: "#0A0A0A" }}>{brief?.title || "UGC Order"}</div>
        <div style={{ marginTop: 5, font: "400 13px/1.45 'DM Sans',sans-serif", color: "#6B7280" }}>
          Record in 9:16 vertical mode. Submit your draft before the deadline to keep your creator rating high.
        </div>
        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            style={{
              marginTop: 12,
              width: "100%",
              height: 42,
              borderRadius: 12,
              background: "#7C3AED",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              font: "600 13px 'DM Sans',sans-serif",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <Upload size={14} />
            <span>Upload content draft</span>
          </button>
        )}
      </div>
    </div>
  );
}

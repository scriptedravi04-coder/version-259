import React from "react";

export default function MobileDeclinedCard({
  message,
  isBrand,
  onApproveLast,
  onOpenChanges,
  onContactSupport,
  variant = "draft", // Session 43: "links" = the creator declined the brand's live-link changes
}) {
  const isLinks = variant === "links";
  const reason =
    message?.metadata?.reason ||
    message?.metadata?.feedback ||
    message?.content ||
    "The creator declined the requested changes.";
  const timeText = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const cardRadius = isBrand ? "20px 20px 20px 8px" : "20px 20px 8px 20px";
  const alignSide = isBrand ? "flex-start" : "flex-end";

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        boxSizing: "border-box",
        borderRadius: cardRadius,
        background: "#fff",
        borderLeft: "3px solid #E11D48",
        padding: 14,
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            font: "600 9.5px 'DM Sans',sans-serif",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#E11D48",
          }}
        >
          {isLinks ? "Link changes declined ⚠️" : "Resubmission declined ⚠️"}
        </span>
        <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C" }}>{timeText}</span>
      </div>

      <div style={{ marginTop: 9, font: "600 12.5px 'DM Sans',sans-serif", color: "#101014" }}>
        {isLinks
          ? (isBrand ? "Creator declined your link changes" : "You declined the link changes")
          : "Creator declined resubmission request"}
      </div>

      <div
        style={{
          marginTop: 9,
          padding: "11px 12px",
          borderRadius: 12,
          background: "#FEF2F2",
          font: "500 12.5px/1.5 'DM Sans',sans-serif",
          color: "#9F1239",
        }}
      >
        "{reason}"
      </div>

      {isBrand && (onOpenChanges || onApproveLast) ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onContactSupport}
              style={{
                flex: 1,
                height: 40,
                border: "1px solid #E4E4EC",
                borderRadius: 12,
                background: "#fff",
                font: "600 12px 'DM Sans',sans-serif",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              🛡 Contact support
            </button>
            <button
              onClick={onOpenChanges}
              style={{
                flex: 1,
                height: 40,
                border: "1px solid #F3E2BE",
                borderRadius: 12,
                background: "#FEF3C7",
                font: "600 12px 'DM Sans',sans-serif",
                color: "#92400E",
                cursor: "pointer",
              }}
            >
              ↻ Re-request changes
            </button>
          </div>
          <button
            onClick={onApproveLast}
            style={{
              height: 44,
              border: "none",
              borderRadius: 13,
              background: "#0B7B45",
              font: "700 12px 'DM Sans',sans-serif",
              letterSpacing: ".8px",
              textTransform: "uppercase",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {isLinks ? "✓ Approve last live link" : "✓ Approve last submission"}
          </button>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            height: 40,
            borderRadius: 12,
            background: "#FEF2F2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 12px 'DM Sans',sans-serif",
            color: "#9F1239",
          }}
        >
          {!isBrand && <span className="ybex-wait-spin" aria-hidden="true" style={{ width: 13, height: 13, marginRight: 8, borderRadius: "50%", border: "2px solid #FECDD3", borderTopColor: "#9F1239", display: "inline-block" }} />}
          {isBrand ? "Resolved — no action needed" : "Waiting for the brand to respond…"}
        </div>
      )}
      {/* Session 24: the creator can take it to support too, linked to this order. */}
      {!isBrand && onContactSupport && (
        <button
          onClick={onContactSupport}
          style={{
            marginTop: 8,
            width: "100%",
            height: 38,
            border: "1px solid #E4E4EC",
            borderRadius: 12,
            background: "#fff",
            font: "600 12px 'DM Sans',sans-serif",
            color: "#374151",
            cursor: "pointer",
          }}
        >
          🛡 Raise with support
        </button>
      )}
    </div>
  );
}

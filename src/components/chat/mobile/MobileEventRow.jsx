import React from "react";
import { Check } from "lucide-react";
import { ignored } from "../../../utils/ignored";

const NEGATIVE_HINTS = ["declined", "rejected", "cancelled", "failed", "revision requested", "changes requested"];

export default function MobileEventRow({ message }) {
  let content = message.content || message.text || "";
  if (typeof content === "string" && content.trim().startsWith("{") && content.includes('"text":')) {
    try {
      const parsed = JSON.parse(content);
      content = parsed.text || parsed.content || content;
    } catch (e) { ignored("MobileEventRow:12", e); }
  }
  const lower = content.toLowerCase();
  const isNegative = NEGATIVE_HINTS.some((h) => lower.includes(h));

  return (
    <div style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 6, maxWidth: 300, margin: "2px 0" }}>
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: 8,
          background: isNegative ? "#FFFBEB" : "#ECFDF5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {!isNegative && <Check size={10} strokeWidth={3} color="#059669" />}
      </span>
      <span
        style={{
          font: "500 11.5px/1.45 'DM Sans',sans-serif",
          color: isNegative ? "#92400E" : "#6B7280",
          textAlign: "center",
        }}
      >
        {content}
      </span>
    </div>
  );
}

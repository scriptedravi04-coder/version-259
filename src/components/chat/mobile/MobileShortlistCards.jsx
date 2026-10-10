import React, { useState } from "react";
import { formatAmount } from "../../../utils/safeFormat";
import { ignored } from "../../../utils/ignored";

// Session 43 (Ravi: "proper handshake"): the picture from Ravi's "Handshake Cards" design
// (public/img/handshake.webp), on a soft tinted circle with a floor shadow and two sparkles.
function Handshake({ tone = "violet" }) {
  const green = tone === "green";
  const circle = green ? "#E6F6EF" : "#F2EAFF";
  const floor = green ? "rgba(14,159,110,.16)" : "rgba(124,58,237,.18)";
  const spark = green ? "#5FD3A7" : "#A78BFA";
  const fade = "linear-gradient(90deg,transparent 0,#000 14%,#000 86%,transparent 100%)";
  return (
    <div style={{ position: "relative", height: 112, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px" }} role="img" aria-label="Handshake">
      <div style={{ position: "absolute", width: 88, height: 88, borderRadius: "50%", background: circle }} />
      <div style={{ position: "absolute", bottom: 4, width: 144, height: 12, borderRadius: "50%", background: floor, filter: "blur(4px)" }} />
      <span style={{ position: "absolute", zIndex: 1, left: "10%", top: 2, color: spark, fontSize: 14 }}>✦</span>
      <span style={{ position: "absolute", zIndex: 1, right: "11%", top: 0, color: spark, fontSize: 11, opacity: 0.8 }}>✦</span>
      <img
        src="/img/handshake.webp"
        alt=""
        loading="lazy"
        draggable={false}
        style={{ position: "relative", width: 190, maxWidth: "82%", height: "auto", filter: "drop-shadow(0 8px 10px rgba(20,17,28,.22))", WebkitMaskImage: fade, maskImage: fade }}
      />
    </div>
  );
}

const Row = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 0", borderTop: "1px solid #EFEFF3", fontSize: "11.5px" }}>
    <span style={{ color: "#6E6E7C" }}>{label}</span>
    <span style={{ fontWeight: 700, textAlign: "right", color: "#101014" }}>{value}</span>
  </div>
);

/**
 * Direct invitation, card 1 (session 27): the creator's automatic thank-you on accepting.
 */
export function MobileInviteThanksCard({ message, campaignTitle, isMine, thread }) {
  let m = message?.metadata;
  if (typeof m === "string") {
    try { m = JSON.parse(m); } catch (e) { ignored("MobileShortlistCards:thanks", e); }
  }
  m = m || {};
  const title = m.campaign_title || campaignTitle || thread?.campaign_title || "this campaign";
  const text = message?.content || message?.text || `Thanks for inviting me to "${title}"! Happy to discuss the details here.`;
  return (
    <div
      data-testid="mobile-invite-thanks-card"
      style={{
        flexShrink: 0, alignSelf: isMine ? "flex-end" : "flex-start", width: 302, maxWidth: "93%",
        borderRadius: isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px", background: "#fff",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)", overflow: "hidden", border: "1px solid #EAEAF2",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ height: 4, background: "linear-gradient(90deg, #8b5cf6, #6d3aec)" }} />
      <div style={{ padding: "14px 14px 12px", textAlign: "center" }}>
        <Handshake tone="violet" />
        <div style={{ marginTop: 6, marginBottom: 8 }}>
          <span style={{ display: "inline-block", font: "800 9.5px 'DM Sans', sans-serif", letterSpacing: "0.09em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 20, background: "rgba(109, 58, 236, 0.1)", color: "#6d3aec" }}>
            Invitation accepted
          </span>
        </div>
        <div style={{ font: "800 16px/1.2 'DM Sans', sans-serif", letterSpacing: "-0.4px", color: "#101014", marginBottom: 5 }}>
          Thanks for the invite!
        </div>
        <p style={{ margin: "0 0 10px", font: "400 12px/1.45 'DM Sans', sans-serif", color: "#5C5C6B" }}>{text}</p>
        <div style={{ background: "#F7F7FA", borderRadius: 12, padding: "4px 12px", textAlign: "left" }}>
          <Row label="Campaign" value={title} />
        </div>
      </div>
    </div>
  );
}

/**
 * MobileShortlistCongratsCard (Message 1)
 * Sent automatically from the Brand to Creator when shortlisted.
 */
export function MobileShortlistCongratsCard({
  message,
  campaignTitle,
  isMine,
  amount,
  thread,
}) {
  let m = message?.metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch (e) { ignored("MobileShortlistCards:95", e); }
  }
  m = m || {};

  const isDirectInvite = Boolean(
    m.is_direct_invite ||
    message?.message_type === "brand_invitation_card" ||
    message?.message_type === "pitch_invite"
  );
  const brandName = m.brand_name || thread?.brand_name || "Brand Partner";

  const title =
    m.campaign_title ||
    campaignTitle ||
    thread?.campaign_title ||
    thread?.campaigns?.title ||
    "this campaign";

  const budgetLabel =
    m.budget_label ||
    m.proposed_budget ||
    (thread?.budget_min && thread?.budget_max
      ? `₹${Number(thread.budget_min).toLocaleString("en-IN")} – ₹${Number(thread.budget_max).toLocaleString("en-IN")}`
      : amount
      ? `₹${formatAmount(amount)}`
      : "Negotiable");

  const deliverable =
    m.deliverable ||
    m.deliverables ||
    thread?.deliverable_type ||
    thread?.deliverables ||
    thread?.ugc_brief?.deliverables ||
    "1 Instagram Reel";

  const deliveryDays = m.delivery_days || m.timeline || thread?.delivery_days || "Flexible";

  const cardRadius = isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isMine ? "flex-end" : "flex-start";
  const timeText = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        borderRadius: cardRadius,
        background: "#fff",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        overflow: "hidden",
        border: "1px solid #EAEAF2",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          height: 4,
          background: "linear-gradient(90deg, #8b5cf6, #6d3aec)",
        }}
      />

      <div style={{ padding: "14px 14px 10px", textAlign: "center" }}>
        <Handshake tone="violet" />

        <div style={{ marginTop: 6, marginBottom: 8 }}>
          <span
            style={{
              display: "inline-block",
              font: "800 9.5px 'DM Sans', sans-serif",
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              padding: "3px 10px",
              borderRadius: 20,
              background: "rgba(109, 58, 236, 0.1)",
              color: "#6d3aec",
            }}
          >
            {isDirectInvite ? "Direct Campaign Invitation" : "You're Shortlisted"}
          </span>
        </div>

        <div
          style={{
            font: "800 16px/1.2 'DM Sans', sans-serif",
            letterSpacing: "-0.4px",
            color: "#101014",
            marginBottom: 5,
          }}
        >
          {isDirectInvite ? "You're Invited! 🎉" : "Congratulations! 🎉"}
        </div>

        <p
          style={{
            margin: 0,
            font: "400 12px/1.45 'DM Sans', sans-serif",
            color: "#5C5C6B",
          }}
        >
          {isDirectInvite ? (
            <>
              <b style={{ color: "#101014", fontWeight: 700 }}>{brandName}</b> invited you to collaborate on <b style={{ color: "#101014", fontWeight: 700 }}>{title}</b>.
            </>
          ) : (
            <>
              You have been shortlisted for <b style={{ color: "#101014", fontWeight: 700 }}>{title}</b>.
              <br />
              Let's finalize the terms.
            </>
          )}
        </p>
      </div>

      <div style={{ padding: "0 14px 12px" }}>
        <div
          style={{
            background: "#F8F8FC",
            border: "1px solid #EAEAF2",
            borderRadius: 13,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              font: "800 9px 'DM Sans', sans-serif",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#8E8EA0",
              marginBottom: 4,
            }}
          >
            Campaign details
          </div>
          <Row label="Campaign" value={title} />
          {budgetLabel && <Row label="Offered budget" value={budgetLabel} />}
          {deliverable && <Row label="Deliverables" value={deliverable} />}
          {deliveryDays && <Row label="Timeline" value={typeof deliveryDays === 'number' || /^\d+$/.test(deliveryDays) ? `${deliveryDays} days` : deliveryDays} />}
        </div>

        {m.pitch && (
          <div
            style={{
              marginTop: 8,
              background: "#F8F8FC",
              border: "1px solid #EAEAF2",
              borderLeft: "3px solid #6d3aec",
              borderRadius: 10,
              padding: "8px 10px",
              textAlign: "left",
            }}
          >
            <div style={{ font: "800 8.5px 'DM Sans', sans-serif", textTransform: "uppercase", color: "#8E8EA0", marginBottom: 2 }}>
              Brand's Pitch & Notes
            </div>
            <div style={{ font: "italic 11.5px/1.4 'DM Sans', sans-serif", color: "#101014" }}>
              "{m.pitch}"
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid #F0F0F5",
          padding: "8px 14px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          style={{
            font: "400 10.5px 'DM Sans', sans-serif",
            color: "#8E8EA0",
          }}
        >
          {isDirectInvite ? "Accepted by creator · Terms open" : "No action required — see your offer below"}
        </span>
        {timeText && (
          <span style={{ font: "400 10px 'DM Sans', sans-serif", color: "#8E8EA0", flexShrink: 0 }}>
            {timeText}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * MobileCreatorApplicationOfferCard (Message 2)
 * The creator's application proposal replayed into chat with fee, note, and Accept/Negotiate buttons.
 */
export function MobileCreatorApplicationOfferCard({
  message,
  campaignTitle,
  isMine,
  isBrand,
  thread,
  amount,
  onAcceptOffer,
  onCounterOffer,
  allMessages = [],
}) {
  let m = message?.metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch (e) { ignored("MobileShortlistCards:269", e); }
  }
  m = m || {};

  // No invented numbers (rule: a money claim in the UI must match the server). This used to
  // fall back to ₹10,000 / 7 days / 1 revision when a field was missing.
  const rawProposed =
    m.proposed_fee ??
    m.amount ??
    m.proposed_amount ??
    message?.content?.match(/₹\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ??
    message?.text?.match(/₹\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ??
    amount ??
    thread?.agreed_amount ??
    thread?.amount_fixed ??
    0;
  const offerAmount = Number(rawProposed) || 0;

  const title =
    m.campaign_title ||
    campaignTitle ||
    thread?.campaign_title ||
    thread?.campaigns?.title ||
    "this campaign";

  const pitch =
    m.pitch ||
    m.note ||
    m.cover_letter ||
    thread?.pitch ||
    thread?.cover_letter ||
    thread?.application?.pitch ||
    thread?.ugc_order?.pitch ||
    "";

  const deliveryDays = m.delivery_days || thread?.delivery_days || null;
  const revisions = m.revisions ?? thread?.revisions ?? null;
  const appliedAt = m.invited_at || m.applied_at || message?.created_at;
  // Direct invitation (session 26): the BRAND's offer, answered by the CREATOR.
  const isInviteOffer = message?.message_type === "brand_invitation_offer" || m.action === "brand_invitation_offer";
  const isDirectInvite = Boolean(
    !isInviteOffer && (m.is_direct_invite ||
    message?.message_type === "creator_invitation_acceptance")
  );
  const canAct = isInviteOffer ? !isBrand : isBrand;

  // Same answered-state rules as the desktop card (ShortlistCards.jsx).
  const flowUp = String(thread?.flow_state || "").toUpperCase();
  const statusUp = String(thread?.status || "").toUpperCase();
  const isExecuted = Boolean(
    (thread?.agreement_signed_creator && thread?.agreement_signed_brand) ||
    thread?.agreement_signed_at ||
    statusUp === "ACTIVE" ||
    ["ESCROW_PAID", "ESCROW_FUNDED", "COMPLETED", "PAID", "CONTENT_SUBMITTED", "IN_REVIEW", "APPROVED", "CLOSED"].includes(statusUp) ||
    ["ESCROW_PAID", "ESCROW_FUNDED", "COMPLETED", "CONTENT_SUBMITTED", "IN_REVIEW", "APPROVED", "CLOSED"].includes(flowUp)
  );
  const isReady = ["AI_AGREEMENT_READY", "AGREEMENT_SIGNED"].includes(flowUp) || ["AI_AGREEMENT_READY", "AGREEMENT_SIGNED"].includes(statusUp);
  const hasCounters = (allMessages || []).some(
    (x) => x && (x.message_type === "negotiation_offer" || x.message_type === "offer")
  );
  const answeredLabel = hasCounters ? "Countered" : isExecuted ? "Signed ✓" : isReady ? "Accepted ✓" : null;

  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterVal, setCounterVal] = useState("");
  const [busy, setBusy] = useState(false);

  const cardRadius = isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isMine ? "flex-end" : "flex-start";
  const timeText = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const handleAccept = async () => {
    if (!onAcceptOffer || busy) return;
    setBusy(true);
    try {
      await onAcceptOffer();
    } finally {
      setBusy(false);
    }
  };

  const handleSendCounter = async () => {
    if (!counterVal || !onCounterOffer || busy) return;
    setBusy(true);
    try {
      await onCounterOffer(counterVal);
      setShowCounterInput(false);
      setCounterVal("");
    } finally {
      setBusy(false);
    }
  };

  let appliedText = isInviteOffer ? "Sent with the invitation" : isDirectInvite ? "Direct Campaign Invitation Accepted" : "Submitted with application";
  if (appliedAt) {
    try {
      appliedText += ` · ${new Date(appliedAt).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch (e) { ignored("MobileShortlistCards:347", e); }
  }

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        borderRadius: cardRadius,
        background: "#fff",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        overflow: "hidden",
        border: "1px solid #EAEAF2",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Top green accent line */}
      <div
        style={{
          height: 4,
          background: "linear-gradient(90deg, #34d399, #0f9d58)",
        }}
      />

      <div style={{ padding: "14px 14px 10px", textAlign: "center" }}>
        <Handshake tone="green" />

        <div style={{ marginTop: 6, marginBottom: 8 }}>
          <span
            style={{
              display: "inline-block",
              font: "800 9.5px 'DM Sans', sans-serif",
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              padding: "3px 10px",
              borderRadius: 20,
              background: "rgba(15, 157, 88, 0.1)",
              color: "#0f9d58",
            }}
          >
            {isInviteOffer ? "Offer from brand" : isDirectInvite ? "Invitation Accepted 🤝" : "Offer from creator"}
          </span>
        </div>

        <div
          style={{
            font: "800 16px/1.2 'DM Sans', sans-serif",
            letterSpacing: "-0.4px",
            color: "#101014",
            marginBottom: 5,
          }}
        >
          {isInviteOffer ? "Glad to have you on board!" : isDirectInvite ? "Excited to collaborate! 🤝" : "Thank you for choosing me! 🤝"}
        </div>

        <p
          style={{
            margin: 0,
            font: "400 12px/1.45 'DM Sans', sans-serif",
            color: "#5C5C6B",
          }}
        >
          {isInviteOffer
            ? "Thanks for accepting the invitation. Here is our offer — accept it, or suggest your fee."
            : isDirectInvite
            ? "Thank you for the invitation — I've accepted your proposal below."
            : "Here is my proposal below — ready to move forward."}
        </p>
      </div>

      <div style={{ padding: "0 14px 12px" }}>
        {/* Fee & Specs box */}
        <div
          style={{
            background: "#F8F8FC",
            border: "1px solid #EAEAF2",
            borderRadius: 13,
            padding: "10px 12px",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              font: "800 9px 'DM Sans', sans-serif",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#8E8EA0",
              marginBottom: 3,
            }}
          >
            {isInviteOffer ? "Offered fee" : "Proposed fee"}
          </div>
          <div
            style={{
              font: "900 24px/1 'DM Mono', monospace, sans-serif",
              letterSpacing: "-0.5px",
              color: "#101014",
              marginBottom: 8,
            }}
          >
            {offerAmount > 0 ? `₹${formatAmount(offerAmount)}` : "—"}
          </div>
          <Row label="Campaign" value={title} />
          {(m.deliverable || m.deliverables) && <Row label="Deliverables" value={m.deliverable || m.deliverables} />}
          {m.timeline ? (
            <Row label="Timeline" value={m.timeline} />
          ) : deliveryDays ? (
            <Row label="Delivery" value={`${deliveryDays} days`} />
          ) : null}
          {revisions != null && <Row label="Revisions" value={`${revisions} included`} />}
        </div>

        {/* Creator Note */}
        {pitch ? (
          <div
            style={{
              background: "#FBFBFE",
              border: "1px solid #EAEAF2",
              borderLeft: "3px solid #7C3AED",
              borderRadius: 10,
              padding: "8px 10px",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                font: "800 9px 'DM Sans', sans-serif",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#7C3AED",
                marginBottom: 2,
              }}
            >
              {isInviteOffer ? "Brand's note" : "Creator's note"}
            </div>
            <p
              style={{
                margin: 0,
                font: "italic 400 12.5px/1.4 'DM Sans', sans-serif",
                color: "#101014",
                overflowWrap: "anywhere",
              }}
            >
              "{pitch}"
            </p>
          </div>
        ) : null}

        {/* Actions: the side that did NOT set the price gets Accept & Negotiate; the other waits. */}
        {answeredLabel ? (
          <div
            style={{
              height: 38,
              borderRadius: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: answeredLabel === "Countered" ? "#F5F3FF" : "#F0FDF4",
              border: `1px solid ${answeredLabel === "Countered" ? "#DDD6FE" : "#A7F3D0"}`,
              color: answeredLabel === "Countered" ? "#7C3AED" : "#059669",
              font: "800 12px 'DM Sans', sans-serif",
            }}
          >
            {answeredLabel}
          </div>
        ) : canAct ? (
          showCounterInput ? (
            <div
              style={{
                background: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: 12,
                padding: "10px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ font: "600 11px 'DM Sans',sans-serif", color: "#374151" }}>
                Your counter offer (min ₹3,000):
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0, // Session 41: keep Send inside the card
                    display: "flex",
                    alignItems: "center",
                    background: "#fff",
                    border: "1.5px solid #7C3AED",
                    borderRadius: 9,
                    padding: "0 8px",
                    height: 36,
                  }}
                >
                  <span style={{ font: "700 13px 'DM Sans',sans-serif", color: "#6B7280", marginRight: 4 }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    value={counterVal}
                    onChange={(e) => setCounterVal(e.target.value)}
                    placeholder="e.g. 8000"
                    autoFocus
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      font: "700 13px 'DM Sans',sans-serif",
                      color: "#101014",
                      background: "transparent",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCounterInput(false)}
                  style={{
                    height: 36,
                    width: 32,
                    borderRadius: 9,
                    background: "#F3F4F6",
                    border: "none",
                    color: "#6B7280",
                    font: "700 12px 'DM Sans',sans-serif",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={handleSendCounter}
                  disabled={busy || !counterVal}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 9,
                    background: "#7C3AED",
                    border: "none",
                    color: "#fff",
                    font: "700 11.5px 'DM Sans',sans-serif",
                    cursor: busy || !counterVal ? "not-allowed" : "pointer",
                    opacity: busy || !counterVal ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy ? "Sending..." : "Send 🚀"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowCounterInput(true)}
                disabled={busy}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 11,
                  background: "#fff",
                  border: "1px solid #D1D5DB",
                  color: "#374151",
                  font: "800 12px 'DM Sans', sans-serif",
                  cursor: busy ? "not-allowed" : "pointer",
                  transition: "background-color 0.15s",
                }}
              >
                Negotiate
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={busy}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 11,
                  background: "#7C3AED",
                  border: "none",
                  color: "#fff",
                  font: "800 12px 'DM Sans', sans-serif",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.7 : 1,
                  boxShadow: "0 4px 12px -2px rgba(124,58,237,0.35)",
                  transition: "opacity 0.15s",
                }}
              >
                {busy ? "Opening..." : offerAmount > 0 ? `Accept ₹${formatAmount(offerAmount)}` : "Accept"}
              </button>
            </div>
          )
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "#F8F8FC",
              border: "1px dashed #D1D5DB",
              borderRadius: 11,
              height: 38,
              font: "700 11.5px 'DM Sans', sans-serif",
              color: "#6B7280",
            }}
          >
            <span>{isInviteOffer ? "Waiting for the creator's reply" : "Awaiting brand response"}</span>
            <span style={{ display: "inline-flex", gap: 3 }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:200ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:400ms]" />
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid #F0F0F5",
          padding: "8px 14px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          style={{
            font: "400 10px 'DM Sans', sans-serif",
            color: "#8E8EA0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {appliedText}
        </span>
        {timeText && (
          <span style={{ font: "400 10px 'DM Sans', sans-serif", color: "#8E8EA0", flexShrink: 0 }}>
            {timeText}
          </span>
        )}
      </div>
    </div>
  );
}

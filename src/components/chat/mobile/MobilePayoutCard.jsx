import React, { useState, useEffect } from "react";
import { retentionLine } from "../../../lib/fileRetention";
import { Check, Bell, Download, FileText, Star } from "lucide-react";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import { isUgcThread } from "../../../utils/dealFlow";
import InvoiceModal from "../../payments/InvoiceModal";

import { Presence } from "../../common/Popup";
export default function MobilePayoutCard({
  message,
  isBrand,
  thread,
  amount,
  campaignTitle,
  onOpenRating,
}) {
  const meta = message?.metadata || {};
  const displayAmt =
    amount || meta.amount || thread?.agreed_amount || thread?.amount_fixed || 0;
  const displayCampaign =
    campaignTitle || meta.campaign_title || thread?.campaign_title || "Collaboration";
  // Same source as desktop SystemMessage: the bank UTR / reference the admin entered at payout.
  const utrNumber = thread?.utr_number || thread?.transaction?.utr_number || meta.utr_number || meta.utrNumber || null;
  const timeText = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : ""; // session 30: no made-up time when the message has none

  const [alertSent, setAlertSent] = useState(false);
  const [alertBusy, setAlertBusy] = useState(false);
  const [inlineRating, setInlineRating] = useState(5);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);

  // Both of these used to swallow every error and then show success anyway — the review went to
  // a route that does not exist (chat/threads/:id/review), so no review was ever saved while the
  // card said "submitted"; and a rejected admin alert still read "sent".
  const threadNs = isUgcThread(thread) ? "ugc" : "campaign";

  const handleAlertAdmin = async () => {
    if (alertBusy || alertSent) return;
    try {
      setAlertBusy(true);
      await api.post(`${threadNs}/threads/${thread?.id}/alert-admin-payout`);
      setAlertSent(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Couldn't alert the admin right now. Please try again.");
    } finally {
      setAlertBusy(false);
    }
  };

  const handleInlineRate = async (stars) => {
    if (ratingBusy || ratingSubmitted) return;
    setInlineRating(stars);
    try {
      setRatingBusy(true);
      await api.post(`${threadNs}/threads/${thread?.id}/submit-review`, {
        rating: stars,
        comment: "Smooth collaboration",
      });
      setRatingSubmitted(true);
    } catch (err) {
      if (err?.response?.status === 409) {
        setRatingSubmitted(true);
      } else {
        toast.error(err?.response?.data?.error || "Couldn't save your rating. Please try again.");
      }
    } finally {
      setRatingBusy(false);
    }
  };

  // Same lookup as desktop ChatBox.handleViewInvoice: the real transaction, or a clear message.
  // It used to open the browser print dialog on the chat screen.
  const [invoiceTxn, setInvoiceTxn] = useState(null);
  // Session 43 (Ravi: "the creator sees ₹6,087 and expects ₹6,087 in the bank"): the creator's card
  // shows what actually reaches the bank — the recorded payout after the Ybex fee — like desktop.
  const [creatorTxn, setCreatorTxn] = useState(null);
  useEffect(() => {
    if (isBrand || !thread?.id) return undefined;
    let alive = true;
    const ids = [thread?.campaign_deal_id, thread?.deal_id, thread?.ugc_order_id, thread?.id].filter(Boolean);
    api.get("transactions").then(({ data }) => {
      const rows = Array.isArray(data) ? data : [];
      const m = rows.find((t) => ids.includes(t.campaign_deal_id) || ids.includes(t.deal_id) || ids.includes(t.ugc_order_id));
      if (alive && m) setCreatorTxn(m);
    }).catch(() => null); // no receipt yet → the card says the fee is taken before payout
    return () => { alive = false; };
  }, [isBrand, thread?.id]);
  const creatorNet = !isBrand && creatorTxn && Number(creatorTxn.creator_net_amount) > 0 ? Number(creatorTxn.creator_net_amount) : null;
  const ybexFee = creatorNet != null && Number(displayAmt) > creatorNet ? Math.round((Number(displayAmt) - creatorNet) * 100) / 100 : null;
  const handleViewReceipt = async () => {
    try {
      const ids = [thread?.campaign_deal_id, thread?.deal_id, thread?.ugc_order_id, thread?.id].filter(Boolean);
      const { data } = await api.get("transactions");
      const rows = Array.isArray(data) ? data : [];
      const match = rows.find((t) => ids.includes(t.campaign_deal_id) || ids.includes(t.deal_id) || ids.includes(t.ugc_order_id));
      if (match) setInvoiceTxn(match);
      else toast.error("The receipt isn't available yet — it is generated once the payment is recorded.");
    } catch {
      toast.error("Couldn't load the receipt right now. Please try again.");
    }
  };

  const downloadUrl =
    thread?.final_video_url ||
    thread?.deliverables?.[0]?.file_url ||
    thread?.deliverables?.[0]?.media_url;

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: isBrand ? "flex-end" : "flex-start",
        width: 302,
        maxWidth: "93%",
        boxSizing: "border-box",
        borderRadius: isBrand ? "20px 20px 8px 20px" : "20px 20px 20px 8px",
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ height: 3, background: "linear-gradient(90deg,#10B981,#6366F1)" }} />

      {/* Top Header */}
      <div
        style={{
          padding: "13px 14px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            font: "600 9.5px 'DM Sans',sans-serif",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#0B7B45",
          }}
        >
          Payment released 🚀
        </span>
        <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C" }}>{timeText}</span>
      </div>

      {/* Hero Icon & Title */}
      <div style={{ padding: "14px 14px 0", textAlign: "center" }}>
        <div
          style={{
            width: 44,
            height: 44,
            margin: "0 auto",
            borderRadius: 22,
            background: "#0B7B45",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={22} color="#fff" strokeWidth={2.6} />
        </div>
        <div
          style={{
            marginTop: 10,
            font: "600 15.5px 'DM Sans',sans-serif",
            letterSpacing: "-.4px",
            color: "#101014",
          }}
        >
          Payment released &amp; approved
        </div>
        <div style={{ marginTop: 6, font: "400 12px/1.55 'DM Sans',sans-serif", color: "#5C5C6B" }}>
          Deliverables have been approved. Creator payout will be processed from secure payment hold within <b style={{ color: "#101014" }}>1–2 business days</b>.
        </div>
      </div>

      {/* Session 36: 15-day download window for the delivered files */}
      <div style={{ padding: "10px 14px 0", font: "400 11.5px/1.5 'DM Sans',sans-serif", color: "#5C5C6B", textAlign: "center" }} data-testid="payout-retention">
        {retentionLine(isBrand ? "brand" : "creator", message?.created_at || null)}
      </div>

      {/* CH-10: payout settled — the bank UTR, shown once the admin has paid (session 35) */}
      {utrNumber && (
        <div style={{ padding: "13px 14px 0" }}>
          <div style={{ padding: "10px 12px", borderRadius: 13, background: "#ECFDF5", border: "1.5px solid #A7F3D0", textAlign: "center" }} data-testid="payout-utr">
            <div style={{ font: "600 9.5px 'DM Sans',sans-serif", letterSpacing: "1px", textTransform: "uppercase", color: "#0B7B45" }}>
              Paid · UTR / bank reference
            </div>
            <div style={{ marginTop: 4, font: "700 16px 'DM Mono',ui-monospace,monospace", color: "#065F46", wordBreak: "break-all" }}>{utrNumber}</div>
          </div>
        </div>
      )}

      {/* Amount & Route Breakdown Box */}
      <div style={{ padding: "13px 14px 0" }}>
        <div style={{ padding: 12, borderRadius: 13, background: "#F7F7FA" }}>
          <div
            style={{
              font: "600 9.5px 'DM Sans',sans-serif",
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#5C5C6B",
            }}
          >
            {isBrand ? "Total released by brand" : creatorNet != null ? "You receive in your bank" : "Deal amount"}
          </div>
          <div
            style={{
              marginTop: 5,
              font: "700 24px/1 'DM Sans',sans-serif",
              letterSpacing: "-1.2px",
              color: "#101014",
            }}
          >
            ₹{Number(isBrand || creatorNet == null ? displayAmt : creatorNet).toLocaleString("en-IN")}
          </div>
          {!isBrand && (
            <div style={{ marginTop: 6, font: "500 11.5px/1.45 'DM Sans',sans-serif", color: "#5C5C6B" }} data-testid="payout-net-line">
              {creatorNet != null
                ? `Deal ₹${Number(displayAmt).toLocaleString("en-IN")}${ybexFee ? ` − Ybex fee ₹${ybexFee.toLocaleString("en-IN")}` : ""}. Full breakup in the receipt.`
                : "The Ybex fee is taken from this before it reaches your bank. See the receipt for the exact amount."}
            </div>
          )}
          <div
            style={{
              marginTop: 11,
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ font: "400 12px 'DM Sans',sans-serif", color: "#5C5C6B" }}>Campaign</span>
            <span
              style={{
                font: "600 12px 'DM Sans',sans-serif",
                color: "#101014",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 160,
              }}
            >
              {displayCampaign}
            </span>
          </div>
          <div style={{ marginTop: 7, display: "flex", justifySelf: "stretch", justifyContent: "space-between", gap: 10 }}>
            <span style={{ font: "400 12px 'DM Sans',sans-serif", color: "#5C5C6B" }}>Route</span>
            <span style={{ font: "600 12px 'DM Sans',sans-serif", color: "#101014" }}>Secure payment hold → bank payout</span>
          </div>
        </div>
      </div>

      {/* Settlement Warning & Admin Alert — creator only: it is the creator's payout. The brand
          used to see "Alert admin to release creator funds" too. (session 23) */}
      {!isBrand && (
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{ padding: "11px 12px", borderRadius: 12, background: "#FFF8EB" }}>
          <div
            style={{
              font: "600 9.5px 'DM Sans',sans-serif",
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#B45309",
            }}
          >
            Creator payout settlement
          </div>
          <div style={{ marginTop: 5, font: "400 12px/1.5 'DM Sans',sans-serif", color: "#78350F" }}>
            Funds are cleared. If not received within 1–2 business days, alert the secure payment hold desk.
          </div>
          <button
            disabled={alertSent || alertBusy}
            onClick={handleAlertAdmin}
            style={{
              marginTop: 10,
              width: "100%",
              height: 38,
              border: "none",
              borderRadius: 11,
              background: alertSent ? "#059669" : "#EA580C",
              font: "600 11.5px 'DM Sans',sans-serif",
              color: "#fff",
              cursor: alertSent ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Bell size={13} />
            <span>{alertSent ? "Admin Desk Alerted ✓" : "Alert admin to release creator funds"}</span>
          </button>
        </div>
      </div>

      )}

      {/* Action Buttons */}
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleViewReceipt}
            style={{
              flex: 1,
              height: 40,
              border: "1px solid #E4E4EC",
              borderRadius: 12,
              background: "#fff",
              font: "600 12px 'DM Sans',sans-serif",
              color: "#374151",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <FileText size={13} />
            <span>View receipt</span>
          </button>

          {downloadUrl ? (
            <a
              href={downloadUrl}
              download="final-video.mp4"
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                height: 40,
                border: "1px solid #E4E4EC",
                borderRadius: 12,
                background: "#fff",
                font: "600 12px 'DM Sans',sans-serif",
                color: "#374151",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                textDecoration: "none",
              }}
            >
              <Download size={13} />
              <span>{isBrand ? "Download video" : "Download PDF"}</span>
            </a>
          ) : null}
        </div>

        {ratingSubmitted ? (
          <div
            style={{
              height: 42,
              borderRadius: 13,
              background: "#ECFDF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 12px 'DM Sans',sans-serif",
              color: "#0B7B45",
            }}
          >
            ✓ Partner review submitted
          </div>
        ) : (
          <button
            onClick={() => onOpenRating?.()}
            style={{
              height: 42,
              border: "none",
              borderRadius: 13,
              background: "#7C3AED",
              font: "600 12.5px 'DM Sans',sans-serif",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span>✓ Submit partner review</span>
          </button>
        )}
      </div>
      <Presence>{invoiceTxn && (
        <InvoiceModal key="invoicemodal"
          transaction={invoiceTxn}
          isBrand={isBrand}
          creatorName={thread?.creator?.profile?.full_name || thread?.creator?.profile?.name || thread?.creator?.name || "Creator"}
          brandName={thread?.brand?.profile?.company_name || thread?.brand?.company_name || thread?.brand?.name || "Brand"}
          onClose={() => setInvoiceTxn(null)}
        />
      )}</Presence>
    </div>
  );
}

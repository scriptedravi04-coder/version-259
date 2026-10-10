import React, { useState, useRef } from "react";
import { APPROVE_NOTICE, retentionLine, FILE_REMOVED_TEXT } from "../../../lib/fileRetention";
import { Play, Maximize2, Video, CheckCircle2, AlertCircle, X, Download, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { resolveMediaUrl, YbexWatermarkOverlay } from "../../shared/VideoEmbedPreview";

// Session 43 (Ravi: "the Ybex watermark disappears in full screen"): the phone's own full-screen
// player draws only the video, so our watermark layer vanished. A draft (not yet approved) can't
// go into the phone's player — our full-screen view (with the watermark) is used instead.
function guardNativeFullscreen(el, protectedDraft) {
  if (!el || el.__ybGuard === protectedDraft) return;
  el.__ybGuard = protectedDraft;
  if (!protectedDraft) return;
  el.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
  el.setAttribute("disablePictureInPicture", "");
  el.setAttribute("webkit-playsinline", "");
  el.addEventListener("webkitbeginfullscreen", () => { try { el.webkitExitFullscreen?.(); } catch { /* ignore */ } });
  el.addEventListener("fullscreenchange", () => { try { if (document.fullscreenElement === el) document.exitFullscreen?.(); } catch { /* ignore */ } });
}

export function creatorNoteOf(meta = {}, message = {}) {
  const raw = String(meta.notes || meta.creator_notes || meta.caption || "").trim();
  if (!raw) return "";
  if (/deliverable url:|draft submitted for review|campaign-deliverables\/|\.(mp4|mov|webm)\b/i.test(raw)) return "";
  return raw;
}

export default function MobileDeliverableCard({
  message,
  isMine,
  isBrand,
  onApprove,
  onRequestChanges,
  onReupload,
  thread,
  isDealCompleted,
  isSuperseded = false,
}) {
  const meta = message.metadata || {};
  const rawMediaUrl =
    meta.media_url || meta.video_url || meta.file_url || meta.url || message.file_url || "";
  const mediaUrl = resolveMediaUrl(rawMediaUrl);
  // Session 43 (Ravi): "Creator notes" showed the system text with the file name
  // ("Campaign Deliverable Draft Submitted… Deliverable URL: …mp4") or a made-up line. Only what
  // the creator actually typed is shown; no note → no box.
  const notes = creatorNoteOf(meta, message);
  const timeText = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const isApproved =
    Boolean(isDealCompleted) ||
    meta.status === "APPROVED" ||
    thread?.flow_state === "CONTENT_APPROVED" ||
    thread?.flow_state === "COMPLETED" ||
    thread?.status === "COMPLETED" ||
    thread?.payout_status === "RELEASED";

  const [videoErr, setVideoErr] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesText, setChangesText] = useState("");
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);

  // A newer draft (or a later step) exists: this card is history, not something to act on.
  const canBrandReview = isBrand && !isApproved && !isMine && !isSuperseded;

  const handleApprove = async () => {
    setBusy(true);
    await onApprove?.();
    setBusy(false);
  };

  const handleSendChanges = async () => {
    if (!changesText.trim()) return;
    setBusy(true);
    await onRequestChanges?.(changesText);
    setBusy(false);
    setChangesOpen(false);
    setChangesText("");
  };

  const cardRadius = isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isMine ? "flex-end" : "flex-start";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        style={{
          flexShrink: 0,
          alignSelf: alignSide,
          width: 308,
          maxWidth: "94%",
          borderRadius: cardRadius,
          background: "#fff",
          overflow: "hidden",
          boxShadow: "0 14px 30px -20px rgba(16,16,20,.35), 0 4px 12px -4px rgba(0,0,0,.08)",
          fontFamily: "'DM Sans', sans-serif",
          border: "1px solid rgba(0,0,0,.06)",
        }}
      >
        <div style={{ height: 3.5, background: "linear-gradient(90deg,#9333EA,#6366F1)" }} />

        {/* Top Header */}
        <div style={{ padding: "13px 14px 10px", display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 11,
              flexShrink: 0,
              background: "#FAF0FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Video size={15} color="#9333EA" strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 13px 'DM Sans',sans-serif", letterSpacing: "-.2px", color: "#101014" }}>
              Content video proof submitted
            </div>
            <div
              style={{
                marginTop: 2,
                font: "600 9.5px 'DM Sans',sans-serif",
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: isApproved ? "#0B7B45" : "#B45309",
              }}
            >
              {isApproved ? "Approved" : isBrand ? "Aapka review baaki" : "Under review"}
            </div>
          </div>
          {timeText && (
            <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C", flexShrink: 0 }}>
              {timeText}
            </span>
          )}
        </div>

        {/* Video Preview Container */}
        <div
          style={{
            position: "relative",
            margin: "0 12px",
            height: 165,
            borderRadius: 14,
            overflow: "hidden",
            background: "#0a0a0f",
          }}
        >
          {videoErr ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center", font: "500 11.5px/1.5 'DM Sans',sans-serif", color: "#E4E4EC" }} data-testid="video-unavailable">
              {FILE_REMOVED_TEXT}{!isApproved ? " If this is still in review, ask for it to be uploaded again." : ""}
            </div>
          ) : mediaUrl && isPlaying ? (
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <video preload="metadata"
                ref={(el) => { videoRef.current = el; guardNativeFullscreen(el, !isApproved); }}
                src={mediaUrl}
                onError={() => setVideoErr(true)}
                controls
                autoPlay
                playsInline
                controlsList={isApproved ? "nodownload" : "nodownload nofullscreen noremoteplayback"}
                disablePictureInPicture={!isApproved}
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              />
              {!isApproved && <YbexWatermarkOverlay label="Ybex Protected Draft" />}
            </div>
          ) : (
            <>
              {mediaUrl ? (
                <video ref={(el) => guardNativeFullscreen(el, !isApproved)}
                  src={mediaUrl}
                  onError={() => setVideoErr(true)}
                  playsInline
                  preload="metadata"
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "radial-gradient(circle, #252538 0%, #101014 100%)",
                  }}
                />
              )}

              {/* Watermark overlay when paused/preview */}
              {!isApproved && <YbexWatermarkOverlay label="Ybex Protected Draft" />}

              {/* Center Play Button */}
              <div
                onClick={() => {
                  if (mediaUrl) {
                    setIsPlaying(true);
                  } else {
                    setFullscreen(true);
                  }
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  zIndex: 25,
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    background: "rgba(0,0,0,0.65)",
                    border: "2px solid rgba(255,255,255,0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    transition: "transform 0.15s ease",
                  }}
                >
                  <Play size={18} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
                </div>
              </div>

              {/* Full View Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreen(true);
                }}
                style={{
                  position: "absolute",
                  right: 8,
                  bottom: 8,
                  padding: "5px 9px",
                  borderRadius: 9,
                  background: "rgba(0,0,0,.75)",
                  border: "1px solid rgba(255,255,255,.2)",
                  font: "600 10px 'DM Sans',sans-serif",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  zIndex: 26,
                }}
              >
                <Maximize2 size={11} />
                <span>Fullscreen</span>
              </button>
            </>
          )}
        </div>

        {/* Creator Notes Box */}
        {notes && (
        <div style={{ padding: "11px 12px 0" }}>
          <div style={{ padding: "9px 12px", border: "1px solid #EFEFF3", borderRadius: 12, background: "#fafafa" }}>
            <div
              style={{
                font: "600 9.5px 'DM Sans',sans-serif",
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: "#6E6E7C",
              }}
            >
              Creator notes
            </div>
            <div style={{ marginTop: 4, font: "400 12px/1.45 'DM Sans',sans-serif", color: "#475569", wordBreak: "break-word" }}>
              {notes}
            </div>
          </div>
        </div>
        )}

        {/* Action Controls */}
        <div style={{ padding: 12 }}>
          {isApproved ? (
            <>
            <div
              style={{
                height: 38,
                borderRadius: 12,
                background: "#ECFDF5",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 13px",
              }}
            >
              <span style={{ font: "600 12px 'DM Sans',sans-serif", color: "#0B7B45" }}>
                ✓ Approved by brand
              </span>
              <span
                style={{
                  font: "600 9.5px 'DM Sans',sans-serif",
                  letterSpacing: ".8px",
                  textTransform: "uppercase",
                  color: "#0B7B45",
                }}
              >
                Clean master
              </span>
            </div>
            <div style={{ marginTop: 8, font: "400 11px/1.45 'DM Sans',sans-serif", color: "#5C5C6B" }} data-testid="retention-note">
              {retentionLine(isBrand ? "brand" : "creator", thread?.draft_approved_at || thread?.ugc_order?.draft_approved_at || meta.approved_at || null)}
            </div>
            </>
          ) : isSuperseded ? (
            <div style={{
                        padding: "10px 12px",
            borderRadius: 12,
            background: "#F4F4F6",
            font: "600 11.5px/1.45 'DM Sans',sans-serif",
            color: "#6B6B76",
          }}>
              A newer version or step is below — act on the latest card.
            </div>
          ) : canBrandReview ? (
            changesOpen ? (
              <div style={{ padding: 13, borderRadius: 13, background: "#F7F7FA" }}>
                <div
                  style={{
                    font: "600 9.5px 'DM Sans',sans-serif",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    color: "#5C5C6B",
                  }}
                >
                  Specify changes needed
                </div>
                <textarea
                  value={changesText}
                  onChange={(e) => setChangesText(e.target.value)}
                  placeholder="e.g. Please ensure product label is clearly visible in the first 3 seconds."
                  style={{
                    marginTop: 9,
                    width: "100%",
                    height: 64,
                    border: "1px solid #E4E4EC",
                    borderRadius: 12,
                    background: "#fff",
                    padding: "10px 12px",
                    font: "400 12.5px/1.5 'DM Sans',sans-serif",
                    color: "#101014",
                    resize: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ marginTop: 9, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setChangesOpen(false)}
                    style={{
                      height: 40,
                      padding: "0 15px",
                      border: "1px solid #E4E4EC",
                      borderRadius: 12,
                      background: "#fff",
                      font: "600 12.5px 'DM Sans',sans-serif",
                      color: "#5C5C6B",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={busy || !changesText.trim()}
                    onClick={handleSendChanges}
                    style={{
                      flex: 1,
                      height: 40,
                      border: "none",
                      borderRadius: 12,
                      background: "#7C3AED",
                      font: "600 12.5px 'DM Sans',sans-serif",
                      color: "#fff",
                      cursor: "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    Send changes request
                  </button>
                </div>
              </div>
            ) : (
              <>
              <div style={{ marginBottom: 8, font: "400 11px/1.45 'DM Sans',sans-serif", color: "#5C5C6B" }}>{APPROVE_NOTICE}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={busy}
                  onClick={() => (onRequestChanges ? onRequestChanges() : setChangesOpen(true))} /* Session 43: straight to "What should change?" */
                  style={{
                    flex: 1,
                    height: 40,
                    border: "1px solid #E4E4EC",
                    borderRadius: 12,
                    background: "#fff",
                    font: "600 12.5px 'DM Sans',sans-serif",
                    color: "#5C5C6B",
                    cursor: "pointer",
                  }}
                >
                  Request changes
                </button>
                <button
                  disabled={busy}
                  onClick={handleApprove}
                  style={{
                    flex: 1,
                    height: 40,
                    border: "none",
                    borderRadius: 12,
                    background: "#0B7B45",
                    font: "600 12.5px 'DM Sans',sans-serif",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  ✓ Approve draft
                </button>
              </div>
              </>
            )
          ) : (
            <div
              style={{
                height: 38,
                borderRadius: 12,
                background: "#FFF8EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 13px",
              }}
            >
              <span style={{ font: "600 12px 'DM Sans',sans-serif", color: "#92400E" }}>
                ⏳ Under review
              </span>
              <span
                style={{
                  font: "600 9.5px 'DM Sans',sans-serif",
                  letterSpacing: ".8px",
                  textTransform: "uppercase",
                  color: "#B45309",
                }}
              >
                With Brand
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Fullscreen Video Modal with Watermark & Animations */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 120,
              background: "rgba(0,0,0,.95)",
              backdropFilter: "blur(8px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 460,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#fff", font: "600 14px 'DM Sans',sans-serif" }}>
                  {isApproved ? "Master Video Deliverable" : "Ybex Protected Preview"}
                </span>
                {!isApproved && (
                  <span style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#FBBF24", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>
                    WATERMARKED
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", padding: 6, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ position: "relative", width: "100%", maxWidth: 460, maxHeight: "75vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {mediaUrl ? (
                <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: 16 }}>
                  <video ref={(el) => guardNativeFullscreen(el, !isApproved)} preload="metadata"
                    src={mediaUrl}
                    controls
                    autoPlay
                    playsInline
                    controlsList="nodownload"
                    style={{ width: "100%", maxHeight: "72vh", borderRadius: 16, background: "#000", objectFit: "contain" }}
                  />
                  {!isApproved && <YbexWatermarkOverlay label="Ybex Protected Draft" isFullscreen={true} />}
                </div>
              ) : (
                <div style={{ color: "#9CA3AF", font: "400 14px 'DM Sans',sans-serif", padding: 40 }}>
                  No media file available
                </div>
              )}
            </div>

            {isApproved && mediaUrl && (
              <motion.a
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                href={mediaUrl}
                download="final-deliverable.mp4"
                target="_blank"
                rel="noreferrer"
                style={{
                  marginTop: 14,
                  padding: "11px 22px",
                  borderRadius: 12,
                  background: "#059669",
                  color: "#fff",
                  font: "600 13px 'DM Sans',sans-serif",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 14px rgba(5,150,105,0.4)",
                }}
              >
                <Download size={16} />
                <span>Download Master Video</span>
              </motion.a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

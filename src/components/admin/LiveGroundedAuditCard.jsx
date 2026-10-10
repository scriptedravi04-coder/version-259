import React, { useState } from 'react';
import { Search, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck, ShieldAlert, Globe, ExternalLink as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';

/**
 * Reusable Live Grounded KYC & Authenticity Audit Card
 * Connects to /api/market-intelligence/kyc-grounded-audit
 * Adheres strictly to project button positioning conventions.
 */
export default function LiveGroundedAuditCard({ 
  target, 
  title = "Live Google Search & Authenticity Audit",
  className = "",
  initialAudit = null,
  onAuditComplete
}) {
  const [auditData, setAuditData] = useState(initialAudit);
  const [loading, setLoading] = useState(false);

  const isCreator = target?.target_type === 'creator' || target?.role === 'creator';
  const entityName = target?.name || target?.company_name || "Applicant";
  const entityHandle = target?.handle || target?.instagram_handle || target?.social_handle || target?.website || "";

  const runAudit = async () => {
    setLoading(true);
    try {
      const payload = {
        target_type: isCreator ? "creator" : "brand",
        target_id: target?.id || target?.user_id || target?.verification_id,
        name: entityName,
        handle: entityHandle,
        company_name: target?.company_name || (isCreator ? "" : entityName),
        website: target?.website || target?.brand_profile?.website || "",
        pan_name: target?.pan_name || target?.full_name || entityName,
        pan_number: target?.pan_number || target?.kyc?.pan_number || "",
        aadhaar_number: target?.aadhaar_number || target?.kyc?.aadhaar_number || "",
        bank_acc: target?.bank_acc || target?.bank_account_no || target?.kyc?.bank_account_number || "",
        bank_ifsc: target?.bank_ifsc || target?.ifsc_code || target?.kyc?.ifsc_code || "",
        gstin: target?.gstin || target?.gst_number || target?.kyc?.gst_number || "",
        cin: target?.cin || target?.cin_number || target?.kyc?.cin || "",
        platform: target?.platform || "Instagram",
        category: target?.category || target?.niche || target?.industry || "",
        follower_count: target?.follower_count || target?.followers || target?.creator_profile?.followers || "",
        avg_reach: target?.avg_reach || target?.avg_views || "",
        creator_state: target?.state || target?.creator_state || target?.location || ""
      };

      const { data: json } = await api.post("/market-intelligence/kyc-grounded-audit", payload);

      if (json && json.success) {
        setAuditData(json.data);
        onAuditComplete?.(json.data);
        toast.success(`Live audit completed for ${entityName}`);
      } else {
        throw new Error(json?.error || "Verification audit failed");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || err.message || "Audit failed to execute");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-gradient-to-br from-indigo-950/40 via-[var(--bg-card)] to-[var(--bg-elevated)] border border-indigo-500/25 rounded-2xl p-5 shadow-lg relative overflow-hidden ${className}`}>
      {/* Card Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
                    <h4 className="font-display font-bold text-sm text-[var(--text-primary)]">
            {title}
          </h4>
        </div>
        <span className="text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
          <Globe className="w-3 h-3 text-indigo-400" /> Grounded
        </span>
      </div>

      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
        Multi-factor verification verifying public presence, {isCreator ? "social handle authenticity & audience index" : "tax GSTIN/MCA registration & web footprint"}.
      </p>

      {!auditData ? (
        <div className="pt-1">
          <button
            type="button"
            onClick={runAudit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Auditing Live Identity Footprint...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Run Live Google Search &amp; KYC Audit</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-3.5 text-xs animate-in fade-in duration-200">
          {/* Score & Risk Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold block">
                Authenticity Score
              </span>
              <span
                className={`text-xl font-black font-mono ${
                  auditData.verification_score >= 80
                    ? "text-emerald-400"
                    : auditData.verification_score >= 50
                      ? "text-amber-400"
                      : "text-rose-400"
                }`}
              >
                {auditData.verification_score}/100
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold block">
                Risk Level
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md font-mono inline-block ${
                  auditData.risk_level === "LOW"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : auditData.risk_level === "HIGH"
                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {auditData.risk_level}
              </span>
            </div>
          </div>

          {/* Audit Summary */}
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-elevated)]/60 p-2.5 rounded-xl border border-[var(--border-default)]/60">
            {auditData.audit_summary}
          </p>

          {/* Verified Web / Govt Signals */}
          {(auditData.authenticity_signals || auditData.corporate_signals)?.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">
                Verified Verification Signals:
              </span>
              <div className="space-y-1">
                {(auditData.authenticity_signals || auditData.corporate_signals).map((sig, sIdx) => (
                  <div key={sIdx} className="flex items-start gap-1.5 text-[11px] text-[var(--text-primary)]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{sig}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Critical Risk Flags */}
          {auditData.risk_flags?.length > 0 && (
            <div className="space-y-1 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1 block">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                Critical Risk Flags:
              </span>
              <div className="space-y-1 mt-1">
                {auditData.risk_flags.map((flag, fIdx) => (
                  <div key={fIdx} className="flex items-start gap-1.5 text-[11px] text-rose-300">
                    <span className="text-rose-400 font-bold">•</span>
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Recommendation */}
          <div
            className={`p-2.5 rounded-xl border text-[11px] leading-relaxed ${
              auditData.risk_level === "HIGH"
                ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                : auditData.risk_level === "LOW"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
            }`}
          >
            <strong className="block font-bold mb-0.5">
              Recommendation: {auditData.approval_recommendation?.replace(/_/g, " ")}
            </strong>
            <span>{auditData.reasoning}</span>
          </div>

          {/* Web Search & Direct Proof Links */}
          {auditData.grounding_sources?.length > 0 && (
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block mb-1">
                Live Citations &amp; Grounding:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {auditData.grounding_sources.slice(0, 4).map((src, srcIdx) => (
                  <a
                    key={srcIdx}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-indigo-400 hover:underline inline-flex items-center gap-1 bg-[var(--bg-elevated)] px-2 py-0.5 rounded-md border border-[var(--border-default)]"
                  >
                    <span>{src.title}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Re-Audit Action Button */}
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={runAudit}
              disabled={loading}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Re-Scan Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Lightbulb, X } from 'lucide-react';
import LiveGroundedAuditCard from './LiveGroundedAuditCard';

import { PopupBackdrop, PopupPanel } from "../common/Popup";
/**
 * Quick Modal to view Live Grounded KYC & Authenticity Audit for any user or waitlist applicant.
 * Strict button alignment convention compliant.
 */
export default function QuickAuditModal({ target, isOpen, onClose }) {
  if (!isOpen || !target) return null;

  const isCreator = target?.target_type === 'creator' || target?.role === 'creator';
  const displayName = target?.name || target?.company_name || target?.user?.name || "Target Profile";

  return (
    <PopupBackdrop className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative">
        {/* Modal Header */}
        <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-elevated)]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
                Live KYC &amp; Authenticity Audit
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {displayName} • {isCreator ? "Creator Verification" : "Brand / Business Verification"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[80vh] overflow-y-auto">
          <LiveGroundedAuditCard 
            target={target} 
            title={`Real-Time Audit: ${displayName}`}
          />
        </div>

        {/* Modal Footer - Strict Left Dismiss / Right Action rule */}
        <div className="p-4 bg-[var(--bg-elevated)]/60 border-t border-[var(--border-default)] flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-card)]"
          >
            Close
          </button>
          <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
            Powered by Google Search Grounding &amp; Multi-Factor Verification
          </span>
        </div>
      </PopupPanel>
    </PopupBackdrop>
  );
}

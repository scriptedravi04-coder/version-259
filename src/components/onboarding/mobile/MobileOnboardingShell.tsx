import React from "react";
import { ChevronLeft } from "lucide-react";
import { useOnboardingSave, FinishLaterButton } from "../FinishLater";

// Session 34 (Ravi): "Save & exit" is gone. After the basic details are saved the header shows
// "Saved ✓" + "Finish later" (FinishLater.jsx). Before that there is nothing to save, so no button.
// A real action passed as onSave (e.g. "Skip" on the last step) still shows.
export default function MobileOnboardingHeader({
  onBack, saveLabel = "Save", onSave, variant, filledSteps, stepLabel
}: any) {
  // Session 39 (Ravi, creator onboarding): no back button on top (the phone's back goes to the
  // previous step — CreatorOnboardingMobile keeps the steps in browser history), and the middle
  // shows where you are ("Step 2 of 4" + a 4-part bar) instead of the "Saved" pill.
  if (variant === "creator") return <CreatorStepHeader {...{ saveLabel, onSave, filledSteps, stepLabel }} />;
  const { basicsDone, openFinishLater } = useOnboardingSave();
  const isSaveLike = !saveLabel || /^save/i.test(String(saveLabel));
  const showAction = Boolean(onSave) && !isSaveLike;
  const showFinish = Boolean(basicsDone && openFinishLater);
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ height: 52, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Back"
            style={{ width: 34, height: 34, borderRadius: 11, background: "transparent", border: "1px solid #E5E5EA", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <ChevronLeft size={17} color="#0A0A0A" strokeWidth={2.2} />
          </button>
        ) : (
          <div style={{ width: 34 }} />
        )}
        {/* Session 41 (Ravi): no "Saved" pill in the middle — "Finish later" on the right is enough. */}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 34, justifyContent: "flex-end" }}>
          {showAction && (
            <button onClick={onSave} style={{ background: "none", border: "none", font: "500 12.5px 'DM Sans',sans-serif", color: "#6B7280", cursor: "pointer", padding: 0 }}>
              {saveLabel}
            </button>
          )}
          {showFinish && <FinishLaterButton compact onClick={openFinishLater} />}
        </div>
      </div>
    </div>
  );
}

export function MobilePrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 52, borderRadius: 14, background: "#7C3AED", border: "none", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 8, font: "600 15px 'DM Sans',sans-serif", color: "#fff", cursor: "pointer",
        opacity: disabled ? 0.5 : 1, width: "100%", ...style,
      }}
    >
      {children}
    </button>
  );
}

export function MobileChip({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 36, padding: "0 13px", borderRadius: 10, cursor: "pointer",
        background: selected ? "#F5F0FF" : "#fff",
        border: selected ? "1px solid #E2D6FF" : "1px solid #E5E5EA",
        font: selected ? "600 13px 'DM Sans',sans-serif" : "500 13px 'DM Sans',sans-serif",
        color: selected ? "#7C3AED" : "#6B7280",
      }}
    >
      {label}
    </button>
  );
}

export function MobileFieldLabel({ children, right }) {
  return (
    <div style={{ marginTop: 20, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <div style={{ font: "600 10.5px 'DM Sans',sans-serif", letterSpacing: ".7px", textTransform: "uppercase", color: "#6B7280" }}>{children}</div>
      {right && <div style={{ font: "600 11.5px 'DM Sans',sans-serif", color: "#7C3AED" }}>{right}</div>}
    </div>
  );
}

export function MobileTextInput({ value, onChange, placeholder, prefix, type = "text", inputMode, maxLength, style }) {
  return (
    <div style={{ marginTop: 8, height: 48, borderRadius: 12, background: "#fff", border: "1px solid #E5E5EA", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", boxSizing: "border-box", width: "100%", maxWidth: "100%", minWidth: 0, ...style }}>
      {prefix && <span style={{ font: "500 14.5px 'DM Sans',sans-serif", color: "#6B7280", flexShrink: 0 }}>{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        style={{ flex: 1, border: "none", outline: "none", background: "transparent", font: "500 14.5px 'DM Sans',sans-serif", color: "#0A0A0A", minWidth: 0, width: "100%" }}
      />
    </div>
  );
}


function CreatorStepHeader({ saveLabel = "Save", onSave, filledSteps, stepLabel }: any) {
  const { basicsDone, openFinishLater } = useOnboardingSave();
  const isSaveLike = !saveLabel || /^save/i.test(String(saveLabel));
  const showAction = Boolean(onSave) && !isSaveLike;
  const showFinish = Boolean(basicsDone && openFinishLater);
  const step = Math.max(1, Math.min(4, Number(filledSteps) || 1));
  const isLast = /last step/i.test(String(stepLabel || ""));
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ height: 52, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div data-testid="onboarding-step" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ font: "600 11.5px 'DM Sans',sans-serif", color: "#6B7280", letterSpacing: ".2px" }}>
            {isLast ? "Last step" : `Step ${step} of 4`}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4].map((i) => (
              <span key={i} style={{ width: 22, height: 4, borderRadius: 2, background: i <= step ? "#7C3AED" : "#E5E5EA" }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "flex-end" }}>
          {showAction && (
            <button onClick={onSave} style={{ background: "none", border: "none", font: "500 12.5px 'DM Sans',sans-serif", color: "#6B7280", cursor: "pointer", padding: 0 }}>
              {saveLabel}
            </button>
          )}
          {showFinish && <FinishLaterButton compact onClick={openFinishLater} />}
        </div>
      </div>
    </div>
  );
}

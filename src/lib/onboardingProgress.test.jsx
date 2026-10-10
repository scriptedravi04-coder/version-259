import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import {
  resumeFor, creatorPageFromMobile, creatorPageFromDesktop, brandPageFromMobile, brandPageFromDesktop,
  isValidIndianMobile, userNeedsPhone,
} from "./onboardingProgress";

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
import MobileOnboardingHeader from "../components/onboarding/mobile/MobileOnboardingShell";
import { OnboardingSaveProvider } from "../components/onboarding/FinishLater";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("resume where they left (session 34)", () => {
  it("same flow → same screen; popups reopen the page under them", () => {
    expect(resumeFor("creator_mobile", { flow: "creator_mobile", page: "about", pos: { step: 2 } })).toEqual({ screen: 2 });
    expect(resumeFor("creator_mobile", { flow: "creator_mobile", page: "channels", pos: { step: 6 } })).toEqual({ screen: 5 });
    expect(resumeFor("brand_desktop", { flow: "brand_desktop", page: "channels", pos: { step: 3, sub: 2 } })).toEqual({ step: 3, sub: 2 });
  });
  it("other device → the same step there (DOB → DOB)", () => {
    // mobile DOB screen (2) → desktop part 1, where DOB lives, until DOB + gender are filled
    const mob = { flow: "creator_mobile", page: creatorPageFromMobile(2), pos: { step: 2 }, answers: {} };
    expect(resumeFor("creator_desktop", mob)).toEqual({ step: 1, sub: 1 });
    expect(resumeFor("creator_desktop", { ...mob, answers: { dobDay: "1", dobMonth: "2", dobYear: "2000", gender: "Female" } })).toEqual({ step: 1, sub: 2 });
    // desktop rate card → mobile rate card
    expect(resumeFor("creator_mobile", { flow: "creator_desktop", page: creatorPageFromDesktop(4, 1), pos: { step: 4, sub: 1 } })).toEqual({ screen: 8 });
    // brand: mobile account-manager screen ↔ desktop step 2
    expect(resumeFor("brand_desktop", { flow: "brand_mobile", page: brandPageFromMobile(4), pos: { step: 4 } })).toEqual({ step: 2, sub: 1 });
    expect(resumeFor("brand_mobile", { flow: "brand_desktop", page: brandPageFromDesktop(2, 1), pos: { step: 2, sub: 1 } })).toEqual({ screen: 4 });
    expect(resumeFor("creator_mobile", null)).toBe(null);
  });
  it("mobile number rule = sign-up rule", () => {
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(isValidIndianMobile("5876543210")).toBe(false);
    expect(userNeedsPhone({ phone: "" })).toBe(true);
    expect(userNeedsPhone({ phone: "+919876543210" })).toBe(false);
  });
});

describe("Finish later replaces Save & exit (session 34)", () => {
  it("before the basics: no save button; after: Saved ✓ + Finish later → sheet", () => {
    const { rerender } = render(<OnboardingSaveProvider basicsDone={false}><MobileOnboardingHeader saveLabel="Save & exit" onSave={() => {}} /></OnboardingSaveProvider>);
    expect(screen.queryByText("Save & exit")).toBeNull();
    expect(screen.queryByTestId("onboarding-finish-later")).toBeNull();
    rerender(<OnboardingSaveProvider basicsDone><MobileOnboardingHeader saveLabel="Save & exit" onSave={() => {}} /></OnboardingSaveProvider>);
    // Session 41 (Ravi): the "Saved" pill is gone from the brand header; Finish later stays.
    expect(screen.queryByTestId("onboarding-saved")).toBeNull();
    fireEvent.click(screen.getByTestId("onboarding-finish-later"));
    expect(screen.getByText("Your progress is saved")).toBeTruthy();
    expect(screen.getByText("Open the app any time to continue.")).toBeTruthy();
    expect(screen.getByText("Log out")).toBeTruthy();
  });
  it("a real action like Skip still shows", () => {
    render(<OnboardingSaveProvider basicsDone><MobileOnboardingHeader saveLabel="Skip" onSave={() => {}} /></OnboardingSaveProvider>);
    expect(screen.getByText("Skip")).toBeTruthy();
  });
  it("no onboarding screen says Save & exit; brand flows no longer keep progress only on the device", () => {
    for (const f of ["src/pages/onboarding/CreatorOnboardingMobile.jsx", "src/pages/onboarding/BrandOnboardingMobile.jsx", "src/components/Onboarding/BrandOnboardingFlow.jsx", "src/pages/onboarding/CreatorOnboarding.tsx"]) {
      const s = read(f);
      expect(s).not.toContain('"Save & exit"');
      expect(s).toContain("saveProgress(");
      expect(s).toContain("OnboardingSaveProvider");
    }
    expect(read("src/pages/onboarding/BrandOnboardingMobile.jsx")).not.toContain("localStorage.setItem");
    expect(read("src/components/Onboarding/BrandOnboardingFlow.jsx")).not.toContain("localStorage.setItem");
  });
  it("creator mobile: Instagram handle is required on the first screen", () => {
    expect(read("src/pages/onboarding/CreatorOnboardingMobile.jsx")).toContain("disabled={!store.fullName.trim() || !store.instagramHandle.trim()");
  });
});

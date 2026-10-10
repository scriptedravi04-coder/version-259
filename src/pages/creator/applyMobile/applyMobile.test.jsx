import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../components/shared/UniversalTagSearch", () => ({ default: () => <div data-testid="niche-search" /> }));
import ApplyMobileForm from "./ApplyMobileForm";
import ApplyMobileSuccess from "./ApplyMobileSuccess";
import ApplyConsent from "./ApplyConsent";

const base = {
  step: 1, onBack: vi.fn(), onNext: vi.fn(), onSubmit: vi.fn(), loading: false, step1Complete: false,
  fieldErrors: {}, setFieldErrors: vi.fn(), photo: "", photoUploading: false, onPhoto: vi.fn(),
  fullName: "", setFullName: vi.fn(), gender: "", setShowGenderSheet: vi.fn(), socialHandle: "", onHandle: vi.fn(),
  instagramLink: "", setInstagramLink: vi.fn(), followersInput: "1.5L", setFollowersInput: vi.fn(), avgReach: "", setAvgReach: vi.fn(),
  countryCode: "+91", setCountryCode: vi.fn(), COUNTRY_CODES: [{ code: "+91", flag: "🇮🇳" }], mobile: "", onMobile: vi.fn(),
  email: "", setEmail: vi.fn(), city: "", setCity: vi.fn(), cityRef: { current: null }, showCity: false, setShowCity: vi.fn(), cityMatches: [],
  charges: "", setCharges: vi.fn(), chargesFairness: null, niche: "", setNiche: vi.fn(), collabTypes: [], toggleCollabType: vi.fn(),
  COLLAB_TYPES: ["Paid Collab", "Barter Basis"], ugcRating: null, setUgcRating: vi.fn(), sampleLinks: [], currentSampleInput: "",
  setCurrentSampleInput: vi.fn(), addSampleLink: vi.fn(), removeSampleLink: vi.fn(), notes: "", setNotes: vi.fn(), consent: null, genderSheet: null,
};
const r = (f) => render(<MemoryRouter><ApplyMobileForm f={f} /></MemoryRouter>);

describe("public creator application — mobile (session 34, design 1a)", () => {
  it("step 1: grey Continue until valid, purple when complete; 1.5L shows = 1,50,000", () => {
    const { unmount } = r(base);
    const cta = screen.getByTestId("apply-mobile-cta-1");
    expect(cta.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("= 1,50,000")).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    fireEvent.click(cta);
    expect(base.onNext).toHaveBeenCalled(); // tapping still shows which fields are missing
    unmount();
    r({ ...base, step1Complete: true });
    expect(screen.getByTestId("apply-mobile-cta-1").getAttribute("aria-disabled")).toBe("false");
  });
  it("step 2: Skip, 1–10 grid, consent above Submit", () => {
    r({ ...base, step: 2, consent: <ApplyConsent compact /> });
    expect(screen.getByText("Skip")).toBeTruthy();
    expect(screen.getAllByRole("button", { pressed: false }).length).toBe(10);
    expect(screen.getByTestId("apply-consent")).toBeTruthy();
    expect(screen.getByText("Terms").getAttribute("href")).toBe("/info/terms");
    expect(screen.getByText("Privacy Policy").getAttribute("target")).toBe("_blank");
    expect(screen.queryByTestId("apply-marketing-optin")).toBeNull(); // Ravi: no separate updates box
  });
  it("success: summary + no promise of a copy by email", () => {
    render(<MemoryRouter><ApplyMobileSuccess name="Rahul Sharma" handle="dev.creates" email="r@x.in" niche="Beauty" waLink="https://wa.me/1" /></MemoryRouter>);
    expect(screen.getByText("@dev.creates")).toBeTruthy();
    expect(screen.queryByText(/copy is on its way/i)).toBeNull();
    expect(screen.getByText(/email when it is approved/i)).toBeTruthy();
  });
});

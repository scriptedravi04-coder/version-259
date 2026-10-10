import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../lib/api", () => ({ api: apiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { campaignAgreement, ugcAgreement, agreementPlainText } from "../../lib/agreementTerms";
import { AGREEMENT_VERSIONS } from "../../lib/agreementCapture";
import ContractModal from "./ContractModal";

// Session 30: agreement v1 (Ybex Media, Jaipur, 90 days live, non-exclusive, Section 10A) and
// "OTP only after the terms are ticked".
describe("agreement v1 text", () => {
  const c = agreementPlainText(campaignAgreement({ brandName: "cosmic eye", creatorName: "Ankit", amount: 4300, deliverables: ["1 Reel"], deadlineText: "5 Oct 2026", revisions: 2 }));
  const u = agreementPlainText(ugcAgreement({ brandName: "cosmic eye", creatorName: "Ankit", briefTitle: "Serum", payout: 1800, hours: 72, revisions: 3 }));
  it("has Ravi's decisions", () => {
    for (const t of [c, u]) {
      expect(t).toMatch(/Ybex Media, Jaipur/);
      expect(t).toMatch(/seated in Jaipur/);
      expect(t).toMatch(/non-exclusive/);
      expect(t).toMatch(/Section 10A/);
      expect(t).not.toMatch(/binding e-signature|constitutes a binding/i);
    }
    expect(c).toMatch(/at least 90 days/);
    expect(c).toMatch(/#ad/);
    expect(c).toMatch(/₹4,300/);
    expect(u).toMatch(/72 hours/);
  });
  it("versions are v1", () => {
    expect(Object.values(AGREEMENT_VERSIONS).every((v) => /-v1-/.test(v))).toBe(true);
  });
  it("no screen still claims a binding e-signature", () => {
    const dir = path.resolve(__dirname);
    for (const f of ["ContractModal.jsx", "UGCContractModal.jsx", "mobile/MobileContractSheet.jsx"]) {
      expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toMatch(/binding e-signature/);
    }
  });
});

describe("campaign agreement (desktop): OTP only after ticking", () => {
  beforeEach(() => {
    cleanup(); apiMock.get.mockReset(); apiMock.post.mockReset();
    apiMock.get.mockResolvedValue({ data: { email: "ankit@example.com" } });
    apiMock.post.mockImplementation(async (url) => (url === "/otp/verify" ? { data: { sign_token: "tok" } } : { data: {} }));
  });
  const thread = { id: "T1", brand: { name: "cosmic eye" }, creator: { name: "Ankit" }, amount_fixed: 4300 };
  const offer = { id: "O1", amount: 4300, title: "New TRY", deliverables: ["1 Reel"] };

  it("does not send the OTP until the box is ticked; signs with the v1 text", async () => {
    render(<ContractModal thread={thread} offer={offer} user={{ role: "creator", email: "ankit@example.com" }} onClose={() => {}} onSigned={() => {}} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(apiMock.post).not.toHaveBeenCalledWith("/otp/send", expect.anything());
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/otp/send", expect.objectContaining({ purpose: "contract_sign" })));
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verify OTP & sign"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/campaign/threads/T1/sign", expect.objectContaining({
      offer_id: "O1", sign_token: "tok", agreement_version: "campaign-v1-desktop", agreement_text: expect.stringMatching(/Jaipur/),
    })));
  });
});

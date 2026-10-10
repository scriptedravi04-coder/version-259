import { describe, it, expect } from "vitest";
import { parseCount as front, validateCreatorForm, countHint, checkChargesWarning } from "./creatorFormValidation";
import { parseCount as back } from "../../backend/creatorApplication";

describe("creator application numbers — form and server agree (session 34)", () => {
  it("same result for every format", () => {
    for (const v of ["1.5L", "1.5 lakh", "1,50,000", "150000", "150K", "1.2M", "2cr", "₹2,500", "abc", "", "12.5k"]) {
      expect(front(v)).toBe(back(v));
    }
    expect(front("1.5L")).toBe(150000);
    expect(countHint("1.5L")).toBe("= 1,50,000");
    expect(countHint("150000")).toBe("");
  });
  it("charges check reads 1.5L reach correctly", () => {
    expect(checkChargesWarning("1.5L", "₹40,000").reach).toBe(150000);
  });
  it("required: photo, name, gender, email, mobile, handle, city, followers, reach, price, niche", () => {
    const { errors } = validateCreatorForm({});
    expect(Object.keys(errors).sort()).toEqual(["avg_reach", "charges", "city", "email", "followers", "gender", "mobile", "name", "niche", "photo", "social_handle"].sort());
    const ok = validateCreatorForm({ photo: "data:image/png;base64,x", name: "Asha", gender: "Female", email: "a@b.in", mobile: "9876543210", social_handle: "@asha", city: "Jaipur", followers: "1.5L", avg_reach: "8k", charges: "2500", niche: "Beauty" });
    expect(ok.isValid).toBe(true);
  });
});

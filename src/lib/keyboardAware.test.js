import { describe, it, expect } from "vitest";
import { __test } from "./keyboardAware";

const { isKeyboardOpen } = __test;

describe("keyboard open detection (session 40)", () => {
  it("iPhone: page scrolled up by the keyboard still counts as open", () => {
    // 844 tall screen, 500 visible — the old sum subtracted the scroll offset and said 'closed'.
    expect(isKeyboardOpen({ focused: true, screenH: 844, visibleH: 500, scale: 1 })).toBe(true);
  });
  it("browser bar wobble, pinch zoom or nothing focused is not a keyboard", () => {
    expect(isKeyboardOpen({ focused: true, screenH: 844, visibleH: 780, scale: 1 })).toBe(false);
    expect(isKeyboardOpen({ focused: true, screenH: 844, visibleH: 400, scale: 2 })).toBe(false);
    expect(isKeyboardOpen({ focused: false, screenH: 844, visibleH: 400, scale: 1 })).toBe(false);
  });
});

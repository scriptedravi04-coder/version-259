import { describe, it, expect } from "vitest";
import { checkAbusiveContent, normalise, BLOCK_MILD_PROFANITY } from "./abuseFilter";

const blocked = (t: string) => checkAbusiveContent(t).blocked;

// These three were sent on the live app and delivered with nothing stopping them.
describe("the messages that actually got through", () => {
  it("blocks all three", () => {
    expect(blocked("baby i wanna fuck you")).toBe(true);
    expect(blocked("aapki gaand milegi?")).toBe(true);
    expect(blocked("meri gand ke ye charges hai")).toBe(true);
  });

  it("reports them as harassment, not mild profanity", () => {
    expect(checkAbusiveContent("baby i wanna fuck you").severity).toBe("harassment");
    expect(checkAbusiveContent("aapki gaand milegi?").severity).toBe("harassment");
  });
});

describe("obfuscation", () => {
  it("spaced-out letters", () => {
    expect(blocked("f u c k you")).toBe(true);
    expect(blocked("ch u t iya")).toBe(true);
  });

  it("repeated letters", () => {
    expect(blocked("fuuuck")).toBe(true);
    expect(blocked("gaaaand")).toBe(true);
  });

  it("character substitution", () => {
    expect(blocked("s3xy")).toBe(true);
    expect(blocked("g@@nd")).toBe(true);
    expect(blocked("fvck you")).toBe(true);
  });
});

describe("Hindi and Hinglish", () => {
  it("blocks Roman-script Hindi abuse", () => {
    expect(blocked("chutiya hai tu")).toBe(true);
    expect(blocked("madarchod")).toBe(true);
    expect(blocked("randi")).toBe(true);
  });

  it("blocks solicitation phrases", () => {
    expect(blocked("akele milo na")).toBe(true);
    expect(blocked("send nudes")).toBe(true);
  });
});

// The reason a word list alone is not enough: these all contain a listed token, and
// blocking any of them would make the filter worse than useless.
describe("does NOT block ordinary business language", () => {
  const fine = [
    "Please assess the draft",
    "this class of product",
    "I will pass it on",
    "the asset folder is shared",
    "assign it to me",
    "standard delivery in 3 days",
    "Chaudhary brand wants two reels",
    "budget is 3500 for 2 reels",
    "can you send the draft by tonight",
    "our sexual harassment policy is strict",
    "the compass logo needs work",
    "mass market audience",
    "I need to understand the brief"
  ];

  for (const msg of fine) {
    it(`allows: ${msg}`, () => {
      expect(blocked(msg)).toBe(false);
    });
  }
});

describe("mild profanity is reported but not blocked", () => {
  it("lets frustrated swearing through", () => {
    // Someone complaining about a late delivery is having a legitimate business
    // conversation. Blocking it drives them off the platform, which is the opposite of
    // what this filter is for.
    expect(BLOCK_MILD_PROFANITY).toBe(false);
    expect(blocked("this is shit")).toBe(false);
    expect(blocked("bakwas hai yaar")).toBe(false);
  });

  it("still flags it so admin can see a pattern", () => {
    const r = checkAbusiveContent("this is shit");
    expect(r.blocked).toBe(false);
    expect(r.severity).toBe("profanity");
    expect(r.matched).toBeTruthy();
  });
});

describe("exemptions and edge cases", () => {
  it("skips anything marked exempt, such as revision notes", () => {
    expect(checkAbusiveContent("fuck this", { exempt: true }).blocked).toBe(false);
  });

  it("handles empty and non-string input without throwing", () => {
    expect(() => checkAbusiveContent("")).not.toThrow();
    expect(() => checkAbusiveContent(null as any)).not.toThrow();
    expect(blocked("")).toBe(false);
  });

  it("normalise collapses repeats and joins spaced letters", () => {
    expect(normalise("gaaand").spaced).toContain("gand");
    expect(normalise("f u c k").spaced).toContain("fuck");
  });
});

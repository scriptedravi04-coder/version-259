// Anti-disintermediation filter: stops people moving a deal off the platform by swapping
// phone numbers, emails or social handles in chat.
//
// DESIGN NOTE — why bare keywords do not block on their own.
//
// The obvious implementation is a word blacklist: ban "phone", "contact", "mobile". That
// was tried and it is unusable, because those words carry ordinary meanings in exactly the
// conversations this platform exists to host:
//
//     "Is this for iPhone or Android?"
//     "Who should I contact about shipping?"
//     "My phone broke so I was offline"
//     "Shoot it in mobile portrait, not landscape"
//
// Blocking those trains users to distrust the chat, and they route around it — which is the
// opposite of what the filter is for. So a contact-word only counts as evidence when it
// appears NEAR something that could actually be a contact detail: digits, an @handle, a
// messaging domain. "contact me on 98765 43210" is blocked; "who should I contact" is not.
//
// Set STRICT_KEYWORD_MODE to true to go back to blocking bare keywords.

export const STRICT_KEYWORD_MODE = false;

export type FilterResult = {
  blocked: boolean;
  reason?: string;
  code?: string;
  message?: string;
};

export type FilterOptions = {
  threadId?: string;
  senderId?: string;
  /** Revision feedback, brief text and support tickets are never filtered. */
  exempt?: boolean;
  /** Test hook: overrides Date.now() for the chunking window. */
  now?: number;
};

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const LEET_MAP: Record<string, string> = {
  o: "0", q: "0", i: "1", l: "1", z: "2", e: "3", a: "4", s: "5", b: "8", g: "9", t: "7"
};

/** Turns 9I23O4578 into 912304578 so leetspeak digits are countable. */
export function decodeLeet(text: string): string {
  return text.replace(/[oqilzeasbgt]/gi, (ch) => LEET_MAP[ch.toLowerCase()] ?? ch);
}

const WORD_DIGITS: Record<string, string> = {
  // English
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  oh: "0", nought: "0",
  // Hindi / Hinglish
  shunya: "0", sunya: "0", zerro: "0",
  ek: "1", do: "2", teen: "3", tin: "3", char: "4", chaar: "4",
  panch: "5", paanch: "5", chah: "6", chhah: "6", chhe: "6", che: "6",
  saat: "7", sat: "7", aath: "8", ath: "8", nau: "9", no: "9"
};

/** "nine eight seven..." / "nau aath saat..." -> "987..." */
/** double/triple repeat the NEXT digit: "triple zero" is 000, not 0. */
const MULTIPLIERS: Record<string, number> = {
  double: 2, doubl: 2, dubble: 2, triple: 3, tripple: 3, tripel: 3
};

/**
 * Collapses runs of a repeated letter: "threee" -> "three", "naau" -> "nau".
 *
 * People misspell these deliberately precisely because it defeats a dictionary lookup, and
 * a single unmatched token used to end the whole digit run before it reached ten digits.
 */
function normaliseWord(tok: string): string {
  const collapsed = tok.replace(/(.)\1{1,}/g, "$1");
  if (WORD_DIGITS[tok] !== undefined) return tok;
  if (WORD_DIGITS[collapsed] !== undefined) return collapsed;
  // try the doubled-vowel forms people actually type: thre/three, nin/nine
  for (const key of Object.keys(WORD_DIGITS)) {
    if (key.replace(/(.)\1{1,}/g, "$1") === collapsed) return key;
  }
  return tok;
}

export function wordsToDigits(text: string): string {
  const tokens = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let out = "";
  let run = "";
  let pendingRepeat = 0;

  for (const raw of tokens) {
    const mult = MULTIPLIERS[raw] ?? MULTIPLIERS[raw.replace(/(.)\1{1,}/g, "$1")];
    if (mult) {
      pendingRepeat = mult;
      continue;
    }
    const tok = normaliseWord(raw);
    const d = WORD_DIGITS[tok];
    if (d !== undefined) {
      run += pendingRepeat > 1 ? d.repeat(pendingRepeat) : d;
      pendingRepeat = 0;
    } else {
      pendingRepeat = 0;
      if (run.length > out.length) out = run;
      run = "";
    }
  }
  if (run.length > out.length) out = run;
  return out;
}

/** Every real digit in the message, separators removed. No leet decoding — see below. */
export function extractDigits(text: string): string {
  return text.replace(/\D/g, "");
}

/**
 * Leet decoding is applied PER TOKEN, and only to tokens that already look like a
 * disguised number.
 *
 * Running decodeLeet over a whole sentence is catastrophic: every o/i/l/s/b/e in ordinary
 * prose becomes a digit, so "we need better mobility in the shot" turns into a long digit
 * run and gets blocked as a phone number. It has to be scoped to tokens that are already
 * mostly digits and long enough to be a number in the first place.
 */
export function leetDigitCandidates(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/[-().+]/g, "");
    if (token.length < 8 || token.length > 16) continue;
    const realDigits = (token.match(/\d/g) || []).length;
    const leetish = (token.match(/[oqilzeasbgt]/gi) || []).length;
    // must be predominantly digits already, with only a few letters standing in
    if (realDigits < 4) continue;
    if (realDigits + leetish < token.length) continue;
    out.push(decodeLeet(token).replace(/\D/g, ""));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Allow-list — these are the links creators legitimately send
// ---------------------------------------------------------------------------

const ALLOWED_URL_PATTERNS = [
  /instagram\.com\/(p|reel|reels|tv)\//i,
  /youtube\.com\/(watch|shorts)/i,
  /youtu\.be\//i,
  /drive\.google\.com\//i,
  /docs\.google\.com\//i,
  /vimeo\.com\/\d/i,
  /dropbox\.com\//i,
  /ybex\./i
];

function stripAllowedUrls(text: string): string {
  let out = text;
  for (const re of ALLOWED_URL_PATTERNS) {
    out = out.replace(new RegExp(`\\S*${re.source}\\S*`, "gi"), " ");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hard signals — these block on their own, no keyword needed
// ---------------------------------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+-]+\s*(?:@|\[at\]|\(at\)|\s+at\s+)\s*[a-z0-9.-]+\s*(?:\.|\[dot\]|\(dot\)|\s+dot\s+)\s*[a-z]{2,}/i;

const MESSAGING_DOMAIN_RE = /\b(?:wa\.me|whatsapp\.com|t\.me|telegram\.me|telegram\.org|signal\.me|m\.me|snapchat\.com\/add)\b/i;

/** ig: handle, insta id @foo, tg: @foo, snap: foo */
const HANDLE_RE = /\b(?:ig|insta|instagram|fb|facebook|tg|telegram|snap|snapchat|wa|whatsapp|discord)\s*(?:id|handle|username|user)?\s*[:=\-]\s*@?[a-z0-9._]{3,}/i;

/** Filenames and domains are not handles. */
const NOT_A_HANDLE = /\.(com|in|co|net|org|io|me|app|dev|mp4|mov|jpg|jpeg|png|gif|pdf|docx?|xlsx?|zip|csv|html?)$/i;

/**
 * A message that is nothing but a username.
 *
 * `HANDLE_RE` needs a prefix like `ig:` to fire, so `himanshu.gupta` sent on its own passed
 * straight through — and that is how handles are actually shared: one bare token, often
 * followed by "this is my insta" in the next message.
 *
 * Deliberately narrow: the WHOLE message has to be that single token. A sentence that
 * happens to contain a dotted word is not touched.
 */
export function isBareHandle(text: string): boolean {
  const tok = text.trim();
  if (!/^[^\s]{6,30}$/.test(tok)) return false;
  if (NOT_A_HANDLE.test(tok)) return false;
  if (/^https?:/i.test(tok)) return false;
  if (/\d{4,}/.test(tok)) return false;            // long digit runs are the phone rule's job
  // One character after the separator is enough — "himanshu_g" is a handle. The 6-character
  // minimum on the whole token is what keeps "e.g" and similar out.
  return /^@?[a-z0-9]+[._][a-z0-9._]+$/i.test(tok) || /^@[a-z0-9._]{3,}$/i.test(tok);
}

/**
 * `himasnhugupta@` has no domain, so the email pattern never matched it. A token carrying a
 * bare `@` is still someone handing over an address or a handle.
 */
export function hasLooseAtToken(text: string): boolean {
  for (const raw of text.split(/\s+/)) {
    const tok = raw.replace(/[),.;:]+$/, "");
    if (!tok.includes("@")) continue;
    if (tok.length < 4) continue;
    const [before, after = ""] = tok.split("@");
    if (before.length >= 3 || after.length >= 3) return true;
  }
  return false;
}

/**
 * Strips a country code or trunk prefix so 919876543210 and 09876543210 both reduce to the
 * bare number.
 */
function stripDialPrefix(digits: string): string {
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * Does this run of digits look like an Indian mobile?
 *
 * 9 and 11 digits count as well as 10. A number typed one digit short or one digit long is
 * still a phone number being shared — `890909099` (9 digits) went straight through while
 * this only accepted exactly 10. The 6-9 leading digit is what keeps prices, follower
 * counts and pincodes out: those are shorter, and the ones that are not do not start 6-9.
 */
function hasIndianMobile(digits: string): boolean {
  if (digits.length < 9 || digits.length > 15) return false;
  const core = stripDialPrefix(digits);
  for (const len of [10, 9, 11]) {
    for (let i = 0; i + len <= core.length; i++) {
      const slice = core.slice(i, i + len);
      if (new RegExp(`^[6-9]\\d{${len - 1}}$`).test(slice)) return true;
    }
  }
  return false;
}

/**
 * Digit runs, where a run may span spaces/dashes/dots/brackets but NEVER letters.
 *
 * Concatenating every digit in a message is too greedy: "890000 followers, avg reach
 * 2300000" becomes one 13-digit string containing "9000023000", which looks like a mobile
 * number and is not. Separate numbers in a sentence are separate numbers.
 */
export function digitRuns(text: string): string[] {
  const runs: string[] = [];
  for (const m of text.matchAll(/\d[\d\s\-.()]*\d|\d/g)) {
    const only = m[0].replace(/\D/g, "");
    if (only) runs.push(only);
  }
  return runs;
}

function anyRunIsMobile(text: string): boolean {
  return digitRuns(text).some(hasIndianMobile);
}

// ---------------------------------------------------------------------------
// Soft signals — contact words. Only count when near a contact-shaped thing.
// ---------------------------------------------------------------------------

const CONTACT_WORDS = [
  "phone", "mobile", "mob", "cell", "contact", "whatsapp", "whats app", "wapp",
  "telegram", "insta", "instagram", "snapchat", "signal", "email", "mail", "gmail",
  "call me", "ping me", "text me", "dm me", "number", "no.", "ph no", "contact no",
  "sampark", "number de", "baat karte", "call kar", "message kar",
  // Session 43 (Ravi: "Reach me at 931" / "509" / "9117" went through)
  "reach me", "reach out", "connect me", "msg me", "message me", "ring me", "dial", "whatsapp kar",
  "contact kar", "phone kar", "number pe", "is number"
];

function contactWordIn(lower: string): string | null {
  for (const w of CONTACT_WORDS) {
    // word-boundary match so "mob" does not fire inside "mobility"
    const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(lower)) return w;
  }
  return null;
}

/** 6+ digits, or an @handle, or a bare domain — something a contact detail could hide in. */
function hasContactShape(text: string, digits: string): boolean {
  if (digits.length >= 6) return true;
  if (/@[a-z0-9._]{3,}/i.test(text)) return true;
  if (/\b[a-z0-9-]+\.(com|in|me|net|org|io|co)\b/i.test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Cross-message chunking buffer
// ---------------------------------------------------------------------------

const WINDOW_MS = 5 * 60 * 1000;
const MIN_CHUNK = 3;

type BufferEntry = { digits: string; at: number };
const recentBuffer = new Map<string, BufferEntry[]>();

/**
 * Remembers whether a contact WORD or a contact VALUE was seen recently, per thread+sender.
 *
 * The digit buffer only ever remembered digits, so this pair walked straight through:
 *
 *     "himanshu.gupta"      <- a value, innocent on its own
 *     "this is my insta"    <- a word, innocent on its own
 *
 * Neither message is blockable alone; together they are obviously a handle being handed
 * over. Either order has to work, because people send them both ways round.
 */
type Signal = { kind: "word" | "value"; at: number };
const signalBuffer = new Map<string, Signal[]>();

export function resetRecentMessageBuffer(): void {
  recentBuffer.clear();
  signalBuffer.clear();
}

function recordSignal(key: string, kind: "word" | "value", now: number): boolean {
  const prior = (signalBuffer.get(key) || []).filter((e) => now - e.at < WINDOW_MS);
  const opposite = kind === "word" ? "value" : "word";
  const pairFound = prior.some((e) => e.kind === opposite);
  prior.push({ kind, at: now });
  signalBuffer.set(key, prior);
  return pairFound;
}

/**
 * A "value" is something a contact detail could actually BE: a message that is essentially
 * just a number, or a bare handle, or an @token.
 *
 * Note what is excluded — a sentence that merely contains a number. "890000 followers, avg
 * reach 2300000" is a fact about the deal, not a contact detail, and treating it as one
 * would block the next perfectly ordinary "who should I contact" message.
 */
function looksLikeContactValue(text: string, digits: string): boolean {
  if (isBareHandle(text)) return true;
  if (hasLooseAtToken(text)) return true;
  const compact = text.replace(/[\s\-().]/g, "");
  const mostlyDigits = compact.length > 0 && digits.length / compact.length >= 0.8;
  return mostlyDigits && digits.length >= 4;
}

/**
 * A phone number split across messages ("98765" then "43210") never contains ten digits
 * in any single message, so it has to be reassembled across the window.
 *
 * Only messages that are MOSTLY digits are buffered. A sentence that happens to contain a
 * number ("budget is 3500 for 2 reels") is not a chunk of anything, and treating it as one
 * is how a price discussion turns into a false block.
 */
function pushChunkAndCheck(key: string, text: string, digits: string, now: number): boolean {
  const chunk = chunkDigits(text, digits);
  if (!chunk) return false;
  digits = chunk;

  const prior = (recentBuffer.get(key) || []).filter((e) => now - e.at < WINDOW_MS);
  prior.push({ digits, at: now });
  recentBuffer.set(key, prior);

  // try every contiguous run of recent chunks
  for (let start = 0; start < prior.length; start++) {
    let joined = "";
    for (let end = start; end < prior.length; end++) {
      joined += prior[end].digits;
      if (joined.length >= 10 && hasIndianMobile(joined)) return true;
      if (joined.length > 14) break;
    }
  }
  return false;
}

/**
 * Session 43: the digits a message adds to a number being sent in pieces. A mostly-digit
 * message counts whole ("509"); a sentence counts only the run at its very END ("Reach me at
 * 931" → "931") — that is where people start a number they continue in the next message.
 * Prices ("₹3000", "3k", "5000 followers") are never chunks.
 */
export function chunkDigits(text: string, digits = extractDigits(text)): string | null {
  const t = String(text || "").trim();
  const compact = t.replace(/[\s\-().]/g, "");
  const isMostlyDigits = compact.length > 0 && digits.length / compact.length >= 0.8;
  if (isMostlyDigits) {
    if (/[₹$]|rs\.?\s*\d|inr/i.test(t)) return null;
    return digits.length >= 2 && digits.length <= 9 ? digits : null;
  }
  const m = t.match(/(?:^|[^\d₹$])(\d[\d\s\-.]{0,12})\s*$/);
  if (!m) return null;
  const before = t.slice(0, t.length - m[0].length + (m[0].match(/^\D/) ? 1 : 0));
  if (/(₹|rs\.?|inr|\$)\s*$/i.test(before)) return null;
  const run = m[1].replace(/\D/g, "");
  return run.length >= 2 && run.length <= 9 ? run : null;
}

/**
 * Session 43: same check from the chat's own history, so it works even when the messages
 * landed on different servers (the in-memory buffer above is per server). `previous` = this
 * sender's last text messages, oldest first. Blocks when whole pieces join into a mobile number.
 */
export function splitNumberAcrossMessages(text: string, previous: string[] = []): boolean {
  const pieces = [...previous.slice(-6), text].map((m) => chunkDigits(m));
  // Only consecutive pieces count — a normal sentence in between breaks the chain.
  let chain: string[] = [];
  const chains: string[][] = [];
  for (const p of pieces) {
    if (p) chain.push(p);
    else { if (chain.length) chains.push(chain); chain = []; }
  }
  if (chain.length) chains.push(chain);
  const last = chains[chains.length - 1];
  if (!last || pieces[pieces.length - 1] === null) return false;
  // The newest piece must be part of it; try every run of pieces that ends with it.
  for (let start = last.length - 1; start >= 0; start--) {
    const joined = last.slice(start).join("");
    if (joined.length > 13) break;
    const core = stripDialPrefix(joined);
    if (core.length === 10 && /^[6-9]\d{9}$/.test(core)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function checkComprehensiveDisallowedContent(
  text: string,
  opts: FilterOptions = {}
): FilterResult {
  const allow: FilterResult = { blocked: false };
  if (opts.exempt) return allow;
  if (!text || typeof text !== "string") return allow;

  const cleaned = stripAllowedUrls(text);
  const lower = cleaned.toLowerCase();
  const digits = extractDigits(cleaned);
  const now = opts.now ?? Date.now();

  // --- hard signals ---
  if (EMAIL_RE.test(lower)) {
    return block("EMAIL", "Email addresses can't be shared in chat.");
  }
  if (MESSAGING_DOMAIN_RE.test(lower)) {
    return block("MESSAGING_LINK", "Links to outside messaging apps can't be shared in chat.");
  }
  if (HANDLE_RE.test(lower)) {
    return block("HANDLE", "Social handles can't be shared in chat.");
  }
  if (isBareHandle(cleaned)) {
    return block("HANDLE_BARE", "That looks like a social handle. Please keep the conversation on Ybex.");
  }
  if (hasLooseAtToken(cleaned)) {
    return block("EMAIL_PARTIAL", "Email addresses and handles can't be shared in chat.");
  }
  if (anyRunIsMobile(cleaned)) {
    return block("PHONE", "Phone numbers can't be shared in chat.");
  }
  for (const cand of leetDigitCandidates(cleaned)) {
    if (hasIndianMobile(cand)) {
      return block("PHONE_LEET", "Phone numbers can't be shared in chat, disguised or otherwise.");
    }
  }

  const spelled = wordsToDigits(lower);
  // 9, not 10 — hasIndianMobile accepts short-by-one numbers now, and this guard was
  // silently overriding that for the spelled-out path.
  if (spelled.length >= 9 && hasIndianMobile(spelled)) {
    return block("PHONE_WORDS", "Phone numbers can't be shared in chat, spelled out or otherwise.");
  }

  // --- chunking across messages ---
  if (opts.threadId && opts.senderId) {
    const key = `${opts.threadId}:${opts.senderId}`;
    if (pushChunkAndCheck(key, cleaned, digits, now)) {
      return block("PHONE_CHUNKED", "That looks like a phone number split across messages.");
    }
  }

  // --- soft signal: contact word near something contact-shaped ---
  const word = contactWordIn(lower);
  const isValue = looksLikeContactValue(cleaned, digits);

  if (word && (STRICT_KEYWORD_MODE || hasContactShape(cleaned, digits))) {
    return block(
      "CONTACT_INTENT",
      "It looks like you're sharing contact details. Please keep the conversation on Ybex — your payment is only protected here."
    );
  }

  // --- a word and a value split across two messages ---
  if (opts.threadId && opts.senderId && (word || isValue)) {
    const key = `${opts.threadId}:${opts.senderId}`;
    if (recordSignal(key, word ? "word" : "value", now)) {
      return block(
        "CONTACT_SPLIT",
        "It looks like you're sharing contact details across messages. Please keep the conversation on Ybex."
      );
    }
  }

  return allow;
}

function block(code: string, message: string): FilterResult {
  return { blocked: true, code, reason: code, message };
}

export default checkComprehensiveDisallowedContent;

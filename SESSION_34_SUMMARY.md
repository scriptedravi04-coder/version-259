# Ybex — Session 34 Summary → START SESSION 35 FROM HERE

**Latest code:** `version-243.zip` = v242 code + this summary + `docs/prompts/SESSION_35_SUPABASE_PROMPTS.md` (no code change after v242).
Ravi writes Hindi/Hinglish → reply the same way; app/email text is English.
**State:** 951 tests pass, 1 skipped on purpose (100 files); `tsc`, crash guard, `vite build`, `protect:check` 9/9 clean.
**Rules:** ARCHITECTURE 1–75 + "PHASE 2" list at the end of ARCHITECTURE.md. New this session: 70 onboarding progress on the server, 71 brand "Important for you", 72 creator application, 73 legal text in one file, 74 consent records, 75 KYC without Aadhaar.
**Working rule (Ravi):** DISCUSS FIRST, BUILD ONLY AFTER RAVI SAYS "banao". Do not change anything he did not ask for. Locked flows (AGENTS.md): only with Ravi's written OK, logged in PROTECTED_CHANGES.md.
**Ravi's plan for session 35:** work with his Supabase-connected Claude → `docs/prompts/SESSION_35_SUPABASE_PROMPTS.md`.

---

## 1. SUPABASE — what is needed (session 35 starts here)

Prompts ready to paste, one at a time, in this order: `docs/prompts/SESSION_35_SUPABASE_PROMPTS.md`

| # | What | Why | File |
|---|------|-----|------|
| 0 | Health check (read only) | See which tables / columns / buckets already exist before changing anything | — |
| 1 | Table `onboarding_progress` | Onboarding saved after every step, resume on any device (v239+). Without it: kept on one server instance only | `scripts/sql/onboarding_progress.sql` |
| 2 | Table `user_consents` + `waitlist.terms_accepted_at` | Record of who agreed to which Terms, when (v241+). Without it: kept on one server instance only; apply form still works | `scripts/sql/user_consents.sql` |
| 3 | Aadhaar purge — read only (counts + file list) | Privacy Policy now says Ybex does not collect Aadhaar; old data must go | `scripts/sql/purge_aadhaar.sql` |
| — | Ravi deletes the listed Aadhaar images in Storage → `kyc-documents` | Files are not removed by SQL | — |
| 4 | Aadhaar purge — clear | Clears numbers / image links in `creator_kyc` and `verifications.documents` | `scripts/sql/purge_aadhaar.sql` |
| 5 | Session 31 Prompt 1 (landing reviews rating column) | Older pending | `docs/prompts/SESSION_31_SUPABASE_PROMPTS.md` |
| 6 | Session 31 Prompt 2 (delete empty `banner-images` bucket) | Older pending | same |
| 7 | Session 31 Prompt 3 (make `content-submissions` private) | Run LAST, after the new version is live and tested | same |

All new tables: RLS on, **no policies**, `anon` / `authenticated` revoked — only the server (service-role key) reads/writes them. If the service-role key on Cloud Run is wrong, every one of these writes fails → see section 2.

---

## 2. DEPLOY (Ravi)
- Cloud Run variables: `SUPABASE_SERVICE_ROLE_KEY` (service_role / `sb_secret_…`, the server refuses the anon key), `RESEND_API_KEY` + verified sender domain (ybexmedia.in) — needed for OTP, approve / reject emails, ticket emails; `PAYMENTS_TEST_MODE=false` only after Razorpay LIVE keys.
- Real inboxes someone reads (they are in the Terms now): `support@`, `legal@`, `privacy@`, `grievance@ybexmedia.in`.
- After deploy: sign up with a new email; if it fails send the exact red message.

---

## 3. DONE IN SESSION 34 (v239 → v242)

### v239 — work list A/B/C from session 33
- **A. Undo of session-33 mistakes:** creator mobile home = v235 file ("Complete your profile" back, no "Important for you"; avatar still → `/creator/settings`, which IS the mobile profile hub — Ravi OK); creator desktop header = v235 header (pravatar stock photo kept — Ravi).
- **B.** Invite popup labels "Decline" / "Accept & open deal room" (tests updated, logged). **Brand desktop "Important for you"** (`src/lib/brandTasks.js`): review (UGC + campaign draft / live link — Ravi OK) → deal room brand's turn (counter only when the last message is the creator's offer; sign; fund) → new applicants per campaign → KYC → company profile → "Post a campaign" / "Explore creators". Promo tasks removed. `/brands/me/application-stats` + campaign_id, status.
- **C. Onboarding saved on the server** (`backend/onboardingProgress.ts`, `src/lib/onboardingProgress.js`): every step, resume on any device (desktop ↔ mobile mapping), basics first (creator: name + Instagram — required on mobile now — + mobile if Google sign-up had none; brand: company → account manager with designation + mobile, new order 1→4→2→3→5→6→7 / 1.1→2→1.2→3→4), "Saved ✓" + "Finish later" sheet (+ Log out) replaces "Save & exit".

### v240
- **Support ticket — user reply** (`POST /support/tickets/:id/messages`): owner only, RESOLVED → OPEN, CLOSED → 409, 2000 chars, 1 per 3 s; reply box in `TicketThread.jsx` (mobile + desktop).

### v241 — creator application + legal
- **Public creator application `/apply`** (rule 72, `backend/creatorApplication.ts`): submit = Pending waitlist row only (real save or error, never a fake success; never creates / changes a profile or an existing account). Required: photo, name, gender, email, mobile, Instagram handle, city, followers, avg reach, price (1 UGC video), niche; optional: profile URL, collab types, experience, sample links, notes. One number rule (1.5L = 1,50,000) on form + server. Photo uploaded by the server. Fake data removed. **No spam limit** (Ravi: ads running, team checks by hand). Mobile UI = design "1a" (`src/pages/creator/applyMobile/`), desktop got consent + required marks.
- **Admin waitlist:** approve (single + batch, shared `approveCreatorApplication`) = ONE unclaimed profile per email, a real account with that email is never touched (bug fixed), metrics from the applicant's own followers / reach; approve email; reject needs a reason and emails it; batch reads the DB; only admins edit.
- **Legal** (rules 73–75): one text source `src/lib/legal/legalContent.js`. Public: `/info/terms` (short), `/privacy-policy`, `/info/refunds` (+ `/terms`, `/privacy`, `/refunds` redirects — signup links were broken). App-only: `/info/creator-terms`, `/info/brand-terms`. Settings → Privacy & Terms on 4 surfaces = `LegalPanel` (creator / brand + common cards, accepted date, "Offers and promotions" switch, Grievance Officer). False claims removed ("Zero Middlemen Markup", "GDPR & DPDP", fake GSTIN, "Insurance" on PDF). Consent lines: signup, Google button, apply form, onboarding last step (required box, 4 flows), above every Brand Pay button, OTP signing. Mobile 18+ check. Consent records table. KYC without Aadhaar (creator PAN + bank/UPI; brand GSTIN or PAN). Receipt vs tax invoice from the GST toggle. Name "Ybex Media", domain ybexmedia.in, one email domain (admin seed login email left as is).
- **"Escrow" → "secure payment hold"** on user screens (Ravi's written OK; 10 locked files, text only, verified line by line, logged twice in PROTECTED_CHANGES). Message-matching strings kept. Admin screens still say escrow (Phase 2).

### v242
- **One consent box** (Ravi: "alag se box nahi dena hai"): separate "updates" boxes removed (signup + apply, desktop + mobile). Line: "I am 18 or older and agree to the Terms and Privacy Policy, including emails about new campaigns, my account and Ybex updates." Terms §9 "Messages from Ybex". Settings switch = "Offers and promotions" (default off).

### Legal draft doc
"Ybex Media — Legal Pages (Rough Draft v1)" (Claude Doc, shared with Ravi): Parts A–G + "Decided (7 Oct)". Part E still shows the old two-box table — update before sending to the lawyer. Final wording in the app = `legalContent.js`.

### Ravi's decisions (7 Oct)
Ybex Media (type / CIN / address after registration) · ybexmedia.in · Grievance Officer Ravi Sharma · Jaipur courts / arbitration · gateway charges paid by Ybex · KYC PAN only, no Aadhaar · liability cap OK · content licence 12 months organic · no hiring outside Ybex 12 months · auto-approval after 72 h = to build (Phase 2, not in Terms yet) · not GST-registered yet (receipts; toggle later) · payment hold in current account for now · DPDP paperwork Phase 2 · promo email system Phase 2.

---

## 4. OPEN — waiting for Ravi (discuss first, build after "banao")
1. **Fee model** (most important — landing + creator form marketing depend on it). Claude will NOT label the fee as "tax" / "other taxes" or claim "zero platform fees" while deducting from creators (misleading-ad / dark-pattern risk; told Ravi). Proposal: **Option B — all-inclusive price**: creator gets 100% of the quoted amount; brand sees one price = rate + "Secure payment & service charge"; Brand Terms + receipt line "Price includes Ybex secure payment & service charge". Then "Zero platform fees for creators" is TRUE. Needs: charge % (10%? or current 15% / 5%), Ravi's written OK for locked money logic (`feeCalculator.ts`, `payment_routes.ts`), CA check on GST. Until then the app says "Zero platform fee for brands", "Free to join — no listing fees", "Ybex service fee" (deducted from the creator, shown before signing).
2. **Chat socket** → shared connection (locked `ChatBox.jsx`, `useChatThreadMobile.js`; also `BrandUGCOrders.jsx`, `ManageUGCOrdersView.jsx`). Needs "chat socket banao".
3. Brand bank / UPI in KYC — suggested NOT to collect (refunds go to the original payment method). Waiting for Ravi.
4. Apply form: design marks profile URL + collab types required; built optional per Ravi's list — confirm.
5. CA answers (TDS section / rate, GST / TCS, invoice format) → update `legalContent.js` + receipts. Company registration details → Terms. Lawyer review of the final Terms.

## 5. PHASE 2 (in ARCHITECTURE.md)
DPDP paperwork · re-accept changed Terms · KYC / bank consent boxes · delete account + download my data · auto-approval 72 h (then add to Terms) · Razorpay Route for the payment hold · CA answers · admin screens "escrow" wording · promo / update email system (admin send screen, unsubscribe link + page, List-Unsubscribe header).

## 6. NEVER BUILT (older sessions)
AP-03 Pay & hire · AP-04 Fund all / Nudge · EX-04 Chat before accept · onboarding reminder emails (Ravi: later).

## 7. RAVI TO TEST ON A DEVICE (only unit-tested so far)
Onboarding resume phone ↔ laptop (creator + brand) · Google sign-up without phone · Finish later → Log out → log in → same step · support ticket reply (user → admin helpdesk → admin reply) · apply form on mobile with "1.5L" → admin approve → appears once on Explore; reject → email with reason · signup one box + links open in a new tab · onboarding last step blocks without the tick · Pay line before paying · receipts say "Payment receipt" (no GSTIN).

## 8. OLDER PENDING
Admin → Speed report ("Move banner pictures", "Check" → "Make small", screenshot after "Measure again" → Cloud Run steps) · UGC brief test (paid brief in My Briefs + Payments) · kept as is by Ravi: brand home ticker, default banners, mobile UGC Live Timer card.

# Ybex — Session 33 Summary → START SESSION 34 FROM HERE

**Latest code:** `version-238.zip` = v237 code + this summary (no code change after v237). Ravi writes Hindi/Hinglish → reply the same way; app/email text is English.
**State (v237/v238):** 900 tests pass, 1 skipped on purpose (91 files); `tsc`, crash guard, `vite build`, `protect:check` 9/9 clean.
**Rules:** ARCHITECTURE 1–69 (new this session: 68 signup/OTP, 69 Explore mobile). AGENTS.md lock rules unchanged.
**Working rule (Ravi, session 33):** DISCUSS FIRST, BUILD ONLY AFTER RAVI SAYS "banao". Do not change anything he did not ask for (e.g. the creator header was changed by mistake because it was in a screenshot).

---

## Done in session 33

### v236
- **Signup / OTP fixed** (Gemini v235 fallback removed): accounts only in Supabase; OTP stored hashed only (no `plain_otp`); `OTP_SAVE_FAILED` / `SIGNUP_INSERT_FAILED` show the DB reason; duplicate-safe email lookup; OTP returned to the browser only in test mode; anon/publishable key in `SUPABASE_SERVICE_ROLE_KEY` rejected at startup; signup shows the server message (no generic 500 toast). Kept Gemini's good fixes (first/last name, phone sanitizer).
- **Brand mobile audit** vs `Complete_Brand_Mobile_Ui_dc.html` (69 screens): 123 server calls in 122 files matched to backend routes.
- **Explore mobile** built (EX-01/02/03/05) — mobile showed the desktop page before.
- Bugs: multi-invite never sent `message` (every invite 400); invite picker listed every brand's campaigns (now `?mine=true`); stock photo for creators without one; **TicketForm and TicketThread were stubs** (now real: POST /support/tickets, GET /support/tickets/:id/messages); payments fake labels ("1 of 2 left", "Verified Creator", …) removed, escrow buttons go to the right place; home Refer → mobile Refer; template budget; public-profile card → brand campaign detail; onboarding Save & exit no longer bounces to step 1 (brand mobile).
- Not built (no desktop/backend feature): AP-03 Pay & hire, AP-04 Fund all / Nudge, EX-04 Chat before accept, user reply inside a ticket.

### v237
- **Re-verified the session-31 "ban gaya" list — it was NOT in the code** (never reached a zip). Now done: Brand tab referral amount from admin settings; removed "They get ₹500 off", "both get", ₹ Pending; **GET /brands/:id privacy** (others get public fields only); team share link = brand id; **Hired tab** = escrow-funded deal threads (`src/lib/hiredCreators.js`, was always 0); KYC submitted → "Continue campaign draft" only when a draft exists.
- Creator desktop dashboard: banner + **Important for you** card (`src/lib/creatorTasks.js`, `components/dashboard/ImportantForYou.jsx`). ⚠ Also changed by mistake: creator desktop **header** and creator **mobile home** (see A1, A2 below).
- Invite popup redesigned (desktop card / mobile sheet), same accept/decline calls.
- UGC work deadline uses `internal_deadline` first (rule 50).

---

## SESSION 34 — WORK LIST (Ravi approved; build in this order A → B → C, full `npm run verify` + build after each part, one zip at the end)

### A. Undo what was changed by mistake
1. **Creator mobile home back to before v237** (`src/pages/creator/CreatorHomeMobile.jsx`): remove the "Important for you" card and its extra loads (dashboard/creator, creators/me, invitations, portfolio count) and its own invite modal; **put back section 4 "Complete Your Profile" card** exactly as in v236; invites stay in the old `MobileCreatorInvites` list (already mounted). Ravi: mobile must NOT get "Important for you".
2. **Creator desktop header back to before v237** (`src/components/dashboard/CreatorDashboard.jsx`): avatar, "{greeting}, {firstName}", "Ready to find your next collaboration today?", `TrustBadgeRotator`, `NotificationBell`, chat button with unread count. Remove the search box, escrow pill and new subline. (Take the old JSX from v236.) Keep banner + Important card.
   - Open point to ask Ravi: old header shows a random `pravatar.cc` stock photo when the creator has no photo — keep, or show initials?

### B. New / fixes
3. **Invite popup labels** (Ravi OK in writing, session 33: "invite popup ke liye ok hai"): "Decline" (left) and "Accept & open deal room" (right) in `CreatorReviewInvitationModal.jsx`. Update the locked test texts in `src/components/campaigns/directBrandInviteFlow.test.jsx` (decline/accept labels only — calls unchanged) and log it in `PROTECTED_CHANGES.md` with Ravi's words. Mobile = bottom sheet with full details (already built). Keep "Decline Campaign Invitation", "Back to Review", "Confirm Decline", "Reason for Declining" unless Ravi says otherwise.
4. **Creator desktop** banner + Important for you: keep as built in v237.
5. **Brand desktop "Important for you"** (`src/components/dashboard/BrandDashboard.jsx`, existing banner stays): same card as creator (`ImportantForYou.jsx`: one card, 4 s auto-scroll, pause on hover, arrows + dots). Real tasks only, in this order:
   1. UGC draft to review / live link to approve (GET ugc/orders/brand)
   2. Deal room — brand's turn: creator counter offer, agreement to sign, escrow to fund (chat/v2/threads flow_state)
   3. New applicants per campaign (`/brands/me/application-stats`)
   4. KYC to verify / under review (`/verifications/me`)
   5. Company profile incomplete
   6. Nothing pending → "Post a campaign" / "Explore creators"
   Remove the always-on tasks ("Pre-fund campaign escrow", "Need Custom Social Ads?"). **Desktop only** — brand mobile home unchanged (it has its own "Needs action").

### C. Onboarding (creator + brand, mobile + desktop) — gate stays as is
6. **Save every step to the server immediately** (answers + current step) — creator already POSTs `creators/profile` on each Next; add the step. **Brand: nothing is saved before Publish today** → new backend route (e.g. `POST /onboarding/progress` + `GET`), new Supabase column/table → give Ravi a **Supabase SQL prompt**. Not device storage.
7. **Resume exactly where they left** (DOB → DOB, Instagram details → Instagram details), on any device. Temporary popups (OTP, Instagram login, add-channel sheet) are not reopened — the page under them opens.
8. **Basic details first, "Saved ✓" shown at the top until then:**
   - Creator: name, email, mobile (from signup) + **Instagram handle** — it is already on step 1 next to the name (desktop requires it; **mobile allows it empty → make it required on mobile**). The Instagram details/connect step stays where it is.
   - Brand: company name, email, mobile (signup), designation.
   - Google sign-up may have no mobile → check; if missing, ask for it on the first step.
9. After the basic details: **"Finish later"** button (Ravi: name can be "Finish later" or "Save & exit") → sheet "Your progress is saved. Open the app any time to continue." + Log out. Replaces the current Save & exit on all onboarding screens.
10. Reminder emails: **NOT now** (Ravi: only save the details for now).

### D. Terms & Services (Ravi will write them soon)
11. Promotional emails go in the Terms; signup agree line to mention "updates and offers from Ybex"; every promotional email (when built) gets an unsubscribe link. Suggest Ravi has a legal person check.

---

## STILL PENDING (from earlier sessions)
- Deploy + Cloud Run variables: `SUPABASE_SERVICE_ROLE_KEY` (service_role / sb_secret_), `RESEND_API_KEY` + verified sender domain, `PAYMENTS_TEST_MODE=false` (⚠ makes payments real → Razorpay LIVE keys first). Then test signup with a new email; Ravi sends the exact red message if it fails.
- Supabase Prompts 1 & 2 (`docs/prompts/SESSION_31_SUPABASE_PROMPTS.md`); Prompt 3 last.
- Admin → Speed report: "Move banner pictures", "Check" → "Make small"; screenshot after "Measure again" → Cloud Run steps.
- UGC brief test: does a paid brief show in My Briefs + Payments?
- Chat-thread socket (locked `useChatThreadMobile.js` / `ChatBox.jsx`) still opens its own connection — needs Ravi's OK.
- Mobile UGC Live Timer card: keep (Ravi said keep mobile as before).
- **Ravi decided: leave as is** — brand home fake ticker ("Neha S…"), default banners (brand desktop Unsplash photos, mobile default banners).
- Note: the `MobileCreatorInvites` list on mobile home is protected by `mobileCreatorInvites.test.jsx` — fine, Ravi wants it.

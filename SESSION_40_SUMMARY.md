# Ybex — Session 40 Summary → START SESSION 41 FROM HERE

**Latest code:** `version-260.zip`.
Ravi writes Hindi/Hinglish → reply in Roman Hinglish; app text is English.
**State:** 1036 tests (1035 pass + 1 skipped on purpose), tsc, crash guard, vite build, protect check clean.
**Rules:** ARCHITECTURE 1–85 (83 audience estimate, 84 admin roles + KYC files, 85 phone shell) + PHASE 2 list.
**Working rule:** discuss first, build after Ravi says "banao"/"start". Locked files only with Ravi's written OK → PROTECTED_CHANGES.md.
**Landing page:** not touched.

## 1. RAVI — TO DO NOW
1. Deploy **v260**. `package-lock.json` is back (AI Studio's export had dropped it) → `npm ci` works again.
2. Supabase: run **`scripts/sql/session40.sql`** (lets the two score columns be empty = "Not enough data"). Also session39 / 38 / 36 if not done.
3. Phone test: Inbox search (tab bar hides while typing) · open a chat, type (message box sits on the keyboard, no half screen, no footer under it) · Campaign detail scroll to the end (nothing under the Apply bar; "views · applied" in the bar; quote pre-filled from your rate card; "N campaigns done" when the brand has any) · Live link: an Instagram profile / YouTube channel / Drive link is refused with a reason · Profile: KYC state, rate chips, Instagram "Verified by Ybex / Pending", portfolio paste-link, Device sessions · Notifications: Today / Yesterday / Older with dates.
4. Admin test: questionnaire label (Instagram, not "YouTube") · PAN preview (if still blank, click "Open" and send the screenshot) · make a test admin "Standard User" and reload → shows Standard, and they lose admin.

## 2. BUILT IN SESSION 40
**AI Studio's half-done work, checked:** campaign "views · applied" moved to the Apply bar — kept. Found `const panDocUrl = panDocUrl || …` (×4) in `UserEnforcementPanel.jsx` → would crash the admin user page → fixed + test that scans the whole code for this.
**Admin:** platform label from real handle/link (`backend/waitlistPlatform.ts`), filter handles "Instagram · YouTube" · KYC previews via `/api/media` + real PDF preview + honest "Preview not available" · roles (`backend/adminRoleChange.ts`): Standard really removes admin, Sub-Admin really works for a creator, failed save = error, sub-admin can't edit module permissions.
**Phone:** keyboard detection fixed for iPhone (page scroll no longer hides it) · tab bar hidden while typing · chat = fixed visible-screen box (wrapper in `InboxMobile.jsx`, locked ChatBoxMobile layout untouched) · `PremiumFooter` desktop only, inbox routes added to the no-footer list, inbox container `h-dvh` · white skirt under the campaign Apply bar.
**Locked, Ravi OK ("in pr bhi ok h kaam shuru kro"):** audience estimate (rule 83) in `creators_routes.ts` 🔒 + applicant approval + leaderboard (also removed score 95 / "4.8%" / "Mumbai" / stock photo) + 6 screens with "Estimate" pill (CreatorProfile, CreatorPublicView — no more 5.4% default, DealDetailDrawer, BrandDashboard, Leaderboard, MyProfile — no more 94 / "+15 points") · ChatBoxMobile fallback names → Creator / Brand / Collaboration, unknown partner not "online" · live-link check in mobile sheet, desktop chat (both inputs + on send), UGC order forms · CampaignDetail: `GET /brands/:id/track-record` (new, brands_routes.ts) → "N campaigns done" (desktop + mobile), quote pre-filled from the rate card (`src/utils/rateCardQuote.js`) with "From your rate card". `protect:update` run and logged.
**M40 profile:** hub — KYC Approved / Under review / Fix needed / Start, Creator info Done / Add details, Invite "N joined", "24/7 support" claim removed · rate-card chips ₹2K–₹50K (plain amounts, no "recommended") · Instagram "Verified by Ybex" (profile approved) / "Pending" · portfolio paste-link with platform detection, no views field; desktop placeholder "180k+ views" removed · sessions: "This device" + "Active N min ago" for others · Notifications: real calendar days, dates on older items. Inbox stage chip + unread count were already there.

## 3. PENDING (everything Ravi gave is built; these are left)
**a) Not matched line-by-line with the design (no design files in the zip — built from our own reading):**
- Profile sub-pages 1b–1m · UGC claim M01–M03 / U03 · Inbox / Notifications. → Ask Ravi to send the design files, then compare and fix gaps.

**b) Needs Ravi's phone test before calling it done:**
- Chat + keyboard (fixed visible-screen box via `--vvh/--vvtop`) — built and unit-tested, NOT tried on a real iPhone.
- PAN preview — now goes through `/api/media`; root cause not confirmed. If still blank: Ravi clicks "Open" and sends what opens.
- /apply form (M36) — waiting on Ravi's phone check since session 39.

**c) Seen, not touched:**
- Desktop `CampaignDetail.jsx` 🔒 demo defaults: location "Mumbai, Maharashtra", due date "2026-07-25", "goldencrust" demo terms.
- `Landing.jsx` shows a performance number (landing page not touched).
- Estimate benchmarks are rough Instagram norms — can become admin settings later.

## 4. OPEN — ask Ravi (no answer yet)
1. Remove the CampaignDetail demo defaults above? (locked file → needs OK)
2. Phone footer: removed on every page — keep it that way, or bring back on some page?
3. Roles: "Standard User" goes back to the role found from the account's profile (brand / agency / creator); no profile → refused. Ravi never answered "save the previous role when promoting?" — confirm this approach.
4. Older: brand markup +2% / agency +5% (session 38) · admin email alert on payout / KYC · Phase 2 list.

## 5. RAVI'S DECISIONS IN SESSION 40
- AI Studio's partial work: keep what is right, finish the rest, check it.
- Locked OK: live-link check, CampaignDetail track record + rate quote, ChatBoxMobile names, creators_routes fake %.
- Earlier decisions of session 39 stay (bottom bar, onboarding, referral, "Zero commission" line stays, DM Sans, design-only ❌ list).

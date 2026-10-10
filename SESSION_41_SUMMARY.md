# Ybex — Session 41 Summary → START SESSION 42 FROM HERE

**Latest code:** `version-261.zip` (built on v260 + the useful parts of AI Studio's `version-259 (2)`).
Ravi writes Hindi/Hinglish → reply in Roman Hinglish; app text is English.
**State:** 1053 tests (1052 pass + 1 skipped on purpose), tsc, crash guard, full build (client + server), protect check clean.
**Rules:** ARCHITECTURE 1–92 (91 no new DB for now · 92 push) (86 phone rules · 87 links/API must exist · 88 status words earned, no demo values · 89 Quick action + What's new · 90 PWA) + PHASE 2 list.
**Working rule:** discuss first, build after Ravi says "start". Locked files only with Ravi's written OK → PROTECTED_CHANGES.md.
**🗄️ DATABASE RULE (Ravi, session 41):** (database is fully up to date at the end of session 41 — see 1.2) right now ONLY app bugs and errors. **No new Supabase table / column / SQL.** Anything that needs the database goes in `PENDING_DB_CHANGES.md` (what / why / which code) — done together in one dedicated database session. ARCHITECTURE rule 91; also at the top of GEMINI.md and AGENTS.md.

## 1. RAVI — TO DO NOW
1. Deploy **v261** (`npm ci` — package-lock updated for `vite-plugin-pwa`).
2. ✅ **Supabase DONE (end of session 41)** — Ravi's other Claude (Supabase connected) ran all 13 schema files in order (`SUPABASE_PROMPT.md`), no errors: ybex_ephemeral, ugc_delivery_hours, ugc_deadlines_relist_refunds, session30_campaign_manage, user_consents, onboarding_progress, session35_schema_fixes, session36, session38, session38_part2, session39, session40, session41. Verified: 5 push / What's new tables exist with RLS on; score columns allow NULL; fee markup columns exist.
2b. **Push keys:** generated in session 41 and given to Ravi **in chat only** (not in any file). Ravi adds `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:support@ybex.in` to the server secrets, then redeploys. Never change them later (every phone would have to allow again). Without them push stays off, nothing breaks.
3. Play Store (only when you publish there): in `twa-manifest.json` put the real domain (now AI Studio's preview URL); `public/.well-known/assetlinks.json` fingerprint must be your signing key's.
4. Phone test (brand): KYC page shows your details + "Under review"; Company Profile has "KYC under review" (no "Finish KYC"); dashboard header shows your logo, real status (not "APPROVED"), only the bell; "Important for you" slides + swipes; Payouts title; KYC form pre-fills contact name + role from onboarding.
5. Phone test (both): Quick action popup (invite / application / "your turn" deals) — Accept opens chat, Decline asks why · chat counter: amount box + Cancel + "Send ₹X" all inside the card · campaign Apply sheet sits on the screen, no second Apply button · UGC brief: 2 boxes, ⓘ / 👁 icons, FREE on Express · brand onboarding: back-only OTP page, logo box in the middle, no "Saved", less gap, preview at the end · footer back on pages · animations smoother · Chrome "Install" banner (Android) / guide (iPhone).
6. Admin → What's new: write → Save draft → Publish → log in as creator/brand → popup once.
6b. Push: on Android Chrome (or iPhone with the app added to Home Screen) open the app → our "Allow" screen → allow → Admin → Push notifications → send a test to Creators/Brands → it arrives with the app closed; tap opens the page. Also do any deal step (message, invite…) → the other person's phone gets a push within ~20 s.
7. Desktop: chat flow for campaign / UGC / invite unchanged — please confirm once.

## 2. BUILT IN SESSION 41
**Push notifications (end of session, Ravi: "now start working"):** `backend/push_routes.ts` (subscribe, deal pushes from `notifications`, admin promo pushes, schedule, 2/day limit, dead phones removed), `public/push-sw.js` (show + tap to open), `src/lib/push.js`, `PushPermissionScreen.jsx` (sticker + chosen lines), Admin → Push notifications (`PushNotificationsManager.jsx`, preview + history). `web-push` package added.
**AI Studio zip check:** it was built on **v259** (no session-40 work). Kept v260 as base and ported: PWA (manifest, icons, service worker, install banner + hook, `.well-known`, TWA file, server routes), GoogleAnalytics boundary, ErrorBoundary. Fixed in their work: error hiding matched any text with "vite" (also "in*vite*") — not taken; service worker would answer `/api/media` (KYC PDF "Open") with the app page — denied now; two manifests → one; "offline access" claim removed; install prompt lost if fired before React mounted; banner never in chat; dismiss = 7 days.
**Bugs found + fixed:** 404 on UGC "Chat with Brand" (`/creator/inbox/:id` route missing) + 2 more dead links · brand KYC fields "Not provided" (documents stored as `[ {…} ]`) + silent `brand_kyc` save errors now logged · brand header "APPROVED" came from the account status / a default · brand dashboard called `GET /brands/profile` (doesn't exist) → logo never showed · apply sheet was `absolute` on a long page → floated mid-page with footer + Apply bar under it · brand onboarding preview skipped (Onboarding.jsx sent onboarded users to the dashboard at once) · literal `\u2014` / `\n` text on screen (3 files) · page slide made fixed bars jump; blur behind animated layers → jitter · chat counter box had no min width → Send pushed out of the card.
**Ravi's list (33 points):** 1 CampaignDetail demo values gone (city from profile — backend now prefers profile city; no due date / terms / pitch filler) · 2–4 UGC brief 2 boxes, icon buttons, FREE Express · 5 one agency list (`src/constants/agencyTypes.js`) · 6/9/12 KYC under review everywhere · 10 Important-for-you slide + swipe · 11 logo · 13 bell only · 14 Payouts · 15 rep name/role from onboarding · 16 footer back (`clearBottomBar` on campaign page) · 17 OTP back button · 18 preview · 19 line removed · 20 logo step · 21 spacing · 22 no Saved · 23 AI Studio check · 24 PWA · 25 What's new (admin + popup) · 26/27 Quick action · 28 "your turn" deal cards (sign / review / reupload / counter — inbox chip logic) · 29 smoother animations · 30 counter Send · 31 one apply button · 32 404 sweep + test · 33 API-route test (all calls match a route).
**Locked files (Ravi OK, logged):** campaigns_routes (city order), CampaignDetail, MobileOfferCard, MobileShortlistCards, BrandUGCMobile, ManageUGCOrdersView (`/collabs/new` → `/collabs`). No server call changed.

## 3. PENDING / NOT DONE
- **Point 33 (full audit):** done as automatic checks (every link → a page, every API call → a server route; both are tests now). A screen-by-screen visual audit of every mobile page against desktop was **not** done.
- Not tried on a real phone: everything in section 1.4/1.5 (built + unit-tested only).
- Quick action counter-offer card relies on the inbox chip marking it "your turn"; if a counter doesn't show there, send a screenshot.
- Still from session 40: design files for Profile 1b–1m, UGC M01–M03/U03, Inbox/Notifications; PAN preview root cause; /apply form (M36) phone check.

## 3a. FROM THE SUPABASE RUN — open
- **Aadhaar:** `creator_kyc` has no Aadhaar columns (purge query failed on `aadhaar_number`) → nothing stored there. Still to check (read-only): `select count(*) from verifications where documents::text ilike '%aadhaar%'` — 0 = done; >0 = Ravi decides.
- **15 briefs wrongly "Completed"** with open slots (old session-24 bug, already fixed in the app). Advice given: do NOT reopen now (open slots' money may already be refunded); test/demo ones ignore; reopen a real one only if its brand asks, after checking the money is still held. 6 real-looking: Summer Skincare Unboxing, ghumakad, Cosmic Eye Polarized Sunglasses, Tech Organizer & Cable Pouch, Unboxing & Fabric Quality Honest Review, Palmons Waterproof Jewelry.

## 3b. DATABASE SESSION LIST
See `PENDING_DB_CHANGES.md`: What's new tables (code ready), push notifications (`push_subscriptions`, only planned), older SQL files to check.

## 4. OPEN — ask Ravi
1. **Security check:** old admin routes (e.g. banners) allow `team_role === "admin"`. Confirm no brand team member gets `team_role: "admin"`; if they can, tighten those routes (new What's new routes already admin-only).
2. Express "FREE" — show it on desktop UGC brief too? (only phone now; desktop file is locked)
3. Agency list: kept the 7-item onboarding list (desktop used it); OK?
4. Older: brand markup +2% / agency +5% · admin email alert on payout / KYC · Phase 2 list.

## 5. RAVI'S DECISIONS IN SESSION 41
- Due date / terms missing → show nothing (not even "Not set").
- Footers: keep them all (phones too).
- Roles: "Standard User" goes back to the profile's role; no profile → refused. Confirmed.
- Locked files OK, but desktop chat flow for campaign / UGC / invite must stay as it is.
- What's new written from the admin panel (default chosen; Ravi didn't object) — its tables wait for the database session.
- **Now only app bugs / errors; no new Supabase tables until one dedicated database session** (everything planned is listed in PENDING_DB_CHANGES.md).
- Push notifications (final, don't ask again): deal pushes **and** Zomato-style promo pushes in Phase 1, written by the admin in any language; audience everyone / creators / brands / creators by niche (city = Phase 2); **no on/off setting** in the app; permission asked at the start with our own sticker screen (creator line 2, brand line 1). **Built in session 41 on Ravi's OK.**

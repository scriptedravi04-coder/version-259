# Ybex — Session 43 Summary (in progress)

**Latest:** `version-281.zip` (line started from the original v262, not the AI Studio copy).
**State:** 1197 tests (1196 pass + 1 skipped on purpose), tsc, crash guard, full build, protect check clean.
**Database rule (91):** no new table / column / SQL.

## What came from the AI Studio copy
Kept: Push screen — spinner on Send / Schedule, title / message / date checks with toasts, trimmed text,
in-app "Cancel Push" popup (Keep left, Cancel Push right), form clears + list refreshes. `.env.example` VAPID placeholders.

Not kept (on purpose):
- `push_routes.ts` isAdmin accepting `team_role` admin / owner / sub_admin — brand team members can hold
  team_role "admin", so they could have sent app-wide pushes. Back to `role === "admin" || is_admin`.
- VAPID keys written in code as a fallback (and in `.env`). Keys are env only. The AI Studio keypair is
  public now — never use it; generate a new one.
- Local `db_mock.json` fallbacks in `/admin/chart-data` and `fetchUserScopedTransactions` — production would
  show empty / wrong numbers instead of an error (same reason as Session 33).
- `package-lock.json` was missing from that zip — v263 has it.

## New in Session 43
- Push "Send now" asks first in an in-app popup ("Send now?" → Back / Send now), shows who gets it.
- `backend/session43PushGuard.test.ts` (3): push admin check has no team_role, no key in code, no browser confirm.

## App icon + splash (Claude Design "Ybex App Icon & Splash", turn 4)
- Icon 4a: purple tile (#9B00FF → #7E00DC → #6200B4 → #2E0066) with the white "Ybex." wordmark.
  `public/pwa-192x192.png`, `pwa-512x512.png` (rounded), `pwa-maskable-512x512.png` (full bleed, mark in the
  safe circle), `apple-touch-icon.png` (180, square — iPhone rounds it), `favicon.ico`, `icon.svg`.
  Made by `scripts/brand/generate_brand_assets.py` (cairosvg + Pillow) from the design's own vector wordmark.
- iPhone / iPad launch images: `public/splash/launch-WxH.png` (20 sizes, portrait), linked in `index.html`.
  They are the plain purple screen = first frame of the animation, so nothing jumps.
- Launch animation (installed app only, phones, once per app session): plain HTML/CSS in `index.html`
  (#yb-splash) so it plays while the app downloads — dot pops, rolls like a tyre with smoke, "Ybex" appears in
  its trail, shine, tagline "Where brands meet creators" (~2.1 s). Then `AppLaunchSplash.jsx` (after the login
  check) shrinks the purple into the home hero banner (`data-splash-target="hero"` on creator + brand mobile
  home) and fades to the real banner. No banner (welcome page / push deep link) → simple fade.
  Reduced motion → no movement. Safety: always gone by 10.5 s. Browser tabs + desktop: never shown
  (the old light ColdStartSplash stays for them).
- `StatusBarSync` re-reads the top colour when the splash leaves. Android launch colour `#7E00DC`
  (manifest + twa-manifest).
- Tests: `src/components/layout/launchSplash.test.js` (5).

## v265 — Ravi's phone test, part 1
- **OTP already filled in (app + website) — security hole, fixed.** The code was sent back to the browser
  whenever PAYMENT test mode was on, and payment test mode is on for every run.app deploy. So the live
  server gave out every signup / login / contract-signing code: anyone could log into any account with
  "Continue with OTP". New `backend/otpEcho.ts`: the code goes to the browser (or logs) only when
  `NODE_ENV` is not production (`npm start` sets production). Rule 9 updated. Payment test mode unchanged.
- **"One sec…" for 1–1.5 min after Allow:** saving the device waited for the service worker, which first
  downloads the whole app for offline use. Now the screen closes as soon as the phone's popup is answered;
  the save runs in the background and is retried on the next open. iPhone launch images are no longer in
  the offline download. Android phones that already gave permission (Play app asks at install) never
  see this screen — that is expected.
- "Missed Notifications" waits while the Allow screen is open.
- Creator home: heading "Best matches for your profile"; the list is now swipeable boxes (like brand
  templates), no auto-slide.
- Status bar: follows the top of the screen while scrolling (pinned header colour, else the page
  background — not the cards passing under it). Swiggy screenshot not received yet.
- Tests: `backend/session43Otp.test.ts` (3), `src/session43Fixes.test.js` (5); updated session20 / session33 /
  campaignRoutesAndOtp tests for the new OTP rule.

## v266 — batch 1 + 2 of Ravi's big list
- Security: brand team "admin"/"owner" never counts as Ybex staff (auth, server, notifications, support,
  market intelligence, speed report, home picks, push, App.jsx, AdminLogin). Brand team can't be given "admin".
- App login: unverified accounts are accounts (OTP login verifies the email). Admin email on the
  Creator / Brand card → "This is a Ybex admin account"; server refuses app logins into admin accounts.
- "You're signing in / up as a Creator" line instead of the sparkle chip; sparkle icons removed for users.
- Desktop-experience popup deleted. Onboarding: a progress-save hiccup no longer blocks the next screen.
- Admin: Search Intelligence removed. App Version Updates removed; What's new is in Platform Settings.
- Pages open at the top also when ?section= / subscreen / tab / view changes.
- Status bar (option a): always #6200B4, white clock (iPhone black-translucent + #yb-statusbar strip,
  #root below it); Android theme-color + manifests. Users must re-add the iPhone app.
- Quick actions: creator Refer & Earn · Share profile · My orders · Earnings; brand "New campaign".
- Best matches: % only when 2+ parts compared.

## v267 — batch 3
- Explore: creators created from 10 Oct 2026 show only after waitlist approval (`backend/exploreGate.ts`,
  applied in server.ts on GET /api/creators/explore because creators_routes.ts is locked). Older ones stay.
- OTP code first in every code email subject (login, signup verify, resend, password reset, contract sign).
- Creator payout card: "You receive in your bank ₹net" + "Deal ₹X − Ybex fee ₹Y" from the recorded
  transaction; brand side unchanged.
- Admin on phone: 5th tab "More" (all sections + Log out). Desktop Explore uses the full width.
- Android WebView wrappers treated as in-app browsers (install guide says open in Chrome).
- iOS adds "from Ybex" under web-push titles itself — not in our payload, can't be removed.

## v268 — batch 4
- Mobile Explore: place search ("Jaipur creators", "Faridabad") — that city first, else creators within
  50 km (then 100 km), "18 km from Faridabad" on each card, a note on top (`src/lib/indiaCities.js`, fixed
  list, no DB). Cards = desktop details: name, followers, primary niche only, city, avg reach; no Verified, no rate.
- Rating sheet: partner's real logo, gold rounded stars with bigger tap area.
- Live links: real Instagram / YouTube / Facebook / LinkedIn / X mark from the link; fake sample link removed.
- Draft videos: the phone's own full-screen player is blocked so the Ybex watermark always shows.
- Creator info: profile photo / cover saved right after upload (Save not needed); cover field name fixed;
  design notes that leaked onto the screen removed.

## v269 — status bar, Ravi's correction (replaces v266 option a)
- Not one fixed purple strip. iPhone back to `default` (dark clock); the bar takes each page's top colour
  (StatusBarSync: route change + scroll). A header can name its colour with `data-statusbar`.
- Creator + brand dashboard header: darker lavender at the top (#D6C3FF) fading to light, and the same
  colour continues up behind the clock (Zepto / Hopr style). Other pages: their own colour (white etc.).
- Purple strip, #root padding and full-height overrides removed. Manifest theme colour #DCCBFF.
  iPhone: remove + re-add the app (the bar style is read only when it's added).

## v270 — batch 5
- Chat: my offer is the latest → footer "Waiting for response" (like desktop); theirs → "Respond to offer"
  opens a bottom sheet (Accept ₹X / Negotiate → counter price) — `MobileRespondOfferSheet.jsx`. No full page.
- Android keyboard shake: keyboardAware.js scrolled the field into view on every viewport scroll (a loop).
  Now once per focus, updates batched per frame, CSS vars written only on change.
- Push to Android: phones subscribed under an old server key re-subscribe automatically; pushes sent with
  urgency "high"; 403 (old key) subscriptions removed.
- Desktop Explore: same place search as mobile, "18 km from Faridabad" on the card.

## v271 — Ravi's phone list (33 points)
- Security: home-banner routes (`admin_content_routes.ts`) and `/admin/notifications/send` no longer accept a
  brand-team `team_role "admin"` — staff only (`isAdminStaff` / role admin). Debug log removed.
- Payout receipt (creator, mobile): until the UTR is posted everything is yellow "Transfer pending" + "reaches your
  bank in 1–2 working days"; UTR box says it will show once the money arrives; Copy disabled; Destination / IFSC /
  Channel / date only after the UTR. Hardcoded HDFC0001234 and the fake date are gone (real `bank_ifsc`, UPI → no
  IFSC). "Convenience fee & TDS" (also on the transfer receipt, which now says "Net payout to creator").
- Quick action sheet: green gradient dark → light; big amount; details list (campaign, deliverables, timeline,
  invited on), description and message; brand side shows quote / followers / niche.
- Explore UGC: real brand logos (`components/common/BrandLogo.jsx`, falls back to the letter); black NEW removed;
  small shining NEW on the delivery chip. Same logos on every Manage-orders card and brief details.
- UGC deadline: the green dot is now a small clock with turning hands (card + order page).
- Status bar: toasts never colour it (the green bar in chat); see-through popup backdrops are blended, not
  read as near-black; re-checked every 0.7 s so pages that load late (Manage orders) get their real colour.
- Chat (UGC + campaign): "Draft approved" box has its own Submit live link button (creator). "Agreement executed"
  is a centred line ("Both parties have now signed the ₹X agreement…"), no box. Creator declining live-link
  changes is a card: brand gets Contact support / Re-request changes / Approve last live link, creator a turning
  "Waiting for the brand to respond…".
- UGC order page ↔ chat: reads the server's own resolved stage (COMPLETED_APPROVAL, LIVE_LINK_SUBMITTED, …). After
  the draft is approved it shows "Submit live link" (opens the chat sheet) instead of the video upload; quiet
  refresh every 30 s / on deal events with the same GET calls. No new server call (locked flow).
- Support tickets: real top bar (back, title, New); empty page shows help topics and one-tap ticket reasons.
- Android keyboard shake (contract OTP sheet): `interactive-widget=resizes-content` in index.html so Android shrinks
  the page itself; keyboardAware sets --kb 0 then and ignores < 24 px changes (the lift ↔ scroll loop is gone).
- Push: promo daily limit removed (Ravi approved in writing; `push.test.ts` updated to the new rule). Send now tells
  the admin audience / devices / why 0 phones; the list marks 0-phone pushes.
- Permission screen: new copy both roles + three "what you get" rows, button "Turn on notifications". Shown to every
  signed-in creator / brand outside onboarding (brands who chose "finish later" were never asked → 0 brand phones).
- Notifications page (mobile): "Allow notifications" button only when not allowed → opens the same screen; if the
  phone blocked it, the screen explains Settings; iPhone Safari tab → "Add to Home Screen" help.
- Tests: `src/session43V271.test.js` (9).

## v272 — Ravi's list 34–58
- iPhone "from Ybex" under push titles: added by iOS to every web-app push; only a native App Store app removes it.
- Creator code: removed from the agreement (mobile sheet + desktop). New `components/referral/CreatorCodeDealCard.jsx`
  in the chat, creator only, after both signed and before the brand pays (fee is fixed at payment). Look from Ravi's
  Refer & Earn reference. Applied code → "you save ₹X". The "0 deals / ₹0" referral block is gone from this flow.
- Phone number in pieces ("Reach me at 931" / "509" / "9117"): `contactSecurityFilter.ts` buffers the number at the
  END of a sentence too, more contact words; new `splitNumberAcrossMessages` (whole pieces, prices excluded) used by
  mobile + desktop chat against the chat's own history (works across server instances). Server keeps its check.
- Admin payout (mobile): same "paid" rule as the server (`isPaidOut`), so paid payouts leave "Ready to release";
  an ALREADY_PAID answer moves the row out. Real UPI QR (`qrcode.react`) only from the registered UPI ID + exact net
  amount; no valid UPI ID → no QR. UPI app buttons use the same link.
- "Waiting signature" after signing: mobile shows "You've signed this agreement" (no sign + OTP sheet); desktop a toast.
- Earnings deal sheet: brand logo + name (it showed the creator), real dates only, "Add a payout account" when none.
- Share previews: `public/og-image.jpg` (1200×630, `scripts/brand/generate_share_image.py`) + og/twitter tags.
  JPG on purpose: not in the offline download list.
- Shared links (invite, referral, profile, campaign, install) use `src/lib/publicUrl.js` → VITE_PUBLIC_SITE_URL,
  default https://ybex.in — never the test address.
- Brand Explore (mobile): profile circle removed; only the first niche; long city truncates, no clash with reach.
- Notifications: every row opens a page (`resolveNotificationTarget`); "Notification" titles get real ones.
- Chat reopening by itself (Ravi's two videos): back from a chat opened at /chat/<id> now goes to the plain inbox
  address; refresh / 30 s poll no longer reopen it.
- Long unbroken text wraps inside chat cards (creator's note).
- Handshake cards: the picture from Ravi's "Handshake Cards" file (`public/img/handshake.webp`), design's layout.
- Chat ☰ menu: the tap-outside layer could stay after closing and eat every tap ("freeze"). Menu now in <body>,
  layer exists only while open, closes on back. "**Section 10A**" shows bold. "Contact Details" → "Partner details",
  no Instagram handle.
- Tests: `src/session43V272.test.js` (9).

## v274 — Ravi's list 59–79
- Policies (Terms / Refund / Privacy) on phones: plain reading page with back + title; no landing layout, no bar.
- Bottom bar: brands now also only on main pages (`isBrandNavPage`): Dashboard, Explore list, Manage lists, Inbox,
  Brand. Not on creator profiles (Invite bar clash), wizards, order details, policies. Brand "Good morning" strip gone.
- Brand Campaigns page redesigned: header + summary + "New" (floating + removed — it covered "Review"), padding,
  clearer cards (Edit / Launch on drafts, "Under review · usually 2–3 hours").
- Chat: "payment funded" card shown once (mobile + desktop); creator photo field in the header.
- Brand pay sheet is a "Review & pay" step (campaign, creator, total, protections) before Razorpay.
  Brand coupon codes need a DB change → PENDING_DB_CHANGES.md.
- Draft video: phone fullscreen blocked for drafts (watermark always on); creator notes only when typed (no file
  name / system text); "Request changes" opens "What should change?" directly; live-link tips for link changes.
- Invoice fits Android screens and scrolls.
- Campaign create: real brand logo; `CreatorMatchStrip` = real matching creators (count + photos from Explore list,
  no made-up 142); published screen shows "In review (2–3 h)" or "Live", no fake "creators reached".
- UGC brief preview: the creator's Explore card + "You pay now" summary (no black mock).
- Brand UGC order: the uploaded draft plays inline with the watermark (was "Open Cloud Link").
- index.html: quiet stand-in for the dev-only "vite-hmr" socket (AI Studio fix); other sockets untouched.
- Not done: applicant faces on creator campaign cards — needs `campaigns_routes.ts` (locked) to send photos, and
  showing other applicants to a creator is a privacy question. Ravi to decide.
- Tests: `src/session43V274.test.js` (9).

## v281 — live address is now https://version80.ai.studio (Ravi)
- `twa-manifest.json` host → version80.ai.studio, appVersionCode 2 / 1.0.1 (Play needs a higher code).
- `src/lib/publicUrl.js` default + og / twitter URLs in index.html → version80.ai.studio.
- Still to do for the Play app: rebuild the AAB with Bubblewrap, check
  https://version80.ai.studio/.well-known/assetlinks.json opens, and make sure its SHA-256 includes the
  Play App Signing key (Play Console → App integrity). Wrong / missing key = the app shows a browser bar.

## v280 — Ravi: "same old login, same old splash, no demo"
- **Real bug in v279:** the new hero was put on the website's "/" only. The installed app starts at `/app`
  (manifest start_url) and "/" itself redirects the app to `/app` → `AppWelcome` (old "Brand deals, done
  properly" + "Escrow-protected payments"). So the phone could never show it. Now `AppWelcome` renders
  `LandingMobileHero inApp` (all widths; Creator / Brand / Log in → `/app/continue/:role`, the app's own
  email screen, which already sorts out "this email is the other role"). Loading state is purple (#7E00DC).
- **Demo access:** v277 tied the buttons to `import.meta.env.DEV`, so they were gone from every deployed
  build, even a test server. Now `GET /api/auth/demo-enabled` → `{enabled}` from the server's DEMO_LOGIN, and
  `useDemoLogin()` shows the buttons (Login page + a small "Demo access (test server)" link on the app
  welcome → /login?demo=1) only when it is on. Public server stays DEMO_LOGIN=false → nothing shows.
- **Android Play app looked old because of the TWA, not the code:** `twa-manifest.json` host is still the
  old run.app preview, and reinstalling from Play gives the same old APK. Needs host change + new AAB.
- Tests: `src/pages/app/appWelcomeHero.test.jsx` (4); `session43Batch2` demo test updated.

## v279 — mobile landing redesign + splash fixes (Batch 2, Ravi)
- **New mobile entry screen** (`src/components/landing/LandingMobileHero.jsx`) from Ravi's design: purple
  hero with "Ybex." + Log in, headline "Hire creators. Pay only on delivery.", a live "Diwali Glow
  Campaign" card (creator rows + statuses), a ₹45,000 "Held safely till approval" chip, and two role
  cards (I'm a Creator / I'm a Brand) + a "Secure payment hold · Legal contracts" trust line. One
  orchestrated load animation (reduced-motion safe). Shown on mobile only; the desktop Landing hero is
  unchanged (`hidden md:block`). Fixes from review: wording is "Secure payment hold" (never "escrow"),
  both role cards are lavender (no blue), the chip is brighter, and the hero sets the status bar purple.
- **Splash:** installed-app first paint is now purple (`@media (display-mode: standalone)` in index.html)
  so there is no blank flash before the launch animation on iPhone and no colour jump on Android. TWA
  `splashScreenFadeOutDuration` lowered to 200; native splash background stays purple (#7E00DC) so it
  blends into the web animation.
  - **Still needs a real phone + a TWA rebuild (can't verify here):** the Android 12+ system splash
    shows the app icon briefly — it can't be removed, only matched (purple bg + the Ybex icon). The
    purple bottom-nav-bar some phones show during the splash is TWA/nav-bar behaviour; verify after the
    rebuild. Also `twa-manifest.json` `host` is still the old preview URL — it must be changed to the
    final domain before building the AAB (then re-add the Play signing SHA-256 to assetlinks.json).
- Tests: `src/components/landing/landingMobileHero.test.jsx` (7).

### Database — one change queued (see SUPABASE_PROMPT.md)
`users.deletion_requested_at` + `users.deletion_reason` (nullable) to enable the 30-day purge +
countdown + self-serve recovery for Delete account. A ready, safe, idempotent prompt is in
`SUPABASE_PROMPT.md` (outputs). Deletion already works today via `is_deleted`.

## v278 — Account section + Delete account (Batch 1, Ravi)
- **New `backend/account_routes.ts`** (registered in server.ts): `GET /account/overview` (email + phone),
  `POST /account/phone` (instant, no OTP, 10-digit check), `POST /account/email/send-otp` +
  `/account/email/verify` (change email, OTP to the NEW address), `GET /account/delete/preflight`
  (blocks when a deal is live or money is on hold, via the existing `activeMoney` helper),
  `POST /account/delete/send-otp` + `/account/delete/confirm` (OTP → soft-delete `is_deleted`, end
  sessions). Payment / invoice records (`transactions`) are never touched. Confirm best-effort stamps
  `deletion_requested_at` for the future purge job.
- **`AccountPanel`** (`src/components/account/AccountPanel.jsx`): Settings → Account — Login details
  (email change via OTP, phone change instant), Devices & sessions + Privacy & terms rows, and the
  Delete account flow (what's removed / kept, 30-day recovery note, active-money block, OTP, red
  confirm). Creator and brand mobile profiles now show a single **Account** row (replacing the separate
  Device sessions / Privacy & terms rows) that opens it.
- **Public `/delete-account` page** (`src/pages/legal/DeleteAccount.jsx`) for the Play Console
  "Data deletion" link: explains how to delete, what's removed / kept; logged-in users can delete there.
- **Privacy policy** now describes self-serve deletion (Settings → Account → Delete account /
  ybexmedia.in/delete-account), the 30-day recovery window, and retention of payment records.
- **PENDING_DB_CHANGES.md:** to enable 30-day auto-purge + precise countdown + self-serve recovery, add
  `users.deletion_requested_at timestamptz` + `users.deletion_reason text` and a daily purge job. The
  flow works today via `is_deleted` (hidden + login blocked, like the admin bin; recovery via support).
- Tests: `src/session43Batch3.test.js` (10), `src/components/account/accountPanel.test.jsx` (5).

### Still queued — Batch 2 (login + splash)
Login screen redesign (from the screenshot; wording "Escrow-protected payments" → "secure payment hold",
Brand card lavender not blue, brighter ₹45,000 chip) and the splash fix (Android app-icon splash +
purple bottom bar; iOS ~0.12s blank) with twa-manifest + matching launch images — needs a real phone to
verify. Plus more in-app page transitions, VAPID keys, Play steps, domain + Play account decisions.

## v277 — profile clean-up, onboarding slide, demo off, hidden admin entry (Ravi)
- **Profile page (mobile, creator + brand) made clean & simple, Switch-style.** Removed the Profile
  strength card, every grey sub-line under a row title, and every trailing value / badge
  (Add details, 0 connected, ₹1,680, 0 items, N joined, N active, KYC badge). Rows are now just a big
  title + icon + chevron. Titles bumped to 15px. Creator's unused profile-strength calc removed.
- **Onboarding steps slide + fade in** instead of jumping (creator + brand mobile). New `.yb-step-in`
  keyframe in index.css (opacity + transform only, reduced-motion safe); the step wrapper is keyed by
  `screen` so it replays each step.
- **Demo / bypass logins OFF for the public app.** Root `server.ts` default is now `DEMO_LOGIN=false`
  (was true) — set `DEMO_LOGIN=true` only on a test server. The "Direct Demo Access" buttons on the
  login screen now render only in local dev (`import.meta.env.DEV`), never in the built app.
- **Hidden quick-admin entry at `/admin/ybx`** (not linked anywhere): tap the Ybex mark 6 times → a PIN
  box. The PIN rides inside the admin token (`dev_bypass_admin|<pin>`) and is checked on the server in
  constant time against env `ADMIN_QUICK_PIN` (unset or <6 chars = door stays shut). This is independent
  of DEMO_LOGIN, so it works in production with demo off. Normal admin login is unchanged.
  → To use: set `ADMIN_QUICK_PIN=<a strong 6+ char pin>` in the live server env.
- Tests: `src/session43Batch2.test.js` (10), `src/pages/admin/adminQuickEntry.test.jsx` (4).

### Still queued for Play launch (discussed, not yet built)
- **Splash fix (needs device testing):** Android TWA shows the app-icon splash (Ravi's "bekar logo",
  screenshot) + a purple bottom nav bar on some phones; iOS shows a ~0.12s blank purple before the
  animation. Plan: match the native TWA splash to the web animation's first frame (purple bg + Ybex
  mark), set `navigationBarColor` so the bottom bar isn't purple, drop `splashScreenFadeOutDuration`,
  and show the web splash's frame-0 via `@media (display-mode: standalone)` so there's no gap. Twa-manifest
  edits + matching launch-image assets; must be tested on a real phone.
- **Login screen redesign** from Ravi's design (build from the screenshot; the uploaded HTML is a 1MB
  AI-Studio bundle, not reusable). Also fix "Escrow-protected payments" → "secure payment hold" wording,
  make the Brand card lavender (not blue), brighten the ₹45,000 chip.
- **More in-app page/tab transitions** (carefully, so smoothness holds).
- **Account section + Delete account** (launch blocker): Settings → Account with login details
  (phone change instant, email change via OTP), devices & sessions, privacy & terms, and Delete account
  (OTP confirm, 30-day grace, blocked while a deal is live or money is on hold; keep payment/invoice
  records). Plus a `/delete-account` web page for the Play Console link. Privacy policy has NO deletion /
  retention wording yet and there is no `/delete-account` route — both to be added here. May need a DB
  column for the delete-request date → will go in PENDING_DB_CHANGES.md first.
- **VAPID keys** (push), Play Console steps, domain + Play account decisions.

## v276 — scroll lag / stuck / reversed (Ravi)
Ravi: scrolling down suddenly lags, then sticks; the whole page moves instead of the content; sometimes
down scrolls up and up scrolls down. Three causes, all fixed:
- **Two scrollers.** The app shell was 100vh, taller than the visible phone screen, so the document scrolled
  too (header + bottom bar moved, the browser bar hid / showed and resized the page mid-swipe). Shell is now
  `.app-shell` = 100dvh; while it is on screen html/body don't scroll; `#app-scroll-container` has
  `overscroll-behavior-y: contain`. Phones without dvh keep the old h-screen (fallback in `@supports`).
- **Pull-to-refresh (Home pages, campaigns list) fought the page scroll.** React's touchmove is passive, so its
  preventDefault never worked; touch-action became "none" for the whole refresh (page frozen); touch +
  pointer handlers both ran. Now native non-passive touch listeners, touch-action always pan-y, starts only
  at scrollTop 0 after 8 px clearly downward, pointer = mouse only. Same look and refresh calls.
- **StatusBarSync** read the colour under the clock on every scroll frame (forces a re-measure) → at most
  every 150 ms + once when the scroll stops.
- Tests: `src/session43Scroll.test.jsx` (6).

## v275 — Earnings page, Ravi's design (Earnings_dc.html)
- Mobile Earnings (`CreatorEarningsMobile.jsx`) in the new look: white header "Earnings" + KYC line + settings
  button (opens the payout account sheet); purple card "Total paid to your bank" + "₹X in the last 28 days" and two
  tiles "In secure hold" / "Ready to disburse"; "Payouts go to" card with Change (or "Add a payout account");
  "Have a creator code?" card; "Deal payments" with All · In hold · Ready and one list (brand logo, deal · date,
  amount, In hold / Ready / Requested / Paid). Empty list → 3 steps + "Find deals" (/campaigns).
- Same numbers and calls as before. Design sample text left out: "Next payout in 2 days" (no such data — tile says
  "Tap a Ready deal to get paid" / "After the brand approves"), "HDFC Bank" (we only have the last 4 digits / UPI ID),
  "Released automatically" (finance sends it → "Ybex sends it to your bank / UPI"), the code "Remove" button (the
  server has no remove call).
- Taps: In hold → deal steps sheet, Ready → the per-deal payout request sheet, Paid → receipt (all unchanged).
- Fixes: a deal already in the payout queue was listed twice (in hold + ready) — now once, as Ready; hold tile =
  unpaid − ready. The old "In secure payment hold" filter never worked (left over from the escrow rename).
  A queued deal with no server net amount shows no amount (was ₹0).
- New `components/payments/CreatorCodeCard.jsx` (same GET/POST `creator/coupon` as before). Desktop Earnings and
  the desktop promo box are unchanged.
- Tests: `src/components/payments/earningsRedesign.test.jsx` (5).

## v273 — live address
- Ravi: the live app is **https://version270.ai.studio** (not ybex.in). Shared links use the address the app is
  open on (VITE_PUBLIC_SITE_URL overrides it for an own domain later); og/twitter preview URLs point to
  version270.ai.studio. When the domain changes: set VITE_PUBLIC_SITE_URL + change the URLs in index.html.

## Ravi — check after deploy (v276)
1. iPhone app + Android Chrome: scroll long pages (Home, Explore, Earnings) fast up and down — no lag, no
   sticking, header and bottom bar stay put, direction never flips.
2. Home: pull down at the very top → refresh still works; a normal scroll never starts it.
3. Typing in a search field / chat still works (keyboard).

## Ravi — check after deploy (v272/v273)
1. Share an invite on WhatsApp → preview shows the purple Ybex picture.
2. Chat: "Reach me at 931" → "509" → "9117" — the third is blocked.
3. Admin payout on phone: paid ones under Transferred; QR scans to the creator's UPI ID with the right amount.
4. Chat ☰ opens on the first tap, every time.

## Ravi — test on the phone (v271)
1. iPhone: delete the Ybex app from the home screen and add it again (old installs keep the white-clock bar).
2. Android: open the contract OTP sheet and type — no shaking. Also check other sheets with typing.
3. Brands: log in on a phone → permission screen should now appear.
4. Admin → Push → Send now: the toast says how many phones and why 0.

## Still open
E11 inbox tap, E12 invite quick-action popup, D (waitlist gate, location search, mobile cards), R (Explore
grid), H (Earnings — mobile redesign done in v275; desktop not changed), Q (admin mobile), B5, F (keyboard jitter), I (Samsung hint), L (no footer in chat).

## Ravi — to do
1. New VAPID keys on your own computer: `npx web-push generate-vapid-keys`. Put VAPID_PUBLIC_KEY,
   VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:support@ybex.in in the server env (not in chat, not in code).
2. Deploy v263 (`npm ci`). Admin → Push: banner gone, Send now → popup → Send now.
3. Phone test — new icon + launch: **delete the old Ybex app from the home screen and add it again**
   (iPhone saves the icon and launch image only when you add it). Open → purple → dot rolls → "Ybex." →
   shine → shrinks into the home banner. Android Play app (TWA): icon changes only with a new APK build.
4. Still pending from Session 42: phone tests (section 1), Claude Design icons / splash.

## Security note (Session 41 → closed in v266 / v271)
Brand team members can no longer be given team_role "admin" (v266), and every admin check that accepted it has been
changed (v266 + the banner / admin-notification routes in v271).

# Ybex — Session 42 Summary → START SESSION 43 FROM HERE

**Latest code:** `version-262.zip` (built on v261).
Ravi writes Hindi/Hinglish → reply in Roman Hinglish; app text is English.
**State:** 1078 tests (1077 pass + 1 skipped on purpose), tsc, crash guard, full build, protect check clean.
**Rules:** ARCHITECTURE 1–94 (93 saved answers · 94 installed app = /app) + PHASE 2 list.
**Working rule:** discuss first, build after Ravi says "start". Locked files only with Ravi's written OK.
**Database rule (91) still on:** no new table / column / SQL. Session 42 added none (login codes use the existing `ybex_ephemeral`).

## 1. RAVI — TO DO NOW
1. Deploy **v262** (`npm ci`). No new env vars, no SQL.
2. Phone test — speed: open the app, go Home → Inbox → Home → Campaigns. Second time Home / Inbox open at once (no skeleton). Close + reopen the app: Home shows the last data straight away, then updates.
3. Phone test — status bar: the strip behind the clock should be the same colour as the page header on Home, Inbox, Campaigns, Profile (iPhone app + Android).
4. Phone test — installed app, logged out: opens the welcome (2 cards), not the website. Creator → email:
   - your existing email → "Welcome back" → **Continue with OTP** → code in email → dashboard. "Use password instead" link under it.
   - a brand email on the Creator card → "This email is a Brand / Agency account" → Continue as Brand.
   - a new email → name + mobile + tick → Continue with OTP → code → onboarding.
   Already-installed iPhones keep the old start page "/" — that now redirects to /app too.
5. Phone test — install: iPhone **Chrome** → Install banner / landing "Install the app" → Chrome steps (Share icon in the address bar → Add to Home Screen). Instagram / WhatsApp in-app browser → "open in Safari / Chrome" + Copy link. Desktop landing → QR card above the footer.
6. "Missed Notifications" no longer pops over the loading screen (waits 3 s). The old "Enable Notifications" card is gone (only the sticker "Allow" screen asks now).
7. Design: give Claude Design the 2 prompts from this session (icon set, then splash using the chosen icon). Send the PNGs → session 43 puts them in (icons, iPhone splash images per size, matching in-app loader).

## 2. BUILT IN SESSION 42
**Speed:** first file 1,720 KB → 955 KB (gzip 497 → 283 KB): desktop dashboards + charts library + tour are separate files (`Dashboard.jsx`). `src/lib/apiSnapshot.js` keeps last answers (memory for all GETs; phone storage for home / inbox / bell reads, tied to the login token, wiped on logout). Creator home, brand home, mobile inbox paint saved data first, then refresh. Logged-in phone starts downloading its home file before the login check returns (`index.jsx`); bottom-tab pages download 2.5 s after login (`TabWarmup` in App.jsx). Brand home fallback name "Team Nexus" (demo) → "Your brand".
**Installed app:** `public/manifest.json` start_url `/app` (+ `twa-manifest.json`), launch colours lavender. `src/pages/app/AppWelcome.jsx`, `AppContinue.jsx`. `/` and `/login` inside the installed app → `/app`.
**Server:** `POST /auth/check-email` (exists / role / has_password; verified accounts only; 30 per IP per 10 min), `POST /auth/login-otp` (mails a 6-digit code; 3 per 15 min), `POST /auth/login` now also takes `{ email, otp }` (code checked after the deleted / banned / suspended checks). `backend/loginOtp.ts`. Maintenance mode lets check-email through like login.
**Status bar:** `StatusBarSync.jsx` reads the colour at the top of each page and sets the page root colour (iPhone) + theme-color (Android).
**Install:** `src/lib/installGuide.js` (browser-aware steps), `components/install/InstallGuideSheet.jsx`, `InstallAppButton.jsx` (hero button on phones, sticky bar after scroll, desktop QR). Top banner hidden on the landing page (it has its own).
**Tests added:** `src/lib/apiSnapshot.test.js` (7), `src/pages/app/appLogin.test.jsx` (10), `backend/session42LoginOtp.test.ts` (8).

## 3. PENDING / NOT DONE
- Splash + app icon: waiting for Claude Design. Then: icons in `public/`, `apple-touch-startup-image` per iPhone size, `ColdStartSplash` matched to the splash.
- Google sign-in is not on the app login screens on purpose (popup sign-in is unreliable inside an installed iPhone app). Google-only accounts log in with the email code.
- Not tried on a real phone yet: everything in section 1.
- Landing still has old marketing numbers ("140,000+ creators", "140K+ Target") — rule 88 says no demo values; Ravi to decide the real text.
- From session 41: screen-by-screen mobile vs desktop visual audit; design files Profile 1b–1m, UGC M01–M03/U03; PAN preview; /apply phone check; security question on `team_role: "admin"`.

## 4. RAVI'S DECISIONS IN SESSION 42
- App login: "Continue with OTP" is the main button; password is a small link under it (also for new accounts: "Set a password instead").
- Only 2 cards: Creator, Brand / Agency.
- App screens follow the app's own light theme (lavender + purple), not a dark hero.

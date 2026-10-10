# Ybex — Session 39 Summary → START SESSION 40 FROM HERE

**Latest code:** `version-259.zip` (everything up to v259).
Ravi writes Hindi/Hinglish → reply in Roman Hinglish; app text is English.
**State:** 1015 tests (1014 pass + 1 skipped on purpose), tsc, crash guard, vite build, protect check clean.
**Rules:** ARCHITECTURE 1–82 (80 = creator mobile shell, 81 = hooks before early returns, 82 = home picks + referral share) + PHASE 2 list.
**Working rule:** discuss first, build after Ravi says "banao"/"start". Locked files only with Ravi's written OK → PROTECTED_CHANGES.md.
**Landing page:** not touched.

## 1. RAVI — TO DO NOW
1. Deploy **v259**. `npm ci` as usual (no new packages).
2. Supabase: run **`scripts/sql/session39.sql`** (only adds: `creator_profiles.show_on_creator_home`, `referral_config.share_pct_of_earnings`). Also session36 / session38 / session38_part2 if not done.
3. Admin → Users → tick **"Show on home"** on 3–4 creators (max 4). Until then the Home section and the onboarding faces stay hidden.
4. Admin → Banners: the "100% Escrow" banner text is inside the image → replace the image; brand banners must have type **Brand**, not Common (M15/M16).
5. Test on phone (creator): Earnings opens · keyboard never covers a field (onboarding search, forms, sheets, chat) · new page opens at the top · bottom bar only on Home / Campaigns / Explore UGC / Inbox / Profile · OTP screen · onboarding photo step + DOB auto-jump + step bar + phone Back between steps + Finish later → dashboard → Home "Finish" → same step · Home first name + photo, no refresh button · My orders → Ongoing deals · Campaigns card/filter/pull-down refresh · expired campaign gone · Profile KYC card (under review) → full KYC page · Profile tab shows your photo · Invite creators text · /creators and /explore send a creator Home · Inbox "Browse briefs" → Explore UGC.

## 2. BUILT IN SESSION 39 (v259) — Ravi's phone test list (M-numbers)
Crash: **M14** Earnings crash (hooks after the loading return) fixed + test; **M27** same bug fixed in mobile chat 🔒, contract OTP popup 🔒, admin Refund, admin Release Payout (scan: 0 left).
App-wide: **M9** keyboard (`keyboardAware.js`, `--kb`, sheets lift) · **M19** pages open at top · **M13** bottom bar only on 5 main pages, back arrow on Earnings/Deals · **M12** old "Good afternoon" header gone for creators · **M26** sparkle icons removed / icon-only ones → Lightbulb · **M37** DM Sans on /apply form + consent lines · **M3** onboarding photo saved to profile (was never sent) · **M22** Profile tab = own photo; after the onboarding upload the logged-in user is refreshed so Home, bottom bar and avatars show it at once (Settings already did this).
Onboarding: **M2** OTP screen redesign (reference app) · **M4** name from sign-up · **M5** DOB auto-advance · **M6/M31** "Step N of 4" bar instead of Saved pill · **M7** no top back, phone Back = previous step (history entries) · **M8** Finish later → dashboard (creators; ARCHITECTURE 70 updated) · **M32** invented % lines replaced · **M41** dashed photo box + trust line + rotating admin-picked faces.
Home: **M10** first name · **M39** refresh button + "Just updated" gone (pull-to-refresh already there) · **M11** My orders → `/creator/deals?tab=active_deals` · **M35** "Creators like you" = admin picks only (`backend/creatorHomePicks.ts`, admin toggle); removed invented "25000 followers" / "followers × 2.2 reach" fallbacks.
Campaigns: card = Actively reviewing, requirement line, real time-ago, Closes in N days, match %, views · applied + faces (creators only), filter sheet, pull-down refresh · detail: closed when past deadline, match %, views/applied, requirement line · desktop: fixed "1d ago" was hard-coded, "10k+ followers" invented when brand set none, expired campaigns hidden · **M20** Browse briefs → Explore UGC · **M34** creators can't open Explore creators.
Profile/referral: **M24** KYC card states (under review / rejected / start) · **M25** KYC opens the full `/creator/kyc` page · **M17a** one line "You also get a share of what your friend earns." · **M17b** share = 0.2% of friend's net (after fee) on paid deals, cap ₹2,000 (`share_pct_of_earnings`, admin field) · **M18** "Your referral earnings" · Terms wording updated.

## 3. NOT DONE — next session (approved by Ravi, list "M40")
- Profile hub in 3 groups with state on the right; rate-card preset chips; device sessions "this device" vs others; Instagram "Pending / Verified by Ybex"; portfolio paste-link (no views).
- Inbox row stage chip + unread count; Notifications tabs All / Briefs / Payouts + day groups.
- Deliverable live-link format check (🔒 chat/deal screen — ask OK).
- Brand "X campaigns done" + apply quote from rate card: need a new call in locked `CampaignDetail.jsx` → ask Ravi.
- M36 /apply form: font fixed; steps match design 1a (checked by field list) — Ravi to check on phone.
- Not yet compared line-by-line with the design: Profile sub-pages 1b–1m, UGC claim M01–M03 / U03, Inbox/Notifications.
- Seen, not touched: chat fallback names ("Aarav Mehta", "Lumen Skincare", "Winter Glow Reel") in locked `ChatBoxMobile.jsx`; server-made "fake follower %" in locked `creators_routes.ts`. Ask Ravi.

## 4. OPEN — ask Ravi
Brand markup +2% / agency +5% (session 38) · admin email alert on payout/KYC · Phase 2 list.

## 5. RAVI'S DECISIONS IN SESSION 39 (keep these)
- Bottom bar stays Home · Campaigns · Explore UGC · Inbox · Profile (design's Deals tab NOT added); bar only on those 5 pages, inner pages use the phone's Back / a back arrow.
- Onboarding: no top back button, "Step N of 4" instead of "Saved", Finish later → dashboard, OTP + photo step like the reference app (another app's screenshots), rotating faces = admin-picked creators.
- Creators never see Explore creators; Home shows only 3–4 admin-picked creators (Admin → Users → "Show on home").
- Referral: 0.2% of the friend's earnings after the Ybex fee, cap ₹2,000 per friend, paid by Ybex; UI line only "You also get a share of what your friend earns"; never show a friend's earnings.
- "Zero commission · you keep 100% of every payout" on creator Home STAYS (Ravi chose C after the risk was explained: the creator's fee is deducted — misleading-claim risk). Do not raise again.
- Font = app's own DM Sans (design files' fonts ignored). Campaign card/detail like desktop (views · applied, Actively reviewing, requirement line); generated numbers creators-only (session 38).
- Design-only features: ✅ 1–11 and 🔁 12–15 approved (listed in chat); ❌ list dropped (fake social proof, bookmarks, "replies within 2 days", 18.4% badge, rate benchmark, mobile-change OTP, "Refer & earn ₹500", usage-rights / product fields, pull-to-refresh was kept instead of refresh button).
- /apply form: build only design "1a" Step 1 → Step 2 → Submitted; the first screen already exists, don't touch.

## 6. WAITING FOR "BANAO" — audience estimate (Ravi chose B)
Brands currently see "Authentic Audience" / "Performance Score" made by the server from follower count only (`creators_routes.ts`: fake % = 3.5 + (followers mod 120)/10; MyProfile shows 94 when empty). Ravi: keep the number, label it **"Estimate"**, and calculate from the creator's onboarding numbers. Proposed (shown to Ravi, not built yet, no locked file needed — new frontend helper, screens stop showing the server's fake %):
- Engagement = (avg likes + avg comments) ÷ followers × 100; Reach rate = avg reach ÷ followers × 100.
- Authentic audience (Estimate) = compare with typical levels by size (<10K: ER 4% / reach 30%; 10K–1L: 2.5% / 25%; 1L–10L: 1.5% / 20%; >10L: 1% / 15%), range 50–98%; Performance score (Estimate) from both; missing data → "Not enough data"; small line "Based on the creator's own numbers, not verified."
- Example: 50,000 followers, 1,200 likes, 85 comments, 8,500 reach → ER 2.6%, reach 17% → "~86% · Estimate".
- Screens: CreatorPublicView, CreatorProfile, DealDetailDrawer, BrandDashboard, Leaderboard, MyProfile (remove the 94 default).
- Build only after Ravi says "banao". Benchmarks are rough Instagram norms — say so; can become admin settings later.

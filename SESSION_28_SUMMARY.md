# Ybex — Session 28 Summary (start the next session from here)

**Latest zip:** `version222.zip` (v221 + signature records). v221 = v220 + Campaign / UGC / Invite flows locked. v220 = v219 + brand KYC gate fix, per-user drafts, live refresh, slow-API log. `metadata.json` still says "version212 / version-210" — AI Studio leftover; the code is Claude's v220.
**Language:** Ravi writes Hindi/Hinglish — reply the same way. All in-app / email / tutorial text is **English**.
**State (v222):** 782 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean.

**Rules (unchanged):** `npm run verify` before every zip · WHO + WHEN on every action · status tokens = DB contract · a money claim in the UI must match the server · no competitor names · never edit a test just to make it pass.
**Working rules from Ravi (still valid):** Supabase work via prompts in chat, never in the zip · no new UI designs, basic UI only · don't show the Phase 2 / Launch-day lists unless asked · Ravi sometimes builds in AI Studio from an older version — check `metadata.json` and diff against the last Claude version.

**Protected changes:** `ARCHITECTURE.md` table now has **61 rules** (59–61 added this session).

**🔒 LOCKED (rule 60):** Campaign, UGC, Invite-to-campaign. Logic files frozen; screens may be redesigned but must make the same server calls. `npm run verify` enforces it. Unlock only with Ravi's written OK → `npm run protect:update -- --reason "..."`.

---

## 1. Done in session 28

### 1.1 "KYC is done but Launch says complete KYC" (Ravi's screenshots)
- Dashboard badge (`GET /verifications/me`) reads `brand_kyc`, else the newest real `verifications` row. The campaign gates (`POST /campaigns` publish, `POST /campaigns/:id/submit-draft`) read `brand_kyc` only → a brand approved through `verifications` saw "Approved Partner" and a 403 on Launch.
- New `getBrandKycStatus()` in `backend/creatorKyc.ts` (same order as the badge) + `brandKycBlock()` in `campaigns_routes.ts`, used by both gates. Under review → "still under review" message; lookup failed → 503 `KYC_CHECK_FAILED` ("try again"), not "complete KYC".

### 1.2 Draft from one brand showing on another brand
- Browser drafts used fixed keys (`campaign_draft`, `ugc_draft`, `nexus_brand_ugc_draft`) shared by every account on that browser.
- New `src/lib/userDraft.js` (`draftGet/Set/Remove`, key `<name>::<user_id>`). 8 files switched. The old shared key has no owner → it is deleted, never shown (a draft sitting in a browser today disappears once).
- Server drafts (DRAFT badge in the list) were already per brand.

### 1.3 Auto refresh (Ravi: KYC approval / new applicant needed a page refresh)
- Every stored notification is already pushed to the user's socket room (server.ts insert proxy). `NotificationPopup` (app-wide, once) now re-announces each as `ybex:live` (`announceLive`).
- New `useLiveRefresh(reload, { types, intervalMs })` (`src/lib/liveRefresh.js`): silent reload (no spinner) on a matching notification, on tab focus, and on a backup timer.
- Wired: `AuthContext` (KYC → `refreshUser`; checks every minute until approved), `BrandCampaigns`, `BrandCampaignApplicants` (30 s backup), `BrandDashboard`, `BrandHomeMobile`, `CreatorDashboard`.

### 1.4 "The app got slow in the last 2–3 days" — not proven yet
- Added `[slow-api]` log (server.ts): every API call ≥ 1.5 s logs method, path, ms, status.
- Suspects (from code): every request's auth lookup reads the full `users` row (`select('*')`) — base64 photos there would make every click heavy; session-27 polls (invites every 60 s + focus); creator dashboard fetches all campaigns every 60 s; 3–4 sockets per page (Layout bell, dashboard bell, popup, chat); the inbox cache is cleared for everyone on any write.

### 1.5 Flow lock (Ravi: "save campaign, UGC, invite so mobile UI work can't change their logic")
- `scripts/protectedFlows.mjs`: 35 logic files (campaign, deals/chat/contract/payment, UGC, invites, and browser flow logic like `dealState.js`, `useChatThreadMobile.js`) frozen by sha256; 4 screen groups (chat 37 files, ugc 14, campaign 6, invite 3) — each file's server calls (method + path, incl. endpoints built in a variable) recorded.
- `backend/protectedFlows.test.ts` (9 tests) fails on any logic edit, any added/removed/renamed call in a screen file, a deleted file, or a shortened list. Checked both ways: a one-line edit in `ugc_routes.ts` fails; a restyle of a chat card passes; renaming one endpoint in `SystemMessage.jsx` fails.
- `GEMINI.md` + `AGENTS.md` (AI Studio / other tools read these first) start with the LOCKED section. `PROTECTED_CHANGES.md` = change log (baseline = v221).
- Not caught: a change to the *body* sent with a call, or logic inside a screen file that doesn't touch a call. Those are still guarded by the existing flow tests (deal/UGC/mobile chat tests).

### 1.6 Agreements (Ravi: "are our agreements right?")
- Reviewed all agreement screens. Campaign (brand + creator, same 4 clauses), UGC creator (5 clauses), UGC brand: none. Old `BrandAgreement.jsx` / `AgreementSign.jsx` (365 days, Udaipur) are dead code.
- Gaps found: no parties / "Ybex is not a party", no post-live duration, no #ad duty, "exclusive" licence, no auto-approve, no refund/TDS/dispute terms, overstated claims ("OTP constitutes a binding e-signature" — email OTP is not a Section 3A e-signature; valid as electronic acceptance under Section 10A), no record of the text signed.
- Full Brand + Creator agreement drafted in chat (English). **Ravi's decisions:** company "Ybex Media", Jaipur (arbitration + courts), campaign post live ≥ 90 days, licence **non-exclusive**. UI: 5–6 key points on top, "See more" for the full text, "Download as PDF" (design via Claude Design). Final text **not yet in the app** — Ravi confirms the short version first.

### 1.7 Signature records (rule 61, Ravi approved the unlock)
- Supabase `agreement_signatures` created by Ravi via the Supabase connection; all 12 checks passed (22 columns, anon/authenticated denied, wipe fn only service_role, edit/delete/truncate blocked, OTP + hash CHECKs, wipe fn works).
- Server: `backend/agreementRecord.ts`; wired into all four sign routes; `consumeSignToken` unchanged in behaviour, the verified email/time come via `noteSignEmail` / `takeLastSignMeta`. Recording never blocks signing.
- Screens send the text they showed: `ContractModal`, `MobileContractSheet` (+ `useChatThreadMobile`), `UGCContractModal`, `CreatorUGCMobile` claim. Versions `campaign-v0-desktop/mobile`, `ugc-v0-desktop/mobile` (today's text). Server calls unchanged (screen lock: no group changed).
- Admin: `GET /admin/agreements` (read-only); `AdminSignedContractModal` shows "Signature records" (signer, time, OTP email, IP, version, signed text); label Udaipur → Jaipur; fake `creator@ybex.io` → "Not provided".
- Complete wipe out removes records only through rpc `wipe_agreement_signatures`.
- Lock: +3 files (`agreementRecord.ts`, `admin_agreements_routes.ts`, `agreementCapture.js`), re-locked, logged in `PROTECTED_CHANGES.md`.
- The four session-21/24 guard tests that look for `consumeSignToken(user.user_id, req.body?.sign_token)` pass unchanged (the code keeps that line).

### 1.8 Tests
- New `backend/session28.test.ts` (15 tests): KYC status order, UNKNOWN on failure, both gates use the shared check, submit-draft goes live for a brand approved via `verifications` (fails on v219 code), per-user drafts, no direct shared-key reads, live wiring, silent reload, slow log.

---

## 2. Still open

### Ravi — now
1. Deploy v221 and test. v220 changed campaign code after Ravi's v219 test (KYC gate, drafts, live refresh), so retest Campaign publish + Launch draft + applicants once — the lock's baseline assumes this build is good:
   - Brand approved (Sonam) → Publish and Launch draft work, no KYC error.
   - Log in as brand A, start a draft; log out, log in as brand B → no draft banner. Back to A → draft is there.
   - Keep the brand's My Campaigns page open; a creator applies → count changes within seconds. Admin approves a KYC while the user's page is open → badge / Launch update without refresh.
2. Cloud Run → Logs → search `[slow-api]` after some use → send the screenshot. Supabase: count of `data:` values in `users.picture` and the profile photo columns (+ size).
3. From session 27: `/api/health` → `supabase_service_role` true? Supabase reports asked in session 27; session 27 test list (`SESSION_27_SUMMARY.md` §2).

### Claude — next
0. Agreements: after Ravi confirms the short version → put v1 text (Ybex Media, Jaipur, 90 days, non-exclusive) into the four screens with the new UI from Claude Design, bump versions to `*-v1-*`, fix the "OTP constitutes a binding e-signature" line to "accepted electronically (Section 10A IT Act)". Ask Ravi: untick the two pre-ticked UGC checkboxes (desktop + mobile)? Legacy sign screens (`/deals`, Collabs, DealDetail, CreatorUGCOrders) record `text-not-captured` — add capture? Campaign admin view of records (only UGC admin modal shows them now).
1. After Ravi's `[slow-api]` logs: fix the slowest calls. Likely: slim the auth `users` read, one shared socket per tab, per-user inbox cache clear, drop the creator dashboard's all-campaigns poll.
2. Session 27 list: base64 photos → storage; `content-submissions` private; admin dispute queue; etc. (`SESSION_27_SUMMARY.md` §2).

### Ravi's decisions still open
- Creator dashboard chart splits real totals into weeks by fixed 15/25/30/30 % — the weekly shape is invented (rule 58). Remove, or show totals only?
- Landing `ReviewsSection.jsx` hardcoded testimonials (incl. brand names) — from session 27.
- After a paid brief: My Briefs or My Orders? · Admin order-cancel → manual refund queue? (default yes) · Company legal name + contract jurisdiction.

## Phase 2 note (add to the Phase 2 list)
- Auto-approve: brand does not review a draft within N days → approved and paid (agreement clause 4.3 waits for this).
- Video submissions auto-delete **18 days** after upload (Ravi, session 28) — campaign deliverables, UGC videos, live proofs in storage. Decide: 18 days from upload or from deal/order close; keep the DB row with "file expired"; tell both sides before deletion. Note: this touches locked files → needs Ravi's unlock when built.

## 3. New / changed files (session 28)
- **backend/**: changed `creatorKyc.ts` (brand status), `campaigns_routes.ts` (both gates), `server.ts` (slow log); new `session28.test.ts`.
- **src/**: new `lib/userDraft.js`, `lib/liveRefresh.js`; changed `components/NotificationPopup.jsx`, `contexts/AuthContext.jsx`, `pages/brand/BrandCampaigns.jsx`, `pages/brand/BrandCampaignApplicants.jsx`, `pages/brand/BrandCampaignCreate.jsx`, `pages/brand/BrandHomeMobile.jsx`, `pages/brand/BrandInstantUGC.jsx`, `pages/brand/BrandUGCMobile.jsx`, `pages/brand/BrandUGCPost.jsx`, `components/campaigns/mobile/MobileCampaignCreate.jsx`, `components/layout/BottomNav.jsx`, `components/dashboard/BrandDashboard.jsx`, `components/dashboard/CreatorDashboard.jsx`.
- **Signature records:** new `backend/agreementRecord.ts`, `backend/admin_agreements_routes.ts`, `backend/agreementRecord.test.ts`, `src/lib/agreementCapture.js`; changed `backend/signTokens.ts`, `session_routes.ts`, `deals_chat_routes.ts`, `deals_routes.ts`, `ugc_routes.ts`, `admin_wipe_routes.ts`, `accountWipe.ts`, `server.ts`, `ContractModal.jsx`, `MobileContractSheet.jsx`, `useChatThreadMobile.js`, `UGCContractModal.jsx`, `CreatorUGCMobile.jsx`, `AdminSignedContractModal.jsx`.
- **Lock:** new `scripts/protectedFlows.mjs`, `scripts/protected/manifest.json`, `backend/protectedFlows.test.ts`, `PROTECTED_CHANGES.md`; `package.json` scripts `protect:update`, `protect:check`.
- **Docs:** `ARCHITECTURE.md` rules 59–61; `GEMINI.md`, `AGENTS.md` (LOCKED section on top); this file.

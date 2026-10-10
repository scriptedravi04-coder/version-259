# Ybex — Session 29–30 Summary → START SESSION 31 FROM HERE

**Latest code:** `version229.zip` (Claude's build). This summary file is newer than the copy inside the zip — use this one.
`metadata.json` still says "version212" (AI Studio leftover). Ravi's deployed test link is `version219.ai.studio` — deploy the latest build before testing.
**Language:** Ravi writes Hindi / Hinglish → reply the same way. All in-app / email text is **English** (chat included — Ravi confirmed).
**State (v229):** 825 tests pass, 1 skipped on purpose; `tsc`, crash guard, `vite build` clean.
**Rules:** `npm run verify` before every zip · WHO + WHEN on every write · status tokens = DB contract · a money claim in the UI must match the server · no invented numbers/names/photos in new work · never edit a test just to make it pass (only when Ravi changes the rule, and say so) · Supabase work = a prompt for Ravi's separate Supabase-connected Claude, never done from here · Ravi is not technical: give click-by-click steps or a ready prompt, never "check your settings".
**ARCHITECTURE.md:** 63 rules (62 overlays in a portal + scroll lock; 63 creator dashboard numbers from `/dashboard/creator`).
**Lock (rule 60):** Campaign, UGC, Invite, Chat. Screens may be redesigned with the SAME server calls. Any locked-logic change → Ravi's OK → `npm run protect:update -- --reason "<quote>"` (logged in `PROTECTED_CHANGES.md`).

---

## 1. BUILD NEXT SESSION — Ravi's final work list (all agreed in chat)

Build all of these together in one round, then one zip (`version230.zip`).

1. **Real match % on the desktop creator profile** (`src/pages/creator/CreatorPublicView.jsx`). Replace ONLY the random match (`runMatchCalculation`). Keep the fake rating and fake views as they are (Ravi). Score from the viewing brand's own data: **Category 40% · Platform 20% · Budget 25% · Location 15%**. A part with no data is left out of the score (weights re-normalised); no data at all → don't show a %. Show one reason line, e.g. "Same category · rate fits your budget".

2. **Hide the Barter option in campaign create** (desktop `BrandCampaignCreate.jsx` + mobile `MobileCampaignCreate.jsx`, locked screens — UI only, calls unchanged). Only "Paid". An old draft saved as Barter opens as Paid and asks for a budget. Barter → Phase 2 (see §5).
   - Why: the server ignores barter (no `is_barter` / `barter_description` columns on `campaigns`; budget 0 is saved as ₹2,000–5,000 by `Number(0) || 2000` in `campaigns_routes.ts`), so a barter campaign would show ₹2,000 and could ask the brand for escrow. Supabase: 0 campaigns at 2000/5000 and 0 barter deals → nobody affected yet.

3. **Creator mobile home — real deal amounts** (`src/pages/creator/CreatorHomeMobile.jsx` ~line 602): reads `d.agreed_rate` (not sent by the server) and falls back to ₹10,000. Use `agreed_amount` / `payout`; no invented amount. (Campaign-card ₹10,000 / ₹15,000 fallbacks are dead code for new campaigns — the server always saves a budget — leave them; the fake views / "applied" counts stay by Ravi's choice.)

4. **UGC brief: after payment land on My Briefs, not an empty "Create brief"** (desktop `BrandUGCPost.jsx` + mobile `BrandUGCMobile.jsx`, `src/lib/briefPaymentRetry.js`; UGC lock — navigation only, Ravi OK to update the lock).
   - Ravi's screenshots: after paying, the page shows an EMPTY step-1 form (so the brief was saved and the page came back — a failed save would stay on step 5 with a red toast).
   - Likely cause: Razorpay Checkout adds a browser-history entry and goes "back" when it closes; that pops `/brand/ugc/briefs` back to `/brand/ugc/post`, which remounts empty (draft already removed). Mobile also never changes the URL after success (only an in-page view switch).
   - Fix: navigate with `replace` after the checkout has closed (short delay); mobile also moves to `/brand/ugc/briefs?tab=briefs`; safety net — if the post page mounts within ~60 s of a successful post (sessionStorage flag), go straight to My Briefs with a "Brief posted ✓" toast.
   - **Waiting on Ravi:** after paying, does the new brief appear in My Briefs (status Live) and the payment in Payments? If NOT, it's a save failure → need the Cloud Run log line for `ugc/briefs`.

5. **Photos: make them small** — resize/compress on upload (avatar, cover, brand logo, profile assets → ~512 px WebP, target 20–60 KB) + a one-time resize of existing files. Supabase: `avatars` 27 files ≈ 22.5 MB (~0.8 MB each), `cover-images` 21 ≈ 16 MB, `brand-logos` 31 ≈ 6.8 MB, `profile-assets` 49 ≈ 24 MB.

6. **Banners → Storage.** `banners.image_url` holds base64 (4 of 5 rows, ≈ 0.3 MB total) and is fetched on dashboard loads. Move to the `banners` bucket, new uploads go to Storage. Delete the empty `banner-images` bucket (Supabase prompt).

7. **`content-submissions` bucket → private** (≈ 1.67 GB, 77 files, ~22 MB each, now PUBLIC). Ravi OK'd the unlock ("if UX has no issue"). Only the deal's brand, creator and admin; signed links (a few hours), re-signed on page load and silently on play if expired; downloads keep working; lists/cards show a thumbnail / first frame, the video loads only on play. Check emails/notifications for direct video links first. Make the bucket private LAST (Supabase prompt after the code is live), otherwise old links break.

8. **Landing page reviews** (`src/components/landing/ReviewsSection.jsx`, `backend/admin_content_routes.ts`, admin `LandingContentManager.jsx`):
   - Remove the 18 hardcoded reviews (incl. real brand names Nykaa, boAt, Mamaearth, Wow Skin Science, Bewakoof, Noise). Show only admin-added reviews; none → hide the section. (Today: an empty type fills with fake ones, e.g. only creator reviews → fake brand column.)
   - Admin add/delete must show an error when the Supabase write fails (today it silently saves to server memory and says "Review added!", lost on restart).
   - Rating: every review shows 5.0. **Default (Ravi didn't choose): add a 1–5 star field in the admin form (default 5)**; needs a `rating` column if missing (Supabase report pending).
   - Leave `landing-brands` logos as they are (Ravi added them on purpose).

9. **Slowness** (Ravi: "technical knowledge nahi hai, tum apne hisaab se dekho"):
   - Fix directly: photos (5), banners (6), video thumbnails (7); one shared socket per tab (today 3–4 per page); inbox cache cleared per user, not for everyone; stop the creator dashboard's 60 s all-campaigns poll.
   - Build an admin **"Speed report"** page Ravi can open and screenshot: server region + Supabase round-trip time, cold-start detection (uptime, first-request time), top 10 slowest APIs (avg / max, from the `[slow-api]` data kept in memory).
   - After his screenshot: any Cloud Run setting change (e.g. minimum instances) → give click-by-click steps.
   - Supabase facts: whole DB 21.7 MB, `users` rows ~0.2 KB (the `select *` auth read is NOT the problem), no base64 except banners.

---

## 2. WAITING ON RAVI (inputs, not code)
- **UGC brief (item 4):** does the paid brief show up in My Briefs + Payments?
- **Test campaign:** Publish → Pause → Close one campaign, then run the Supabase prompt (Part A checks the backend writes with the service role now that browser writes to `campaigns` are revoked; Part B = `landing_reviews` / `landing_brands` columns, rows, RLS, rating column).
- **Agreement v1 (v229) test:** campaign + UGC sign → no OTP before ticking, OTP after; Download PDF works; admin signature record shows the v1 text.
- Deploy the latest build (v229) — the phone link was still `version219`.
- Open decisions (no rush): profile-view counter counts a creator's own visits (fix is in locked `creators_routes.ts`); Brand-tab hub hardcodes "₹1,000" referral text; creator dashboard chart's invented weekly split (rule 58) — remove?

## 3. Supabase — done this session (by Ravi's Supabase Claude)
- `campaigns`: added `applications_paused` (bool, default false), `applications_paused_at`, `applications_paused_by`, `closed_at`, `closed_by` (migration `add_campaign_pause_close_columns`). No CHECK on status (`completed` allowed; status is varchar, default `live`). No user triggers.
- Revoked INSERT/UPDATE/DELETE/TRUNCATE on `campaigns` from anon + authenticated (migration `revoke_campaigns_write_from_browser_roles`); SELECT kept; verified anon/auth UPDATE → 42501. The browser never writes `campaigns` (checked in code). **Risk:** every backend write is `(privilegedSupabase || supabase)` — if the service-role key were missing, publish would now fail → confirm via the test above.
- `campaigns` columns: campaign_id, brand_user_id, brand_name, brand_logo, title, description, budget_min, budget_max, deliverables, categories, platforms, deadline, language, status, applicants, created_at, views + the 5 above. Barter lives only on `deals` / `campaign_deals` (`is_barter`, `barter_details`) and creator profile fields.
- Column names to remember: `transactions` has `gross_amount`, `creator_net_amount`, `platform_fee_amount` (no `amount`); `transactions.deal_id` and `deals.id` are uuid; `deals.campaign_id` / `chat_threads.campaign_id` are text.

---

## 4. Done in sessions 29–30 (v223 → v229)
- **v223 — creator dashboard + overlays:** `PullToRefresh` no transform at rest (modals covered only part of the screen); `ModalPortal` + `useScrollLock` (rule 62); `GET /dashboard/creator` (`backend/creatorDashboard.ts`) with real earnings (this month / escrow / total, IST), open/completed work, real amounts, next step, views read without counting; removed fake trends, sparklines, stock photo, fake match %, "₹10,000", "1d ago"; Active deals tabs All active / Needs you / With brand / Completed; Important-for-You invite card fits.
- **v224 — brand mobile KYC + admin login:** `BrandKycMobile.jsx` (status → business & tax → contact → submitted; same endpoints; 30 s refresh; prefill-once bug fixed); admin login in Ravi's design.
- **v225–v226 — Manage tab (MG-01…06):** `BrandCampaignsMobile.jsx`; `backend/campaignManage.ts` (pause/resume, close → `completed`, matching-creators count, apply guard → 409 `APPLICATIONS_CLOSED`); `BrandCampaignDetailMobile.jsx` (stats, ROI, pitches, PDF report, no-pitches state, actions sheet). Brand home social-proof ticker kept on purpose (uses real brand names — consider generic).
- **v227 — chat + loader:** both were already built (loader "Turn 14" session 23; mobile chat on the Uniqe_Chat design). Added the top bar during route code-loading; removed fake chat times, invented ₹15,000 original ask, "Minimum ₹3,000" counter line (the ₹3,000 floor exists only for invites).
- **v228 — EX-04 / EX-05:** `CreatorProfileBrandMobile.jsx` (real stats, rate card only where set, rating only with reviews, Save + Invite); mobile invite sheet in `InviteToCampaignModal.jsx` (pick a live campaign to prefill; same `send-brief` call; no "Chat" button — chat opens only after the creator accepts).
- **v229 — Agreement v1:** `src/lib/agreementTerms.js` (Ybex Media, Jaipur arbitration/courts, ≥ 90 days live, #ad/ASCI, non-exclusive licence — campaign 12 months, UGC 6 months — escrow/fee/TDS, cancellation, electronic acceptance under Section 10A); `AgreementTermsPanel.jsx` (key points, "See all terms", Download PDF) on all four sign screens; campaign desktop agreement rebuilt in the UGC style; **OTP only after ticking** (boxes start unticked; UGC no longer sends on open); "binding e-signature" line removed; versions `*-v1-*`; same server calls. Legacy sign screens (`/deals`, Collabs, DealDetail, CreatorUGCOrders) unchanged.

## 5. Phase 2 (not now)
- **Barter end-to-end:** `campaigns.is_barter` + `barter_description` columns; server saves budget 0; card shows "Barter" + the product; accepting creates a barter deal (`deals.is_barter = true`) with NO escrow / payment step; money steps hidden in the chat.
- (From session 28) auto-approve after N days; videos auto-delete 18 days after upload.

## 6. Older open items (session 27–28)
- Agreement: add text capture to the legacy sign screens; campaign admin view of signature records.
- Desktop `CreatorPublicView.jsx` fake rating / views (kept by Ravi); `getCampaignStats` generated views/applied (kept by Ravi).
- Admin dispute queue; admin order-cancel → manual refund queue (default yes).

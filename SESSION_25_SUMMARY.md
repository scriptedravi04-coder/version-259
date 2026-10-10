# Ybex — Session 25 Summary (start the next session from here)

**Latest zip:** `version-211.zip`. History this session: v206 → v207 → v208 → v209 → v210 → **v211** (all Claude).
**Language:** Ravi writes Hindi/Hinglish — reply the same way. All in-app / email / tutorial text is **English**.
**State (v211):** 674 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean.

**Rules (unchanged):**
- `npm run verify` before every zip.
- WHO + WHEN on every action.
- Status tokens = DB contract.
- A money claim in the UI must match the server; no invented amounts.
- No competitor names.
- Never edit a test just to make it pass. (One fixture was updated this session because Ravi changed the policy — see §1.2.)

**New working rules from Ravi (session 25):**
- **Supabase work is done through prompts in chat** (Ravi pastes them to Supabase Claude and sends back the report). **Never put Supabase prompts/docs in the zip.** `scripts/sql/*` stays in the code because tests read it.
- **No new UI designs.** Build basic UI only. Ravi will get designs from Claude Design. Claude Design prompts must say: make the change **inside the existing "Manage UGC" section**, no new pages. **Admin panel redesign is separate, later — don't include it.**
- **Don't show Ravi the Phase 2 list or the Launch-day list unless he asks** (both are at the end of this file).

**Protected changes:** `ARCHITECTURE.md` table now has **53 rules** (51–53 added this session). `AGENTS.md` / `GEMINI.md` tell AI tools not to undo them.

---

## 1. Done in session 25

### 1.1 Creator self-cancel of a signed order (v207, rule 51)
- **WHO / WHEN:** the order's creator only, before the first draft.
- **Screen (basic):** "Can't do this order? Cancel" in the mobile + desktop workspace → `CreatorCancelOrderSheet`.
  - 4 reason chips: "Not feeling well", "Brief is not what I expected", "Product not received", "Other" ("Other" needs a note).
  - Warning: "counts like a missed deadline", or "won't count" in the first hour / never signed.
- **Server:** `cancelUgcOrderByCreator` in `backend/services/ugcDeadlineService.ts`.
  - Guarded update (`PRE_DRAFT_STATUSES`, `video_url` null).
  - Order `CANCELLED`, **no refund**, slot relisted at the top as "Urgent".
  - If the brief is already cancelled, the slot goes to the refund queue instead.
  - Brand gets in-app + email "Your creator stepped away — brief back at the top", plus a chat system message and `thread_updated`.
  - The creator's reason goes to the admin log only.
- **`expiry_reason` tokens** (`statusTokens.ts`):
  - `CREATOR_CANCELLED` — counts as late;
  - `CREATOR_CANCELLED_GRACE` — within 1h, doesn't count;
  - `CREATOR_CANCELLED_UNSIGNED` — never signed, doesn't count.
  - All three block re-claiming that brief. Creator stats count `CREATOR_CANCELLED` as late.
- **Bug fixed:** a creator cancel used to run the brand-refund path → Razorpay auto-refunded the brand and the slot reopened with no money behind it.

### 1.2 Brand cancels ONE order (v207, rule 52 — Ravi's policy)
- **First 24h** after the creator's timer started → refused (`CANCEL_WITHIN_24H`).
- **Draft uploaded** → refused (`DELIVERED_USE_DISPUTE`).
- **24h+ and no draft** → allowed, **no fee**, full slot amount.
- **Server:** `cancelUgcOrderByBrand`.
  - Refund row first (`ugcref_ord_<order>`, one per order), then the guarded order update; rolled back if a draft landed.
  - The slot is removed from the brief (not relisted).
  - Money → Admin → UGC Refunds (manual, **never Razorpay**).
  - A saved refund account is required.
  - The creator is told, **not penalised**, not blocked (`BRAND_CANCELLED`).
- **Screens (basic):**
  - `BrandCancelOrderButton`: disabled with the wait time, or "creator has delivered";
  - `BrandCancelOrderModal`: amount, no fee, optional reason, UPI/Bank form if no account is saved;
  - desktop "Order closed — no draft" card.
- `ugcIntegrity.test.ts` "a second cancel…" fixture updated to the new policy (order 30h old + refund account); it still checks a single refund.
- Ravi's future idea (Phase 2): a cancellation fee once work has started.

### 1.3 Security (v208, rule 53)
Ravi's screenshot: "Failed to create user … violates row-level security policy for table users".
- **Cause:** the server has **no service-role client** (`SUPABASE_SERVICE_ROLE_KEY` missing or wrong).
  - It now says so in plain words (`SERVICE_KEY_MISSING`).
  - `/api/health` shows `supabase_service_role: true/false`.
- **Fixed:**
  - Create-user stored `mock_hash_<password>` (plain text) → bcrypt + `newPasswordProblem` (10+ chars, letters + numbers, no 123456789).
  - A sub-admin could create a Super Admin or change team roles → only a full admin (`isFullAdmin`) can.
  - A brand team member with team_role `sub_admin` passed ~57 admin checks → neutralised once in `parseAuthUser` (wraps `parseAuthUserRaw` with `neutralizeStaffTeamRole`).
  - Brand team add: bcrypt + no staff team roles.
  - Admin FAQ page wrote `faq_articles` from the browser → `/admin/faq` POST/PUT/DELETE routes.
  - Brand "reject applicant" wrote a non-existent `brand_applications` table from the browser → removed.

### 1.4 Supabase audit + fixes (v209–v210)
Ravi ran audit prompts 1–4 with Supabase Claude.
- **DB now has:**
  - `reviews` (code's table; `creator_reviews` / `ugc_reviews` are empty leftovers);
  - `influencer_data` (admin-only, no policies);
  - `ugc_refunds`, `brand_refund_accounts`;
  - all missing columns (ugc_orders expiry/reminder columns; ugc_briefs `delivery_hours` / relist / `is_priority` / `razorpay_order_id`; `users.missed_deadlines_count` / `whatsapp_opt_in`; `notifications.redirect_path`; `transactions.brief_id` / `brand_id` / `escrow_hold`; `campaign_applications.rejection_reason`);
  - `ybex_ephemeral` locked (grants revoked).
- **CHECK constraints:**
  - `ugc_orders.status` + `EXPIRED`;
  - `transactions.status`, `chat_threads.status`, `deals.status` extended to what the code writes;
  - **no new CHECKs** on `ugc_briefs.status` (51 `ARCHIVED` rows — not used by code) or `chat_threads.flow_state`.
- **Security:**
  - `faq_articles` → SELECT-only;
  - RLS on `brief_requests`, `file_cleanup_audit_logs`, `market_rate_benchmarks`;
  - `REVOKE ALL FROM anon, authenticated` on users, user_sessions, creator_kyc, brand_kyc, transactions, payout_requests, creator_payment_methods, brand_refund_accounts, ugc_refunds, password_reset_tokens, chat_messages, reviews, influencer_data, campaign_applications.
- **Storage:**
  - catch-all insert/update/delete policies dropped;
  - `service_all_kyc_documents` dropped → **kyc-documents has no policies** (server only);
  - anon INSERT-only on `avatars` + `brand-logos` (the only direct browser uploads; everything else uses server-signed upload URLs);
  - public-read policies kept.
- **Soft-deleted admin** (`deleted_…@archived.ybex`) → `role='deleted'`.
- **Admin accounts (bcrypt):** `commonuseforpro@gmail.com`, `gutargooplus25@gmail.com`, `ravimarketing.com@gmail.com`. `ravi@voicexmedia.com` is **not** an admin.
- **Code:**
  - dead browser `applications` fallbacks removed (CreatorHomeMobile, Explore);
  - brand dashboard applicant counts → `GET /brands/me/application-stats`;
  - influencer re-save says so when the browser can't write.
- **RPC** `sync_deal_and_transaction_status` doesn't exist; the code falls back to two updates (fine).

### 1.5 Admin login (v211)
- Ravi got "No account found" for `ravimarketing.com@gmail.com`: same cause (no service key → `users` lookup empty).
- Login now returns `SERVICE_KEY_MISSING` (503) and reports lookup errors instead of swallowing them.
- **Admin panel:** `/ybx-admin` (or `/admin-login`) → `/admin`. 8 wrong passwords → 15-min lock. A password reset is done in Supabase: `crypt('…', gen_salt('bf',10))`.

### 1.6 Ravi's decisions this session
- Brand single-order cancel: 24h wait, no draft, no fee (built).
- Creator mobile bottom nav: **keep Profile**, no change.
- Campaign-create Do's/Don'ts / `brand_type` / `barter_description` → **Phase 2**.
- Referral reward + promo codes → **after deploy**.
- Cloud Scheduler: skip during testing → moved to the Launch-day list.

---

## 2. Still open

### Ravi — now (in order)
1. **Set `SUPABASE_SERVICE_ROLE_KEY`** (service_role / `sb_secret_…`, same project `mzcovvzkwzjvzskjqwwy`) on Cloud Run **and** AI Studio → restart → `/api/health` must show `supabase_service_role: true`.
   - Nothing that writes (or even logs in) works without this.
2. Deploy v211. Log in at `/ybx-admin`; if the password is unknown → Claude gives the reset SQL.
3. Cloud Run env: `ADMIN_ALERT_EMAIL`, `APP_URL`.
4. **Tests after Prompt 4:**
   - public apply photo upload (avatars);
   - admin landing logo upload (brand-logos);
   - creator UGC video submit + brand plays it;
   - creator KYC upload + admin sees it;
   - brand dashboard applicant count;
   - review submit.
5. End-to-end on Cloud Run:
   - brief post → claim (KYC + OTP);
   - creator cancel;
   - brand cancel (24h+, no draft) → admin UGC Refunds → UTR;
   - payout account + request.
6. **Update agreements:**
   - usage rights;
   - real payout timing;
   - 3 revisions;
   - "missing the deadline cancels the order";
   - creator cancel counts as a missed deadline;
   - brand may cancel one order after 24h with no draft (full refund).

### Claude — next (in order)
1. **`content-submissions` → private:** `VideoEmbedPreview.jsx` builds public URLs. Switch it to server signed URLs first, then give Ravi the Supabase prompt. Same later for `ugc-assets`, `live-proofs`.
2. **Admin dispute queue** with a 24–48h timer (the brand explainer promises it).
3. **Admin cancel on `/ugc/orders/:id/cancel`** still uses the old Razorpay path → suggest the manual queue (**ask Ravi**).
4. Brand mobile "Order closed" card (desktop has it).
5. From session 23:
   - campaign (non-UGC) cancel/refund (Ravi decides the amount; manual refunds);
   - remaining browser reads → API;
   - desktop ChatBox → `dealState.js`;
   - multi-instance, or max instances = 1.
6. **Supabase cleanup (low priority):**
   - drop `brand_applications`, `creator_reviews`, `ugc_reviews`, `banners` bucket;
   - `AdminLogin.jsx` treats team_role `owner` as admin on the client only (the server refuses) — cosmetic.

### Ravi's decisions still open
- Admin order-cancel → manual refund queue? (default yes)
- Company legal name + contract jurisdiction.

### Claude Design (optional, when Ravi wants)
- Inside **Manage UGC**:
  - creator cancel link + sheet;
  - brand "Cancel this order" button + modal;
  - "Order closed — no draft" card;
  - cancel-slots sheet polish.
- The prompt was given in chat (v207 message). Admin panel is excluded.

---

## 3. UGC rules (reference, incl. session 24)
- **Claim & creators:**
  - KYC-only claim;
  - claim = OTP signature; the timer starts at signing.
- **Deadline:**
  - Express 24h / Standard 48h / Relaxed 72h, default 48h, first draft only.
- **Revisions:** 3 per order.
- **Disputes:** Ybex reviews within 24–48 hours.
- **Missed deadline:**
  - order EXPIRED, slot relisted at the top, money stays in the brief;
  - reminders at 6h, then every 3h, max 6; quiet hours 10pm–8am IST;
  - admin alert 3h before.
- **Creator cancel (before draft):**
  - no refund, relist urgent;
  - counts like a missed deadline except within 1h / unsigned;
  - no re-claim.
- **Brand cancel:**
  - **Brief:** only after 24h, only unused slots, 100% refund.
  - **One order:** only 24h+ after the claim and with no draft, no fee, 100% refund.
  - UPI or Bank; Ravi pays manually + enters the UTR; "within 1–2 working days".
- **Wording:** escrow = **Ybex SafePay**.

## 4. Env variables (Cloud Run)
- **Required:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, **`SUPABASE_SERVICE_ROLE_KEY`**, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `APP_URL`.
- **Optional:** `RESEND_FROM_EMAIL`, `MEDIA_KEY_SECRET`, `GEMINI_API_KEY`, `ADMIN_ALERT_EMAIL`, `ADMIN_EMAIL`, WhatsApp keys (Phase 2).
- **At launch:** `CRON_SECRET`, `PAYMENTS_TEST_MODE=false`.
- **Never in production:** `DEMO_LOGIN`, `DEMO_SEED`.

## 5. New / changed files this session
- **`backend/`:**
  - `services/ugcDeadlineService.ts` (`cancelUgcOrderByCreator`, `cancelUgcOrderByBrand`, helpers);
  - `ugc_routes.ts`, `statusTokens.ts`, `creatorStats.ts`;
  - `authSecurity.ts` (staff-role / password / RLS helpers);
  - `server.ts` (`parseAuthUser` wrapper, health flag);
  - `admin_users_enforcement_routes.ts`, `brands_routes.ts`, `admin_content_routes.ts` (`/admin/faq`), `browserDbRoutes.ts` (`/brands/me/application-stats`), `auth_routes.ts` (login `SERVICE_KEY_MISSING`).
- **`src/`:**
  - new: `utils/ugcOrderCancel.js`, `components/ugc/CreatorCancelOrderSheet.jsx`, `components/ugc/BrandCancelOrderModal.jsx`;
  - changed: `CreatorUGCMobile.jsx`, `ManageUGCOrdersView.jsx`, `BrandUGCOrders.jsx`, `BrandUGCMobile.jsx`, `AdminUsersTab.jsx` (password hint), `AdminFAQManager.jsx`, `BrandCampaignApplicants.jsx`, `CreatorHomeMobile.jsx`, `Explore.jsx`, `BrandDashboard.jsx`, `useInfluencerSearch.js`.
- **Tests:** `backend/creatorSelfCancel.test.ts`, `backend/session25Security.test.ts`, `src/components/ugc/orderCancel.test.jsx`; `ugcIntegrity.test.ts` fixture updated.

---

## Launch day (show Ravi only when he asks)
1. **Cloud Scheduler** (skipped during testing; one-time, not per deploy):
   - `CRON_SECRET` on Cloud Run;
   - one job `*/15 * * * *` → `POST https://<cloud-run-url>/api/internal/cron/ugc-deadlines` with header `x-cron-secret`;
   - test with "Force run".
   - Until then: no reminders, no admin alert, no auto-expiry/relist.
2. Rotate the Supabase service-role key, the Razorpay secret and the Resend key.
3. `PAYMENTS_TEST_MODE=false`; no `DEMO_LOGIN` / `DEMO_SEED`.
4. Supabase Auth sign-ups OFF.
5. Buckets private (after the signed-URL code change); delete test data.
6. Max instances = 1 (min 1, CPU always on, session affinity) or the multi-instance work done.
7. Smoke test + one real ₹1 payment.
8. After deploy: referral reward amount + promo codes.

## Phase 2 (show Ravi only when he asks)
- Approve-claimer mode (Ravi has the handoff note — ask him to upload it).
- Relist bonus (Ybex-funded).
- WhatsApp (opt-in, Meta templates, keys).
- Platform numbers (≥20 completed orders per category).
- Burned-in video watermark.
- Brand cancellation fee after work started (10–30%, part to the creator).
- Creator warning when the brand's 24h cancel window opens.
- Campaign-create Do's/Don'ts / `brand_type` / `barter_description`.

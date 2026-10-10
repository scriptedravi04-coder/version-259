# Ybex — Session 23 Summary (start the next session from here)

**Latest zip:** `version-194.zip` (= v193 code + this summary). Built on `version-184`.
**Language:** Ravi writes Hindi/Hinglish — reply the same way.
**State:** 561 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean.
**Deploy status:** Ravi has been testing on the AI Studio PREVIEW (`service188.ai.studio`) — a dev server that sleeps when idle. Real speed tests must run on the Cloud Run URL (see "Ravi — now").

**Rules (unchanged):** run `npm run verify` before every zip; WHO + WHEN on every action; status tokens = DB contract; a money claim in the UI must match the server; no competitor names.
**Protected changes:** the table at the top of `ARCHITECTURE.md` (now **35 rules**, each with the reason and the guard test) + the new "Loading states" section. `AGENTS.md` and `GEMINI.md` tell AI tools not to undo them. Never edit a test to make it pass (this session two old guards failed — the code was changed to satisfy them, not the tests).

---

## 1. What was done in session 23 (v185 → v193)

### Live sync, chat order, login (v185)
- **Other side updated late** (Accept/Negotiate buttons stayed 3–15 s): several actions (campaign negotiate, brand accept-counter, UGC revision…) emitted nothing. New `threadSync.ts` (`router.use`) sends one `thread_updated` after every successful thread/order action — state fields only. Clients merge without touching their thread id and do one coalesced refresh (`src/lib/chatSync.js`). Rule 30.
- **"Brand Needs Some Changes" card stuck at the bottom:** campaign revision `message_id` was `msg_…` (not a UUID) → Supabase insert failed → local-only row appended after everything. Now UUID + server and both clients sort messages by time. Rule 31.
- **Login check:** parallel requests share one session+user lookup; token → user_id cached ≤ 5 s; user row always fresh (`authLookupCache.ts`). Rule 32.
- **Security:** `/auth/logout` only removed the local session; the Supabase row stayed and the token kept working. Now deleted + cache cleared.

### Inbox + UGC order lists (v186)
- Inbox sorted by last activity (newest message) on server + desktop + mobile; healed UGC threads were `unshift`-ed to the top ("stuck on top"). Open chat bumps its thread at once (`chat_activity` event).
- UGC order lists (creator + brand): open orders on top (nearest deadline first), completed/cancelled/rejected/declined/refunded below (`src/utils/orderSort.js`). Disputed stays on top.

### Mobile chat actions (v187) — rule 33
- Mobile computed its own deal flags (ignored `payment_funded`, kept old revisions open, showed "Sign" during negotiation). Now `src/components/chat/dealState.js` (copy of desktop ChatBox flags) drives `ChatBoxMobile`.
- Task button order: completed → negotiate (desktop `NegotiationTable`) → sign → escrow → content / revision / live-link.
- "Make payment" opened a sheet saying "Payment secured · Platform fee Free" and paid nothing → real Razorpay (`processRazorpayPayment`, same args as desktop).
- UGC approve (releases payout) asks for confirmation. Accept/counter merged the response envelope → now `data.thread`.
- Payout card: "Alert admin" creator-only; "View receipt" opens real `InvoiceModal`; `window.print` / `alert()` stubs removed. "+" only offers upload/live-link when the task button does.

### Mobile UI audit — 54 files (v188) — rule 34
- Script check: every endpoint mobile calls exists. Logic bugs fixed:
- Admin payout mobile: sent a 7-char display id and no `transaction_id` to release-payout; invented a 12.5% fee; net ignored GST; readiness used statuses the server never writes → desktop payload + rules, `creator_net_amount`.
- Brand payments mobile: GST receipt assumed 5% fee (+5.9% total) → server `platform_fee_amount` / `gst_amount` / `gross_amount`.
- Creator earnings mobile: fake ₹1,500 fee, sample UTR `CMS293847291`, fake "Admin nudged!" → removed.
- Creator UGC mobile: live link sent as `liveLink` (server reads `link`/`links`) → every mobile submission failed. Fixed. Dead token-less claim removed.
- Brand UGC mobile: payout release asks first; live-link correction sends `action: reject_live_links` (was spending a draft revision).
- Chat support button `alert()` → `/help/tickets`.

### Loaders (v189, v191) — rule 35
- `GlobalLoader` = 2px violet top bar, non-blocking, same `startLoading/stopLoading` API; finish animation now plays. New `ColdStartSplash` only while `AuthContext.loading`.
- Button actions (Brand/Creator Settings save, OTP, logout session, logout others, edit save; AddCollab submit; Instant UGC approve) use `useBusy` + `<ButtonSpinner />` instead of the global loader.
- Skeletons (`ContentSkeletons.jsx`): Explore grid, Campaign Detail, Deal Detail, Uploaded Collab, Creator Profile, Creator Public View.
- "Loading states" section in `ARCHITECTURE.md` = the rule for every new feature.

### Mobile chat bubble + upload (v190)
- Text bubble had fixed `width: 302` → fits the message (max 78%).
- Chat upload mirrors desktop (broad UGC detection + order-id fallback, same payload). Upload sheet: "Upload video" / "Drive link" tabs; >50 MB explains and switches to link.

### OTP + inbox reliability (v192)
- Mobile UGC sign: OTP never shown on screen (only test mode + email NOT delivered, like other screens); full registered email shown.
- Server keeps the last 2 unexpired codes valid on re-send (`prevHashes`) — the code in the first email still works; attempt limit shared.
- `ephemeralStore`: when the shared-table write fails (e.g. no service-role key → RLS refuses), `get()` falls back to this instance's memory for that key (was "No active verification request found").
- Layout had a hidden 30 s full-inbox poll (`"/chat/v2/threads"` with a leading slash, missed by the old guard) → removed; badge = `/chat/v2/threads/count` → `{ count, unread }`.
- Inbox (desktop + mobile): 45 s timeout, 3 tries with backoff, "Retry now", auto-retry on focus/online/20 s (was: one try, empty until manual refresh).
- `/chat/v2/threads`: same-user in-flight share + 5 s cache; any successful non-GET request clears it.
- All 6 sockets: `["websocket", "polling"]` + `tryAllTransports` (was websocket-only). Chat.jsx list refresh bypasses the 10 s client cache.

### Creator mobile screens (v193) — design "Creator Complete Mobile UI"
- Already built: onboarding, home, UGC (claim/explore/manage/workspace), chat, inbox, notifications, earnings, profile.
- NEW (presentation only; desktop page keeps data + handlers via `if (isMobile) return …`):
  - `CampaignsListMobile` — C01 Live + C05 Closed/empty (Closed = my-applications no longer live).
  - `CampaignDetailMobile` — C02 + C03 apply sheet + C04 sent. Same checks + `POST campaigns/apply`; desktop KYC gate kept.
  - `DealsMobile` — D01 Applications / Ongoing / Completed from `GET collabs`; deals open their chat.

---

## 2. Still open

### Ravi — now (testing)
1. Test on the **Cloud Run URL**, not AI Studio preview. Cloud Run: **min instances 1, max instances 1, CPU always allocated, session affinity ON**.
2. Cloud Run env: `SUPABASE_SERVICE_ROLE_KEY` set; Resend key + verified sender domain working (test mode showed "couldn't send the email").
3. If the inbox is still slow: send the Cloud Run log line `[GET /chat/v2/threads] slow: …`.
4. Test list: live sync both sides (accept / revision / sign); inbox loads first time; mobile chat upload + Drive link; mobile UGC live link; OTP (mail code works, code not on screen, full email); mobile Campaigns → apply → Sent → Deals; admin mobile payout release; receipts show server fee/GST.
5. When videos play for both sides → tell the Supabase Claude **"videos play"** → buckets private.

### Supabase Claude — prompt was given in chat
1. Delete `test_1790138686308`; demote `dev-admin-id-12345` (admin@ybex.io) to creator; delete sessions of the dev-* accounts. Keep dev@ybex.io / nexus_brand@ybex.io until launch.
2. Drop ALL policies + ensure RLS ON: creator_wallets, creator_payment_methods, gst_invoices, invoices, invoice_billing_profile, invoice_clients, escrow_ledger, platform_settings, collabs, content_submissions, deal_offers, live_proofs, creator_reviews, creator_campaign_matches, campaign_performance, message_flags, user_violations, verifications, reports, manual_overrides, team_activity_logs, waves, admin_message_dispatch_log, blocked_message_attempts, saved_creators, creator_analytics_history, support_tickets, ticket_messages; `app_versions` only the "admin_manage" policy.
3. SELECT-only (no write policy): campaigns, campaign_applications, banners, creator_portfolio_items, platform_fee_config.
4. Final report: no anon/public ALL/INSERT/UPDATE/DELETE policy with `qual = true` left.

### Claude (code) — no decision needed
1. **Campaign (non-UGC) cancel refund** — only UGC cancel refunds automatically. Money gap → do first.
2. Move the 5 browser reads (campaigns, campaign_applications, banners, creator_portfolio_items, platform_fee_config) to the API, then drop their SELECT policies (`campaign_applications` is readable by anyone today).
3. Desktop ChatBox → import `dealState.js` (one copy of the flags), then the ChatBox.jsx split — step by step with browser testing.
4. Multi-instance before launch: socket.io Redis/Postgres adapter; stop relying on local `db_mock.json`.
5. Small: dead `supabase.auth.getUser()` path in `BrandPayments.jsx`; "Request changes" quick chips (design); remaining top-bar page loads (Settings initial load, UGC Browse / Earnings / Payments) could get skeletons.

### Ravi's decisions
1. **Creator mobile bottom nav:** keep Profile (only mobile entry to Settings/KYC/Help/Refer) or switch to Deals as in the design?
2. **Campaign create (desktop + mobile):** sends hardcoded Do's/Don'ts, auto hashtags, `brand_type: "Verified"`, and never saves `barter_description`. Fix in both?
3. From before: promo codes (brand payment or platform fee?); company legal name + contract jurisdiction; burned-in ffmpeg watermark yes/no.

### Design items not built (told Ravi)
Bookmark / saved campaigns, "N of M slots filled", "brand replies within 2 days", match %, infinite scroll, full filter sheet (search + niche chips instead), KYC-pending apply (desktop blocks it), separate D02–D04 screens (handled in chat).

---

## 3. Launch day (public) — in this order
1. Rotate the Supabase service-role key (old one exposed by the removed `/api/admin/run-sql`) → Cloud Run.
2. Rotate Razorpay key secret and Resend API key → Cloud Run.
3. `PAYMENTS_TEST_MODE=false` (test mode accepts fake payments and can show OTP codes).
4. `DEMO_LOGIN` and `DEMO_SEED` NOT set.
5. Supabase → Authentication: sign-ups OFF (app doesn't use Supabase Auth).
6. Confirm the 4 private buckets and that no anon "allow all" policies are left; delete dev@ybex.io / nexus_brand@ybex.io test data.
7. Multi-instance items (open list #4) done, or keep max instances = 1.
8. Smoke test as in "Ravi — now" + one real ₹1 payment.

## 4. Env variables (Cloud Run)
Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `APP_URL`.
Optional: `RESEND_FROM_EMAIL` (default `Ybex <noreply@ybexmedia.in>` — domain must be verified in Resend), `MEDIA_KEY_SECRET`, `GEMINI_API_KEY`.
Launch: `PAYMENTS_TEST_MODE=false`. Never in production: `DEMO_LOGIN`, `DEMO_SEED`.

## 5. New files this session
`backend/`: `threadSync.ts`, `authLookupCache.ts`.
`src/lib/`: `chatSync.js`, `useBusy.js`.
`src/utils/`: `orderSort.js`.
`src/components/`: `chat/dealState.js`, `layout/ColdStartSplash.jsx`, `common/ButtonSpinner.jsx`, `common/ContentSkeletons.jsx`, `campaigns/mobile/CampaignsListMobile.jsx`, `campaigns/mobile/CampaignDetailMobile.jsx`, `deals/mobile/DealsMobile.jsx`.
Rewritten: `layout/GlobalLoader.jsx`, `chat/mobile/MobileEscrowSheet.jsx`, `chat/mobile/MobileUploadSheet.jsx`.
Tests: `backend/session23.test.ts`, `src/components/chat/mobile/mobileChatActions.test.js`, `src/components/mobileAudit.test.js`, `src/components/common/loadingStates.test.js`, `src/components/campaigns/mobile/creatorMobileScreens.test.js`.

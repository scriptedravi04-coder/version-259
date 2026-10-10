# Ybex — Session 24 Summary (start the next session from here)

**Latest zip:** `version-206.zip` (built on Ravi's version204) (= v196 code + docs). Built on `version-194`.
**Language:** Ravi writes Hindi/Hinglish — reply the same way.
**State:** 580 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean.
**Protected changes:** `ARCHITECTURE.md` table now **40 rules** (36–40 new this session).

## Done in session 24 (creator mobile audit → fixes)
- **Mobile notifications crash** (rule 38): `/creator|brand/notifications` rendered `<notif.icon />` with no icon → crashed on the first notification. Now uses the working inbox screen (mark one / all read, plain text, back button, error + retry; only in-app links followed).
- **Payout account** (rule 36): nobody (desktop or mobile) could add UPI/bank — the form was never shown; GET read only local JSON and returned the full account number. Server now validates (`backend/payoutMethods.ts`), reads Supabase first, returns `account_last4` only. Mobile `PayoutMethodSheet`; desktop header button opens `AddPaymentMethod`.
- **Payout request** (rule 37): server now checks owner + approved + escrow + not released (anyone could flip any tx to PROCESSING, even RELEASED). Eligible deals: no invented ₹5,000 / 85%, paid/unfunded removed. Mobile `PayoutRequestSheet` (was a dead button); desktop "Request Payout" was only a toast → opens the real per-deal request. Desktop `amount * 0.9` fallbacks removed.
- **Mobile chat / UGC** (rule 39): decline revisions (was `() => {}`), order-linked support ticket (shared `chat/orderTicket.js`, desktop modal uses it too), UGC workspace decline + cancel claim (unsigned only) + declined-state card; invented ₹5,000 UGC payout fallback removed; hardcoded "SEPTEMBER 2026" month removed.

- **UGC brief paid but refused** (rule 40, from Ravi's screen recording): verify wrote an unlinked local transaction for the order, then POST /ugc/briefs counted it as "already used" → 409, brief not created, money taken. Check now counts only rows that fund something; the unlinked row is replaced. Clients keep the paid order and retry without a second charge.

## Still open (new)
1. **Referral link never matches** the server's code check (desktop + mobile), and mobile Refer never calls `referral/stats`. Needs one code format on both sides.
2. Home → `/creator/ugc?orderId=` opens the workspace with the RAW order (not mapped) — stage/payout/new flags missing there (`CreatorUGCMobile.jsx` ~line 559).
3. `POST /notifications/:id/read` has no owner check (any user can mark any notification read).
4. Payout request is deal-only; UGC orders pay through their own flow (not in eligible list).
5. Decisions: creator cancel of a SIGNED UGC order on mobile? Sign an unsigned reservation on mobile?
6. From session 23 list: campaign (non-UGC) cancel/refund (needs the refund-amount decision), browser reads → API, multi-instance.

## New files
`backend/payoutMethods.ts` (+ test), `src/components/chat/orderTicket.js`, `chat/mobile/MobileOrderSupportSheet.jsx`, `payments/mobile/PayoutMethodSheet.jsx`, `payments/mobile/PayoutRequestSheet.jsx`, `src/components/session24Mobile.test.jsx`.

## Planning done late in session 24 (nothing built)
- **Phase 2:** "Approve claimer" mode. Ravi saved the full handoff note himself; ask him to upload it.
- **Phase 1 queue:** KYC-only UGC claim; deadline options (24/48/72h, `delivery_hours` on the brief); guarantee/process info before pay; creator card after claim (Claude Design brief written); explainer pop-ups (English copy written; brand pop-up opens on **Create brief**, creator info goes on the D03 OTP page); first brief free/cheap (not discussed).
- **Found in review:** revision count differs (server claim 5, design 2, mobile fallback 3); briefs show "Completed" with Recruited 1/2 or 1/6 → check whether unused slots' money is stuck.
- **Being built by another tool:** deadline reminders + expiry + relist + brand cancel/refund queue. Spec: `docs/prompts/UGC_DEADLINE_RELIST_REFUND_SYSTEM.md`. Message copy in §10 of that file needs Ravi's approval first.
- **CLAUDE MUST REVIEW** that build when Ravi brings it back: use the checklist at the end of that file.

## Ravi's decisions (end of session 24)
- KYC-only UGC claim: all 6 points approved (server + UI; pending KYC can view not claim; no-KYC → KYC screen; old orders untouched; "Only KYC-verified creators" badge).
- Deadline options Express 24h / Standard 48h / Relaxed 72h, default 48h, first draft only: approved. Landing/marketing "24h UGC" text stays as is.
- Deadline-system decisions approved (quiet hours 10pm–8am IST, max 6 reminders, cancel only open slots, manual refund).
- **Refunds are paid manually by Ravi from the company bank account, not via Razorpay.** Brand needs a refund account (UPI/bank); admin marks refunded with UTR. Prompt file updated.
- Relist bonus → Phase 2.
- Dispute review time: **24–48 hours** (copy: "Ybex reviews it within 24–48 hours").
- Revisions: **3** for every UGC order → server claim `revision_count: 5` → 3, mobile fallback 3, D02/D03 designs "Up to 3", agreement text.
- Refund account: at cancel the brand chooses **UPI or Bank**; admin sees it like the creator payout view (prompt file updated).
- §10 messages approved; subjects made more urgent (prompt file updated).
- Usage rights → later, together with the brand + creator agreement update (Ravi will do both agreements next).
- First-brief offer: **none** (no funding; platform fee is not charged to brands).
- Watermark: exists as a UI overlay ("Ybex Protected Draft") + download disabled until approval + private-bucket signed URLs (15 min). NOT burned into the file — see Claude's note to Ravi; burned-in ffmpeg watermark still an open decision. Needs buckets actually private ("videos play" step).
- **Phase 1 planning is complete.** Next: final plan document (what Claude builds vs other tool, order).

## Phase 1 — built by Claude (v201), rules 41–45
- KYC-only UGC claim (server + mobile + desktop, brand badge). Fixed the campaign KYC gate (wrong column → let everyone through).
- Deadline options 24/48/72 (default 48) on both brand post flows; claim uses it; timers/texts use it. 3 revisions everywhere.
- Creator stats API + `CreatorClaimStats` in brand claim views (desktop modal, mobile sheet); fake mobile "Accept" removed.
- "Good to know" card on both agreement/OTP screens; revisions term updated; desktop Hinglish footer → English.
- Bugs: deep-link raw order; premature brief COMPLETED (1/2); referral code never matched + assumed reward; notification read owner check; invented ₹2,000/₹5,000 amounts.
- **Ravi must run on Supabase:** `scripts/sql/ugc_delivery_hours.sql` (before deploy), review `scripts/sql/find_wrongly_completed_briefs.sql` (reopen affected briefs).
- Refer screens now show no amount until `referral_config` has one (Ravi decides the reward).
- Still for Claude Design: brand explainer pop-up, creator card look, Good-to-know card look. Agreements (usage rights, payout timing "48h", "6 months" rights text) → Ravi's agreement update.
- Other tool: deadline reminders / relist / refund system (prompt file); Claude reviews it after.

## v202 — Claude Design screens implemented (rule 46)
- Brand explainer "Your money stays safe" (mobile sheet / desktop modal), first open of the post flow + "How it works". Escrow shown to users as **Ybex SafePay**. 4th point = "100% refundable" (Ravi) — **depends on the other tool's cancel/refund build**; don't launch before it works.
- Designed `CreatorCard` in: desktop claims modal, mobile claims sheet (Manage → opens that order), mobile + desktop order pages (chat → the order's thread; support moved to "Need help with this order?").
- Good-to-know card copy uses SafePay wording. Prompt file §10 copy aligned; §10b notes the refund promise.

## v205 — review of Ravi's version204 (Gemini build of the deadline/refund system + other tools)
- **Removed admin backdoors** (rule 48): master password 123456789 for admin emails, six seeded admins, plain-password store, Supabase-Auth fallback. Re-applied login hardening (tokens, lockout, exact email, bcrypt upgrade, response scrub). db_mock.json cleaned.
- **Deadline/refund system fixed and finished** (rule 49): cron now `POST /api/internal/cron/ugc-deadlines` (header `x-cron-secret`); expiry race; quiet hours deferral; refund queue for expired slots on cancelled briefs; cancel quote + lock + conditional update; admin process/fail guards; FAILED → PENDING on account update; refund status chip on all brand brief cards (desktop Instant UGC got the cancel button); broken `../ButtonSpinner` imports (build was failing); EXPIRED stage on creator desktop; expired orders hidden on creator mobile.
- `/market-intelligence/*` now needs sign-in (admin-only for search/audit/verify/trending).
- **Ravi must:** run `scripts/sql/ugc_deadlines_relist_refunds.sql` (now with the unique index + delivery_hours + status-constraint note); set Cloud Run env `CRON_SECRET`, `ADMIN_ALERT_EMAIL`, `APP_URL`; create Cloud Scheduler job every 15 min → `POST https://<cloud-run-url>/api/internal/cron/ugc-deadlines` with header `x-cron-secret: <CRON_SECRET>`; set admin password with SQL `crypt('<strong>', gen_salt('bf',10))`.
- WhatsApp stays off until Meta templates + opt-in exist (email + in-app work without it).

## v206
- **Strict rule (Ravi, rule 50):** claim only with OTP signature; timer starts at signing, desktop + mobile. Legacy accept path closed; legacy sign route now checks KYC and starts the timer.
- **Phase 2 list (final):** Approve-claimer mode · relist bonus · WhatsApp (opt-in, templates, API — costs money) · platform numbers before pay · ffmpeg watermark in the file.
- **Waiting for Ravi's "haan":** creator self-cancel of a signed order (design given in chat: before first draft only, reason chips, warning, no refund, slot relisted at top, counts on profile, 1-hour grace period default) + route brand single-order cancel to the manual UGC Refunds queue (the old cancel route auto-refunds via Razorpay and doesn't relist — must change).
- Next free item after that: admin dispute queue with a 24–48h timer.

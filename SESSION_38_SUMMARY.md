# Ybex — Session 38 Summary → START SESSION 39 FROM HERE

**Latest code:** `version-258.zip` (contains everything up to v258).
Ravi writes Hindi/Hinglish → reply in Roman Hinglish; app text is English.
**State:** 1014 tests (1013 pass + 1 skipped on purpose), tsc, crash guard, vite build, protect check clean.
**Rules:** ARCHITECTURE 1–79 (78 = admin money + permissions, 79 = moderation/pitches in Supabase, payout after approval, generated numbers creators-only) + PHASE 2 list.
**Working rule:** discuss first, build after Ravi says "banao"/"start". Locked files only with Ravi's written OK → logged in PROTECTED_CHANGES.md.
**Landing page:** never change anything except what Ravi names (session 38 did not touch it; its leaderboard still has made-up names).

## 1. RAVI — TO DO NOW (in this order)
1. Deploy **v258** (includes v257, v256, v255). `npm ci` as usual (no new packages in v257).
2. Supabase: run **`scripts/sql/session36.sql`** (if not done yet) then **`scripts/sql/session38.sql`** (4 markup columns) and then **`scripts/sql/session38_part2.sql`** (new tables chat_moderation_events + pitch_lead_admin). All only add.
3. Cloud Scheduler jobs from session 37 (onboarding-reminders daily, email-queue hourly) if not done yet.
4. Cloud Run: make sure `DEMO_LOGIN` and `DEMO_SEED` are NOT set.
5. If you have sub-admins: Admin → Users → that person → Permissions → tick their areas (payouts/refunds = "Escrowable Payments"). Without ticks a sub-admin now sees only the dashboard.
6. Test on phone/desktop:
   - Creator saves UPI in Earnings → Request payout → Admin dashboard "Creator Payout Requests" card → Payments → Payment Requests shows it with the UPI → Mark paid with UTR → try Mark paid again (must refuse).
   - Admin refund: more than paid (must refuse); on a paid-out deal (must refuse).
   - Dashboard "Escrow secured" drops after a payout.
   - KYC approve one request.
   - Help Desk dot lights up with an open ticket.
   - Campaign applicant without photo shows initials.
7. Everything from SESSION_37_SUMMARY section 1 (animations etc.) still applies.

## 2. BUILT IN SESSION 38 — admin audit fixes (v257)
Ravi: "PHELE YE SAB THEEK KRO" (list from the admin audit).
- Payout modal shows the creator's saved UPI/bank (`creator_payment_methods`); Earnings payout requests appear in Payment Requests.
- Money checks: no double payout, no payout of refunded money; refund ≤ paid, not after payout, not twice, 404 for unknown payment, errors no longer "success".
- "Escrow secured" excludes paid-out / refunded money.
- KYC approve: only that request; save errors shown to admin (502 KYC_APPROVE_SAVE_FAILED).
- Fresh store has no demo users / fake violations; `db_mock.json` shipped empty (old test data + brand emails removed).
- AI Auto-Moderation fake switch + popup removed.
- Brand/agency markup %s stored in Supabase (`platform_fee_config`, cached 1 min). PUT /admin/settings is full-admin only. No screen edits them yet.
- Help Desk badge counts OPEN / IN PROGRESS. Pending counts add payout_requests, ugc_refunds, referral_withdrawals (Payments dot).
- Dashboard To-do: 3 new cards (payout requests, UGC refunds, referral withdrawals) with deep links (`/admin?tab=escrow&view=requests`, `view=ugc_refunds`, `tab=settings&view=referrals`).
- Admin lists read past Supabase's 1000-row limit (stats, chart, transactions, escrow overview).
- Sub-admin gate for every /admin route.
- Initials instead of stock photo: ApplicantCard, mobile campaign applicant view, Leaderboard (`PersonPhoto.jsx`).
- Locked file changed: `backend/payment_routes.ts` only (logged).

## 2b. BUILT IN SESSION 38 PART 2 (v258)
Ravi: "YE SAB BANAO OR MANG NAHI SAKTA H VOH HATAO ... FAKE VIEWS VALE REHNE DO ... only creators dekh paye".
- Chat moderation → Supabase `chat_moderation_events` (record on block/profanity; Admin Chat, Reports, user violations panel, mark safe). Account wipe deletes them.
- Admin → Chat "all chats" from Supabase with names.
- Pitch Leads + sidebar pitch count from Supabase `brief_requests`; admin status/notes in `pitch_lead_admin`.
- Settings → Referrals activity from Supabase with names.
- Payout: creator can request (Earnings) or nudge (chat) only after brand approval (COMPLETED/APPROVED). PROOF_SUBMITTED removed.
- Generated views/applied/faces: creators only. Brands/agencies/admins see real applied count, real photos, no views number (not tracked yet). Brand home mobile, campaign list, campaign detail.
- "Flagged messages" list (`/admin/chat/flagged`) stays empty: nothing in the app creates flags (users report through Help Desk).
- Locked files changed (logged): `chat_routes.ts`, `payment_routes.ts`.

## 3. OPEN — ask Ravi
- Brand markup +2% (agency +5%) is added to creator rate cards brands see. Keep it? Add a field in Platform Settings?
- Brand markup explained to Ravi in session 38; waiting for his decision (keep / change / remove, and whether to add a field in Platform Settings).
- Admin email alert on payout request / new KYC (suggested, not picked yet).
- Phase 2 list unchanged (see SESSION_37_SUMMARY section 3).

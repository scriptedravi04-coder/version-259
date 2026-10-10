# Ybex — Session 35 Summary → START SESSION 36 FROM HERE

**Latest code:** `version-244.zip`. Ravi writes Hindi/Hinglish → reply the same way; app text is English.
**State:** 951 tests pass (1 skipped on purpose); `tsc`, crash guard, `vite build`, protect check clean.
**No locked file changed** (AGENTS.md / `scripts/protectedFlows.mjs`). Locked-file gaps were closed with database columns instead.
**New rule:** ARCHITECTURE 76 — only real database columns.

## 1. Supabase (session 35)
Done: health check, `onboarding_progress`, `user_consents` + `waitlist.terms_accepted_at`, Aadhaar read-only check, Session 31 Prompt 1.
Pending (all in `docs/prompts/SESSION_35_SUPABASE_PROMPTS.md`, section STATUS):
1. Ravi deletes 3 KYC files from public `cover-images` + bucket `banner-images` (Dashboard).
2. Prompt 5 — KYC cleanup (two orphan `creator_kyc` rows of deleted accounts, 1 reset token).
3. Prompt 6 — `scripts/sql/session35_schema_fixes.sql` (missing columns). Safe before or after deploy.
4. Prompt 7 — Session 31 Prompt 3, LAST.

## 2. Why: code vs live schema (checked all 62 tables)
All tables / buckets exist. ~87 places used columns that do not exist → the whole write failed, mostly silently.

## 3. Fixed in v244 (code)
- **Apply form `/apply` + admin Approve** (`creatorApplication.ts`): only real columns (`onlyColumns`), waitlist id = uuid. Before: every application failed ("Could not find the 'bio' column"); approve failed too. Test fake now rejects unknown columns.
- **Mobile KYC upload** (`CreatorMobileProfile.jsx`): PAN / UPI QR → private `kyc-documents` (were going to public `cover-images`).
- **Brand dashboard**: `/brands/me/deal-stats` (deals.id) and `/brands/me/application-stats` (no applied_at) — both were always empty. Agency save → `brand_profiles` (was 502 on users).
- **Admin**: Warn (was 500), Reinstate, KYC approve/reject `verified`, creator edit (profile + users + waitlist via linked_user_id), waitlist list joins, reject.
- **Notifications**: mark read / acknowledge (`notif_id`), admin broadcast + version broadcast inserts, notification email lookup.
- **Others**: report user (real `reports` columns), UGC deadline chat notes + reminder user lookups, blog related posts, referral config/insert, helpdesk names, brand public page lookup, admin dashboard live budget.

## 4. Fixed by Prompt 6 (database) — needed by LOCKED code
Creator payout details save (was 502) · creator "Request payout" (was 502) · admin "payout paid" on UGC orders · "N creators match" (was 500) · brand city / state / agency type · users dob (creator onboarding users update) · campaign / invite notifications (id, link, data).

## 5. Open — discuss with Ravi first
- Legacy `/public/creators/apply` (no page calls it; creates verified profiles with invented numbers) → suggest switch off.
- Lead merge, market intelligence, session device list, `ybex_sync` — fixing changes data behaviour.
- KYC payout mirror to `creator_profiles` stays failing on purpose (public table; no bank columns added).
- Older open items from session 34 (fee model, chat socket, brand bank/UPI, CA answers …) unchanged.

## 6. Ravi to test after deploy + Prompt 6
Apply form on phone → admin Approve → Explore · creator saves UPI/bank in payouts · creator Request payout · brand dashboard counters + "new applicants" · admin Warn / Reinstate · notification mark read · mobile KYC PAN upload (file must land in kyc-documents).

## 7. v245 (same session)
- `/messages/:id` → `/chat/:id` redirect (campaign notifications link to /messages/…; after Prompt 6 those notifications are saved, so the link must open).
- Creator mobile audit vs `Creator_Complete_Mobile_Ui_dc.html` — gaps listed for Ravi (not built): /creator/kyc and /kyc/status open desktop pages on phone; bottom nav has Profile instead of Deals; no Notifications row in Profile → Account; chat payout card shows no UTR; "escrow" wording + help text "zero commission" / "released automatically in 48–72 h" on creator mobile screens (false claims).

## 8. v246 (same session, Ravi's list)
1. KYC on phone: `/creator/kyc` and (creators) `/kyc/status` → mobile KYC screen (`/creator/settings?section=kyc`). Same submit handler as desktop (`/verifications/creator` = `/creator/kyc/submit`).
2. Bottom nav: unchanged (Ravi).
3. Notifications row in Profile → Account: desktop has no notification-settings page and there is no backend for preferences (only the "Offers and promotions" switch in Privacy & Terms) → not built.
4. Chat payout card (mobile) shows the UTR from the payout message (`metadata.utr_number`, same source as desktop SystemMessage).
5. Creator help FAQ rewritten (no "zero commission", no "released automatically"); KYC "within 2 hours" removed. "Zero commission" on creator Home, TrustBadgeRotator, Campaigns, Refer → "Free to join — no listing fees". DealDetailDrawer "auto-releases instantly" → released after the brand approves.
6. "Escrow" removed from every user screen (~150 strings, brand + creator, desktop + mobile). Admin screens and message-matching strings unchanged. 3 locked files text-only, logged in PROTECTED_CHANGES.md.
Landing page: NOT touched (Ravi: "landing page pr kuch bhi changes nahi krne hai") — Landing.jsx restored to the v243 file. Brand payments dispute text: 24 → 30 hours (Ravi). Contract clause 2.3 "released automatically": wording proposed, waiting for Ravi OK.

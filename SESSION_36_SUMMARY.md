# Ybex — Sessions 35 + 36 Summary → START SESSION 37 FROM HERE

**Latest code:** `version-255.zip` (contains everything from v244–v255).
Ravi writes Hindi/Hinglish → reply the same way; app text is English.
**State:** 981 tests (980 pass + 1 skipped on purpose), tsc, crash guard, vite build, protect check clean.
**Rules:** ARCHITECTURE 1–76 (+76 "only real database columns") + PHASE 2 list (incl. "Phase 2 additions, session 36").
**Working rule:** discuss first, build after Ravi says "banao"/"start". Locked files only with Ravi's written OK → logged in PROTECTED_CHANGES.md.
**Landing page:** never change anything except what Ravi names (only the word escrow was changed, on his OK).

## 1. RAVI — TO DO NOW (in this order)
1. Deploy **v255**.
2. Supabase: run **`scripts/sql/session36.sql`** as one migration (new tables/columns only):
   onboarding_reminders · email_broadcasts / email_broadcast_recipients / email_unsubscribes ·
   platform_fee_config offer columns (offer_mode, offer_fee_pct, offer_label, offer_promo_line, offer_line_until) ·
   coupons.auto_apply · referrals.referred_email · referral_config reward columns · referral_reward_uses · referral_withdrawals.
   (session35_schema_fixes.sql is already applied.)
3. Google Cloud Scheduler (copy the UGC-deadline job, change the URL; header `x-cron-secret: <CRON_SECRET>`):
   - `POST https://ybexmedia.in/api/internal/cron/onboarding-reminders` — daily 10:00 IST
   - `POST https://ybexmedia.in/api/internal/cron/email-queue` — hourly
4. Admin account needs a **password** (Forgot password) — the fee-offer toggle asks for it.
5. Supabase (Ravi's Supabase Claude): 15-day video cleanup — dry-run first, "haan" only after v248+ notice is live; bucket size limits (images 5 MB, kyc 10 MB, videos 200 MB); NULL video URLs only for finished orders.
6. Test on phone: /apply → admin Approve → Explore · creator UPI/bank save + Request payout · brand dashboard counters · mobile KYC/PAN · chat payout UTR + 15-day line · Terms v1.1 popup · Admin fee offer ON (password, promo line) → fee preview · auto-apply coupon + creator code in Earnings · test broadcast to yourself · Waitlist CSV upload · Brand Refunds card + admin Refund popup · chat (shared socket) · invite link /r/CODE → signup · contract popup "Keep more from this deal" · Explore "Featured".
7. LAST, after all works: Session 31 Prompt 7 (make `content-submissions` private).

## 2. BUILT IN SESSIONS 35–36 (short)
- v244: code vs live schema (~87 wrong columns) — apply form + approve, admin tools, notifications, brand stats fixed; missing columns via SQL (locked code untouched); mobile KYC → private bucket; Aadhaar data purged.
- v245–v248: /messages redirect; creator mobile KYC → mobile screen; UTR on mobile payout card; help-text claims fixed; "escrow" removed from user screens (admin keeps it); contract clause 2.3 rewritten; landing restored (only the word escrow changed); 15-day file rule (Terms + notices + "file removed" state); preload=metadata.
- v249: campaign refunds like UGC; chat shared socket (locked, OK); lead-merge (applications only LINKED, no auto-approved profiles); legacy apply/bulk-import closed; Admin CSV upload; onboarding reminder emails.
- v250: bulk email (strict audiences, unsubscribe, queue ≤80/day, report, retry, CTA fix); Terms v1.1 re-accept; fee offer toggle (₹0 platform fee + convenience fee, password); fee stamped at payment (option A, locked OK); creator coupons end to end.
- v251: negotiation table fixed (no fake +2% brand fee); fee preview shows coupon; promo popup.
- v252–v254: creator referral programme (3 sign-ups → 2 deals 0% fee + Featured 7 days + 20% of Ybex fee up to ₹2,000/creator; wallet, withdraw min ₹200; admin settings + investor numbers); "Keep more from this deal" popup + "What's a creator code?"; creator-code links /code/CODE; offer promo line with presets/date/preview; /r/CODE opens creator sign-up; Featured first in Explore.
- v255: one creator-code box everywhere (`CreatorCodeBox.jsx`): "If you have a creator code, apply it" → code field → Apply → small clickable "What is a creator code & how it works". After Apply: "✓ CODE applied — 0% fee · next 2 deals, till 31 Oct", saved to the account and used automatically (fee previews, contract, payment stamp) until its date / deal count. Explainer popup (`PromoHowItWorks.jsx`, UGC/referral style): what it is, where you get one (banners, our social handles, giveaways/contests, reels, someone promoting Ybex), apply once, used automatically, how long it lasts, example; small line under "Got it" → "Want to earn more like this? Check out our referral programme" (/refer).
- Docs: marketing brief (Claude Doc + PDF "Ybex App Summary for Marketing").

## 3. OPEN / PHASE 2 (see ARCHITECTURE.md)
Fee Option B (all-inclusive brand price) · 72 h auto-approval (then contract line) · promo email system + notification settings · videos to Cloudflare R2 (when storage > 700 MB, egress > 3.5 GB/month or > 20 UGC orders/week) · brand coupons (needs Option B) · brand referral · CA: TDS/GST on referral rewards and receipts · company registration details in Terms · lawyer review when possible · market-intelligence / ybex_sync columns (left on purpose) · DPDP paperwork · delete account / download data.
Not to build: Pay & hire, Fund all / Nudge, Chat before accept.

---
# Detailed log (session 36)
## Done (Ravi OK in chat, 7 Oct)
1. **Contract clause 2.3** (AgreementSign + BrandAgreement, screen files): "released automatically" and the 48-hour Ybex-disburses line removed. New: "2.3 Payment Release: The agreed fee is kept in a secure payment hold. After the Brand approves the delivery (and the live content link, where one is required), Ybex sends the Creator's payout, less the Ybex service fee shown before signing, to the Creator's registered bank account or UPI ID, usually within 48–72 hours." Already-signed contracts are not changed. (Add the 72 h auto-approval line only when that feature is built — Phase 2.)
2. **Landing page:** ONLY the word escrow → secure payment hold (6 lines). Calculator, "0% Commission", design and every other word untouched (Ravi: hath bhi nahi lagana — except this word).
3. **15-day file rule** (`src/lib/fileRetention.js` = one source: RETENTION_DAYS, availableUntil, retentionLine, APPROVE_NOTICE, FILE_REMOVED_TEXT):
   - Terms (legalContent.js): Creator "Delivered files", Brand "Downloading delivered files", Privacy "Delivered video and image files: 15 days…".
   - Brand approve popups: BrandUGCOrders (4), BrandUGCMobile (3), desktop chat ContentProofNotice (2), mobile chat MobileDeliverableCard.
   - After approval: mobile deliverable card (both roles), BrandUGCOrders approved panel, creator ManageUGCOrdersView approved panel.
   - Payment released: creator + brand payout card (mobile MobilePayoutCard, desktop SystemMessage) — "available to download until <payout date + 15 days>".
   - Missing / deleted file: VideoEmbedPreview and mobile deliverable card show "This file is no longer available…" (+ "ask for it to be uploaded again" while in review) instead of a broken player.
4. **Egress:** preload="metadata" on the 3 video tags that had none.

## Supabase (Ravi's Supabase Claude)
15-day cleanup prompt (option B, dry-run first, old cleanup-content-submissions removed) — given in chat, session 35 end. Order: dry-run → deploy v248 → Ravi "haan" → schedule nightly. NULL video URLs only for finished rows. Bucket limits: images 5 MB, kyc 10 MB, video buckets 200 MB (never 2 MB).

## Still open (Ravi decides)
Fee model (Option B) · chat socket · brand bank/UPI · legacy /public/creators/apply · lead-merge / market-intelligence / ybex_sync columns · videos to Cloudflare R2 (plan first) · Terms version bump + re-accept (Phase 2).

## Ravi to test after deploy
Approve a UGC draft (popup shows the 15-day line) · payout released card shows the date (creator + brand) · open an order whose video was deleted → "no longer available" message · Terms pages show the new lines · landing page looks exactly as before except the word.

---
## v249 (Ravi said "start") — 966 tests (964 pass + 1 skipped), tsc, crash guard, build, protect check clean
1. **Campaign refunds like UGC** (`backend/campaignRefunds.ts`, no locked file): admin Refund popup shows the brand's refund account (or "Ask brand to add it"); UTR saved with the existing `/admin/transactions/:id/refund`; brand notified; brand Payments (desktop + mobile) "Refunds" card with status, UTR and the refund-account form (same `brand_refund_accounts` row as UGC).
2. **Chat socket shared** (Ravi "OK", logged in PROTECTED_CHANGES): ChatBox, useChatThreadMobile (locked), BrandUGCOrders, ManageUGCOrdersView use `acquireSocket` (one connection per tab). sharedSocket: a screen without a user id reuses the open connection.
3. **Lead-merge** (`services/leadMergeService.ts`): real column names for every move (deals, chat_messages sender/receiver_user_id, transactions creator_id, brief_requests, collabs, waves); claimed profile keeps its own review state; **a pending/rejected applicant who signs up is only LINKED (waitlist.linked_user_id) — no auto-approved profile with invented numbers** (rule 72). Test updated for that.
4. **Legacy routes closed** (`public_creator_routes.ts` → 410) + **Admin → Waitlist → Upload CSV** (`waitlistCsvImport.ts`, `WaitlistCsvImportModal.jsx`, POST `/admin/waitlist/import-csv`): preview, row errors, duplicates, Pending rows only, nothing invented, no emails to imported people.
5. **Onboarding reminder emails** (`onboardingReminders.ts`, `emailLinks.ts`): 24 h and 72 h after the last saved step, max 2, signed "Stop these reminders" link + List-Unsubscribe header, ≤80 per run. Cloud Scheduler → `POST /api/internal/cron/onboarding-reminders` (header x-cron-secret). Table `onboarding_reminders` in `scripts/sql/session36.sql`.
Next (v250): bulk email tool (unsubscribe, audiences, report, queue, CTA button bug), Terms re-accept v1.1, convenience-fee offer toggle with password, coupons end to end, final Supabase prompt.

---
## v250 — 974 tests (973 pass + 1 skipped), tsc, crash guard, build, protect check clean
1. **Bulk email** (`backend/emailBroadcasts.ts`, `BroadcastReport.jsx`): strict audiences (creators / brands / agencies / unclaimed creators / everyone); never banned, deleted, unsubscribed, CSV-imported, rejected or fake; Unsubscribe link + header (`/api/public/unsubscribe`, signed); "Send" queues; ≤ 80/day (`BROADCAST_DAILY_LIMIT`), rest next day via Cloud Scheduler `POST /api/internal/cron/email-queue`; per-recipient report + Retry failed; CTA button bug fixed. Old route removed from admin_users_enforcement_routes.ts.
2. **Terms v1.1 re-accept** (`TermsUpdateGate.jsx`, `LEGAL.termsChanges`, backend TERMS_VERSION 1.1): one-time "We've updated our Terms" for creators/brands; saved in user_consents; Terms pages, logout stay open; admins skipped. Terms text: convenience fee line.
3. **Fee offer toggle** (`backend/feeOffer.ts`, `FeeOfferToggle.jsx`): "₹0 platform fee + convenience fee" (default 2%, 0–15%), full admin + own password (server-checked, 5 tries / 15 min), logged. Public `/platform/fee-config` carries the offer rate so every fee preview shows the real fee; label "Convenience fee".
4. **Option A — fee fixed at payment** (`backend/stampedFee.ts`): release (campaign_lifecycle, ugcLifecycleService) and payout fallbacks use the fee stamped on the transaction when the brand paid. Toggle/coupon changes never alter funded deals. Locked: feeCalculator.ts, payment_routes.ts, campaign_lifecycle.ts — Ravi's OK logged.
5. **Creator coupons end to end** (`backend/creatorCoupons.ts`, `CreatorPromoCode.jsx`): admin "Apply automatically (launch offer)"; creator saves a code in Earnings; applied at payment (persistEscrowPayment), redemption row + used_count; dates, usage limit, first-N deals respected. Brand coupons → Phase 2 (Option B).
6. **SQL**: `scripts/sql/session36.sql` (onboarding_reminders, email_broadcasts, email_broadcast_recipients, email_unsubscribes, platform_fee_config offer columns, coupons.auto_apply).
Ravi: Cloud Scheduler jobs — onboarding-reminders (daily) and email-queue (every hour, or daily); admin needs a password (not only Google) for the offer toggle.

---
## v251 — 976 tests (975 pass + 1 skipped), tsc, crash guard, build, protect check clean
1. **Fee preview shows the creator's coupon**: `/platform/fee-config` for a signed-in creator with a coupon returns the coupon rate + label "Fee (coupon X · deal 1 of 3)" — offer cards, fee breakup and earnings previews pick it up (same numbers the payment stamps). Offer mode still wins.
2. **Negotiation table fixed** (desktop + mobile chat): no invented "+2% platform service charge" for brands (brand total = agreed amount, "Platform fee for brands ₹0"); creator side no longer promises a fee-free "Guaranteed net" — says the exact fee is on the offer card before signing.
3. **Promo code everywhere for creators**: Earnings box + "Have a promo code?" link on Explore UGC (mobile + desktop) and in the creator agreement before signing (`PromoCodeSheet.jsx`).
4. **"How promo codes work" popup** (`PromoHowItWorks.jsx`): 3 steps + rules, shown the first time, and from "How it works".
Note: if a creator has several unpaid deals, every preview shows the coupon; it is used by the deals paid first, up to its limit.

---
## v252 — referral programme + creator codes (981 tests, tsc, crash guard, build, protect check clean)
Ravi's rules: reward on SIGN-UP (or /apply); every 3 joins → next 2 deals at 0% fee (180 days) + Featured 7 days; "a fixed share of what they earn on Ybex" = 20% of the Ybex fee on invited creators' PAID deals, up to ₹2,000 per creator (small, not highlighted); withdraw min ₹200 shown only in How it works small print, Terms and the withdraw action. All numbers admin-editable (Admin → Platform tools → Referrals).
- Backend `referralProgram.ts`: /referrals/claim, /referrals/me, /referrals/withdraw, /creators/featured, admin programme/settings/list/reject/withdrawals (+ investor numbers). Rewards derived from referrals + transactions (no locked-file hooks). Fraud: self/email/phone, new accounts only (7 days), one inviter, monthly cap, admin "Don't count".
- Fee-free deals use the coupon path (creatorCoupons.ts → referral_free_deal, recorded in referral_reward_uses) and are stamped at payment.
- Links: /r/<CODE> → /signup?role=creator&ref=CODE (v253, Ravi: sign-ups wanted; inviter also kept 30 days in the browser; /apply still records it if they apply instead); /code/<CODE> → creator code saved after sign-in (ReferralClaimer).
- Creator UI: ReferralHub (desktop /refer + mobile Profile → Invite creators), KeepMorePopup on the creator agreement (desktop AgreementSign + mobile contract sheet): happy line if an offer/code/referral reward applies, else creator code + "Save ₹X on deals like this" invite; once per deal, ≤2/week, Don't show again. OfferStrip on Explore UGC. Earnings box → "Keep more of what you earn" / creator code.
- Offer toggle: promotional line + presets + "hide after" date + preview; % always added by the app.
- Explore: Featured creators first with a "Featured" label (desktop + mobile).
- Terms: creator "Referral programme" + change line. SQL in scripts/sql/session36.sql (referral columns/tables, promo line).

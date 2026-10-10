# Ybex — Session 26 Summary (start the next session from here)

**Latest zip:** `version215.zip`. History this session: **v212** (Ravi, AI Studio — built on **v210**) → v213 → v214 → **v215** (Claude).
**Language:** Ravi writes Hindi/Hinglish — reply the same way. All in-app / email / tutorial text is **English**.
**State (v215):** 714 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean.

**Rules (unchanged):**
- `npm run verify` before every zip.
- WHO + WHEN on every action.
- Status tokens = DB contract.
- A money claim in the UI must match the server; no invented amounts.
- No competitor names.
- Never edit a test just to make it pass. (Two v212 tests were updated this session because Ravi changed the invite flow — see §1.2.)

**Working rules from Ravi (session 25, still valid):**
- **Supabase work is done through prompts in chat** (Ravi pastes them to Supabase Claude and sends back the report). **Never put Supabase prompts/docs in the zip.** `scripts/sql/*` stays in the code because tests read it.
- **No new UI designs.** Build basic UI only; designs come from Claude Design. Claude Design prompts: change **inside the existing sections**, no new pages. **Admin panel redesign is separate, later.**
- **Don't show Ravi the Phase 2 list or the Launch-day list unless he asks** (both are at the end of this file).
- **New (session 26):** Ravi sometimes builds in **AI Studio** from an older version. Always check `metadata.json` ("Imported from GitHub: …") and diff against the last Claude version — v212 was built on v210 and had lost the v211 login fix.

**Protected changes:** `ARCHITECTURE.md` table now has **55 rules** (54–55 added this session). `AGENTS.md` / `GEMINI.md` tell AI tools not to undo them.

---

## 1. Done in session 26

### 1.1 What v212 contained (Ravi / AI Studio)
- UI fixes + an email-OTP fix (Ravi says done, no action needed).
- **Gated Direct Brand Invitation:** brand invites from the creator profile; invite saved as `pending_creator_acceptance`; creator sees it on the desktop dashboard "Important for you"; Review modal with Decline (reason) / Accept; chat opens only after accept.
- AI Studio gave a Supabase SQL for `brief_requests` whose step 4 was a **full-access policy for `anon`** — Supabase Claude refused it (correct).
- v212 problems found: accept **re-used and reset an older thread** to NEGOTIATING (could drag a paid/finished deal back); no `deals` row / wrong thread id; fake creator note "Ready to deliver great content…"; brand had to "Accept ₹X" its own offer; no status guards; notifications local only; invites local only; **v211 login fix missing**.

### 1.2 Direct invitation = normal campaign deal, different start (v213, rule 54 — Ravi's spec)
- **Brand:** creator profile → "Invite to Campaign" → form. **Fee required, ₹3,000+** (client + server, `INVITE_AMOUNT_REQUIRED`). Timeline "7" → "7 days". No chat opens. Can't invite yourself.
- **Creator:** "Important for you" (desktop) / invitations card (mobile, v215) → Review → Decline (left) / **"Accept & Start Negotiating"** (right). Modal note: fee is not final, a thank-you is sent for you.
- **Accept** (`POST /creators/invitations/:id/accept`, `backend/creators_routes.ts` + `backend/directInvites.ts`):
  - WHO: invited creator only (`isInvitedCreator`). WHEN: only pending; double accept → same chat; declined → `INVITE_CLOSED`; no fee → `INVITE_NO_AMOUNT`.
  - **Always a NEW `deals` row + `thread_camp_<dealId>`** (Supabase, like campaign shortlist), `agreed_amount` = brand fee, `NEGOTIATING`, revision_count 5. Rollback on error. Old threads are never touched. **Every invite = its own chat.**
  - Messages: (1) creator auto thank-you (`text`, `metadata.automated`): *Thanks for inviting me to "X"! Happy to discuss the details here.* (2) brand card `brand_invitation_offer`: *Glad to have you on board! 🤝* — fee, deliverables, timeline, brand's note only if written. **Accept / Negotiate = creator**; brand sees "Waiting for the creator's reply".
  - From here the normal campaign flow: Accept → contract sign (OTP) → escrow → content → payout; Negotiate → counter offers.
- **Decline:** only while pending; brand notified (in-app, Supabase too).
- Inbox title for invite deals comes from the invite.
- Old v212 cards (`brand_invitation_card`, `creator_invitation_acceptance`) still render for old test threads.
- Tests: `directBrandInvitations.test.ts` accept test + `directBrandInviteFlow.test.jsx` button label updated to Ravi's new flow (policy change); new `backend/session26Invites.test.ts`.

### 1.3 Bugs fixed on the way (v213)
- **Mobile "Accept ₹X" on the creator's application card (normal campaign) never worked** — called `brand-accept-counter` → 409 `NO_COUNTER_PENDING`. Now opens the contract sheet, like desktop.
- Mobile offer card invented ₹10,000 / 7 days / 1 revision → removed; mobile card now shows Countered / Accepted ✓ / Signed ✓ like desktop.
- Dead invite code in `CreatorPublicView.jsx` navigated to `/chat/<creatorId>` → removed.
- **Login (v211, re-applied):** no service key → `SERVICE_KEY_MISSING` (503); lookup error → `LOGIN_LOOKUP_FAILED` (503) — instead of a false "No account found".

### 1.4 Invites moved to Supabase `brief_requests` (v214)
- **Supabase reports:**
  - `deals.campaign_id` nullable, no FK; `deals.status` CHECK allows NEGOTIATING.
  - `chat_threads.campaign_id` nullable, FK → campaigns; `deal_id` no FK; brand/creator FK → users.
  - `brief_requests`: `id` **text, no default**; NOT NULL = `id`, `brand_id`, `creator_id`; **no CHECK on status; default `'NEW'`** (code always sends the status). Added `amount numeric`, `deal_id text`, `accepted_by text`. 0 rows.
  - **Security:** RLS on, **no policies (server-only)**, `REVOKE ALL FROM anon, authenticated`. Never add a browser policy.
- **Code:** send inserts the row (send fails if the insert fails); list reads Supabase (by `creator_id` and email) + local; accept = guarded update on the stored status → two taps / two instances = one deal; stale `accepting` >2 min = pending; decline guarded on pending. Only the service-role client is used; local store = cache / test path.

### 1.5 UGC brief stuck on "Processing…" after a successful payment (v214, rule 55)
- Ravi: payment succeeded, brief went live, page stayed on "Processing…" until refresh.
- Exact cause not reproduced; every weak point covered:
  - `POST /ugc/briefs` **idempotent per paid order** (`razorpay_order_id` on the brief; same brand → same brief, `already_posted`; other brand → `PAYMENT_ALREADY_USED`).
  - Desktop + mobile **watch the paid order** (`onOrderCreated` → `watchPaidOrder`, check-status every 5s after 15s, up to 5 min) in case the checkout callback never arrives; one post only (`postingRef`).
  - Desktop leaves for **My Briefs** (`/brand/ugc/briefs?tab=briefs`) and hard-redirects if the router didn't move in 2.5s.
- Ravi asked for "My Orders"; Claude chose **My Briefs** (the new brief is there; orders appear only after claims) — **confirm with Ravi**.

### 1.6 Mobile creator invitations (v215)
- `src/components/campaigns/MobileCreatorInvites.jsx` on `CreatorHomeMobile.jsx` under the quick bar: hidden when none pending; title, brand, fee, deliverables count, **Review** (right). Same review modal as desktop; accept → `/chat/<thread>`; reloads on pull-to-refresh. Basic UI.
- Mobile home UGC timer line no longer invents "Quick unboxing" / ₹3,300.

### 1.7 Ravi's decisions this session
- Invite flow: exactly the campaign flow, only the start differs; new chat per invite; auto greeting from both sides; creator gets Accept / Negotiate on the brand's offer.
- `brief_requests`: server-only (option 1).
- Mobile creator home shows invites: **yes** (built).
- Brand withdraw invite / invite expiry / pending-invite limit → **Phase 2**.

---

## 2. Still open

### Ravi — now (in order)
1. Everything from session 25 still pending, first: **`SUPABASE_SERVICE_ROLE_KEY`** on Cloud Run + AI Studio → `/api/health` shows `supabase_service_role: true`. Then `ADMIN_ALERT_EMAIL`, `APP_URL`.
2. Deploy v215.
3. **Test on Cloud Run:**
   - UGC brief: post → pay → lands on My Briefs (no "Processing…" hang).
   - Invite: send → row in `brief_requests` (`pending_creator_acceptance`) → creator (desktop + mobile) accepts → new chat, row `accepted` → creator Accept (sign) and Negotiate paths → brand signs → escrow.
   - Invite the same creator twice → two separate chats.
   - Normal campaign on mobile: brand "Accept ₹X" on the creator's application card → contract sheet.
4. Session 25 tests still open: avatars / brand-logos uploads, UGC video submit + play, KYC upload + admin view, applicant count, review submit, creator/brand cancel → UGC Refunds → UTR, payout request.
5. Update agreements (session 25 list).

### Claude — next (in order)
1. Agreement text for invite deals is generic (no campaigns row) → use the invite's deliverables / timeline / title.
2. `content-submissions` → private: `VideoEmbedPreview.jsx` to server signed URLs, then the Supabase prompt. Later `ugc-assets`, `live-proofs`.
3. Admin dispute queue with a 24–48h timer.
4. Admin cancel on `/ugc/orders/:id/cancel` still uses Razorpay → manual queue (**ask Ravi**, default yes).
5. Brand mobile "Order closed" card.
6. From session 23: campaign (non-UGC) cancel/refund; remaining browser reads → API; desktop ChatBox → `dealState.js`; multi-instance or max instances = 1.
7. Supabase cleanup (low): drop `brand_applications`, `creator_reviews`, `ugc_reviews`, `banners` bucket; `AdminLogin.jsx` owner-as-admin cosmetic.
8. Found, not fixed: `check-status` queries `transactions` with the anon client (revoked → always falls back to Razorpay; harmless) and matches `id.eq.<order_id>` against a uuid column.

### Ravi's decisions still open
- After a paid brief: land on **My Briefs** (built) or My Orders?
- Admin order-cancel → manual refund queue? (default yes)
- Company legal name + contract jurisdiction.

### Claude Design (optional, when Ravi wants)
- Inside existing sections: brand `brand_invitation_offer` card (desktop + mobile), creator invitations card on mobile home, invite form / review modal polish; session 25 items (creator cancel sheet, brand cancel modal, "Order closed" card). Admin panel excluded.

---

## 3. Invite rules (reference, rule 54)
- Fee required ₹3,000+; timeline number = days.
- Pending → accepted / creator_declined. Only the invited creator acts; only while pending.
- Accept = NEW deal + NEW `thread_camp_<dealId>`; never reuse a thread.
- Opening messages: creator auto thank-you, then brand offer card (creator answers).
- Then the normal campaign flow.
- `brief_requests` is server-only; always send `status`.

## 4. UGC rules (reference, unchanged from session 25)
- KYC-only claim; claim = OTP signature; timer starts at signing.
- Express 24h / Standard 48h / Relaxed 72h (default 48h), first draft only. 3 revisions. Disputes reviewed in 24–48h.
- Missed deadline: order EXPIRED, slot relisted at the top, money stays in the brief; reminders at 6h then every 3h (max 6, quiet hours 10pm–8am IST); admin alert 3h before.
- Creator cancel before draft: no refund, relist urgent, counts as missed except within 1h / unsigned, no re-claim.
- Brand cancel: brief after 24h, unused slots, 100%; one order 24h+ after claim with no draft, no fee, 100%. UPI/Bank, manual payout + UTR, "within 1–2 working days".
- Brief post is idempotent per paid order (rule 55).
- Escrow wording = **Ybex SafePay**.

## 5. Env variables (Cloud Run) — unchanged
- **Required:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, **`SUPABASE_SERVICE_ROLE_KEY`**, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `APP_URL`.
- **Optional:** `RESEND_FROM_EMAIL`, `MEDIA_KEY_SECRET`, `GEMINI_API_KEY`, `ADMIN_ALERT_EMAIL`, `ADMIN_EMAIL`, WhatsApp keys (Phase 2).
- **At launch:** `CRON_SECRET`, `PAYMENTS_TEST_MODE=false`. **Never in production:** `DEMO_LOGIN`, `DEMO_SEED`.
- `.env.example` (v212) lists the essentials only.

## 6. New / changed files this session
- **`backend/`:** new `directInvites.ts`; `creators_routes.ts` (send / list / accept / decline, invite store), `server.ts` (invite titles in inbox), `auth_routes.ts` (login errors), `ugc_routes.ts` (idempotent brief post).
- **`src/`:** new `components/campaigns/MobileCreatorInvites.jsx`; changed `components/chat/ShortlistCards.jsx`, `MessageBubble.jsx`, `mobile/MobileShortlistCards.jsx`, `mobile/MobileMessageRow.jsx`, `campaigns/CreatorReviewInvitationModal.jsx`, `campaigns/InviteToCampaignModal.jsx`, `pages/creator/CreatorPublicView.jsx`, `pages/creator/CreatorHomeMobile.jsx`, `pages/brand/BrandUGCPost.jsx`, `pages/brand/BrandUGCMobile.jsx`, `lib/razorpay.js`, `lib/briefPaymentRetry.js`.
- **Tests:** new `backend/session26Invites.test.ts`, `src/lib/briefPaymentRetry.test.js`, `src/components/campaigns/mobileCreatorInvites.test.jsx`; updated `backend/directBrandInvitations.test.ts`, `src/components/campaigns/directBrandInviteFlow.test.jsx`.
- **Docs:** `ARCHITECTURE.md` rules 54–55; this file; `SESSION_25_SUMMARY.md` restored to the correct v211 version.

---

## Launch day (show Ravi only when he asks) — unchanged
1. **Cloud Scheduler:** `CRON_SECRET` on Cloud Run; one job `*/15 * * * *` → `POST https://<cloud-run-url>/api/internal/cron/ugc-deadlines` with header `x-cron-secret`; test with "Force run". Until then: no reminders, no admin alert, no auto-expiry/relist.
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
- **New (session 26):** brand can withdraw a pending invite; invites expire after N days; limit on pending invites from one brand to one creator (spam guard).

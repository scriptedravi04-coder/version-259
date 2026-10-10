# Build prompt: UGC deadline reminders, auto-relist and brand cancel & refund

> Paste this whole file into the build tool. It is written for an AI coding agent working in the
> Ybex repo (version-196 or later). **Claude reviews the result afterwards** (see the last section).
> Decisions marked **(approved)** are final. Remaining **[DECISION]** items use the default written next to them.

---

## 0. Project rules you must follow (from `ARCHITECTURE.md`, `AGENTS.md`)

- Read `ARCHITECTURE.md` first. The table at the top lists **protected rules**; do not undo any of
  them. Add a new row for each rule you introduce, with the reason and the guard test.
- **WHO + WHEN on every action.** Each route checks who may call it and in which state.
- **Status tokens are the DB contract.** Every new `status` / `flow_state` value goes into
  `backend/statusTokens.ts` and into the Supabase check constraint (give Ravi the SQL).
- **A money claim in the UI must match the server.** Never show an amount, fee or timeline the
  server doesn't produce or can't keep.
- **No competitor names** anywhere.
- Run `npm run verify` (tsc + crash guard + all tests) before handing back. **Never edit an
  existing test to make it pass**; change the code.
- All in-app, email and WhatsApp text is **English**.
- Supabase is the source of truth. `db_mock.json` is a local fallback only — it is wiped on every
  Cloud Run restart, so nothing in this system may depend on it alone.

## 1. Why this exists

A creator claims a UGC brief (the brand's money is already in escrow) and the app promises
*"Missing the deadline cancels the order."* **The server never enforces this.** Today:

- `POST /ugc/orders/claim` (`backend/ugc_routes.ts`, ~line 2135) sets
  `internal_deadline = now + 24h`, and that's the only place a deadline exists.
- Nothing checks it afterwards. No reminder, no cancel, no relist; a creator can even submit after
  the deadline. The brand's slot stays blocked by a creator who has gone quiet.
- There is **no brief-cancel route** for brands at all.

Goal: creators get nudged to deliver; if they don't, the slot goes back to the public quickly and
visibly; brands can cancel unused slots and get their money back through a tracked refund queue.

## 2. Definitions

- **Claim time** = when the order was created (`ugc_orders.created_at`).
- **Deadline** = `ugc_orders.internal_deadline`. It is 24h today. If the brief-level delivery
  option (24/48/72h, field `delivery_hours` on `ugc_briefs`) has been built, use it; otherwise 24h.
- **"Did something"** = the first draft exists: `video_url` OR `submission_link` OR `drive_url`
  set, or status `SUBMITTED` / `DELIVERED` / `CONTENT_SUBMITTED` / `IN_REVIEW`. Revisions and
  live links are **out of scope**; only the first draft counts.
- **Active order** = not delivered, not cancelled, not completed.

## 3. The scheduler (build this first)

There is no job runner today, and Cloud Run is **one instance**. Build:

- A protected endpoint `POST /internal/cron/ugc-deadlines`, secured by the header
  `x-cron-secret` (compared constant-time with env `CRON_SECRET`; 401 otherwise). Not reachable
  without the secret, not linked from any UI.
- **Google Cloud Scheduler** calls it every **15 minutes**. Write the exact `gcloud` command for
  Ravi in your hand-off note.
- Each run processes all active orders past their thresholds. It must be **idempotent**: running
  twice in the same minute sends nothing twice and relists nothing twice. Store the state on the
  order (fields below) and update it with a conditional write (only if the value is still what you
  read), so two overlapping runs can't both act.
- It must also be correct when we move to several instances later: no in-memory state, only DB.

New `ugc_orders` fields (give Ravi the SQL):
`reminders_sent int default 0`, `last_reminder_at timestamptz`, `admin_alerted_at timestamptz`,
`expired_at timestamptz`, `expiry_reason text`.

## 4. Reminders to the creator

**Schedule:**
- First reminder **6 hours after claim**, if nothing was done.
- Then **every 3 hours** until the deadline, while still nothing is done.
- Stop immediately once the draft exists or the order is closed.

**Quiet hours (approved):** no email/WhatsApp between **10 pm and 8 am IST**. A reminder
that falls in that window goes out at 8 am. The in-app notification is always sent.

**Cap (approved):** with a 48h/72h deadline, "every 3h" means many messages, so send **max 6
reminders per order**; the last one is the "final" message (see copy).

**Channels, every reminder:**
- In-app notification: `notifications` table, `redirect_path` = the order workspace.
- **Email** via the existing Resend setup (see `backend/helpers.ts` / `notificationService.ts`
  for the current sender).
- **WhatsApp** (see §9).

**Action button:** every message has one button, **"Upload your video"**, which opens the order
workspace. Mobile: `/creator/ugc?tab=manage&orderId=<id>`. Desktop: same route. It must open that
order, not the list. There is a known bug where a deep link opens the raw order — fix it or make
sure the button still lands correctly.

**Content of the messages:** use the approved copy in §10. Don't invent your own wording.

## 5. Admin alert

- **When:** 3 hours before the deadline, if there's still no draft, set `admin_alerted_at` (once).
- **What:** an admin-dashboard alert plus an email to the admin address, listing creator (name,
  phone, email), brand, brief, deadline and time left, with a link to the order. The admin may
  call the creator.
- Also log it with the existing admin action log (WHO = system, WHEN = now).

## 6. Deadline passed, still no draft → expire and relist

At the deadline, if nothing was done, **in one guarded step**:

1. Order: status → new token **`EXPIRED`** (add it to `statusTokens.ts` + DB constraint). Set
   `expired_at`, `expiry_reason = 'NO_DRAFT_BY_DEADLINE'`. The order leaves the creator's active
   list. Show it under "Closed" with a line: *"This order expired because no draft was submitted in
   time."* The creator can no longer submit to it; the server rejects submit on an expired order
   with 409.
2. **Slot:** give it back to the brief with the existing slot helper
   (`backend/ugcSlots.ts → releaseBriefSlot`). **The money stays in the brief's escrow.**
   Nothing is refunded here; this is not a brand cancellation.
3. **Brief becomes "relisted":** set on `ugc_briefs`: `relisted_at timestamptz`,
   `relist_count int`, `is_priority boolean true`.
4. **Record** on the creator: a missed-deadline count (used by the creator card's on-time %
   later). Don't change their rating number directly.
5. **Notify:**
   - Creator: expired message (§10).
   - Brand: *"Your creator missed the deadline — your brief is live again at the top"* (§10).
6. The chat thread gets a system message and `thread_updated` (protected rule 30).

The same creator **can't re-claim** a brief they let expire.

## 7. Relisted briefs: top of Explore + bonus

- **Priority:** in `GET /ugc/briefs/available`, relisted briefs (`is_priority = true` and an open
  slot) come **first**, newest relist first, then the normal order. The card shows a badge
  **"Urgent · relisted"** (mobile `CreatorUGCMobile.jsx` explore list, desktop
  `CreatorUGCBrowse.jsx`).
- `is_priority` clears when the relisted slot is claimed (or the brief closes).
- **Relist bonus: NOT in this build (Phase 2).** Don't add any bonus field, setting or text.
- **[DECISION] Deadline for the new creator:** default is the brief's normal delivery time from
  their claim (not shortened).

## 8. Brand cancels a brief → refund queue

There is no brief cancel today. Build `POST /ugc/briefs/:id/cancel`.

**WHO:** only the brief's brand (or admin).

**WHEN:**
- **Not within 24 hours of creating the brief.** Return 409 with
  *"You can cancel this brief 24 hours after posting it."* The UI shows the time left
  instead of the button.
- After 24h: allowed at any time.

**What gets cancelled (approved):** **only slots nobody is working on**
(unclaimed + relisted). Orders already claimed and in progress, or delivered, continue as normal
(the creator is working; cancelling them is a dispute, not a button). The brief closes to new
claims. If every slot is in progress, the cancel button explains that and offers support.

**Refund amount:** open slots × per-creator budget, from the server's own brief/escrow numbers.
If the brief has no open slots, 409.

**Records:**
- A refund row: new table `ugc_refunds` — `id, brief_id, brand_id, amount, slots, reason,
  status ('PENDING' | 'PROCESSED' | 'FAILED'), refund_account_snapshot (jsonb), utr,
  failure_reason, requested_at, processed_at, processed_by`. Give the SQL; RLS on, no public policies.
- Brief: status `CANCELLED` (or `PARTIALLY_CANCELLED` if some orders continue) → both into
  `statusTokens.ts`.

**Refunds are paid MANUALLY by Ybex from the company bank account — not through Razorpay.**
Do not call the Razorpay refund API anywhere in this system.

- The brand needs a **refund account**. In the cancel flow, first ask **"How would you like your
  refund?"** with two choices: **UPI** or **Bank account** (approved by Ravi).
  - **UPI** → show only the UPI ID field.
  - **Bank account** → show account number, re-enter account number, IFSC and account holder name.
  - If the brand already saved one, show it masked (last 4 digits / UPI) with "Use this" or "Change". Store it like creator payout methods (full number never sent back
  to the browser; see `backend/payoutMethods.ts` for the validation + masking pattern). New table
  or reuse: `brand_refund_accounts` (SQL, RLS on, no public policies).
- The cancel **stores a snapshot** of that account on the `ugc_refunds` row (so a later change
  doesn't redirect an already-requested refund).

**Brand message on confirm (before the call):** a confirmation sheet showing the exact server
amount and the masked refund account. After success: see §10 "Brand cancel".

## 9. Admin: Payouts → "UGC Refunds"

- A new section **"UGC Refunds"** inside the admin dashboard's Payouts area (desktop `Admin.jsx`
  payouts tab; also mobile `AdminPayoutMobile.jsx`).
- It lists **only brand cancellations** (`ugc_refunds`), not expired creator orders. Those relist
  and never come here.
- Each row: brand, brief, amount, slots, requested time, status.
- The row shows the brand's refund account **the same way the admin payout screen shows a
  creator's payout account** (reuse that component/layout): method (UPI or Bank), UPI ID, or
  account number + IFSC + holder name, each with a copy button. Full details visible **only to
  admins**.
- Action **"Mark as refunded"**: admin enters the **UTR / bank reference** (required) and date. Status
  → `PROCESSED`, store `utr`, `processed_at`, `processed_by`. Log WHO and WHEN. The brand gets the
  "refund sent" message (§10) with the UTR.
- Action **"Mark failed"** with a reason (e.g. wrong account). The brand is asked to fix the refund
  account; the row returns to `PENDING`.
- Refund rows older than 2 working days while still `PENDING` are highlighted red for the admin.
- The brand sees the refund status on the brief ("Refund processing" → "Refunded on <date>").

## 10. Message copy (approved)

User-facing name for escrow is **Ybex SafePay** (Ravi: many users don't know the word "escrow").

**Approved by Ravi** (subjects made more urgent on his request). `{payout}` = the order's
`creator_payout` from the server — never a guessed number. Keep the urgency honest: say only what
the system really does.

Placeholders: `{payout}`, `{creator_first_name}`, `{brief_title}`, `{brand_name}`, `{time_left}`,
`{deadline_time}`, `{amount}`, `{order_link}`.

**Reminder, first (6h after claim)**
> Subject: ⏳ Your ₹{payout} is waiting — upload your video for {brand_name}
>
> Hi {creator_first_name}, you claimed **{brief_title}** by {brand_name}. The payment is already
> held safely with Ybex SafePay, and it's yours once your video is approved. You have **{time_left}** left to
> upload your draft.
>
> Button: **Upload your video**

**Reminder, repeat (every 3h)**
> Subject: ⚠️ Only {time_left} left — don't lose your ₹{payout} order
>
> Hi {creator_first_name}, we haven't received your draft for **{brief_title}** yet. Please
> upload it before **{deadline_time}**. Brands pick creators who deliver on time, and late or
> missed orders show on your profile.
>
> Button: **Upload your video**

**Reminder, final (last one before the deadline)**
> Subject: 🚨 Last chance: {brief_title} gets cancelled at {deadline_time}
>
> Hi {creator_first_name}, this is the last reminder. If no draft is uploaded by
> **{deadline_time}**, this order will be cancelled, the brief goes to another creator, and the
> missed deadline is recorded on your profile.
>
> Button: **Upload now**

**Creator, order expired**
> Subject: ❌ Your ₹{payout} order for {brief_title} was cancelled
>
> Hi {creator_first_name}, no draft was uploaded for **{brief_title}** by the deadline, so the
> order has been cancelled and the brief is open to other creators. You can keep claiming new
> briefs. Please claim only when you can deliver on time.
>
> Button: **Explore briefs**

**Brand, creator missed the deadline**
> Subject: Your brief is live again — back at the top for creators
>
> The creator who claimed **{brief_title}** didn't deliver in time, so we cancelled their order.
> Your payment is still held safely with Ybex SafePay, and your brief is back at the top of the creator feed so a
> new creator can pick it up quickly.
>
> Button: **View brief**

**Brand cancel, confirmation sheet (before cancelling)**
> **Cancel this brief?**
> {slots} unused slot(s) will be cancelled and **₹{amount}** refunded to your account ending
> **{account_last4}** within 1–2 working days. Creators already working on this brief will finish their orders.
>
> Buttons: **Cancel brief** / **Keep brief**

**Brand cancel, after success**
> **Brief cancelled.** Your refund of **₹{amount}** will be sent to your account ending
> **{account_last4}** within **1–2 working days**.

**Brand, refund sent**
> Subject: ✅ ₹{amount} refund sent — UTR {utr}
>
> We've sent **₹{amount}** for **{brief_title}** to your account ending **{account_last4}**.
> Bank reference (UTR): **{utr}**.

**Admin alert**
> Subject: [URGENT] {creator_name} hasn't delivered — {time_left} left
>
> {creator_name} ({creator_phone}, {creator_email}) claimed {brief_title} for {brand_name} and
> hasn't uploaded a draft. Deadline: {deadline_time} ({time_left} left). Reminders sent:
> {reminders_sent}.
>
> Button: **Open order**

WhatsApp versions: same text, shortened to fit a template (one short paragraph + the button).
Submit them as **Utility** templates (order updates). Meta may re-classify very salesy wording
as Marketing (costs more, needs marketing opt-in), so keep the WhatsApp body factual; the extra
urgency lives mainly in the email subject.

## 10b. Brand explainer promise depends on this build

The brand explainer (`src/components/ugc/BriefSafetyExplainer.jsx`) already promises: *"100% refundable. Any slot no creator is working on can be cancelled after the first 24 hours, and the full amount comes back to your bank or UPI."* The cancel + refund flow in §8–§9 must deliver exactly that.

## 11. WhatsApp setup

- WhatsApp Business messages need a provider (e.g. Twilio or Meta Cloud API) and **Meta-approved
  templates** for business-initiated messages, with the button as a URL button. Create one
  template per message in §10.
- The creator must have **opted in**. Add a consent line at signup/profile, stored as
  `whatsapp_opt_in` + phone. No opt-in → email + in-app only.
- New env vars (document them for Cloud Run). If they're missing, WhatsApp is skipped silently
  and email still goes out. Never fail the job because WhatsApp failed.
- Log every send (channel, template, order, result) so we can see delivery problems.

## 12. Tests to add (must pass with `npm run verify`)

- Scheduler: 5h59m after claim → nothing; 6h → one reminder; running twice → still one; 9h →
  second; draft uploaded → no more; quiet hours shift email/WhatsApp to 8 am; cap respected.
- Admin alert once, 3h before the deadline.
- Expiry: status `EXPIRED`, slot released, money unchanged, brief `is_priority`, same creator
  can't re-claim, submit on an expired order → 409, both parties notified.
- `/ugc/briefs/available` puts relisted briefs first.
- Cancel: 403 for another brand; 409 within 24h; only open slots refunded; amount equals the
  server's numbers; `ugc_refunds` row created; in-progress orders untouched.
- Refund: `PROCESSED` only with a UTR entered by an admin; non-admin gets 403; the brand never
  receives another brand's account; the Razorpay refund API is never called.
- Cron endpoint: 401 without or with a wrong secret.
- No relist-bonus field or text anywhere (Phase 2).

## 13. Hand-off note to write when done

List:
- the SQL (fields, `ugc_refunds`, constraints, RLS)
- env vars
- the Cloud Scheduler command
- the WhatsApp templates submitted
- new status tokens
- new `ARCHITECTURE.md` rows
- anything you couldn't finish

---

## For Claude (review checklist, used after the other tool builds it)

- Every item in §3–§11 exists and behaves as written, **or** Ravi approved a change.
- Protected rules 1–40 are not undone. New rows were added to `ARCHITECTURE.md`. No existing test
  was edited to pass.
- `npm run verify` and `npm run build` pass. Read the new tests; they should test behaviour, not
  just grep strings.
- Cron security: secret required, constant-time compare, idempotent conditional writes.
- Money: expiry never refunds; cancel refunds only open slots; amounts come from the server; the
  bonus comes from the platform, not the brand; `PROCESSED` only on real Razorpay acceptance.
- Copy used is exactly the approved §10 text (1–2 working days is Ravi's own commitment — manual transfer).
- Status tokens added in `statusTokens.ts` + SQL constraint.
- WhatsApp fails safe (email still sends). Opt-in is respected.

# Pending database (Supabase) changes

**End of session 41: everything below that has SQL is APPLIED** (13 files, run by Ravi's Supabase-connected Claude, no errors). Nothing is pending right now. New needs → add an entry here.

**Ravi, session 41:** right now we only fix the app's bugs and errors. **No new Supabase table, column,
bucket or SQL file** until one dedicated "database session". Every planned change is written here
(what, why, when, which code needs it). In that session we read this list together and do it all in
one day.

Rule for every session and every AI tool: need a new table / column / SQL? **Do not create it.** Add an
entry below, build nothing that depends on it, and tell Ravi.

---

## 1. What's new popup — `whats_new`, `whats_new_seen`
- **Status: BUILT in v261 — Ravi approved ("now start working").** Run `scripts/sql/session41.sql`.
- **Why:** admin writes an update ("Express is now free"), every creator / brand sees it once.
- **Tables:** `whats_new` (id, title, points jsonb, audience all/creator/brand, cta_label, cta_url,
  published, published_at, created_at) · `whats_new_seen` (user_id, item_id, seen_at; key user_id+item_id).
- **Code waiting for it:** `backend/whats_new_routes.ts`, `src/components/whatsNew/WhatsNewPopup.jsx`,
  `src/components/admin/WhatsNewManager.jsx`.
- **Before the SQL is run:** the popup never shows; Admin → What's new says "Could not save".

## 2. Push notifications (app closed) — `push_subscriptions` (+ promo pushes)
- **Status: BUILT in v261 — Ravi approved building it now (exception to the "no new tables" rule).**
  Run `scripts/sql/session41.sql` (push_subscriptions, push_campaigns, push_log) and add the VAPID keys.
  Ravi's decisions (session 41, final — do not ask again):
  - **Deal pushes:** new message, invite, application, counter offer, contract to sign, UGC submitted /
    revision, payment released, KYC approved / rejected.
  - **Promo pushes in Phase 1 too** — Zomato / Swiggy style: short, funny, a bit emotional. (Promo
    *emails* stay Phase 2.) **Admin writes every promo push** in the admin panel — any language
    (English, Hinglish, emojis); the app's "English only" rule does not apply to these. We build the
    system, not the messages.
  - **Admin push screen (to build):** title + message + optional page to open on tap; audience (all /
    creators / brands, later niche / city); send now or schedule; preview of how it looks on a phone;
    history with how many it was sent to. Deal pushes are automatic (no admin step).
  - **No on/off setting in the app.** (People can still switch notifications off from phone settings.)
  - **Ask permission at the start**, with our own screen first (like the Sticker.ly screen Ravi sent):
    a sticker, an emotional + funny line, one big "Allow" button → only then the phone's real popup.
    Our own original sticker — not Sticker.ly's cat photo.
  - **Screen text chosen by Ravi:**
    - Creator: **"Brands are waiting. So is your money. 💸"** — *Turn on notifications so no deal, no
      payment, no "we loved your reel" ever slips past you.*
    - Brand: **"Your next viral creator just applied… 👀"** — *Allow notifications so great creators
      don't slip away while you're in a meeting.*
    - Button "Yes, keep me posted"; small "Not now" under it (iPhone never asks twice after "Don't Allow").
- **Tables:** `push_subscriptions` (id, user_id, endpoint unique, p256dh, auth, user_agent, created_at,
  last_used_at) · `push_campaigns` for promo pushes (id, title, body, audience all/creator/brand,
  url, send_at, sent_at, sent_count, created_by) · optional `push_log` (who got what, for limits).
- **Also needs:** VAPID keys in env, `web-push` package, push handler + tap-to-open in the service
  worker, the "Allow" screen, admin screen to write / schedule promo pushes, a daily limit per user
  (e.g. max 2 promo pushes a day) so people don't switch everything off.
- **Limits:** Android Chrome — works; iPhone — only when added to Home Screen, iOS 16.4+, and the
  phone's popup can only open after a tap (that is why our screen has an "Allow" button). If someone
  says "Don't allow" once, the phone never asks again — our screen comes first so fewer people say no.

## 3. Older SQL files (session 22–40) — APPLIED at the end of session 41
- All schema files in `scripts/sql/` are applied. Not run on purpose: `purge_aadhaar.sql` (no Aadhaar
  columns exist in creator_kyc; one read-only check on `verifications` left) and
  `find_wrongly_completed_briefs.sql` (report only — 15 rows, Ravi decides; advice: don't reopen).

## Session 43 (v274) — brand coupon codes at payment (NOT built: rule 91, no new table / column)
Ravi asked whether brands can apply a coupon on the "Review & pay" step. Creator codes exist
(`creator_coupons`); brand codes do not. Needs: a brand coupon store (code, type, discount, valid_until,
max uses), a server check on the escrow order route (locked flow — Ravi's written OK needed) so the
Razorpay amount is computed server-side, and a line in the Review & pay sheet. Decide with Ravi first.

## Session 43 (v278) — self-serve account deletion
Added by the Delete account flow (Settings → Account → Delete account, and /delete-account).
The flow works today with the existing `is_deleted` soft-delete (account hidden + login blocked, like
the admin bin; records kept). To enable the **30-day auto-purge + a precise "days left" countdown +
self-serve recovery**, add:

- `users.deletion_requested_at timestamptz null`  — when the user asked to delete (self-serve).
- `users.deletion_reason text null`               — e.g. "self_serve".

`backend/account_routes.ts` already best-effort writes both on confirm (wrapped in try/catch, so it is
harmless until the columns exist). After adding the columns:
1. A scheduled job (daily) should run the existing complete-wipe on accounts where
   `deletion_requested_at < now() - 30 days` and `is_deleted = true`.
2. Login can offer "Reactivate" within the 30 days (set is_deleted=false, clear deletion_requested_at)
   instead of the generic "profile no longer available" message.
No other table changes are needed — `transactions` (payment/invoice records) are intentionally kept.

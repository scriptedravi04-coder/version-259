# Ybex — Session 22 Summary (start the next session from here)

**Latest zip:** `version-184.zip` (= v183 code + this summary). Built on `version-172`.
**Language:** Ravi writes Hindi/Hinglish — reply the same way.
**State:** 507 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean; production start (`npm start`) verified.
**Deploy status:** Ravi is deploying v183 to Cloud Run for TESTING. Public launch comes later (see "Launch day").

**Rules (unchanged):** run `npm run verify` before every zip; WHO + WHEN on every action; status tokens = DB contract; a money claim in the UI must match the server; no competitor names.
**Protected changes:** the table at the top of `ARCHITECTURE.md` (29 rules, each with the reason and the guard test). `AGENTS.md` and `GEMINI.md` tell AI tools (Google AI Studio) not to undo them. Never edit a test to make it pass.

---

## 1. What was done in session 22 (v173 → v183)

### Deploy
- **v173** Cloud Run failed ("container failed to listen on PORT=3000"): `npm start` was `node server.ts` (plain Node can't run it). Now `NODE_ENV=production node dist/server.cjs`.

### Private media (watermark step 1)
- **v174** Deliverable buckets are never made public by code (the server used to re-publicise them on every start). Files open only via `GET /api/media` → 15-minute signed link, only for the deal's parties / uploader / staff. `/auth/me` gives a 12 h media key for `<video>` tags. Uploads return proxy links, not 7-day storage URLs.

### Privacy, sessions, cleanup
- **v175** Online status only to contacts + admins. OTP codes (hashed), sign tokens and the OTP send limit in the shared table `ybex_ephemeral` (works with several Cloud Run instances). 73 backend silent `catch {}` report via `logIgnored`. Socket wiring → `socketServer.ts`.
- **v176** 47 frontend silent `catch {}` → `ignored()` (dev-only console). Storage helpers → `storageHelpers.ts`; campaign lifecycle (1,800 lines) → `campaign_lifecycle.ts`.

### Deep audit (v177)
- Demo ADMIN login was open on run.app (`/api/admin/bypass`) → only with `DEMO_LOGIN=true`.
- `/auth/me` wrote fake demo data (collabs, invoices, earnings, orders) for every new real user → only with `DEMO_SEED=true`.
- `/auth/sync` (no login; could set any account's role) → removed (410).
- No-login routes fixed: landing brands/reviews, collab deliverable, creator bulk-import, performance record, `/files/:id` (KYC files).
- Public creator profile hid email/phone/bank/UPI/PAN/Aadhaar/GST/address.

### Admin UI (v178)
- Admin → Users: role column showed the industry ("Fashion"); now a Role badge + category line, red "Role missing" when empty.

### Database lock-down (with the Supabase-connected Claude), v179–v183
- The server always uses the service-role client (`supabase = privilegedSupabase`); ~45 server calls had relied on "anyone may do anything" RLS policies.
- Browser no longer touches `users`, `user_sessions`, `transactions`, `files`, `deals`, `*_kyc`, `notifications`, `support_tickets`, `ticket_messages` directly → API (`browserDbRoutes.ts`, `support_routes.ts`, `/api/notifications`).
- Profile writes (onboarding, settings, portfolio, social channels) → `ownDb` → `POST /api/db/own` (own row only, staff columns stripped). These had been failing silently after RLS became SELECT-only.
- Live notifications were sent to the wrong socket room (never arrived) → fixed; dashboard uses our socket, not Supabase realtime.
- Helpdesk: staff endpoints; ticket messages owner-or-staff only; polling instead of realtime.
- Split: notifications → `notificationService.ts`. `server.ts` 3,867 → 3,299 lines; `campaigns_routes.ts` 3,279 → 1,482.

### Done in Supabase (by the other Claude)
- `ybex_ephemeral` table created (RLS on, no policies).
- Demo data deleted: `demo_brand`, `creator_demo_1` (alice@example.com, nexus@example.com) + their orders, threads, messages, briefs.
- Policies dropped: brand_kyc, creator_kyc, user_sessions, transactions, files, deals, users, ugc_briefs, ugc_orders (0 policies left on these).
- Checked: no CHECK constraint rejects the new values; all needed columns exist.
- Chat policies kept (authenticated-only, check `auth.uid()`; the app is always anon → no effect).
- `archived_deleted_brand` NOT touched on purpose — placeholder used by 51 briefs of deleted brands.

---

## 2. Still open

### Ravi — now (testing deploy)
1. Cloud Run: `SUPABASE_SERVICE_ROLE_KEY` must be set (current key is fine for testing). Deploy v183.
2. Test: signup, login, Google login; brand + creator onboarding save; brand settings save; create campaign; contract sign (email OTP); escrow payment (test mode); chat live; notification bell updates without refresh; help ticket → admin reply → user sees it; deliverable video plays for both sides.
3. When videos play → tell the Supabase Claude **"videos play"** → it makes `content-submissions`, `live-proofs`, `ugc-assets` private.

### Supabase Claude — after v183 is deployed (prompts were given in chat)
1. Drop "Public read-only notifications" on `notifications`.
2. Drop all policies on `support_tickets`, `ticket_messages`.
3. Demo/test accounts: admin@ybex.io (**Admin role — most important**), dev@ybex.io, nexus_brand@ybex.io, archived@ybex.internal, rahul.sharma@example.com, deals@skylinebrands.co, users with empty role → list, then delete or demote with Ravi's yes.
4. Final report: expected only public SELECT on `brand_profiles`, `creator_profiles` (+ the harmless authenticated chat policies).
5. Buckets private (after "videos play").

### Claude (code) — no decision needed
1. **Campaign (non-UGC) cancel refund** — only UGC cancel refunds automatically today; campaign cancel needs the admin. Money gap → do first.
2. **ChatBox.jsx split** (3,000-line single component) — only step by step with Ravi/developer testing in the browser after each step.
3. Small: `src/pages/brand/BrandPayments.jsx` has a dead path using `supabase.auth.getUser()` (never runs; the app doesn't use Supabase Auth) — can be removed.

### Ravi's decisions
1. Promo codes: discount the brand's payment, or the platform fee (creator payout)?
2. Company legal name and contract jurisdiction.
3. Burned-in (ffmpeg) watermark on preview videos — yes/no? (Today: private links + overlay.)

---

## 3. Launch day (public) — in this order
1. Rotate the Supabase service-role key (the old one was exposed by the removed `/api/admin/run-sql`) → new key in Cloud Run.
2. Rotate Razorpay key secret and Resend API key → Cloud Run.
3. `PAYMENTS_TEST_MODE=false` (test mode accepts fake payments and shows OTP codes).
4. `DEMO_LOGIN` and `DEMO_SEED` NOT set.
5. Supabase → Authentication → Providers → Email: sign-ups OFF; Authentication → Settings: sign-ups OFF (app doesn't use Supabase Auth; nothing breaks).
6. Confirm the 4 private buckets and that no anon "allow all" policies are left.
7. Smoke test as in "Ravi — now" + one real ₹1 payment.

## 4. Env variables (Cloud Run)
Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `APP_URL`.
Launch: `PAYMENTS_TEST_MODE=false`. Optional: `MEDIA_KEY_SECRET` (else derived from the service key), `GEMINI_API_KEY` (blog/AI).
Never in production: `DEMO_LOGIN`, `DEMO_SEED`.

## 5. New files this session
`backend/`: `mediaAccess.ts`, `media_routes.ts`, `ephemeralStore.ts`, `socketServer.ts`, `storageHelpers.ts`, `campaign_lifecycle.ts`, `notificationService.ts`, `browserDbRoutes.ts`, `profilePrivacy.ts`; `scripts/sql/ybex_ephemeral.sql`; `src/lib/mediaUrl.js`, `mediaKey.js`, `ownDb.js`; `src/utils/ignored.js`; `GEMINI.md`.
Tests: `deployStart`, `mediaAccess`, `session22`, `session22Audit`, `ownDb`.

# Ybex — Sessions 20–21 Summary (start the next session from here)

> Superseded by `SESSION_22_SUMMARY.md` — start there.

**Latest zip:** `version-183.zip` — see sections 6–9 (session 22). Protected rules: top of ARCHITECTURE.md.
**Language:** Ravi writes Hindi/Hinglish — reply the same way.
**State:** 452 tests pass, 1 skipped on purpose, clean build, `index.html` unchanged, `db_mock.json` empty (as in v171c).

The rules from session 19 still apply (verify before every zip, WHO + WHEN on every action, status tokens = DB contract, a money claim in the UI must match the server, no competitor names). `ARCHITECTURE.md` now has the security model, data model, deal flow and env list.

---

## 1. Review of the AI Studio (Gemini) changes in v171c

| Change | Verdict |
|---|---|
| `RELEASED` added to `transactions_payout_status_check` (SQL) | ✅ Correct |
| "Approve Last Submission" confirm box | ✅ Correct |
| Only the latest offer card shows Accept/Negotiate | ✅ Desktop OK. ❌ Mobile: `allMessages` used but never passed → ReferenceError, mobile chat crashed on any offer. **Fixed** |
| Both sides may accept a counter | ⚠️ The party check was dropped — anyone not the sender, even a stranger, could accept. **Fixed**: only the other side of *this* deal; compared by side, not user id |
| Login "auto-provision" (not in the summary) | 🚨 Any unknown email + any password created a verified account; email containing "admin" → admin. **Removed** |
| Admin user delete | Confirm dialog was removed. **Restored** |
| `db_mock.json` empty (0 bytes) | Kept (removes the plain-text passwords). The server now treats an empty file as a fresh store instead of logging "CRITICAL corrupted" and writing a `.bak` each start |
| Eager Dashboard, no react alias, `useAuth` fallback | Kept for the AI Studio host (one perf test skipped with a note) |

## 2. Everything fixed in sessions 20–21 (before → after)

### Login / roles / sessions
- Onboarding never saved `users.role`; Google sign-ups had none → brand showed "Only brands can post campaigns". Role is now saved (Supabase + local); an onboarded account cannot switch creator↔brand by API; old accounts heal on `/auth/me`.
- Sessions were read with the anon key → RLS hid them → random "not a brand". Now the privileged client.
- A bare `user_id` worked as a login token (for any user, admins included). Removed.
- `/auth/session` returned any user's full row for any id. Now only a real session.
- `/api/admin/run-sql` returned the whole `process.env` to anyone. **Removed — rotate the Supabase service key, Razorpay secret and Resend key.**
- `dev_bypass_2` worked with demo logins off. Fixed.

### OTP / signing
- `/otp/send` said "sent" when no email went out. Now a clear error (502); test mode shows the code on screen with a warning. OTP codes no longer written to production logs.
- `/sign` never checked that an OTP was verified; the `/collabs` modal generated its "OTP" in the browser and showed it in a toast; other screens signed with a typed name. Now `/otp/verify` of a contract code issues a one-time `sign_token` and every sign route + the UGC claim require it. All signing screens use the real email OTP.
- `/deals/:id/sign`: any creator/brand on the platform could sign any deal. Now only its parties.

### Money
- Escrow could be paid before both sides signed. Now `CONTRACT_NOT_SIGNED`.
- Brand approval released the payout but the admin got no alert. Now a `payout_due` admin alert (campaign + UGC).
- UGC cancel said "refunded" and recorded `PROCESSED` with no money moving. Now a real Razorpay partial refund; if that is not possible, `PENDING` + a `refund_due` admin alert, and the chat says so.
- UGC slot claim race (two creators, one slot → two orders/payouts). Now compare-and-set (`ugcSlots.ts`); cancel frees the slot without reopening closed briefs.
- Two routes invented a ₹50,000 order under a fake brand. Removed.
- Earnings page showed gross as net, "PAID" for RELEASED, and a fake "+100%" (6 places). Fixed.

### Chat / realtime / privacy
- Sockets had no auth: anyone could join any deal's room and read it live, or take anyone's notifications. Now tied to the logged-in user; rooms only for the deal's parties.
- Deal events (`thread_updated`, payouts, …) went to every connected user. Now only the room, both parties and admins.
- Admin alerts (new sign-ups' name + email) reached every user (notification list and live socket). Now admins only; old leaked rows hidden.
- Signed upload URLs for any bucket/path (KYC too). Now only the deliverable folders.
- Old review cards kept working buttons (desktop + mobile, campaign + UGC); desktop draft cards all showed "Under Review" after a resubmission. Only the newest card is actionable.
- Campaign edit failure silently created a second campaign. Now shows the error.

### Cleanup (Phase 4)
- 18 one-off scripts removed from the root (no secrets in them); `.gitignore` guards the pattern.
- 81 silent `catch {}` in the money/auth files now report through `logIgnored.ts` (rate-limited).
- All `flow_state` tokens listed in `statusTokens.ts`; a test fails on an unlisted one.
- `ARCHITECTURE.md`: security model, where data lives, deal flow, env variables, known debt.

## 3. New files
`backend/`: `roleGuards.ts`, `ugcSlots.ts`, `socketAccess.ts`, `signTokens.ts`, `refunds.ts`, `logIgnored.ts`, `statusTokens.ts`; `src/lib/socketAuth.js`, `src/lib/contractOtp.js`.
Tests: `onboardingRole`, `session20Fixes`, `phase1and3`, `session21Review`, `phase2`, `statusTokens`.

## 4. Still open

**Needs Ravi's decision**
1. Promo codes: discount the brand's payment, or the platform fee (the creator's payout)?
2. Watermark: make the video bucket private in the Supabase dashboard; then serve short-lived signed URLs (code to be written after).
3. Company legal name and contract jurisdiction.

**Can be done without a decision**
- Split `server.ts`, `campaigns_routes.ts`, `ChatBox.jsx` step by step.
- Silent `catch {}` outside the money/auth files.
- Campaign (non-UGC) cancellation refund path — only UGC cancel refunds automatically today.
- `user_status_change` (online/offline) is still broadcast to everyone.
- Sign tokens and OTP codes live in one server instance's memory: with several instances, OTP send and verify must hit the same one (same limitation as the OTP store before).

## 5. After deploying — Ravi
1. Set `SUPABASE_SERVICE_ROLE_KEY` (a **new, rotated** one). Rotate Razorpay and Resend keys too.
2. For real use set `PAYMENTS_TEST_MODE=false` (on a `run.app` URL it is test mode by default).
3. Everyone refreshes the page once (sockets now need the login token).
4. Test: brand login → Create Campaign; sign a contract (email OTP); fund escrow (blocked until both signed); approve → admin sees "Payout due"; cancel a UGC order → refund or "Refund due" alert; open a chat from two accounts and check live messages.

## 6. Session 22 (v173, v174)
- v173: Cloud Run deploy failed ("container failed to listen on PORT=3000"). `npm start` was `node server.ts`, which plain Node cannot run (extensionless imports) → crash before listen. Now `NODE_ENV=production node dist/server.cjs`; test `deployStart.test.ts`.
- v174: private deliverable media — `/api/media` proxy, media key, server no longer forces buckets public, uploads return proxy links, 5 raw links fixed, socket party lookup now understands `thread_ugc_` / `thread_camp_` ids. Test `mediaAccess.test.ts` (26). 481 pass, 1 skipped.
- Ravi: deploy v174 → check videos play (brand + creator) → THEN make `content-submissions` private in the Supabase dashboard → check again.
- Still open: promo codes decision, legal name/jurisdiction, campaign cancel refund, `user_status_change` broadcast, OTP/sign tokens in shared store, file splits, burned-in watermark (ffmpeg).

## 7. Session 22 continued (v175)
- B: online/offline status only to contacts + admins; `get_online_users` filtered (was: everyone's ids to anyone).
- D: OTP codes + sign tokens in Supabase `ybex_ephemeral` (hashed, one-use across instances). **Ravi must run `scripts/sql/ybex_ephemeral.sql` once**; until then memory fallback (old behaviour).
- C: 73 remaining silent `catch {}` in backend now report via `logIgnored`. Frontend (47) not touched — mostly localStorage/JSON fallbacks.
- E (step 1): socket wiring moved out of server.ts → `backend/socketServer.ts`. Next split steps: storage helpers, notifications, then campaigns_routes / ChatBox.
- Fix: socket party lookup understands `thread_ugc_` / `thread_camp_` ids; empty party lists are not cached.
- Tests: `session22.test.ts`. 488 pass, 1 skipped.

## 8. Session 22 continued (v176)
- OTP send rate limit (30 s / 5 per 10 min) now in the shared store too (`otpsend:` keys).
- Frontend: all 47 empty `catch {}` now call `ignored()` (`src/utils/ignored.js`) — console.debug in dev only, production unchanged. A test fails if an empty catch comes back anywhere in backend/ or src/.
- Split: storage helpers → `backend/storageHelpers.ts`; campaign lifecycle handlers (1,800 lines) → `backend/campaign_lifecycle.ts` (re-exported from campaigns_routes.ts). server.ts 3,867 → 3,651 lines; campaigns_routes.ts 3,279 → 1,482.
- Not done: notifications block in server.ts is mixed with routes (needs a careful pass); ChatBox.jsx is one 3,000-line component — splitting it means moving state into hooks, best done with a browser check per step.
- 488 pass, 1 skipped.

## 9. Session 22 audit (v177)
Found and fixed: demo ADMIN login open on run.app (`/api/admin/bypass`); fake demo data written for every new real user by `/auth/me`; unauthenticated `/auth/sync` (set any account's role); landing brands/reviews add/delete without login; collab deliverable overwrite without login; creator bulk-import without login; campaign performance write without login; `/files/:id` served KYC files without login; public creator profile exposed contact/bank/ID fields.
Added "PROTECTED CHANGES" table (25 rules, reason + guard test) at the top of ARCHITECTURE.md; AGENTS.md and GEMINI.md point to it. Test `session22Audit.test.ts`. 496 pass, 1 skipped.
Ravi: check Supabase for demo rows (ids starting `collab_demo_`, `thread_demo_`, `m_d_`, `app_seed_`, users `demo_brand`, `creator_demo_1`) and delete them if present.

## 10. v178
- Admin → Users: the third column showed the brand's industry ("Fashion") where the role belongs, and the header followed the page prop, not the selected filter. Now always a Role badge (Brand / Agency / Creator / Admin / Sub-Admin, red "Role missing" when users.role is empty) with industry/niche as a second line.
- Demo/test accounts visible in the admin list (Alice Creator, Nexus Brands nexus@example.com, Developer Bypass dev@ybex.io, System Admin admin@ybex.io, Archived Brand, Rahul Sharma @example.com, Skyline Agencies) — to be removed/demoted in Supabase (Ravi decides which).

## 11. v179 — RLS readiness (after the Supabase Claude's audit)
Supabase audit found "anyone may do anything" (`{public}`, `qual true`) policies on kyc, sessions, transactions, files, deals, chats, notifications, profiles, and anon SELECT/UPDATE on users/ugc_briefs/ugc_orders.
Problem: ~45 SERVER calls used the anon client and relied on those policies. Fixed: server uses the service-role client for everything (`supabase = privilegedSupabase`). Browser direct access to users/deals/brand_kyc/notifications-insert/helpdesk moved to API (`browserDbRoutes.ts`); unused `src/middleware/chatSecurity.ts` removed.
Still direct from the browser (needs API before their policies can be tightened): brand_profiles/creator_profiles writes (onboarding, settings), campaigns reads, realtime on chat_threads/chat_messages/notifications/support_tickets, creator_portfolio_items, creator_social_channels, support_tickets, waitlist, categories, cities, faq, platform/campaign config.

## 12. v180
Supabase Claude reported brand_profiles / creator_profiles / notifications are SELECT-only for the browser — so the browser's 15 direct profile writes (brand & creator onboarding, brand settings, portfolio items, social channels, avatar, "mark notifications read") were failing. Now they go through `ownDb` → `POST /api/db/own` (own row only, staff columns stripped). Tests `ownDb.test.ts`. 503 pass.
Still open for full lock-down: notifications SELECT is public (anyone can read all notifications) because BrandDashboard/BrandHomeMobile read them directly + realtime; support_tickets / ticket_messages fully open (helpdesk + HelpTickets read/write directly + realtime). Next: move those to API + socket, then drop.

## 13. v181 — notifications private
Browser reads notifications only through `/api/notifications`; BrandDashboard live updates moved from Supabase realtime to our socket. Fixed: live bell notifications were emitted to room `<id>` but sockets join `user_<id>` → never delivered (also one pitch-lead chat emit). After deploy the Supabase policy "Public read-only notifications" can be dropped. Still open: support_tickets / ticket_messages.

## 14. LAUNCH DAY CHECKLIST (public launch — do all, in this order)
1. Supabase → Project Settings → API: rotate the service-role key (JWT secret) → put the new key in Cloud Run as `SUPABASE_SERVICE_ROLE_KEY` (old one was exposed by the removed `/api/admin/run-sql`).
2. Rotate Razorpay key secret and Resend API key → update Cloud Run.
3. Cloud Run: `PAYMENTS_TEST_MODE=false` (test mode accepts fake payments and shows OTP codes on screen).
4. Cloud Run: `DEMO_LOGIN` and `DEMO_SEED` must NOT be set.
5. Supabase → Authentication → Providers → Email: "Allow new users to sign up" OFF; Authentication → Settings: global sign-up OFF (the app does not use Supabase Auth).
6. Confirm buckets `content-submissions`, `live-proofs`, `ugc-assets`, `kyc-documents` are private.
7. Confirm RLS: no `{public}`/anon "allow all" policies left (only public SELECT on brand_profiles / creator_profiles).
8. Smoke test: signup, login, Google login, brand + creator onboarding, create campaign, contract sign (email OTP), escrow payment (real ₹1 test), deliverable video plays for both parties, approve → admin "Payout due", chat live, notification bell live.

## 15. v183
- Helpdesk tables server-only: staff endpoints `/admin/support/tickets` (list) and `PATCH …/:id/status`; ticket messages now owner-or-staff (any logged-in user could read any ticket's messages); helpdesk/help pages poll the API instead of Supabase realtime. After deploy the Supabase policies on support_tickets / ticket_messages can be dropped → no anon access left except public SELECT on brand_profiles / creator_profiles.
- Split: notification helpers (broadcastAdminNotification, sendNotification, activity + super-admin emails) → `backend/notificationService.ts`. server.ts 3,651 → 3,299 lines.
- ChatBox.jsx (3,000 lines, one component) NOT split: needs moving state into hooks with a browser check after each step — do together with manual testing.
- 507 pass, 1 skipped.

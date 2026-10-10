# Ybex — Session 27 Summary (start the next session from here)

**Latest zip:** `version219.zip` (v218 + admin panel audit: real data only) (built on Claude's v215 — `metadata.json` still says "version212 / version-210"; that name is only left over from AI Studio, the code is v215 → v216).
**Language:** Ravi writes Hindi/Hinglish — reply the same way. All in-app / email / tutorial text is **English**.
**State (v219):** 742 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean.

**Rules (unchanged):** `npm run verify` before every zip · WHO + WHEN on every action · status tokens = DB contract · a money claim in the UI must match the server · no competitor names · never edit a test just to make it pass (one session-21 guard test was updated because Ravi changed the delete flow — see §1.5).
**Working rules from Ravi (still valid):** Supabase work via prompts in chat, never in the zip (`scripts/sql/*` stays, tests read it) · no new UI designs, basic UI only; designs come from Claude Design, inside existing sections; admin redesign separate, later · don't show the Phase 2 / Launch-day lists unless asked (see `SESSION_26_SUMMARY.md`) · Ravi sometimes builds in AI Studio from an older version — always check `metadata.json` and diff against the last Claude version.

**Protected changes:** `ARCHITECTURE.md` table now has **58 rules** (56–58 added this session).

---

## 1. Done in session 27

### 1.1 Contract email (Ravi's screenshots: Settings POC email ≠ contract "Auth Email")
- The contract modal always used the **login** email; the verified POC business email from Settings was ignored.
- New `GET /api/contract/signing-email` (`backend/signingEmail.ts`): brand → verified POC email (`brand_profiles.poc_email` / `email`), else login email; creator → login email / business email. Supabase first (the local store is empty after a restart).
- `/otp/send` (contract_sign) checks the address against the same list, from Supabase.
- **Bug removed:** signing with the POC email used to **overwrite the user's login email** (`usr.email = inputEmail`). Gone.
- Desktop `ContractModal.jsx` and mobile `MobileContractSheet.jsx` both ask the server.
- Invite deals: agreement now shows the invite's deliverables / timeline (`thread.invite_terms` from `populateThreadData`), not "Standard Campaign Content Creation" / "TBD". (Was Claude-next #1 in session 26 — done.)

### 1.2 Invite not showing in "Important for you" (showed ~10 min later)
- Cause 1: the dashboard loaded invites **once, on page open**, behind 7 other requests; it never checked again, and never listened to the `invitation_received` socket event.
- Cause 2 (server): the creator lookup used `.or(user_id.eq.X,id.eq.X)` — fails as a whole when `id` is a uuid column → invite saved without the creator's email.
- Cause 3 (possible): no `SUPABASE_SERVICE_ROLE_KEY` → invite kept in one instance's memory only.
- Fix: separate safe lookups; send returns `503 SERVICE_KEY_MISSING` when Supabase is on but the service key is not; list/accept/decline match by user id, **profile id** and email (`isMyInvite`); server emits `bell_notification` too; `NotificationBell` turns invite events into `ybex:invitation`; desktop dashboard + mobile invites card reload on that event, on focus, and every 60 s.

### 1.3 Explore Creators not loading / chats slow
- Explore read `creator_profiles` from the **browser** (every column, every row, no limit). New `GET /api/creators/explore` (service role, public fields only via `stripPrivateProfileFields`, `data:` photos > 4 KB dropped, 1-min cache). `Explore.jsx` and `BrandHomeMobile.jsx` use it; browser read is only a fallback.
- Found: when an image upload fails, `processBase64Image` stores the **base64 string** in the row — multi-MB rows in every `select('*')`. Inbox/thread responses now drop such photos (`slimImage`). The stored rows are still there → Supabase check pending (§2).
- `GET /chat/v2/threads/:id/messages`: thread + messages fetched in parallel, mark-read in the background.
- **Security fix:** `GET /chat/v2/threads/:id` and `/messages` had **no WHO check** — any logged-in user could read any chat by id. Now parties (brand team via `parent_brand_id`) + admins only (`NOT_A_PARTICIPANT`).

### 1.4 Complete wipe out (Ravi's feature, rule 56)
- Admin → user → Enforcement → Delete Account, and the trash button in the users list, open `DeleteAccountPanel.jsx` (basic UI) with two options:
  - **Normal delete** — bin, restorable (existing `POST /admin/users/:id/delete`; now also works for unclaimed creators by profile id). Type `DELETE`.
  - **Complete wipe out** — `POST /admin/users/:id/wipe` (`backend/admin_wipe_routes.ts`, `backend/accountWipe.ts`). Admin password (bcrypt, 5 tries / 15 min). Full admin only; never self / another admin. **Not blocked** when money is held (Ravi: the wipe is a testing tool) — the panel lists the escrow deals/orders once and the admin ticks "Wipe anyway" (`WIPE_HAS_ACTIVE_MONEY` → `force: true`, recorded in the log). Deletes (children first): messages, threads, content submissions, applications, deals, invites, UGC orders (incl. orders on the brand's briefs), briefs, campaigns, notifications, KYC, portfolio, reviews, referrals, sessions, violations, waitlist, profiles, user — and the Supabase Auth user, so the email can sign up fresh. `transactions` **kept**, name/email blanked (Ravi: "tere according"). Missing tables/columns are reported, not fatal. Logged as `wipe_user`.
- Applies to brands, agencies, creators, unclaimed creators.

### 1.4b Ravi's follow-ups (v218)
- **Invite accept = two cards:** the creator's automatic thank-you (`metadata.action === "invite_greeting"`) now renders as a card — `InviteThanksCard` (desktop, `ShortlistCards.jsx`) / `MobileInviteThanksCard` (mobile) — followed by the brand's "Glad to have you on board" offer card. Works for existing chats (no data change).
- **Normal delete keeps all data:** it only marks rows (`is_deleted` on users + profiles + waitlist, email in the deleted list → the user sees the "Account Suspended" screen). The local profile/waitlist rows used to be removed. Data is removed only by the complete wipe.
- **Recycle Bin works:** `GET /admin/users` used to drop deleted accounts, so the bin was always empty — now they are returned marked `is_deleted` (hidden everywhere else). Bin rows have a **Restore** button. `/admin/users/:id/restore` and `/reinstate` now undo everything (`backend/binRestore.ts`: profiles, deleted id/email lists) — before, a restored user stayed hidden.

### 1.4c Admin panel audit (v219, rule 58)
- **Anon reads:** admin Users list, user full profile (KYC/deals/payments), dashboard counts, reports and pending counts read Supabase with the anon client (revoked in session 25 → empty/partial data). All admin route files now use the service-role client. Users list cap 300 → 5000. The users list loads only when the Users tab opens.
- **Fakes removed:** dashboard "100% Escrow Fully Funded" badge and "(10%)"; "Secured Escrow" no longer counts released money. Campaign review "100% Funded" / "₹0 fee" / "Guaranteed on approval" / "99.4% Accuracy"; AI auto-reject toggle labelled "Not built yet" (nothing reads `ai_review_enabled`). Payout modal "0% Hidden Charges". Stock-photo avatars in admin lists; stock thumbnail on UGC team upload; waitlist approval's stock profile photo and invented ₹2,500 rate (two places). Server default landing review ("Aarav Sharma") and default brands (Nike/Puma/Adidas). Creator dashboard default banners (fake boAt/Nike/Mamaearth/mCaffeine campaigns) → one neutral "Browse live campaigns" banner. Landing BrandGrid/BrandGlobe hardcoded logos → only admin-added brands (Ravi).
- **Disputes:** "Full refund / Pay / Split" used to write `refund_status 'PROCESSED'` / `payout_status 'RELEASED'` with no money moved. Now both are queued `PENDING` for the admin to send by hand; the chat says so.
- **Metrics chart (Ravi: real):** server returns stored numbers only (`available: false` otherwise); the random 14-day series, fixed demographics, "+18.4%" and "Verified Live Telemetry" are gone; the client's hardcoded fallback graph too.
- **Dead button:** Chat Moderation → All Threads eye button now opens the chat (read-only).
- Loops: none found. Every admin UI call has a server route.
- **Left as is (Ravi):** creator verification in the Intelligence tab (random score when AI is offline) → Phase 2.
- **Found, not changed (ask Ravi):** landing `ReviewsSection.jsx` has hardcoded testimonials, incl. "reviews" from Nykaa / boAt / Mamaearth / Wow.

### 1.5 Test changes
- New `backend/session27.test.ts` (17 tests, with a small in-memory Supabase stand-in).
- `backend/session21Review.test.ts` "asks before deleting": Ravi's new delete flow replaced `window.confirm` with the panel; the test now checks that one click still never deletes (typed DELETE / password, "cannot be undone"). Policy change, not a pass-fix.

### 1.6 Admin panel retest (code level)
- Every `/admin/*` route has an admin/staff check; every admin-panel API call has a server route.
- Small, not fixed: `GET /admin/users/:id/violations` is full-admin only while the other enforcement routes allow sub-admins.
- A live click-through of the admin panel on Cloud Run is still needed (Ravi).

---

## 2. Still open

### Ravi — now
1. `/api/health` → is `supabase_service_role` **true**? (Invites and the wipe depend on it.) Then `ADMIN_ALERT_EMAIL`, `APP_URL`.
2. Send back the Supabase reports asked for in chat: `brief_requests` columns + rows, `id`/`user_id` types, count of `data:` images in profile tables, anon SELECT on `creator_profiles`; and the user-id columns / FKs of every table (for the wipe).
3. Deploy v216 and test:
   - Brand with a POC email in Settings → contract modal shows the POC email → code arrives → sign works → login email unchanged.
   - Invite → creator's bell rings and "Important for you" shows it within seconds (desktop + mobile); invite deal agreement shows real deliverables/timeline.
   - Explore Creators loads; chat opens faster.
   - Invite accept → chat shows the thank-you card, then the offer card.
   - Admin: normal delete → user sees Account Suspended, data still there → user in Recycle Bin → Restore → logs in normally. Complete wipe on a test brand with no escrow → gone → sign up again with the same email. Wipe on a user with escrow held → warning + "Wipe anyway" → wiped.
4. Session 25/26 tests still open (see `SESSION_26_SUMMARY.md` §2).

### Claude — next
1. Supabase: move stored base64 photos to storage (after Ravi's count), and stop `processBase64Image` from saving base64 when the upload fails.
2. `content-submissions` → private (signed URLs), then `ugc-assets`, `live-proofs`.
3. Admin dispute queue (24–48h timer); admin order-cancel → manual refund queue (ask Ravi, default yes); brand mobile "Order closed" card.
4. From session 23: campaign cancel/refund; remaining browser reads → API; desktop ChatBox → `dealState.js`; multi-instance or max instances = 1 (socket events only reach users on the same instance).
5. Local-only message merge in `/messages` hides two local messages with the same text — low.

### Ravi's decisions still open
- After a paid brief: My Briefs (built) or My Orders?
- Admin order-cancel → manual refund queue? (default yes)
- Company legal name + contract jurisdiction.

## Phase 2 note (add to the Phase 2 list)
- Creator verification (Intelligence tab): today it invents an 85–96 "verified" score when the AI is offline — make it real or say "could not verify".

## Launch-day note (add to the launch list)
- The complete wipe deletes live deals when confirmed. Before launch, decide: keep it, limit it to test accounts, or turn it off.

## 3. New / changed files (session 27)
- **backend/**: new `signingEmail.ts`, `accountWipe.ts`, `admin_wipe_routes.ts`, `binRestore.ts`, `session27.test.ts`; changed `session_routes.ts`, `creators_routes.ts`, `chat_routes.ts`, `server.ts`, `admin_campaigns_settings_routes.ts`, `admin_users_enforcement_routes.ts`, `session21Review.test.ts`.
- **src/**: new `components/admin/DeleteAccountPanel.jsx`; changed `components/chat/ShortlistCards.jsx`, `components/chat/MessageBubble.jsx`, `components/chat/mobile/MobileShortlistCards.jsx`, `components/chat/mobile/MobileMessageRow.jsx`, `components/chat/ContractModal.jsx`, `components/chat/mobile/MobileContractSheet.jsx`, `components/dashboard/CreatorDashboard.jsx`, `components/campaigns/MobileCreatorInvites.jsx`, `components/shared/NotificationBell.jsx`, `components/admin/UserEnforcementPanel.jsx`, `components/admin/AdminUsersTab.jsx`, `pages/dashboard/Explore.jsx`, `pages/brand/BrandHomeMobile.jsx`.
- **Docs:** `ARCHITECTURE.md` rules 56–57; this file.

# Ybex — Session 37 Summary → START SESSION 38 FROM HERE

**Latest code:** `version-256.zip` (contains everything up to v256).
Ravi writes Hindi/Hinglish → reply in Roman Hinglish (he asked: "hinglish broo"); app text is English.
**State:** 987 tests (986 pass + 1 skipped on purpose), tsc, crash guard, vite build, protect check clean.
**Rules:** ARCHITECTURE 1–77 (new 77 = one motion system) + PHASE 2 list.
**Working rule:** discuss first, build after Ravi says "banao"/"start". Locked files only with Ravi's written OK → logged in PROTECTED_CHANGES.md.
**Landing page:** never change anything except what Ravi names (session 37 did not touch it).

## 1. RAVI — TO DO NOW (in this order)
1. Deploy **v256** (includes v255). After deploy run `npm ci` as usual — `gsap` is removed, `tw-animate-css` is added (package-lock.json and bun.lock both updated).
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
6. Test on phone: /apply → admin Approve → Explore · creator UPI/bank save + Request payout · brand dashboard counters · mobile KYC/PAN · chat payout UTR + 15-day line · Terms v1.1 popup · Admin fee offer ON (password, promo line) → fee preview · auto-apply coupon + creator code in Earnings · test broadcast to yourself · Waitlist CSV upload · Brand Refunds card + admin Refund popup · chat (shared socket) · invite link /r/CODE → signup · contract popup "Keep more from this deal" · Explore "Featured" · **animations (session 37): open/close every popup and sheet on phone + desktop, drag a sheet down to close, open a deeper page and press back, switch bottom tabs.**
7. LAST, after all works: Session 31 Prompt 7 (make `content-submissions` private).

## 2. BUILT IN SESSION 37 — animations (v256)
Ravi: "simple, sleek animations like big apps — app dummy na lage"; locked files OK for UI only ("inke ui mai changes ... logic mai nahi").
- **One place for motion:** `src/lib/motion.js` — open ≈ 0.22 s, close ≈ 0.16 s, no bounce; sheet / modal / drawer / fade presets; page direction; `countUp`, `revealChildren`.
- **Popups:** `src/components/common/Popup.jsx` → `Presence` (AnimatePresence with propagate), `PopupBackdrop` (fade), `PopupPanel` (kind sheet | modal | auto | drawer | fade). Phone = bottom sheet, drag the top edge down to close; desktop = small fade + scale; closing is animated. ~90 popups/sheets converted (creator, brand, admin), shared chat `MobileSheet` got drag-to-close too.
- **Pages:** no more 0.35 s + 0.35 s wait on every navigation (`mode="wait"` removed). Phone: deeper page comes from the right, back from the left, bottom-tab switch = fade. Desktop: short fade.
- **Fixed dead animations:** Tailwind v4 had no `animate-in` / `fade-in` / `zoom-in-95` / `slide-in-from-*` → `tw-animate-css` added (~90 places now animate). Double page fades removed (UGC orders, UGC browse, Collabs, Manage UGC); 0.5 s ones cut to 0.2 s.
- **One library:** GSAP removed (CountUp, dashboard entrance, deal timeline, payout counter → framer-motion helpers).
- **Accessibility:** `MotionConfig reducedMotion="user"` + CSS fallback; phones never scroll sideways during a page slide.
- Tests: `src/lib/motion.test.js` (6); session24Design test waits for the closing animation.
- 23 locked screen files changed, animation lines only (list + Ravi's words in PROTECTED_CHANGES.md); no logic file changed; call groups unchanged.

Not done / ideas for later (ask Ravi first): Android back button closing an open sheet instead of leaving the page; shared-element transitions (card → detail); skeleton→content cross-fade on every list.

## 3. OPEN / PHASE 2 (see ARCHITECTURE.md)
Fee Option B (all-inclusive brand price) · 72 h auto-approval (then contract line) · promo email system + notification settings · videos to Cloudflare R2 (when storage > 700 MB, egress > 3.5 GB/month or > 20 UGC orders/week) · brand coupons (needs Option B) · brand referral · CA: TDS/GST on referral rewards and receipts · company registration details in Terms · lawyer review when possible · market-intelligence / ybex_sync columns (left on purpose) · DPDP paperwork · delete account / download data.
Not to build: Pay & hire, Fund all / Nudge, Chat before accept.

---
# Earlier sessions
See SESSION_36_SUMMARY.md (sessions 35–36) and older summaries.

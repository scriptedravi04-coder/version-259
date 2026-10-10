# Ybex — Session 29 Summary (start the next session from here)

**Latest zip:** `version223.zip` (v222 + dashboard fixes). `metadata.json` still says "version212" — AI Studio leftover.
**Language:** Ravi writes Hindi/Hinglish — reply the same way. All in-app text is English.
**State:** 799 tests pass, 1 skipped on purpose; `tsc`, crash guard and build clean. Lock (rule 60) unchanged — no locked file edited.
**Rules:** same as session 28. `ARCHITECTURE.md` now has **63 rules** (62–63 added).
**Note:** Ravi's session-29 phone screenshot was on `version219.ai.studio` — v220+ were not deployed yet.

## 1. Done
- **Modal/drawer covered only part of the screen, page scrolled behind it** (desktop + mobile, invite modal + notification drawer). Cause: `PullToRefresh` always set `translate3d(0,0,0)`, which traps `fixed` children. Now `transform: none` at rest. New `ModalPortal` (render into body) + `useScrollLock` (locks body and `#app-scroll-container`), used by `CreatorReviewInvitationModal` (server calls unchanged) and `NotificationBell`.
- **New `GET /dashboard/creator`** (`backend/creatorDashboard.ts`, read-only, creators only): earnings (released this month / in escrow / total, Earnings-page rules, IST month), open work + recent completed (campaign deals + UGC orders: brand, title, stage, creator's next step, real amount labelled "Agreed fee" / "Your payout", thread link), counts, profile views (read, not incremented).
- **CreatorDashboard** uses it: fixes ₹0 on deal cards (`agreed_rate` did not exist), "Monthly Earnings" (was all escrow money) → "Earned This Month" + "in escrow" note, ₹0 flash on live refresh, self-counted profile views. Removed fake trend pills, sparklines, stock shoe photo, "Brand Partner", fake match %, fixed "₹10,000", fixed "1d ago".
- **Active Deals:** tabs All active / Needs you / With brand / Completed — completed never in active. Cards open the chat. "View All" → `/collabs`.
- **Important For You** invite card fits its box (was overflowing).
- Tests: `backend/session29.test.ts` (17).

## 2. Open
- Ravi: deploy v223; retest invite modal + notification drawer (desktop + phone), dashboard numbers vs Earnings page.
- Ravi to decide: unlock `creators_routes.ts` so the public profile route does not count the creator's own views (the dashboard no longer calls it, but visiting own public profile still counts).
- "Brands Hiring Creators Like You" logos — Ravi added them on purpose; leave.
- Dashboard redesign: Ravi builds UI with Claude Design (prompt given in chat). Same fake fallbacks still exist in `CampaignCard.jsx` (`budget_min || 10000`) and `CampaignMiniList.jsx` (`|| 15000`); mobile home stats not checked yet.
- Session 28 open list still valid (agreements v1, `[slow-api]` logs, etc.).

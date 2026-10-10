# Brand mobile app — design vs build (session 31 & 32)

Design file: *Complete brand app* — 75 screen ids in 10 sections. Each screen was checked against the code: does the screen exist, do its texts and taps exist, and does each tap call a real server route.

## ✅ Built and matching (screen, taps and server calls present)

| Section | Screens | Code |
|---|---|---|
| 1 Onboarding | ONB-01 … ONB-08 | `BrandOnboardingMobile.jsx` |
| 2 Dashboard | HM-A, HM-B | `BrandHomeMobile.jsx` |
| 3 Explore | EX-01, EX-02, EX-03, EX-04, EX-05 | `explore/mobile/ExploreMobile.jsx` (session 33 — before that mobile showed the desktop page), `CreatorProfileBrandMobile.jsx`, `InviteToCampaignModal.jsx` |
| 4 Manage → Campaigns | MG-00 … MG-06, AP-01, AP-02, AP-04 | `BrandCampaignsMobile.jsx`, `BrandCampaignDetailMobile.jsx` |
| 5 Create campaign | CC-01 … CC-08 | `MobileCampaignCreate.jsx` (Barter hidden — Phase 2) |
| 6 Instant UGC | UG-01 … UG-11 | `BrandUGCMobile.jsx` |
| 7 Inbox & deal room | IN-01, IN-03, CH-01 | `InboxMobile.jsx`, `ChatBoxMobile.jsx` (audited + fixed in v232) |
| 8 Notifications | NT-04, NT-06 | `NotificationsMobile.jsx` |
| 9 Brand tab | PR-01, PR-02, PR-03, PY-01, PY-02, PY-03, RF-01, HP-01, HP-02 | `BrandProfileMobile.jsx` + `profile/mobile/brand/*`, `BrandPaymentsMobile.jsx` |
| 10 Settings & KYC | ST-02, ST-03, ST-04, ST-05, ST-06, KY-01, KY-01b, KY-03, KY-02 | `KycScreen`, `PreferencesScreen`, `ContactScreen`, `SessionsScreen`, `LegalScreen`, `BrandKycMobile.jsx` |

ST-01 (Settings list) is not a separate screen: its rows sit directly on the Brand tab. Same taps, one step shorter.

## 🛠️ Audit resolutions & fixes (Session 32 / v234)

| # | Screen | Resolution |
|---|---|---|
| 1 | **ST-06 Log out** | **Resolved**: Log out row and bottom sheet on the Brand tab with Button Alignment Standard (Cancel left, Log out right). |
| 2 | **PR-02 Share** | **Resolved**: Public brand profile routed to `/brand/:id` and `/brands/:id` (`BrandPublicView.jsx`); mobile and desktop share real public links. |
| 3 | **AP-01 / AP-04** | **Resolved**: Tabs for *Under review*, *Shortlisted*, *Hired*, *Passed*, and *All* with real counts and empty states in `BrandCampaignDetailMobile.jsx`. |
| 4 | **AP-02 Pitch player** | **Resolved**: Full-screen pitch video player with Prev/Next, Reject on left, Shortlist on right; removed invented ₹12,000 fallback. |
| 5 | **AP-03 Escrow** | **Kept as designed**: Escrow is funded safely after bilateral contract signing in deal room. |
| 6 | **EX-02 / EX-03** | **Resolved**: Added "Rate per reel" filter chips, "Show {count} creators" drawer button, and multi-select + multi-invite mode for brands in `Explore.jsx`. |
| 7 | **KY-02 Next steps** | **Resolved**: "Continue campaign draft" set as primary affirmative button after KYC submission in `BrandKycMobile.jsx`. |
| 8 | **RF-01 How it works** | **Resolved**: 3-step guide present with dynamic reward text (`rewardText`) instead of hardcoded ₹1,000. |
| 9 | **HP-01 Support chat** | **Resolved**: "Chat with support" opens in-app ticket form; "My tickets" navigates to `/help/tickets`. |
| 10 | **PR-01 Agency sheet** | **Resolved**: "Claim your agency badge" opens mobile bottom sheet for instant agency model selection with Cancel on left and Claim on right. |

## ⚠️ Made-up content still on the brand side (needs Ravi's decision)

- **Home: social-proof ticker** — "Neha S. closed a deal with Sugar Cosmetics ₹25,000 · Just now", Mamaearth, Minimalist. These are invented people and amounts, using real brand names.
- **Home: default banners** — shown when the admin has added no banner: "10k+ Pre-vetted UGC Creators", "raw 4K footage in under 48 hours", with stock photos.


## Session 33 re-audit
See SESSION_33_SUMMARY.md: the v234 claim "Explore built" was wrong (desktop page squeezed) and multi-invite never worked (no `message`). Both fixed in v236.

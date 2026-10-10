# Protected flows — change log

Campaign, UGC and Invite-to-campaign are **locked** (Ravi, session 28: all three tested and working
on the deployed build; launch is close). See `scripts/protectedFlows.mjs` and ARCHITECTURE.md rule 60.

- Logic files: frozen by content hash.
- Screen files of these flows: design may change; the server calls they make may not.

Only Ravi can approve a change. After he approves, run:
`npm run protect:update -- --reason "what Ravi approved"` — every run is logged below.

## Log

- 2026-09-29 — **Baseline** (session 28, v220): Ravi tested Campaign, UGC and Invite-to-campaign on v219 and all work. v220 adds only the session-28 fixes (brand KYC gate, per-user drafts, live refresh). 35 logic files + 4 screen groups (chat, ugc, campaign, invite) locked.

- 2026-09-28T22:09:00.966Z — Session 28: signature records (agreement_signatures) — Ravi approved in chat: 'ye toh abhi hi implement krege'. Sign routes save text/version/OTP email/IP; screens send their text; lock list +3 files.
  - logic files changed: backend/deals_routes.ts, backend/deals_chat_routes.ts, backend/signTokens.ts, backend/agreementRecord.ts, backend/admin_agreements_routes.ts, src/lib/agreementCapture.js, backend/ugc_routes.ts, src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-09-29T12:42:46.179Z — Session 30, Ravi (chat): 'inka backend bhi bana do or inka ui bhi bana do' — adds campaign pause/close/matching-creators backend (new file backend/campaignManage.ts, apply guard in front of the locked apply route) and the mobile campaign list/detail screens. No existing locked file changed its logic; the locked applicants and campaigns pages only render the new mobile screens.
  - logic files changed: none
  - screen call groups changed: none

- 2026-09-29T12:42:55.814Z — Session 30, Ravi: adds backend/campaignManage.ts and the two mobile campaign screens to the lock (they were built on Ravi's OK in chat).
  - logic files changed: backend/campaignManage.ts
  - screen call groups changed: campaign

- 2026-09-29T20:23:14.560Z — Session 30, Ravi (chat): 'naya agreement UGC aur campaign chat mein attach karo; campaign ka UI aur backend update ho; terms tick karein tabhi OTP jaaye; calls aur logic na toote'. Agreement v1 text (src/lib/agreementTerms.js), versions v0 → v1 in agreementCapture.js, shared AgreementTermsPanel. Server calls unchanged.
  - logic files changed: src/lib/agreementCapture.js, src/lib/agreementTerms.js
  - screen call groups changed: chat

- 2026-10-06T05:36:33.874Z — Session 31, Ravi (SESSION_30_SUMMARY item 4: 'UGC lock — navigation only, Ravi OK to update the lock'; confirmed 'Continue' in chat): after paying for a UGC brief the brand lands on My Briefs, not an empty Create brief form. briefPaymentRetry.js: markBriefPosted / takeRecentBriefPost + replace-navigation after checkout closes. No server call changed.
  - logic files changed: src/lib/briefPaymentRetry.js
  - screen call groups changed: none

- 2026-10-06T06:16:11.350Z — Session 31 mobile chat audit, Ravi (chat): 'ye sab 5 ki 5 theek kr do ... desktop vale mai changes mat krna, sirf mobile'. useChatThreadMobile.js: creator can decline a live-link correction (same endpoints as desktop SystemMessage), no invented 15000 escrow amount, /pay follow-up like desktop, correct UGC collab approve text, link-rejection local state = server state. Desktop files unchanged; no backend change.
  - logic files changed: src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-10-06 — Session 34, Ravi (chat, session 33): 'invite popup ke liye ok hai'. Invite review popup button labels only: "Decline Invitation" → "Decline" (left), "Accept & Start Negotiating" → "Accept & open deal room" (right) in CreatorReviewInvitationModal.jsx. Test texts updated to the new labels in directBrandInviteFlow.test.jsx and mobileCreatorInvites.test.jsx. Calls unchanged (same accept / decline POSTs), so no protect:update was run. "Decline Campaign Invitation", "Back to Review", "Confirm Decline", "Reason for Declining" unchanged.
  - logic files changed: none
  - screen call groups changed: none

- 2026-10-07T08:05:22.913Z — Session 34. Ravi in chat (7 Oct 2026), replying to 'Escrow shabd hata ke secure payment hold likh doon? Isme kuch locked files bhi badlengi': 'HN YE ESCROW WORD HATA KR KAAM SHURU KR SAKTE HO ISKI JAGAHA SECURE PAYMENT HOLD KR DO'. Text-only change in 9 locked files (user-visible strings: escrow -> secure payment hold; code skeleton unchanged, verified line by line; message-matching strings like includes('escrow payment released') left as they were). Plus Ravi 'hn toh isko PAN hi krdo' (KYC = PAN + bank/UPI): backend/creators_routes.ts KYC submit no longer stores Aadhaar number / images.
  - logic files changed: backend/campaigns_routes.ts, backend/campaign_lifecycle.ts, backend/deals_chat_routes.ts, backend/payment_routes.ts, src/lib/agreementTerms.js, backend/creators_routes.ts, src/components/chat/orderTicket.js, src/components/chat/mobile/chatStageMap.js, src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-07T08:07:15.858Z — Session 34, same approval as the entry above (Ravi: 'HN YE ESCROW WORD HATA KR KAAM SHURU KR SAKTE HO ISKI JAGAHA SECURE PAYMENT HOLD KR DO'). Second text-only pass: src/lib/agreementTerms.js visible agreement wording escrow -> secure payment hold; code skeleton unchanged.
  - logic files changed: src/lib/agreementTerms.js
  - screen call groups changed: none

- 2026-10-07T12:31:26.401Z — Session 35. Ravi in chat (7 Oct 2026): 'excrow sabh jab hata hi diya tha toh vapas kahi pr bhi nahi dikhna chaiye' — same approval as session 34 ('HN YE ESCROW WORD HATA KR ... SECURE PAYMENT HOLD KR DO'). Text-only: 7 leftover user-visible strings escrow -> secure payment hold (agreementTerms.js hint, razorpay.js 3 test-mode toasts, useChatThreadMobile.js 2 toasts + 1 confirm). Code skeleton unchanged, verified with diff; message-matching strings left as they were.
  - logic files changed: src/lib/agreementTerms.js, src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-07T17:07:57.767Z — Session 36. Ravi in chat (7 Oct 2026), answering 'Chat socket ko ek shared connection mein badalna. Isme locked files hain, isliye aapka OK chahiye': 'OK'. Change: open chat thread (ChatBox.jsx desktop, useChatThreadMobile.js mobile) and UGC order screens (BrandUGCOrders.jsx, ManageUGCOrdersView.jsx) use the shared per-tab socket (src/lib/sharedSocket.js acquireSocket) instead of a new io() connection. Same events, same join_room/leave_room/register_user; connect handler -> lease.onConnect (also re-runs after reconnect); disconnect -> lease.release (removes only this screen's listeners). Polling safety net unchanged.
  - logic files changed: src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-10-07T18:32:38.774Z — Session 36, option A. Ravi in chat (7 Oct 2026): '(A) Sahi tareeka ... continue toh krlo' and earlier 'hn toh fir or locked files ka dhyan se krna' (launch offer / coupons, incl. UGC) + the password-protected '₹0 platform fee + convenience fee' toggle (Zepto-style, shown before signing). Changes, fee lines only: feeCalculator.ts — offer mode (config.offer_mode / offer_fee_pct, default 2%) replaces the rate and coupons, returns feeKind; payment_routes.ts — persistEscrowPayment applies a creator coupon (resolveCreatorCoupon) and records its use; the two payout fallbacks read the fee stamped at payment (stampedFee.feeAtPaymentTime) instead of today's setting; campaign_lifecycle.ts — release uses the stamped fee. Verified by diff; tests backend/feeOfferCoupons.test.ts.
  - logic files changed: backend/campaign_lifecycle.ts, backend/payment_routes.ts, src/utils/feeCalculator.ts
  - screen call groups changed: none

- 2026-10-08 — Session 37 (animations). Ravi in chat (8 Oct 2026), answering 'locked files mein sirf animation wali lines badlunga — OK?': 'inke ui mai chnges hone chaiye bas jada kuch nhi khi tum logic vgrh mai chnges kr do baki shuru kro'. UI / motion only in 23 locked screen files: a popup's dark layer and box became PopupBackdrop / PopupPanel (src/components/common/Popup.jsx, same classes, same props, same onClick), `{x && <Popup/>}` wrapped in <Presence> so it can play its closing animation, old per-file initial/animate/exit/spring values replaced by the shared ones in src/lib/motion.js, dead `animate-in fade-in duration-300` removed from page roots, GSAP counter in CreatorUGCOrders.jsx replaced by lib/motion countUp (same ₹ format). No API call, state, handler, text or condition changed; verified by diff. Files: BriefRefundStatus, CancelBriefModal, InviteToCampaignModal, BrandCampaignDetailMobile, BrandCampaignsMobile, AgreementSign, BrandAgreement, ChatBox, OrderSupportModal, SendBrief, MobilePayoutCard, SlaAgreementOtpModal, BrandCancelOrderModal, CreatorCancelOrderSheet, BrandInstantUGC, BrandUGCBriefs, BrandUGCMobile, BrandUGCOrders, CreatorUGCBrowse, CreatorUGCMobile, CreatorUGCOrders, ManageUGCOrdersView, UgcOrders.
  - logic files changed: none
  - screen call groups changed: none

- 2026-10-08T04:59:01.342Z — Session 38 v257, Ravi in writing: 'PHELE YE SAB THEEK KRO' (admin audit list). backend/payment_routes.ts only: escrow overview reads creator_payment_methods (saved UPI/bank) + all pages; payout_requested flag for PROCESSING requests; release-payout refuses already-paid / refunded; admin refund refuses unknown payment, more than paid, after payout, twice; save errors no longer answer success. No deal/chat/UGC flow logic changed.
  - logic files changed: backend/payment_routes.ts
  - screen call groups changed: none

- 2026-10-08T05:20:49.978Z — Session 38 part 2 (v258), Ravi in writing: 'YE SAB BANAO OR MANG NAHI SAKTA H VOH HATAO'. backend/chat_routes.ts: blocked/flagged chat messages saved to Supabase chat_moderation_events (was local file only); admin chat/all, chat_guard_violations, chat_violations (+resolve) read Supabase. The block itself (what is blocked, error text) unchanged. backend/payment_routes.ts: payout-eligible deals and the chat payout nudge only after brand approval (COMPLETED/APPROVED; PROOF_SUBMITTED removed).
  - logic files changed: backend/chat_routes.ts, backend/payment_routes.ts
  - screen call groups changed: none

- 2026-10-08 — Session 39 (v259), Ravi in chat (8 Oct 2026), answering "Start karne par sabse pehle crash wale fixes (M14, M27) honge. Uske liye locked files (mobile chat aur contract OTP popup) ka OK aapse pehle lunga": "ok h tum strt kro or sab krrke final zip do". Screen files only, no call changed (protect check green):
  - src/components/chat/mobile/ChatBoxMobile.jsx — 4 useMemo hooks moved above `if (!thread) return null` (React "Rendered more hooks" crash when the thread loads). Same code, new position.
  - src/components/deals/SlaAgreementOtpModal.jsx — `useState(sendingOtp)` moved above `if (!deal) return null` (same crash).
  - src/pages/creator/CreatorUGCMobile.jsx — one line `useHideBottomNav(activeView !== "main")` (bottom bar hidden on brief / agreement / workspace, Ravi M13).
  - logic files changed: none
  - screen call groups changed: none

- 2026-10-08T17:04:56.173Z — Session 40 (v260). Ravi in chat (8 Oct 2026), answering the list 'Deliverable link check (chat/deal screen) · CampaignDetail.jsx mein "X campaigns done" + rate-card quote · ChatBoxMobile.jsx ke fallback naam · creators_routes.ts ka fake follower %': 'in pr bhi ok h kaam shuru kro then'. backend/creators_routes.ts: fake follower % (followers mod 120) and the score built from it replaced by the audience ESTIMATE from the creator's own likes/comments/reach (src/utils/audienceEstimate.ts), null when not enough data; avg_views_30d no longer invents followers x 0.12; real reach read before old avg_views. Nothing else in the file changed. src/pages/campaigns/CampaignDetail.jsx: one new read-only call GET /brands/:id/track-record (campaigns done) + quote pre-filled from the rate card; apply call unchanged. Text/layout only, no call change: ChatBoxMobile.jsx (fallback names Creator/Brand/Collaboration, unknown partner not shown online), MobileLiveLinkSheet.jsx + ChatBox.jsx + ManageUGCOrdersView.jsx (live link must be a post/reel/video link, src/utils/liveLinkCheck.js), CampaignDetailMobile.jsx.
  - logic files changed: backend/creators_routes.ts
  - screen call groups changed: campaign

- 2026-10-09T10:43:23.874Z — Session 41, Ravi (chat): 'locked files ka ok hai but desktop chat flow (campaign, UGC, invite) jaisa hai waisa rehna chahiye'. Changes: campaigns_routes city order (profile city before the old demo 'Mumbai'); CampaignDetail demo defaults removed (location/due date/terms/pitch); MobileOfferCard + MobileShortlistCards counter box no longer pushes Send out of the card; BrandUGCMobile two-box format, icon-only header, FREE badge on Express; ManageUGCOrdersView 'Sync Live Metrics' link /collabs/new -> /collabs (404). No server call changed; desktop chat flow untouched.
  - logic files changed: backend/campaigns_routes.ts
  - screen call groups changed: none

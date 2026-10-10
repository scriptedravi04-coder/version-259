import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createCoalescedRunner, sortChronologically } from "../../../lib/chatSync";
import { isUgcThread as sharedIsUgcThread } from "../../../utils/dealFlow";
import { acquireSocket } from "../../../lib/sharedSocket";
import { processRazorpayPayment } from "../../../lib/razorpay";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import { AGREEMENT_VERSIONS } from "../../../lib/agreementCapture";
import { getDealAmount, deriveDealState } from "../dealState";

// Same endpoints ChatBox.jsx uses (backend/deals_chat_routes.ts, chat_routes.ts) —
// intentionally not shared code with ChatBox.jsx yet, to avoid risking the
// battle-tested desktop chat while the mobile UI is being built out screen by screen.
export default function useChatThreadMobile(thread, user) {
  const [localThread, setLocalThread] = useState(thread);
  const [messages, setMessages] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // One in-flight guard per money / state-moving action. A double tap on "Approve" or "Submit
  // link" used to send the request twice.
  const busyRef = useRef({});
  const runOnce = useCallback(async (key, fn) => {
    if (busyRef.current[key]) return undefined;
    busyRef.current[key] = true;
    try {
      return await fn();
    } finally {
      busyRef.current[key] = false;
    }
  }, []);

  const currentThread =
    localThread && (localThread.id === thread?.id || localThread.deal_id === thread?.id)
      ? localThread
      : thread;

  const isBrand = user?.role === "brand" || user?.user_type === "brand";

  const isUgcOrder = sharedIsUgcThread(currentThread);

  const isCreatorSigned = Boolean(
    currentThread?.agreement_signed_creator ||
    currentThread?.is_signed_creator ||
    currentThread?.creator_signed ||
    currentThread?.contract_signed_creator
  );
  const isBrandSigned = Boolean(
    currentThread?.agreement_signed_brand ||
    currentThread?.is_signed_brand ||
    currentThread?.brand_signed ||
    currentThread?.contract_signed_brand
  );
  const isMySignatureSigned = isBrand ? isBrandSigned : isCreatorSigned;
  const isOtherPartySigned = isBrand ? isCreatorSigned : isBrandSigned;

  const refreshThread = useCallback(async () => {
    if (!thread?.id) return;
    try {
      const { data } = await api.get(`/chat/v2/threads/${thread.id}`, { bypassCache: true });
      if (data) setLocalThread(data);
    } catch (err) {
      console.error("[mobile chat] refreshThread failed:", err);
    }
  }, [thread?.id]);

  const loadMessages = useCallback(async () => {
    if (!thread?.id) return;
    try {
      const { data } = await api.get(`/chat/v2/threads/${thread.id}/messages`, { bypassCache: true });
      if (Array.isArray(data)) {
        setMessages(data.filter((m) => m.content !== "⏳ Waiting for the other party to sign."));
        setLoadError(null);
      }
    } catch (err) {
      console.error("[mobile chat] loadMessages failed:", err);
      setLoadError(err?.response?.data?.detail || err?.message || "Failed to load messages");
    }
  }, [thread?.id]);

  // Initial load + on thread switch
  useEffect(() => {
    setLocalThread(thread);
    setMessages([]);
    if (thread?.id && !thread?.isNew) {
      refreshThread();
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  // Socket — same event/room names as desktop ChatBox.jsx (register_user / join_room /
  // leave_room), plus the same 6s polling safety-net it uses, so behaviour matches exactly.
  useEffect(() => {
    if (!thread?.id) return;
    // Session 36 (Ravi OK "chat socket"): one shared socket.io connection per tab (src/lib/sharedSocket.js)
    // instead of a new connection per open chat. Same events, same rooms; release() removes only
    // this screen's listeners.
    const socket = acquireSocket(user?.user_id || user?.id);
    // One messages + thread refresh for a burst of socket events (session 23).
    const syncNow = createCoalescedRunner(() =>
      Promise.all([Promise.resolve(loadMessages()), Promise.resolve(refreshThread())])
    );

    socket.onConnect(() => {
      socket.emit("register_user", user?.user_id || user?.id);
      socket.emit("join_room", thread.id);
    });

    socket.on("new_message", (newMessage) => {
      if (!newMessage || (newMessage.thread_id !== thread.id && newMessage.conversation_id !== thread.id)) return;
      setMessages((prev) => {
        const newId = newMessage.id || newMessage.message_id;
        if (prev.some((m) => m.id === newId)) {
          return prev.filter((m) => !(String(m.id).startsWith("temp_") && m.content === newMessage.content));
        }
        const tempIdx = prev.findIndex((m) => String(m.id).startsWith("temp_") && m.content === newMessage.content);
        if (tempIdx !== -1) {
          const copy = [...prev];
          copy[tempIdx] = newMessage;
          return copy;
        }
        return [...prev.filter((m) => !(String(m.id).startsWith("temp_") && m.content === newMessage.content)), newMessage];
      });
    });

    socket.on("thread_updated", (updatedThread) => {
      const tId = updatedThread?.id || updatedThread?.threadId || updatedThread?.thread_id || updatedThread?.deal_id;
      if (!updatedThread || (tId !== thread.id && tId !== thread.deal_id)) return;
      // The event's id may name the order/deal route — never overwrite this thread's id.
      const { id: _eid, threadId: _etid, thread_id: _ethid, _sync: _es, ...patch } = updatedThread;
      setLocalThread((prev) => {
        const merged = { ...prev, ...patch };
        if (prev?.ugc_order && patch.ugc_order) {
          merged.ugc_order = { ...prev.ugc_order, ...patch.ugc_order };
        }
        return merged;
      });
      syncNow();
    });

    socket.on("agreement_signed", (payload) => {
      const tId = payload?.id || payload?.threadId || payload?.thread_id || payload?.deal_id;
      if (!payload || (tId !== thread.id && tId !== thread.deal_id)) return;
      setLocalThread((prev) => ({
        ...prev,
        ...payload,
        status: payload.both_signed ? "ACTIVE" : prev?.status || payload.status,
        flow_state: payload.both_signed ? "ACTIVE" : payload.flow_state || "AGREEMENT_SIGNED",
        agreement_signed_creator: payload.agreement_signed_creator ?? prev?.agreement_signed_creator,
        agreement_signed_brand: payload.agreement_signed_brand ?? prev?.agreement_signed_brand,
      }));
      syncNow();
    });

    socket.on("payment_funded", (payload) => {
      if (!payload || (payload.threadId !== thread.id && payload.thread_id !== thread.id && payload.deal_id !== thread.deal_id && payload.dealId !== thread.deal_id)) return;
      setLocalThread((prev) => ({ ...prev, payment_funded: true, status: "ACTIVE" }));
      syncNow();
      toast.success("Payment received & confirmed in Ybex secure payment hold!");
    });

    socket.on("order_updated", (payload) => {
      if (payload && (payload.id === thread.deal_id || payload.id === thread.id)) {
        syncNow();
      }
    });
    socket.on("deal_updated", (payload) => {
      if (payload && (payload.id === thread.deal_id || payload.id === thread.id)) {
        syncNow();
      }
    });

    // Same polling safety-net as desktop, in case a socket event is missed
    // Safety net for a missed socket event — the socket delivers messages live. It was every
    // 6 s (two requests each time), overlapping itself on slow connections. Now every 15 s,
    // skipped while the previous round is still running or the tab is in the background.
    let pollBusy = false;
    const interval = setInterval(async () => {
      if (pollBusy || (typeof document !== "undefined" && document.hidden)) return;
      pollBusy = true;
      try {
        await Promise.all([Promise.resolve(loadMessages()), Promise.resolve(refreshThread())]);
      } catch (e) {
        /* background refresh — errors surface on the next explicit load */
      } finally {
        pollBusy = false;
      }
    }, 15000);

    return () => {
      syncNow.cancel();
      socket.emit("leave_room", thread.id);
      socket.release();
      clearInterval(interval);
    };
  }, [thread?.id, user?.user_id, refreshThread, loadMessages]);

  const sendText = useCallback(
    async (text) => {
      const msg = (text || "").trim();
      if (!msg || !thread?.id || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const effectiveMyId =
        user?.user_id || user?.id || (isBrand ? currentThread?.brand_id : currentThread?.creator_id);
      const optimistic = {
        id: tempId,
        thread_id: thread.id,
        sender_id: effectiveMyId,
        sender_user_id: effectiveMyId,
        sender_role: isBrand ? "brand" : "creator",
        content: msg,
        message_type: "text",
        created_at: new Date().toISOString(),
        status: "sending",
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const { data } = await api.post(`/chat/v2/threads/${thread.id}/messages`, {
          content: msg,
          message_type: "text",
          sender_role: isBrand ? "brand" : "creator",
          sender_user_id: effectiveMyId,
        });
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (data && withoutTemp.some((m) => m.id === data.id)) return withoutTemp;
          return data ? [...withoutTemp, data] : withoutTemp;
        });
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
        if (err?.response?.data?.blocked) {
          toast.error(err.response.data.error || "Contact details can't be shared in chat.");
        } else {
          toast.error("Message failed to send: " + (err?.response?.data?.error || err?.message || "unknown error"));
        }
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [thread?.id, user, isBrand, currentThread]
  );

  const acceptCounter = useCallback(async () => runOnce("acceptCounter", async () => {
    if (!thread?.id) return;
    try {
      const acceptEndpoint = (thread?.is_ugc || thread?.deal_type === 'UGC')
        ? `/ugc/threads/${thread.id}/brand-accept-counter`
        : `/campaign/threads/${thread.id}/brand-accept-counter`;
      const res = await api.post(acceptEndpoint);
      const data = res.data;
      toast.success("Counter offer accepted! 🤝");
      // The response is { success, thread } — merge the thread, not the envelope (session 23).
      if (data?.thread) setLocalThread((prev) => ({ ...prev, ...data.thread }));
      refreshThread();
      loadMessages();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to accept offer");
    }
  }), [thread?.id, thread?.is_ugc, thread?.deal_type, refreshThread, loadMessages, runOnce]);

  const sendCounter = useCallback(
    async (amount) => {
      const amountNum = Number(amount);
      if (!amountNum || amountNum <= 0) {
        toast.error("Please enter a valid amount.");
        return;
      }
      if (amountNum < 3000) {
        toast.error("Minimum offer amount on the platform is ₹3,000.");
        return;
      }
      try {
        const negotiateEndpoint = (thread?.is_ugc || thread?.deal_type === 'UGC')
          ? `/ugc/threads/${thread.id}/creator-negotiate`
          : `/campaign/threads/${thread.id}/creator-negotiate`;
        const res = await api.post(negotiateEndpoint, {
          counter_amount: amountNum,
        });
        const data = res.data;
        toast.success(`Counter offer of ₹${amountNum.toLocaleString("en-IN")} sent.`);
        // The response is { success, thread } — merge the thread, not the envelope (session 23).
      if (data?.thread) setLocalThread((prev) => ({ ...prev, ...data.thread }));
        refreshThread();
        loadMessages();
      } catch (err) {
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to send counter offer");
      }
    },
    [thread?.id, thread?.is_ugc, thread?.deal_type, refreshThread, loadMessages]
  );

  // ---- Draft / deliverable review (campaign uses approve-content, UGC uses /ugc/orders/:id/approve) ----
  const getUgcOrderId = useCallback(() => {
    return (
      currentThread?.ugc_order_id ||
      currentThread?.ugc_order?.id ||
      (currentThread?.id?.startsWith("ugcord_") ? currentThread.id : null) ||
      (currentThread?.deal_id?.startsWith("ugcord_") ? currentThread.deal_id : null) ||
      (currentThread?.id?.startsWith("thread_ugc_") ? currentThread.id.replace("thread_ugc_", "") : null)
    );
  }, [currentThread]);

  const approveDeliverable = useCallback(async () => runOnce("approveDeliverable", async () => {
    // A UGC approval releases the creator's payout from escrow. One tap used to do it with no
    // warning ("payment happened by itself"). Ask first (session 23).
    // Session 31: a UGC collaboration (reel + live link) only approves the DRAFT here; the payout is
    // released after the live link is approved. Same rule as desktop (dealState isCollabOrder) and
    // as the server (ugc_routes handleUgcOrderApprove). Raw-video UGC releases the payout now.
    const { isCollabOrder } = deriveDealState({ thread: currentThread, messages: [], isBrand: true });
    const releasesPayout = isUgcOrder && !isCollabOrder;
    if (!isCollabOrder && isUgcOrder && typeof window !== "undefined" && !window.confirm("Approve this delivery? This releases the payment from the secure payment hold to the creator and can't be undone.")) {
      return;
    }
    try {
      if (isUgcOrder) {
        const orderId = getUgcOrderId() || thread.id;
        await api.post(`/ugc/orders/${orderId}/approve`);
        toast.success(releasesPayout
          ? "Approved! Payout released to the creator. 🎉"
          : "Draft approved — the creator can now post it and send the live link.");
      } else {
        await api.post(`/campaign/threads/${thread.id}/approve-content`);
        toast.success("Draft approved — creator can now post it live.");
      }
      refreshThread();
      loadMessages();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to approve");
    }
  }), [thread?.id, currentThread, isUgcOrder, getUgcOrderId, refreshThread, loadMessages, runOnce]);

  const requestChanges = useCallback(
    async (feedback) => {
      const fb = (feedback || "").trim();
      if (!fb) {
        toast.error("Please describe what should change.");
        return false;
      }
      try {
        const endpoint = isUgcOrder
          ? `/ugc/threads/${thread.id}/reject-content`
          : `/campaign/threads/${thread.id}/reject-content`;
        await api.post(endpoint, { feedback: fb });
        toast.success("Revision request sent.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to send revision request");
        return false;
      }
    },
    [thread?.id, isUgcOrder, refreshThread, loadMessages]
  );

  // Session 24. Creator declines a revision request — the desktop "Decline Changes" button
  // (ContentProofNotice), same endpoints and body. The mobile card had the form but its handler
  // was an empty function, so nothing was ever sent.
  const declineRevisions = useCallback(
    async (reason) => runOnce("declineRevisions", async () => {
      const fb = (reason || "").trim();
      if (!fb) {
        toast.error("Please give a reason for declining.");
        return false;
      }
      try {
        if (isUgcOrder) {
          const orderId = getUgcOrderId();
          const endpoint = orderId
            ? `/ugc/orders/${orderId}/decline-revisions`
            : `/ugc/threads/${thread.id}/decline-revisions`;
          await api.post(endpoint, { feedback: fb });
        } else {
          await api.post(`/campaign/threads/${thread.id}/decline-revisions`, { feedback: fb });
        }
        toast.success("Changes declined. The brand has been told.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to decline the changes");
        return false;
      }
    }),
    [thread?.id, isUgcOrder, getUgcOrderId, refreshThread, loadMessages, runOnce]
  );

  // Session 31 (Ravi): the creator declines the brand's request to correct the LIVE LINKS. Same
  // endpoints and body as desktop SystemMessage ("live_links_resubmit_request" → Decline):
  // campaign → decline-live-links-resubmission, UGC → /ugc/threads/:id/decline-revisions.
  // (The draft decline above is a different step with a different server handler.)
  const declineLinkResubmission = useCallback(
    async (reason) => runOnce("declineLinkResubmission", async () => {
      const fb = (reason || "").trim();
      if (!fb) {
        toast.error("Please give a reason for declining.");
        return false;
      }
      const targetId = currentThread?.id || thread?.id;
      if (!targetId) return false;
      try {
        const endpoint = isUgcOrder
          ? `/ugc/threads/${targetId}/decline-revisions`
          : `/campaign/threads/${targetId}/decline-live-links-resubmission`;
        await api.post(endpoint, { feedback: fb });
        toast.success("Resubmission request declined. The brand has been told.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to decline the request");
        return false;
      }
    }),
    [thread?.id, currentThread?.id, isUgcOrder, refreshThread, loadMessages, runOnce]
  );

  // ---- Live links (campaign deal or UGC collaboration) ----
  const submitLiveLink = useCallback(
    async (link, notes) => runOnce("submitLiveLink", async () => {
      const rawLink = (link || "").trim();
      if (!rawLink) {
        toast.error("Please paste your live post link.");
        return false;
      }
      const targetId = currentThread?.id || thread?.id;
      if (!targetId) {
        toast.error("No active thread found.");
        return false;
      }
      try {
        const isUgc = Boolean(
          isUgcOrder ||
          currentThread?.is_ugc ||
          currentThread?.type === "ugc" ||
          currentThread?.deal_type === "UGC" ||
          String(targetId).startsWith("ugcord_") ||
          String(targetId).startsWith("thread_ugc_") ||
          String(currentThread?.deal_id).startsWith("ugcord_")
        );

        const payload = {
          link: rawLink,
          links: [rawLink],
          live_link: rawLink,
          notes: notes || "",
        };

        // One POST, no hand-written retry. The old `catch` resent the SAME submission to
        // /chat/v2/..., which reaches the same handler — so whenever the first call's RESPONSE
        // failed, the link was submitted twice (two cards, two notifications). lib/api.js
        // retries GETs only, on purpose. The /deals/:id/add-collab "safety sync" that followed
        // was a third write of the same link and is gone too.
        await api.post(
          isUgc ? `/ugc/threads/${targetId}/submit-live-link` : `/campaign/threads/${targetId}/submit-live-link`,
          payload
        );

        // Optimistically update local thread state so button immediately switches to WAITING FOR APPROVAL
        setLocalThread((prev) => ({
          ...prev,
          live_links_submitted: true,
          live_link: rawLink,
          flow_state: "PROOF_SUBMITTED",
          ugc_order: prev?.ugc_order
            ? {
                ...prev.ugc_order,
                live_links_submitted: true,
                live_link: rawLink,
                status: "LINKS_UNDER_REVIEW",
              }
            : undefined,
        }));

        toast.success("Live link submitted! 🚀");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to submit live link");
        return false;
      }
    }),
    [thread?.id, currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]
  );

  // ---- Secure payment (brand). Same call and arguments as desktop ChatBox.handleEscrowPayment. ----
  const [paying, setPaying] = useState(false);
  const payIntoEscrow = useCallback(async () => runOnce("payIntoEscrow", async () => {
    if (!currentThread?.id) return false;
    // Session 31 (Ravi): no invented amount. The same amount the screen shows (getDealAmount — the
    // agreed amount first); the server still charges the deal's own agreed amount. No amount → stop.
    const grossAmt = Number(getDealAmount(currentThread)) || 0;
    if (!(grossAmt > 0)) {
      toast.error("The deal amount isn't set yet, so payment can't start. Agree on the amount first.");
      return false;
    }
    setPaying(true);
    let ok = false;
    try {
      await processRazorpayPayment({
        dealId: currentThread?.deal_id || currentThread?.id,
        threadId: currentThread?.id,
        campaignId: currentThread?.campaign_id || null,
        creatorId: currentThread?.creator_id || null,
        grossAmount: grossAmt,
        onSuccess: async (res) => {
          ok = true;
          // Same follow-up call as desktop (SystemMessage.handleEscrowPayment). The verified payment
          // already marked the deal funded; this only repeats it (idempotent), so an error here is
          // logged, never shown as a failed payment.
          if (!isUgcOrder) {
            try { await api.post(`/campaign/threads/${currentThread.id}/pay`); }
            catch (e) { console.warn("[mobile escrow] /pay follow-up:", e?.response?.data?.error || e?.message); }
          }
          setLocalThread((prev) => ({ ...prev, ...(res?.thread || {}), payment_funded: true, status: "ACTIVE" }));
          toast.success("Payment secured in Ybex secure payment hold! Creator has been notified.");
          refreshThread();
          loadMessages();
        },
        onError: (err) => {
          toast.error(err?.message || "Razorpay transaction cancelled or failed.");
        },
      });
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "Payment authorization failed");
    } finally {
      setPaying(false);
    }
    return ok;
  }), [currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]);

  const approveLiveLinks = useCallback(async () => runOnce("approveLiveLinks", async () => {
    const targetId = currentThread?.id || thread?.id;
    if (!targetId) return;
    try {
      const isUgc = Boolean(
        isUgcOrder ||
        currentThread?.is_ugc ||
        currentThread?.type === "ugc" ||
        currentThread?.deal_type === "UGC" ||
        String(targetId).startsWith("ugcord_") ||
        String(targetId).startsWith("thread_ugc_") ||
        String(currentThread?.deal_id).startsWith("ugcord_")
      );

      // No retry to a second URL: /mark-complete and /approve are the same handler, and this
      // request releases money.
      if (isUgc) {
        await api.post(`/ugc/threads/${targetId}/mark-complete`, { action: "approve_live_links" });
      } else {
        await api.post(`/campaign/threads/${targetId}/approve-live-links`);
      }

      setLocalThread((prev) => ({
        ...prev,
        status: "COMPLETED",
        flow_state: "COMPLETED",
        payment_status: "RELEASED",
        ugc_order: prev?.ugc_order
          ? {
              ...prev.ugc_order,
              status: "COMPLETED",
              payment_status: "RELEASED",
            }
          : undefined,
      }));

      toast.success("Live links approved — payout released! 🎉");
      refreshThread();
      loadMessages();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to approve live links");
    }
  }), [thread?.id, currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]);

  const rejectLiveLinks = useCallback(
    async (feedback) => runOnce("rejectLiveLinks", async () => {
      const fb = (feedback || "").trim();
      if (!fb) {
        toast.error("Please describe what's wrong with the link.");
        return false;
      }
      const targetId = currentThread?.id || thread?.id;
      if (!targetId) return false;
      try {
        const isUgc = Boolean(
          isUgcOrder ||
          currentThread?.is_ugc ||
          currentThread?.type === "ugc" ||
          currentThread?.deal_type === "UGC" ||
          String(targetId).startsWith("ugcord_") ||
          String(targetId).startsWith("thread_ugc_") ||
          String(currentThread?.deal_id).startsWith("ugcord_")
        );

        if (isUgc) {
          await api.post(`/ugc/threads/${targetId}/reject-content`, { feedback: fb, revision_notes: fb, action: "reject_live_links" });
        } else {
          // No fallback to reject-content: that is the DRAFT revision endpoint. A live-link
          // correction that fell through to it spent a draft revision and moved the deal back to
          // CHANGES_REQUESTED — asking the creator to re-upload a draft the brand had approved.
          await api.post(`/campaign/threads/${targetId}/reject-live-links`, { feedback: fb, notes: fb });
        }

        setLocalThread((prev) => ({
          ...prev,
          // A live-link correction, not a draft revision.
          // Same state the server writes for both flows (ugcLifecycleService / campaign_lifecycle).
          flow_state: "REVISION_REQUESTED_LINKS",
          live_links_submitted: false,
          ugc_order: prev?.ugc_order
            ? {
                ...prev.ugc_order,
                status: "REVISION_REQUESTED",
                live_links_submitted: false,
              }
            : undefined,
        }));

        toast.success("Resubmission requested.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to request resubmission");
        return false;
      }
    }),
    [thread?.id, currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]
  );

  // ---- Deliverable upload (draft submit / revised re-upload), campaign or UGC ----
  // Same pipeline as desktop ChatBox (session 23): the same UGC detection + order-id fallback
  // (mobile's narrower check sent some UGC orders to the campaign endpoint, so the upload
  // "didn't happen"), the same payload fields, and a drive/cloud link as an alternative to a file.
  const uploadDeliverable = useCallback(
    async (file, notes, link) => {
      const t = currentThread || thread;
      if (!t?.id || (!file && !String(link || "").trim())) return false;
      const targetUgcOrderId =
        t?.ugc_order_id ||
        t?.ugc_order?.id ||
        (t?.id?.startsWith("ugcord_") ? t.id : null) ||
        (t?.deal_id?.startsWith("ugcord_") ? t.deal_id : null) ||
        (t?.id?.startsWith("thread_ugc_") ? t.id.replace("thread_ugc_", "") : (isUgcOrder ? t?.deal_id : null));
      const asUgc = Boolean(isUgcOrder || targetUgcOrderId);
      const tid = "mobile-deliverable";
      try {
        let finalVideoUrl = String(link || "").trim();
        if (file) {
          toast.loading("Uploading video…", { id: tid });
          const fileExt = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
          const safeId = String(t.id).replace(/[^A-Za-z0-9_-]/g, "");
          const fileName = `${safeId}-${Date.now()}.${fileExt}`;
          const filePath = asUgc ? `ugc-videos/${fileName}` : `campaign-deliverables/${fileName}`;
          const { data: signedData } = await api.post("/upload/signed-url", {
            bucket: "content-submissions",
            path: filePath,
            contentType: file.type || "video/mp4",
          });
          const { supabase } = await import("../../../lib/supabase");
          const { error: uploadError } = await supabase.storage
            .from("content-submissions")
            .uploadToSignedUrl(signedData.path, signedData.token, file);
          if (uploadError) throw uploadError;
          finalVideoUrl = filePath; // relative path — the server signs it for viewing
        }
        toast.loading("Saving submission…", { id: tid });
        const cleanNotes = (notes || "").trim();
        const submitPayload = {
          videoUrl: finalVideoUrl,
          video_url: finalVideoUrl,
          content_url: finalVideoUrl,
          ...(file ? {} : { driveUrl: finalVideoUrl }),
          notes: cleanNotes,
          creator_notes: cleanNotes,
        };
        if (asUgc) {
          await api.post(`/ugc/orders/${targetUgcOrderId || t.id}/submit`, submitPayload);
        } else {
          await api.post(`/campaign/threads/${t.id}/submit-content`, submitPayload);
        }
        toast.success("Deliverable submitted! The brand has been notified.", { id: tid });
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(
          err?.response?.data?.error || err?.response?.data?.detail || err?.message ||
          "Upload failed. Try again, or paste a Google Drive / Dropbox link instead.",
          { id: tid }
        );
        return false;
      }
    },
    [thread, currentThread, isUgcOrder, refreshThread, loadMessages]
  );

  // ---- Rating ----
  const submitReview = useCallback(
    async ({ rating, communication, timeliness, quality, comment }) => {
      if (!rating || rating < 1 || rating > 5) {
        toast.error("Please give an overall rating.");
        return false;
      }
      try {
        const reviewEndpoint = (thread?.is_ugc || thread?.deal_type === 'UGC')
          ? `/ugc/threads/${thread.id}/submit-review`
          : `/campaign/threads/${thread.id}/submit-review`;
        await api.post(reviewEndpoint, {
          rating,
          communication_rating: communication ?? rating,
          timeliness_rating: timeliness ?? rating,
          quality_rating: quality ?? rating,
          comment: comment || "",
        });
        toast.success("Thanks for the feedback!");
        refreshThread();
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to submit review");
        return false;
      }
    },
    [thread?.id, thread?.is_ugc, thread?.deal_type, refreshThread]
  );

  // ---- Contract signing ----
  // Same two calls the desktop ContractModal.jsx makes: a real OTP to the signer's
  // registered email (backend/session_routes.ts has a dedicated `contract_sign`
  // email template), then POST .../sign once the code verifies.
  const sendSignOtp = useCallback(
    async (email) => {
      const value = String(email || "").trim();
      if (!value || !value.includes("@")) {
        toast.error("No verified email on this account to send the code to.");
        return false;
      }
      try {
        const otpRes = await api.post("/otp/send", {
          value,
          target: "email",
          purpose: "contract_sign",
          recipientName: user?.name || user?.full_name || (isBrand ? "Brand Partner" : "Creator Partner"),
          brandName: currentThread?.brand?.name || currentThread?.brand?.company_name || "Brand Partner",
          creatorName: currentThread?.creator?.name || currentThread?.creator?.full_name || "Creator Partner",
          campaignTitle: currentThread?.campaign_title || currentThread?.ugc_title || "Influencer Partnership Agreement",
          dealAmount: currentThread?.agreed_amount || currentThread?.amount_fixed || "",
        });
        if (otpRes?.data?.code && String(otpRes?.data?.message || "").startsWith("Test mode")) {
          toast.warning(`${otpRes.data.message} Test code: ${otpRes.data.code}`, { duration: 15000 });
        } else toast.success(`Verification code sent to ${value}`);
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.detail || err?.response?.data?.error || "Failed to send the code.");
        return false;
      }
    },
    [user, isBrand, currentThread]
  );

  const signAgreement = useCallback(
    async ({ email, code, agreementText = "" }) => {
      const value = String(email || "").trim();
      const otp = String(code || "").trim();
      if (otp.length < 4) {
        toast.error("Enter the 6-digit code from your email.");
        return false;
      }
      let signToken = null;
      try {
        const verified = await api.post("/otp/verify", { value, code: otp });
        signToken = verified?.data?.sign_token;
      } catch (err) {
        toast.error(err?.response?.data?.detail || err?.response?.data?.error || "Incorrect or expired code.");
        return false;
      }
      try {
        await api.post(`/campaign/threads/${thread.id}/sign`, { offer_id: thread?.id, sign_token: signToken, agreement_text: agreementText, agreement_version: AGREEMENT_VERSIONS.campaignMobile });
        toast.success("Contract signed.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.detail || err?.response?.data?.error || "Failed to execute the agreement.");
        return false;
      }
    },
    [thread?.id, refreshThread, loadMessages]
  );

  const hasCompletedMessage = useMemo(() => {
    return (messages || []).some((m) => {
      const type = (m.message_type || m.type || "").toLowerCase();
      const content = (m.content || m.text || "").toLowerCase();
      const action = (m.metadata?.action || "").toLowerCase();
      const status = (m.metadata?.status || "").toLowerCase();
      return (
        type === "payment_trigger" ||
        type === "payout_released" ||
        type === "payment_released" ||
        type === "live_links_approved" ||
        type === "chat_closed" ||
        action === "live_links_approved" ||
        action === "payout_released" ||
        status === "completed" ||
        content.includes("escrow payment released") ||
        content.includes("payout has been released") ||
        content.includes("payment released") ||
        content.includes("payout released") ||
        content.includes("deliverables & live links approved") ||
        content.includes("collaboration completed") ||
        content.includes("ugc deliverable approved") ||
        content.includes("invoice generated and payment has been processed")
      );
    });
  }, [messages]);

  const isDealCompleted = Boolean(
    currentThread?.isDealCompleted ||
    hasCompletedMessage ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED", "RESOLVED"].includes(currentThread?.status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.ugc_order?.status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.ugc_order?.payment_status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.payout_status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.flow_state?.toUpperCase()) ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number)
  );

  const isEscrowFunded = Boolean(
    currentThread?.payment_funded === true ||
    currentThread?.escrow_funded === true ||
    currentThread?.escrow_hold === true ||
    currentThread?.isEscrowFunded === true ||
    currentThread?.ugc_order?.is_escrow_funded ||
    currentThread?.ugc_order?.escrow_funded
  );

  // Time order, whatever order rows arrived in (socket / poll / local store) — session 23.
  const orderedMessages = useMemo(() => sortChronologically(messages), [messages]);

  return {
    currentThread,
    messages: orderedMessages,
    loadError,
    sending,
    isBrand,
    isUgcOrder,
    isMySignatureSigned,
    isOtherPartySigned,
    isDealCompleted,
    isEscrowFunded,
    hasCompletedMessage,
    sendText,
    acceptCounter,
    sendCounter,
    payIntoEscrow,
    paying,
    approveDeliverable,
    requestChanges,
    declineRevisions,
    declineLinkResubmission,
    submitLiveLink,
    approveLiveLinks,
    rejectLiveLinks,
    uploadDeliverable,
    submitReview,
    sendSignOtp,
    signAgreement,
    refreshThread,
    loadMessages,
  };
}

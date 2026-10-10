import React, { useState, useEffect, useCallback, useRef } from "react";
import { sortThreadsByActivity, threadActivityTime } from "../../../lib/chatSync";
import { Search, Bell, X, ShieldCheck, MessageSquare } from "lucide-react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { peekApi } from "../../../lib/apiSnapshot";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { acquireSocket } from "../../../lib/sharedSocket";
import { getInboxChip, getIsUgcThread } from "../../chat/mobile/chatStageMap";
import ChatBoxMobile from "../../chat/mobile/ChatBoxMobile";
import NotificationsMobile, { resolveNotificationTarget } from "./NotificationsMobile";
import { InboxListSkeleton } from "../../common/MobileSkeletons";

export default function InboxMobile({ role: propRole, onSelectThread = null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId: routeUserId } = useParams();

  const role = propRole || (user?.role === "brand" ? "brand" : "creator");
  const isBrand = role === "brand";

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  // Session 42: open with the last saved list (instant); the server answer replaces it a moment later.
  const savedThreads = (() => {
    const d = peekApi("chat/v2/threads");
    return Array.isArray(d) ? d : Array.isArray(d?.threads) ? d.threads : null;
  })();
  const hadSavedThreadsRef = useRef(savedThreads !== null);
  const [rawThreads, setRawThreads] = useState(() => savedThreads || []);
  const [loading, setLoading] = useState(() => savedThreads === null);
  const [error, setError] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Determine target thread ID from URL search or route params
  const targetThreadId =
    searchParams.get("thread") ||
    searchParams.get("threadId") ||
    searchParams.get("dealId") ||
    searchParams.get("deal_id") ||
    searchParams.get("orderId") ||
    searchParams.get("order_id") ||
    searchParams.get("id") ||
    routeUserId;

  // Fetch threads from backend API
  const fetchThreads = useCallback(async (silentlyArg = false) => {
    // With a saved list already on screen the first load runs quietly (no skeleton flash).
    const silently = silentlyArg || hadSavedThreadsRef.current;
    hadSavedThreadsRef.current = false;
    try {
      if (!silently) setLoading(true);
      // Same as desktop (session 23): 45 s timeout and up to 3 tries — one slow first answer
      // used to leave the inbox empty until a manual refresh.
      let data = null, lastErr = null;
      for (const wait of [0, 2000, 5000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try { ({ data } = await api.get("chat/v2/threads", { bypassCache: true, timeout: 45000 })); lastErr = null; break; }
        catch (e) { lastErr = e; const st = e?.response?.status; if (st === 401 || st === 403) break; }
      }
      if (lastErr) throw lastErr;
      const list = Array.isArray(data) ? data : Array.isArray(data?.threads) ? data.threads : [];
      setRawThreads(list);
      setError(null);
    } catch (err) {
      console.error("[InboxMobile] Error fetching threads:", err);
      if (!silently) setError(err?.message || "Failed to load conversations");
    } finally {
      if (!silently) setLoading(false);
    }
  }, []);

  // Fetch unread notifications count
  const fetchUnreadNotifs = useCallback(async () => {
    try {
      const { data } = await api.get("notifications/unread", { timeout: 8000 });
      if (Array.isArray(data)) {
        setUnreadNotifsCount(data.length);
      }
    } catch (e) {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchThreads();
    fetchUnreadNotifs();

    // Polling fallback. The socket below delivers updates live; this only catches a missed event.
    // It ran every 10 s while one inbox request could take 20–30 s on mobile data, so requests
    // piled up on top of each other and the whole app felt offline. Now: every 30 s, never while
    // the previous one is still running, and not while the app is in the background.
    let pollBusy = false;
    const interval = setInterval(async () => {
      if (pollBusy || (typeof document !== "undefined" && document.hidden)) return;
      pollBusy = true;
      try {
        await Promise.all([fetchThreads(true), fetchUnreadNotifs()]);
      } finally {
        pollBusy = false;
      }
    }, 30000);

    // Socket.io real-time connection
    // Session 31: one shared connection per tab (src/lib/sharedSocket.js).
    const currentUserId = user?.user_id || user?.id;
    const socket = acquireSocket(currentUserId || null);
    // Session 31 (audit): the inbox listened for events the server never sends ("message:new",
    // "thread:update", "threads:refresh", "notification:new", "users:online") and emitted ones it
    // never handles ("join", "user:online"), so it only refreshed on the 30 s poll and online dots
    // never lit. These are the server's real event names (same as desktop Chat.jsx):
    //   thread_updated → the user's room for every deal/order action and new message
    //   new_notification → the user's room;  online_users_list / user_status_change → presence.
    if (currentUserId) {
      socket.onConnect(() => {
        socket.emit("register_user", currentUserId);
        socket.emit("get_online_users");
      });
    }
    let refreshTimer = null;
    const refreshSoon = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; fetchThreads(true); }, 400);
    };
    socket.on("thread_updated", refreshSoon);
    socket.on("new_message", refreshSoon);
    socket.on("new_notification", (n) => {
      if (!n || !currentUserId || n.user_id === currentUserId) setUnreadNotifsCount((prev) => prev + 1);
    });
    socket.on("online_users_list", (users) => {
      if (Array.isArray(users)) setOnlineUsers(users);
    });
    socket.on("user_status_change", ({ userId, status } = {}) => {
      if (!userId) return;
      setOnlineUsers((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (status === "online") return list.includes(userId) ? list : [...list, userId];
        return list.filter((id) => id !== userId);
      });
    });

    // Supabase Realtime Channel
    let supabaseChannel = null;
    if (supabase) {
      try {
        supabaseChannel = supabase
          .channel("inbox-mobile-sync")
          .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, () => {
            fetchThreads(true);
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
            fetchThreads(true);
          })
          .subscribe();
      } catch (sErr) {
        console.warn("[InboxMobile] Supabase realtime sync warning:", sErr);
      }
    }

    return () => {
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.release();
      if (supabaseChannel) {
        supabase.removeChannel(supabaseChannel);
      }
    };
  }, [fetchThreads, fetchUnreadNotifs, user?.id, user?.user_id]);

  // Handle opening a thread when URL target changes or threads load
  useEffect(() => {
    if (!targetThreadId) {
      setActiveThread(null);
      return;
    }
    const tid = String(targetThreadId).trim();
    const found = rawThreads.find(
      (x) =>
        String(x.id) === tid ||
        String(x.deal_id) === tid ||
        String(x.ugc_order_id) === tid ||
        String(x.creator_id) === tid ||
        String(x.brand_id) === tid
    );
    if (found) {
      setActiveThread(found);
    } else if (targetThreadId && !activeThread) {
      // Direct load attempt
      api
        .get(`chat/v2/threads/${targetThreadId}`)
        .then(({ data }) => {
          if (data) setActiveThread(data);
        })
        .catch(() => {});
    }
  }, [targetThreadId, rawThreads]);

  // Map thread items to UI structure
  // Newest activity first, same rule as desktop (session 23).
  const mappedThreads = sortThreadsByActivity(rawThreads).map((thread) => {
    const isUgc = getIsUgcThread(thread);
    const other = isBrand ? thread.creator : thread.brand;
    const unread = Number(thread.unread_count) || 0;
    const actMs = threadActivityTime(thread);
    const ts = actMs > 0 ? new Date(actMs).toISOString() : (thread.updated_at || thread.created_at);

    const chip = getInboxChip(thread, isBrand);

    // Amount formatting
    const rawAmt =
      thread.agreed_amount ||
      thread.amount_fixed ||
      thread.ugc_order?.amount ||
      thread.ugc_order?.creator_payout ||
      thread.campaign?.budget ||
      thread.campaign_budget ||
      0;
    const formattedAmt = rawAmt > 0 ? `₹${Number(rawAmt).toLocaleString("en-IN")}` : "";

    // Subtitle formatting (e.g. "Summer sunscreen · ₹3,000")
    const baseTitle =
      thread.campaign_title ||
      thread.ugc_title ||
      thread.ugc_order?.title ||
      thread.ugc_brief?.title ||
      (isUgc ? "Instant UGC" : "Campaign Collaboration");
    const subtitle = formattedAmt ? `${baseTitle} · ${formattedAmt}` : baseTitle;

    // Partner name
    const rawName = isBrand
      ? other?.name || other?.full_name || other?.profile?.full_name || other?.profile?.name || "Creator"
      : other?.company_name || other?.profile?.company_name || other?.name || "Brand Partner";

    // Partner picture
    const partnerPic = isBrand
      ? other?.photo || other?.picture || other?.avatar || other?.avatar_url || other?.profile_picture_url || ""
      : other?.logo || other?.logo_url || other?.profile?.logo || other?.profile?.logo_url || "";

    const isVerified = Boolean(other?.verified || other?.is_verified || other?.profile?.is_verified);
    const hasKyc = Boolean(other?.kyc_verified || other?.kyc_status === "APPROVED" || other?.is_kyc_verified);

    // Format timestamp nicely
    let timeText = "";
    if (ts) {
      const d = new Date(ts);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        timeText = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      } else if (diffDays === 1) {
        timeText = "Yesterday";
      } else {
        timeText = d.toLocaleDateString([], { day: "numeric", month: "short" });
      }
    }

    return {
      id: thread.id,
      rawThread: thread,
      name: rawName,
      partnerPic,
      tag: isUgc ? "UGC" : "CAMPAIGN",
      isUgc,
      verified: isVerified,
      hasKyc,
      campaign: subtitle,
      status: chip.label,
      statusBg: chip.bg,
      statusText: chip.text,
      statusDot: chip.dot,
      needsAction: chip.needsAction,
      timestamp: timeText,
      unreadCount: unread,
      highlighted: unread > 0,
    };
  });

  // Actionable filter count
  const isActionable = (t) => t.needsAction || t.unreadCount > 0;
  const needsActionCount = mappedThreads.filter(isActionable).length;

  const filters = isBrand
    ? [
        { label: mappedThreads.length ? `All · ${mappedThreads.length}` : "All", value: "all" },
        { label: "Campaigns", value: "campaigns" },
        { label: "UGC", value: "ugc" },
        { label: needsActionCount ? `Needs action · ${needsActionCount}` : "Needs action", value: "action" },
      ]
    : [
        { label: mappedThreads.length ? `All · ${mappedThreads.length}` : "All", value: "all" },
        { label: "Campaigns", value: "campaigns" },
        { label: "UGC", value: "ugc" },
        { label: needsActionCount ? `Due soon · ${needsActionCount}` : "Due soon", value: "action" },
      ];

  const getAvatarBg = (name) => {
    const palette = [
      "bg-[#F3D9C7] text-[#8C4A27]",
      "bg-[#E0D4FC] text-[#5B21B6]",
      "bg-[#D1E7DD] text-[#0F5132]",
      "bg-[#CFF4FC] text-[#055160]",
      "bg-[#FEE2E2] text-[#991B1B]",
    ];
    const code = String(name || "?").charCodeAt(0);
    return palette[code % palette.length];
  };

  const filteredItems = mappedThreads.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      String(item.name || "").toLowerCase().includes(q) ||
      String(item.campaign || "").toLowerCase().includes(q);
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "campaigns" && item.tag === "CAMPAIGN") ||
      (activeFilter === "ugc" && item.tag === "UGC") ||
      (activeFilter === "action" && isActionable(item));
    return matchesSearch && matchesFilter;
  });

  const handleThreadSelect = (item) => {
    if (onSelectThread) {
      onSelectThread(item.id);
    }
    setActiveThread(item.rawThread);
    // Reflect in URL
    setSearchParams({ thread: item.id }, { replace: true });
  };

  const handleBackToList = () => {
    setActiveThread(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("thread");
    newParams.delete("threadId");
    newParams.delete("dealId");
    newParams.delete("deal_id");
    newParams.delete("orderId");
    newParams.delete("order_id");
    newParams.delete("id");
    // Session 43 (Ravi's videos): a chat opened from a notification / link lives in the PATH
    // (/chat/<id>, /brand/inbox/<id>). Only the ?thread= part used to be cleared, so the id stayed
    // in the address — the next list refresh (every 30 s) or a pull-to-refresh opened the same
    // chat again by itself. Back now goes to the plain inbox address.
    if (routeUserId && typeof window !== "undefined") {
      const base = window.location.pathname.replace(/\/[^/]+\/?$/, "") || "/chat";
      const qs = newParams.toString();
      navigate(qs ? `${base}?${qs}` : base, { replace: true });
      return;
    }
    setSearchParams(newParams, { replace: true });
  };

  // If active thread is open, render ChatBoxMobile full-screen
  if (activeThread) {
    // Session 40 (Ravi's iPhone screenshots): the thread used h-full inside the page, so it shared
    // the height with the page footer (half-open chat, "Showcase What Makes You Different" below it)
    // and the composer stayed under the keyboard. Now it is a fixed box exactly as big as the visible
    // screen (--vvh / --vvtop from src/lib/keyboardAware.js): full height normally, and with the
    // keyboard open it ends right above it, so the message box docks on the keyboard.
    return (
      <div
        className="chat-shell fixed left-0 right-0 z-[60] w-full bg-white flex flex-col overflow-hidden"
        style={{ top: "var(--vvtop, 0px)", height: "var(--vvh, 100dvh)" }}
      >
        <ChatBoxMobile
          thread={activeThread}
          user={user}
          onlineUsers={onlineUsers}
          onBack={handleBackToList}
        />
      </div>
    );
  }

  // If notifications view is open, render NotificationsMobile
  if (showNotifications) {
    return (
      <NotificationsMobile
        role={role}
        onBack={() => setShowNotifications(false)}
        onSelectNotification={(notif) => {
          setShowNotifications(false);
          const target = resolveNotificationTarget(notif, role);
          const m = target && target.match(/^\/chat\/([^/?#]+)$/);
          if (m) setSearchParams({ thread: m[1] });
          else if (target && !/\/inbox\/?$/.test(target)) navigate(target);
        }}
      />
    );
  }

  return (
    <div className="h-full bg-white flex flex-col font-sans">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 pt-3.5 pb-2.5 z-10 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Inbox</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotifications(true)}
              className="w-9 h-9 rounded-xl bg-[#F2F2F5] flex items-center justify-center hover:bg-gray-200 transition relative active:scale-95"
              aria-label="View notifications"
            >
              <Bell size={18} className="text-[#0A0A0A]" />
              {unreadNotifsCount > 0 && (
                <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white"></div>
              )}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="h-10 rounded-xl bg-[#F2F2F5] flex items-center gap-2.5 px-3 mb-3">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder={isBrand ? "Search creators or campaigns" : "Search brands or briefs"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-[#0A0A0A] placeholder-gray-400 font-medium"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={`h-7 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
                activeFilter === filter.value
                  ? "bg-[#0A0A0A] text-white shadow-xs"
                  : "bg-[#F2F2F5] text-[#1C1C1E] hover:bg-gray-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inbox List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <InboxListSkeleton count={7} />
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-3">
              <X size={24} />
            </div>
            <h2 className="font-bold text-gray-900 text-sm mb-1">Unable to load conversations</h2>
            <p className="text-xs text-gray-500 mb-4 max-w-[240px]">{error}</p>
            <button
              onClick={() => fetchThreads()}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold hover:bg-violet-700 transition"
            >
              Retry
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty State (Figma Image 3 Panel 3) */
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#F2F2F7] flex items-center justify-center text-[#8E8E93] mb-4">
              <MessageSquare size={26} />
            </div>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">No conversations yet</h2>
            <p className="text-xs text-[#8E8E93] max-w-[280px] leading-relaxed mb-6">
              Chats open automatically once a brief is claimed or an offer is sent. Nothing to archive, nothing to clean up.
            </p>
            <button
              onClick={() => navigate(isBrand ? "/brand/discover" : "/creator/ugc")} /* Session 39 (M20): creators → briefs (Explore UGC) */
              className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold tracking-wide transition shadow-sm active:scale-95"
            >
              {isBrand ? "Explore creators" : "Browse briefs"}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleThreadSelect(item)}
                className={`w-full p-4 flex gap-3.5 hover:bg-gray-50 active:bg-gray-100 transition text-left ${
                  item.highlighted ? "bg-[#FAF8FF]" : "bg-white"
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {item.partnerPic ? (
                    <img
                      src={item.partnerPic}
                      alt={item.name}
                      className="w-12 h-12 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <div
                      className={`w-12 h-12 rounded-full ${getAvatarBg(
                        item.name
                      )} flex items-center justify-center font-bold text-base shadow-2xs`}
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Row 1: Name, Verified, KYC, Type Badge, Timestamp, Unread */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-bold text-[15px] text-[#0A0A0A] truncate">{item.name}</span>
                    
                    {item.verified && (
                      <ShieldCheck size={14} className="text-[#059669] shrink-0 fill-[#059669] stroke-white" />
                    )}

                    {!isBrand && item.hasKyc && (
                      <span className="bg-[#0A0A0A] text-white text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider shrink-0">
                        KYC
                      </span>
                    )}

                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded shrink-0 tracking-wider ${
                        item.isUgc ? "bg-[#F1E8FF] text-[#7C3AED]" : "bg-[#EAF1FF] text-[#2450B8]"
                      }`}
                    >
                      {item.tag}
                    </span>

                    <span className="text-xs text-gray-400 font-normal ml-auto shrink-0 pl-1">
                      {item.timestamp}
                    </span>

                    {item.unreadCount > 0 && (
                      <div className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center shrink-0 ml-1.5 shadow-2xs">
                        <span className="text-[10px] font-bold">{item.unreadCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Row 2: Campaign Subtitle */}
                  <div className="text-[13px] text-gray-500 mb-2 truncate font-medium">
                    {item.campaign}
                  </div>

                  {/* Row 3: Status Badge */}
                  <div
                    className="h-6 inline-flex items-center gap-1.5 px-2.5 rounded-full"
                    style={{ background: item.statusBg, color: item.statusText }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: item.statusDot }}
                    />
                    <span className="text-xs font-semibold tracking-tight">{item.status}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

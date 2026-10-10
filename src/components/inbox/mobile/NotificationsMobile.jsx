import React, { useState, useEffect } from "react";
import { ChevronLeft, Bell, Clock, AlertCircle, CreditCard, MessageSquare, CheckCircle2 } from "lucide-react";
import { api } from "../../../lib/api";
import { NotificationListSkeleton } from "../../common/MobileSkeletons";


// Session 43 (Ravi: "only the red ones open"): every notification goes somewhere. A saved link
// wins; otherwise the thread / campaign ids it carries; otherwise its wording decides the page.
export function resolveNotificationTarget(n, role = "creator") {
  if (!n) return null;
  const meta = n.metadata && typeof n.metadata === "object" ? n.metadata : {};
  const path = n.redirect_path || n.action_url || n.link || meta.link || meta.redirect_path || "";
  if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) return path;
  const threadId = n.thread_id || n.deal_id || n.order_id || meta.thread_id || meta.deal_id || meta.order_id;
  if (threadId) return `/chat/${threadId}`;
  const isBrand = role === "brand";
  const text = `${n.title || ""} ${n.message || n.content || n.body || ""} ${n.type || ""}`.toLowerCase();
  const campaignId = n.campaign_id || meta.campaign_id;
  if (/applied to your campaign|new application/.test(text)) {
    return isBrand ? (campaignId ? `/brand/campaigns/${campaignId}/applicants` : "/brand/campaigns") : "/campaigns";
  }
  if (/payout|payment|released|utr|earning|refund/.test(text)) return isBrand ? "/brand/payments" : "/earnings";
  if (/ugc/.test(text)) return isBrand ? "/brand/ugc/orders" : "/creator/ugc/orders";
  if (/campaign .*(live|under review|re-review|submitted successfully)|is now live/.test(text)) {
    return isBrand ? "/brand/campaigns" : (campaignId ? `/campaigns/${campaignId}` : "/campaigns");
  }
  return isBrand ? "/brand/inbox" : "/creator/inbox";
}

/** Session 43: a real title instead of the bare word "Notification". */
export function notificationTitle(n) {
  const raw = String(n?.title || "").trim();
  if (raw && raw.toLowerCase() !== "notification") return raw;
  const text = String(n?.message || n?.content || n?.body || "").toLowerCase();
  if (text.includes("applied to your campaign")) return "New application";
  if (text.includes("accepted your invitation")) return "Invitation accepted";
  if (text.includes("is now live")) return "Campaign is live";
  if (text.includes("re-review")) return "Campaign sent for review";
  if (text.includes("under review")) return "Campaign under review";
  if (text.includes("invited you")) return "New campaign invite";
  if (/payout|payment/.test(text)) return "Payment update";
  return "Update";
}

/** Session 43 (Ravi): true when this phone has not turned notifications on yet. */
export function needsPushAllow() {
  try {
    if (typeof window === "undefined") return false;
    if (!("Notification" in window)) return true; // iPhone Safari tab: must install first
    return window.Notification.permission !== "granted";
  } catch {
    return false;
  }
}

function AllowPushButton() {
  const [need, setNeed] = useState(needsPushAllow);
  useEffect(() => {
    const recheck = () => setNeed(needsPushAllow());
    window.addEventListener("ybex:push-permission-changed", recheck);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("ybex:push-permission-changed", recheck);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);
  if (!need) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("ybex:open-push-ask"))}
      data-testid="notif-allow-push"
      className="h-8 pl-2.5 pr-3 rounded-full bg-[#F5F0FF] border border-[#DDD6FE] text-[12px] font-semibold text-[#6D28D9] inline-flex items-center gap-1.5 active:scale-95 transition-transform"
    >
      <Bell size={13} strokeWidth={2.4} />
      Allow notifications
    </button>
  );
}

export default function NotificationsMobile({ role = "brand", onBack, onSelectNotification = null }) {
  const [activeTab, setActiveTab] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  // A failed load used to show "You're all caught up" — now it says so and offers a retry.
  const [loadFailed, setLoadFailed] = useState(false);

  const isBrand = role === "brand";

  const tabs = isBrand
    ? [
        { id: "all", label: "All" },
        { id: "orders", label: "Orders" },
        { id: "payments", label: "Payments" },
      ]
    : [
        { id: "all", label: "All" },
        { id: "briefs", label: "Briefs" },
        { id: "payouts", label: "Payouts" },
      ];

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const { data } = await api.get("notifications", { bypassCache: true });
      if (Array.isArray(data)) {
        setNotifications(data);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setNotifications([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      setMarkingAll(true);
      await api.post("notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemClick = async (item) => {
    if (!item.read) {
      try {
        await api.post(`notifications/${item.notif_id || item.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => ((n.notif_id || n.id) === (item.notif_id || item.id) ? { ...n, read: true } : n))
        );
      } catch (e) {
        // silent
      }
    }
    if (onSelectNotification) {
      onSelectNotification(item);
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (activeTab === "all") return true;
    const type = String(item.type || item.subtype || "").toLowerCase();
    const title = String(item.title || "").toLowerCase();
    const msg = String(item.message || "").toLowerCase();

    if (isBrand) {
      if (activeTab === "orders") {
        return (
          type.includes("order") ||
          type.includes("brief") ||
          type.includes("campaign") ||
          type.includes("draft") ||
          type.includes("deliverable") ||
          title.includes("order") ||
          title.includes("draft")
        );
      }
      if (activeTab === "payments") {
        return (
          type.includes("payment") ||
          type.includes("escrow") ||
          type.includes("payout") ||
          title.includes("payment") ||
          title.includes("escrow") ||
          msg.includes("₹")
        );
      }
    } else {
      if (activeTab === "briefs") {
        return (
          type.includes("brief") ||
          type.includes("campaign") ||
          type.includes("order") ||
          type.includes("draft") ||
          title.includes("brief") ||
          title.includes("campaign")
        );
      }
      if (activeTab === "payouts") {
        return (
          type.includes("payout") ||
          type.includes("payment") ||
          type.includes("escrow") ||
          title.includes("payout") ||
          title.includes("payment") ||
          msg.includes("₹")
        );
      }
    }
    return true;
  });

  const getNotificationCategory = (item) => {
    const text = `${item.title || ""} ${item.message || ""} ${item.type || ""}`.toLowerCase();
    if (text.includes("waiting on your review") || text.includes("review draft") || text.includes("sla") || text.includes("reupload")) {
      return {
        color: "amber",
        borderColor: "#F59E0B",
        bg: "#FFFBEB",
        icon: <Clock size={16} className="text-amber-600" />,
        actionLabel: isBrand ? "Review draft" : "Reupload draft",
      };
    }
    if (text.includes("counter") || text.includes("expire") || text.includes("declined") || text.includes("alert")) {
      return {
        color: "red",
        borderColor: "#EF4444",
        bg: "#FEF2F2",
        icon: <AlertCircle size={16} className="text-red-600" />,
        actionLabel: text.includes("counter") ? "Respond to counter" : null,
      };
    }
    if (text.includes("escrow") || text.includes("deposit") || text.includes("payment")) {
      return {
        color: "purple",
        borderColor: "#8B5CF6",
        bg: "#F5F3FF",
        icon: <CreditCard size={16} className="text-purple-600" />,
        actionLabel: null,
      };
    }
    if (text.includes("released") || text.includes("received") || text.includes("completed") || text.includes("approved")) {
      return {
        color: "green",
        borderColor: "#10B981",
        bg: "#ECFDF5",
        icon: <CheckCircle2 size={16} className="text-emerald-600" />,
        actionLabel: null,
      };
    }
    return {
      color: "gray",
      borderColor: "#9CA3AF",
      bg: "#F9FAFB",
      icon: <MessageSquare size={16} className="text-gray-500" />,
      actionLabel: null,
    };
  };

  // Group by calendar day (session 40: "yesterday" used to be "less than 48 hours ago", so an item
  // from two days back landed under Yesterday, and older items showed only a time).
  const now = new Date();
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const todayKey = dayKey(now);
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const yesterdayKey = dayKey(yest);
  const todayItems = [];
  const yesterdayItems = [];
  const olderItems = [];

  filteredNotifications.forEach((item) => {
    const d = new Date(item.created_at || item.timestamp || Date.now());
    const k = Number.isNaN(d.getTime()) ? todayKey : dayKey(d);
    if (k === todayKey) todayItems.push(item);
    else if (k === yesterdayKey) yesterdayItems.push(item);
    else olderItems.push(item);
  });

  const whenText = (iso, older) => {
    if (!iso) return "Just now";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return older ? `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}` : time;
  };

  const renderSection = (title, items) => {
    if (!items || items.length === 0) return null;
    return (
      <div key={title} className="mb-4">
        <div className="text-[11px] font-bold text-gray-400 tracking-wider px-4 py-2 uppercase">
          {title}
        </div>
        <div className="divide-y divide-gray-100 bg-white">
          {items.map((item) => {
            const meta = getNotificationCategory(item);
            const id = item.notif_id || item.id || item._id;
            return (
              <div
                key={id}
                onClick={() => handleItemClick(item)}
                className={`p-4 flex gap-3.5 transition cursor-pointer relative ${
                  item.read ? "bg-white" : "bg-[#FAF8FF]"
                }`}
                style={{
                  borderLeft: `3px solid ${meta.borderColor}`,
                }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: meta.bg }}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-bold text-gray-900 truncate pr-2">
                      {notificationTitle(item)}
                    </span>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {whenText(item.created_at, title === "OLDER")}
                    </span>
                  </div>
                  <p className="text-[13px] text-gray-600 leading-relaxed mb-2">
                    {item.message || item.content || item.body || ""}
                  </p>
                  {meta.actionLabel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition"
                    >
                      {meta.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-[#F8F9FB] flex flex-col font-sans">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 pt-3 pb-3 z-10 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition active:scale-95"
              aria-label="Back to inbox"
            >
              <ChevronLeft size={22} className="text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          </div>
          <div className="flex items-center gap-1.5">
          <AllowPushButton />
          {notifications.some((n) => !n.read) && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="text-xs font-semibold text-violet-600 hover:text-violet-700 px-2 py-1 rounded transition active:opacity-70 disabled:opacity-50"
          >
            {markingAll ? "Marking..." : "Mark all read"}
          </button>
          )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-7 px-3.5 rounded-full text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[#0A0A0A] text-white shadow-xs"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <NotificationListSkeleton count={6} />
        ) : loadFailed ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <h3 className="text-base font-bold text-gray-900 mb-1">Couldn't load notifications</h3>
            <p className="text-xs text-gray-500 mb-4">Check your connection and try again.</p>
            <button
              onClick={fetchNotifications}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
              <Bell size={24} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">You're all caught up</h3>
            <p className="text-xs text-gray-500 max-w-[260px] leading-relaxed">
              Deadlines, secure payment hold movements and payouts show up here first.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {todayItems.length > 0 && renderSection("TODAY", todayItems)}
            {yesterdayItems.length > 0 && renderSection("YESTERDAY", yesterdayItems)}
            {olderItems.length > 0 && renderSection("OLDER", olderItems)}
          </div>
        )}
      </div>
    </div>
  );
}

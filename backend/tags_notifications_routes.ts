import express from "express";
import crypto from "crypto";

// Notification routes (list/unread, mark-all-read, mark-one-read,
// acknowledge, and admin-triggered send) and tag routes (popular tags,
// tag search/autocomplete, and creating a new tag).
// An admin alert (from broadcastAdminNotification) — for staff eyes only, whatever its user_id.
export function isAdminOnlyNotification(n: any): boolean {
  if (!n) return false;
  if (n.is_admin_message === true) return true;
  return String(n.notif_id || n.id || "").endsWith("_all") && String(n.notif_id || n.id || "").startsWith("notif_");
}

export function setupTagsAndNotificationsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    getActingBrandId,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    getActingBrandId: (user: any) => any;
  }
) {
  const getIsoNow = () => new Date().toISOString();

    const POPULAR_TAGS = [
    "Fashion", "Beauty", "Tech", "Lifestyle", "Travel", "Food", 
    "Fitness", "Finance", "Gaming", "Education", "Entertainment",
    "Health", "Wellness", "Self-care", "Gym", "PersonalCare", "HealthCare",
    "OTT", "MotoVlog", "LGBTQ", "Motivation", "Spirituality", "Parenting",
    "Anime", "KPop", "Sports", "Vlog", "Review", "Comedy", "Music", "Art",
    "Automotive", "RealEstate", "Photography", "Videography", "Podcast"
  ];
  
  let ALL_TAGS = [
    ...POPULAR_TAGS,
    "Software", "Unboxing", "Tutorial", "Skits",
    "Dance", "Design", "Streaming", "Esports", "News", "Politics", "Science",
    "History", "Nature", "Animals", "Pets", "DIY", "Crafts",
    "Skincare", "Makeup", "Yoga", "Meditation", "Nutrition", "Diet",
    "Crypto", "Investing", "Trading", "Business", "Marketing", "Sales",
    "Coding", "Web3", "AI", "Startup", "Entrepreneurship", "Books",
    "Movies", "TV", "Drama", "Action", "Thriller", "Horror", "Romance",
    "Comedy", "SciFi", "Fantasy", "Animation", "Documentary", "Indie",
    "Vintage", "Thrift", "Streetwear", "Sneakers", "Luxury", "Jewelry",
    "Accessories", "Watches", "Bags", "Shoes", "Home", "Decor", "Interior",
    "Architecture", "Garden", "Plants", "Landscaping", "Outdoors", "Camping",
    "Hiking", "Fishing", "Hunting", "Survival", "Tactical", "Military",
    "Aviation", "Boating", "Sailing", "Surfing", "Snowboarding", "Skiing",
    "Skateboarding", "BMX", "Motocross", "Racing", "Drifting", "Offroad",
    "Trucks", "Cars", "Motorcycles", "Bicycles", "Scooters", "EVs",
    "Gadgets", "Smartphones", "Laptops", "PCs", "Audio", "Headphones",
    "Speakers", "Cameras", "Lenses", "Drones", "VR", "AR", "Robotics",
    "Space", "Astronomy", "Physics", "Chemistry", "Biology", "Medicine",
    "Psychology", "Sociology", "Philosophy", "Religion", "Theology", "Mythology"
  ];

  router.get(["/notifications", "/notifications/unread"], async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) {
        return res.json([]);
      }

      const actingId = user.role === "brand" ? getActingBrandId(user) : user.user_id;
      const isStaff = user.role === "admin" || user.team_role === "sub_admin";
      const isUnreadOnly = req.path.includes("/unread") || req.query.unread === "true";

      let supabaseNotifs: any[] = [];
      if (supabase) {
        try {
          let q = supabase.from("notifications").select("*");
          if (user.role === "admin" || user.team_role === "sub_admin") {
            q = q.or(`user_id.eq.${actingId},user_id.eq.admin,user_id.eq.all`);
          } else {
            q = q.or(`user_id.eq.${actingId},user_id.eq.all`);
          }

          if (isUnreadOnly) {
            q = q.eq("read", false);
          }

          const { data, error } = await q.order("created_at", { ascending: false }).limit(60);
          if (!error && Array.isArray(data)) {
            // Admin alerts written to 'all' before the fix are still in the table: never show
            // them to a non-admin. (Filtered here, not in the query, so a missing column
            // cannot break the whole list.)
            supabaseNotifs = isStaff ? data : data.filter((n: any) => !isAdminOnlyNotification(n));
          }
        } catch (sErr) {
          console.warn("[Notifications Supabase Fetch Warning]", sErr);
        }
      }

      const db = getDb();
      if (!db.notifications) db.notifications = [];
      const localNotifs = (db.notifications || []).filter((n: any) => {
        const matchesUser =
          n.user_id === actingId ||
          (n.user_id === "all" && (isStaff || !isAdminOnlyNotification(n))) ||
          ((user.role === "admin") && (n.user_id === "admin" || n.is_admin_message));
        if (!matchesUser) return false;
        if (isUnreadOnly && (n.read === true || n.dismissed === true)) return false;
        return true;
      });

      const map = new Map<string, any>();
      for (const item of supabaseNotifs) {
        const id = item.notif_id || item.id;
        if (id) map.set(id, { ...item, notif_id: id });
      }
      for (const item of localNotifs) {
        const id = item.notif_id || item.id;
        if (id && !map.has(id)) {
          map.set(id, { ...item, notif_id: id });
        }
      }

      let list = Array.from(map.values()).sort((a, b) => {
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA;
      });

      // Default welcome notification if list is empty
      if (list.length === 0 && !isUnreadOnly) {
        const welcomeNotif = {
          notif_id: `welcome_${actingId}`,
          user_id: actingId,
          title: "Welcome to YBEX!",
          message: `Welcome aboard, ${user.name || "Creator"}! Explore deals, campaigns, and collaborations in your dashboard.`,
          type: "general",
          subtype: "welcome",
          read: false,
          created_at: getIsoNow(),
        };
        list.push(welcomeNotif);
      }

      return res.json(list);
    } catch (err) {
      console.error("[Get Notifications Error]", err);
      return res.json([]);
    }
  });


  router.post("/notifications/read-all", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) {
        return res.json({ success: true, read_count: 0 });
      }

      const actingId = user.role === "brand" ? getActingBrandId(user) : user.user_id;

      if (supabase) {
        try {
          await (privilegedSupabase || supabase)
            .from("notifications")
            .update({ read: true })
            .eq("user_id", actingId);

          if (user.role === "admin") {
            await (privilegedSupabase || supabase)
              .from("notifications")
              .update({ read: true })
              .eq("user_id", "admin");
          }
        } catch (sErr) {
          console.warn("[Notifications Mark All Read Supabase Warning]", sErr);
        }
      }

      const db = getDb();
      if (db.notifications) {
        db.notifications.forEach((n: any) => {
          if (n.user_id === actingId || ((user.role === "admin") && n.user_id === "admin")) {
            n.read = true;
          }
        });
        saveDb(db);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("[Notifications Read All Error]", err);
      return res.json({ success: true });
    }
  });



  // Session 24. WHO for one notification: only its owner (or admins, for the shared "admin"
  // inbox). Before, any signed-in — or signed-out — caller could mark ANY notification read, and
  // the raw id went straight into a PostgREST .or() filter string.
  const notifOwnersFor = (user: any): string[] => {
    const acting = user.role === "brand" ? getActingBrandId(user) : user.user_id;
    const owners = [acting, user.user_id].filter(Boolean);
    if (user.role === "admin") owners.push("admin");
    return Array.from(new Set(owners.map(String)));
  };
  const SAFE_NOTIF_ID = /^[A-Za-z0-9_\-:.]{1,120}$/;

  router.post("/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await parseAuthUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!SAFE_NOTIF_ID.test(String(id || ""))) return res.status(400).json({ error: "Invalid notification id" });
      const owners = notifOwnersFor(user);

      if (supabase && id) {
        try {
          await (privilegedSupabase || supabase)
            .from("notifications")
            .update({ read: true })
            .eq("notif_id", id) // notifications has no "id" column (session 35)
            .in("user_id", owners);
        } catch (sErr) {
          console.warn("[Notification Mark Read Supabase Warning]", sErr);
        }
      }

      const db = getDb();
      if (db.notifications && id) {
        const target = db.notifications.find((n: any) => (n.notif_id === id || n.id === id) && owners.includes(String(n.user_id)));
        if (target) {
          target.read = true;
          saveDb(db);
        }
      }

      return res.json({ success: true, notif_id: id });
    } catch (err) {
      console.error("[Notification Mark Read Error]", err);
      return res.json({ success: true });
    }
  });


  router.post("/notifications/:id/ack", async (req, res) => {
    try {
      const { id } = req.params;
      const { action } = req.body || {};
      const user = await parseAuthUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!SAFE_NOTIF_ID.test(String(id || ""))) return res.status(400).json({ error: "Invalid notification id" });
      const owners = notifOwnersFor(user);

      if (supabase && id) {
        try {
          await (privilegedSupabase || supabase)
            .from("notifications")
            .update({ read: true, acknowledged_at: new Date().toISOString(), action_taken: String(action || "acknowledged").slice(0, 60), action_taken_at: new Date().toISOString() })
            .eq("notif_id", id) // notifications has no "id" column (session 35)
            .in("user_id", owners);
        } catch (sErr) {
          console.warn("[Notification Ack Supabase Warning]", sErr);
        }
      }

      const db = getDb();
      if (db.notifications && id) {
        const target = db.notifications.find((n: any) => (n.notif_id === id || n.id === id) && owners.includes(String(n.user_id)));
        if (target) {
          target.acknowledged = true;
          target.read = true;
          target.ack_action = action || "acknowledged";
          saveDb(db);
        }
      }

      return res.json({ success: true, notif_id: id });
    } catch (err) {
      console.error("[Notification Ack Error]", err);
      return res.json({ success: true });
    }
  });


  router.post("/admin/notifications/send", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ detail: "Admin only", _status: 403 });
      }

      const {
        message,
        title,
        target_user_id,
        target_type,
        subtype,
        channels,
        is_blocking,
        action_url,
        redirect_path
      } = req.body;

      if (!message) {
        return res.status(400).json({ detail: "Message is required" });
      }

      const notifId = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      const targetUserId = target_type === "all" || !target_user_id ? "all" : target_user_id;

      const payload: any = {
        notif_id: notifId,
        user_id: targetUserId,
        title: title || "System Announcement",
        message: message,
        type: "admin_broadcast",
        subtype: subtype || "general",
        read: false,
        acknowledged: false,
        is_blocking: Boolean(is_blocking),
        redirect_path: redirect_path || action_url || null,
        created_at: getIsoNow()
      };

      if (supabase) {
        try {
          // Session 35: acknowledged / is_blocking are not notifications columns — the insert failed
          // as a whole, so admin messages never reached the database. They stay on the local copy.
          const { acknowledged: _ack, is_blocking: _blk, ...dbRow } = payload;
          const { error: insErr } = await (privilegedSupabase || supabase).from("notifications").insert(dbRow);
          if (insErr) console.warn("[Admin Notification Send Supabase Warning]", insErr.message);
        } catch (sErr) {
          console.warn("[Admin Notification Send Supabase Warning]", sErr);
        }
      }

      const db = getDb();
      if (!db.notifications) db.notifications = [];
      db.notifications.unshift(payload);
      saveDb(db);

      const ioInstance = app.get("io");
      if (ioInstance) {
        if (targetUserId === "all") {
          ioInstance.emit("bell_notification", payload);
          ioInstance.emit("new_notification", payload);
        } else {
          ioInstance.to(`user_${targetUserId}`).emit("bell_notification", payload); // sockets join user_<id>
          ioInstance.to(`user_${targetUserId}`).emit("new_notification", payload);
        }
      }

      return res.json({ success: true, notification: payload });
    } catch (err) {
      console.error("[Admin Send Notification Error]", err);
      return res.status(500).json({ detail: "Failed to send notification" });
    }
  });


  router.get("/tags/popular", (req, res) => {
    return res.json(POPULAR_TAGS);
  });


  router.get("/tags/search", (req, res) => {
    const rawQ = ((req.query.q || "") as string).trim();
    const q = rawQ.toLowerCase();
    const qNorm = q.replace(/[-_\s]+/g, "");
    
    if (!q) {
      return res.json(ALL_TAGS.slice(0, 15));
    }
    
    const matched = ALL_TAGS.filter(t => {
      const tLower = t.toLowerCase();
      const tNorm = tLower.replace(/[-_\s]+/g, "");
      return tLower.includes(q) || tNorm.includes(qNorm);
    });
    
    // Deduplicate case-insensitively
    const seen = new Set<string>();
    const uniqueMatched: string[] = [];
    for (const item of matched) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMatched.push(item);
      }
    }

    return res.json(uniqueMatched.slice(0, 15));
  });


  router.post("/tags/create", (req, res) => {
    const { name, type } = req.body;
    if (name && typeof name === "string") {
      const cleanName = name.trim();
      if (!ALL_TAGS.includes(cleanName)) {
        ALL_TAGS.push(cleanName);
      }
      return res.json({ success: true, tag: cleanName });
    }
    return res.status(400).json({ error: "Invalid tag name" });
  });

}

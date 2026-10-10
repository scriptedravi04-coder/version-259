import { logIgnored } from "./logIgnored";
import express from "express";
import { approveCreatorApplication, sendApplicationDecisionEmail } from "./creatorApplication";
import { prepareCsvRows, toWaitlistRow, CSV_MAX_ROWS } from "./waitlistCsvImport";
import { platformLabel } from "./waitlistPlatform";

const getIsoNow = () => new Date().toISOString();

// Admin waitlist / approval queue: merges raw `waitlist` table rows with any
// registered creator/brand profiles still sitting in `under_review`, so admins
// see one unified list. Approve either activates a registered profile, or —
// for a creator who applied via the public form and never signed up — creates
// an "unclaimed" shadow user + creator_profile so they show up in Explore
// Creators immediately (claimable later if they register with the same info).
export function setupAdminWaitlistRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    sendNotification,
    checkAdminPerm,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
    checkAdminPerm: (user: any, perm: string) => Promise<boolean>;
  }
) {
  router.get("/admin/waitlist", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    try {
      const activeClient = privilegedSupabase || supabase;
      let waitlistData: any[] = [];
      let creatorProfiles: any[] = [];
      let brandProfiles: any[] = [];
      let allUsers: any[] = [];
      let allCreatorKyc: any[] = [];

      if (activeClient) {
        const [wRes, cpRes, bpRes, uRes, ckRes] = await Promise.all([
          activeClient.from('waitlist').select('*').order('created_at', { ascending: false }),
          activeClient.from('creator_profiles').select('*').order('created_at', { ascending: false }),
          activeClient.from('brand_profiles').select('*').order('created_at', { ascending: false }),
          // Session 35: only columns that exist (the old lists named mobile / dob / gender / city /
          // is_claimed … on users and dob / phone / aadhaar_number on creator_kyc, so both reads failed
          // and no row ever got its account or KYC details). KYC: only what this list shows.
          activeClient.from('users').select('user_id, email, name, phone, picture, role, auth_method, created_at'),
          activeClient.from('creator_kyc').select('creator_id, instagram_handle, follower_count, niche')
        ]);
        waitlistData = wRes.data || [];
        creatorProfiles = cpRes.data || [];
        brandProfiles = bpRes.data || [];
        allUsers = uRes.data || [];
        allCreatorKyc = ckRes.data || [];
      }

      const localDb = getDb();
      if (localDb.waitlist && Array.isArray(localDb.waitlist)) {
        const seenWIds = new Set(waitlistData.map((w: any) => String(w.id || '')));
        localDb.waitlist.forEach((w: any) => {
          const wId = String(w.id || '');
          if (!wId || !seenWIds.has(wId)) {
            waitlistData.push(w);
            if (wId) seenWIds.add(wId);
          }
        });
      }

      if (localDb.creator_profiles && Array.isArray(localDb.creator_profiles)) {
        const seenCpIds = new Set(creatorProfiles.map((c: any) => String(c.user_id || '')));
        localDb.creator_profiles.forEach((c: any) => {
          if (c.user_id && !seenCpIds.has(String(c.user_id))) {
            creatorProfiles.push(c);
            seenCpIds.add(String(c.user_id));
          }
        });
      }

      if (localDb.brand_profiles && Array.isArray(localDb.brand_profiles)) {
        const seenBpIds = new Set(brandProfiles.map((b: any) => String(b.user_id || '')));
        localDb.brand_profiles.forEach((b: any) => {
          if (b.user_id && !seenBpIds.has(String(b.user_id))) {
            brandProfiles.push(b);
            seenBpIds.add(String(b.user_id));
          }
        });
      }

      const userMap = new Map<string, any>();
      const userEmailMap = new Map<string, any>();
      (allUsers || []).forEach(u => {
        if (u.user_id) userMap.set(u.user_id, u);
        if (u.email) userEmailMap.set(u.email.toLowerCase().trim(), u);
      });
      (localDb.users || []).forEach((u: any) => {
        if (u.user_id && !userMap.has(u.user_id)) userMap.set(u.user_id, u);
        if (u.email && !userEmailMap.has(u.email.toLowerCase().trim())) userEmailMap.set(u.email.toLowerCase().trim(), u);
      });

      const kycMap = new Map<string, any>();
      (allCreatorKyc || []).forEach(k => {
        if (k.creator_id) kycMap.set(k.creator_id, k);
      });

      const mappedList: any[] = [];
      const seenKeys = new Set<string>();

      // 1. Process all entries from waitlist table (preserving all distinct creator applications)
      (waitlistData || []).forEach((w) => {
        const emailKey = (w.email || '').toLowerCase().trim();
        const idKey = String(w.id || '');
        if (idKey && seenKeys.has(idKey)) return;

        if (idKey) seenKeys.add(idKey);
        if (w.user_id && w.is_registered_user) seenKeys.add(String(w.user_id));
        if (w.linked_user_id) seenKeys.add(String(w.linked_user_id));

        const u = (w.linked_user_id ? userMap.get(w.linked_user_id) : null) || 
                  (w.user_id ? userMap.get(w.user_id) : null) || 
                  (w.is_registered_user && emailKey ? userEmailMap.get(emailKey) : null);
        const k = (w.linked_user_id ? kycMap.get(w.linked_user_id) : null) || (w.user_id ? kycMap.get(w.user_id) : null);

        const statusRaw = String(w.status || 'Pending').trim();
        let status = 'Pending';
        if (statusRaw.toLowerCase() === 'approved') status = 'Approved';
        else if (statusRaw.toLowerCase() === 'rejected') status = 'Rejected';

        const isBrand = w.role === 'brand' || Boolean(w.company_name);
        const isRegistered = w.is_registered_user === true || (u && u.auth_method !== 'unclaimed' && u.is_claimed !== false);

        const phoneVal = w.phone || w.mobile || u?.phone || u?.mobile || k?.phone || "";
        const dobVal = w.dob || w.date_of_birth || u?.dob || u?.date_of_birth || k?.dob || "";
        const genderVal = w.gender || u?.gender || "";
        const cityVal = w.city || u?.city || "";
        const stateVal = w.state || u?.state || "";
        const nicheVal = w.niche || w.category || w.primary_niche || (isBrand ? "Retail" : "Fashion & Lifestyle");
        const handleVal = w.social_handle || w.handle || w.instagram_handle || (w.name ? "@" + w.name.toLowerCase().replace(/\s+/g, '') : "");
        const followersCount = Number(w.followers || w.follower_count || 0);
        const photoVal = w.profile_photo_url || w.photo || w.picture || u?.picture || "";

        mappedList.push({
          id: w.id || "wl_" + (emailKey || Math.random().toString(36).substring(2, 7)),
          user_id: w.linked_user_id || w.user_id || w.id,
          role: isBrand ? "brand" : "creator",
          name: isBrand ? (w.company_name || w.name || "Brand Representative") : (w.name || u?.name || "Creator"),
          company_name: w.company_name || (isBrand ? (w.name || "Brand") : ""),
          email: w.email || u?.email || "",
          handle: handleVal,
          social_handle: handleVal,
          instagram_link: w.instagram_link || (handleVal && !handleVal.includes('youtube.com') ? "https://instagram.com/" + handleVal.replace(/^@/, '') : ""),
          youtube: w.youtube || w.youtube_url || "",
          youtube_link: w.youtube || w.youtube_url || "",
          website: w.website || "",
          followers: followersCount,
          // Session 40: from what the creator gave (handle/link), not the stored label.
          platform: platformLabel({
            stored: w.platform,
            instagram: [w.instagram_link, w.social_handle, w.handle, w.instagram_handle],
            youtube: [w.youtube, w.youtube_url],
          }),
          status,
          profile_status: status === 'Approved' ? 'approved' : (status === 'Rejected' ? 'rejected' : 'under_review'),
          created_at: w.created_at || getIsoNow(),
          date: w.created_at ? w.created_at.split("T")[0] : getIsoNow().split("T")[0],
          photo: photoVal,
          picture: photoVal,
          category: nicheVal,
          niche: nicheVal,
          city: cityVal,
          state: stateVal,
          location: cityVal ? cityVal + (stateVal ? ', ' + stateVal : '') : (stateVal || "India"),
          mobile: phoneVal,
          phone: phoneVal,
          dob: dobVal,
          date_of_birth: dobVal,
          gender: genderVal,
          charges: w.charges || "",
          pricing: w.pricing || {
            reel: Number(w.rate_reel || 0),
            story: Number(w.rate_story || 0),
            yt_video: Number(w.rate_yt_video || 0),
            ugc: Number(w.rate_reel || 0)
          },
          ugc_rating: Number(w.ugc_rating || 7),
          avg_reach: w.avg_reach || "",
          collab_types: Array.isArray(w.collab_types) ? w.collab_types : [],
          sample_links: Array.isArray(w.sample_links) ? w.sample_links : [],
          portfolio: Array.isArray(w.sample_links) ? w.sample_links : (w.portfolio || []),
          notes: w.notes || w.about || w.bio || "",
          about: w.about || w.notes || w.bio || "",
          is_registered_user: isRegistered,
          reject_reason: w.reject_reason || w.rejectReason || "",
          rejectReason: w.reject_reason || w.rejectReason || "",
          panel_message: w.panel_message || ""
        });
      });

      // 2. Add any registered creator profiles that are 'under_review' and NOT already in mapped waitlist
      (creatorProfiles || []).forEach((cp) => {
        if (cp.profile_status !== 'under_review') return;
        const emailKey = (cp.email || '').toLowerCase().trim();
        const idKey = String(cp.user_id || '');
        if (emailKey && seenKeys.has(emailKey)) return;
        if (idKey && seenKeys.has(idKey)) return;

        if (emailKey) seenKeys.add(emailKey);
        if (idKey) seenKeys.add(idKey);

        const u = userMap.get(cp.user_id) || (emailKey ? userEmailMap.get(emailKey) : null);
        const k = kycMap.get(cp.user_id);
        const phoneVal = cp.phone || cp.mobile || u?.phone || u?.mobile || k?.phone || "";
        const nicheVal = cp.primary_niche || cp.category || k?.niche || "Fashion & Lifestyle";
        const handleVal = cp.instagram_handle || cp.handle || (k?.instagram_handle ? "@" + k.instagram_handle.replace(/^@/, '') : "@" + (cp.name || "creator").toLowerCase().replace(/\s+/g, ''));
        const followersCount = Number(cp.followers_instagram || cp.follower_count || cp.followers || k?.follower_count || 0);
        const photoVal = cp.photo || cp.picture || u?.picture || "";

        mappedList.push({
          id: cp.user_id,
          user_id: cp.user_id,
          role: "creator",
          name: cp.name || cp.full_name || u?.name || "Creator",
          email: cp.email || u?.email || "",
          handle: handleVal,
          social_handle: handleVal,
          instagram_link: handleVal && !handleVal.includes('youtube.com') ? "https://instagram.com/" + handleVal.replace(/^@/, '') : "",
          youtube: cp.youtube || "",
          youtube_link: cp.youtube || "",
          followers: followersCount,
          // Session 40: from what the creator gave (handle/link), not the stored label.
          platform: platformLabel({
            stored: cp.platform,
            instagram: [cp.instagram_handle, cp.handle, cp.instagram, k?.instagram_handle],
            youtube: [cp.youtube, cp.youtube_channel_url],
          }),
          status: "Pending",
          profile_status: "under_review",
          created_at: cp.created_at || getIsoNow(),
          date: cp.created_at ? cp.created_at.split("T")[0] : getIsoNow().split("T")[0],
          photo: photoVal,
          picture: photoVal,
          category: nicheVal,
          niche: nicheVal,
          city: cp.city || u?.city || "",
          state: cp.state || u?.state || "",
          location: cp.city ? cp.city + (cp.state ? ', ' + cp.state : '') : (cp.state || "India"),
          mobile: phoneVal,
          phone: phoneVal,
          dob: cp.dob || u?.dob || "",
          gender: cp.gender || u?.gender || "",
          charges: cp.charges || (cp.rate_reel ? "₹" + cp.rate_reel : ""),
          pricing: {
            reel: Number(cp.rate_reel || 0),
            story: Number(cp.rate_story || 0),
            yt_video: Number(cp.rate_yt_video || 0),
            ugc: Number(cp.rate_reel || 0)
          },
          ugc_rating: Number(cp.ugc_rating || 7),
          avg_reach: cp.avg_views_30d || "",
          collab_types: cp.collab_types || [],
          sample_links: cp.portfolio || [],
          portfolio: cp.portfolio || [],
          notes: cp.bio || cp.about || "",
          about: cp.about || cp.bio || "",
          is_registered_user: true,
          reject_reason: "",
          rejectReason: "",
          panel_message: cp.panel_message || ""
        });
      });

      // 3. Add any registered brand profiles that are 'under_review' and NOT already in mapped waitlist
      (brandProfiles || []).forEach((bp) => {
        if (bp.profile_status !== 'under_review') return;
        const emailKey = (bp.email || '').toLowerCase().trim();
        const idKey = String(bp.user_id || '');
        if (emailKey && seenKeys.has(emailKey)) return;
        if (idKey && seenKeys.has(idKey)) return;

        if (emailKey) seenKeys.add(emailKey);
        if (idKey) seenKeys.add(idKey);

        const u = userMap.get(bp.user_id) || (emailKey ? userEmailMap.get(emailKey) : null);
        const photoVal = bp.logo || bp.photo || bp.picture || u?.picture || "";

        mappedList.push({
          id: bp.user_id,
          user_id: bp.user_id,
          role: "brand",
          company_name: bp.company_name || bp.brand_name || u?.name || "Brand",
          name: bp.contact_person || bp.rep_name || u?.name || bp.company_name || "Brand Representative",
          email: bp.email || u?.email || "",
          website: bp.website || "",
          monthly_budget: bp.monthly_budget || bp.budget || "",
          company_size: bp.company_size || "",
          status: "Pending",
          profile_status: "under_review",
          created_at: bp.created_at || getIsoNow(),
          date: bp.created_at ? bp.created_at.split("T")[0] : getIsoNow().split("T")[0],
          photo: photoVal,
          picture: photoVal,
          category: bp.industry || bp.category || "Retail",
          niche: bp.industry || bp.category || "Retail",
          city: bp.city || u?.city || "",
          state: bp.state || u?.state || "",
          location: bp.city ? bp.city + (bp.state ? ', ' + bp.state : '') : (bp.state || "India"),
          mobile: bp.phone || u?.phone || "",
          phone: bp.phone || u?.phone || "",
          is_registered_user: true,
          reject_reason: "",
          rejectReason: "",
          panel_message: bp.panel_message || ""
        });
      });

      // Sort: Pending applications first, then by created_at descending
      mappedList.sort((a, b) => {
        if (a.status === "Pending" && b.status !== "Pending") return -1;
        if (a.status !== "Pending" && b.status === "Pending") return 1;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });

      // Assign sequence position #1, #2, etc.
      mappedList.forEach((item, idx) => {
        item.position = idx + 1;
      });

      return res.json(mappedList);
    } catch (err: any) {
      console.error("Error fetching waitlist queue:", err);
      return res.status(500).json({ error: "Failed to fetch approval queue: " + err.message });
    }
  });

  router.patch("/admin/waitlist/:id", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || !(await checkAdminPerm(user, 'manage_users'))) {
        if (user?.role !== 'admin') return res.status(403).json({ detail: "Admin only", _status: 403 });
      }

      const targetId = req.params.id;
      const updates = req.body;
      const activeClient = privilegedSupabase || supabase;

      if (activeClient) {
        await activeClient.from('waitlist').update(updates).eq('id', targetId);
      }

      const localDb = getDb();
      if (localDb.waitlist) {
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId) || String(w.user_id) === String(targetId));
        if (wIdx >= 0) {
          localDb.waitlist[wIdx] = { ...localDb.waitlist[wIdx], ...updates };
        }
      }
      saveDb(localDb);

      return res.json({ ok: true, message: "Waitlist entry updated successfully" });
    } catch (err: any) {
      console.error("Waitlist patch error:", err);
      return res.status(500).json({ error: err.message || "Failed to update waitlist entry" });
    }
  });

  // Admin Approve Waitlist Entry / Creator / Brand
  // Session 36: Admin → Waitlist → Upload CSV. preview=true only checks; otherwise good rows are saved as
  // Pending waitlist rows (source csv_import) for normal review. Nothing is invented, nothing is approved.
  router.post("/admin/waitlist/import-csv", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only" });
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) return res.status(400).json({ detail: "The file has no rows." });
    if (rows.length > CSV_MAX_ROWS) return res.status(400).json({ detail: `Up to ${CSV_MAX_ROWS} rows per file.` });
    const activeClient = privilegedSupabase || supabase;
    const existing = new Set<string>();
    try {
      if (activeClient) {
        const [w, u] = await Promise.all([
          activeClient.from('waitlist').select('email'),
          activeClient.from('users').select('email'),
        ]);
        for (const r of [...(w.data || []), ...(u.data || [])]) if (r?.email) existing.add(String(r.email).trim().toLowerCase());
      }
      const localDb = getDb();
      for (const r of [...(localDb.waitlist || []), ...(localDb.users || [])]) if (r?.email) existing.add(String(r.email).trim().toLowerCase());
    } catch (e) { logIgnored("admin_waitlist_routes:import-csv", e); }

    const results = prepareCsvRows(rows, existing);
    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      errors: results.filter((r) => r.status === "error").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
    };
    if (req.body?.preview) return res.json({ preview: true, summary, results });

    const toSave = results.filter((r) => r.status === "ok").map((r) => toWaitlistRow(r.value!));
    if (toSave.length === 0) return res.status(400).json({ detail: "No valid rows to import.", summary, results });
    if (activeClient) {
      const { error } = await activeClient.from('waitlist').insert(toSave);
      if (error) {
        console.error("[import-csv] waitlist insert failed:", error.message);
        return res.status(502).json({ detail: "Could not save the rows. Nothing was imported.", error: error.message });
      }
    }
    const localDb = getDb();
    if (!localDb.waitlist) localDb.waitlist = [];
    localDb.waitlist.push(...toSave);
    saveDb(localDb);
    return res.json({ imported: toSave.length, summary, results });
  });

  router.post("/admin/waitlist/:id/approve", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const targetId = req.params.id;
    const activeClient = privilegedSupabase || supabase;

    try {
      const localDb = getDb();
      if (!localDb.users) localDb.users = [];
      if (!localDb.creator_profiles) localDb.creator_profiles = [];
      if (!localDb.brand_profiles) localDb.brand_profiles = [];
      if (!localDb.waitlist) localDb.waitlist = [];

      // 1. Check if item exists in waitlist table
      let waitlistEntry: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('waitlist').select('*').eq('id', targetId).maybeSingle();
        if (data) waitlistEntry = data;
        else {
          const { data: byUser } = await activeClient.from('waitlist').select('*').or("linked_user_id.eq." + targetId + ",user_id.eq." + targetId).maybeSingle();
          if (byUser) waitlistEntry = byUser;
        }
      }
      if (!waitlistEntry && localDb.waitlist) {
        waitlistEntry = localDb.waitlist.find((w: any) => String(w.id) === String(targetId) || String(w.linked_user_id) === String(targetId) || String(w.user_id) === String(targetId));
      }

      // 2. Check if item exists as a registered creator profile
      let existingCp: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('creator_profiles').select('*').eq('user_id', targetId).maybeSingle();
        if (data) existingCp = data;
      }
      if (!existingCp && localDb.creator_profiles) {
        existingCp = localDb.creator_profiles.find((c: any) => String(c.user_id) === String(targetId));
      }

      // 3. Check if item exists as a registered brand profile
      let existingBp: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('brand_profiles').select('*').eq('user_id', targetId).maybeSingle();
        if (data) existingBp = data;
      }
      if (!existingBp && localDb.brand_profiles) {
        existingBp = localDb.brand_profiles.find((b: any) => String(b.user_id) === String(targetId));
      }

      const defaultPhoto = ""; // no stock photo — it used to become the creator's real profile picture (session 27)

      // BRANCH 1: Brand Profile Approval
      if (existingBp || waitlistEntry?.role === 'brand') {
        const brandUserId = existingBp?.user_id || waitlistEntry?.linked_user_id || waitlistEntry?.user_id || targetId;
        if (activeClient) {
          await activeClient.from('brand_profiles').update({ profile_status: 'approved', reviewed_at: getIsoNow() }).eq('user_id', brandUserId);
          await activeClient.from('waitlist').update({ status: 'Approved' }).eq('id', targetId);
        }
        const bpIdx = localDb.brand_profiles.findIndex((b: any) => String(b.user_id) === String(brandUserId));
        if (bpIdx >= 0) localDb.brand_profiles[bpIdx].profile_status = 'approved';
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId));
        if (wIdx >= 0) localDb.waitlist[wIdx].status = 'Approved';
        saveDb(localDb);

        await sendNotification(null, brandUserId, 'profile_approved', 'Your brand profile is live. Start posting campaigns.');
        return res.json({ ok: true, message: 'Brand approved successfully' });
      }

      // BRANCH 2: Registered Creator Profile Approval (Already has regular auth user)
      if (existingCp && (existingCp.is_claimed !== false && existingCp.creator_type !== 'unclaimed') && waitlistEntry?.is_registered_user !== false) {
        if (activeClient) {
          await activeClient.from('creator_profiles').update({ profile_status: 'approved', reviewed_at: getIsoNow() }).eq('user_id', targetId);
          await activeClient.from('waitlist').update({ status: 'Approved' }).eq('id', targetId);
        }
        const cpIdx = localDb.creator_profiles.findIndex((c: any) => String(c.user_id) === String(targetId));
        if (cpIdx >= 0) localDb.creator_profiles[cpIdx].profile_status = 'approved';
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId));
        if (wIdx >= 0) localDb.waitlist[wIdx].status = 'Approved';
        saveDb(localDb);

        await sendNotification(null, targetId, 'profile_approved', 'Your profile is approved and live on Explore Creators.');
        return res.json({ ok: true, message: 'Creator approved successfully' });
      }

      // BRANCH 3 (session 34): public application → ONE unclaimed profile on Explore, never a change to
      // a real account; approval email. Shared with batch-approve (backend/creatorApplication.ts).
      if (!waitlistEntry) return res.status(404).json({ error: 'Application not found' });
      const result: any = await approveCreatorApplication(waitlistEntry, { client: activeClient, getDb, saveDb });
      if (!result.ok) return res.status(500).json({ error: result.error });
      const emailed = await sendApplicationDecisionEmail(waitlistEntry, 'approved');
      return res.json({ ...result, emailed });
    } catch (err: any) {
      console.error('Waitlist approve error:', err);
      return res.status(500).json({ error: 'Approval failed: ' + err.message });
    }
  });

  router.post("/admin/waitlist/:id/reject", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const targetId = req.params.id;
    // Session 34 (Ravi): the reason goes to the creator by email, so it is required.
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (reason.length < 3) return res.status(400).json({ error: "Please write the reason — it is emailed to the creator." });
    const activeClient = privilegedSupabase || supabase;

    try {
      if (activeClient) {
        // (profiles have no reject_reason column — the reason is kept on the waitlist row and emailed)
        await activeClient.from("creator_profiles").update({ profile_status: "rejected", reviewed_at: getIsoNow() }).eq("user_id", targetId);
        await activeClient.from("brand_profiles").update({ profile_status: "rejected", reviewed_at: getIsoNow() }).eq("user_id", targetId);
        await activeClient.from("waitlist").update({ status: "Rejected", reject_reason: reason }).eq("id", targetId);
      }

      const localDb = getDb();
      if (localDb.waitlist) {
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId) || String(w.user_id) === String(targetId) || String(w.linked_user_id) === String(targetId));
        if (wIdx >= 0) {
          localDb.waitlist[wIdx].status = "Rejected";
          localDb.waitlist[wIdx].rejectReason = reason;
          localDb.waitlist[wIdx].reject_reason = reason;
        }
      }
      if (localDb.creator_profiles) {
        const cpIdx = localDb.creator_profiles.findIndex((c: any) => String(c.user_id) === String(targetId));
        if (cpIdx >= 0) {
          localDb.creator_profiles[cpIdx].profile_status = "rejected";
          localDb.creator_profiles[cpIdx].reject_reason = reason;
        }
      }
      saveDb(localDb);

      let entry: any = (localDb.waitlist || []).find((w: any) => String(w.id) === String(targetId)) || null;
      if (activeClient) {
        const { data } = await activeClient.from("waitlist").select("*").eq("id", targetId).maybeSingle();
        if (data) entry = data;
      }
      const emailed = entry ? await sendApplicationDecisionEmail(entry, "rejected", reason) : false;
      return res.json({ ok: true, message: "Profile rejected.", emailed });
    } catch (err: any) {
      console.error("Waitlist reject error:", err);
      return res.status(500).json({ error: "Rejection failed: " + err.message });
    }
  });

  router.post("/admin/waitlist/batch-approve", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    // Session 34: each row read from the database (not only this server's cache), approved with the
    // same rules as a single approve, and emailed.
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 200) : [];
    const activeClient = privilegedSupabase || supabase;
    const results: any[] = [];
    for (const targetId of ids) {
      let entry: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('waitlist').select('*').eq('id', targetId).maybeSingle();
        entry = data || null;
      }
      if (!entry) entry = (getDb().waitlist || []).find((w: any) => String(w.id) === String(targetId)) || null;
      if (!entry) { results.push({ id: targetId, ok: false, error: 'Application not found' }); continue; }
      if (entry.role === 'brand') { results.push({ id: targetId, ok: false, error: 'Brand application — approve it on its own' }); continue; }
      const r: any = await approveCreatorApplication(entry, { client: activeClient, getDb, saveDb });
      if (r.ok) r.emailed = await sendApplicationDecisionEmail(entry, 'approved');
      results.push({ id: targetId, ...r });
    }
    const approved = results.filter((r) => r.ok).length;
    return res.json({ ok: approved === results.length, approved, failed: results.length - approved, results });
  });

  router.post("/admin/waitlist/:id/message", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }
    const targetId = req.params.id;
    const messageText = req.body.message || "";

    try {
      await (privilegedSupabase || supabase).from("creator_profiles").update({ panel_message: messageText }).eq("user_id", targetId);
      await (privilegedSupabase || supabase).from("brand_profiles").update({ panel_message: messageText }).eq("user_id", targetId);
      await (privilegedSupabase || supabase).from("waitlist").update({ panel_message: messageText }).eq("id", targetId);

      const localDb = getDb();
      if (localDb.waitlist) {
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId));
        if (wIdx >= 0) {
          localDb.waitlist[wIdx].panel_message = messageText;
          saveDb(localDb);
        }
      }

      await sendNotification(
        null,
        targetId,
        "admin_message",
        `Update from Ybex Admin: ${messageText}`
      );

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("Waitlist message error:", err);
      return res.status(500).json({ error: "Failed to send message: " + err.message });
    }
  });
}

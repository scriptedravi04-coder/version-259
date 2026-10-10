# Session 31 — prompts for Ravi's Supabase-connected Claude

Copy one prompt at a time. Run them in this order. Prompt 3 only AFTER version230 is deployed and tested.

---

## Prompt 1 — landing reviews: rating column + report (safe, run any time)

```
Project: Ybex (Supabase). Please do these steps and report back exactly what you found and changed.

1. Show the columns of public.landing_reviews (name, type, default, nullable).
2. If there is NO column named "rating": add it with
     ALTER TABLE public.landing_reviews ADD COLUMN rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5);
   If it exists, do not change it; just report its type.
3. If there is NO column named "created_by": add it with
     ALTER TABLE public.landing_reviews ADD COLUMN created_by text;
4. Show the row count of public.landing_reviews and public.landing_brands, and the RLS policies on both tables.
   Do NOT add, delete or edit any rows.
5. Report: columns before/after, row counts, RLS policies.
```

## Prompt 2 — delete the empty `banner-images` bucket (safe)

```
Project: Ybex (Supabase Storage). Please:
1. Count the files in the storage bucket "banner-images" (all folders).
2. If it has 0 files: delete the bucket "banner-images".
   If it has ANY files: do NOT delete it — list the file paths and sizes and stop.
3. Confirm the bucket "banners" exists and is PUBLIC (create it as public if it is missing, allowed types image/jpeg, image/png, image/webp).
4. Count rows in public.banners where image_url starts with 'data:image/' (do not change them — the app's admin button moves them).
5. Report what you did.
```

## Prompt 3 — make `content-submissions` private (run LAST, after v230 is live and tested)

```
Project: Ybex (Supabase Storage). The app now opens every deliverable video through its own
/api/media link (access check + 15-minute signed link), so the bucket no longer needs to be public.
Please:
1. Show whether the bucket "content-submissions" is public, and its file count and total size.
2. Set the bucket "content-submissions" to PRIVATE (public = false). Do not move, rename or delete any file.
3. Show the storage.objects policies for this bucket. Do NOT add any policy that lets anon or
   authenticated users read it (the server uses the service role).
4. Repeat steps 1–3 for "live-proofs" and "ugc-assets" and report whether each is public.
5. Report before/after for each bucket.
```

### How to test after Prompt 3 (Ravi)
1. Open a UGC order (brand) with a submitted video → it plays.
2. Same as the creator → it plays.
3. Open a campaign chat with a deliverable video → it plays; Download still works.
4. Log out and paste an old video link in the browser → it must NOT open.
If any of 1–3 fails: tell me which screen; to undo quickly, ask the Supabase Claude to set the bucket back to public.

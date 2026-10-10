// Storage helpers: bucket setup, signed URLs, base64 image upload. Moved out of server.ts in
// session 22 — behaviour unchanged. Which buckets stay private: backend/mediaAccess.ts.
import crypto from "crypto";
import { logIgnored } from "./logIgnored";
import { isPrivateBucket } from "./mediaAccess";
import { shrinkPhoto } from "./imageResize";

export function createStorageHelpers(clients: () => { supabase: any; privilegedSupabase: any }) {
  // Helper function to generate signed URLs for private storage buckets (content-submissions, kyc-documents, live-proofs, ugc-assets)
  async function getSignedUgcUrl(supabaseClient: any, originalUrl: any, defaultBucket = 'content-submissions') {
    if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
    const trimmed = originalUrl.trim();
    if (!trimmed || trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/files/')) return originalUrl;

    // Check if it's an external HTTP/HTTPS URL not hosted in Supabase storage
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const privateBuckets = ['content-submissions', 'kyc-documents', 'live-proofs', 'ugc-assets'];
      const isSupabaseBucketUrl = privateBuckets.some(b => trimmed.includes(`/${b}/`));
      const isSupabaseStorageUrl = isSupabaseBucketUrl || trimmed.includes('/object/public/') || trimmed.includes('/object/sign/') || trimmed.includes('/storage/v1/');
      
      if (!isSupabaseStorageUrl) {
        // External link (e.g. Instagram, YouTube, Google Drive, Vimeo, or standard web link)
        return originalUrl;
      }
    }

    try {
      let bucket = defaultBucket;
      let filePath = trimmed;

      const privateBuckets = ['content-submissions', 'kyc-documents', 'live-proofs', 'ugc-assets'];
      
      for (const b of privateBuckets) {
        const marker = `${b}/`;
        const idx = filePath.indexOf(marker);
        if (idx !== -1) {
          bucket = b;
          filePath = decodeURIComponent(filePath.substring(idx + marker.length)).split('?')[0];
          break;
        }
      }

      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        const markerAlt = '/object/public/';
        const markerSign = '/object/sign/';
        let idx = filePath.indexOf(markerAlt);
        if (idx === -1) idx = filePath.indexOf(markerSign);
        if (idx !== -1) {
          const pathAfterObject = filePath.substring(idx + (filePath.indexOf(markerAlt) !== -1 ? markerAlt.length : markerSign.length));
          const parts = pathAfterObject.split('/');
          if (parts.length > 1) {
            bucket = parts[0];
            filePath = decodeURIComponent(parts.slice(1).join('/')).split('?')[0];
          }
        }
      } else {
        filePath = filePath.split('?')[0];
      }

      // Safeguard: If filePath is STILL an absolute http/https URL, do NOT call createSignedUrl on Supabase Storage bucket!
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return originalUrl;
      }

      const activeClient = supabaseClient || clients().privilegedSupabase || clients().supabase;
      if (!activeClient) return originalUrl;

      const { data, error } = await activeClient.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days expiry

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      } else if (error) {
        console.warn(`[Storage] Failed to create signed URL for ${filePath} in bucket '${bucket}': ${error.message}`);
      }
    } catch (err) {
      console.error('Error in getSignedUgcUrl:', err);
    }
    return originalUrl;
  }

  const checkedBuckets = new Set<string>();

  async function ensureBucketExists(bucketName: string, client: any) {
    if (!client) return;
    if (checkedBuckets.has(bucketName)) {
      return; // Already verified this bucket during this server run, avoid redundant API call
    }
    try {
      const { data: buckets, error } = await client.storage.listBuckets();
      if (error) {
        console.warn(`[Storage] Failed to list buckets: ${error.message}`);
        return;
      }
      const exists = buckets?.some((b: any) => b.id === bucketName);
      if (!exists) {
        // KYC and contract/document buckets must ALWAYS be private for data safety.
        // Public buckets are only for assets like banners, cover images, and profile pictures.
        const isPublic = !isPrivateBucket(bucketName); // deliverable buckets stay private — see mediaAccess.ts

        console.log(`[Storage] Bucket '${bucketName}' not found. Auto-creating as ${isPublic ? 'PUBLIC' : 'PRIVATE'}...`);
        let allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (bucketName.toLowerCase().includes('kyc') || bucketName.toLowerCase().includes('document')) allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/webp'];
        else if (['content-submissions', 'live-proofs', 'ugc-assets'].includes(bucketName)) allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'application/pdf', 'image/webp'];
        
        const { error: createErr } = await client.storage.createBucket(bucketName, {
          public: isPublic,
          allowedMimeTypes
        });
        if (createErr) {
          console.warn(`[Storage] Failed to create ${isPublic ? 'public' : 'private'} bucket '${bucketName}':`, createErr.message);
        } else {
          console.log(`[Storage] Successfully auto-created ${isPublic ? 'public' : 'private'} bucket '${bucketName}'!`);
          checkedBuckets.add(bucketName);
        }
      } else {
        checkedBuckets.add(bucketName);
        const isPublic = !isPrivateBucket(bucketName); // deliverable buckets stay private — see mediaAccess.ts
        if (isPublic) {
          try {
            await client.storage.updateBucket(bucketName, { public: true });
          } catch (e) { logIgnored("server:2508", e); }
        }
      }
    } catch (err) {
      console.warn(`[Storage] Exception during bucket check/create for '${bucketName}':`, err);
    }
  }

  async function processBase64Image(imgUrl: string, bucket: string, user_id: string) {
    if (imgUrl && imgUrl.startsWith("data:image/")) {
      const activeSupabase = clients().privilegedSupabase || clients().supabase;
      if (activeSupabase) {
        try {
          await ensureBucketExists(bucket, activeSupabase);
          const matches = imgUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            // Session 31: shrink photos (avatars, logos, covers) before storing — backend/imageResize.ts
            const small = await shrinkPhoto(Buffer.from(matches[2], 'base64'), matches[1], bucket);
            const mimeType = small.contentType;
            const buffer = small.buffer;
            const extension = small.shrunk ? small.ext : (matches[1].split('/')[1] || 'jpeg');
            const filePath = `${user_id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const { error: uploadErr } = await activeSupabase.storage.from(bucket).upload(filePath, buffer, { contentType: mimeType, upsert: true });
            if (!uploadErr) {
              const privateBuckets = ['kyc-documents', 'content-submissions', 'live-proofs', 'ugc-assets'];
              if (privateBuckets.includes(bucket)) {
                const { data: signedData } = await activeSupabase.storage.from(bucket).createSignedUrl(filePath, 60 * 60 * 24 * 7);
                if (signedData && signedData.signedUrl) return signedData.signedUrl;
              } else {
                const { data: urlData } = activeSupabase.storage.from(bucket).getPublicUrl(filePath);
                if (urlData && urlData.publicUrl) return urlData.publicUrl;
              }
            } else {
              console.error(`[Storage] processBase64Image upload to '${bucket}' failed:`, uploadErr.message);
            }
          }
        } catch(e) { console.error("Error processing base64 image", e); }
      }
    }
    return imgUrl;
  }

  return { getSignedUgcUrl, ensureBucketExists, processBase64Image };
}

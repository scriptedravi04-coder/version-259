-- Session 34 (Ravi): Ybex no longer collects Aadhaar (KYC = PAN + bank/UPI). The Privacy Policy now
-- says so, so remove what older versions stored. Run in Supabase → SQL Editor AFTER checking the
-- counts in step 1. The image files themselves are in the private storage bucket "kyc-documents" —
-- delete those from Storage too (step 2 lists them).

-- 1. How many rows hold Aadhaar today (read only)
select count(*) filter (where coalesce(aadhaar_number, '') <> '') as with_number,
       count(*) filter (where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '') as with_images
from public.creator_kyc;

-- 2. List the image files first (copy this result), then delete them in Storage → kyc-documents
select aadhaar_front_url, aadhaar_back_url from public.creator_kyc
 where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

-- 3. Clear them
update public.creator_kyc
   set aadhaar_number = null, aadhaar_front_url = null, aadhaar_back_url = null
 where coalesce(aadhaar_number, '') <> '' or coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

update public.verifications
   set documents = documents - 'creator_aadhaar'
 where documents ? 'creator_aadhaar';


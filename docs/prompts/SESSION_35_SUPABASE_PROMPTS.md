# Session 35 — prompts for Ravi's Supabase-connected Claude

Copy ONE prompt at a time, in this order. Send the report each prompt asks for back to the coding
session before running the next one. Every prompt says: check first, change only what is written,
stop and report on any error.

Order:
1. Prompt 0 — health check (read only)
2. Prompt 1 — `onboarding_progress` table (needed by v239+ onboarding resume)
3. Prompt 2 — `user_consents` table + waitlist column (needed by v241+ consent records)
4. Prompt 3 — Aadhaar purge, step 1 (read only: counts + file list)
5. Prompt 4 — Aadhaar purge, step 2 (clear) — only after Ravi deleted the files from Storage
6. Then the older prompts in `docs/prompts/SESSION_31_SUPABASE_PROMPTS.md`: Prompt 1, Prompt 2,
   and Prompt 3 LAST (after the new version is live and tested).

---

## Prompt 0 — health check (read only, run first)

```
I need a READ-ONLY health check of my Supabase project for Ybex. Do not change anything.

1. Tell me which project you are connected to (name + ref), so I can confirm it is Ybex production.
2. For each table below, say whether it exists, and list its columns with types:
   onboarding_progress, user_consents, waitlist, creator_kyc, verifications, users,
   creator_profiles, ybex_ephemeral, platform_fee_config.
3. For onboarding_progress and user_consents (if they exist): is Row Level Security enabled, how many
   policies do they have, and do roles anon / authenticated have any privileges on them
   (information_schema.role_table_grants)?
4. Does the table waitlist have a column named terms_accepted_at?
5. List the storage buckets and say for each whether it is public or private.

Reply with a short report, one section per point. If anything errors, show the exact error and stop.
```

## Prompt 1 — onboarding progress table

```
I need one new table in my Supabase project for Ybex (onboarding progress, saved after every step).
Do ONLY what is written below. Do not change, drop or alter any other table, policy, function or data.

STEP 1 — Check (read only): if public.onboarding_progress already exists, show its columns and STOP.

STEP 2 — If it does not exist, run exactly:

create table if not exists public.onboarding_progress (
  user_id     text primary key,
  role        text not null check (role in ('creator', 'brand')),
  flow        text not null,
  page        text not null,
  pos         jsonb,
  answers     jsonb not null default '{}'::jsonb,
  basics_done boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.onboarding_progress enable row level security;
revoke all on public.onboarding_progress from anon, authenticated;

Do NOT add any RLS policy (only the server's service-role key uses this table).

STEP 3 — Verify and report: the 8 columns and types; RLS enabled; zero policies; anon and
authenticated have no privileges; row count 0. Show the exact error if any step fails.
```

## Prompt 2 — consent records table

```
I need one new table and one new column in my Supabase project for Ybex (who agreed to which Terms
version, and when). Do ONLY what is written below. Do not change anything else.

STEP 1 — Check (read only): does public.user_consents exist? Does public.waitlist have a column
terms_accepted_at? If both already exist, show them and STOP.

STEP 2 — Run exactly:

create table if not exists public.user_consents (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  kind        text not null check (kind in ('terms', 'privacy', 'marketing', 'creator_terms', 'brand_terms')),
  granted     boolean not null,
  version     text not null default '1.0',
  source      text,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists user_consents_user_kind_idx on public.user_consents (user_id, kind, created_at desc);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;

alter table public.waitlist add column if not exists terms_accepted_at timestamptz;

Do NOT add any RLS policy.

STEP 3 — Verify and report: user_consents columns and types; the index exists; RLS enabled; zero
policies; anon / authenticated have no privileges; waitlist now has terms_accepted_at. Show the
exact error if any step fails.
```

## Prompt 3 — Aadhaar purge, step 1 (READ ONLY)

```
Ybex no longer collects Aadhaar. Before deleting old data I need a READ-ONLY report. Change nothing.

1. Run:
select count(*) filter (where coalesce(aadhaar_number, '') <> '') as with_number,
       count(*) filter (where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '') as with_images
from public.creator_kyc;

2. Run and give me the full result as a list (I will delete these files from Storage myself):
select user_id, aadhaar_front_url, aadhaar_back_url from public.creator_kyc
 where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

3. Run:
select count(*) from public.verifications where documents ? 'creator_aadhaar';

If a column or table does not exist, say so and continue with the next query.
```

## Prompt 4 — Aadhaar purge, step 2 (clear) — only after the files were deleted from Storage

```
Ybex no longer collects Aadhaar. Clear the old Aadhaar data. Do ONLY this.

STEP 1 — Run exactly:
update public.creator_kyc
   set aadhaar_number = null, aadhaar_front_url = null, aadhaar_back_url = null
 where coalesce(aadhaar_number, '') <> '' or coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

update public.verifications
   set documents = documents - 'creator_aadhaar'
 where documents ? 'creator_aadhaar';

STEP 2 — Verify: re-run the three counts from the read-only report; all must be 0. Report the
number of rows each update changed. Show the exact error if any step fails.
```


---

## STATUS (end of session 35)
Done: Prompt 0, 1, 2, 3 (read-only), Session 31 Prompt 1.
Found: 3 KYC files (1 Aadhaar + 2 PAN) of two deleted accounts in the PUBLIC bucket `cover-images`
(mobile KYC upload sent no bucket — fixed in v244).

Ravi, by hand (Dashboard → Storage → cover-images):
- folder 91fcc5f2-b557-4d5f-a5eb-8323795fe221 → delete both files
- folder a3185fa0-fef2-4e55-b933-2c1d04a2d09e → delete file_ne8ndc286p.png
- bucket banner-images → Delete bucket

## Prompt 5 — KYC cleanup (only AFTER the files above are deleted)
```
Final cleanup for Ybex. Do ONLY what is written.
STEP 1 (read only):
select bucket_id, name from storage.objects
where name ilike '%ztz950lga2e%' or name ilike '%b0vvaz3ufft%' or name ilike '%ne8ndc286p%';
Expected: 0 rows. If any row comes back, show it and STOP.
STEP 2:
delete from public.creator_kyc
 where creator_id in ('a3185fa0-fef2-4e55-b933-2c1d04a2d09e', '91fcc5f2-b557-4d5f-a5eb-8323795fe221');
delete from public.password_reset_tokens where user_id = 'a3185fa0-fef2-4e55-b933-2c1d04a2d09e';
STEP 3: rows deleted (expected 2 and 1) and
select count(*) from public.creator_kyc where aadhaar_front_url is not null or aadhaar_back_url is not null; (must be 0)
```

## Prompt 6 — missing columns (file: scripts/sql/session35_schema_fixes.sql)
Ask: run the file exactly as ONE migration named session35_schema_fixes; on any error show it and STOP;
reply "done" + row count of creator_payment_methods.
```sql
-- Session 35 (7 Oct 2026): columns the app already writes but the live database never had.
-- Supabase refuses a whole insert/update when ONE key is not a column, so each gap below made a
-- real feature fail. Only ADD columns (all nullable), one trigger pair, and lock one table.
-- Nothing is dropped or renamed. Safe to run twice.

-- 1. Creator payout details (UPI / bank). The app saves by user_id; the table only had creator_id,
--    so "Save payout details" always returned an error.
alter table public.creator_payment_methods add column if not exists user_id text;
alter table public.creator_payment_methods add column if not exists upi_id text;
alter table public.creator_payment_methods add column if not exists bank_account_number text;
alter table public.creator_payment_methods add column if not exists bank_ifsc text;
alter table public.creator_payment_methods add column if not exists account_holder_name text;
alter table public.creator_payment_methods add column if not exists updated_at timestamptz;
do $$
declare c text;
begin
  foreach c in array array['creator_id', 'method_type', 'account_details'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'creator_payment_methods'
                 and column_name = c and is_nullable = 'NO') then
      execute format('alter table public.creator_payment_methods alter column %I drop not null', c);
    end if;
  end loop;
end $$;
update public.creator_payment_methods set user_id = creator_id::text where user_id is null and creator_id is not null;
create or replace function public.ybex_payment_method_fill() returns trigger language plpgsql as $$
begin
  if new.creator_id is null and new.user_id is not null then
    begin new.creator_id := new.user_id; exception when others then null; end;
  end if;
  if new.method_type is null then
    new.method_type := case when coalesce(new.upi_id, '') <> '' then 'UPI' else 'BANK' end;
  end if;
  return new;
end $$;
drop trigger if exists ybex_payment_method_fill on public.creator_payment_methods;
create trigger ybex_payment_method_fill before insert or update on public.creator_payment_methods
  for each row execute function public.ybex_payment_method_fill();
create unique index if not exists creator_payment_methods_user_id_key on public.creator_payment_methods (user_id);
alter table public.creator_payment_methods enable row level security;
revoke all on public.creator_payment_methods from anon, authenticated;

-- 2. Creator "Request payout" + admin counters (transactions).
alter table public.transactions add column if not exists updated_at timestamptz;
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists payout_requested boolean;
alter table public.transactions add column if not exists payout_request_count integer;
alter table public.transactions add column if not exists payout_request_notes text;
alter table public.transactions add column if not exists last_payout_requested_at timestamptz;

-- 3. Admin "mark payout paid" on UGC orders.
alter table public.ugc_orders add column if not exists payout_status text;
alter table public.ugc_orders add column if not exists utr_number text;
alter table public.ugc_orders add column if not exists deal_id text;
alter table public.payout_requests add column if not exists utr_number text;
alter table public.chat_threads add column if not exists ugc_order_id text;

-- 4. Brand: "N creators match this brief" read creator_profiles.niche.
alter table public.creator_profiles add column if not exists niche text;

-- 5. Brand profile city / state / agency type (onboarding + settings).
alter table public.brand_profiles add column if not exists city text;
alter table public.brand_profiles add column if not exists state text;
alter table public.brand_profiles add column if not exists agency_type text;

-- 6. Creator onboarding writes the date of birth on users; without the columns the whole users
--    update failed (including onboarded = true).
alter table public.users add column if not exists dob text;
alter table public.users add column if not exists date_of_birth text;

-- 7. Notifications written with id / link / data (campaign approvals, payment released, invites)
--    were refused. Keep notif_id as the key: fill it from id when a row comes without one.
alter table public.notifications add column if not exists id text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists data jsonb;
create or replace function public.ybex_notif_fill() returns trigger language plpgsql as $$
begin
  if new.notif_id is null then
    new.notif_id := coalesce(new.id, 'notif_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  end if;
  if new.redirect_path is null and new.link is not null then new.redirect_path := new.link; end if;
  return new;
end $$;
drop trigger if exists ybex_notif_fill on public.notifications;
create trigger ybex_notif_fill before insert on public.notifications
  for each row execute function public.ybex_notif_fill();
```

## Prompt 7 — Session 31 Prompt 3 (content-submissions private) — LAST, after v244 is live and tested.

# Prompt for the Claude that is connected to Ybex's Supabase

Copy everything below the line into that chat.

---

You are connected to the Supabase database of my app **Ybex** (influencer / brand marketplace). Please bring the database up to date with the SQL files below. They were written over several sessions; some may already be applied, some not.

**How to work — please follow exactly:**

1. **Look first, change nothing yet.** For every file below, check in the live database (information_schema / pg_catalog) which of its tables, columns, indexes, triggers and functions already exist. Make a table: file → already done / partly done / not done.
2. **Then run the files in the order given**, one file at a time. Every file is written to be safe to run again (`if not exists`, `create or replace`, `drop trigger if exists`), so a file that is "partly done" can simply be run whole. Do not edit the SQL. If a statement fails, **stop**, show me the exact error and which file / line, and wait for me — do not try to fix it yourself and do not continue with the next file.
3. **Never drop, delete, rename or truncate anything** that is not in these files. Do not touch any other table. Do not change Row Level Security on other tables.
4. **Not part of this job (do NOT run):**
   - `purge_aadhaar.sql` — it deletes old Aadhaar data. Only run its first part (the read-only `select` counts) and tell me the numbers. I will decide separately.
   - `find_wrongly_completed_briefs.sql` — read-only report. Run it and show me the rows (if any). Change nothing.
5. **At the end, check and report:** for each file → "applied ✓" or the error. Also confirm these 5 new tables exist with RLS enabled: `whats_new`, `whats_new_seen`, `push_subscriptions`, `push_campaigns`, `push_log`; that `creator_profiles.fake_follower_pct` and `creator_profiles.performance_score` allow NULL; and that `platform_fee_config` has `brand_markup_pct`, `creator_deduction_pct`, `agency_markup_pct`, `agency_deduction_pct`.

Reply to me in simple Hinglish (Roman script), short.

## Files, in this order

### 1. `ybex_ephemeral.sql` — Session 22 — OTP codes / contract sign tokens shared by all servers

```sql
-- Session 22: short-lived OTP codes and contract sign tokens shared by all server instances.
-- Run once in Supabase → SQL Editor. Only the service-role key (the server) can read or write it.
create table if not exists public.ybex_ephemeral (
  key        text primary key,
  value      jsonb not null,
  expires_at timestamptz not null
);
create index if not exists ybex_ephemeral_expires_idx on public.ybex_ephemeral (expires_at);
alter table public.ybex_ephemeral enable row level security;
-- No policies on purpose: anon / logged-in browser clients get nothing.
revoke all on public.ybex_ephemeral from anon, authenticated;
```

### 2. `ugc_delivery_hours.sql` — Session 24 — UGC brief delivery time (24/48/72 h)

```sql
-- Session 24. Brand-chosen first-draft deadline for UGC briefs (24 / 48 / 72 hours).
-- Old briefs stay NULL and keep the old 24h deadline.
alter table public.ugc_briefs
  add column if not exists delivery_hours integer
  check (delivery_hours is null or delivery_hours in (24, 48, 72));
```

### 3. `ugc_deadlines_relist_refunds.sql` — UGC deadline reminders, auto-relist, brand refunds

```sql
-- SQL Migration for UGC Deadline Reminders, Auto-Relist & Brand Refunds
-- Run this in the Supabase SQL editor.

-- 1. ugc_orders fields for reminder tracking and expiration
ALTER TABLE ugc_orders
  ADD COLUMN IF NOT EXISTS reminders_sent int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_reason text;

-- 2. ugc_briefs fields for relisting and priority Explore sorting
ALTER TABLE ugc_briefs
  ADD COLUMN IF NOT EXISTS relisted_at timestamptz,
  ADD COLUMN IF NOT EXISTS relist_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_priority boolean DEFAULT false;

-- 3. users fields for creator reliability stats and WhatsApp opt-in
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS missed_deadlines_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean DEFAULT false;

-- 4. brand_refund_accounts for manual company bank transfer payouts
CREATE TABLE IF NOT EXISTS brand_refund_accounts (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  method_type text NOT NULL CHECK (method_type IN ('UPI', 'BANK')),
  upi_id text,
  bank_account_number text,
  bank_ifsc text,
  account_holder_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One refund account per brand (the API upserts on brand_id; without this every save fails).
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_refund_accounts_brand_id ON brand_refund_accounts(brand_id);
ALTER TABLE brand_refund_accounts ENABLE ROW LEVEL SECURITY;
-- No public policies: accessible exclusively by backend service-role

-- 5. ugc_refunds queue for brand brief cancellations (manual company payouts)
CREATE TABLE IF NOT EXISTS ugc_refunds (
  id text PRIMARY KEY,
  brief_id text NOT NULL,
  brand_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  slots int NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  refund_account_snapshot jsonb NOT NULL,
  utr text,
  failure_reason text,
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by text
);

CREATE INDEX IF NOT EXISTS idx_ugc_refunds_brand_id ON ugc_refunds(brand_id);
CREATE INDEX IF NOT EXISTS idx_ugc_refunds_brief_id ON ugc_refunds(brief_id);
CREATE INDEX IF NOT EXISTS idx_ugc_refunds_status ON ugc_refunds(status);
ALTER TABLE ugc_refunds ENABLE ROW LEVEL SECURITY;
-- No public policies: accessible exclusively by backend service-role

-- 6. If ugc_orders / ugc_briefs have a CHECK constraint on status, add the new values:
--    ugc_orders.status: 'EXPIRED'      ugc_briefs.status: 'CANCELLED', 'PARTIALLY_CANCELLED'
--    (Supabase Claude: inspect pg_constraint for these tables and extend the list if present.)

-- 7. Brief delivery hours (session 24, if not run yet)
ALTER TABLE ugc_briefs ADD COLUMN IF NOT EXISTS delivery_hours integer
  CHECK (delivery_hours IS NULL OR delivery_hours IN (24, 48, 72));
```

### 4. `session30_campaign_manage.sql` — Session 30 — pause / close campaign

```sql
-- Session 30: columns for "Pause new applications" and "Close campaign" (backend/campaignManage.ts).
-- Safe to run twice.
alter table public.campaigns add column if not exists applications_paused boolean not null default false;
alter table public.campaigns add column if not exists applications_paused_at timestamptz;
alter table public.campaigns add column if not exists applications_paused_by text;
alter table public.campaigns add column if not exists closed_at timestamptz;
alter table public.campaigns add column if not exists closed_by text;
-- Check: does the status constraint allow 'completed'? (Close writes status = 'completed'.)
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.campaigns'::regclass and contype = 'c';
```

### 5. `user_consents.sql` — Session 34 — what each user agreed to (Terms, Privacy…)

```sql
-- Session 34: what each user agreed to (Terms, Privacy, marketing updates, Creator/Brand Terms),
-- which version and when. Written by the server only (backend/consents.ts, service-role key).
-- Run once in Supabase → SQL Editor.
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

-- Public creator application: when the applicant agreed (the form works without this column too).
alter table public.waitlist add column if not exists terms_accepted_at timestamptz;
```

### 6. `onboarding_progress.sql` — Session 34 — onboarding continues where the user left

```sql
-- Session 34: onboarding progress (answers + current step), saved after every step so a creator or
-- brand continues exactly where they left, on any device. Read/written by the server only
-- (backend/onboardingProgress.ts, service-role key).
-- Run once in Supabase → SQL Editor.
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
-- No policies on purpose: anon / logged-in browser clients get nothing.
revoke all on public.onboarding_progress from anon, authenticated;
```

### 7. `session35_schema_fixes.sql` — Session 35 — columns the app writes but the DB never had (+2 triggers)

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

### 8. `session36.sql` — Session 36 — onboarding reminders + admin bulk email tables

```sql
-- Session 36 (v249 + v250). Only NEW tables; nothing is dropped or changed. RLS on, no policies,
-- anon/authenticated revoked — only the server (service-role key) reads and writes them.

-- v249: onboarding reminder emails (max 2 per person; "Stop these reminders")
create table if not exists public.onboarding_reminders (
  user_id      text primary key,
  sent_count   integer not null default 0,
  last_sent_at timestamptz,
  stopped_at   timestamptz
);
alter table public.onboarding_reminders enable row level security;
revoke all on public.onboarding_reminders from anon, authenticated;

-- v250: admin bulk email — report, queue and unsubscribes
create table if not exists public.email_broadcasts (
  id          text primary key,
  subject     text not null,
  heading     text,
  body_text   text not null,
  cta_label   text,
  cta_url     text,
  audience    text not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  total       integer not null default 0,
  sent        integer not null default 0,
  failed      integer not null default 0,
  skipped     integer not null default 0,
  queued      integer not null default 0,
  status      text not null default 'sending'
);
create table if not exists public.email_broadcast_recipients (
  id            text primary key,
  broadcast_id  text not null references public.email_broadcasts(id) on delete cascade,
  email         text not null,
  name          text,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  error         text,
  attempts      integer not null default 0,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists email_broadcast_recipients_queue_idx on public.email_broadcast_recipients (status, created_at);
create index if not exists email_broadcast_recipients_bc_idx on public.email_broadcast_recipients (broadcast_id);
create table if not exists public.email_unsubscribes (
  email       text primary key,
  created_at  timestamptz not null default now()
);
alter table public.email_broadcasts enable row level security;
alter table public.email_broadcast_recipients enable row level security;
alter table public.email_unsubscribes enable row level security;
revoke all on public.email_broadcasts from anon, authenticated;
revoke all on public.email_broadcast_recipients from anon, authenticated;
revoke all on public.email_unsubscribes from anon, authenticated;

-- v250: fee offer toggle (₹0 platform fee + convenience fee) — set only by POST /admin/fee-offer
alter table public.platform_fee_config add column if not exists offer_mode boolean not null default false;
alter table public.platform_fee_config add column if not exists offer_fee_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists offer_label text;

-- v250: creator coupons — "apply automatically" launch offers
alter table public.coupons add column if not exists auto_apply boolean not null default false;

-- v252: creator referral programme
alter table public.referrals add column if not exists referred_email text;
alter table public.referral_config add column if not exists signups_per_reward integer;
alter table public.referral_config add column if not exists free_deals_per_reward integer;
alter table public.referral_config add column if not exists free_deals_valid_days integer;
alter table public.referral_config add column if not exists featured_days integer;
alter table public.referral_config add column if not exists share_pct_of_fee numeric;
alter table public.referral_config add column if not exists share_cap_per_creator numeric;
alter table public.referral_config add column if not exists min_withdraw numeric;
alter table public.referral_config add column if not exists attribution_days integer;
create table if not exists public.referral_reward_uses (
  id           text primary key,
  user_id      text not null,
  deal_id      text,
  ugc_order_id text,
  created_at   timestamptz not null default now()
);
create table if not exists public.referral_withdrawals (
  id         text primary key,
  user_id    text not null,
  amount     numeric not null,
  status     text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  utr        text,
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);
alter table public.referral_reward_uses enable row level security;
alter table public.referral_withdrawals enable row level security;
revoke all on public.referral_reward_uses from anon, authenticated;
revoke all on public.referral_withdrawals from anon, authenticated;

-- v252: promotional line shown with the fee offer
alter table public.platform_fee_config add column if not exists offer_promo_line text;
alter table public.platform_fee_config add column if not exists offer_line_until timestamptz;
```

### 9. `session38.sql` — Session 38 — brand / agency markup fee settings

```sql
-- Session 38 (Ravi: "PHELE YE SAB THEEK KRO") — run once in Supabase → SQL Editor.
-- Only ADDS columns. Safe to run twice.
--
-- Brand / agency markup (the % added to a creator's rate card when a brand or agency views it)
-- and the matching deduction %s used to live only in the server's local file (lost on every
-- deploy, different on every Cloud Run instance). They now sit next to the other fee settings.
-- Defaults are the values the app used until now.

alter table public.platform_fee_config add column if not exists brand_markup_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists creator_deduction_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists agency_markup_pct numeric not null default 5;
alter table public.platform_fee_config add column if not exists agency_deduction_pct numeric not null default 5;

-- Make sure the server can read the new columns right away (PostgREST schema cache).
notify pgrst, 'reload schema';
```

### 10. `session38_part2.sql` — Session 38 — chat moderation log + pitch leads

```sql
-- Session 38, part 2 (Ravi: "YE SAB BANAO") — run once in Supabase → SQL Editor, after session38.sql.
-- Only NEW tables. RLS on, no policies, anon/authenticated revoked: only the server
-- (service-role key) reads and writes them. Safe to run twice.

-- Chat moderation: every chat message the server blocked (phone / email / abuse) or only
-- logged (profanity). Admin → Chat and Reports read this; it used to live in one server's file.
create table if not exists public.chat_moderation_events (
  id           text primary key,
  thread_id    text,
  sender_id    text,
  sender_role  text,
  code         text not null,
  reason       text,
  matched      text,
  content      text not null default '',
  blocked      boolean not null default true,
  status       text not null default 'OPEN',
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists chat_moderation_events_created_idx on public.chat_moderation_events (created_at desc);
create index if not exists chat_moderation_events_sender_idx on public.chat_moderation_events (sender_id);
alter table public.chat_moderation_events enable row level security;
revoke all on public.chat_moderation_events from anon, authenticated;

-- Admin's own pipeline status + notes for a pitch (brand → creator invite). Kept apart from
-- brief_requests.status, which the invite flow itself uses.
create table if not exists public.pitch_lead_admin (
  pitch_id      text primary key,
  admin_status  text,
  admin_notes   text,
  updated_by    text,
  updated_at    timestamptz not null default now()
);
alter table public.pitch_lead_admin enable row level security;
revoke all on public.pitch_lead_admin from anon, authenticated;

notify pgrst, 'reload schema';
```

### 11. `session39.sql` — Session 39 — creator home picks + referral config

```sql
-- Session 39 — only ADDS. Run once in Supabase (SQL editor).
-- 1) Admin picks the 3–4 creators shown on the creator Home ("Creators like you, winning on YBEX")
--    and on the onboarding photo step. Admin → Users → creator → "Show on creator home".
alter table if exists public.creator_profiles
  add column if not exists show_on_creator_home boolean not null default false;
create index if not exists creator_profiles_home_pick_idx
  on public.creator_profiles (show_on_creator_home) where show_on_creator_home;

-- 2) Referral share (Ravi, session 39): 0.2% of what the invited friend received (after the Ybex
--    fee), still capped per friend. New admin-editable setting; the old share_pct_of_fee column
--    stays (not used any more).
alter table if exists public.referral_config
  add column if not exists share_pct_of_earnings numeric not null default 0.2;
```

### 12. `session40.sql` — Session 40 — two score columns may be empty ("Not enough data")

```sql
-- Session 40 (v260). Safe to run more than once.
-- Audience estimate: when a creator has not given likes / reach, "Authentic audience" and
-- "Performance score" are stored as NULL ("Not enough data") instead of a made-up number.
alter table public.creator_profiles alter column fake_follower_pct drop not null;
alter table public.creator_profiles alter column performance_score drop not null;
```

### 13. `session41.sql` — Session 41 — What's new + push notifications (5 tables)

```sql
-- Session 41 — Ravi approved building What's new + push notifications now ("now strt working").
-- Run this whole file once in Supabase → SQL editor after deploying v261. Safe to run again.
-- Session 41 — "What's new" popup. Run once in Supabase → SQL editor.
create table if not exists public.whats_new (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  points jsonb not null default '[]'::jsonb,
  audience text not null default 'all' check (audience in ('all', 'creator', 'brand')),
  cta_label text,
  cta_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whats_new_seen (
  user_id text not null,
  item_id uuid not null references public.whats_new(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Only the server (service key) reads and writes these tables.
alter table public.whats_new enable row level security;
alter table public.whats_new_seen enable row level security;

-- Push notifications ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  url text,
  audience text not null default 'all' check (audience in ('all', 'creator', 'brand', 'niche')),
  niches jsonb not null default '[]'::jsonb,
  send_at timestamptz,          -- empty = send now
  sent_at timestamptz,          -- set when it went out
  sent_count integer,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.push_log (
  user_id text not null,
  kind text not null,           -- 'promo' | 'deal'
  ref text not null,            -- push_campaigns.id or notifications.id
  sent_at timestamptz not null default now(),
  primary key (kind, ref, user_id)
);
create index if not exists push_log_promo_day_idx on public.push_log (kind, sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_campaigns enable row level security;
alter table public.push_log enable row level security;
```

## Not to run now (see step 4)

### `purge_aadhaar.sql`

```sql
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
```

### `find_wrongly_completed_briefs.sql`

```sql
-- Session 24. Briefs that were auto-marked COMPLETED while slots were still open
-- (bug: "Completed · Recruited 1/2"). Read-only: review the list first.
select b.id, b.title, b.brand_id, b.max_creators, b.claimed_count, b.budget,
       count(o.id) filter (where upper(coalesce(o.status,'')) in ('COMPLETED','PAID','RELEASED')
                           or upper(coalesce(o.payment_status,'')) in ('RELEASED','PAID')) as done_orders,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) as open_slots,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) * b.budget as escrow_on_open_slots
from public.ugc_briefs b
left join public.ugc_orders o on o.brief_id = b.id
where upper(coalesce(b.status,'')) = 'COMPLETED'
group by b.id
having count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED') < b.max_creators
order by b.created_at desc;

-- To reopen them for creators (only after reviewing the list above):
-- update public.ugc_briefs set status = 'OPEN' where id in ( ...ids from above... );
```

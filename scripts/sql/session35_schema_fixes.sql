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

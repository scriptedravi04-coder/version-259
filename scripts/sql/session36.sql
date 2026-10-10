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

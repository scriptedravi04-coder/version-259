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

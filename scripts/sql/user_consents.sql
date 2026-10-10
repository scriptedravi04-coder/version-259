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

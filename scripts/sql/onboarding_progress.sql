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

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

-- Session 40 (v260). Safe to run more than once.
-- Audience estimate: when a creator has not given likes / reach, "Authentic audience" and
-- "Performance score" are stored as NULL ("Not enough data") instead of a made-up number.
alter table public.creator_profiles alter column fake_follower_pct drop not null;
alter table public.creator_profiles alter column performance_score drop not null;

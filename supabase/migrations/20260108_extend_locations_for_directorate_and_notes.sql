-- Extend locations table to support directorate-style locations and new UI fields.
-- Safe to run multiple times.

ALTER TABLE IF EXISTS public.locations
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS is_accepted boolean not null default false,
  ADD COLUMN IF NOT EXISTS is_installed boolean not null default false,
  ADD COLUMN IF NOT EXISTS has_card_access boolean not null default false,
  ADD COLUMN IF NOT EXISTS is_installed_card_access boolean not null default false,
  ADD COLUMN IF NOT EXISTS is_active_card_access boolean not null default false;

-- is_two_door_card_access may already exist in earlier migration; keep here for safety.
ALTER TABLE IF EXISTS public.locations
  ADD COLUMN IF NOT EXISTS is_two_door_card_access boolean not null default false;

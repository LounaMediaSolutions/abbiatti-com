-- Add `country` and `state` to profiles so the admin / cohost / employee
-- listing pages can filter people by their location.
--
-- We store ISO codes — not display labels — so the data is stable across
-- the app's three languages (FR / EN / AR). The frontend turns these into
-- localized labels via src/lib/locations.ts.
--
-- Examples:
--   country = 'DZ'      (Algeria)
--   country = 'AE'      (United Arab Emirates)
--   state   = 'DZ-16'   (Wilaya d'Alger)
--   state   = 'AE-DU'   (Emirate of Dubai)
--
-- Both columns are nullable — existing profiles aren't backfilled. Users
-- without a country/state simply don't match country/state filters.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS state   text;

-- Cheap index on country (low cardinality, used as a filter prefix).
CREATE INDEX IF NOT EXISTS profiles_country_idx ON public.profiles (country);
CREATE INDEX IF NOT EXISTS profiles_state_idx   ON public.profiles (state);

NOTIFY pgrst, 'reload schema';

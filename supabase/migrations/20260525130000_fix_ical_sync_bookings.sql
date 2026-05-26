-- Fix iCal sync writing into bookings.
--
-- The original migration (20260517120000_create_property_ical_feeds.sql)
-- assumed two things about the bookings table that don't hold in the live
-- schema:
--
--   1. The partial unique index `WHERE channel_ref IS NOT NULL` could serve
--      as a PostgREST upsert conflict target. PostgREST doesn't pass the
--      WHERE predicate to ON CONFLICT, so the implicit conflict target
--      lookup fails. (The edge function now uses an explicit SELECT →
--      INSERT/UPDATE so it doesn't depend on this anymore, but any other
--      caller that tries upsert(onConflict) on the same triple will hit
--      the same wall — so we replace the partial index with a full one.)
--
--   2. bookings.channel_slug has a foreign key to booking_channels.slug.
--      The slugs the sync function emits (airbnb / booking / vrbo /
--      expedia / manual) won't satisfy that FK unless the corresponding
--      rows already exist in booking_channels. There was no migration
--      seeding them, so first-time deployments fail the FK silently
--      (the per-row write returns an error and the function moves on,
--      so the user sees `last_synced_count = 0` with no visible error).
--
-- Both fixes are idempotent.

-- ─── 1. Seed booking_channels for the sources sync-ical emits ────────────
INSERT INTO public.booking_channels (slug, name)
VALUES
  ('airbnb',  'Airbnb'),
  ('booking', 'Booking.com'),
  ('vrbo',    'Vrbo'),
  ('expedia', 'Expedia'),
  ('manual',  'Manual')
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. Replace the partial unique index with a full one ─────────────────
-- The partial index can stay for query performance, but for PostgREST
-- upserts we need a full unique constraint on the same columns. Postgres
-- treats NULL channel_ref values as DISTINCT by default in unique indexes,
-- so manual bookings (channel_ref IS NULL) are still permitted without
-- conflicting with each other.
DROP INDEX IF EXISTS public.bookings_channel_ref_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_channel_ref_unique_idx
  ON public.bookings (property_id, channel_slug, channel_ref);

-- Reload PostgREST so the new constraint is visible.
NOTIFY pgrst, 'reload schema';

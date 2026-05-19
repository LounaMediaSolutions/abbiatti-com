-- Create property_ical_feeds — one row per channel feed (Airbnb, Booking,
-- VRBO, etc.) attached to a property. The companion Supabase Edge Function
-- `sync-ical` reads these rows, fetches each URL, parses VEVENTs, and
-- upserts rows into `bookings`.
--
-- Used by:
--   * src/components/IcalManager.tsx — admin dialog for CRUD + Sync now
--   * supabase/functions/sync-ical/index.ts — scheduled / on-demand worker

CREATE TABLE IF NOT EXISTS public.property_ical_feeds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id         uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  label               text NOT NULL,
  source              text NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('airbnb', 'booking', 'vrbo', 'expedia', 'manual')),
  ical_url            text NOT NULL,
  active              boolean NOT NULL DEFAULT true,
  last_synced_at      timestamptz,
  last_synced_count   integer,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_ical_feeds_org_id_idx
  ON public.property_ical_feeds (organization_id);
CREATE INDEX IF NOT EXISTS property_ical_feeds_property_id_idx
  ON public.property_ical_feeds (property_id);
CREATE INDEX IF NOT EXISTS property_ical_feeds_active_idx
  ON public.property_ical_feeds (active) WHERE active;

-- A unique index on the bookings table lets the edge function upsert by
-- (property_id, channel_slug, channel_ref). VEVENT.UID is the natural key
-- coming from Airbnb/Booking/etc. — we treat it as channel_ref.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_channel_ref_unique_idx
  ON public.bookings (property_id, channel_slug, channel_ref)
  WHERE channel_ref IS NOT NULL;

ALTER TABLE public.property_ical_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage property_ical_feeds" ON public.property_ical_feeds;
DROP POLICY IF EXISTS "Org members view property_ical_feeds"    ON public.property_ical_feeds;
DROP POLICY IF EXISTS "Managers insert property_ical_feeds"     ON public.property_ical_feeds;
DROP POLICY IF EXISTS "Managers update property_ical_feeds"     ON public.property_ical_feeds;
DROP POLICY IF EXISTS "Managers delete property_ical_feeds"     ON public.property_ical_feeds;

CREATE POLICY "Super admins manage property_ical_feeds"
  ON public.property_ical_feeds
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view property_ical_feeds"
  ON public.property_ical_feeds
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Managers insert property_ical_feeds"
  ON public.property_ical_feeds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_ical_feeds.organization_id
             OR p.pending_org_id = property_ical_feeds.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers update property_ical_feeds"
  ON public.property_ical_feeds
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_ical_feeds.organization_id
             OR p.pending_org_id = property_ical_feeds.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers delete property_ical_feeds"
  ON public.property_ical_feeds
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_ical_feeds.organization_id
             OR p.pending_org_id = property_ical_feeds.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

CREATE OR REPLACE FUNCTION public.property_ical_feeds_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_ical_feeds_set_updated_at
  ON public.property_ical_feeds;
CREATE TRIGGER property_ical_feeds_set_updated_at
  BEFORE UPDATE ON public.property_ical_feeds
  FOR EACH ROW
  EXECUTE FUNCTION public.property_ical_feeds_set_updated_at();

NOTIFY pgrst, 'reload schema';

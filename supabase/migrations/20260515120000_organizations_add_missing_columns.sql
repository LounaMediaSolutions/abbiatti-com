-- Adds columns the app code expects but that are missing from the live
-- organizations table: brand_color, max_cohosts, suspended.
-- Idempotent: safe to re-run.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS max_cohosts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS suspended   boolean NOT NULL DEFAULT false;

-- Backfill brand_color from primary_color if it already exists, so existing
-- orgs keep their branding.
UPDATE public.organizations
SET brand_color = primary_color
WHERE brand_color IS NULL
  AND primary_color IS NOT NULL;

-- Force PostgREST to reload its schema cache so the new columns are
-- immediately queryable via supabase-js (otherwise you'd have to wait
-- a few seconds or restart the API).
NOTIFY pgrst, 'reload schema';

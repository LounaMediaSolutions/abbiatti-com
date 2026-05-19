-- Create guest_uploads table + guest-uploads storage bucket — photos the
-- guest shares from the portal's "Partager" tab.
--
-- Used by:
--   * src/pages/GuestPortal.tsx — uploads file to bucket then inserts a
--     metadata row. Reads via supabase.storage.from("guest-uploads")
--     .getPublicUrl(storage_path).
--
-- Path format: <organization_id>/<guest_account_id>/<timestamp>-<file>

-- Table -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guest_uploads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  guest_account_id  uuid NOT NULL REFERENCES public.guest_accounts(id) ON DELETE CASCADE,
  storage_path      text NOT NULL,
  comment           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_uploads_org_id_idx
  ON public.guest_uploads (organization_id);
CREATE INDEX IF NOT EXISTS guest_uploads_guest_account_id_idx
  ON public.guest_uploads (guest_account_id);

ALTER TABLE public.guest_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage guest_uploads" ON public.guest_uploads;
DROP POLICY IF EXISTS "Org members view guest_uploads"    ON public.guest_uploads;
DROP POLICY IF EXISTS "Guest inserts own uploads"         ON public.guest_uploads;
DROP POLICY IF EXISTS "Managers delete guest_uploads"     ON public.guest_uploads;

CREATE POLICY "Super admins manage guest_uploads"
  ON public.guest_uploads
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view guest_uploads"
  ON public.guest_uploads
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.guest_accounts ga
      WHERE ga.id = guest_uploads.guest_account_id
        AND ga.user_id = auth.uid()
    )
  );

CREATE POLICY "Guest inserts own uploads"
  ON public.guest_uploads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.guest_accounts ga
      WHERE ga.id = guest_uploads.guest_account_id
        AND ga.user_id = auth.uid()
        AND ga.organization_id = guest_uploads.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_uploads.organization_id
             OR p.pending_org_id = guest_uploads.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers delete guest_uploads"
  ON public.guest_uploads
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_uploads.organization_id
             OR p.pending_org_id = guest_uploads.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.guest_accounts ga
      WHERE ga.id = guest_uploads.guest_account_id
        AND ga.user_id = auth.uid()
    )
  );

-- Storage bucket --------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('guest-uploads', 'guest-uploads', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "guest_uploads public read"    ON storage.objects;
DROP POLICY IF EXISTS "guest_uploads owner write"    ON storage.objects;
DROP POLICY IF EXISTS "guest_uploads manager delete" ON storage.objects;

CREATE POLICY "guest_uploads public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'guest-uploads');

-- Only authenticated users whose profile.org_id (or pending_org_id) matches
-- the first path segment, OR a guest whose guest_accounts row matches the
-- first two path segments (<org_id>/<guest_account_id>/...), may upload.
CREATE POLICY "guest_uploads owner write"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'guest-uploads'
    AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            (storage.foldername(name))[1] = p.org_id::text
            OR (storage.foldername(name))[1] = p.pending_org_id::text
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.guest_accounts ga
        WHERE ga.user_id = auth.uid()
          AND (storage.foldername(name))[1] = ga.organization_id::text
          AND (storage.foldername(name))[2] = ga.id::text
      )
    )
  );

CREATE POLICY "guest_uploads manager delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'guest-uploads'
    AND (
      public.is_super_admin(auth.uid())
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'co_admin', 'super_admin')
          AND (
            (storage.foldername(name))[1] = p.org_id::text
            OR (storage.foldername(name))[1] = p.pending_org_id::text
          )
      )
    )
  );

NOTIFY pgrst, 'reload schema';

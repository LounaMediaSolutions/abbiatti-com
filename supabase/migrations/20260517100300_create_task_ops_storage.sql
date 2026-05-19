-- Provision storage buckets for the Task Ops pack.
--
-- 1. `task-photos`         (private)  — uploaded by managers + assignees.
--                                       Path format: <org_id>/<task_id>/<filename>
--                                       Read via createSignedUrl (1h).
-- 2. `maintenance-photos`  (public)   — uploaded by ReportIssue.tsx (anon
--                                       guests) and managers. Path format:
--                                       <organization_id>/<timestamp>-<filename>
--                                       Read via getPublicUrl.
--
-- Idempotent: uses INSERT … ON CONFLICT DO NOTHING and CREATE POLICY guarded
-- with DROP POLICY IF EXISTS so this can be replayed safely.

-- Buckets ---------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-photos', 'task-photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-photos', 'maintenance-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- task-photos policies --------------------------------------------------
-- The first path segment is the org_id; restrict read/write to users whose
-- profile.org_id matches.

DROP POLICY IF EXISTS "task_photos read"   ON storage.objects;
DROP POLICY IF EXISTS "task_photos write"  ON storage.objects;
DROP POLICY IF EXISTS "task_photos delete" ON storage.objects;

CREATE POLICY "task_photos read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'task-photos'
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
    )
  );

CREATE POLICY "task_photos write"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'task-photos'
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
    )
  );

CREATE POLICY "task_photos delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'task-photos'
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

-- maintenance-photos policies ------------------------------------------
-- Public read (bucket is public, so this is mostly belt-and-braces).
-- Insert is open to authenticated AND anon (matches ReportIssue.tsx
-- anonymous form).

DROP POLICY IF EXISTS "maintenance_photos public read"   ON storage.objects;
DROP POLICY IF EXISTS "maintenance_photos auth write"    ON storage.objects;
DROP POLICY IF EXISTS "maintenance_photos anon write"    ON storage.objects;
DROP POLICY IF EXISTS "maintenance_photos manager delete" ON storage.objects;

CREATE POLICY "maintenance_photos public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'maintenance-photos');

CREATE POLICY "maintenance_photos auth write"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'maintenance-photos');

CREATE POLICY "maintenance_photos anon write"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'maintenance-photos');

CREATE POLICY "maintenance_photos manager delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'maintenance-photos'
    AND (
      public.is_super_admin(auth.uid())
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'co_admin', 'super_admin')
      )
    )
  );

NOTIFY pgrst, 'reload schema';

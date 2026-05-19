-- Create task_photos table — proof-of-work photos attached to tasks.
--
-- Used by:
--   * src/pages/Tasks.tsx — manager-side task detail (insert + read via signed URL)
--   * src/pages/MyAgenda.tsx — employee agenda inline photo upload (new in this slice)
--
-- Column-name discipline: Tasks.tsx queries this table with `org_id` (NOT
-- `organization_id`), so we use `org_id` here. Cf. cleaning_checklists and
-- maintenance_tickets which use `organization_id`.

CREATE TABLE IF NOT EXISTS public.task_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path  text NOT NULL,
  kind          text NOT NULL DEFAULT 'during'
                 CHECK (kind IN ('before', 'during', 'after', 'issue')),
  caption       text,
  zone          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_photos_task_id_idx ON public.task_photos (task_id);
CREATE INDEX IF NOT EXISTS task_photos_org_id_idx  ON public.task_photos (org_id);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

-- Policies follow the 4-policy template from 20260516120000:
-- super-admin bypass, org-member SELECT, manager-or-assignee INSERT,
-- manager-or-assignee UPDATE/DELETE.

DROP POLICY IF EXISTS "Super admins manage task_photos" ON public.task_photos;
DROP POLICY IF EXISTS "Org members view task_photos"   ON public.task_photos;
DROP POLICY IF EXISTS "Members insert task_photos"     ON public.task_photos;
DROP POLICY IF EXISTS "Owners delete task_photos"      ON public.task_photos;

CREATE POLICY "Super admins manage task_photos"
  ON public.task_photos
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Read: any member of the same org, or the assignee of the parent task.
CREATE POLICY "Org members view task_photos"
  ON public.task_photos
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_photos.task_id
        AND t.assigned_to = auth.uid()
    )
  );

-- Insert: managers in the org, OR the assignee of the parent task (so a
-- cleaner can attach photos to their own task without manager rights).
CREATE POLICY "Members insert task_photos"
  ON public.task_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = task_photos.org_id OR p.pending_org_id = task_photos.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_photos.task_id
        AND t.assigned_to = auth.uid()
    )
  );

-- Delete: only the uploader or a manager. Photos are append-only otherwise.
CREATE POLICY "Owners delete task_photos"
  ON public.task_photos
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = task_photos.org_id OR p.pending_org_id = task_photos.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';

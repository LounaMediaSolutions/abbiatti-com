-- Create cleaning_checklists table — per-task checklist items for cleaning
-- (and similar) tasks.
--
-- Used by:
--   * src/components/CleaningChecklist.tsx — component that reads/writes
--     items by task_id. Auto-seeds 10 default French items on first load.
--
-- Column-name discipline: CleaningChecklist.tsx queries with
-- `organization_id` (NOT `org_id`). Match that here.

CREATE TABLE IF NOT EXISTS public.cleaning_checklists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label           text NOT NULL,
  done            boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cleaning_checklists_task_id_idx
  ON public.cleaning_checklists (task_id);
CREATE INDEX IF NOT EXISTS cleaning_checklists_org_id_idx
  ON public.cleaning_checklists (organization_id);

ALTER TABLE public.cleaning_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage cleaning_checklists" ON public.cleaning_checklists;
DROP POLICY IF EXISTS "Org members view cleaning_checklists"    ON public.cleaning_checklists;
DROP POLICY IF EXISTS "Members insert cleaning_checklists"      ON public.cleaning_checklists;
DROP POLICY IF EXISTS "Assignee updates cleaning_checklists"    ON public.cleaning_checklists;
DROP POLICY IF EXISTS "Managers delete cleaning_checklists"     ON public.cleaning_checklists;

CREATE POLICY "Super admins manage cleaning_checklists"
  ON public.cleaning_checklists
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view cleaning_checklists"
  ON public.cleaning_checklists
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = cleaning_checklists.task_id
        AND t.assigned_to = auth.uid()
    )
  );

-- Insert: managers OR the assignee (auto-seed flow runs as whoever opens the
-- task — that may be a cleaner, so we permit assignee insert).
CREATE POLICY "Members insert cleaning_checklists"
  ON public.cleaning_checklists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = cleaning_checklists.organization_id
             OR p.pending_org_id = cleaning_checklists.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = cleaning_checklists.task_id
        AND t.assigned_to = auth.uid()
    )
  );

-- Update: managers OR the assignee (cleaner ticks the box).
CREATE POLICY "Assignee updates cleaning_checklists"
  ON public.cleaning_checklists
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = cleaning_checklists.organization_id
             OR p.pending_org_id = cleaning_checklists.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = cleaning_checklists.task_id
        AND t.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Managers delete cleaning_checklists"
  ON public.cleaning_checklists
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = cleaning_checklists.organization_id
             OR p.pending_org_id = cleaning_checklists.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

-- Touch updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.cleaning_checklists_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cleaning_checklists_set_updated_at
  ON public.cleaning_checklists;
CREATE TRIGGER cleaning_checklists_set_updated_at
  BEFORE UPDATE ON public.cleaning_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.cleaning_checklists_set_updated_at();

NOTIFY pgrst, 'reload schema';

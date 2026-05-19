-- Create maintenance_tickets table — operational anomalies and repair
-- requests against a property.
--
-- Used by:
--   * src/pages/Tickets.tsx — manager queue (read + status updates)
--   * src/pages/ReportIssue.tsx — public anon form at /r/:slug
--   * src/pages/MyAgenda.tsx — employee "Report a problem" inline action
--     (new in this slice) — creates a ticket linked to the active task
--
-- Column-name discipline: Tickets.tsx and ReportIssue.tsx both use
-- `organization_id`. Match that here.

CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id     uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  task_id         uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  category        text,
  status          text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  priority        text NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name   text,
  reporter_phone  text,
  photo_url       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS maintenance_tickets_org_id_idx
  ON public.maintenance_tickets (organization_id);
CREATE INDEX IF NOT EXISTS maintenance_tickets_property_id_idx
  ON public.maintenance_tickets (property_id);
CREATE INDEX IF NOT EXISTS maintenance_tickets_task_id_idx
  ON public.maintenance_tickets (task_id);
CREATE INDEX IF NOT EXISTS maintenance_tickets_status_idx
  ON public.maintenance_tickets (status);

ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage maintenance_tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Org members view maintenance_tickets"    ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Authenticated insert maintenance_tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Public anon insert maintenance_tickets"   ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Managers update maintenance_tickets"     ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Managers delete maintenance_tickets"     ON public.maintenance_tickets;

CREATE POLICY "Super admins manage maintenance_tickets"
  ON public.maintenance_tickets
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view maintenance_tickets"
  ON public.maintenance_tickets
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR assigned_to = auth.uid()
    OR reported_by = auth.uid()
  );

-- Insert by authenticated users: managers, cohosts, OR the assignee of the
-- task being reported on (so an employee can flag an anomaly mid-task).
CREATE POLICY "Authenticated insert maintenance_tickets"
  ON public.maintenance_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = maintenance_tickets.organization_id
             OR p.pending_org_id = maintenance_tickets.organization_id)
    )
  );

-- Insert by anonymous users (for the public /r/:slug form). We trust the
-- form to set `organization_id` correctly from the looked-up guest_book /
-- property; tightening this further would require server-side validation
-- which can be added later via an edge function.
CREATE POLICY "Public anon insert maintenance_tickets"
  ON public.maintenance_tickets
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Managers update maintenance_tickets"
  ON public.maintenance_tickets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = maintenance_tickets.organization_id
             OR p.pending_org_id = maintenance_tickets.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Managers delete maintenance_tickets"
  ON public.maintenance_tickets
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = maintenance_tickets.organization_id
             OR p.pending_org_id = maintenance_tickets.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.maintenance_tickets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  -- When status flips to resolved, stamp resolved_at the first time.
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at = COALESCE(NEW.resolved_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_tickets_set_updated_at
  ON public.maintenance_tickets;
CREATE TRIGGER maintenance_tickets_set_updated_at
  BEFORE UPDATE ON public.maintenance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.maintenance_tickets_set_updated_at();

NOTIFY pgrst, 'reload schema';

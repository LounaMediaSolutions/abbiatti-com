-- Create property_members — generic "who's assigned to which property" table.
-- Complements `property_cohosts` (which is cohost-specific and carries the
-- `permissions text[]` array). property_members covers the wider case of any
-- profile-to-property link, including employee roles (cleaner / driver /
-- decorator / maintenance / staff).
--
-- Used by:
--   * src/pages/Properties.tsx — inserts/deletes when an admin assigns a
--     cohost or employee to a specific property. Currently double-writes to
--     property_cohosts AND property_members for cohost assignments — the
--     latter is what was failing with "Could not find the table
--     'public.property_members' in the schema cache".
--   * src/pages/Team.tsx — reads staff assignments per property.
--   * src/pages/CohostDetail.tsx — reads employees on a cohost's properties.
--
-- Column-name discipline: all three callers use `organization_id` (not
-- `org_id`). Match that here.

CREATE TABLE IF NOT EXISTS public.property_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id     uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL
                   CHECK (role IN ('cohost', 'cleaner', 'driver', 'decorator', 'maintenance', 'staff')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- A user can only hold one assignment per (property, role) pair. Stops
-- duplicate inserts from the admin UI.
CREATE UNIQUE INDEX IF NOT EXISTS property_members_unique_assignment
  ON public.property_members (property_id, user_id, role);

CREATE INDEX IF NOT EXISTS property_members_org_id_idx
  ON public.property_members (organization_id);
CREATE INDEX IF NOT EXISTS property_members_user_id_idx
  ON public.property_members (user_id);
CREATE INDEX IF NOT EXISTS property_members_property_id_idx
  ON public.property_members (property_id);

ALTER TABLE public.property_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage property_members" ON public.property_members;
DROP POLICY IF EXISTS "Org members view property_members"    ON public.property_members;
DROP POLICY IF EXISTS "Managers insert property_members"     ON public.property_members;
DROP POLICY IF EXISTS "Managers update property_members"     ON public.property_members;
DROP POLICY IF EXISTS "Managers delete property_members"     ON public.property_members;

CREATE POLICY "Super admins manage property_members"
  ON public.property_members
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Read: any member of the same org, or the assignee themselves.
CREATE POLICY "Org members view property_members"
  ON public.property_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Only managers (admin, co_admin, cohost) can create / update / delete
-- assignments. Cohosts can manage *their* assigned properties via the
-- property_cohosts table — this generic table is admin-only on writes to
-- avoid the cohost being able to assign themselves to new properties.
CREATE POLICY "Managers insert property_members"
  ON public.property_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_members.organization_id
             OR p.pending_org_id = property_members.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

CREATE POLICY "Managers update property_members"
  ON public.property_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_members.organization_id
             OR p.pending_org_id = property_members.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

CREATE POLICY "Managers delete property_members"
  ON public.property_members
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_members.organization_id
             OR p.pending_org_id = property_members.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';

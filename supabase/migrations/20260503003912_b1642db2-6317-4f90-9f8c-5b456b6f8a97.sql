CREATE TABLE public.property_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  assigned_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, user_id, role)
);

CREATE INDEX idx_property_members_user ON public.property_members(user_id);
CREATE INDEX idx_property_members_property ON public.property_members(property_id);

ALTER TABLE public.property_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_property_cohost(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_members
    WHERE user_id = _user_id AND property_id = _property_id AND role = 'cohost'
  )
$$;

CREATE POLICY "Members view assignments in their org"
ON public.property_members FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins or cohosts assign members"
ON public.property_members FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin')
  OR (
    is_property_cohost(auth.uid(), property_id)
    AND role IN ('cleaner','driver','decorator','maintenance','staff')
  )
);

CREATE POLICY "Admins or cohosts remove members"
ON public.property_members FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin')
  OR (
    is_property_cohost(auth.uid(), property_id)
    AND role IN ('cleaner','driver','decorator','maintenance','staff')
  )
);
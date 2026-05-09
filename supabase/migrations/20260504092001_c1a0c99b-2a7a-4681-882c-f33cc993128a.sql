CREATE OR REPLACE FUNCTION public.guard_pending_property_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If property is pending, only admin/co_admin can update it
  IF OLD.approval_status = 'pending' THEN
    IF NOT (
      has_role(auth.uid(), OLD.organization_id, 'admin'::app_role)
      OR has_role(auth.uid(), OLD.organization_id, 'co_admin'::app_role)
    ) THEN
      RAISE EXCEPTION 'Cette propriété est en attente de validation. Vous ne pouvez pas la modifier tant qu''un admin ou co-admin ne l''a pas validée ou rejetée.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pending_property_edits ON public.properties;
CREATE TRIGGER trg_guard_pending_property_edits
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_pending_property_edits();
CREATE TABLE IF NOT EXISTS public.property_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  event text NOT NULL,
  actor_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_approval_events_property
  ON public.property_approval_events(property_id, created_at DESC);

ALTER TABLE public.property_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view approval events of their org"
ON public.property_approval_events
FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), organization_id));

-- No INSERT/UPDATE/DELETE policies → only triggers (SECURITY DEFINER) can write

-- Auto-log on insert (submission)
CREATE OR REPLACE FUNCTION public.log_property_submission_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status = 'pending' THEN
    INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id)
    VALUES (NEW.id, NEW.organization_id, 'submitted', NEW.submitted_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_property_submission_event ON public.properties;
CREATE TRIGGER trg_log_property_submission_event
AFTER INSERT ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.log_property_submission_event();

-- Auto-log on approval_status change
CREATE OR REPLACE FUNCTION public.log_property_status_change_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'approved' THEN
      INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id)
      VALUES (NEW.id, NEW.organization_id, 'approved', auth.uid());
    ELSIF NEW.approval_status = 'rejected' THEN
      INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id, reason)
      VALUES (NEW.id, NEW.organization_id, 'rejected', auth.uid(), NEW.rejection_reason);
    ELSIF NEW.approval_status = 'pending' THEN
      INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id)
      VALUES (NEW.id, NEW.organization_id, 'resubmitted', auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_property_status_change_event ON public.properties;
CREATE TRIGGER trg_log_property_status_change_event
AFTER UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.log_property_status_change_event();

-- Backfill existing properties with a synthetic 'submitted' event
INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id, created_at)
SELECT p.id, p.organization_id, 'submitted', p.submitted_by, p.created_at
FROM public.properties p
WHERE NOT EXISTS (
  SELECT 1 FROM public.property_approval_events e WHERE e.property_id = p.id AND e.event = 'submitted'
);

-- Backfill approval events for already-approved props
INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id, created_at)
SELECT p.id, p.organization_id, 'approved', p.approved_by, COALESCE(p.approved_at, p.created_at)
FROM public.properties p
WHERE p.approval_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM public.property_approval_events e WHERE e.property_id = p.id AND e.event = 'approved'
  );
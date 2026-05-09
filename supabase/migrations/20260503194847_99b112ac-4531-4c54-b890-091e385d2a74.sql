
-- Extend task_type enum
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'transfer';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'delivery';

-- Cleaning checklists (one row per item per task)
CREATE TABLE IF NOT EXISTS public.cleaning_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cleaning_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view checklists"
  ON public.cleaning_checklists FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins cohosts manage checklists"
  ON public.cleaning_checklists FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'));

CREATE POLICY "Assignee toggles checklist items"
  ON public.cleaning_checklists FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM tasks WHERE tasks.id = cleaning_checklists.task_id AND tasks.assigned_to = auth.uid()));

CREATE TRIGGER trg_checklists_updated BEFORE UPDATE ON public.cleaning_checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_checklists_task ON public.cleaning_checklists(task_id);

-- Reservation rentals (delivered/returned tracking)
CREATE TABLE IF NOT EXISTS public.reservation_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL,
  rental_item_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  delivered_at timestamptz,
  delivered_by uuid,
  returned_at timestamptz,
  returned_by uuid,
  signature_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reservation_rentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view reservation rentals"
  ON public.reservation_rentals FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins cohosts manage reservation rentals"
  ON public.reservation_rentals FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'));

CREATE POLICY "Staff update delivery on assigned"
  ON public.reservation_rentals FOR UPDATE TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE TRIGGER trg_resv_rentals_updated BEFORE UPDATE ON public.reservation_rentals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_rr_reservation ON public.reservation_rentals(reservation_id);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipient views own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Recipient marks read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Org members create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON public.notifications(recipient_id, read_at);

-- Trigger: notify cohosts/admins when a task is completed or has issue
CREATE OR REPLACE FUNCTION public.notify_task_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recipient record;
  prop_name text;
  notif_title text;
  notif_type text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('done', 'issue') THEN RETURN NEW; END IF;

  SELECT name INTO prop_name FROM properties WHERE id = NEW.property_id;

  IF NEW.status = 'done' THEN
    notif_type := 'task_done';
    notif_title := '✅ ' || NEW.title || COALESCE(' · ' || prop_name, '');
  ELSE
    notif_type := 'task_issue';
    notif_title := '⚠️ ' || NEW.title || COALESCE(' · ' || prop_name, '');
  END IF;

  FOR recipient IN
    SELECT DISTINCT user_id FROM user_roles
    WHERE organization_id = NEW.organization_id AND role IN ('admin', 'cohost')
  LOOP
    INSERT INTO notifications (organization_id, recipient_id, type, title, body, link)
    VALUES (NEW.organization_id, recipient.user_id, notif_type, notif_title,
            COALESCE(NEW.issue_description, NEW.staff_notes), '/tasks');
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_status ON public.tasks;
CREATE TRIGGER trg_notify_task_status
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_status_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

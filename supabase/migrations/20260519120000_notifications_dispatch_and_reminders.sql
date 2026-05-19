-- ============================================================================
-- 20260519120000_notifications_dispatch_and_reminders
--
-- Wires the existing `notifications` table into the lifecycle events that the
-- Pilot Patrick spec depends on:
--
--   • Phase 1 / Test 5  — Admin + assigned cohosts notified when a reservation
--     is created.
--   • Phase 5 / Test 20 — Assignee notified when a task is created or
--     re-assigned.
--   • Phase 9 / Test 35 — Admins notified when a maintenance ticket is opened.
--   • Phase 10 / Test 38 — Daily 19h pg_cron job that creates a "send
--     photo-reminder" notification for the owner-host the eve of every
--     check-out (templated via message_templates `photo.reminder.checkout_eve`).
--
-- All triggers are idempotent (CREATE OR REPLACE FUNCTION + DROP TRIGGER IF
-- EXISTS) and use SECURITY DEFINER so they bypass RLS on `notifications`
-- INSERT.  The recipient list is derived from `user_roles` for admins and
-- `property_cohosts` for the cohosts actually assigned to that property —
-- matching the role isolation rule in CLAUDE.md.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Reservation INSERT → notify admins + assigned cohosts
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_reservation_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recipient_id uuid;
  prop_name    text;
  notif_title  text;
  notif_body   text;
BEGIN
  SELECT name INTO prop_name FROM public.properties WHERE id = NEW.property_id;

  notif_title := '🗓 ' || COALESCE(NEW.guest_name, 'Nouveau voyageur')
                 || COALESCE(' · ' || prop_name, '');
  notif_body  := COALESCE(NEW.check_in::text, '?') || ' → '
                 || COALESCE(NEW.check_out::text, '?');

  -- Admins (org-wide)
  FOR recipient_id IN
    SELECT DISTINCT user_id FROM public.user_roles
     WHERE organization_id = NEW.organization_id
       AND role = 'admin'
  LOOP
    INSERT INTO public.notifications
      (organization_id, recipient_id, type, title, body, link)
    VALUES
      (NEW.organization_id, recipient_id, 'booking_created',
       notif_title, notif_body, '/reservations');
  END LOOP;

  -- Cohosts actually assigned to this property
  FOR recipient_id IN
    SELECT DISTINCT user_id FROM public.property_cohosts
     WHERE property_id = NEW.property_id
  LOOP
    INSERT INTO public.notifications
      (organization_id, recipient_id, type, title, body, link)
    VALUES
      (NEW.organization_id, recipient_id, 'booking_created',
       notif_title, notif_body, '/cohost/dashboard');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reservation_created ON public.reservations;
CREATE TRIGGER trg_notify_reservation_created
  AFTER INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.notify_reservation_created();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Task INSERT or assignee change → notify the assignee
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prop_name   text;
  notif_title text;
BEGIN
  -- Only fire on a real assignment (not self-assignment to NULL).
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) = NEW.assigned_to THEN
    RETURN NEW;
  END IF;
  -- Don't notify the creator self-assigning a task they just created.
  IF NEW.assigned_to = NEW.created_by THEN RETURN NEW; END IF;

  SELECT name INTO prop_name FROM public.properties WHERE id = NEW.property_id;

  notif_title := '📋 ' || NEW.title || COALESCE(' · ' || prop_name, '');

  INSERT INTO public.notifications
    (organization_id, recipient_id, type, title, body, link)
  VALUES
    (NEW.organization_id, NEW.assigned_to, 'task_assigned',
     notif_title,
     CASE
       WHEN NEW.due_at IS NOT NULL
       THEN 'Échéance : ' || to_char(NEW.due_at, 'DD/MM HH24:MI')
       ELSE NULL
     END,
     '/employee');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned_ins ON public.tasks;
CREATE TRIGGER trg_notify_task_assigned_ins
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

DROP TRIGGER IF EXISTS trg_notify_task_assigned_upd ON public.tasks;
CREATE TRIGGER trg_notify_task_assigned_upd
  AFTER UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Maintenance ticket INSERT → notify admins
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_maintenance_ticket_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recipient_id uuid;
  prop_name    text;
  notif_title  text;
  prio_icon    text;
BEGIN
  SELECT name INTO prop_name FROM public.properties WHERE id = NEW.property_id;

  prio_icon := CASE NEW.priority
                 WHEN 'urgent' THEN '🚨'
                 WHEN 'high'   THEN '⚠️'
                 ELSE '🛠'
               END;

  notif_title := prio_icon || ' ' || NEW.title || COALESCE(' · ' || prop_name, '');

  FOR recipient_id IN
    SELECT DISTINCT user_id FROM public.user_roles
     WHERE organization_id = NEW.organization_id
       AND role IN ('admin', 'cohost')
  LOOP
    INSERT INTO public.notifications
      (organization_id, recipient_id, type, title, body, link)
    VALUES
      (NEW.organization_id, recipient_id, 'ticket_created',
       notif_title, NEW.description, '/tickets');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_created ON public.maintenance_tickets;
CREATE TRIGGER trg_notify_ticket_created
  AFTER INSERT ON public.maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_maintenance_ticket_created();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Scheduled photo reminder — eve of checkout
--
-- Each day at 19:00 UTC, for every reservation whose check_out = tomorrow,
-- enqueue a notification to the admins + assigned cohosts so they can prompt
-- the guest to share their photos before they leave.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_checkout_eve_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r              record;
  v_recipient_id uuid;
  prop_name      text;
  notif_title    text;
BEGIN
  FOR r IN
    SELECT id, organization_id, property_id, guest_name, check_out, guest_language
      FROM public.reservations
     WHERE check_out = (CURRENT_DATE + INTERVAL '1 day')::date
       AND status IN ('confirmed', 'in_progress')
  LOOP
    SELECT name INTO prop_name FROM public.properties WHERE id = r.property_id;

    notif_title := '📸 Rappel photo départ · '
                   || COALESCE(r.guest_name, 'voyageur')
                   || COALESCE(' · ' || prop_name, '');

    FOR v_recipient_id IN
      SELECT user_id FROM public.user_roles
       WHERE organization_id = r.organization_id AND role = 'admin'
      UNION
      SELECT user_id FROM public.property_cohosts
       WHERE property_id = r.property_id
    LOOP
      -- Idempotent: skip if we already created one for this reservation today.
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.recipient_id = v_recipient_id
           AND n.type = 'photo_reminder'
           AND n.created_at::date = CURRENT_DATE
           AND n.link = '/reservations/' || r.id::text
      ) THEN
        INSERT INTO public.notifications
          (organization_id, recipient_id, type, title, body, link)
        VALUES
          (r.organization_id, v_recipient_id, 'photo_reminder',
           notif_title,
           'Demain check-out ' || r.check_out::text
             || '. Demandez au voyageur de partager ses photos.',
           '/reservations/' || r.id::text);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Enable pg_cron if available, otherwise silently no-op. The function is
-- still callable manually via:  SELECT public.dispatch_checkout_eve_reminders();
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      -- Unschedule any prior version of this job under the same name.
      PERFORM cron.unschedule(jobid)
        FROM cron.job WHERE jobname = 'escapar_checkout_eve_reminders';
      PERFORM cron.schedule(
        'escapar_checkout_eve_reminders',
        '0 19 * * *',
        $job$ SELECT public.dispatch_checkout_eve_reminders(); $job$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron not available; reminder must be triggered manually.';
  END IF;
END;
$cron$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Realtime — reservations + maintenance_tickets so any open dashboards
--    update in place when the triggers above fire.
-- ────────────────────────────────────────────────────────────────────────────
DO $realtime$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_tickets;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$realtime$;

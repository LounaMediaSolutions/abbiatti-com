CREATE OR REPLACE FUNCTION public.start_task_with_qr(_task_id uuid, _qr_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  task_prop uuid; task_status text; task_assignee uuid; expected_token text;
BEGIN
  SELECT property_id, status::text, assigned_to
    INTO task_prop, task_status, task_assignee
  FROM public.tasks WHERE id = _task_id;

  IF task_prop IS NULL THEN
    RAISE EXCEPTION 'Tâche introuvable';
  END IF;
  IF task_assignee IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Vous n''êtes pas assigné à cette tâche';
  END IF;
  IF task_status <> 'todo' THEN
    RAISE EXCEPTION 'Tâche déjà commencée ou terminée';
  END IF;

  SELECT qr_token INTO expected_token FROM public.properties WHERE id = task_prop;
  IF expected_token IS NULL OR expected_token <> _qr_token THEN
    RAISE EXCEPTION 'QR code ne correspond pas à la propriété';
  END IF;

  UPDATE public.tasks
    SET status = 'in_progress', started_at = now()
    WHERE id = _task_id AND assigned_to = auth.uid() AND status = 'todo';
  RETURN FOUND;
END;
$$;
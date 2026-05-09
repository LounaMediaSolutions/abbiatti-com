-- 1) QR token per property for staff check-in scan
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS qr_token text UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '');

UPDATE public.properties
  SET qr_token = replace(gen_random_uuid()::text, '-', '')
  WHERE qr_token IS NULL;

-- 2) Unique guest slug per reservation
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS guest_slug text UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '');

UPDATE public.reservations
  SET guest_slug = replace(gen_random_uuid()::text, '-', '')
  WHERE guest_slug IS NULL;

-- 3) Public RPC to fetch reservation + guest book by reservation slug
CREATE OR REPLACE FUNCTION public.get_public_reservation_book(_slug text)
RETURNS TABLE (
  reservation_id uuid,
  property_id uuid,
  organization_id uuid,
  guest_name text,
  check_in date,
  check_out date,
  guests_count int,
  property_name text,
  property_city text,
  property_cover text,
  guest_book jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.property_id, r.organization_id, r.guest_name, r.check_in, r.check_out, r.guests_count,
    p.name, p.city, p.cover_image_url,
    to_jsonb(gb.*)
  FROM public.reservations r
  JOIN public.properties p ON p.id = r.property_id
  LEFT JOIN public.guest_books gb ON gb.property_id = r.property_id AND gb.active = true
  WHERE r.guest_slug = _slug
  LIMIT 1;
$$;

-- 4) Task check-in helper: verify property qr_token then start task
CREATE OR REPLACE FUNCTION public.start_task_with_qr(_task_id uuid, _qr_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  task_prop uuid; expected_token text;
BEGIN
  SELECT property_id INTO task_prop FROM public.tasks
    WHERE id = _task_id AND assigned_to = auth.uid();
  IF task_prop IS NULL THEN
    RAISE EXCEPTION 'Tâche introuvable ou non assignée';
  END IF;
  SELECT qr_token INTO expected_token FROM public.properties WHERE id = task_prop;
  IF expected_token IS NULL OR expected_token <> _qr_token THEN
    RAISE EXCEPTION 'QR code ne correspond pas à la propriété';
  END IF;
  UPDATE public.tasks SET status = 'in_progress', started_at = now() WHERE id = _task_id;
  RETURN true;
END;
$$;
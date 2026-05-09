-- Enums
CREATE TYPE public.reservation_source AS ENUM ('airbnb', 'booking', 'vrbo', 'abritel', 'direct', 'manual', 'other');
CREATE TYPE public.reservation_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'blocked');

-- Reservations
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  property_id UUID NOT NULL,
  source reservation_source NOT NULL DEFAULT 'manual',
  external_id TEXT,
  external_code TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guest_name TEXT,
  guest_phone TEXT,
  guest_language TEXT DEFAULT 'fr',
  guests_count INTEGER DEFAULT 1,
  expected_arrival_time TIME,
  status reservation_status NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'EUR',
  messages_sent JSONB DEFAULT '[]'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, source, external_id)
);

CREATE INDEX idx_reservations_org ON public.reservations(organization_id);
CREATE INDEX idx_reservations_property ON public.reservations(property_id);
CREATE INDEX idx_reservations_dates ON public.reservations(check_in, check_out);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view reservations" ON public.reservations
FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts insert reservations" ON public.reservations
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'));

CREATE POLICY "Admins and cohosts update reservations" ON public.reservations
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'));

CREATE POLICY "Admins and cohosts delete reservations" ON public.reservations
FOR DELETE TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'));

CREATE TRIGGER reservations_updated_at
BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- iCal Feeds
CREATE TABLE public.property_ical_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  property_id UUID NOT NULL,
  label TEXT NOT NULL,
  source reservation_source NOT NULL DEFAULT 'airbnb',
  ical_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ical_feeds_property ON public.property_ical_feeds(property_id);

ALTER TABLE public.property_ical_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view feeds" ON public.property_ical_feeds
FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts manage feeds" ON public.property_ical_feeds
FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'));

CREATE TRIGGER ical_feeds_updated_at
BEFORE UPDATE ON public.property_ical_feeds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Message Templates
CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT,
  body_fr TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE INDEX idx_templates_org ON public.message_templates(organization_id);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view templates" ON public.message_templates
FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts manage templates" ON public.message_templates
FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost'));

CREATE TRIGGER templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create cleaning task at checkout
CREATE OR REPLACE FUNCTION public.create_cleaning_task_for_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'in_progress') THEN
    INSERT INTO public.tasks (organization_id, property_id, created_by, title, type, status, priority, due_at)
    VALUES (
      NEW.organization_id,
      NEW.property_id,
      COALESCE(auth.uid(), NEW.organization_id),
      'Ménage check-out' || COALESCE(' - ' || NEW.guest_name, ''),
      'cleaning',
      'todo',
      2,
      (NEW.check_out::timestamp + interval '11 hours') AT TIME ZONE 'UTC'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservation_create_cleaning_task
AFTER INSERT ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.create_cleaning_task_for_reservation();
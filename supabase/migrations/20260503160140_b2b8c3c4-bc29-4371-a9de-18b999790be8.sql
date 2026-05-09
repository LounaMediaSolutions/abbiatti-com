
-- Guest book table (digital welcome book per property)
CREATE TABLE public.guest_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  property_id UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  language TEXT NOT NULL DEFAULT 'fr',
  wifi_name TEXT,
  wifi_password TEXT,
  check_in_instructions TEXT,
  check_out_instructions TEXT,
  house_rules TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  emergency_phone TEXT,
  restaurants JSONB NOT NULL DEFAULT '[]'::jsonb,
  attractions JSONB NOT NULL DEFAULT '[]'::jsonb,
  extra_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_guest_books_property ON public.guest_books(property_id);
CREATE INDEX idx_guest_books_slug ON public.guest_books(slug);

ALTER TABLE public.guest_books ENABLE ROW LEVEL SECURITY;

-- Public can view active guest books (anon access for QR code)
CREATE POLICY "Public can view active guest books"
ON public.guest_books FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "Members view own org guest books"
ON public.guest_books FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts manage guest books"
ON public.guest_books FOR ALL
TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE TRIGGER guest_books_updated_at
BEFORE UPDATE ON public.guest_books
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Maintenance tickets (problem reports from guests via QR)
CREATE TYPE public.ticket_category AS ENUM ('plumbing', 'electrical', 'appliance', 'cleanliness', 'wifi', 'noise', 'other');
CREATE TYPE public.ticket_status AS ENUM ('new', 'in_progress', 'resolved', 'closed');

CREATE TABLE public.maintenance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  property_id UUID NOT NULL,
  reservation_id UUID,
  category public.ticket_category NOT NULL DEFAULT 'other',
  status public.ticket_status NOT NULL DEFAULT 'new',
  priority INTEGER NOT NULL DEFAULT 2,
  title TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  reporter_name TEXT,
  reporter_phone TEXT,
  reporter_language TEXT DEFAULT 'fr',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_tickets_property ON public.maintenance_tickets(property_id);
CREATE INDEX idx_maintenance_tickets_status ON public.maintenance_tickets(status);
CREATE INDEX idx_maintenance_tickets_org ON public.maintenance_tickets(organization_id);

ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon guests via QR) can create a ticket
CREATE POLICY "Anyone can create tickets"
ON public.maintenance_tickets FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Members view org tickets"
ON public.maintenance_tickets FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts update tickets"
ON public.maintenance_tickets FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role) OR has_role(auth.uid(), organization_id, 'maintenance'::app_role));

CREATE POLICY "Admins and cohosts delete tickets"
ON public.maintenance_tickets FOR DELETE
TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE TRIGGER maintenance_tickets_updated_at
BEFORE UPDATE ON public.maintenance_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for maintenance photos (public read for simplicity)
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-photos', 'maintenance-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Maintenance photos public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'maintenance-photos');

CREATE POLICY "Anyone can upload maintenance photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'maintenance-photos');

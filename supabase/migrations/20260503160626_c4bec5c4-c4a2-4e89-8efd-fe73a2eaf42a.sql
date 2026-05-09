
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS public_description TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS price_per_night NUMERIC;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS website_tagline TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS website_contact_phone TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS website_contact_email TEXT;

-- Public can view showcased properties
CREATE POLICY "Public can view showcased properties"
ON public.properties FOR SELECT
TO anon, authenticated
USING (
  show_on_website = true
  AND organization_id IN (SELECT id FROM public.organizations WHERE show_on_website = true)
);

-- Public can view showcase orgs
CREATE POLICY "Public can view showcase orgs"
ON public.organizations FOR SELECT
TO anon, authenticated
USING (show_on_website = true);

-- Booking requests
CREATE TYPE public.booking_request_status AS ENUM ('new', 'contacted', 'confirmed', 'declined', 'closed');

CREATE TABLE public.booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  property_id UUID,
  status public.booking_request_status NOT NULL DEFAULT 'new',
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  check_in DATE,
  check_out DATE,
  guests_count INTEGER DEFAULT 2,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_requests_org ON public.booking_requests(organization_id);

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit booking requests"
ON public.booking_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Members view org booking requests"
ON public.booking_requests FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts manage booking requests"
ON public.booking_requests FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE POLICY "Admins and cohosts delete booking requests"
ON public.booking_requests FOR DELETE
TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE TRIGGER booking_requests_updated_at
BEFORE UPDATE ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

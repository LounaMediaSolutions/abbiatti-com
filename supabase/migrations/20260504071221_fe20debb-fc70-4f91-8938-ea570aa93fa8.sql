CREATE TYPE partner_tier AS ENUM ('gold', 'silver', 'standard');

ALTER TABLE public.partner_services
  ADD COLUMN tier partner_tier NOT NULL DEFAULT 'standard',
  ADD COLUMN visible_to_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_phone text,
  ADD COLUMN website_url text;

CREATE INDEX idx_partner_services_visible
  ON public.partner_services(organization_id, visible_to_guest, active);

-- Allow guests (authenticated users with a guest_account in the org) to see
-- partners flagged visible_to_guest.
CREATE POLICY "Guests view visible partners of their org"
ON public.partner_services
FOR SELECT
TO authenticated
USING (
  active = true
  AND visible_to_guest = true
  AND EXISTS (
    SELECT 1 FROM public.guest_accounts ga
    WHERE ga.user_id = auth.uid()
      AND ga.organization_id = partner_services.organization_id
      AND ga.deleted_at IS NULL
  )
);
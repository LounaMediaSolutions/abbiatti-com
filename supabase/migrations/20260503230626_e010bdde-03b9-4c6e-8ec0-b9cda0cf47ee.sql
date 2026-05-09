
-- 1. Public properties view (omits access_code and entry_instructions)
DROP POLICY IF EXISTS "Public can view showcased properties" ON public.properties;

CREATE OR REPLACE VIEW public.public_properties
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  p.id, p.organization_id, p.name, p.city, p.region, p.country,
  p.bedrooms, p.bathrooms, p.max_guests, p.cover_image_url,
  p.public_description, p.price_per_night, p.property_type,
  p.categories, p.show_on_website
FROM public.properties p
WHERE p.show_on_website = true
  AND p.organization_id IN (SELECT id FROM public.organizations WHERE show_on_website = true);

GRANT SELECT ON public.public_properties TO anon, authenticated;

-- Re-add a policy so the view (running as invoker) can read base rows for showcased properties
CREATE POLICY "Public can view showcased properties (safe cols)"
ON public.properties
FOR SELECT
USING (
  show_on_website = true
  AND organization_id IN (SELECT id FROM public.organizations WHERE show_on_website = true)
);
-- Anon already had access_code/entry_instructions revoked at column level in earlier migration.

-- 2. Maintenance tickets: ensure property belongs to same org and is showcased
DROP POLICY IF EXISTS "Anyone can create tickets" ON public.maintenance_tickets;
CREATE POLICY "Anyone can create tickets"
ON public.maintenance_tickets
FOR INSERT
WITH CHECK (
  organization_id IN (SELECT id FROM public.organizations WHERE show_on_website = true)
  AND property_id IN (
    SELECT id FROM public.properties
    WHERE organization_id = maintenance_tickets.organization_id
      AND show_on_website = true
  )
);

-- 3. Notifications: only admins/cohosts can create
DROP POLICY IF EXISTS "Org members create notifications" ON public.notifications;
CREATE POLICY "Admins and cohosts create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR has_role(auth.uid(), organization_id, 'cohost'::app_role)
);

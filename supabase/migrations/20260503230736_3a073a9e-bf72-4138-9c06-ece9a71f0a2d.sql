DROP POLICY IF EXISTS "Anyone can submit booking requests" ON public.booking_requests;
CREATE POLICY "Anyone can submit booking requests"
ON public.booking_requests
FOR INSERT
WITH CHECK (
  organization_id IN (SELECT id FROM public.organizations WHERE show_on_website = true)
  AND (
    property_id IS NULL
    OR property_id IN (
      SELECT id FROM public.properties
      WHERE organization_id = booking_requests.organization_id AND show_on_website = true
    )
  )
);
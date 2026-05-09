CREATE POLICY "Public views welcome_footer banners"
ON public.ad_banners FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND visible_to_guest = true
  AND placement = 'welcome_footer'
  AND start_date <= CURRENT_DATE
  AND end_date >= CURRENT_DATE
  AND organization_id IN (
    SELECT id FROM public.organizations WHERE show_on_website = true
  )
);

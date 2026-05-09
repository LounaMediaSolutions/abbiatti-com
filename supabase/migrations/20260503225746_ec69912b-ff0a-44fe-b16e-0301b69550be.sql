
-- 1. Properties: hide access_code and entry_instructions from anon role
REVOKE SELECT (access_code, entry_instructions) ON public.properties FROM anon;

-- 2. Guest books: tighten public SELECT policy to opted-in orgs only
DROP POLICY IF EXISTS "Public can view active guest books" ON public.guest_books;
CREATE POLICY "Public can view active guest books"
ON public.guest_books
FOR SELECT
USING (
  active = true
  AND organization_id IN (
    SELECT id FROM public.organizations WHERE show_on_website = true
  )
);

-- 3. Booking requests: restrict anonymous insert to opted-in orgs
DROP POLICY IF EXISTS "Anyone can submit booking requests" ON public.booking_requests;
CREATE POLICY "Anyone can submit booking requests"
ON public.booking_requests
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT id FROM public.organizations WHERE show_on_website = true
  )
);

-- 4. Maintenance tickets: restrict anonymous insert to opted-in orgs
DROP POLICY IF EXISTS "Anyone can create tickets" ON public.maintenance_tickets;
CREATE POLICY "Anyone can create tickets"
ON public.maintenance_tickets
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT id FROM public.organizations WHERE show_on_website = true
  )
);

-- 5. Lock down SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_org(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_property_cohost(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_cleaning_task_for_reservation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_task_status_change() FROM anon, authenticated, public;

-- 6. Fix mutable search_path on set_updated_at
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 7. Maintenance photos bucket: prevent listing all files (keep direct URL access via signed/public URL)
DROP POLICY IF EXISTS "Maintenance photos public read" ON storage.objects;

-- 8. Realtime messages: require authentication for channel subscriptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='realtime' AND tablename='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages';
    EXECUTE 'CREATE POLICY "Authenticated users can receive realtime" ON realtime.messages FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)';
  END IF;
END $$;

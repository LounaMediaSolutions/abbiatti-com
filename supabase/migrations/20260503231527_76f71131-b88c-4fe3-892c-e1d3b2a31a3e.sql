
-- 1. Replace broad public SELECT on guest_books with a slug-only lookup function
DROP POLICY IF EXISTS "Public can view active guest books" ON public.guest_books;

CREATE OR REPLACE FUNCTION public.get_public_guest_book(_slug text)
RETURNS SETOF public.guest_books
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.*
  FROM public.guest_books g
  JOIN public.organizations o ON o.id = g.organization_id
  WHERE g.slug = _slug
    AND g.active = true
    AND o.show_on_website = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_guest_book(text) TO anon, authenticated;

-- 2. Reservation rentals: restrict staff updates to their own delivery/return records
DROP POLICY IF EXISTS "Staff update delivery on assigned" ON public.reservation_rentals;
CREATE POLICY "Staff update own delivery records"
ON public.reservation_rentals
FOR UPDATE
TO authenticated
USING (
  is_org_member(auth.uid(), organization_id)
  AND (delivered_by = auth.uid() OR returned_by = auth.uid())
)
WITH CHECK (
  is_org_member(auth.uid(), organization_id)
  AND (delivered_by = auth.uid() OR returned_by = auth.uid())
);

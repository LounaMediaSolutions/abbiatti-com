-- Create guest_books table — per-property digital welcome book.
--
-- Used by:
--   * src/pages/GuestBook.tsx        — public read at /g/:slug via the
--     SECURITY DEFINER RPC `get_public_guest_book(_slug)` below. The page is
--     unauthenticated; the RPC enforces `active = true`.
--   * src/pages/GuestPortal.tsx      — authenticated guest reads the book
--     for their property_id (no slug lookup).
--   * src/pages/GuestBooks.tsx       — manager CRUD (admin/cohost).
--   * src/pages/ReportIssue.tsx      — public looks up the property from a
--     slug to scope the new maintenance_tickets row.

CREATE TABLE IF NOT EXISTS public.guest_books (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id              uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  slug                     text NOT NULL UNIQUE,
  active                   boolean NOT NULL DEFAULT true,
  language                 text NOT NULL DEFAULT 'fr'
                            CHECK (language IN ('fr', 'en', 'ar')),
  wifi_name                text,
  wifi_password            text,
  check_in_instructions    text,
  check_out_instructions   text,
  house_rules              text,
  contact_name             text,
  contact_phone            text,
  emergency_phone          text,
  restaurants              jsonb NOT NULL DEFAULT '[]'::jsonb,
  attractions              jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_notes              text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_books_org_id_idx
  ON public.guest_books (organization_id);
CREATE INDEX IF NOT EXISTS guest_books_property_id_idx
  ON public.guest_books (property_id);
CREATE INDEX IF NOT EXISTS guest_books_slug_active_idx
  ON public.guest_books (slug) WHERE active;

ALTER TABLE public.guest_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage guest_books" ON public.guest_books;
DROP POLICY IF EXISTS "Org members view guest_books"    ON public.guest_books;
DROP POLICY IF EXISTS "Guests view own property book"   ON public.guest_books;
DROP POLICY IF EXISTS "Managers insert guest_books"     ON public.guest_books;
DROP POLICY IF EXISTS "Managers update guest_books"     ON public.guest_books;
DROP POLICY IF EXISTS "Managers delete guest_books"     ON public.guest_books;

CREATE POLICY "Super admins manage guest_books"
  ON public.guest_books
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Org members + the guest whose guest_account points at this book's property.
CREATE POLICY "Org members view guest_books"
  ON public.guest_books
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.guest_accounts ga
      WHERE ga.user_id = auth.uid()
        AND ga.property_id = guest_books.property_id
        AND ga.deleted_at IS NULL
    )
  );

CREATE POLICY "Managers insert guest_books"
  ON public.guest_books
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_books.organization_id
             OR p.pending_org_id = guest_books.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers update guest_books"
  ON public.guest_books
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_books.organization_id
             OR p.pending_org_id = guest_books.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers delete guest_books"
  ON public.guest_books
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_books.organization_id
             OR p.pending_org_id = guest_books.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

-- Public anonymous read via SECURITY DEFINER RPC. Anon can't SELECT the table
-- directly; this function returns ONE active row by slug. GuestBook.tsx
-- calls `supabase.rpc("get_public_guest_book", { _slug })`.

CREATE OR REPLACE FUNCTION public.get_public_guest_book(_slug text)
RETURNS TABLE (
  id                       uuid,
  organization_id          uuid,
  property_id              uuid,
  slug                     text,
  active                   boolean,
  language                 text,
  wifi_name                text,
  wifi_password            text,
  check_in_instructions    text,
  check_out_instructions   text,
  house_rules              text,
  contact_name             text,
  contact_phone            text,
  emergency_phone          text,
  restaurants              jsonb,
  attractions              jsonb,
  extra_notes              text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, organization_id, property_id, slug, active, language,
    wifi_name, wifi_password,
    check_in_instructions, check_out_instructions,
    house_rules, contact_name, contact_phone, emergency_phone,
    restaurants, attractions, extra_notes
  FROM public.guest_books
  WHERE slug = _slug AND active = true
  LIMIT 1;
$$;

-- Allow anon + authenticated to call the RPC.
GRANT EXECUTE ON FUNCTION public.get_public_guest_book(text) TO anon, authenticated;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.guest_books_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guest_books_set_updated_at ON public.guest_books;
CREATE TRIGGER guest_books_set_updated_at
  BEFORE UPDATE ON public.guest_books
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_books_set_updated_at();

NOTIFY pgrst, 'reload schema';

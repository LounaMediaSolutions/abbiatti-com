-- Create guest_accounts table — links an auth.users row to a property /
-- reservation so the guest can access the digital welcome book and message
-- thread for their stay.
--
-- Used by:
--   * src/pages/GuestPortal.tsx — queries by user_id; reads marketing_consent,
--     language, full_name, email, phone, etc.
--   * src/pages/Reservations.tsx via CreateGuestAccountDialog — manager
--     creates a guest account for a booking.
--
-- Column-name discipline: GuestPortal uses `organization_id` and
-- `reservation_id`. Note: the `reservations` table does NOT exist in this
-- deployment (live schema uses `bookings`). We type reservation_id as uuid
-- without an FK so the guest_accounts row can outlive a renamed bookings
-- table, and we tolerate either source. preview-mode code still queries
-- `reservations` directly — those queries remain broken until that table
-- (or a renamed equivalent) ships.

CREATE TABLE IF NOT EXISTS public.guest_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reservation_id    uuid,
  property_id       uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  full_name         text,
  email             text,
  phone             text,
  language          text NOT NULL DEFAULT 'fr'
                     CHECK (language IN ('fr', 'en', 'ar')),
  marketing_consent boolean NOT NULL DEFAULT false,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_accounts_org_id_idx
  ON public.guest_accounts (organization_id);
CREATE INDEX IF NOT EXISTS guest_accounts_user_id_idx
  ON public.guest_accounts (user_id);
CREATE INDEX IF NOT EXISTS guest_accounts_reservation_id_idx
  ON public.guest_accounts (reservation_id);
CREATE INDEX IF NOT EXISTS guest_accounts_property_id_idx
  ON public.guest_accounts (property_id);

ALTER TABLE public.guest_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage guest_accounts" ON public.guest_accounts;
DROP POLICY IF EXISTS "Org members view guest_accounts"    ON public.guest_accounts;
DROP POLICY IF EXISTS "Guests view own account"            ON public.guest_accounts;
DROP POLICY IF EXISTS "Managers insert guest_accounts"     ON public.guest_accounts;
DROP POLICY IF EXISTS "Account owners update consent"      ON public.guest_accounts;
DROP POLICY IF EXISTS "Managers delete guest_accounts"     ON public.guest_accounts;

CREATE POLICY "Super admins manage guest_accounts"
  ON public.guest_accounts
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Org members (admin/cohost/employee) see every guest_account in their org.
-- The guest themselves sees their own account.
CREATE POLICY "Org members view guest_accounts"
  ON public.guest_accounts
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Only managers create guest accounts (via CreateGuestAccountDialog).
CREATE POLICY "Managers insert guest_accounts"
  ON public.guest_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_accounts.organization_id
             OR p.pending_org_id = guest_accounts.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

-- A guest may update their own marketing_consent / language. Managers can
-- update anything on accounts in their org.
CREATE POLICY "Account owners update consent"
  ON public.guest_accounts
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_accounts.organization_id
             OR p.pending_org_id = guest_accounts.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers delete guest_accounts"
  ON public.guest_accounts
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_accounts.organization_id
             OR p.pending_org_id = guest_accounts.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.guest_accounts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guest_accounts_set_updated_at
  ON public.guest_accounts;
CREATE TRIGGER guest_accounts_set_updated_at
  BEFORE UPDATE ON public.guest_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_accounts_set_updated_at();

NOTIFY pgrst, 'reload schema';

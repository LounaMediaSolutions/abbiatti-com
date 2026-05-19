-- Create guest_messages table — host↔guest message thread, scoped to a
-- single guest_account.
--
-- Used by:
--   * src/pages/GuestPortal.tsx — guest reads/writes their thread.
--   * src/pages/Reservations.tsx / future host inbox — host reads/writes.
--
-- sender_role discriminates the bubble side ('guest' vs 'host'). sender_id
-- is auth.users.id for both — we don't separate guest vs host into different
-- columns because that complicates RLS for no benefit.

CREATE TABLE IF NOT EXISTS public.guest_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  guest_account_id  uuid NOT NULL REFERENCES public.guest_accounts(id) ON DELETE CASCADE,
  sender_role       text NOT NULL CHECK (sender_role IN ('guest', 'host')),
  sender_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body              text NOT NULL,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_messages_org_id_idx
  ON public.guest_messages (organization_id);
CREATE INDEX IF NOT EXISTS guest_messages_guest_account_id_idx
  ON public.guest_messages (guest_account_id);
CREATE INDEX IF NOT EXISTS guest_messages_created_at_idx
  ON public.guest_messages (created_at);

ALTER TABLE public.guest_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage guest_messages" ON public.guest_messages;
DROP POLICY IF EXISTS "Org members view guest_messages"    ON public.guest_messages;
DROP POLICY IF EXISTS "Thread participants insert"         ON public.guest_messages;
DROP POLICY IF EXISTS "Sender or manager update guest_messages" ON public.guest_messages;
DROP POLICY IF EXISTS "Managers delete guest_messages"     ON public.guest_messages;

CREATE POLICY "Super admins manage guest_messages"
  ON public.guest_messages
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- SELECT: org members see all messages in their org; the guest whose
-- account this is sees their own thread.
CREATE POLICY "Org members view guest_messages"
  ON public.guest_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.guest_accounts ga
      WHERE ga.id = guest_messages.guest_account_id
        AND ga.user_id = auth.uid()
    )
  );

-- INSERT: either an org member (acting as host) OR the guest whose account
-- this is.
CREATE POLICY "Thread participants insert"
  ON public.guest_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_messages.organization_id
             OR p.pending_org_id = guest_messages.organization_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.guest_accounts ga
      WHERE ga.id = guest_messages.guest_account_id
        AND ga.user_id = auth.uid()
        AND ga.organization_id = guest_messages.organization_id
    )
  );

-- UPDATE: only for marking read_at. Sender of the message OR a manager.
CREATE POLICY "Sender or manager update guest_messages"
  ON public.guest_messages
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_messages.organization_id
             OR p.pending_org_id = guest_messages.organization_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.guest_accounts ga
      WHERE ga.id = guest_messages.guest_account_id
        AND ga.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers delete guest_messages"
  ON public.guest_messages
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = guest_messages.organization_id
             OR p.pending_org_id = guest_messages.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';

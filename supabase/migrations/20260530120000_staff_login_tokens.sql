-- Reusable QR sign-in tokens for employees.
--
-- An admin/cohost issues a token for an employee from the Team screen. The RAW
-- token is encoded into a QR image and handed to the employee (printed / sent
-- over WhatsApp). Scanning opens `/qr-login#t=<token>`, and a PUBLIC Edge
-- Function (`staff-qr-login`) redeems it into a one-time Supabase auth OTP that
-- the browser exchanges for a session.
--
-- SECURITY MODEL (read before changing anything):
--   * Only the SHA-256 HASH of the token is stored here — the raw token lives
--     only inside the QR image. A database leak therefore cannot be replayed as
--     a login.
--   * The QR is a BEARER credential: anyone holding the image can sign in as
--     that employee until the token is revoked. This was an explicit product
--     choice (employees may be low-literacy; no PIN). Mitigations:
--       - tokens are issued ONLY for employee roles (cleaner / driver /
--         decorator / maintenance / staff) — enforced in BOTH Edge Functions,
--         never for admin / co_admin / cohost / super_admin;
--       - issuing a new token revokes the employee's previous active token;
--       - admins/cohosts can revoke at any time (`staff-qr-revoke`);
--       - `expires_at` is supported for optional time-boxing.
--   * RLS denies ALL direct client access. The table is touched only by the
--     `staff-qr-*` Edge Functions running with the service-role key (which
--     bypasses RLS). Clients can never read token hashes or forge rows.

CREATE TABLE IF NOT EXISTS public.staff_login_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  last_used_at    timestamptz
);

-- Lookups during issue (revoke prior actives) and login (only one active token
-- per user). Partial index keeps it small.
CREATE INDEX IF NOT EXISTS staff_login_tokens_user_active_idx
  ON public.staff_login_tokens (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.staff_login_tokens ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: every access path is an Edge Function using the
-- service-role key. With RLS enabled and no permissive policy, anon/authenticated
-- clients are denied all access to this table.

NOTIFY pgrst, 'reload schema';

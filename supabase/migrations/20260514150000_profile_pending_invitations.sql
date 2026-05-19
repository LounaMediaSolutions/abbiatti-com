-- Add pending invitation fields to profiles so super-admin can invite admins
-- to an organization, and the invited user can accept or reject before
-- actually joining. Staying within the in-scope `profiles` table (CLAUDE.md).
--
-- Lifecycle:
--   invite issued   -> pending_org_id, pending_role, invited_by set,
--                      invitation_status = 'pending'
--   accept          -> org_id := pending_org_id, role := pending_role,
--                      pending_* cleared, invitation_status := NULL
--   reject          -> pending_* cleared, invitation_status := 'rejected'
--                      (or NULL — frontend clears immediately)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_org_id uuid
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pending_role text,
  ADD COLUMN IF NOT EXISTS invited_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_status text;

CREATE INDEX IF NOT EXISTS profiles_invitation_status_idx
  ON public.profiles (invitation_status)
  WHERE invitation_status IS NOT NULL;

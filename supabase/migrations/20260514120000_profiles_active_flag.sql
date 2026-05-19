-- Ensure profiles.active exists and is indexed for super-admin ban/unban filtering.
-- The flag mirrors auth.users.banned_until so the UI can list banned users without
-- needing service-role access.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS profiles_active_idx ON public.profiles (active);

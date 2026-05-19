-- Recovery script: restore super_admin access for a user identified by email.
-- Run this in the Supabase SQL editor. Replace the email below if needed.

DO $$
DECLARE
  target_email text := 'info@louna.tv';   -- <-- change this if you log in with a different email
  target_id    uuid;
BEGIN
  -- 1. Find the auth user by email (case-insensitive).
  SELECT id INTO target_id
  FROM auth.users
  WHERE lower(email) = lower(target_email)
  LIMIT 1;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row found for email %.  Sign up first, then re-run.', target_email;
  END IF;

  -- 2. Make sure a profiles row exists and has role = 'super_admin'.
  --    Handles both column-name variants used across migrations (org_id / organization_id).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'org_id'
  ) THEN
    INSERT INTO public.profiles (id, email, role)
    VALUES (target_id, target_email, 'super_admin')
    ON CONFLICT (id) DO UPDATE
      SET role  = 'super_admin',
          email = COALESCE(public.profiles.email, EXCLUDED.email);
  ELSE
    -- Older schema: profiles has no `email` column or uses organization_id.
    INSERT INTO public.profiles (id)
    VALUES (target_id)
    ON CONFLICT (id) DO NOTHING;

    -- Add a `role` column if the deployment ever loses it (defensive).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
    ) THEN
      UPDATE public.profiles SET role = 'super_admin' WHERE id = target_id;
    END IF;
  END IF;

  -- 3. Belt-and-suspenders: also write to user_roles when the table exists,
  --    so the legacy check in isSuperAdminUser() also passes.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_roles'
  ) THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (target_id, NULL, 'super_admin')
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;
  END IF;

  RAISE NOTICE 'Super-admin restored for % (id %)', target_email, target_id;
END $$;

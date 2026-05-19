-- Recovery: rebuild public.profiles from auth.users.
--
-- Use this when the profiles table was emptied but auth.users is intact.
-- It will:
--   1. Promote info@louna.tv to super_admin (change SUPER_ADMIN_EMAIL below
--      if your account uses a different email).
--   2. Insert a profile row for every auth.users entry that doesn't already
--      have one, defaulting to role = 'cohost'. org_id stays NULL — you
--      re-attach users to organizations from /super-admin afterwards.
--
-- Safe to run multiple times. ON CONFLICT clauses make it idempotent.

DO $$
DECLARE
  super_admin_email text := 'info@louna.tv';   -- <-- change if needed
  has_org_id_col    boolean;
  inserted_count    integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'org_id'
  ) INTO has_org_id_col;

  -----------------------------------------------------------------------
  -- 1. Bulk re-create missing profiles from auth.users.
  --    Pulls full_name / phone / language from the metadata captured at
  --    signup, falling back to sensible defaults when absent.
  -----------------------------------------------------------------------
  IF has_org_id_col THEN
    -- Newer schema: profiles has email + role columns directly.
    INSERT INTO public.profiles (id, email, full_name, phone, language, role)
    SELECT
      u.id,
      u.email,
      COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''), ''),
      COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'phone'),     ''), ''),
      COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'language'),  ''), 'fr'),
      'cohost'
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RAISE NOTICE 'Created % profile row(s) from auth.users', inserted_count;
  ELSE
    -- Legacy schema: profiles has organization_id, no email/role columns of
    -- its own. Insert just the columns that exist.
    INSERT INTO public.profiles (id, full_name, phone, language)
    SELECT
      u.id,
      COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''), ''),
      COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'phone'),     ''), ''),
      COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'language'),  ''), 'fr')
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RAISE NOTICE 'Created % profile row(s) from auth.users', inserted_count;

    -- If a `role` column exists on this older schema, set defaults too.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'profiles'
        AND column_name  = 'role'
    ) THEN
      UPDATE public.profiles
      SET role = 'cohost'
      WHERE role IS NULL;
    END IF;
  END IF;

  -----------------------------------------------------------------------
  -- 2. Promote the super-admin account by email.
  -----------------------------------------------------------------------
  IF has_org_id_col THEN
    UPDATE public.profiles p
    SET   role  = 'super_admin',
          email = COALESCE(p.email, u.email)
    FROM  auth.users u
    WHERE p.id = u.id
      AND lower(u.email) = lower(super_admin_email);

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    IF inserted_count = 0 THEN
      RAISE WARNING 'No auth.users row matched %.  Super-admin not promoted.',
        super_admin_email;
    ELSE
      RAISE NOTICE 'Promoted % to super_admin.', super_admin_email;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'role'
  ) THEN
    UPDATE public.profiles p
    SET   role = 'super_admin'
    FROM  auth.users u
    WHERE p.id = u.id
      AND lower(u.email) = lower(super_admin_email);
  END IF;

  -----------------------------------------------------------------------
  -- 3. Belt-and-suspenders: also write to user_roles so the legacy
  --    is_super_admin() check passes on installations that still rely on
  --    it. No-op if the table or row already exists.
  -----------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_roles'
  ) THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    SELECT u.id, NULL, 'super_admin'
    FROM auth.users u
    WHERE lower(u.email) = lower(super_admin_email)
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;
  END IF;
END $$;

-- Quick verification — run separately and inspect the output.
-- SELECT id, email, role, org_id
-- FROM public.profiles
-- ORDER BY role NULLS LAST, email;

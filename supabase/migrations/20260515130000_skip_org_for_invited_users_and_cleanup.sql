-- 1. Stop the signup trigger from creating an org when the user is being
--    invited by a super-admin / admin (Edge Function will set
--    raw_user_meta_data.skip_org_create = 'true' in that path).
-- 2. Backfill: delete every orphan organization that has no profile, no
--    user_role and no property pointing to it. These are the "My Agency"
--    rows the buggy trigger left behind on every invite.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'org_id'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      DECLARE
        new_org_id uuid;
        org_name text;
        skip_org boolean;
      BEGIN
        skip_org := COALESCE(
          NEW.raw_user_meta_data->>'skip_org_create',
          'false'
        ) = 'true';

        IF skip_org THEN
          -- Invited user: profile will be filled in by the Edge Function.
          INSERT INTO public.profiles (id, email, full_name, phone, language)
          VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
            COALESCE(NEW.raw_user_meta_data->>'phone', ''),
            COALESCE(NEW.raw_user_meta_data->>'language', 'fr')
          )
          ON CONFLICT (id) DO NOTHING;
          RETURN NEW;
        END IF;

        org_name := COALESCE(NEW.raw_user_meta_data->>'org_name', 'My Agency');

        INSERT INTO public.organizations (name)
        VALUES (org_name)
        RETURNING id INTO new_org_id;

        INSERT INTO public.profiles (id, org_id, email, full_name, phone, language, role)
        VALUES (
          NEW.id,
          new_org_id,
          NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          COALESCE(NEW.raw_user_meta_data->>'phone', ''),
          COALESCE(NEW.raw_user_meta_data->>'language', 'fr'),
          'cohost'
        )
        ON CONFLICT (id) DO UPDATE
        SET
          org_id = EXCLUDED.org_id,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          language = EXCLUDED.language,
          role = 'cohost';

        RETURN NEW;
      END;
      $body$;
    $fn$;
  ELSE
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      DECLARE
        new_org_id uuid;
        org_name text;
        skip_org boolean;
      BEGIN
        skip_org := COALESCE(
          NEW.raw_user_meta_data->>'skip_org_create',
          'false'
        ) = 'true';

        IF skip_org THEN
          INSERT INTO public.profiles (id, full_name, phone, language)
          VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
            COALESCE(NEW.raw_user_meta_data->>'phone', ''),
            COALESCE(NEW.raw_user_meta_data->>'language', 'fr')
          )
          ON CONFLICT (id) DO NOTHING;
          RETURN NEW;
        END IF;

        org_name := COALESCE(NEW.raw_user_meta_data->>'org_name', 'My Agency');

        INSERT INTO public.organizations (name)
        VALUES (org_name)
        RETURNING id INTO new_org_id;

        INSERT INTO public.profiles (id, organization_id, full_name, phone, language)
        VALUES (
          NEW.id,
          new_org_id,
          COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          COALESCE(NEW.raw_user_meta_data->>'phone', ''),
          COALESCE(NEW.raw_user_meta_data->>'language', 'fr')
        )
        ON CONFLICT (id) DO UPDATE
        SET
          organization_id = EXCLUDED.organization_id,
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          language = EXCLUDED.language;

        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'user_roles'
        ) THEN
          INSERT INTO public.user_roles (user_id, organization_id, role)
          VALUES (NEW.id, new_org_id, 'cohost')
          ON CONFLICT (user_id, organization_id, role) DO NOTHING;
        END IF;

        RETURN NEW;
      END;
      $body$;
    $fn$;
  END IF;
END $$;

-- Cleanup: delete every org that nothing references.
-- An org is orphan iff:
--   * no profile.org_id  points at it, AND
--   * no profile.pending_org_id points at it, AND
--   * no property.org_id points at it, AND
--   * no user_roles.organization_id points at it.
WITH orphans AS (
  SELECT o.id
  FROM public.organizations o
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p   WHERE p.org_id         = o.id)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p   WHERE p.pending_org_id = o.id)
    AND NOT EXISTS (SELECT 1 FROM public.properties pr WHERE pr.org_id       = o.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.organization_id = o.id)
)
DELETE FROM public.organizations
WHERE id IN (SELECT id FROM orphans);

NOTIFY pgrst, 'reload schema';

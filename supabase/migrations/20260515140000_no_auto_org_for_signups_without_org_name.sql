-- Direct signups should only auto-create an organization when the user
-- explicitly provides an `org_name` in raw_user_meta_data. Plain user
-- signups (no org_name, no skip_org_create flag) used to silently mint a
-- "My Agency" org per user, which polluted the super-admin org list with
-- one shell org per user. From now on:
--   * skip_org_create = 'true'  -> profile only, no org   (invited users)
--   * org_name present           -> profile + new org      (legit agency signup)
--   * neither                    -> profile only, no org   (plain signup)
--
-- Followed by a cleanup that deletes existing shell orgs (no admin/co_admin
-- profile, no property). profiles.org_id has ON DELETE SET NULL on most
-- deployments, so cohost members of a deleted shell org simply lose their
-- org link and stay in the system.

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
        wants_org boolean;
      BEGIN
        skip_org := COALESCE(
          NEW.raw_user_meta_data->>'skip_org_create',
          'false'
        ) = 'true';

        org_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'org_name', '')), '');
        wants_org := NOT skip_org AND org_name IS NOT NULL;

        IF NOT wants_org THEN
          -- No org requested (invited user OR plain signup without org_name).
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
        wants_org boolean;
      BEGIN
        skip_org := COALESCE(
          NEW.raw_user_meta_data->>'skip_org_create',
          'false'
        ) = 'true';

        org_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'org_name', '')), '');
        wants_org := NOT skip_org AND org_name IS NOT NULL;

        IF NOT wants_org THEN
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

-- One-time cleanup: delete shell orgs that have no admin / co_admin in
-- profiles, no property, and no admin role in user_roles (when that table
-- exists). Run on both column-name variants (`org_id` and `organization_id`).
DO $$
DECLARE
  has_org_id boolean;
  has_organization_id boolean;
  has_user_roles boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'org_id'
  ) INTO has_org_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'organization_id'
  ) INTO has_organization_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_roles'
  ) INTO has_user_roles;

  IF has_org_id THEN
    -- Shell = org that has zero admin/co_admin profiles AND zero properties.
    DELETE FROM public.organizations o
    WHERE NOT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.org_id = o.id AND p.role IN ('admin', 'co_admin')
          )
      AND NOT EXISTS (
            SELECT 1 FROM public.properties pr WHERE pr.org_id = o.id
          )
      AND (NOT has_user_roles OR NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.organization_id = o.id AND ur.role IN ('admin', 'co_admin')
          ));
  ELSIF has_organization_id THEN
    DELETE FROM public.organizations o
    WHERE NOT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.organization_id = o.id
          )
      AND NOT EXISTS (
            SELECT 1 FROM public.properties pr WHERE pr.organization_id = o.id
          )
      AND (NOT has_user_roles OR NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.organization_id = o.id AND ur.role IN ('admin', 'co_admin')
          ));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

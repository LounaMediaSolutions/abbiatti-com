-- New agency signups should start as cohosts, never as super admins.
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
      BEGIN
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
      BEGIN
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

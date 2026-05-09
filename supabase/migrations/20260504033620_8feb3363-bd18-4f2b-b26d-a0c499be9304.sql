
-- 1. Add limit/trial columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS max_cohosts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_employees integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days');

-- Backfill existing orgs with a fresh 14-day trial
UPDATE public.organizations
SET trial_ends_at = now() + interval '14 days'
WHERE trial_ends_at IS NULL OR trial_ends_at < now() - interval '1 day';

-- 2. Helper: is org locked (suspended OR trial expired)
CREATE OR REPLACE FUNCTION public.is_org_locked(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id
      AND (suspended = true OR trial_ends_at < now())
  )
$$;

-- 3. Helper: count active roles in org
CREATE OR REPLACE FUNCTION public.count_org_role(_org_id uuid, _role app_role)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.user_roles
  WHERE organization_id = _org_id AND role = _role
$$;

-- 4. Trigger: enforce cohost/employee limits on user_roles INSERT
CREATE OR REPLACE FUNCTION public.enforce_role_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_max_cohosts int;
  org_max_employees int;
  current_count int;
BEGIN
  -- Skip checks for super_admin role or if super admin is acting
  IF NEW.role = 'super_admin' OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT max_cohosts, max_employees
    INTO org_max_cohosts, org_max_employees
  FROM public.organizations WHERE id = NEW.organization_id;

  IF NEW.role = 'cohost' THEN
    SELECT COUNT(*) INTO current_count FROM public.user_roles
    WHERE organization_id = NEW.organization_id AND role = 'cohost';
    IF current_count >= COALESCE(org_max_cohosts, 1) THEN
      RAISE EXCEPTION 'Limite atteinte: % co-host(s) max pour cette agence. Contactez le support pour augmenter.', org_max_cohosts;
    END IF;
  ELSIF NEW.role IN ('cleaner','driver','decorator','maintenance','staff') THEN
    SELECT COUNT(*) INTO current_count FROM public.user_roles
    WHERE organization_id = NEW.organization_id
      AND role IN ('cleaner','driver','decorator','maintenance','staff');
    IF current_count >= COALESCE(org_max_employees, 2) THEN
      RAISE EXCEPTION 'Limite atteinte: % employé(s) max pour cette agence. Contactez le support pour augmenter.', org_max_employees;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_role_limits ON public.user_roles;
CREATE TRIGGER trg_enforce_role_limits
BEFORE INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_role_limits();

-- 5. Generic read-only enforcement trigger (used by multiple tables)
CREATE OR REPLACE FUNCTION public.enforce_org_not_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_org uuid;
BEGIN
  -- Super admin bypasses all locks
  IF public.is_super_admin(auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_org := OLD.organization_id;
  ELSE
    target_org := NEW.organization_id;
  END IF;

  IF target_org IS NOT NULL AND public.is_org_locked(target_org) THEN
    RAISE EXCEPTION 'Agence en lecture seule (essai expiré ou suspendue). Contactez le support.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply to write-protected tables (block INSERT/UPDATE/DELETE when locked)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reservations','properties','tasks','maintenance_tickets',
    'inventory_items','inventory_movements','guest_books',
    'rental_items','reservation_rentals','message_templates',
    'cleaning_checklists','property_ical_feeds','property_members',
    'booking_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_locked ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_enforce_locked
       BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.enforce_org_not_locked()', t
    );
  END LOOP;
END $$;

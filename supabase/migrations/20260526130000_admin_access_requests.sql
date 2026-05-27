-- Admin-access request workflow.
--
-- New public signups land as role='user' (no org). They submit an
-- admin_access_requests row from their dashboard. A super-admin reviews and
-- approves (creating the org and promoting the user to 'admin' atomically)
-- or rejects.
--
-- This is the only table in the schema that doesn't fit one of the in-scope
-- tables listed in CLAUDE.md — it's a genuine new entity. Adding it rather
-- than overloading `profiles` or `organizations` with request state.

-- ─── 1. Patch handle_new_user to recognize "public signup" ────────────────
--
-- Branches, in order of precedence:
--   skip_org_create='true'   → profile only, no role     (invitations)
--   org_name provided        → org + profile (cohost)    (legacy admin signup)
--   is_public_signup='true'  → profile only, role='user' (NEW — Auth signup)
--   else                     → profile only, no role     (safe default)

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
        is_public_signup boolean;
      BEGIN
        skip_org := COALESCE(
          NEW.raw_user_meta_data->>'skip_org_create',
          'false'
        ) = 'true';

        org_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'org_name', '')), '');
        wants_org := NOT skip_org AND org_name IS NOT NULL;

        is_public_signup := COALESCE(
          NEW.raw_user_meta_data->>'is_public_signup',
          'false'
        ) = 'true';

        IF wants_org THEN
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
        END IF;

        -- No org branch. Decide whether to seed role='user' for public signups
        -- (so they land on /user) or leave role NULL for invitation acceptances.
        INSERT INTO public.profiles (id, email, full_name, phone, language, role)
        VALUES (
          NEW.id,
          NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          COALESCE(NEW.raw_user_meta_data->>'phone', ''),
          COALESCE(NEW.raw_user_meta_data->>'language', 'fr'),
          CASE WHEN is_public_signup AND NOT skip_org THEN 'user' ELSE NULL END
        )
        ON CONFLICT (id) DO NOTHING;

        RETURN NEW;
      END;
      $body$;
    $fn$;
  END IF;
END $$;

-- ─── 2. admin_access_requests table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_org_name text NOT NULL CHECK (length(trim(requested_org_name)) > 0),
  requested_org_country text,
  note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One pending request per user — re-requesting after a rejection is fine,
-- but a user cannot stack multiple in-flight pending rows.
CREATE UNIQUE INDEX IF NOT EXISTS admin_access_requests_one_pending_per_user
  ON public.admin_access_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS admin_access_requests_status_created
  ON public.admin_access_requests (status, created_at DESC);

-- Keep updated_at honest.
CREATE OR REPLACE FUNCTION public.admin_access_requests_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_access_requests_updated_at ON public.admin_access_requests;
CREATE TRIGGER trg_admin_access_requests_updated_at
  BEFORE UPDATE ON public.admin_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_access_requests_set_updated_at();

-- ─── 3. RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.admin_access_requests ENABLE ROW LEVEL SECURITY;

-- User can see their own requests.
DROP POLICY IF EXISTS "user reads own requests"
  ON public.admin_access_requests;
CREATE POLICY "user reads own requests"
  ON public.admin_access_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Super-admin can read every request.
DROP POLICY IF EXISTS "super_admin reads all requests"
  ON public.admin_access_requests;
CREATE POLICY "super_admin reads all requests"
  ON public.admin_access_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- User can create their own request (only for themselves).
DROP POLICY IF EXISTS "user inserts own request"
  ON public.admin_access_requests;
CREATE POLICY "user inserts own request"
  ON public.admin_access_requests
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
  );

-- User can edit/cancel their own pending request (cannot edit once decided).
DROP POLICY IF EXISTS "user updates own pending request"
  ON public.admin_access_requests;
CREATE POLICY "user updates own pending request"
  ON public.admin_access_requests
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Approval/rejection go through the SECURITY DEFINER functions below,
-- which bypass RLS — no separate UPDATE policy for super-admin needed.

-- ─── 4. approve / reject functions ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_admin_access_request(
  request_id uuid,
  decision_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  req record;
  new_org_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = caller_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'only super_admin can approve requests' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req
  FROM public.admin_access_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
  END IF;

  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided' USING ERRCODE = 'P0001';
  END IF;

  -- Create the org from the requested name.
  INSERT INTO public.organizations (name)
  VALUES (req.requested_org_name)
  RETURNING id INTO new_org_id;

  -- Promote the requester to admin of the new org.
  UPDATE public.profiles
  SET role = 'admin', org_id = new_org_id
  WHERE id = req.user_id;

  -- Mark the request as approved.
  UPDATE public.admin_access_requests
  SET
    status = 'approved',
    decided_by = caller_id,
    decided_at = now(),
    decision_note = approve_admin_access_request.decision_note
  WHERE id = request_id;

  RETURN new_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_admin_access_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_admin_access_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_admin_access_request(
  request_id uuid,
  decision_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  req record;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = caller_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'only super_admin can reject requests' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req
  FROM public.admin_access_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
  END IF;

  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.admin_access_requests
  SET
    status = 'rejected',
    decided_by = caller_id,
    decided_at = now(),
    decision_note = reject_admin_access_request.decision_note
  WHERE id = request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_admin_access_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_admin_access_request(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

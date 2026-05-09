
-- ========= guest_accounts =========
CREATE TABLE public.guest_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  reservation_id uuid,
  property_id uuid,
  full_name text,
  email text,
  phone text,
  language text NOT NULL DEFAULT 'fr',
  marketing_consent boolean NOT NULL DEFAULT false,
  delete_after timestamptz,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view guest accounts"
ON public.guest_accounts FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id) OR user_id = auth.uid());

CREATE POLICY "Admins/cohosts manage guest accounts"
ON public.guest_accounts FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE POLICY "Guest updates own marketing consent"
ON public.guest_accounts FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER guest_accounts_set_updated_at
BEFORE UPDATE ON public.guest_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========= guest_messages =========
CREATE TABLE public.guest_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  guest_account_id uuid NOT NULL REFERENCES public.guest_accounts(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('guest','host')),
  sender_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view guest messages"
ON public.guest_messages FOR SELECT TO authenticated
USING (
  is_org_member(auth.uid(), organization_id)
  OR EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.id = guest_account_id AND ga.user_id = auth.uid())
);

CREATE POLICY "Guest sends own messages"
ON public.guest_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_role = 'guest'
  AND sender_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.id = guest_account_id AND ga.user_id = auth.uid())
);

CREATE POLICY "Host sends messages"
ON public.guest_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_role = 'host'
  AND sender_id = auth.uid()
  AND (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
);

-- ========= guest_uploads =========
CREATE TABLE public.guest_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  guest_account_id uuid NOT NULL REFERENCES public.guest_accounts(id) ON DELETE CASCADE,
  storage_path text,
  comment text,
  rating integer,
  marketing_use_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view guest uploads"
ON public.guest_uploads FOR SELECT TO authenticated
USING (
  is_org_member(auth.uid(), organization_id)
  OR EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.id = guest_account_id AND ga.user_id = auth.uid())
);

CREATE POLICY "Guest inserts own uploads"
ON public.guest_uploads FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.id = guest_account_id AND ga.user_id = auth.uid()));

CREATE POLICY "Guest deletes own uploads"
ON public.guest_uploads FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.id = guest_account_id AND ga.user_id = auth.uid()));

CREATE POLICY "Admins/cohosts manage guest uploads"
ON public.guest_uploads FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

-- ========= partner_services =========
CREATE TABLE public.partner_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  description text,
  price text,
  contact_phone text,
  contact_email text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view partners"
ON public.partner_services FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins/cohosts manage partners"
ON public.partner_services FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE TRIGGER partner_services_set_updated_at
BEFORE UPDATE ON public.partner_services
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========= storage bucket =========
INSERT INTO storage.buckets (id, name, public) VALUES ('guest-uploads', 'guest-uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read guest uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'guest-uploads');

CREATE POLICY "Authenticated upload guest files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'guest-uploads');

CREATE POLICY "Owner deletes guest files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'guest-uploads' AND owner = auth.uid());

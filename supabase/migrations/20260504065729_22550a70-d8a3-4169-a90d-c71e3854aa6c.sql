-- Storage bucket for branded social-media albums (public for sharing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('guest-albums', 'guest-albums', true)
ON CONFLICT (id) DO NOTHING;

-- Public read on the bucket
CREATE POLICY "Guest albums publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'guest-albums');

-- Org members can manage their own albums (path prefix = organization_id)
CREATE POLICY "Org members manage their guest albums"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'guest-albums'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'guest-albums'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- Track generated albums
CREATE TABLE public.guest_albums (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  guest_account_id uuid NOT NULL,
  storage_path text NOT NULL,
  photos_count int NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  error text
);

ALTER TABLE public.guest_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view guest albums"
ON public.guest_albums FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins/cohosts manage guest albums"
ON public.guest_albums FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR public.has_role(auth.uid(), organization_id, 'cohost'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR public.has_role(auth.uid(), organization_id, 'cohost'::app_role)
);

CREATE INDEX idx_guest_albums_org ON public.guest_albums(organization_id);
CREATE INDEX idx_guest_albums_guest ON public.guest_albums(guest_account_id);
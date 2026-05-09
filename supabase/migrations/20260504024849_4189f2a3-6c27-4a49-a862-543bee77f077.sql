ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS brand_color text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read org logos" ON storage.objects;
CREATE POLICY "Public read org logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'org-logos');

DROP POLICY IF EXISTS "Org admins upload logo" ON storage.objects;
CREATE POLICY "Org admins upload logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'org-logos'
  AND has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
);

DROP POLICY IF EXISTS "Org admins update logo" ON storage.objects;
CREATE POLICY "Org admins update logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'org-logos'
  AND has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
);

DROP POLICY IF EXISTS "Org admins delete logo" ON storage.objects;
CREATE POLICY "Org admins delete logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'org-logos'
  AND has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
);

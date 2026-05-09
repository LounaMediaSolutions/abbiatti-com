INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-banners', 'partner-banners', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Banner images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'partner-banners');

CREATE POLICY "Admins/cohosts upload banner images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'partner-banners'
  AND (
    has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
    OR has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'cohost'::app_role)
  )
);

CREATE POLICY "Admins/cohosts update banner images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'partner-banners'
  AND (
    has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
    OR has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'cohost'::app_role)
  )
);

CREATE POLICY "Admins/cohosts delete banner images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'partner-banners'
  AND (
    has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
    OR has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'cohost'::app_role)
  )
);

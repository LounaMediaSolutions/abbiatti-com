DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
CREATE POLICY "Org members can view avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
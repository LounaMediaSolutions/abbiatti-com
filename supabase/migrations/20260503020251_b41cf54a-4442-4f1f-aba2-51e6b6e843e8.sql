-- Public avatars bucket for team member photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view avatars (public bucket)
CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Authenticated users in same org can upload/update/delete avatars
-- Path convention: <organization_id>/<user_id>.<ext>
CREATE POLICY "Org members can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- Allow admins/cohosts to update other members' avatar_url in their org
CREATE POLICY "Admins and cohosts update org member avatars"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'cohost'::app_role)
  )
);
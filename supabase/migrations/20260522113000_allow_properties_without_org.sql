-- Allow super-admins to detach a property from an organization without
-- deleting the property record entirely.
ALTER TABLE public.properties
  ALTER COLUMN org_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';

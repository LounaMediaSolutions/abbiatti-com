-- Add assigned_by to property_members.
--
-- The original property_members migration (20260517130000) omitted this
-- column, but Properties.tsx writes it as part of the assignment payload:
--
--   .from("property_members").insert([{
--     property_id, user_id, organization_id, role,
--     assigned_by: user.id,    -- ← this column was missing
--   }])
--
-- PostgREST surfaces that as "Could not find the 'assigned_by' column of
-- 'property_members' in the schema cache". This migration adds the column
-- as nullable so existing rows aren't affected.

ALTER TABLE public.property_members
  ADD COLUMN IF NOT EXISTS assigned_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS property_members_assigned_by_idx
  ON public.property_members (assigned_by)
  WHERE assigned_by IS NOT NULL;

NOTIFY pgrst, 'reload schema';

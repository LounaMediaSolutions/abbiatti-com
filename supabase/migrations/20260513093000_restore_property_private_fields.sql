ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS access_code text,
  ADD COLUMN IF NOT EXISTS entry_instructions text;

NOTIFY pgrst, 'reload schema';

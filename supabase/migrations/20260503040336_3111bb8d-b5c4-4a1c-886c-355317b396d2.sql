ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_properties_categories ON public.properties USING GIN (categories);
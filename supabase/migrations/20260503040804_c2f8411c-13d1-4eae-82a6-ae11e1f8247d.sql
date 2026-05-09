CREATE TYPE public.rental_category AS ENUM (
  'baby', 'beach', 'tech', 'mobility', 'outdoor', 'service', 'other'
);

CREATE TABLE public.rental_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  category public.rental_category NOT NULL DEFAULT 'other',
  price_day NUMERIC,
  price_week NUMERIC,
  price_stay NUMERIC,
  deposit NUMERIC,
  purchase_cost NUMERIC,
  priority INTEGER NOT NULL DEFAULT 3,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rental_items_org ON public.rental_items(organization_id);

ALTER TABLE public.rental_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view rental items"
  ON public.rental_items FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts manage rental items"
  ON public.rental_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE TRIGGER set_rental_items_updated_at
  BEFORE UPDATE ON public.rental_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
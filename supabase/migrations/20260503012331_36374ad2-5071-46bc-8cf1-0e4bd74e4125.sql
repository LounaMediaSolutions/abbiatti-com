-- Enum for inventory categories
CREATE TYPE public.inventory_category AS ENUM ('linen', 'cleaning', 'consumable', 'equipment', 'other');

-- Enum for movement types
CREATE TYPE public.inventory_movement_type AS ENUM ('in', 'out', 'adjustment');

-- Inventory items table
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  property_id UUID NOT NULL,
  name TEXT NOT NULL,
  category public.inventory_category NOT NULL DEFAULT 'other',
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unit',
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_items_property ON public.inventory_items(property_id);
CREATE INDEX idx_inventory_items_org ON public.inventory_items(organization_id);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view inventory items"
ON public.inventory_items FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts manage inventory items"
ON public.inventory_items FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE TRIGGER inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Movements table
CREATE TABLE public.inventory_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type public.inventory_movement_type NOT NULL,
  quantity NUMERIC NOT NULL,
  reason TEXT,
  task_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_movements_item ON public.inventory_movements(item_id);
CREATE INDEX idx_inventory_movements_org ON public.inventory_movements(organization_id);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view movements"
ON public.inventory_movements FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts insert movements"
ON public.inventory_movements FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
  AND created_by = auth.uid()
);

CREATE POLICY "Admins and cohosts delete movements"
ON public.inventory_movements FOR DELETE TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

-- Auto-apply movement to item quantity
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'in' THEN
    UPDATE public.inventory_items SET quantity = quantity + NEW.quantity WHERE id = NEW.item_id;
  ELSIF NEW.type = 'out' THEN
    UPDATE public.inventory_items SET quantity = quantity - NEW.quantity WHERE id = NEW.item_id;
  ELSIF NEW.type = 'adjustment' THEN
    UPDATE public.inventory_items SET quantity = NEW.quantity WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_movement_apply
AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();
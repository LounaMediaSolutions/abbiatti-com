
-- Pricing per organization (set by super admin)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS price_monthly_base numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_admin numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_cohost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_employee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_message numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_ical_sync numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_mb_storage numeric NOT NULL DEFAULT 0;

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  currency text NOT NULL DEFAULT 'EUR',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  pdf_url text,
  notes text,
  invoice_number text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id, period_year DESC, period_month DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;

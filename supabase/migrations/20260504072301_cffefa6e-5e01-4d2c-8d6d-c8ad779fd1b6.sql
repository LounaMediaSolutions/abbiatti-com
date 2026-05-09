-- Add subscription tracking on partner_services
ALTER TABLE public.partner_services
  ADD COLUMN IF NOT EXISTS subscription_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_until date;

-- Coupons offered by partners
CREATE TABLE public.partner_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.partner_services(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  discount_label text NOT NULL,
  terms text,
  valid_from date,
  valid_until date,
  active boolean NOT NULL DEFAULT true,
  visible_to_guest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_coupons_org ON public.partner_coupons(organization_id);
CREATE INDEX idx_partner_coupons_partner ON public.partner_coupons(partner_id);

ALTER TABLE public.partner_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/cohosts manage coupons"
ON public.partner_coupons FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

CREATE POLICY "Guests view active coupons of their org"
ON public.partner_coupons FOR SELECT TO authenticated
USING (
  active = true AND visible_to_guest = true
  AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
  AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  AND EXISTS (
    SELECT 1 FROM public.guest_accounts ga
    WHERE ga.user_id = auth.uid()
      AND ga.organization_id = partner_coupons.organization_id
      AND ga.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.partner_services ps
    WHERE ps.id = partner_coupons.partner_id
      AND ps.active = true
      AND ps.visible_to_guest = true
  )
);

CREATE TRIGGER set_partner_coupons_updated_at
BEFORE UPDATE ON public.partner_coupons
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lock_partner_coupons
BEFORE INSERT OR UPDATE OR DELETE ON public.partner_coupons
FOR EACH ROW EXECUTE FUNCTION public.enforce_org_not_locked();

-- Coupon redemptions (one per guest per coupon)
CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  coupon_id uuid NOT NULL REFERENCES public.partner_coupons(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_services(id) ON DELETE CASCADE,
  guest_account_id uuid NOT NULL REFERENCES public.guest_accounts(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','redeemed','expired')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, guest_account_id)
);

CREATE INDEX idx_coupon_redemptions_org ON public.coupon_redemptions(organization_id);
CREATE INDEX idx_coupon_redemptions_partner ON public.coupon_redemptions(partner_id);
CREATE INDEX idx_coupon_redemptions_guest ON public.coupon_redemptions(guest_account_id);
CREATE INDEX idx_coupon_redemptions_code ON public.coupon_redemptions(code);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Admins/cohosts see and manage all redemptions of their org
CREATE POLICY "Admins/cohosts manage redemptions"
ON public.coupon_redemptions FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

-- Guests view their own redemptions
CREATE POLICY "Guests view own redemptions"
ON public.coupon_redemptions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.guest_accounts ga
  WHERE ga.id = coupon_redemptions.guest_account_id AND ga.user_id = auth.uid()
));

-- Guests claim coupons for themselves
CREATE POLICY "Guests claim coupons"
ON public.coupon_redemptions FOR INSERT TO authenticated
WITH CHECK (
  status = 'claimed'
  AND redeemed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.guest_accounts ga
    WHERE ga.id = coupon_redemptions.guest_account_id
      AND ga.user_id = auth.uid()
      AND ga.organization_id = coupon_redemptions.organization_id
  )
  AND EXISTS (
    SELECT 1 FROM public.partner_coupons pc
    WHERE pc.id = coupon_redemptions.coupon_id
      AND pc.active = true
      AND pc.visible_to_guest = true
      AND (pc.valid_from IS NULL OR pc.valid_from <= CURRENT_DATE)
      AND (pc.valid_until IS NULL OR pc.valid_until >= CURRENT_DATE)
  )
);

-- Public lookup by code (for the partner scan page) — anonymous read
CREATE POLICY "Anyone can lookup redemption by code"
ON public.coupon_redemptions FOR SELECT TO anon, authenticated
USING (true);

-- Public mark-as-redeemed by code (partner scan, no login)
CREATE POLICY "Anyone can mark redemption as used"
ON public.coupon_redemptions FOR UPDATE TO anon, authenticated
USING (status = 'claimed')
WITH CHECK (status = 'redeemed' AND redeemed_at IS NOT NULL);

CREATE TRIGGER set_coupon_redemptions_updated_at
BEFORE UPDATE ON public.coupon_redemptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
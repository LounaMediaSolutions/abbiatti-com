-- Enum for banner placements
CREATE TYPE public.ad_placement AS ENUM (
  'guest_hero',
  'guest_inline',
  'public_book',
  'welcome_footer'
);

-- Table: ad_banners
CREATE TABLE public.ad_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  partner_id uuid REFERENCES public.partner_services(id) ON DELETE SET NULL,
  placement public.ad_placement NOT NULL,
  title text NOT NULL,
  subtitle text,
  image_url text,
  cta_label text,
  cta_url text,
  -- Exclusivity period: while active, this banner owns the placement
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  visible_to_guest boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_banners_org_placement ON public.ad_banners(organization_id, placement);
CREATE INDEX idx_ad_banners_dates ON public.ad_banners(start_date, end_date);

ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;

-- Admin/cohost full management
CREATE POLICY "Admins/cohosts manage banners"
ON public.ad_banners FOR ALL
TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role) OR has_role(auth.uid(), organization_id, 'cohost'::app_role));

-- Guests view active banners of their org (for guest_hero, guest_inline, welcome_footer)
CREATE POLICY "Guests view active banners of their org"
ON public.ad_banners FOR SELECT
TO authenticated
USING (
  active = true
  AND visible_to_guest = true
  AND start_date <= CURRENT_DATE
  AND end_date >= CURRENT_DATE
  AND EXISTS (
    SELECT 1 FROM public.guest_accounts ga
    WHERE ga.user_id = auth.uid()
      AND ga.organization_id = ad_banners.organization_id
      AND ga.deleted_at IS NULL
  )
);

-- Public view for public_book placement only (showcase orgs)
CREATE POLICY "Public views public_book banners"
ON public.ad_banners FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND visible_to_guest = true
  AND placement = 'public_book'
  AND start_date <= CURRENT_DATE
  AND end_date >= CURRENT_DATE
  AND organization_id IN (
    SELECT id FROM public.organizations WHERE show_on_website = true
  )
);

CREATE TRIGGER trg_ad_banners_updated_at
BEFORE UPDATE ON public.ad_banners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table: ad_impressions (impressions only — no clicks)
CREATE TABLE public.ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  banner_id uuid NOT NULL REFERENCES public.ad_banners(id) ON DELETE CASCADE,
  placement public.ad_placement NOT NULL,
  -- Optional context (anon-friendly)
  guest_account_id uuid,
  session_key text, -- a per-browser key (uuid) for dedup if needed
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_impressions_banner ON public.ad_impressions(banner_id, viewed_at DESC);
CREATE INDEX idx_ad_impressions_org_date ON public.ad_impressions(organization_id, viewed_at DESC);

ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;

-- Anyone can log an impression (public + guest pages)
CREATE POLICY "Anyone logs impressions"
ON public.ad_impressions FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ad_banners b
    WHERE b.id = ad_impressions.banner_id
      AND b.organization_id = ad_impressions.organization_id
      AND b.active = true
  )
);

-- Org members view their impressions (for stats)
CREATE POLICY "Org members view impressions"
ON public.ad_impressions FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), organization_id));

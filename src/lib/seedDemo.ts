import { supabase } from "@/integrations/supabase/client";

const DEMO_TAG = "[DEMO]";

const DEMO_PARTNERS = [
  {
    name: `${DEMO_TAG} Pizzeria Da Marco`,
    category: "Restaurant",
    description: "Pizzeria authentique au feu de bois, à 5 min de la propriété.",
    tier: "gold" as const,
    price: "À partir de 18€",
    contact_phone: "+33491234567",
    whatsapp_phone: "+33612345678",
    website_url: "https://example.com/damarco",
    coupons: [
      { title: "Menu découverte", discount_label: "-20%", description: "Sur l'addition complète", terms: "Hors boissons alcoolisées" },
      { title: "Dessert offert", discount_label: "1 dessert", description: "Pour 2 plats commandés" },
    ],
  },
  {
    name: `${DEMO_TAG} Spa Lumière`,
    category: "Bien-être",
    description: "Spa premium avec massages relaxants.",
    tier: "silver" as const,
    price: "À partir de 60€",
    contact_phone: "+33491234568",
    coupons: [
      { title: "Massage 30min", discount_label: "-15%", description: "Sur les soins en semaine" },
    ],
  },
  {
    name: `${DEMO_TAG} Excursions Méditerranée`,
    category: "Sortie en mer",
    description: "Sorties bateau aux calanques.",
    tier: "standard" as const,
    price: "À partir de 45€",
    contact_phone: "+33491234569",
    website_url: "https://example.com/excursions",
    coupons: [
      { title: "Sortie demi-journée", discount_label: "-10€", description: "Par personne", terms: "Sur réservation 24h avant" },
      { title: "Apéro coucher de soleil", discount_label: "Boisson offerte", description: "Pour la sortie de 18h" },
    ],
  },
];

const DEMO_GUESTS = [
  "Marie Dupont", "Jean Martin", "Sophie Bernard", "Pierre Leroy", "Camille Moreau",
  "Lucas Petit", "Emma Roux", "Hugo Garcia", "Léa Fournier", "Théo Rousseau",
  "Chloé Vincent", "Nathan Mercier", "Manon Blanc", "Alexandre Faure", "Julie Henry",
];

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `DEMO-${s}`;
}

function randomDateLast30Days(): Date {
  const now = Date.now();
  const past = now - Math.random() * 30 * 24 * 3600 * 1000;
  return new Date(past);
}

export type SeedOptions = {
  partnersCount?: number;       // 1..DEMO_PARTNERS.length (3)
  couponsPerPartner?: number;   // override number of coupons per partner (1..3)
  redemptionsPerCoupon?: number; // average redemptions per coupon
  redeemedRate?: number;        // 0..1 — share of claimed that become redeemed
};

export async function seedDemoData(
  orgId: string,
  userId: string,
  options: SeedOptions = {},
): Promise<{ partners: number; coupons: number; redemptions: number }> {
  const partnersTarget = Math.max(1, Math.min(options.partnersCount ?? DEMO_PARTNERS.length, DEMO_PARTNERS.length));
  const couponsPerPartner = Math.max(1, Math.min(options.couponsPerPartner ?? 0, 3)); // 0 = use default list
  const redemptionsPerCoupon = Math.max(0, options.redemptionsPerCoupon ?? 3);
  const redeemedRate = Math.max(0, Math.min(options.redeemedRate ?? 0.6, 1));

  let partnersCount = 0;
  let couponsCount = 0;
  let redemptionsCount = 0;

  // 1. Create partners + coupons
  const allCoupons: { id: string; partner_id: string }[] = [];

  const EXTRA_COUPONS = [
    { title: "Offre découverte", discount_label: "-10%", description: "Première visite" },
    { title: "Happy hour", discount_label: "-15%", description: "De 17h à 19h" },
    { title: "Pack famille", discount_label: "-25%", description: "À partir de 4 personnes" },
  ];

  for (const p of DEMO_PARTNERS.slice(0, partnersTarget)) {
    const { coupons: defaultCoupons, ...partnerData } = p;
    // If user overrides couponsPerPartner, build a list of that size by combining defaults + extras
    const couponDefs = options.couponsPerPartner
      ? [...defaultCoupons, ...EXTRA_COUPONS].slice(0, couponsPerPartner)
      : defaultCoupons;

    // Check if already exists
    const { data: existing } = await supabase
      .from("partner_services")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", partnerData.name)
      .maybeSingle();

    let partnerId: string;
    if (existing) {
      partnerId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("partner_services")
        .insert({
          organization_id: orgId,
          ...partnerData,
          active: true,
          visible_to_guest: true,
          subscription_active: true,
          subscription_until: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw new Error(`Partenaire "${partnerData.name}": ${error.message}`);
      partnerId = created.id;
      partnersCount++;
    }

    for (const cd of couponDefs) {
      const { data: existingC } = await supabase
        .from("partner_coupons")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("title", cd.title)
        .maybeSingle();

      let couponId: string;
      if (existingC) {
        couponId = existingC.id;
      } else {
        const { data: createdC, error } = await supabase
          .from("partner_coupons")
          .insert({
            organization_id: orgId,
            partner_id: partnerId,
            title: cd.title,
            description: cd.description,
            discount_label: cd.discount_label,
            terms: (cd as any).terms ?? null,
            valid_until: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10),
            active: true,
            visible_to_guest: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Coupon "${cd.title}": ${error.message}`);
        couponId = createdC.id;
        couponsCount++;
      }
      allCoupons.push({ id: couponId, partner_id: partnerId });
    }
  }

  // 2. Create demo guest_accounts (all linked to current admin's user_id to satisfy RLS)
  // We need many distinct guest_accounts so we can have many redemptions per coupon
  const guestAccountIds: string[] = [];
  for (const fullName of DEMO_GUESTS) {
    const demoFullName = `${DEMO_TAG} ${fullName}`;
    const { data: existingG } = await supabase
      .from("guest_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("full_name", demoFullName)
      .maybeSingle();

    if (existingG) {
      guestAccountIds.push(existingG.id);
    } else {
      const { data: createdG, error } = await supabase
        .from("guest_accounts")
        .insert({
          organization_id: orgId,
          user_id: userId, // demo: all linked to current admin
          full_name: demoFullName,
          email: `demo+${fullName.toLowerCase().replace(/\s/g, ".")}@example.com`,
          language: "fr",
          marketing_consent: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Guest "${fullName}": ${error.message}`);
      guestAccountIds.push(createdG.id);
    }
  }

  // 3. Generate redemptions: ~3 per coupon, 60% redeemed, spread over 30d
  const newRedemptions: Array<{
    id?: string;
    organization_id: string;
    coupon_id: string;
    partner_id: string;
    guest_account_id: string;
    code: string;
    status: "claimed" | "redeemed";
    claimed_at: string;
    redeemed_at: string | null;
  }> = [];

  for (const coupon of allCoupons) {
    // Configurable target ±1 around the average
    const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
    const count = Math.max(0, redemptionsPerCoupon + jitter);
    const usedGuests = new Set<string>();
    for (let i = 0; i < count; i++) {
      // Pick a guest not yet used for this coupon (UNIQUE coupon_id + guest_account_id)
      const available = guestAccountIds.filter((g) => !usedGuests.has(g));
      if (available.length === 0) break;
      const guestId = available[Math.floor(Math.random() * available.length)];
      usedGuests.add(guestId);

      const claimedAt = randomDateLast30Days();
      const willRedeem = Math.random() < redeemedRate;
      const redeemedAt = willRedeem
        ? new Date(claimedAt.getTime() + Math.random() * 6 * 3600 * 1000) // within 6h
        : null;

      newRedemptions.push({
        organization_id: orgId,
        coupon_id: coupon.id,
        partner_id: coupon.partner_id,
        guest_account_id: guestId,
        code: randomCode(),
        status: willRedeem ? "redeemed" : "claimed",
        claimed_at: claimedAt.toISOString(),
        redeemed_at: redeemedAt ? redeemedAt.toISOString() : null,
      });
    }
  }

  // Insert in batches; some may conflict if user re-runs — use upsert ignore via individual inserts
  for (const r of newRedemptions) {
    const { error } = await supabase.from("coupon_redemptions").insert(r);
    if (!error) {
      redemptionsCount++;
    }
    // Silent skip on duplicates (UNIQUE constraint)
  }

  return { partners: partnersCount, coupons: couponsCount, redemptions: redemptionsCount };
}

export async function clearDemoData(orgId: string): Promise<{ partners: number; guests: number }> {
  // Find demo partners
  const { data: demoPartners } = await supabase
    .from("partner_services")
    .select("id")
    .eq("organization_id", orgId)
    .like("name", `${DEMO_TAG}%`);

  const partnerIds = (demoPartners ?? []).map((p: any) => p.id);
  if (partnerIds.length > 0) {
    // Cascade will handle coupons + redemptions
    await supabase.from("partner_services").delete().in("id", partnerIds);
  }

  // Delete demo guest accounts
  const { data: demoGuests } = await supabase
    .from("guest_accounts")
    .select("id")
    .eq("organization_id", orgId)
    .like("full_name", `${DEMO_TAG}%`);

  const guestIds = (demoGuests ?? []).map((g: any) => g.id);
  if (guestIds.length > 0) {
    await supabase.from("guest_accounts").delete().in("id", guestIds);
  }

  return { partners: partnerIds.length, guests: guestIds.length };
}

/**
 * Country + state catalogue used by the profile-listing filter dropdowns and
 * the per-profile location pickers. Stored on `profiles.country` (ISO 3166-1
 * alpha-2) and `profiles.state` (ISO 3166-2). Display labels are bilingual
 * (English / French) so we don't ship a separate translation table for the
 * 60-ish region names.
 *
 * Add a new country by appending to COUNTRIES and STATES_BY_COUNTRY — the
 * filter UI picks it up automatically.
 */
export type CountryCode = "DZ" | "AE";

export type Country = {
  code: CountryCode;
  labelEn: string;
  labelFr: string;
};

export type State = {
  /** ISO 3166-2 code, e.g. "DZ-16", "AE-DU". */
  code: string;
  /** Display name (English; matches the local exonym where it differs). */
  name: string;
};

export const COUNTRIES: readonly Country[] = [
  { code: "DZ", labelEn: "Algeria", labelFr: "Algérie" },
  { code: "AE", labelEn: "United Arab Emirates", labelFr: "Émirats arabes unis" },
] as const;

// Algeria — 58 wilayas (ISO 3166-2:DZ).
const DZ_WILAYAS: readonly State[] = [
  { code: "DZ-01", name: "Adrar" },
  { code: "DZ-02", name: "Chlef" },
  { code: "DZ-03", name: "Laghouat" },
  { code: "DZ-04", name: "Oum El Bouaghi" },
  { code: "DZ-05", name: "Batna" },
  { code: "DZ-06", name: "Béjaïa" },
  { code: "DZ-07", name: "Biskra" },
  { code: "DZ-08", name: "Béchar" },
  { code: "DZ-09", name: "Blida" },
  { code: "DZ-10", name: "Bouira" },
  { code: "DZ-11", name: "Tamanrasset" },
  { code: "DZ-12", name: "Tébessa" },
  { code: "DZ-13", name: "Tlemcen" },
  { code: "DZ-14", name: "Tiaret" },
  { code: "DZ-15", name: "Tizi Ouzou" },
  { code: "DZ-16", name: "Alger" },
  { code: "DZ-17", name: "Djelfa" },
  { code: "DZ-18", name: "Jijel" },
  { code: "DZ-19", name: "Sétif" },
  { code: "DZ-20", name: "Saïda" },
  { code: "DZ-21", name: "Skikda" },
  { code: "DZ-22", name: "Sidi Bel Abbès" },
  { code: "DZ-23", name: "Annaba" },
  { code: "DZ-24", name: "Guelma" },
  { code: "DZ-25", name: "Constantine" },
  { code: "DZ-26", name: "Médéa" },
  { code: "DZ-27", name: "Mostaganem" },
  { code: "DZ-28", name: "M'Sila" },
  { code: "DZ-29", name: "Mascara" },
  { code: "DZ-30", name: "Ouargla" },
  { code: "DZ-31", name: "Oran" },
  { code: "DZ-32", name: "El Bayadh" },
  { code: "DZ-33", name: "Illizi" },
  { code: "DZ-34", name: "Bordj Bou Arréridj" },
  { code: "DZ-35", name: "Boumerdès" },
  { code: "DZ-36", name: "El Tarf" },
  { code: "DZ-37", name: "Tindouf" },
  { code: "DZ-38", name: "Tissemsilt" },
  { code: "DZ-39", name: "El Oued" },
  { code: "DZ-40", name: "Khenchela" },
  { code: "DZ-41", name: "Souk Ahras" },
  { code: "DZ-42", name: "Tipaza" },
  { code: "DZ-43", name: "Mila" },
  { code: "DZ-44", name: "Aïn Defla" },
  { code: "DZ-45", name: "Naâma" },
  { code: "DZ-46", name: "Aïn Témouchent" },
  { code: "DZ-47", name: "Ghardaïa" },
  { code: "DZ-48", name: "Relizane" },
  { code: "DZ-49", name: "Timimoun" },
  { code: "DZ-50", name: "Bordj Badji Mokhtar" },
  { code: "DZ-51", name: "Ouled Djellal" },
  { code: "DZ-52", name: "Béni Abbès" },
  { code: "DZ-53", name: "In Salah" },
  { code: "DZ-54", name: "In Guezzam" },
  { code: "DZ-55", name: "Touggourt" },
  { code: "DZ-56", name: "Djanet" },
  { code: "DZ-57", name: "El M'Ghair" },
  { code: "DZ-58", name: "El Meniaa" },
] as const;

// United Arab Emirates — 7 emirates (ISO 3166-2:AE).
const AE_EMIRATES: readonly State[] = [
  { code: "AE-AZ", name: "Abu Dhabi" },
  { code: "AE-DU", name: "Dubai" },
  { code: "AE-SH", name: "Sharjah" },
  { code: "AE-AJ", name: "Ajman" },
  { code: "AE-UQ", name: "Umm Al Quwain" },
  { code: "AE-RK", name: "Ras Al Khaimah" },
  { code: "AE-FU", name: "Fujairah" },
] as const;

export const STATES_BY_COUNTRY: Record<CountryCode, readonly State[]> = {
  DZ: DZ_WILAYAS,
  AE: AE_EMIRATES,
};

// ─── Helpers ────────────────────────────────────────────────────────────

/** Returns the display label for a country code in the current language. */
export const getCountryLabel = (
  code: string | null | undefined,
  language: string,
): string | null => {
  if (!code) return null;
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) return code;
  return language?.toLowerCase().startsWith("fr") ? country.labelFr : country.labelEn;
};

/** Returns the display name for a state code regardless of country. */
export const getStateName = (code: string | null | undefined): string | null => {
  if (!code) return null;
  for (const states of Object.values(STATES_BY_COUNTRY)) {
    const match = states.find((s) => s.code === code);
    if (match) return match.name;
  }
  return code;
};

/** Returns the states for a given country code, or an empty array. */
export const getStatesForCountry = (
  code: string | null | undefined,
): readonly State[] => {
  if (!code) return [];
  return STATES_BY_COUNTRY[code as CountryCode] ?? [];
};

/** True if the given state code belongs to the given country. */
export const isStateInCountry = (
  stateCode: string | null | undefined,
  countryCode: string | null | undefined,
): boolean => {
  if (!stateCode || !countryCode) return false;
  return getStatesForCountry(countryCode).some((s) => s.code === stateCode);
};

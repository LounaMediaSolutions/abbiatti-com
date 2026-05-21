// Brand colors are consumed by Tailwind/shadcn as HSL *channels* — e.g.
// "205 55% 28%" — because the design tokens are defined as `hsl(var(--primary))`.
// Historically two screens saved `organizations.brand_color` differently:
// Settings stored HSL channels, while the super-admin screens stored a hex
// string (e.g. "#1e40af"). When a hex value was injected into `--primary`,
// `hsl(#1e40af)` is invalid CSS, the background was dropped, and primary
// buttons rendered white. These helpers normalize either format to HSL
// channels so the value is always safe to drop into `--primary`.

/** Convert a "#rrggbb" hex string to HSL channels ("H S% L%"). */
export function hexToHslChannels(hex: string): string | null {
  const m = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** True when the string already looks like HSL channels ("H S% L%"). */
export function isHslChannels(value: string): boolean {
  return /^\s*\d{1,3}\s+\d{1,3}%\s+\d{1,3}%\s*$/.test(value);
}

/**
 * Normalize any stored brand color (hex OR HSL channels) into HSL channels
 * suitable for `--primary`. Returns null when the value can't be parsed, so
 * callers can fall back to the default theme color.
 */
export function toHslChannels(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (isHslChannels(v)) return v;
  if (v.startsWith("#") || /^[0-9a-fA-F]{6}$/.test(v)) return hexToHslChannels(v);
  return null;
}

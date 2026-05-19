// Default origin used for transactional email links (password reset,
// signup verification, etc.) when we cannot derive a safe origin from
// the current browser context — e.g. during server-side rendering or
// when the app is opened on http://localhost during development.
const FALLBACK_APP_ORIGIN = "https://escapar.net";

const normalizeOrigin = (value: string) => value.replace(/\/+$/u, "");

/**
 * Returns true when the origin is a real, public-facing host that is
 * safe to put into an outgoing email. We reject localhost, loopback,
 * private LAN addresses, and the *.local mDNS suffix so that a dev
 * machine never sends users a link they can't open.
 */
const isPublicOrigin = (origin: string): boolean => {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (hostname === "localhost") return false;
    if (hostname.endsWith(".local")) return false;
    if (hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") return false;
    // RFC1918 private ranges
    if (/^10\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
};

export const getAppOrigin = (): string => {
  // Explicit override always wins (useful for staging/preview envs
  // where window.location.origin would be e.g. a vercel.app URL but
  // you want emails to point somewhere else).
  const envOrigin =
    typeof import.meta !== "undefined"
      ? (import.meta as any).env?.VITE_APP_URL
      : undefined;
  if (typeof envOrigin === "string" && envOrigin.trim()) {
    return normalizeOrigin(envOrigin.trim());
  }

  // Use the current browser origin so a user signing up on
  // abbiatti.com gets an abbiatti.com link, and a user on
  // escapar.net gets an escapar.net link — but only when it's
  // a real public host, never localhost or a LAN address.
  if (typeof window !== "undefined" && window.location?.origin) {
    const currentOrigin = normalizeOrigin(window.location.origin);
    if (isPublicOrigin(currentOrigin)) {
      return currentOrigin;
    }
  }

  return FALLBACK_APP_ORIGIN;
};

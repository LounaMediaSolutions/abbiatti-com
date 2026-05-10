const FALLBACK_APP_ORIGIN = "https://abbiatti-com.vercel.app";

const normalizeOrigin = (value: string) => value.replace(/\/+$/u, "");

export const getAppOrigin = (): string => {
  const envOrigin =
    typeof import.meta !== "undefined"
      ? (import.meta as any).env?.VITE_APP_URL
      : undefined;
  if (typeof envOrigin === "string" && envOrigin.trim()) {
    return normalizeOrigin(envOrigin.trim());
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeOrigin(window.location.origin);
  }

  return FALLBACK_APP_ORIGIN;
};

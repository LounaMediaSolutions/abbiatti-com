/**
 * Creates a namespaced debug logger that's silent by default.
 *
 * Why this exists: shipping `console.log` calls that print user IDs, emails,
 * and session details to every visitor's DevTools is a passive privacy leak
 * and clutters the console for everyone else. Gate verbose logs behind this
 * helper so they only fire when a developer explicitly opts in.
 *
 * Enable in the browser:
 *   localStorage.setItem("debug:<namespace>", "1")
 * Disable:
 *   localStorage.removeItem("debug:<namespace>")
 *
 * Also enabled when the matching `VITE_DEBUG_<NAMESPACE>` env var is "true".
 * Non-alphanumeric characters in `namespace` are normalised to `_` for the
 * env-var lookup (e.g. namespace="auth-redirect" → VITE_DEBUG_AUTH_REDIRECT).
 *
 * Real errors should still go through `console.error` unconditionally — this
 * helper is only for the noisy "what's happening right now" trail.
 */
export const createDebugLogger = (namespace: string) => {
  const lsKey = `debug:${namespace}`;
  const envKey = `VITE_DEBUG_${namespace.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

  const isEnabled = (): boolean => {
    try {
      if (
        typeof import.meta !== "undefined" &&
        (import.meta as any).env?.[envKey] === "true"
      ) {
        return true;
      }
    } catch {
      /* import.meta unavailable (SSR, tests) — fall through */
    }
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(lsKey) === "1";
    } catch {
      return false;
    }
  };

  return (event: string, details?: Record<string, unknown>) => {
    if (!isEnabled()) return;
    try {
      // eslint-disable-next-line no-console
      console.debug(`[${namespace}] ${event}`, details ?? {});
    } catch {
      /* console unavailable — silently drop */
    }
  };
};

const AUTH_ENTRY_PATHS = new Set(["/welcome", "/auth", "/staff-login", "/reset-password"]);

const STORAGE_KEY = "postLoginRedirect";
const STORAGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEBUG_FLAG_KEY = "debug:authRedirect";

/**
 * Optional debug logging. Enable in the browser console with:
 *   localStorage.setItem("debug:authRedirect", "1")
 * Disable with:
 *   localStorage.removeItem("debug:authRedirect")
 * Also enabled automatically when import.meta.env.VITE_DEBUG_AUTH_REDIRECT === "true".
 */
const isDebugEnabled = (): boolean => {
  try {
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_DEBUG_AUTH_REDIRECT === "true") {
      return true;
    }
  } catch {}
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEBUG_FLAG_KEY) === "1";
  } catch {
    return false;
  }
};

const debugLog = (event: string, details?: Record<string, unknown>) => {
  if (!isDebugEnabled()) return;
  try {
     
    console.debug(`[authRedirect] ${event}`, {
      ...details,
      href: typeof window !== "undefined" ? window.location.href : undefined,
      ts: new Date().toISOString(),
    });
  } catch {}
};

export const normalizeRedirectPath = (value: string | null | undefined) => {
  if (!value) return null;

  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith("/") || trimmedValue.startsWith("//")) return null;

  try {
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(trimmedValue, baseOrigin);
    const normalizedPath = `${url.pathname}${url.search}${url.hash}`;

    if (typeof window !== "undefined" && url.origin !== window.location.origin) return null;
    if (AUTH_ENTRY_PATHS.has(url.pathname)) return null;

    return normalizedPath;
  } catch {
    return null;
  }
};

const getSameOriginReferrerPath = () => {
  if (typeof document === "undefined" || typeof window === "undefined" || !document.referrer) {
    return null;
  }

  try {
    const referrerUrl = new URL(document.referrer);
    if (referrerUrl.origin !== window.location.origin) return null;

    return normalizeRedirectPath(`${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`);
  } catch {
    return null;
  }
};

// ---- Stored redirect helpers (TTL-protected, atomic consume) ----

const safeStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const setPostLoginRedirect = (path: string | null | undefined) => {
  const storage = safeStorage();
  if (!storage) return;
  const normalized = normalizeRedirectPath(path);
  if (!normalized) {
    debugLog("setPostLoginRedirect:rejected", { input: path });
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ path: normalized, ts: Date.now() }));
    debugLog("setPostLoginRedirect:stored", { path: normalized });
  } catch (error) {
    debugLog("setPostLoginRedirect:error", { error: String(error) });
  }
};

export const clearPostLoginRedirect = () => {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const had = storage.getItem(STORAGE_KEY) !== null;
    storage.removeItem(STORAGE_KEY);
    if (had) debugLog("clearPostLoginRedirect");
  } catch {}
};

export const peekPostLoginRedirect = (): string | null => {
  const storage = safeStorage();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  // Backward-compat: legacy plain-string entries.
  if (!raw.startsWith("{")) {
    const normalized = normalizeRedirectPath(raw);
    if (!normalized) {
      debugLog("peek:legacy-invalid", { raw });
      clearPostLoginRedirect();
      return null;
    }
    debugLog("peek:legacy-ok", { path: normalized });
    return normalized;
  }

  try {
    const parsed = JSON.parse(raw) as { path?: string; ts?: number };
    if (!parsed?.path || typeof parsed.ts !== "number") {
      debugLog("peek:malformed", { raw });
      clearPostLoginRedirect();
      return null;
    }
    if (Date.now() - parsed.ts > STORAGE_TTL_MS) {
      debugLog("peek:expired", { path: parsed.path, ageMs: Date.now() - parsed.ts });
      clearPostLoginRedirect();
      return null;
    }
    const normalized = normalizeRedirectPath(parsed.path);
    if (!normalized) {
      debugLog("peek:invalid-path", { path: parsed.path });
      clearPostLoginRedirect();
      return null;
    }
    debugLog("peek:ok", { path: normalized, ageMs: Date.now() - parsed.ts });
    return normalized;
  } catch (error) {
    debugLog("peek:parse-error", { error: String(error), raw });
    clearPostLoginRedirect();
    return null;
  }
};

/** Read and immediately remove the stored redirect. Use right before navigating. */
export const consumePostLoginRedirect = (): string | null => {
  const value = peekPostLoginRedirect();
  clearPostLoginRedirect();
  debugLog("consume", { value });
  return value;
};

export const resolvePostLoginRedirect = (...candidates: Array<string | null | undefined>) => {
  for (let i = 0; i < candidates.length; i++) {
    const normalizedCandidate = normalizeRedirectPath(candidates[i]);
    if (normalizedCandidate) {
      debugLog("resolve:matched", { index: i, raw: candidates[i], path: normalizedCandidate });
      return normalizedCandidate;
    }
  }

  const fromReferrer = getSameOriginReferrerPath();
  if (fromReferrer) {
    debugLog("resolve:referrer", { path: fromReferrer });
    return fromReferrer;
  }

  debugLog("resolve:fallback-root", { candidates });
  return "/";
};

export const buildRedirectQueryPath = (pathname: string, redirectTarget: string | null | undefined) => {
  const normalizedRedirect = normalizeRedirectPath(redirectTarget);
  if (!normalizedRedirect) return pathname;

  const url = new URL(pathname, "http://localhost");
  url.searchParams.set("redirect", normalizedRedirect);

  return `${url.pathname}${url.search}${url.hash}`;
};

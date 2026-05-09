// Reliably detect 401/403 authorization failures across the various error
// shapes returned by `supabase.functions.invoke`, fetch, PostgREST, and edge
// functions themselves (which may return a JSON `{ error }` body with status 200).
//
// We inspect, in order:
//  1. HTTP status (FunctionsHttpError exposes `context.response.status`,
//     fetch Response has `status`, PostgREST errors expose `status`/`code`).
//  2. PostgREST/Postgres SQLSTATE codes for insufficient privilege / RLS.
//  3. Free-text matching on `error.message` and `data.error` strings, in
//     several common languages.
//
// We try to read the response body when present (FunctionsHttpError does NOT
// put the body on `data`; the body lives on `error.context.response`), so we
// can match server-side messages like `{"error":"Forbidden"}`.

// Keyword sets used to recognise authorization failures inside free-text
// error messages. We split them into:
//   - STRONG_KEYWORDS: substrings unambiguous enough to match anywhere
//     (e.g. "unauthorized" — not a normal English word in API errors).
//   - WORD_KEYWORDS: phrases or words that must match on a word boundary
//     to avoid false positives (e.g. "jwt" inside "ajwtoken", or the
//     French "interdit" inside an unrelated word).
//
// Add new variants here; keep them lower-case.

const STRONG_KEYWORDS = [
  // English
  "unauthorized",
  "unauthenticated",
  "authentication required",
  "authorization required",
  "permission denied",
  "access denied",
  "missing authorization",
  "invalid authorization",
  "invalid token",
  "expired token",
  "invalid jwt",
  "jwt expired",
  "insufficient privilege",
  "insufficient permission",
  "insufficient scope",
  "row-level security",
  "rls policy",
  "not authorized",
  // French
  "non autoris",          // non autorisé / non autorisée / non autorisés
  "pas autoris",          // pas autorisé
  "accès refus",          // accès refusé
  "acces refus",
  "accès interdit",
  "acces interdit",
  "authentification requise",
  "autorisation requise",
  "permission refus",     // permission refusée
  "jeton invalide",
  "jeton expiré",
  "droits insuffisants",
  // Spanish
  "no autorizado",
  "no autenticado",
  "acceso denegado",
  "permiso denegado",
  "se requiere autenticación",
  "token inválido",
  "token expirado",
  // German
  "nicht autorisiert",
  "nicht authentifiziert",
  "zugriff verweigert",
  "anmeldung erforderlich",
  // Portuguese
  "não autorizado",
  "nao autorizado",
  "acesso negado",
  // Italian
  "non autorizzato",
  "accesso negato",
  // Arabic
  "غير مصرح",
  "غير مخول",
  "ممنوع الوصول",
  "يتطلب المصادقة",
];

// Words that must hit a boundary (\b on either side, or punctuation in
// non-Latin scripts). Listed without surrounding spaces.
const WORD_KEYWORDS = [
  "forbidden",
  "unauthorized",       // also covered by STRONG, but boundary-safe
  "denied",
  "jwt",
  "401",
  "403",
  "interdit",           // FR
  "interdite",
  "refusé",
  "refuse",
  "refusée",
  "prohibido",          // ES
  "prohibida",
  "verboten",           // DE
  "proibido",           // PT
  "vietato",            // IT
  "ممنوع",              // AR
];

const AUTHZ_PG_CODES = new Set([
  "42501",     // insufficient_privilege
  "PGRST301",  // PostgREST: JWT expired
  "PGRST302",  // PostgREST: anonymous role disabled
  "401",
  "403",
]);

// ---- Regex pre-compilation -----------------------------------------------
// All regexes below are built ONCE at module load. They have no `/g` flag, so
// `lastIndex` state cannot leak between calls. Both use simple alternation,
// which V8 / JSC compile to a Boyer-Moore-like multi-string DFA — O(n) over
// the input length, regardless of keyword count.

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One alternation regex for the substring (STRONG) keywords. Replacing the
// per-call `for ... includes()` loop with a single regex keeps the scan to
// one linear pass over the input no matter how many keywords we add.
const STRONG_REGEX = new RegExp(
  `(?:${STRONG_KEYWORDS.map(escapeRe).join("|")})`,
  "i",
);

// Boundary-sensitive regex for short, ambiguous tokens. `\p{L}\p{N}` boundary
// works across scripts (Latin, Cyrillic, Arabic…). No `/g` flag → stateless.
const WORD_REGEX = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${WORD_KEYWORDS.map(escapeRe).join(
    "|",
  )})(?![\\p{L}\\p{N}])`,
  "iu",
);

// ---- Tunable scan limits --------------------------------------------------
// Both limits are configurable at build time via Vite env vars (read once,
// at module load — never per call) so heavy API consumers can opt into a
// larger scan window without recompiling the library.
//
//   VITE_AUTHZ_MAX_SCAN_LEN
//     Hard cap on how many characters of an error message we ever inspect.
//     Default 4096. Real auth-error messages are <1 KB; bigger payloads are
//     usually stack traces / HTML and yield no extra signal.
//
//   VITE_AUTHZ_PREFILTER_SCAN_LEN
//     Cap applied *before* the cheap prefilter regex. Defaults to the same
//     value as MAX_SCAN_LEN. Lowering it (e.g. 1024) makes the prefilter
//     even faster on huge payloads, at the cost of missing keywords that
//     appear deep inside the message.
//
//   Runtime override: callers can also import `setAuthzScanLimits()` to
//   reconfigure at runtime (useful for tests or feature flags).
//
// Both values are clamped to [64, 1_000_000] to defeat misconfiguration.

const SCAN_MIN = 64;
const SCAN_MAX = 1_000_000;
const SCAN_DEFAULT = 4096;

function clampScan(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(SCAN_MIN, Math.min(SCAN_MAX, Math.floor(n)));
}

function readEnvInt(key: string): number | null {
  // Support Vite (import.meta.env), Node/Bun (process.env), and Deno.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = (import.meta as any) ?? {};
    const v = meta?.env?.[key];
    if (v != null) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc: any = (globalThis as any).process;
    const v = proc?.env?.[key];
    if (v != null) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

let MAX_SCAN_LEN = clampScan(
  readEnvInt("VITE_AUTHZ_MAX_SCAN_LEN") ?? SCAN_DEFAULT,
  SCAN_DEFAULT,
);
let PREFILTER_SCAN_LEN = clampScan(
  readEnvInt("VITE_AUTHZ_PREFILTER_SCAN_LEN") ?? MAX_SCAN_LEN,
  MAX_SCAN_LEN,
);

/**
 * Override scan limits at runtime. Pass `null`/`undefined` to leave a value
 * untouched. Both are clamped to [64, 1_000_000].
 */
export function setAuthzScanLimits(opts: {
  maxScanLen?: number | null;
  prefilterScanLen?: number | null;
}): { maxScanLen: number; prefilterScanLen: number } {
  let changed = false;
  if (opts.maxScanLen != null) {
    const next = clampScan(opts.maxScanLen, MAX_SCAN_LEN);
    if (next !== MAX_SCAN_LEN) {
      MAX_SCAN_LEN = next;
      changed = true;
    }
  }
  if (opts.prefilterScanLen != null) {
    const next = clampScan(opts.prefilterScanLen, PREFILTER_SCAN_LEN);
    if (next !== PREFILTER_SCAN_LEN) {
      PREFILTER_SCAN_LEN = next;
      changed = true;
    }
  }
  // Limits affect what we hash/scan — invalidate the memo cache when they
  // actually change to avoid returning stale results.
  if (changed) resultCache.clear();
  return { maxScanLen: MAX_SCAN_LEN, prefilterScanLen: PREFILTER_SCAN_LEN };
}

/** Inspect current effective limits (mainly for tests/diagnostics). */
export function getAuthzScanLimits() {
  return { maxScanLen: MAX_SCAN_LEN, prefilterScanLen: PREFILTER_SCAN_LEN };
}

// ---- Cheap prefilter ------------------------------------------------------
// Before running the full STRONG/WORD regexes (which carry Unicode property
// escapes and lookbehinds) we run a *much* simpler discriminator regex.
//
// CONTRACT: this prefilter MUST have no false negatives — if any STRONG or
// WORD keyword would match, at least one PREFILTER fragment must also match.
// False positives are fine (they just fall through to the full regex).
const PREFILTER_REGEX =
  /auth|token|jwt|perm|deni|autori|autenti|authent|interd|refus|forbid|prohib|insuff|rls|row-|secur|scope|jeton|zugriff|verweig|anmeld|verbot|proib|vieta|neg|droit|acces|401|403|[\u0600-\u06ff]/i;

// ---- Result memoisation ---------------------------------------------------
// In real apps the same error message is often inspected several times in
// rapid succession (one toast → one redirect → one logging call). Hashing the
// scanned slice and caching the boolean result makes repeated calls O(1) for
// the hash + an LRU lookup, instead of two regex passes.
//
// Notes:
//  - We hash the *scanned slice* (after the MAX_SCAN_LEN cap), not the raw
//    input — different long inputs that share the same prefix collapse, which
//    is exactly what we want.
//  - We use FNV-1a 32-bit; collisions are possible but harmless: the worst
//    case is a stale `false` for a previously-seen string, which we accept
//    given the speed gain. To make collisions essentially irrelevant we also
//    key on the slice length.
//  - The cache is bounded (Map insertion order = LRU). When it overflows we
//    evict the oldest 1/4 of entries in one shot to amortise cost.

const CACHE_MAX = 256;
const CACHE_EVICT = 64;
const resultCache = new Map<string, boolean>();

// Two independent 32-bit hashes computed in the same single pass over the
// string. Combined with the byte length they form a 96-bit composite key,
// which makes accidental collisions vanishingly unlikely (≈ 1 in 2^64 for
// inputs of equal length) while keeping the cache key short (≤ 16 chars).
//
//  - h1: FNV-1a 32-bit  (prime 0x01000193, offset 0x811c9dc5)
//  - h2: DJB2 xor 32-bit (multiplier 33, xor on each byte)
//
// Using two algorithmically different hashes (different mixing function +
// different constants) means a collision on h1 is uncorrelated with a
// collision on h2, so the joint collision probability is the product.
function dualHash32(s: string): { h1: number; h2: number } {
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    // DJB2-xor: h = ((h << 5) + h) ^ c  ≡  h * 33 ^ c
    h2 = (Math.imul(h2, 33) ^ c) | 0;
  }
  return { h1: h1 >>> 0, h2: h2 >>> 0 };
}

function cacheGet(key: string): boolean | undefined {
  const v = resultCache.get(key);
  if (v === undefined) return undefined;
  // Touch entry to mark as most-recently used.
  resultCache.delete(key);
  resultCache.set(key, v);
  return v;
}

function cacheSet(key: string, value: boolean): void {
  if (resultCache.size >= CACHE_MAX) {
    // Drop the oldest CACHE_EVICT entries in one pass.
    const it = resultCache.keys();
    for (let i = 0; i < CACHE_EVICT; i++) {
      const k = it.next();
      if (k.done) break;
      resultCache.delete(k.value);
    }
  }
  resultCache.set(key, value);
}

/** Clear the memoisation cache (mainly for tests). */
export function clearAuthzCache(): void {
  resultCache.clear();
}

function matchesKeyword(text: unknown): boolean {
  if (text == null) return false;
  // Fast path: avoid String() allocation when already a string.
  let s: string;
  if (typeof text === "string") {
    s = text;
  } else if (typeof text === "number" || typeof text === "boolean") {
    s = String(text);
  } else {
    // Objects, arrays, etc. — skip; structured fields are inspected elsewhere.
    return false;
  }
  if (!s) return false;

  // Slice once, up-front — this is what we hash and what every regex sees.
  const fullSlice = s.length > MAX_SCAN_LEN ? s.slice(0, MAX_SCAN_LEN) : s;

  // Cache lookup: skip hashing for very short inputs (hash overhead would
  // exceed the regex cost).
  let cacheKey: string | null = null;
  if (fullSlice.length >= 16) {
    const { h1, h2 } = dualHash32(fullSlice);
    // Compact composite key: length + two base-36 hashes (≤ 16 chars total).
    cacheKey = `${fullSlice.length.toString(36)}:${h1.toString(36)}:${h2.toString(36)}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;
  }

  // Prefilter sees a (possibly smaller) prefix — keeps huge payloads cheap.
  const prefilterSlice =
    fullSlice.length > PREFILTER_SCAN_LEN
      ? fullSlice.slice(0, PREFILTER_SCAN_LEN)
      : fullSlice;

  let result: boolean;
  if (!PREFILTER_REGEX.test(prefilterSlice)) {
    result = false;
  } else {
    result = STRONG_REGEX.test(fullSlice) || WORD_REGEX.test(fullSlice);
  }

  if (cacheKey !== null) cacheSet(cacheKey, result);
  return result;
}

async function readResponseBody(resp: Response): Promise<string> {
  // Never touch the original stream — callers (supabase-js, the user's code)
  // may still want to read it. We try `clone()` first, then fall back to a
  // cached body that some libraries attach (e.g. `_bodyText`, `bodyUsed`).
  try {
    if (typeof (resp as any).clone === "function") {
      const cloned = (resp as Response).clone();
      // Guard against `bodyUsed` on the clone (shouldn't happen, but safe).
      if (!(cloned as any).bodyUsed) {
        return await cloned.text();
      }
    }
  } catch {
    /* clone failed — stream may already be locked or response is non-standard */
  }
  // Best-effort fallbacks for non-standard Response-like objects.
  try {
    const cached =
      (resp as any)._bodyText ??
      (resp as any).bodyText ??
      (resp as any).body;
    if (typeof cached === "string") return cached;
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Pull the first defined value from a list of candidates.
 */
function firstDefined<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) if (v !== null && v !== undefined) return v as T;
  return undefined;
}

/**
 * Decide whether an `(error, data)` pair coming from `supabase.functions.invoke`,
 * a fetch call, PostgREST, or arbitrary edge-function output represents a 401/403.
 *
 * Strategy (each step is a hard signal — we return on the first match):
 *   1. Numeric HTTP status from any known location.
 *   2. PostgREST/Postgres SQLSTATE codes (insufficient_privilege, JWT expired…).
 *   3. Response body when readable (best for FunctionsHttpError).
 *   4. Structured error fields (`error.error`, `data.code`, nested `details`).
 *   5. Free-text keyword match on every plausible message field, multilingual.
 *
 * If nothing matches we conservatively return false so non-auth errors keep
 * their normal toast/UX path.
 */
export async function isAuthzError(error: any, data: any): Promise<boolean> {
  // ---- 1. Status (cheapest, most reliable) ----------------------------------
  const status = firstDefined<number>(
    error?.status,
    error?.statusCode,
    error?.context?.response?.status,
    error?.context?.status,
    error?.response?.status,
    error?.cause?.status,
    error?.originalError?.status,
    (data as any)?.status,
    (data as any)?.statusCode,
  );
  if (status === 401 || status === 403) return true;

  // ---- 2. Structured error codes -------------------------------------------
  const code = firstDefined<string | number>(
    error?.code,
    error?.context?.code,
    error?.cause?.code,
    error?.originalError?.code,
    (data as any)?.code,
    (data as any)?.error?.code,
  );
  if (code != null && AUTHZ_PG_CODES.has(String(code))) return true;

  // ---- 3. Underlying Response body (FunctionsHttpError, fetch) -------------
  const resp: Response | undefined = firstDefined<Response>(
    error?.context?.response,
    error?.response,
    error?.cause?.response,
  );
  let bodyAvailable = false;
  if (resp && typeof resp === "object" && "status" in resp) {
    if (resp.status === 401 || resp.status === 403) return true;
    const body = await readResponseBody(resp as Response);
    if (body) {
      bodyAvailable = true;
      if (matchesKeyword(body)) return true;
      try {
        const parsed = JSON.parse(body);
        if (
          matchesKeyword(parsed?.error) ||
          matchesKeyword(parsed?.error?.message) ||
          matchesKeyword(parsed?.message) ||
          matchesKeyword(parsed?.code) ||
          parsed?.statusCode === 401 ||
          parsed?.statusCode === 403
        ) {
          return true;
        }
      } catch {
        /* not JSON — keyword pass above already handled it */
      }
    }
  }

  // ---- 4. Structured error fields on the error/data objects ----------------
  // These exist even when the body is unavailable (e.g. CORS-blocked, opaque
  // responses, network-layer failures wrapped by supabase-js).
  const structured = [
    error?.error,
    error?.error?.message,
    error?.error_description,
    error?.hint,
    error?.details,
    error?.cause?.message,
    error?.originalError?.message,
    (data as any)?.error,
    (data as any)?.error?.message,
    (data as any)?.message,
    (data as any)?.details,
    (data as any)?.hint,
  ];
  if (structured.some(matchesKeyword)) return true;

  // ---- 5. Free-text fallback on the top-level message ----------------------
  if (
    matchesKeyword(error?.message) ||
    matchesKeyword((data as any)?.code)
  ) {
    return true;
  }

  // ---- 6. Last-resort heuristic: opaque FunctionsHttpError -----------------
  // supabase-js wraps every non-2xx as FunctionsHttpError. If we couldn't read
  // a status AND couldn't read a body, but the error class clearly indicates
  // an HTTP failure on a privileged endpoint, prefer the safer "not authz"
  // answer rather than guessing — caller will still show its generic toast.
  if (
    error?.name === "FunctionsHttpError" &&
    status == null &&
    !bodyAvailable
  ) {
    return false;
  }

  return false;
}

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

/**
 * Catches password-recovery URL fragments anywhere in the app and routes
 * them correctly:
 *
 *   1. `#type=recovery&access_token=...` on any path other than
 *      /reset-password → bounce to /reset-password with the hash preserved
 *      so the Supabase SDK still picks up the token.
 *
 *   2. `#error=access_denied&error_code=otp_expired&...` (Supabase's
 *      response when the recovery link has expired or the redirect_to URL
 *      wasn't on the project allowlist and got dropped to Site URL) →
 *      strip the ugly fragment from the URL, surface a clear toast, and
 *      send the user to /auth so they can request a fresh link.
 *
 * Rendered once inside <Router> in App.tsx so it runs on every navigation
 * and catches whichever path Supabase happens to land the user on.
 */
export const RecoveryHashHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash ?? "";
    if (!hash) return;

    // ── Expired / rejected recovery link ──
    // Hash looks like: #error=access_denied&error_code=otp_expired&...
    if (/[?#&]error=/.test(hash) && /(otp_expired|access_denied|invalid)/.test(hash)) {
      // Pull a human-readable reason out if Supabase included one.
      const desc = decodeURIComponent(
        (hash.match(/error_description=([^&]+)/)?.[1] ?? "")
          .replace(/\+/g, " "),
      );

      // Strip the noisy hash but stay on the same path so we don't double
      // navigate. Then redirect to /auth where the user can request a new
      // reset link via "Mot de passe oublié ?".
      window.history.replaceState(
        {},
        "",
        `${location.pathname}${location.search}`,
      );
      toast.error(
        desc ||
          "Le lien de réinitialisation a expiré. Demande un nouveau lien.",
      );
      navigate("/auth", { replace: true });
      return;
    }

    // ── Live recovery token landed on the wrong path ──
    // Possible if the Supabase allowlist is misconfigured and Supabase
    // dropped to Site URL instead of using our redirectTo.
    if (
      /[?#&]type=recovery(&|$)/.test(hash) &&
      location.pathname !== "/reset-password"
    ) {
      navigate(`/reset-password${hash}`, { replace: true });
    }
  }, [navigate, location.pathname, location.search]);

  return null;
};

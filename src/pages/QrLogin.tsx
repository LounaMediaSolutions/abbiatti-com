import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getUserAccess } from "@/lib/access";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type Status = "working" | "success" | "error";

/**
 * Public landing page for an employee QR sign-in.
 *
 * The QR encodes `<origin>/qr-login#t=<token>`. We read the token from the URL
 * FRAGMENT (never sent to a server / logs), redeem it via the public
 * `staff-qr-login` Edge Function for a one-time OTP, then complete the session
 * with verifyOtp. Deliberately text-light and icon-driven for low-literacy users.
 */
const QrLogin = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("working");
  // Guard against React 18 StrictMode double-invoke (the token is single-use on
  // the OTP step; running twice would waste the first OTP and could confuse).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
      if (!token) {
        setStatus("error");
        return;
      }

      // Strip the token from the address bar / history immediately.
      try {
        history.replaceState(null, "", window.location.pathname);
      } catch {
        /* no-op */
      }

      const { data, error } = await supabase.functions.invoke("staff-qr-login", {
        body: { token },
      });
      const tokenHash = (data as { token_hash?: string } | null)?.token_hash;
      if (error || !tokenHash) {
        setStatus("error");
        return;
      }

      const { error: vErr } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (vErr) {
        setStatus("error");
        return;
      }

      setStatus("success");
      const { data: { user } } = await supabase.auth.getUser();
      const access = user ? await getUserAccess(user.id) : null;
      // Small beat so the success check is visible before the redirect.
      setTimeout(() => navigate(access?.dashboardPath ?? "/employee", { replace: true }), 700);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600">
      <div className="w-full max-w-sm rounded-3xl bg-white/95 backdrop-blur p-8 text-center shadow-2xl">
        {status === "working" && (
          <>
            <Loader2 className="mx-auto h-16 w-16 animate-spin text-emerald-600" />
            <p className="mt-5 text-lg font-semibold text-secondary">
              {t("qrLogin.working", { defaultValue: "Signing you in…" })}
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
            <p className="mt-5 text-lg font-semibold text-secondary">
              {t("qrLogin.success", { defaultValue: "Welcome!" })}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-16 w-16 text-rose-500" />
            <p className="mt-5 text-lg font-semibold text-secondary">
              {t("qrLogin.errorTitle", { defaultValue: "This code didn’t work" })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("qrLogin.errorBody", {
                defaultValue: "Ask your manager to send you a new QR code.",
              })}
            </p>
            <button
              onClick={() => navigate("/staff-login", { replace: true })}
              className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t("qrLogin.usePassword", { defaultValue: "Sign in with a password" })}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default QrLogin;

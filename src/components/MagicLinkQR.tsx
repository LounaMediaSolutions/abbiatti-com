import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCode, Printer, Download, ShieldOff } from "lucide-react";

interface Props {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  roleEmoji?: string;
  roleLabel?: string;
}

/**
 * Reusable QR sign-in code for an employee.
 *
 * An admin/cohost generates the code; it encodes `<origin>/qr-login#t=<token>`.
 * The token is a long-lived, admin-revocable bearer credential (no PIN, by
 * product choice). The employee scans it with any phone camera to sign in
 * without typing. The raw token is returned only once by the Edge Function and
 * is never re-fetchable — regenerating issues a fresh code and revokes the old.
 */
export function MagicLinkQR({ userId, userName, avatarUrl, roleEmoji, roleLabel }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  async function generate() {
    setLoading(true);
    setLoginUrl(null);
    const { data, error } = await supabase.functions.invoke("staff-qr-issue", {
      body: { target_user_id: userId },
    });
    setLoading(false);
    const token = (data as { token?: string } | null)?.token;
    if (error || (data as { error?: string } | null)?.error || !token) {
      toast.error((data as { error?: string } | null)?.error ?? error?.message ?? t("common.error"));
      return;
    }
    // Token lives in the URL fragment (#) so it is never sent to servers or
    // captured in access logs / Referer headers.
    setLoginUrl(`${window.location.origin}/qr-login#t=${token}`);
  }

  async function revoke() {
    setRevoking(true);
    const { data, error } = await supabase.functions.invoke("staff-qr-revoke", {
      body: { target_user_id: userId },
    });
    setRevoking(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error((data as { error?: string } | null)?.error ?? error?.message ?? t("common.error"));
      return;
    }
    setLoginUrl(null);
    toast.success(t("team.qrRevoked", { defaultValue: "QR code disabled" }));
  }

  function getCanvas(): HTMLCanvasElement | null {
    return canvasWrapRef.current?.querySelector("canvas") ?? null;
  }

  function handleDownload() {
    const canvas = getCanvas();
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-login-${userName.replace(/\s+/g, "-").toLowerCase() || "employee"}.png`;
    a.click();
  }

  function handlePrint() {
    const canvas = getCanvas();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(userName)}</title>
      <style>
        @page{size:A6;margin:0;}
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:-apple-system,Arial,sans-serif;padding:18px;text-align:center;}
        .card{border:3px solid #000;border-radius:18px;padding:18px;}
        .avatar{width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid #000;margin:0 auto 8px;display:block;background:#eee;}
        .avatar-fb{width:120px;height:120px;border-radius:50%;border:4px solid #000;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:64px;background:#f3f3f3;}
        .name{font-size:18px;font-weight:700;margin:6px 0;}
        .qr{margin:10px auto;display:flex;justify-content:center;}
        .qr img{width:220px;height:220px;}
        .scan{font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:6px;}
      </style></head><body>
      <div class="card">
        ${avatarUrl
          ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(userName)}" />`
          : `<div class="avatar-fb" role="img" aria-label="${escapeHtml(userName)}">${roleEmoji ?? "👤"}</div>`}
        <div class="name">${escapeHtml(userName)}</div>
        <div class="qr"><img src="${dataUrl}" alt="${escapeHtml(t("team.qrAlt", { defaultValue: "QR sign-in code", name: userName }))}" /></div>
        <div class="scan">📷 ${escapeHtml(t("team.qrScanLabel", { defaultValue: "Scan to sign in" }))}</div>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setLoginUrl(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <QrCode className="h-4 w-4 mr-1" /> {t("team.qrCode")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("team.qrTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">{t("team.qrDesc")}</p>
          <div className="flex flex-col items-center gap-2">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover border-2 border-foreground" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-3xl border-2 border-foreground">
                {roleEmoji ?? "👤"}
              </div>
            )}
            <div className="font-medium">{userName}</div>
            {roleLabel && <div className="text-xs text-muted-foreground">{roleLabel}</div>}
          </div>

          {!loginUrl && (
            <Button onClick={generate} disabled={loading} className="w-full">
              <QrCode className="h-4 w-4 mr-2" />
              {loading ? t("team.qrGenerating") : t("team.qrGenerate")}
            </Button>
          )}

          {loginUrl && (
            <>
              <div ref={canvasWrapRef} className="flex justify-center p-4 bg-white border rounded-lg">
                {/* white bg + quiet-zone margin → reliably scannable on screen/print */}
                <QRCodeCanvas value={loginUrl} size={220} level="M" marginSize={2} />
              </div>
              <p className="text-xs text-amber-600">
                {t("team.qrReusableHint", {
                  defaultValue:
                    "Anyone who has this image can sign in as this employee. Keep it private and disable it if it leaks.",
                })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={handleDownload} className="w-full">
                  <Download className="h-4 w-4 mr-2" /> {t("team.qrDownload", { defaultValue: "Download" })}
                </Button>
                <Button onClick={handlePrint} variant="outline" className="w-full">
                  <Printer className="h-4 w-4 mr-2" /> {t("team.qrPrint")}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={generate} variant="ghost" size="sm" disabled={loading} className="flex-1">
                  {t("team.qrRegenerate", { defaultValue: "Regenerate" })}
                </Button>
                <Button onClick={revoke} variant="ghost" size="sm" disabled={revoking}
                  className="flex-1 text-destructive hover:text-destructive">
                  <ShieldOff className="h-4 w-4 mr-1" />
                  {revoking ? t("common.processing", { defaultValue: "…" }) : t("team.qrRevoke", { defaultValue: "Disable" })}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

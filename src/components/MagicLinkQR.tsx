import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCode, Printer } from "lucide-react";

interface Props {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  roleEmoji?: string;
  roleLabel?: string;
}

export function MagicLinkQR({ userId, userName, avatarUrl, roleEmoji, roleLabel }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setLink(null);
    const { data, error } = await supabase.functions.invoke("generate-magic-link", {
      body: { target_user_id: userId, redirect_to: window.location.origin },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? t("common.error"));
      return;
    }
    setLink((data as any).action_link);
  }

  function handlePrint() {
    if (!link) return;
    const qrSvg = document.getElementById("ml-qr-svg")?.outerHTML ?? "";
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${userName}</title>
      <style>
        @page{size:A6;margin:0;}
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:-apple-system,Arial,sans-serif;padding:18px;text-align:center;}
        .card{border:3px solid #000;border-radius:18px;padding:18px;}
        .avatar{width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid #000;margin:0 auto 8px;display:block;background:#eee;}
        .avatar-fb{width:120px;height:120px;border-radius:50%;border:4px solid #000;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:64px;background:#f3f3f3;}
        .role{font-size:48px;line-height:1;margin:6px 0;}
        .qr{margin:10px auto;display:flex;justify-content:center;}
        .qr svg{width:200px;height:200px;}
        .scan{font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:6px;}
        .arrow{font-size:28px;}
      </style></head><body>
      <div class="card">
        ${avatarUrl
          ? `<img class="avatar" src="${avatarUrl}" />`
          : `<div class="avatar-fb">${roleEmoji ?? "👤"}</div>`}
        <div class="role">${roleEmoji ?? ""}</div>
        <div class="qr">${qrSvg}</div>
        <div class="arrow">📷</div>
        <div class="scan">SCAN</div>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setLink(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={generate}>
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

          {loading && <p className="text-sm">{t("team.qrGenerating")}</p>}

          {link && (
            <>
              <div className="flex justify-center p-4 bg-background border rounded-lg">
                <QRCodeSVG id="ml-qr-svg" value={link} size={220} level="M" />
              </div>
              <p className="text-xs text-muted-foreground">{t("team.qrExpire")}</p>
              <Button onClick={handlePrint} className="w-full">
                <Printer className="h-4 w-4 mr-2" /> {t("team.qrPrint")}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

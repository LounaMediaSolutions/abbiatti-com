import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { QrCode } from "lucide-react";
import { toast } from "sonner";

export function QRLoginScanner() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  function handleScan(result: { rawValue: string }[]) {
    const value = result?.[0]?.rawValue;
    if (!value) return;
    try {
      const url = new URL(value);
      // Navigate to the magic link (full URL, leaves SPA)
      toast.success(t("auth.qrDetected") || "QR code détecté");
      setOpen(false);
      window.location.href = url.toString();
    } catch {
      toast.error(t("auth.qrInvalid") || "QR code invalide");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <QrCode className="h-4 w-4 mr-2" />
          {t("auth.scanQR") || "Scanner QR code"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("auth.scanQRTitle") || "Scanner votre QR code"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            {t("auth.scanQRDesc") || "Pointez la caméra vers votre QR code de connexion"}
          </p>
          <div className="overflow-hidden rounded-lg border">
            {open && (
              <Scanner
                onScan={handleScan}
                onError={(err) => console.error(err)}
                constraints={{ facingMode: "environment" }}
                styles={{ container: { width: "100%" } }}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

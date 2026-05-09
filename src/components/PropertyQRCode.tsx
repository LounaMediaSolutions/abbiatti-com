import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QrCode, Printer } from "lucide-react";

interface Props {
  propertyName: string;
  qrToken: string;
}

export function PropertyQRCode({ propertyName, qrToken }: Props) {
  const [open, setOpen] = useState(false);
  const url = `${window.location.origin}/?qr=${qrToken}`;

  function handlePrint() {
    const svg = document.getElementById("prop-qr-svg")?.outerHTML ?? "";
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${propertyName}</title>
      <style>
        @page{size:A5;margin:0;}
        html,body{height:100%;}
        body{font-family:-apple-system,Arial,sans-serif;margin:0;display:flex;align-items:center;justify-content:center;}
        .wrap{text-align:center;padding:24px;}
        .qr{display:flex;justify-content:center;margin:0 auto;}
        .qr svg{width:5cm;height:5cm;display:block;}
        .name{margin-top:16px;font-size:18px;font-weight:700;}
        .scan{font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-top:6px;color:#444;}
      </style></head><body>
      <div class="wrap">
        <div class="qr">${svg}</div>
        <div class="name">Logement : ${propertyName}</div>
        <div class="scan">Scannez pour démarrer votre tâche</div>
      </div>
      <script>window.print();setTimeout(()=>window.close(),300);</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="QR check-in prestataire">
          <QrCode className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR check-in — {propertyName}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center p-4 bg-white rounded-lg">
          <QRCodeSVG id="prop-qr-svg" value={url} size={220} level="M" />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Affichez ce code dans la propriété. Vos prestataires le scanneront pour démarrer leur tâche.
        </p>
        <Button onClick={handlePrint} variant="outline">
          <Printer className="h-4 w-4 mr-2" /> Imprimer (A5)
        </Button>
      </DialogContent>
    </Dialog>
  );
}

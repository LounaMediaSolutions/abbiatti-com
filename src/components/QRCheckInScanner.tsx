import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QrCode, Loader2 } from "lucide-react";

interface Props {
  taskId: string;
  onCheckedIn?: () => void;
}

export function QRCheckInScanner({ taskId, onCheckedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleScan(detected: any[]) {
    if (busy || !detected?.length) return;
    const raw = detected[0]?.rawValue ?? "";
    // Accept either a raw token or a URL containing ?qr=...
    let token = raw.trim();
    try {
      const u = new URL(raw);
      token = u.searchParams.get("qr") ?? token;
    } catch {}
    if (!token) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("start_task_with_qr", {
      _task_id: taskId,
      _qr_token: token,
    });
    setBusy(false);
    if (error || !data) {
      toast.error("QR code invalide ou tâche déjà commencée. Contactez votre co-hôte.");
      return;
    }
    toast.success("Check-in confirmé !");
    setOpen(false);
    onCheckedIn?.();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <QrCode className="h-4 w-4 mr-1" /> Scanner QR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scanner le QR de la propriété</DialogTitle>
          </DialogHeader>
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
            {open && (
              <Scanner
                onScan={handleScan}
                onError={(e) => console.warn("[QR scan]", e)}
                constraints={{ facingMode: "environment" }}
                styles={{ container: { width: "100%", height: "100%" } }}
              />
            )}
          </div>
          {busy && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Vérification...
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Pointez la caméra vers le QR code affiché dans la propriété pour démarrer la tâche.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

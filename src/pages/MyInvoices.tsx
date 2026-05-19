import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";
import { generateInvoicePdf, type LineItem } from "@/lib/billing";

type Invoice = {
  id: string;
  organization_id: string;
  invoice_number: string;
  period_year: number;
  period_month: number;
  total: number;
  currency: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  line_items: any;
};

export default function MyInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orgName, setOrgName] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.org_id) return;
      const [{ data: org }, { data: inv }] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
        supabase
          .from("invoices")
          .select("*")
          .eq("organization_id", profile.org_id)
          .order("issued_at", { ascending: false }),
      ]);
      setOrgName(org?.name ?? "");
      setInvoices((inv ?? []) as Invoice[]);
    })();
  }, [user?.id]);

  const downloadPdf = async (inv: Invoice) => {
    const blob = await generateInvoicePdf({
      invoice_number: inv.invoice_number,
      organization_name: orgName,
      period_year: inv.period_year,
      period_month: inv.period_month,
      line_items: inv.line_items as LineItem[],
      subtotal: inv.total,
      total: inv.total,
      currency: inv.currency,
      issued_at: inv.issued_at,
      due_at: inv.due_at,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoice_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Mes factures</h1>
          <p className="text-sm text-muted-foreground">Historique des factures de votre organisation</p>
        </div>
      </header>

      <Card>
        <div className="divide-y">
          {invoices.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">Aucune facture pour le moment</p>
          ) : (
            invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{inv.invoice_number}</p>
                    <Badge variant={inv.status === "paid" ? "default" : "outline"}>
                      {inv.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Période {inv.period_month}/{inv.period_year} ·{" "}
                    {inv.total.toFixed(2)} {inv.currency} · Émise le{" "}
                    {new Date(inv.issued_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => downloadPdf(inv)}>
                  <Download className="mr-1 h-4 w-4" />
                  PDF
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

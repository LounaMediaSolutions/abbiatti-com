import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, ArrowLeft, FileText, Download, Send, Trash2 } from "lucide-react";
import { Unauthorized } from "@/components/Unauthorized";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  computeUsageForOrg, buildLineItems, generateInvoicePdf, type LineItem,
} from "@/lib/billing";

type Org = {
  id: string;
  name: string;
  billing_currency: string;
  price_monthly_base: number;
  price_per_admin: number;
  price_per_cohost: number;
  price_per_employee: number;
  price_per_message: number;
  price_per_ical_sync: number;
  price_per_mb_storage: number;
};

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
  pdf_url: string | null;
  line_items: any;
};

export default function SuperAdminBilling() {
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [editingPrices, setEditingPrices] = useState<Org | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsSuper(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle()
      .then(({ data }) => setIsSuper(!!data));
  }, [user?.id, loading]);

  const load = async () => {
    const [{ data: o }, { data: inv }] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id,name,billing_currency,price_monthly_base,price_per_admin,price_per_cohost,price_per_employee,price_per_message,price_per_ical_sync,price_per_mb_storage"
        )
        .order("name"),
      supabase
        .from("invoices")
        .select("*")
        .order("issued_at", { ascending: false })
        .limit(100),
    ]);
    setOrgs((o ?? []) as Org[]);
    setInvoices((inv ?? []) as Invoice[]);
  };

  useEffect(() => {
    if (isSuper) load();
  }, [isSuper]);

  if (loading || isSuper === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-300">
        Chargement…
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;

  const savePrices = async () => {
    if (!editingPrices) return;
    const { error } = await supabase
      .from("organizations")
      .update({
        billing_currency: editingPrices.billing_currency,
        price_monthly_base: editingPrices.price_monthly_base,
        price_per_admin: editingPrices.price_per_admin,
        price_per_cohost: editingPrices.price_per_cohost,
        price_per_employee: editingPrices.price_per_employee,
        price_per_message: editingPrices.price_per_message,
        price_per_ical_sync: editingPrices.price_per_ical_sync,
        price_per_mb_storage: editingPrices.price_per_mb_storage,
      })
      .eq("id", editingPrices.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Tarifs enregistrés" });
    setEditingPrices(null);
    load();
  };

  const generateInvoice = async (org: Org) => {
    setGenerating(org.id);
    try {
      const usage = await computeUsageForOrg(org.id, year, month);
      const items: LineItem[] = buildLineItems(usage, org);
      if (items.length === 0) {
        toast({ title: "Aucun montant à facturer pour cette période" });
        return;
      }
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      const total = subtotal;
      const invoice_number = `INV-${year}${String(month).padStart(2, "0")}-${org.id.slice(0, 6).toUpperCase()}`;

      const { error } = await supabase.from("invoices").insert({
        organization_id: org.id,
        period_year: year,
        period_month: month,
        currency: org.billing_currency,
        line_items: items as any,
        subtotal,
        total,
        status: "draft",
        invoice_number,
      });
      if (error) throw error;
      toast({ title: "Facture créée", description: invoice_number });
      load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const downloadPdf = async (inv: Invoice) => {
    const org = orgs.find((o) => o.id === inv.organization_id);
    const blob = await generateInvoicePdf({
      invoice_number: inv.invoice_number,
      organization_name: org?.name ?? "Agence",
      period_year: inv.period_year,
      period_month: inv.period_month,
      line_items: inv.line_items as LineItem[],
      subtotal: inv.total,
      total: inv.total,
      currency: inv.currency,
      issued_at: inv.issued_at,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoice_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setStatus = async (inv: Invoice, status: string) => {
    const patch: any = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", inv.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    load();
  };

  const deleteInvoice = async (inv: Invoice) => {
    if (!confirm(`Supprimer la facture ${inv.invoice_number} ?`)) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/super-admin" className="text-slate-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-600">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Facturation Super Admin</h1>
              <p className="text-xs text-slate-400">Tarifs et factures par agence</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Period selector */}
        <Card className="border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-slate-400">Année</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-28 border-slate-700 bg-slate-800 text-slate-100"
              />
            </div>
            <div>
              <Label className="text-slate-400">Mois</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-20 border-slate-700 bg-slate-800 text-slate-100"
              />
            </div>
            <p className="text-sm text-slate-400 ml-2">
              Période de facturation pour la génération
            </p>
          </div>
        </Card>

        {/* Organizations & pricing */}
        <Card className="border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 p-4">
            <h2 className="font-semibold">Tarifs par agence</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {orgs.map((org) => (
              <div key={org.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{org.name}</p>
                  <p className="text-xs text-slate-400">
                    Base {org.price_monthly_base} · Admin {org.price_per_admin} · Co-host {org.price_per_cohost} ·
                    Employé {org.price_per_employee} · Msg {org.price_per_message} · iCal {org.price_per_ical_sync} ·{" "}
                    {org.billing_currency}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingPrices(org)}
                  className="border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                >
                  Tarifs
                </Button>
                <Button
                  size="sm"
                  onClick={() => generateInvoice(org)}
                  disabled={generating === org.id}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <FileText className="mr-1 h-4 w-4" />
                  Générer facture {month}/{year}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Invoices */}
        <Card className="border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 p-4">
            <h2 className="font-semibold">Factures récentes</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {invoices.length === 0 ? (
              <p className="p-6 text-center text-slate-400">Aucune facture</p>
            ) : (
              invoices.map((inv) => {
                const org = orgs.find((o) => o.id === inv.organization_id);
                return (
                  <div key={inv.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{inv.invoice_number}</p>
                        <Badge
                          variant="outline"
                          className={
                            inv.status === "paid"
                              ? "border-emerald-700 text-emerald-400"
                              : inv.status === "sent"
                                ? "border-blue-700 text-blue-400"
                                : inv.status === "void"
                                  ? "border-rose-700 text-rose-400"
                                  : "border-slate-600 text-slate-400"
                          }
                        >
                          {inv.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">
                        {org?.name ?? "—"} · {inv.period_month}/{inv.period_year} ·{" "}
                        {inv.total.toFixed(2)} {inv.currency}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadPdf(inv)}
                      className="border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {inv.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={() => setStatus(inv, "sent")}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Send className="mr-1 h-4 w-4" />
                        Envoyer
                      </Button>
                    )}
                    {inv.status === "sent" && (
                      <Button
                        size="sm"
                        onClick={() => setStatus(inv, "paid")}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Marquer payée
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteInvoice(inv)}
                      className="border-rose-900 bg-rose-950/50 text-rose-400 hover:bg-rose-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Edit prices */}
      <Dialog open={!!editingPrices} onOpenChange={(o) => !o && setEditingPrices(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tarifs — {editingPrices?.name}</DialogTitle>
          </DialogHeader>
          {editingPrices && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Devise</Label>
                <Input
                  value={editingPrices.billing_currency}
                  onChange={(e) =>
                    setEditingPrices({ ...editingPrices, billing_currency: e.target.value })
                  }
                />
              </div>
              {[
                ["Base mensuelle", "price_monthly_base"],
                ["Par admin", "price_per_admin"],
                ["Par co-host", "price_per_cohost"],
                ["Par employé", "price_per_employee"],
                ["Par message", "price_per_message"],
                ["Par sync iCal", "price_per_ical_sync"],
                ["Par Mo stockage", "price_per_mb_storage"],
              ].map(([label, key]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(editingPrices as any)[key]}
                    onChange={(e) =>
                      setEditingPrices({
                        ...editingPrices,
                        [key]: parseFloat(e.target.value) || 0,
                      } as Org)
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPrices(null)}>
              Annuler
            </Button>
            <Button onClick={savePrices}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

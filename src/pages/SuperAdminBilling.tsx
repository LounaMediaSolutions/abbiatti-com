import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, FileText, Download, Send, Trash2 } from "lucide-react";
import { Unauthorized } from "@/components/Unauthorized";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  computeUsageForOrg, buildLineItems, generateInvoicePdf, type LineItem,
} from "@/lib/billing";
import { isSuperAdminUser } from "@/lib/access";

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
  const { t } = useTranslation();
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
    isSuperAdminUser(user.id).then(setIsSuper).catch(() => setIsSuper(false));
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
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("superAdminBilling.pricesSaved") });
    setEditingPrices(null);
    load();
  };

  const generateInvoice = async (org: Org) => {
    setGenerating(org.id);
    try {
      const usage = await computeUsageForOrg(org.id, year, month);
      const items: LineItem[] = buildLineItems(usage, org);
      if (items.length === 0) {
        toast({ title: t("superAdminBilling.nothingToBill") });
        return;
      }
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      const total = subtotal;
      const invoiceNumber = `INV-${year}${String(month).padStart(2, "0")}-${org.id.slice(0, 6).toUpperCase()}`;

      const { error } = await supabase.from("invoices").insert({
        organization_id: org.id,
        period_year: year,
        period_month: month,
        currency: org.billing_currency,
        line_items: items as any,
        subtotal,
        total,
        status: "draft",
        invoice_number: invoiceNumber,
      });
      if (error) throw error;
      toast({ title: t("superAdminBilling.invoiceCreated"), description: invoiceNumber });
      load();
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const downloadPdf = async (inv: Invoice) => {
    const org = orgs.find((o) => o.id === inv.organization_id);
    const blob = await generateInvoicePdf({
      invoice_number: inv.invoice_number,
      organization_name: org?.name ?? t("superAdminBilling.agencyFallback"),
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
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    load();
  };

  const deleteInvoice = async (inv: Invoice) => {
    if (!confirm(t("superAdminBilling.deleteInvoiceConfirm", { invoice: inv.invoice_number }))) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    load();
  };

  if (loading || isSuper === null) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-secondary">{t("superAdminBilling.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("superAdminBilling.subtitle")}</p>
        </div>
      </div>

      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>{t("reports.filters.year")}</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="w-28"
            />
          </div>
          <div>
            <Label>{t("reports.filters.month")}</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="w-20"
            />
          </div>
          <p className="ml-2 text-sm text-muted-foreground">
            {t("superAdminBilling.periodHint")}
          </p>
        </div>
      </Card>

      <Card className="shadow-card">
        <div className="border-b p-4">
          <h2 className="font-semibold text-secondary">{t("superAdminBilling.pricingByAgency")}</h2>
        </div>
        <div className="divide-y">
          {orgs.map((org) => (
            <div key={org.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-secondary">{org.name}</p>
                <p className="text-xs text-muted-foreground">
                  Base {org.price_monthly_base} · Admin {org.price_per_admin} · Co-host {org.price_per_cohost} ·
                  Employé {org.price_per_employee} · Msg {org.price_per_message} · iCal {org.price_per_ical_sync} ·{" "}
                  {org.billing_currency}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditingPrices(org)}>
                {t("superAdminBilling.prices")}
              </Button>
              <Button size="sm" onClick={() => generateInvoice(org)} disabled={generating === org.id}>
                <FileText className="mr-1 h-4 w-4" />
                {t("superAdminBilling.generateInvoice", { month, year })}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="shadow-card">
        <div className="border-b p-4">
          <h2 className="font-semibold text-secondary">{t("superAdminBilling.recentInvoices")}</h2>
        </div>
        <div className="divide-y">
          {invoices.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">{t("superAdminBilling.noInvoices")}</p>
          ) : (
            invoices.map((inv) => {
              const org = orgs.find((o) => o.id === inv.organization_id);
              return (
                <div key={inv.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-secondary">{inv.invoice_number}</p>
                      <Badge
                        variant="outline"
                        className={
                          inv.status === "paid"
                            ? "border-emerald-700 text-emerald-600"
                            : inv.status === "sent"
                              ? "border-blue-700 text-blue-600"
                              : inv.status === "void"
                                ? "border-rose-700 text-rose-600"
                                : "text-muted-foreground"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {org?.name ?? "—"} · {inv.period_month}/{inv.period_year} ·{" "}
                      {inv.total.toFixed(2)} {inv.currency}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => downloadPdf(inv)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {inv.status === "draft" && (
                    <Button size="sm" onClick={() => setStatus(inv, "sent")}>
                      <Send className="mr-1 h-4 w-4" />
                        {t("superAdminBilling.send")}
                    </Button>
                  )}
                  {inv.status === "sent" && (
                    <Button size="sm" onClick={() => setStatus(inv, "paid")}>
                      {t("superAdminBilling.markPaid")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => deleteInvoice(inv)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Dialog open={!!editingPrices} onOpenChange={(o) => !o && setEditingPrices(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("superAdminBilling.pricesFor", { name: editingPrices?.name })}</DialogTitle>
          </DialogHeader>
          {editingPrices && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{t("superAdminBilling.currency")}</Label>
                <Input
                  value={editingPrices.billing_currency}
                  onChange={(e) =>
                    setEditingPrices({ ...editingPrices, billing_currency: e.target.value })
                  }
                />
              </div>
              {[
                [t("superAdminBilling.priceFields.monthlyBase"), "price_monthly_base"],
                [t("superAdminBilling.priceFields.perAdmin"), "price_per_admin"],
                [t("superAdminBilling.priceFields.perCohost"), "price_per_cohost"],
                [t("superAdminBilling.priceFields.perEmployee"), "price_per_employee"],
                [t("superAdminBilling.priceFields.perMessage"), "price_per_message"],
                [t("superAdminBilling.priceFields.perIcalSync"), "price_per_ical_sync"],
                [t("superAdminBilling.priceFields.perStorageMb"), "price_per_mb_storage"],
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
              {t("common.cancel")}
            </Button>
            <Button onClick={savePrices}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

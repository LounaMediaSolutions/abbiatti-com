import { supabase } from "@/integrations/supabase/client";

export type LineItem = {
  label: string;
  qty: number;
  unit_price: number;
  total: number;
};

export type UsageReport = {
  admins: number;
  cohosts: number;
  employees: number;
  messages: number;
  ical_syncs: number;
  storage_mb: number;
};

const EMPLOYEE_ROLES = ["cleaner", "driver", "decorator", "maintenance", "staff"];

export async function computeUsageForOrg(
  orgId: string,
  year: number,
  month: number
): Promise<UsageReport> {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();

  const [{ data: roles }, { data: reservations }, { data: feeds }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("organization_id", orgId),
    supabase
      .from("reservations")
      .select("messages_sent")
      .eq("organization_id", orgId)
      .gte("updated_at", start)
      .lt("updated_at", end),
    supabase
      .from("property_ical_feeds")
      .select("last_synced_at")
      .eq("organization_id", orgId)
      .gte("last_synced_at", start)
      .lt("last_synced_at", end),
  ]);

  const admins = (roles ?? []).filter((r: any) => r.role === "admin").length;
  const cohosts = (roles ?? []).filter((r: any) => r.role === "cohost").length;
  const employees = (roles ?? []).filter((r: any) =>
    EMPLOYEE_ROLES.includes(r.role)
  ).length;

  const messages = (reservations ?? []).reduce((sum: number, r: any) => {
    const arr = Array.isArray(r.messages_sent) ? r.messages_sent : [];
    return sum + arr.length;
  }, 0);

  const ical_syncs = (feeds ?? []).length;

  return { admins, cohosts, employees, messages, ical_syncs, storage_mb: 0 };
}

export function buildLineItems(
  usage: UsageReport,
  prices: {
    price_monthly_base: number;
    price_per_admin: number;
    price_per_cohost: number;
    price_per_employee: number;
    price_per_message: number;
    price_per_ical_sync: number;
    price_per_mb_storage: number;
  }
): LineItem[] {
  const items: LineItem[] = [];
  const push = (label: string, qty: number, unit: number) => {
    if (qty > 0 && unit > 0) {
      items.push({ label, qty, unit_price: unit, total: qty * unit });
    }
  };
  if (prices.price_monthly_base > 0) {
    items.push({
      label: "Abonnement mensuel",
      qty: 1,
      unit_price: prices.price_monthly_base,
      total: prices.price_monthly_base,
    });
  }
  push("Administrateurs", usage.admins, prices.price_per_admin);
  push("Co-hosts", usage.cohosts, prices.price_per_cohost);
  push("Employés", usage.employees, prices.price_per_employee);
  push("Messages WhatsApp/SMS", usage.messages, prices.price_per_message);
  push("Synchronisations iCal", usage.ical_syncs, prices.price_per_ical_sync);
  push("Stockage (Mo)", usage.storage_mb, prices.price_per_mb_storage);
  return items;
}

export async function generateInvoicePdf(invoice: {
  invoice_number: string;
  organization_name: string;
  period_year: number;
  period_month: number;
  line_items: LineItem[];
  subtotal: number;
  total: number;
  currency: string;
  issued_at: string;
  due_at?: string | null;
  notes?: string | null;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 15;
  let y = 20;

  doc.setFontSize(22).setFont("helvetica", "bold");
  doc.text("FACTURE", left, y);
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(`N° ${invoice.invoice_number}`, 195, y, { align: "right" });

  y += 12;
  doc.setFontSize(11).setFont("helvetica", "bold").text("Abbiatti", left, y);
  doc.setFontSize(9).setFont("helvetica", "normal");
  doc.text("Plateforme de gestion locations courte durée", left, y + 5);

  y += 18;
  doc.setFontSize(9).text("Facturé à :", left, y);
  doc.setFontSize(11).setFont("helvetica", "bold").text(invoice.organization_name, left, y + 5);

  doc.setFont("helvetica", "normal").setFontSize(9);
  const monthName = new Date(invoice.period_year, invoice.period_month - 1, 1).toLocaleDateString(
    "fr-FR",
    { month: "long", year: "numeric" }
  );
  doc.text(`Période : ${monthName}`, 195, y, { align: "right" });
  doc.text(
    `Émise : ${new Date(invoice.issued_at).toLocaleDateString("fr-FR")}`,
    195,
    y + 5,
    { align: "right" }
  );
  if (invoice.due_at) {
    doc.text(
      `Échéance : ${new Date(invoice.due_at).toLocaleDateString("fr-FR")}`,
      195,
      y + 10,
      { align: "right" }
    );
  }

  y += 25;
  doc.setFillColor(30, 64, 175);
  doc.rect(left, y, 180, 8, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(9);
  doc.text("Description", left + 2, y + 5.5);
  doc.text("Qté", left + 110, y + 5.5, { align: "right" });
  doc.text("PU", left + 140, y + 5.5, { align: "right" });
  doc.text("Total", left + 178, y + 5.5, { align: "right" });

  y += 10;
  doc.setTextColor(0, 0, 0).setFont("helvetica", "normal").setFontSize(9);
  for (const item of invoice.line_items) {
    doc.text(item.label, left + 2, y);
    doc.text(String(item.qty), left + 110, y, { align: "right" });
    doc.text(item.unit_price.toFixed(2), left + 140, y, { align: "right" });
    doc.text(item.total.toFixed(2), left + 178, y, { align: "right" });
    y += 6;
  }

  y += 4;
  doc.line(left + 100, y, left + 178, y);
  y += 6;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("TOTAL", left + 110, y);
  doc.text(`${invoice.total.toFixed(2)} ${invoice.currency}`, left + 178, y, {
    align: "right",
  });

  if (invoice.notes) {
    y += 15;
    doc.setFont("helvetica", "italic").setFontSize(9);
    doc.text(invoice.notes, left, y, { maxWidth: 180 });
  }

  doc.setFontSize(8).setTextColor(120);
  doc.text(
    "Merci pour votre confiance · contact@abbiatti.com",
    105,
    285,
    { align: "center" }
  );

  return doc.output("blob");
}

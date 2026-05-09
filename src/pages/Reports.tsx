import { useEffect, useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const Reports = () => {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [propertyId, setPropertyId] = useState<string>("all");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      if (!prof?.organization_id) return;
      setOrgId(prof.organization_id);
      const { data: o } = await supabase.from("organizations").select("name").eq("id", prof.organization_id).maybeSingle();
      setOrgName(o?.name || "");
      const { data: p } = await supabase.from("properties").select("id, name").eq("organization_id", prof.organization_id).order("name");
      setProperties(p || []);
    })();
  }, [user]);

  const generate = async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      const start = new Date(year, month, 1).toISOString().slice(0, 10);
      const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);

      let q = supabase.from("reservations").select("*, properties(name)").eq("organization_id", orgId).gte("check_in", start).lte("check_in", end).order("check_in");
      if (propertyId !== "all") q = q.eq("property_id", propertyId);
      const { data: resas, error } = await q;
      if (error) throw error;

      const list = (resas as any) || [];
      const total = list.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
      const nights = list.reduce((s: number, r: any) => {
        const d1 = new Date(r.check_in); const d2 = new Date(r.check_out);
        return s + Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
      }, 0);

      const doc = new jsPDF();
      const propLabel = propertyId === "all" ? "Tous les biens" : (properties.find((p) => p.id === propertyId)?.name || "");

      doc.setFontSize(20);
      doc.text(orgName || "Rapport", 14, 18);
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Rapport mensuel — ${MONTHS_FR[month]} ${year}`, 14, 26);
      doc.text(propLabel, 14, 32);

      // Summary box
      doc.setDrawColor(200);
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(14, 40, 182, 24, 2, 2, "FD");
      doc.setTextColor(40);
      doc.setFontSize(10);
      doc.text("Réservations", 20, 48);
      doc.text("Nuits vendues", 80, 48);
      doc.text("Revenu total", 140, 48);
      doc.setFontSize(16);
      doc.text(String(list.length), 20, 58);
      doc.text(String(nights), 80, 58);
      doc.text(`${total.toFixed(2)} €`, 140, 58);

      // Table
      autoTable(doc, {
        startY: 72,
        head: [["Bien", "Voyageur", "Arrivée", "Départ", "Nuits", "Source", "Montant"]],
        body: list.map((r: any) => {
          const n = Math.max(0, Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86400000));
          return [
            r.properties?.name || "—",
            r.guest_name || "—",
            r.check_in,
            r.check_out,
            String(n),
            r.source,
            `${(Number(r.amount) || 0).toFixed(2)} €`,
          ];
        }),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 60, 110] },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 72;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Généré le ${new Date().toLocaleString("fr-FR")} — Abbiatti`, 14, finalY + 12);

      doc.save(`rapport-${year}-${String(month + 1).padStart(2, "0")}-${propLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("Rapport généré");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Rapports mensuels</h1>
        <p className="text-sm text-muted-foreground">Génère un PDF récapitulatif des réservations et revenus par mois et par bien.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Bien</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les biens</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mois</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(+v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS_FR.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Année</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(+v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={generate} disabled={generating} className="w-full">
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
          Générer le PDF
        </Button>
      </Card>
    </div>
  );
};

export default Reports;

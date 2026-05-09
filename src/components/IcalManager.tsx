import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Feed {
  id: string;
  label: string;
  source: string;
  ical_url: string;
  active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

interface Props {
  propertyId: string;
  organizationId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const SOURCES = ["airbnb", "booking", "vrbo", "expedia", "manual"] as const;

export const IcalManager = ({ propertyId, organizationId, open, onOpenChange }: Props) => {
  const { t } = useTranslation();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<string>("airbnb");
  const [url, setUrl] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("property_ical_feeds")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setFeeds((data ?? []) as Feed[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open, propertyId]);

  const add = async () => {
    if (!url.trim() || !label.trim()) {
      toast.error(t("ical.missingFields"));
      return;
    }
    const { error } = await supabase.from("property_ical_feeds").insert([{
      property_id: propertyId,
      organization_id: organizationId,
      label: label.trim(),
      source: source as any,
      ical_url: url.trim(),
    }]);
    if (error) return toast.error(error.message);
    setLabel(""); setUrl(""); setSource("airbnb");
    toast.success(t("ical.added"));
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("property_ical_feeds").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("ical.removed"));
    load();
  };

  const sync = async (id: string) => {
    setSyncing(id);
    const { data, error } = await supabase.functions.invoke("sync-ical", {
      body: { feed_id: id },
    });
    setSyncing(null);
    if (error) return toast.error(error.message);
    const result = (data as any)?.results?.[0];
    if (result?.ok) toast.success(t("ical.synced", { count: result.count ?? 0 }));
    else toast.error(result?.error || t("ical.syncFailed"));
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("ical.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : feeds.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ical.empty")}</p>
            ) : (
              feeds.map((f) => (
                <div key={f.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{f.label}</p>
                      <p className="text-xs text-muted-foreground capitalize">{f.source}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => sync(f.id)} disabled={syncing === f.id}>
                        <RefreshCw className={`h-3.5 w-3.5 ${syncing === f.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(f.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {f.last_error ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> {f.last_error.slice(0, 40)}
                      </Badge>
                    ) : f.last_synced_at ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {new Date(f.last_synced_at).toLocaleString()}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t("ical.neverSynced")}</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">{t("ical.addNew")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("ical.label")}</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Airbnb FR" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("ical.source")}</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("ical.url")}</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <Button onClick={add} className="w-full" size="sm">
              <Plus className="h-4 w-4 mr-1" /> {t("ical.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

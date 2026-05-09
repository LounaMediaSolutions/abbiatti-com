import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Copy, Download, ImageOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Album = {
  id: string;
  guest_account_id: string;
  storage_path: string;
  photos_count: number;
  generated_at: string;
  error: string | null;
};

interface Props {
  orgId: string;
}

export function AlbumsTab({ orgId }: Props) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("guest_albums")
      .select("id, guest_account_id, storage_path, photos_count, generated_at, error")
      .eq("organization_id", orgId)
      .order("generated_at", { ascending: false });
    if (error) toast.error(error.message);
    setAlbums((data ?? []) as Album[]);
    setLoading(false);
  }

  function publicUrl(path: string) {
    return supabase.storage.from("guest-albums").getPublicUrl(path).data.publicUrl;
  }

  async function copyLink(path: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(path));
      toast.success("Lien copié");
    } catch {
      toast.error("Impossible de copier");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Albums photo</CardTitle>
        <CardDescription>
          Collages générés automatiquement avant la fermeture des comptes invités, prêts à
          partager sur les réseaux sociaux.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center text-center text-muted-foreground py-8 gap-2">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">Aucun album pour le moment.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a) => {
              const ok = !a.error && !!a.storage_path;
              return (
                <div
                  key={a.id}
                  className="rounded-lg border bg-card overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-square bg-muted flex items-center justify-center">
                    {ok ? (
                      <img
                        src={publicUrl(a.storage_path)}
                        alt="Album invité"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-muted-foreground gap-1 p-3 text-center">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                        <span className="text-xs">Génération échouée</span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      {ok ? (
                        <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Succès
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> Échec
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-3 space-y-2 flex-1 flex flex-col">
                    <div className="text-xs text-muted-foreground">
                      {new Date(a.generated_at).toLocaleString("fr-FR")} ·{" "}
                      {a.photos_count} photo{a.photos_count > 1 ? "s" : ""}
                    </div>

                    {!ok && a.error && (
                      <div
                        role="alert"
                        className="text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 p-2 break-words"
                      >
                        <span className="font-semibold">Erreur :</span> {a.error}
                      </div>
                    )}

                    {ok && (
                      <div className="flex gap-2 mt-auto pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => copyLink(a.storage_path)}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Lien
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" asChild>
                          <a
                            href={publicUrl(a.storage_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                          >
                            <Download className="h-3 w-3 mr-1" /> Voir
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

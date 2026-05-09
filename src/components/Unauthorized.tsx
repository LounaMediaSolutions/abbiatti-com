import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Unauthorized({
  message = "Vous n'avez pas l'autorisation d'accéder à cette page. Cette section est réservée aux Super Admins.",
}: {
  message?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-slate-200">
      <ShieldAlert className="h-12 w-12 text-destructive" />
      <h1 className="text-2xl font-semibold">Accès non autorisé</h1>
      <p className="max-w-md text-sm text-slate-400">{message}</p>
      <div className="flex gap-2">
        <Button asChild variant="secondary">
          <Link to="/">Retour à l'accueil</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/auth">Se connecter</Link>
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Building2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type PendingInvite = {
  pending_org_id: string;
  pending_role: string;
  org_name: string | null;
};

/**
 * Shows a banner to users with a pending invitation (super-admin invited them
 * to an organization). Accept → moves them into the org with the invited role.
 * Reject → clears the pending fields without joining.
 */
export const InvitationBanner = () => {
  const { user } = useAuth();
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) {
      setInvite(null);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("pending_org_id, pending_role, invitation_status")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.invitation_status !== "pending" || !profile.pending_org_id) {
      setInvite(null);
      return;
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.pending_org_id)
      .maybeSingle();

    setInvite({
      pending_org_id: profile.pending_org_id,
      pending_role: profile.pending_role ?? "member",
      org_name: org?.name ?? null,
    });
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  if (!invite) return null;

  const accept = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        org_id: invite.pending_org_id,
        role: invite.pending_role,
        pending_org_id: null,
        pending_role: null,
        invited_by: null,
        invitation_status: null,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Invitation accepted", description: `You joined ${invite.org_name ?? "the organization"}.` });
    setInvite(null);
    // Refresh so role-routing picks up the new org_id/role.
    window.location.reload();
  };

  const reject = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        pending_org_id: null,
        pending_role: null,
        invited_by: null,
        invitation_status: "rejected",
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Invitation rejected" });
    setInvite(null);
  };

  return (
    <Card className="mb-4 border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-secondary">
            You've been invited to join {invite.org_name ?? "an organization"}
          </p>
          <p className="text-sm text-muted-foreground">
            Role: <span className="font-medium">{invite.pending_role}</span>. Accept to start managing this organization, or reject if you weren't expecting this.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={reject} disabled={busy}>
            <X className="mr-1 h-4 w-4" /> Reject
          </Button>
          <Button size="sm" onClick={accept} disabled={busy}>
            <Check className="mr-1 h-4 w-4" /> Accept
          </Button>
        </div>
      </div>
    </Card>
  );
};

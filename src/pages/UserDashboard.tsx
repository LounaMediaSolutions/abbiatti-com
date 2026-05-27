import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminAccessRequest = {
  id: string;
  user_id: string;
  requested_org_name: string;
  requested_org_country: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

const requestSchema = z.object({
  orgName: z.string().trim().min(2).max(100),
  country: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

const UserDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<AdminAccessRequest | null>(null);
  const [orgName, setOrgName] = useState("");
  const [country, setCountry] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setLoading(false);
        setRequest(null);
        return;
      }
      // Get the latest request — pending wins, otherwise show the most recent
      // decided one so the user sees their rejection note.
      const { data, error } = await supabase
        .from("admin_access_requests")
        .select(
          "id, user_id, requested_org_name, requested_org_country, note, status, decision_note, decided_at, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("[UserDashboard] load error:", error);
        toast.error(error.message);
      }
      setRequest((data as AdminAccessRequest | null) ?? null);
      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = requestSchema.safeParse({ orgName, country, note });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("admin_access_requests")
        .insert({
          user_id: user.id,
          requested_org_name: parsed.data.orgName,
          requested_org_country: parsed.data.country || null,
          note: parsed.data.note || null,
          status: "pending",
        })
        .select(
          "id, user_id, requested_org_name, requested_org_country, note, status, decision_note, decided_at, created_at",
        )
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setRequest(data as AdminAccessRequest);
      setOrgName("");
      setCountry("");
      setNote("");
      toast.success(
        t("user.requestSubmitted", {
          defaultValue: "Request submitted — we'll notify you once reviewed.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showForm = !request || request.status === "rejected";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("user.eyebrow", { defaultValue: "Account" })}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-secondary">
          {t("user.title", { defaultValue: "Welcome to Escapar" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("user.subtitle", {
            defaultValue:
              "Your account is ready. Request admin access to start managing properties.",
          })}
        </p>
      </div>

      {/* Pending state */}
      {request?.status === "pending" && (
        <Card className="p-6 border border-amber-200 bg-amber-50/60 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="font-semibold text-secondary">
                  {t("user.pendingTitle", {
                    defaultValue: "Request pending review",
                  })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("user.pendingBody", {
                    defaultValue:
                      "A super-admin will review your request shortly. You'll get the admin workspace as soon as it's approved.",
                  })}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-white/70 border border-amber-100 p-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("user.requestedOrg", { defaultValue: "Organization" })}
                  </p>
                  <p className="text-sm font-medium text-secondary mt-0.5">
                    {request.requested_org_name}
                  </p>
                </div>
                {request.requested_org_country && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("user.country", { defaultValue: "Country" })}
                    </p>
                    <p className="text-sm font-medium text-secondary mt-0.5">
                      {request.requested_org_country}
                    </p>
                  </div>
                )}
                {request.note && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("user.note", { defaultValue: "Note" })}
                    </p>
                    <p className="text-sm text-secondary mt-0.5">
                      {request.note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Rejected state — surfaces decision note + re-request form below */}
      {request?.status === "rejected" && (
        <Card className="p-6 border border-rose-200 bg-rose-50/60 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <XCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1 space-y-2">
              <h2 className="font-semibold text-secondary">
                {t("user.rejectedTitle", { defaultValue: "Request not approved" })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("user.rejectedBody", {
                  defaultValue:
                    "Your previous request was reviewed and not approved. You can submit a new request below.",
                })}
              </p>
              {request.decision_note && (
                <div className="rounded-lg bg-white/70 border border-rose-100 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("user.reviewerNote", { defaultValue: "Reviewer note" })}
                  </p>
                  <p className="text-sm text-secondary mt-0.5">
                    {request.decision_note}
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Approved state — should not normally render here (role flips to admin
          and routing pushes them to /admin/dashboard), but we surface a nice
          confirmation just in case there's a stale tab. */}
      {request?.status === "approved" && (
        <Card className="p-6 border border-emerald-200 bg-emerald-50/60 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1 space-y-1">
              <h2 className="font-semibold text-secondary">
                {t("user.approvedTitle", { defaultValue: "Access approved" })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("user.approvedBody", {
                  defaultValue:
                    "Your admin workspace is ready. Reload the page to continue.",
                })}
              </p>
              <Button
                onClick={() => window.location.reload()}
                size="sm"
                className="mt-2 cursor-pointer"
              >
                {t("user.refresh", { defaultValue: "Reload" })}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Request form — shown when no request OR previous was rejected */}
      {showForm && (
        <Card className="p-6 border border-border/60 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-secondary">
                {t("user.formTitle", { defaultValue: "Request admin access" })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("user.formBody", {
                  defaultValue:
                    "Tell us the name of the organization you want to manage. A super-admin will review.",
                })}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgName" className="text-sm font-medium">
                {t("user.orgNameLabel", { defaultValue: "Organization name" })}
                <span className="text-rose-500 ml-0.5" aria-hidden="true">
                  *
                </span>
              </Label>
              <div className="relative">
                <Building2
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="orgName"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder={t("user.orgNamePlaceholder", {
                    defaultValue: "Acme Vacation Rentals",
                  })}
                  className="h-11 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="country" className="text-sm font-medium">
                {t("user.countryLabel", {
                  defaultValue: "Country (optional)",
                })}
              </Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={t("user.countryPlaceholder", {
                  defaultValue: "France",
                })}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-sm font-medium">
                {t("user.noteLabel", {
                  defaultValue: "Anything else? (optional)",
                })}
              </Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("user.notePlaceholder", {
                  defaultValue:
                    "How many properties do you manage? Anything we should know?",
                })}
                maxLength={500}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">{note.length}/500</p>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className={cn(
                "w-full sm:w-auto h-11 text-sm font-semibold cursor-pointer",
                "transition-all duration-200",
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.submitting", { defaultValue: "Submitting…" })}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {t("user.submitRequest", {
                    defaultValue: "Send request",
                  })}
                </>
              )}
            </Button>
          </form>
        </Card>
      )}

      {/* Value props — only shown when no submission yet (pending state already
          carries enough context, rejected gets straight to the new form). */}
      {!request && (
        <Card className="p-6 border border-border/60 shadow-sm bg-muted/30">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-secondary">
                {t("user.whatYouGet", {
                  defaultValue: "What you get as an admin",
                })}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("user.whatYouGetBody", {
                  defaultValue:
                    "A full workspace to manage properties, bookings, your team, and guests — all in one place.",
                })}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default UserDashboard;

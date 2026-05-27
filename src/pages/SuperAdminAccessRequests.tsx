import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  MailIcon,
  MapPin,
  ShieldCheck,
  UserCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RequestRow = {
  id: string;
  user_id: string;
  requested_org_name: string;
  requested_org_country: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type Tab = "pending" | "decided";

const SuperAdminAccessRequests = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [tab, setTab] = useState<Tab>("pending");

  // Decision dialog state.
  const [dialogMode, setDialogMode] = useState<"approve" | "reject" | null>(
    null,
  );
  const [activeRequest, setActiveRequest] = useState<RequestRow | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_access_requests")
      .select(
        "id, user_id, requested_org_name, requested_org_country, note, status, decided_at, decision_note, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as RequestRow[];
    setRequests(rows);

    // Bulk-fetch the requesters' profiles (small N — one row per request).
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      const map: Record<string, ProfileLite> = {};
      ((profileRows ?? []) as ProfileLite[]).forEach((p) => {
        map[p.id] = p;
      });
      setProfiles(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );
  const decided = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  );

  const openApprove = (req: RequestRow) => {
    setActiveRequest(req);
    setDialogMode("approve");
    setDecisionNote("");
  };
  const openReject = (req: RequestRow) => {
    setActiveRequest(req);
    setDialogMode("reject");
    setDecisionNote("");
  };
  const closeDialog = () => {
    if (submitting) return;
    setDialogMode(null);
    setActiveRequest(null);
    setDecisionNote("");
  };

  const handleApprove = async () => {
    if (!activeRequest) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("approve_admin_access_request", {
        request_id: activeRequest.id,
        decision_note: decisionNote.trim() || null,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(
        t("superAdmin.accessRequests.approveSuccess", {
          defaultValue: "Request approved — org created and user promoted.",
        }),
      );
      closeDialog();
      fetchRequests();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!activeRequest) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("reject_admin_access_request", {
        request_id: activeRequest.id,
        decision_note: decisionNote.trim() || null,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(
        t("superAdmin.accessRequests.rejectSuccess", {
          defaultValue: "Request rejected.",
        }),
      );
      closeDialog();
      fetchRequests();
    } finally {
      setSubmitting(false);
    }
  };

  const visible = tab === "pending" ? pending : decided;
  const requester = activeRequest ? profiles[activeRequest.user_id] : null;
  const requesterLabel =
    requester?.full_name?.trim() || requester?.email || activeRequest?.user_id;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("superAdmin.accessRequests.eyebrow", { defaultValue: "Super-admin" })}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-secondary">
            {t("superAdmin.accessRequests.title", {
              defaultValue: "Admin access requests",
            })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("superAdmin.accessRequests.subtitle", {
              defaultValue:
                "Review users requesting admin access. Approving creates their organization and promotes them.",
            })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-1">
        {(
          [
            {
              key: "pending" as const,
              label: t("superAdmin.accessRequests.tabPending", {
                defaultValue: "Pending",
              }),
              count: pending.length,
            },
            {
              key: "decided" as const,
              label: t("superAdmin.accessRequests.tabDecided", {
                defaultValue: "Decided",
              }),
              count: decided.length,
            },
          ]
        ).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer",
              "transition-colors duration-200",
              tab === key
                ? "bg-card text-secondary shadow-sm"
                : "text-muted-foreground hover:text-secondary",
            )}
          >
            {label}
            <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-muted/30 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-secondary">
            {tab === "pending"
              ? t("superAdmin.accessRequests.emptyPending", {
                  defaultValue: "No pending requests",
                })
              : t("superAdmin.accessRequests.emptyDecided", {
                  defaultValue: "No decisions yet",
                })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "pending"
              ? t("superAdmin.accessRequests.emptyPendingBody", {
                  defaultValue: "New requests will appear here.",
                })
              : t("superAdmin.accessRequests.emptyDecidedBody", {
                  defaultValue: "Approved and rejected requests show up here.",
                })}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((req) => {
            const profile = profiles[req.user_id];
            const displayName =
              profile?.full_name?.trim() || profile?.email || req.user_id;
            return (
              <Card
                key={req.id}
                className="p-5 border border-border/60 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Requester header */}
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <UserCircle2 className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-secondary truncate">
                          {displayName}
                        </p>
                        {profile?.email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MailIcon className="h-3 w-3" aria-hidden="true" />
                            <span className="truncate">{profile.email}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Request details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-muted/40 border border-border/40 p-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" aria-hidden="true" />
                          {t("superAdmin.accessRequests.org", {
                            defaultValue: "Organization",
                          })}
                        </p>
                        <p className="text-sm font-medium text-secondary mt-0.5">
                          {req.requested_org_name}
                        </p>
                      </div>
                      {req.requested_org_country && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {t("superAdmin.accessRequests.country", {
                              defaultValue: "Country",
                            })}
                          </p>
                          <p className="text-sm font-medium text-secondary mt-0.5">
                            {req.requested_org_country}
                          </p>
                        </div>
                      )}
                      {req.note && (
                        <div className="sm:col-span-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t("superAdmin.accessRequests.note", {
                              defaultValue: "Note from user",
                            })}
                          </p>
                          <p className="text-sm text-secondary mt-0.5">
                            {req.note}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status pill */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <StatusPill status={req.status} t={t} />
                      <span>
                        {t("superAdmin.accessRequests.submittedAt", {
                          defaultValue: "Submitted",
                        })}
                        :{" "}
                        {new Date(req.created_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      {req.decided_at && (
                        <span>
                          {t("superAdmin.accessRequests.decidedAt", {
                            defaultValue: "Decided",
                          })}
                          :{" "}
                          {new Date(req.decided_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>

                    {req.decision_note && (
                      <p className="text-xs text-muted-foreground italic">
                        {t("superAdmin.accessRequests.reviewerNote", {
                          defaultValue: "Reviewer note",
                        })}
                        : {req.decision_note}
                      </p>
                    )}
                  </div>

                  {/* Actions — only for pending requests */}
                  {req.status === "pending" && (
                    <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => openApprove(req)}
                        className="cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        {t("superAdmin.accessRequests.approve", {
                          defaultValue: "Approve",
                        })}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReject(req)}
                        className="cursor-pointer"
                      >
                        <XCircle className="h-4 w-4 mr-1.5" />
                        {t("superAdmin.accessRequests.reject", {
                          defaultValue: "Reject",
                        })}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Decision dialog */}
      <AlertDialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {dialogMode === "approve" ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  {t("superAdmin.accessRequests.approveTitle", {
                    defaultValue: "Approve admin access?",
                  })}
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-rose-600" />
                  {t("superAdmin.accessRequests.rejectTitle", {
                    defaultValue: "Reject this request?",
                  })}
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {dialogMode === "approve" ? (
                  <>
                    <p>
                      {t("superAdmin.accessRequests.approveBody", {
                        defaultValue:
                          "This will create the organization and promote the user to admin.",
                      })}
                    </p>
                    <p>
                      <span className="font-medium text-secondary">
                        {requesterLabel}
                      </span>
                      {" → "}
                      <span className="font-medium text-secondary">
                        {activeRequest?.requested_org_name}
                      </span>
                    </p>
                  </>
                ) : (
                  <p>
                    {t("superAdmin.accessRequests.rejectBody", {
                      defaultValue:
                        "The user will see your note and may submit a new request.",
                    })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="decisionNote" className="text-sm font-medium">
              {dialogMode === "approve"
                ? t("superAdmin.accessRequests.noteOptional", {
                    defaultValue: "Note (optional)",
                  })
                : t("superAdmin.accessRequests.noteRecommended", {
                    defaultValue: "Reason (recommended)",
                  })}
            </Label>
            <Textarea
              id="decisionNote"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={
                dialogMode === "approve"
                  ? t("superAdmin.accessRequests.notePlaceholderApprove", {
                      defaultValue: "Welcome aboard!",
                    })
                  : t("superAdmin.accessRequests.notePlaceholderReject", {
                      defaultValue:
                        "Let the user know what was missing or unclear.",
                    })
              }
              className="resize-none"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting} className="cursor-pointer">
              {t("common.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault();
                if (dialogMode === "approve") void handleApprove();
                else void handleReject();
              }}
              className={cn(
                "cursor-pointer",
                dialogMode === "reject" &&
                  "bg-rose-600 hover:bg-rose-600/90 focus:ring-rose-600/40",
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.processing", { defaultValue: "Processing…" })}
                </>
              ) : dialogMode === "approve" ? (
                t("superAdmin.accessRequests.confirmApprove", {
                  defaultValue: "Approve & create org",
                })
              ) : (
                t("superAdmin.accessRequests.confirmReject", {
                  defaultValue: "Reject request",
                })
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const StatusPill = ({
  status,
  t,
}: {
  status: RequestRow["status"];
  t: (key: string, opts?: { defaultValue?: string }) => string;
}) => {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {t("superAdmin.accessRequests.statusPending", {
          defaultValue: "Pending",
        })}
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {t("superAdmin.accessRequests.statusApproved", {
          defaultValue: "Approved",
        })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
      <XCircle className="h-3 w-3" aria-hidden="true" />
      {t("superAdmin.accessRequests.statusRejected", {
        defaultValue: "Rejected",
      })}
    </span>
  );
};

export default SuperAdminAccessRequests;

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { UserPlus, Trash2, Users as UsersIcon, Copy, Home } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Unauthorized } from "@/components/Unauthorized";
import { isAuthzError } from "@/lib/authzError";
import { CohostKpisInline } from "@/components/CohostKpisInline";

type Role = "super_admin" | "admin" | "co_admin" | "cohost" | "cleaner" | "driver" | "decorator" | "maintenance" | "staff";

const ROLE_EMOJI: Record<string, string> = {
  super_admin: "⭐", admin: "👑", co_admin: "🛡️", cohost: "🏠", cleaner: "🧹", driver: "🚗", decorator: "🎨", maintenance: "🔧", staff: "👤",
};

interface Property {
  id: string;
  name: string;
  submitted_by?: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role?: string | null;
}

interface PropertyAssignment {
  id: string;
  user_id: string;
  property_id: string;
  role: Role;
  source: "property_cohosts" | "property_members";
}

interface GroupedEmployee {
  userId: string;
  propertyIds: string[];
  assignments: PropertyAssignment[];
}

interface GroupedCohost {
  userId: string;
  propertyIds: string[];
  propertyAssignments: PropertyAssignment[];
  employees: GroupedEmployee[];
}

interface AdminHierarchy {
  userId: string;
  propertyIds: string[];
  cohosts: GroupedCohost[];
}

const STAFF_ROLES: Role[] = ["cleaner", "driver", "decorator", "maintenance", "staff"];

export default function Team() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [myRoles, setMyRoles] = useState<Role[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [orgRoles, setOrgRoles] = useState<{ user_id: string; role: Role }[]>([]);
  const [propMembers, setPropMembers] = useState<PropertyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [denied, setDenied] = useState(false);
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);

  const [fEmail, setFEmail] = useState("");
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fRole, setFRole] = useState<Role>("cleaner");
  const [fProps, setFProps] = useState<string[]>([]);
  const [fPwd, setFPwd] = useState(generatePwd());

  const isAdmin = myRoles.includes("admin");
  const isSuperAdmin = myRoles.includes("super_admin");
  const isCoAdmin = myRoles.includes("co_admin");
  const isCohost = myRoles.includes("cohost");
  const isAdminLike = isSuperAdmin || isAdmin || isCoAdmin;
  const myCohostPropIds = propMembers
    .filter((member) => member.user_id === user?.id && member.role === "cohost")
    .map((member) => member.property_id);

  const availableRoles: Role[] = isSuperAdmin
    ? ["admin", "co_admin", "cohost", "cleaner", "driver", "decorator", "maintenance"]
    : isAdmin
    ? ["co_admin", "cohost", "cleaner", "driver", "decorator", "maintenance"]
    : isCoAdmin
    ? ["cohost", "cleaner", "driver", "decorator", "maintenance"]
    : ["cleaner", "driver", "decorator", "maintenance"];

  const editableRoles: Role[] = isSuperAdmin
    ? ["super_admin", "admin", "co_admin", "cohost", "cleaner", "driver", "decorator", "maintenance", "staff"]
    : isAdmin
    ? ["co_admin", "cohost", "cleaner", "driver", "decorator", "maintenance", "staff"]
    : isCoAdmin
    ? ["cohost", "cleaner", "driver", "decorator", "maintenance", "staff"]
    : [];

  const visibleProps = isAdminLike ? properties : properties.filter((property) => myCohostPropIds.includes(property.id));

  async function loadAll() {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, org_id, pending_org_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile?.role ?? null) as Role | null;
    setMyRoles(role ? [role] : []);

    const isSuper = role === "super_admin";
    const isAdminLikeRole = role === "admin" || role === "super_admin" || role === "co_admin";
    // The admin's effective organization. `org_id` is the real org; fall back
    // to `pending_org_id` while their org membership is still being set up so
    // the team list isn't blank for freshly-invited admins.
    const myOrgId =
      (profile?.org_id as string | null) ??
      ((profile as { pending_org_id?: string | null })?.pending_org_id ?? null);

    let scopedProperties: Property[] = [];
    if (isSuper) {
      const { data } = await supabase.from("properties").select("id,name,submitted_by").order("name");
      scopedProperties = (data ?? []) as Property[];
    } else if (role === "admin" || role === "co_admin") {
      // Admins manage the whole organization, so the Team page covers every
      // property in the org (not only ones this admin personally created).
      const { data } = myOrgId
        ? await supabase
            .from("properties")
            .select("id,name,submitted_by")
            .eq("org_id", myOrgId)
            .order("name")
        : { data: [] as Property[] };
      scopedProperties = (data ?? []) as Property[];
    } else {
      const { data: cohosted } = await supabase
        .from("property_cohosts")
        .select("property_id")
        .eq("user_id", user.id);
      const propIds = (cohosted ?? []).map((item) => item.property_id);
      if (propIds.length > 0) {
        const { data } = await supabase.from("properties").select("id,name,submitted_by").in("id", propIds).order("name");
        scopedProperties = (data ?? []) as Property[];
      }
    }

    setProperties(scopedProperties);

    const propertyIds = scopedProperties.map((property) => property.id);

    let nextAssignments: PropertyAssignment[] = [];
    if (propertyIds.length > 0) {
      const cohostAssignments = isAdminLikeRole
        ? await supabase
            .from("property_cohosts")
            .select("property_id, user_id")
            .in("property_id", propertyIds)
        : { data: [] as any[] };

      const staffAssignments = await supabase
        .from("property_members")
        .select("id, property_id, user_id, role")
        .in("property_id", propertyIds)
        .in("role", STAFF_ROLES as any);

      nextAssignments = [
        ...((cohostAssignments.data ?? []).map((assignment: any) => ({
          id: `${assignment.property_id}_${assignment.user_id}`,
          user_id: assignment.user_id,
          property_id: assignment.property_id,
          role: "cohost" as Role,
          source: "property_cohosts" as const,
        }))),
        ...((staffAssignments.data ?? []).map((assignment: any) => ({
          id: assignment.id,
          user_id: assignment.user_id,
          property_id: assignment.property_id,
          role: assignment.role as Role,
          source: "property_members" as const,
        }))),
      ];
    }
    setPropMembers(nextAssignments);

    const profileMap: Record<string, Profile> = {};
    const nextOrgRoles: { user_id: string; role: Role }[] = [];

    if (isSuper) {
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id,full_name,phone,avatar_url,role");

      (allProfiles ?? [])
        .filter((item: any) => item.role && item.role !== "guest")
        .forEach((item: any) => {
          profileMap[item.id] = item as Profile;
          nextOrgRoles.push({
            user_id: item.id,
            role: item.role as Role,
          });
        });
    } else if (role === "admin" || role === "co_admin") {
      // Admins see EVERY member of their organization — admins, cohosts and
      // employees (cleaner / driver / decorator / maintenance / staff) — read
      // straight from `profiles` by org. Previously the list was derived from
      // property assignments only, so an employee with no property assignment
      // (e.g. a newly created cleaner) never showed up. RLS already limits
      // these rows to the caller's own org.
      const { data: orgProfiles } = myOrgId
        ? await supabase
            .from("profiles")
            .select("id,full_name,phone,avatar_url,role")
            .eq("org_id", myOrgId)
        : { data: [] as any[] };

      (orgProfiles ?? [])
        .filter((item: any) => item.role && item.role !== "guest")
        .forEach((item: any) => {
          profileMap[item.id] = item as Profile;
          nextOrgRoles.push({
            user_id: item.id,
            role: item.role as Role,
          });
        });
    } else {
      const relevantUserIds = Array.from(new Set(nextAssignments.map((assignment) => assignment.user_id)));
      if (relevantUserIds.length === 0) {
        setProfiles({});
        setOrgRoles([]);
        setLoading(false);
        return;
      }

      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name,phone,avatar_url,role")
        .in("id", relevantUserIds);

      const derivedRoleMap = new Map<string, Role>();
      nextAssignments.forEach((assignment) => {
        if (!derivedRoleMap.has(assignment.user_id)) {
          derivedRoleMap.set(assignment.user_id, assignment.role);
        }
      });

      (profs ?? []).forEach((item: any) => {
        profileMap[item.id] = item as Profile;
        nextOrgRoles.push({
          user_id: item.id,
          role: ((item.role as Role | null) ?? derivedRoleMap.get(item.id) ?? "staff") as Role,
        });
      });
    }

    setProfiles(profileMap);
    setOrgRoles(nextOrgRoles);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [user?.id]);

  async function handleCreate() {
    if (!fEmail) { toast.error(t("team.fillRequired")); return; }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("create-team-member", {
      body: {
        email: fEmail,
        // Only sent when present — the edge function attaches existing users
        // to the org without resetting their password.
        password: fPwd.trim() ? fPwd : undefined,
        full_name: fName, phone: fPhone,
        role: fRole, property_ids: fProps,
      },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      if (await isAuthzError(error, data)) {
        setOpen(false);
        setDenied(true);
        return;
      }
      toast.error((data as any)?.error ?? error?.message ?? t("common.error"));
      return;
    }
    const reusedExisting = (data as { existing_user?: boolean } | null)?.existing_user;
    toast.success(reusedExisting ? `${fEmail} (existing user) added to the team` : t("team.created"));
    setCreatedCreds(reusedExisting ? null : { email: fEmail, password: fPwd });
    setFEmail("");
    setFName("");
    setFPhone("");
    setFProps([]);
    setFPwd(generatePwd());
    await loadAll();
  }

  async function removeAssignment(id: string) {
    if (!confirm(t("team.removeConfirm"))) return;
    const assignment = propMembers.find((item) => item.id === id);
    if (!assignment) return;

    const query = assignment.source === "property_members"
      ? supabase.from("property_members").delete().eq("id", assignment.id)
      : supabase.from("property_cohosts").delete().eq("property_id", assignment.property_id).eq("user_id", assignment.user_id);

    const { error } = await query;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("team.removed"));
    loadAll();
  }

  async function updateMemberRole(userId: string, nextRole: Role) {
    setRoleUpdatingUserId(userId);
    try {
      const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", userId);
      if (error) throw error;

      const cleanupTasks = [];
      if (nextRole !== "cohost") {
        cleanupTasks.push(
          supabase.from("property_cohosts").delete().eq("user_id", userId),
        );
      }
      if (nextRole === "cohost") {
        cleanupTasks.push(
          supabase.from("property_members").delete().eq("user_id", userId).in("role", STAFF_ROLES as any),
        );
      } else {
        cleanupTasks.push(
          supabase.from("property_members").delete().eq("user_id", userId),
        );
      }

      const results = await Promise.all(cleanupTasks);
      const cleanupError = results.find((result) => result.error)?.error;
      if (cleanupError) throw cleanupError;

      setOrgRoles((current) => {
        const next = current.filter((entry) => entry.user_id !== userId);
        next.push({ user_id: userId, role: nextRole });
        return next;
      });
      toast.success(t("common.save"));
      await loadAll();
    } catch (error: any) {
      toast.error(error.message ?? t("common.error"));
    } finally {
      setRoleUpdatingUserId(null);
    }
  }

  if (denied) {
    return <Unauthorized message="Cette action requiert un rôle Admin ou Co-hôte. Votre session ne dispose pas des droits requis." />;
  }

  const members = orgRoles.reduce<Record<string, Role[]>>((acc, roleEntry) => {
    if (roleEntry.role === "admin" && roleEntry.user_id === user?.id) return acc;
    (acc[roleEntry.user_id] ||= []).push(roleEntry.role);
    return acc;
  }, {});
  const sectionTitle = isSuperAdmin ? t("team.titleAdmins") : t("team.titleCohosts");
  const sectionSubtitle = isSuperAdmin
    ? t("team.subtitleAdmins")
    : isAdminLike
      ? t("team.subtitleCohosts")
      : t("team.subtitle");
  const updateAvatar = (uid: string, url: string) => {
    setProfiles((current) => ({
      ...current,
      [uid]: {
        ...(current[uid] ?? { id: uid, full_name: null, phone: null, avatar_url: null }),
        avatar_url: url,
      },
    }));
  };

  if (loading) return <div className="p-6">{t("common.loading")}</div>;

  if (isSuperAdmin) {
    return <Navigate to="/super-admin/profiles" replace />;
  }

  if (!isAdminLike && !isCohost) {
    return <div className="p-6 text-muted-foreground">{t("team.noAccess")}</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UsersIcon className="h-6 w-6" /> {sectionTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{sectionSubtitle}</p>
        </div>
        <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setCreatedCreds(null); }}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> {t("team.add")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("team.add")}</DialogTitle>
            </DialogHeader>
            {createdCreds ? (
              <div className="space-y-3">
                <p className="text-sm">{t("team.shareCreds")}</p>
                <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span><strong>{t("auth.email")}:</strong> {createdCreds.email}</span>
                    <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(createdCreds.email)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span><strong>{t("auth.password")}:</strong> {createdCreds.password}</span>
                    <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(createdCreds.password)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => { setCreatedCreds(null); setOpen(false); }}>{t("common.save")}</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>{t("team.role")}</Label>
                  <Select value={fRole} onValueChange={(value) => setFRole(value as Role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>{t(`team.roles.${role}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("auth.fullName")}</Label>
                  <Input value={fName} onChange={(e) => setFName(e.target.value)} />
                </div>
                <div>
                  <Label>{t("auth.email")} *</Label>
                  <Input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
                </div>
                <div>
                  <Label>{t("auth.phone")}</Label>
                  <Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
                </div>
                <div>
                  <Label>{t("team.tempPassword")}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={fPwd}
                      onChange={(e) => setFPwd(e.target.value)}
                      placeholder="Leave blank if user already has an account"
                    />
                    <Button type="button" variant="outline" onClick={() => setFPwd(generatePwd())}>↻</Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("team.pwdHint")}</p>
                </div>
                {fRole !== "admin" && fRole !== "co_admin" && (
                  <div>
                    <Label>{t("team.assignProperties")}</Label>
                    <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                      {visibleProps.length === 0 && (
                        <p className="p-1 text-xs text-muted-foreground">{t("team.noProps")}</p>
                      )}
                      {visibleProps.map((property) => (
                        <label key={property.id} className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-accent">
                          <Checkbox
                            checked={fProps.includes(property.id)}
                            onCheckedChange={(checked) =>
                              setFProps(checked ? [...fProps, property.id] : fProps.filter((id) => id !== property.id))
                            }
                          />
                          {property.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
                  <Button onClick={handleCreate} disabled={submitting}>
                    {submitting ? t("common.loading") : t("common.save")}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {isAdminLike ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("team.roleManagement")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(members).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("team.empty")}</p>
              )}
              {Object.entries(members).map(([uid, roles]) => {
                const profile = profiles[uid];
                const currentRole = roles[0] ?? "staff";
                const assignments = propMembers.filter((member) => member.user_id === uid);

                return (
                  <div key={uid} className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <AvatarUpload
                          userId={uid}
                          currentUrl={profile?.avatar_url}
                          fallbackEmoji={ROLE_EMOJI[currentRole] ?? "👤"}
                          size="md"
                          onUploaded={(url) => updateAvatar(uid, url)}
                        />
                        <div>
                          <div className="font-medium">{profile?.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{profile?.phone || "—"}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={currentRole === "admin" || currentRole === "super_admin" ? "default" : currentRole === "cohost" ? "secondary" : "outline"}>
                          {t(`team.roles.${currentRole}`)}
                        </Badge>
                        {editableRoles.length > 0 && uid !== user?.id && (
                          <Select
                            value={currentRole}
                            onValueChange={(value) => updateMemberRole(uid, value as Role)}
                            disabled={roleUpdatingUserId === uid}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editableRoles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {t(`team.roles.${role}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                    {assignments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {assignments.map((assignment) => {
                          const property = properties.find((item) => item.id === assignment.property_id);
                          return (
                            <Badge key={assignment.id} variant="outline">
                              {property?.name ?? "?"} · {t(`team.roles.${assignment.role}`)}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <AdminGroupedView
            mode={isSuperAdmin ? "super_admin" : "admin"}
            properties={properties}
            profiles={profiles}
            orgRoles={orgRoles}
            propMembers={propMembers}
            onRemoveAssignment={removeAssignment}
            setProfiles={setProfiles}
            t={t}
          />
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle>{t("team.members")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(members).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("team.empty")}</p>
            )}
            {Object.entries(members).map(([uid, roles]) => {
              const profile = profiles[uid];
              const assignments = propMembers.filter((member) => member.user_id === uid);
              const primaryRole = roles[0] ?? "staff";
              return (
                <div key={uid} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AvatarUpload
                        userId={uid}
                        currentUrl={profile?.avatar_url}
                        fallbackEmoji={ROLE_EMOJI[primaryRole] ?? "👤"}
                        size="md"
                        onUploaded={(url) => updateAvatar(uid, url)}
                      />
                      <div>
                        <div className="font-medium">{profile?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{profile?.phone}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {roles.map((role) => (
                        <Badge key={role} variant={role === "cohost" ? "secondary" : "outline"}>
                          {t(`team.roles.${role}`)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {assignments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {assignments.map((assignment) => {
                        const property = properties.find((item) => item.id === assignment.property_id);
                        const canRemove = isCohost && myCohostPropIds.includes(assignment.property_id) && STAFF_ROLES.includes(assignment.role);
                        return (
                          <span key={assignment.id} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs">
                            {property?.name ?? "?"} · {t(`team.roles.${assignment.role}`)}
                            {canRemove && (
                              <button onClick={() => removeAssignment(assignment.id)} className="hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface GroupedProps {
  mode: "super_admin" | "admin";
  properties: Property[];
  profiles: Record<string, Profile>;
  orgRoles: { user_id: string; role: Role }[];
  propMembers: PropertyAssignment[];
  onRemoveAssignment: (id: string) => void;
  setProfiles: React.Dispatch<React.SetStateAction<Record<string, Profile>>>;
  t: (key: string) => string;
}

function AdminGroupedView({
  mode,
  properties,
  profiles,
  orgRoles,
  propMembers,
  onRemoveAssignment,
  setProfiles,
  t,
}: GroupedProps) {
  const propertyMap = new Map(properties.map((property) => [property.id, property]));
  const cohostAssignments = propMembers.filter((member) => member.role === "cohost");
  const updateAvatar = (uid: string, url: string) => {
    setProfiles((current) => ({
      ...current,
      [uid]: {
        ...(current[uid] ?? { id: uid, full_name: null, phone: null, avatar_url: null }),
        avatar_url: url,
      },
    }));
  };

  const buildEmployees = (propertyIds: string[]) => {
    const grouped = new Map<string, GroupedEmployee>();

    propMembers
      .filter((member) => STAFF_ROLES.includes(member.role) && propertyIds.includes(member.property_id))
      .forEach((member) => {
        const current = grouped.get(member.user_id);
        if (current) {
          current.assignments.push(member);
          current.propertyIds = Array.from(new Set([...current.propertyIds, member.property_id]));
          return;
        }

        grouped.set(member.user_id, {
          userId: member.user_id,
          propertyIds: [member.property_id],
          assignments: [member],
        });
      });

    return Array.from(grouped.values()).sort((left, right) =>
      (profiles[left.userId]?.full_name ?? "").localeCompare(profiles[right.userId]?.full_name ?? ""),
    );
  };

  const buildCohostGroups = (propertyIds: string[]) => {
    const grouped = new Map<string, GroupedCohost>();

    cohostAssignments
      .filter((assignment) => propertyIds.includes(assignment.property_id))
      .forEach((assignment) => {
        const current = grouped.get(assignment.user_id);
        if (current) {
          current.propertyAssignments.push(assignment);
          current.propertyIds = Array.from(new Set([...current.propertyIds, assignment.property_id]));
          return;
        }

        grouped.set(assignment.user_id, {
          userId: assignment.user_id,
          propertyIds: [assignment.property_id],
          propertyAssignments: [assignment],
          employees: [],
        });
      });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        employees: buildEmployees(group.propertyIds),
      }))
      .sort((left, right) =>
        (profiles[left.userId]?.full_name ?? "").localeCompare(profiles[right.userId]?.full_name ?? ""),
      );
  };

  const adminGroups: AdminHierarchy[] = Array.from(
    new Set(orgRoles.filter((roleEntry) => roleEntry.role === "admin").map((roleEntry) => roleEntry.user_id)),
  )
    .map((adminId) => {
      const propertyIds = properties
        .filter((property) => property.submitted_by === adminId)
        .map((property) => property.id);

      return {
        userId: adminId,
        propertyIds,
        cohosts: buildCohostGroups(propertyIds),
      };
    })
    .sort((left, right) =>
      (profiles[left.userId]?.full_name ?? "").localeCompare(profiles[right.userId]?.full_name ?? ""),
    );

  const adminCohosts = buildCohostGroups(properties.map((property) => property.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5" /> {t("team.hierarchy")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "super_admin" ? (
          adminGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("team.noAdmins")}</p>
          ) : (
            adminGroups.map((adminGroup) => (
              <AdminHierarchyCard
                key={adminGroup.userId}
                group={adminGroup}
                properties={properties}
                propertyMap={propertyMap}
                profiles={profiles}
                t={t}
                onRemoveAssignment={onRemoveAssignment}
                onAvatarUploaded={updateAvatar}
              />
            ))
          )
        ) : adminCohosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("team.noCohosts")}</p>
        ) : (
          adminCohosts.map((cohostGroup) => (
            <CohostHierarchyCard
              key={cohostGroup.userId}
              cohost={cohostGroup}
              propertyMap={propertyMap}
              profiles={profiles}
              t={t}
              onRemoveAssignment={onRemoveAssignment}
              onAvatarUploaded={updateAvatar}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface AdminHierarchyCardProps {
  group: AdminHierarchy;
  properties: Property[];
  propertyMap: Map<string, Property>;
  profiles: Record<string, Profile>;
  onAvatarUploaded: (uid: string, url: string) => void;
  onRemoveAssignment: (id: string) => void;
  t: (key: string) => string;
}

function AdminHierarchyCard({
  group,
  properties,
  propertyMap,
  profiles,
  onAvatarUploaded,
  onRemoveAssignment,
  t,
}: AdminHierarchyCardProps) {
  const profile = profiles[group.userId];
  const adminProperties = properties.filter((property) => property.submitted_by === group.userId);
  const employeeCount = group.cohosts.reduce((total, cohost) => total + cohost.employees.length, 0);

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AvatarUpload
            userId={group.userId}
            currentUrl={profile?.avatar_url}
            fallbackEmoji={ROLE_EMOJI.admin}
            size="md"
            onUploaded={(url) => onAvatarUploaded(group.userId, url)}
          />
          <div>
            <div className="font-semibold">{profile?.full_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{profile?.phone || "—"}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{t("team.roles.admin")}</Badge>
          <Badge variant="outline">{adminProperties.length} {t("nav.properties").toLowerCase()}</Badge>
          <Badge variant="outline">{group.cohosts.length} {t("team.titleCohosts").toLowerCase()}</Badge>
          <Badge variant="outline">{employeeCount} {t("team.employees").toLowerCase()}</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("team.portfolio")}
          </div>
          <div className="flex flex-wrap gap-2">
            {adminProperties.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t("team.noPropertiesLinked")}</span>
            ) : (
              adminProperties.map((property) => (
                <Badge key={property.id} variant="secondary">
                  {property.name}
                </Badge>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("team.titleCohosts")}
          </div>
          <div className="space-y-3">
            {group.cohosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("team.noCohosts")}</p>
            ) : (
              group.cohosts.map((cohost) => (
                <CohostHierarchyCard
                  key={`${group.userId}_${cohost.userId}`}
                  cohost={cohost}
                  propertyMap={propertyMap}
                  profiles={profiles}
                  t={t}
                  onRemoveAssignment={onRemoveAssignment}
                  onAvatarUploaded={onAvatarUploaded}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CohostHierarchyCardProps {
  cohost: GroupedCohost;
  propertyMap: Map<string, Property>;
  profiles: Record<string, Profile>;
  onAvatarUploaded: (uid: string, url: string) => void;
  onRemoveAssignment: (id: string) => void;
  t: (key: string) => string;
}

function CohostHierarchyCard({
  cohost,
  propertyMap,
  profiles,
  onAvatarUploaded,
  onRemoveAssignment,
  t,
}: CohostHierarchyCardProps) {
  const profile = profiles[cohost.userId];

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AvatarUpload
            userId={cohost.userId}
            currentUrl={profile?.avatar_url}
            fallbackEmoji={ROLE_EMOJI.cohost}
            size="md"
            onUploaded={(url) => onAvatarUploaded(cohost.userId, url)}
          />
          <div>
            <div className="font-medium">{profile?.full_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{profile?.phone || "—"}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{t("team.roles.cohost")}</Badge>
          <Badge variant="outline">{cohost.propertyIds.length} {t("nav.properties").toLowerCase()}</Badge>
          <Badge variant="outline">{cohost.employees.length} {t("team.employees").toLowerCase()}</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("team.linkedProperties")}
          </div>
          <div className="flex flex-wrap gap-2">
            {cohost.propertyAssignments.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t("team.noPropertiesLinked")}</span>
            ) : (
              cohost.propertyAssignments.map((assignment) => (
                <span
                  key={assignment.id}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs"
                >
                  <Home className="h-3 w-3" />
                  {propertyMap.get(assignment.property_id)?.name ?? "?"}
                  <button
                    onClick={() => onRemoveAssignment(assignment.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("team.removeConfirm")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("team.employees")}
          </div>
          {cohost.employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("team.noEmployees")}</p>
          ) : (
            <div className="space-y-2">
              {cohost.employees.map((employee) => (
                <EmployeeHierarchyRow
                  key={`${cohost.userId}_${employee.userId}`}
                  employee={employee}
                  propertyMap={propertyMap}
                  profile={profiles[employee.userId]}
                  onRemoveAssignment={onRemoveAssignment}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("team.performance")}
          </div>
          <CohostKpisInline cohostUserId={cohost.userId} propertyIds={cohost.propertyIds} />
        </div>
      </div>
    </div>
  );
}

interface EmployeeHierarchyRowProps {
  employee: GroupedEmployee;
  propertyMap: Map<string, Property>;
  profile: Profile | undefined;
  onRemoveAssignment: (id: string) => void;
  t: (key: string) => string;
}

function EmployeeHierarchyRow({
  employee,
  propertyMap,
  profile,
  onRemoveAssignment,
  t,
}: EmployeeHierarchyRowProps) {
  const roleBadges = Array.from(new Set(employee.assignments.map((assignment) => assignment.role)));

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{profile?.full_name || "—"}</div>
          <div className="text-xs text-muted-foreground">{profile?.phone || "—"}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {roleBadges.map((role) => (
            <Badge key={role} variant="outline">
              {t(`team.roles.${role}`)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {employee.assignments.map((assignment) => (
          <span
            key={assignment.id}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs"
          >
            {propertyMap.get(assignment.property_id)?.name ?? "?"} · {t(`team.roles.${assignment.role}`)}
            <button
              onClick={() => onRemoveAssignment(assignment.id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={t("team.removeConfirm")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function generatePwd() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let value = "";
  for (let index = 0; index < 10; index += 1) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}

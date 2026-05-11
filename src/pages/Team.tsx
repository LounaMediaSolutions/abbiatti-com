import { useEffect, useState } from "react";
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
import { UserPlus, Trash2, Users as UsersIcon, Copy, ChevronDown, ChevronRight, Home } from "lucide-react";
import { MagicLinkQR } from "@/components/MagicLinkQR";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Unauthorized } from "@/components/Unauthorized";
import { isAuthzError } from "@/lib/authzError";
import { CohostKpisInline } from "@/components/CohostKpisInline";

type Role = "admin" | "co_admin" | "cohost" | "cleaner" | "driver" | "decorator" | "maintenance";

const ROLE_EMOJI: Record<string, string> = {
  admin: "👑", co_admin: "🛡️", cohost: "🏠", cleaner: "🧹", driver: "🚗", decorator: "🎨", maintenance: "🔧", staff: "👤",
};

interface Property { id: string; name: string; }
interface Profile { id: string; full_name: string | null; phone: string | null; avatar_url: string | null; }
interface MemberRow {
  user_id: string;
  role: Role;
  property_id: string | null;
}

const STAFF_ROLES: Role[] = ["cleaner", "driver", "decorator", "maintenance"];

export default function Team() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [myRoles, setMyRoles] = useState<Role[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [orgRoles, setOrgRoles] = useState<{ user_id: string; role: Role }[]>([]);
  const [propMembers, setPropMembers] = useState<{ id: string; user_id: string; property_id: string; role: Role }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [denied, setDenied] = useState(false);
  const [expandedCohost, setExpandedCohost] = useState<string | null>(null);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  const [fEmail, setFEmail] = useState("");
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fRole, setFRole] = useState<Role>("cleaner");
  const [fProps, setFProps] = useState<string[]>([]);
  const [fPwd, setFPwd] = useState(generatePwd());

  const isAdmin = myRoles.includes("admin");
  const isCoAdmin = myRoles.includes("co_admin");
  const isCohost = myRoles.includes("cohost");
  const isAdminLike = isAdmin || isCoAdmin;
  const myCohostPropIds = propMembers.filter(m => m.user_id === user?.id && m.role === "cohost").map(m => m.property_id);

  const availableRoles: Role[] = isAdmin
    ? ["co_admin", "cohost", "cleaner", "driver", "decorator", "maintenance"]
    : isCoAdmin
    ? ["cohost", "cleaner", "driver", "decorator", "maintenance"]
    : ["cleaner", "driver", "decorator", "maintenance"];

  const visibleProps = isAdminLike ? properties : properties.filter(p => myCohostPropIds.includes(p.id));

  async function loadAll() {
    if (!user) return;
    setLoading(true);
    
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = profile?.role as Role;
    setMyRoles(role ? [role] : []);
    
    const isAdminLike = role === "admin" || role === "super_admin" || role === "co_admin";

    // Get properties
    let propsRes;
    if (isAdminLike) {
      propsRes = await supabase.from("properties").select("id,name").order("name");
    } else {
      const { data: cohosted } = await supabase.from("property_cohosts").select("property_id").eq("user_id", user.id);
      const propIds = (cohosted ?? []).map(c => c.property_id);
      if (propIds.length > 0) {
        propsRes = await supabase.from("properties").select("id,name").in("id", propIds).order("name");
      } else {
        propsRes = { data: [] };
      }
    }
    const myProps = propsRes?.data ?? [];
    setProperties(myProps);

    if (myProps.length === 0 && !isAdminLike) {
      setLoading(false);
      return;
    }

    const propIds = myProps.map(p => p.id);
    let pmRes: any = { data: [] };
    if (propIds.length > 0) {
      pmRes = await supabase.from("property_cohosts").select("property_id, user_id, permissions").in("property_id", propIds);
    }
    
    const mappedMembers = (pmRes.data ?? []).map((m: any) => ({
      id: `${m.property_id}_${m.user_id}`,
      user_id: m.user_id,
      property_id: m.property_id,
      role: (m.permissions?.includes("manage_properties") ? "cohost" : "staff") as Role
    }));
    setPropMembers(mappedMembers);

    const userIds = Array.from(new Set(mappedMembers.map((m: any) => m.user_id)));
    if (isAdminLike) {
      const { data: allProfs } = await supabase.from("profiles").select("id,full_name,phone,avatar_url,role");
      const map: Record<string, Profile> = {};
      const oRoles: { user_id: string; role: Role }[] = [];
      (allProfs ?? []).forEach((p: any) => { 
        map[p.id] = p as Profile; 
        oRoles.push({ user_id: p.id, role: (p.role || "staff") as Role });
      });
      setProfiles(map);
      setOrgRoles(oRoles);
    } else if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,phone,avatar_url,role").in("id", userIds);
      const map: Record<string, Profile> = {};
      const oRoles: { user_id: string; role: Role }[] = [];
      (profs ?? []).forEach((p: any) => { 
        map[p.id] = p as Profile;
        oRoles.push({ user_id: p.id, role: (p.role || "staff") as Role });
      });
      setProfiles(map);
      setOrgRoles(oRoles);
    }

    setLoading(false);
  }

  useEffect(() => { 
    loadAll(); 
  }, [user?.id]);

  async function handleCreate() {
    if (!fEmail || !fPwd) { toast.error(t("team.fillRequired")); return; }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("create-team-member", {
      body: {
        email: fEmail, password: fPwd, full_name: fName, phone: fPhone,
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
    toast.success(t("team.created"));
    setCreatedCreds({ email: fEmail, password: fPwd });
    setFEmail(""); setFName(""); setFPhone(""); setFProps([]); setFPwd(generatePwd());
    await loadAll();
  }

  async function removeAssignment(id: string) {
    if (!confirm(t("team.removeConfirm"))) return;
    const [propId, userId] = id.split("_");
    const { error } = await supabase.from("property_cohosts").delete().eq("property_id", propId).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("team.removed"));
    loadAll();
  }

  if (denied) {
    return <Unauthorized message="Cette action requiert un rôle Admin ou Co-hôte. Votre session ne dispose pas des droits requis." />;
  }
  // For cohost view: only show their own staff (employees assigned to their properties).
  // Admins/co-admins/other cohosts are managed by admin only.
  const cohostStaffUserIds = isCohost && !isAdminLike
    ? new Set(
        propMembers
          .filter(m => myCohostPropIds.includes(m.property_id) && STAFF_ROLES.includes(m.role))
          .map(m => m.user_id)
      )
    : null;

  const members = orgRoles
    .filter(r => {
      if (r.role === "admin" && r.user_id === user?.id) return false;
      if (cohostStaffUserIds) {
        // Cohost only sees rental staff on their properties
        if (!STAFF_ROLES.includes(r.role)) return false;
        if (!cohostStaffUserIds.has(r.user_id)) return false;
      }
      return true;
    })
    .reduce<Record<string, Role[]>>((acc, r) => {
      (acc[r.user_id] ||= []).push(r.role);
      return acc;
    }, {});

  if (loading) return <div className="p-6">{t("common.loading")}</div>;

  if (!isAdminLike && !isCohost) {
    return <div className="p-6 text-muted-foreground">{t("team.noAccess")}</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="h-6 w-6" /> {t("nav.team")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("team.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCreatedCreds(null); }}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> {t("team.add")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("team.add")}</DialogTitle>
            </DialogHeader>
            {createdCreds ? (
              <div className="space-y-3">
                <p className="text-sm">{t("team.shareCreds")}</p>
                <div className="rounded-md bg-muted p-3 space-y-2 text-sm">
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
                  <Select value={fRole} onValueChange={(v) => setFRole(v as Role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableRoles.map(r => (
                        <SelectItem key={r} value={r}>{t(`team.roles.${r}`)}</SelectItem>
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
                  <Label>{t("team.tempPassword")} *</Label>
                  <div className="flex gap-2">
                    <Input value={fPwd} onChange={(e) => setFPwd(e.target.value)} />
                    <Button type="button" variant="outline" onClick={() => setFPwd(generatePwd())}>↻</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t("team.pwdHint")}</p>
                </div>
                {fRole !== "admin" && (
                  <div>
                    <Label>{t("team.assignProperties")}</Label>
                    <div className="border rounded-md p-2 max-h-40 overflow-auto space-y-1">
                      {visibleProps.length === 0 && (
                        <p className="text-xs text-muted-foreground p-1">{t("team.noProps")}</p>
                      )}
                      {visibleProps.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-accent rounded">
                          <Checkbox
                            checked={fProps.includes(p.id)}
                            onCheckedChange={(c) =>
                              setFProps(c ? [...fProps, p.id] : fProps.filter(x => x !== p.id))
                            }
                          />
                          {p.name}
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
        <AdminGroupedView
          orgId={orgId}
          properties={properties}
          profiles={profiles}
          orgRoles={orgRoles}
          propMembers={propMembers}
          expandedCohost={expandedCohost}
          setExpandedCohost={setExpandedCohost}
          expandedProperty={expandedProperty}
          setExpandedProperty={setExpandedProperty}
          onRemoveAssignment={removeAssignment}
          setProfiles={setProfiles}
          t={t}
        />
      ) : (
        <Card>
          <CardHeader><CardTitle>{t("team.members")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(members).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("team.empty")}</p>
            )}
            {Object.entries(members).map(([uid, roles]) => {
              const profile = profiles[uid];
              const assigns = propMembers.filter(m => m.user_id === uid);
              const primaryRole = roles[0] ?? "staff";
              const emoji = ROLE_EMOJI[primaryRole] ?? "👤";
              return (
                <div key={uid} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      {true && (
                        <AvatarUpload
                          userId={uid}
                          currentUrl={profile?.avatar_url}
                          fallbackEmoji={emoji}
                          size="md"
                          onUploaded={(url) => setProfiles(p => ({ ...p, [uid]: { ...(p[uid] ?? { id: uid, full_name: null, phone: null, avatar_url: null }), avatar_url: url } }))}
                        />
                      )}
                      <div>
                        <div className="font-medium">{profile?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{profile?.phone}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap gap-1">
                        {roles.map(r => (
                          <Badge key={r} variant={r === "admin" ? "default" : r === "cohost" ? "secondary" : "outline"}>
                            {t(`team.roles.${r}`)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  {assigns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {assigns.map(a => {
                        const prop = properties.find(p => p.id === a.property_id);
                        const canRemove = isCohost && myCohostPropIds.includes(a.property_id) && STAFF_ROLES.includes(a.role);
                        return (
                          <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-accent rounded-full px-2 py-1">
                            {prop?.name ?? "?"} · {t(`team.roles.${a.role}`)}
                            {canRemove && (
                              <button onClick={() => removeAssignment(a.id)} className="hover:text-destructive">
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
  orgId: string | null;
  properties: Property[];
  profiles: Record<string, Profile>;
  orgRoles: { user_id: string; role: Role }[];
  propMembers: { id: string; user_id: string; property_id: string; role: Role }[];
  expandedCohost: string | null;
  setExpandedCohost: (v: string | null) => void;
  expandedProperty: string | null;
  setExpandedProperty: (v: string | null) => void;
  onRemoveAssignment: (id: string) => void;
  setProfiles: React.Dispatch<React.SetStateAction<Record<string, Profile>>>;
  t: (k: string) => string;
}

function AdminGroupedView({
  orgId, properties, profiles, orgRoles, propMembers,
  expandedCohost, setExpandedCohost, expandedProperty, setExpandedProperty,
  onRemoveAssignment, setProfiles, t,
}: GroupedProps) {
  const cohostIds = Array.from(new Set(orgRoles.filter(r => r.role === "cohost").map(r => r.user_id)));

  // For each cohost: properties they manage + employees assigned to those same properties
  const cohostData = cohostIds.map(uid => {
    const myProps = propMembers.filter(m => m.user_id === uid && m.role === "cohost").map(m => m.property_id);
    const employees = propMembers.filter(m => myProps.includes(m.property_id) && STAFF_ROLES.includes(m.role));
    return { uid, propIds: myProps, employees };
  });

  return (
    <div className="space-y-6">
      {/* Cohosts list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5" /> {t("team.roles.cohost")}s ({cohostIds.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cohostIds.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("team.empty")}</p>
          )}
          {cohostData.map(({ uid, propIds, employees }) => {
            const profile = profiles[uid];
            const isOpen = expandedCohost === uid;
            return (
              <div key={uid} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCohost(isOpen ? null : uid)}
                  className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition"
                >
                  <div className="flex items-center gap-3">
                    {true && (
                      <AvatarUpload
                        userId={uid}
                        currentUrl={profile?.avatar_url}
                        fallbackEmoji="🏠"
                        size="md"
                        onUploaded={(url) => setProfiles(p => ({ ...p, [uid]: { ...(p[uid] ?? { id: uid, full_name: null, phone: null, avatar_url: null }), avatar_url: url } }))}
                      />
                    )}
                    <div className="text-left">
                      <div className="font-medium">{profile?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {profile?.phone} · {propIds.length} {t("nav.properties").toLowerCase()} · {employees.length} {t("team.roles.cleaner").toLowerCase()}/{t("team.roles.driver").toLowerCase()}
                      </div>
                    </div>
                  </div>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {isOpen && (
                  <div className="border-t bg-muted/30 p-3 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1.5">📊 Évaluation</div>
                      <CohostKpisInline cohostUserId={uid} propertyIds={propIds} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1.5">{t("nav.properties")}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {propIds.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {propIds.map(pid => {
                          const p = properties.find(x => x.id === pid);
                          return <Badge key={pid} variant="secondary">{p?.name ?? "?"}</Badge>;
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1.5">{t("team.members")}</div>
                      {employees.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <div className="space-y-1.5">
                          {employees.map(e => {
                            const prof = profiles[e.user_id];
                            const prop = properties.find(p => p.id === e.property_id);
                            return (
                              <div key={e.id} className="flex items-center justify-between text-sm bg-background rounded px-2 py-1.5">
                                <span className="flex items-center gap-2">
                                  <span>{ROLE_EMOJI[e.role] ?? "👤"}</span>
                                  <span>{prof?.full_name || "—"}</span>
                                  <Badge variant="outline" className="text-[10px]">{t(`team.roles.${e.role}`)}</Badge>
                                  <span className="text-xs text-muted-foreground">· {prop?.name ?? "?"}</span>
                                </span>
                                <button onClick={() => onRemoveAssignment(e.id)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Properties list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" /> {t("nav.properties")} ({properties.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {properties.length === 0 && (
            <p className="text-sm text-muted-foreground">—</p>
          )}
          {properties.map(p => {
            const isOpen = expandedProperty === p.id;
            const assigns = propMembers.filter(m => m.property_id === p.id);
            const cohosts = assigns.filter(a => a.role === "cohost");
            const staff = assigns.filter(a => STAFF_ROLES.includes(a.role));
            return (
              <div key={p.id} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedProperty(isOpen ? null : p.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition"
                >
                  <div className="text-left">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {cohosts.length} {t("team.roles.cohost")} · {staff.length} {t("team.members").toLowerCase()}
                    </div>
                  </div>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {isOpen && (
                  <div className="border-t bg-muted/30 p-3 space-y-1.5">
                    {assigns.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                    {assigns.map(a => {
                      const prof = profiles[a.user_id];
                      return (
                        <div key={a.id} className="flex items-center justify-between text-sm bg-background rounded px-2 py-1.5">
                          <span className="flex items-center gap-2">
                            <span>{ROLE_EMOJI[a.role] ?? "👤"}</span>
                            <span>{prof?.full_name || "—"}</span>
                            <Badge variant={a.role === "cohost" ? "secondary" : "outline"} className="text-[10px]">
                              {t(`team.roles.${a.role}`)}
                            </Badge>
                            {prof?.phone && <span className="text-xs text-muted-foreground">· {prof.phone}</span>}
                          </span>
                          <button onClick={() => onRemoveAssignment(a.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function generatePwd() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

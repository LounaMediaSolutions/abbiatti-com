import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { LogOut, Plus, Trash2, User as UserIcon, Building2, MessageSquare, Shield, Handshake, Images } from "lucide-react";
import { PartnersTab } from "@/components/PartnersTab";
import { AlbumsTab } from "@/components/AlbumsTab";
import i18n from "@/i18n";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photoUpload";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  language: string;
  organization_id: string | null;
};

type Org = { id: string; name: string; logo_url: string | null; brand_color: string | null };

type Template = {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  icon: string | null;
  body_fr: string;
  body_en: string;
  body_ar: string;
  sort_order: number;
  is_default: boolean;
};

export default function Settings() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data: p } = await supabase
      .from("profiles")
      .select("id, full_name, phone, avatar_url, language, organization_id")
      .eq("id", user.id)
      .maybeSingle();
    setProfile(p as Profile | null);
    if (p?.organization_id) {
      const [{ data: o }, { data: tpl }] = await Promise.all([
        supabase.from("organizations").select("id, name, logo_url, brand_color").eq("id", p.organization_id).maybeSingle(),
        supabase
          .from("message_templates")
          .select("*")
          .eq("organization_id", p.organization_id)
          .order("sort_order"),
      ]);
      setOrg(o as Org | null);
      setTemplates((tpl ?? []) as Template[]);
    }
    setLoading(false);
  }

  if (loading || !profile) {
    return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("settings.subtitle")}</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full h-auto">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <UserIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("settings.tabs.profile")}</span>
          </TabsTrigger>
          <TabsTrigger value="org" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> <span className="hidden sm:inline">{t("settings.tabs.org")}</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> <span className="hidden sm:inline">{t("settings.tabs.templates")}</span>
          </TabsTrigger>
          <TabsTrigger value="partners" className="flex items-center gap-2">
            <Handshake className="h-4 w-4" /> <span className="hidden sm:inline">Partenaires</span>
          </TabsTrigger>
          <TabsTrigger value="albums" className="flex items-center gap-2">
            <Images className="h-4 w-4" /> <span className="hidden sm:inline">Albums</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> <span className="hidden sm:inline">{t("settings.tabs.security")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab profile={profile} userEmail={user?.email ?? ""} onSaved={load} />
        </TabsContent>

        <TabsContent value="org">
          {org && profile.organization_id ? (
            <OrgTab org={org} onSaved={load} />
          ) : (
            <Card><CardContent className="p-6 text-muted-foreground">—</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="templates">
          {profile.organization_id && (
            <TemplatesTab
              orgId={profile.organization_id}
              templates={templates}
              onChanged={load}
            />
          )}
        </TabsContent>

        <TabsContent value="partners">
          {profile.organization_id && <PartnersTab orgId={profile.organization_id} />}
        </TabsContent>

        <TabsContent value="albums">
          {profile.organization_id && <AlbumsTab orgId={profile.organization_id} />}
        </TabsContent>

        <TabsContent value="security">
          <SecurityTab email={user?.email ?? ""} onSignOut={signOut} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Profile ---------------- */
function ProfileTab({ profile, userEmail, onSaved }: { profile: Profile; userEmail: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [language, setLanguage] = useState(profile.language ?? "fr");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, language })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (language !== i18n.language) await i18n.changeLanguage(language);
    toast.success(t("settings.saved"));
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.tabs.profile")}</CardTitle>
        <CardDescription>{t("settings.profileHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          {profile.organization_id && (
            <AvatarUpload
              userId={profile.id}
              organizationId={profile.organization_id}
              currentUrl={profile.avatar_url}
              size="lg"
              onUploaded={onSaved}
            />
          )}
          <div className="text-sm text-muted-foreground">{userEmail}</div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("auth.fullName")}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("auth.phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("common.language")}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{t("common.save")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Organization ---------------- */
function hexToHsl(hex: string): string | null {
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslToHex(hsl: string): string {
  const m = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!m) return "#3b82f6";
  const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function OrgTab({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(org.name);
  const [color, setColor] = useState(org.brand_color ? hslToHex(org.brand_color) : "#3b82f6");
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logo_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadLogo(file: File) {
    const v = validatePhotoFile(file);
    if (v.ok === false) return toast.error(v.error);
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${org.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data: { publicUrl } } = supabase.storage.from("org-logos").getPublicUrl(path);
    const { error } = await supabase.from("organizations").update({ logo_url: publicUrl }).eq("id", org.id);
    setUploading(false);
    if (error) return toast.error(error.message);
    setLogoUrl(publicUrl);
    toast.success(t("settings.saved"));
    onSaved();
  }

  async function save() {
    setSaving(true);
    const hsl = hexToHsl(color);
    const { error } = await supabase
      .from("organizations")
      .update({ name, brand_color: hsl })
      .eq("id", org.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (hsl) document.documentElement.style.setProperty("--primary", hsl);
    toast.success(t("settings.saved"));
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.tabs.org")}</CardTitle>
        <CardDescription>{t("settings.orgHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{t("auth.orgName")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Logo de l'agence</Label>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <Input
                type="file"
                accept={PHOTO_ACCEPT}
                disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }}
              />
              <p className="text-xs text-muted-foreground mt-1">JPG · 200 Ko max</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Couleur principale</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-16 rounded border cursor-pointer"
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="max-w-[140px]" />
            <div
              className="h-10 flex-1 rounded border"
              style={{ background: color }}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{t("common.save")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Templates ---------------- */
function TemplatesTab({
  orgId, templates, onChanged,
}: { orgId: string; templates: Template[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  async function remove(id: string) {
    const { error } = await supabase.from("message_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("settings.tpl.deleted"));
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t("settings.tabs.templates")}</CardTitle>
          <CardDescription>{t("settings.tpl.hint")}</CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t("settings.tpl.add")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">
            {t("settings.tpl.empty")}
          </div>
        )}
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="flex items-center justify-between gap-2 p-3 rounded-md border bg-card hover:bg-accent/30 cursor-pointer"
            onClick={() => setEditing(tpl)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-2xl">{tpl.icon || "💬"}</div>
              <div className="min-w-0">
                <div className="font-medium truncate">{tpl.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {(tpl.body_fr || tpl.body_en || tpl.body_ar).slice(0, 80)}
                </div>
              </div>
              {tpl.is_default && <Badge variant="secondary" className="text-xs">{t("settings.tpl.default")}</Badge>}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settings.tpl.confirmDelete")}</AlertDialogTitle>
                  <AlertDialogDescription>{tpl.label}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove(tpl.id)}>OK</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
      </CardContent>

      {(editing || creating) && (
        <TemplateEditor
          orgId={orgId}
          template={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); onChanged(); }}
        />
      )}
    </Card>
  );
}

function TemplateEditor({
  orgId, template, onClose, onSaved,
}: { orgId: string; template: Template | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(template?.label ?? "");
  const [icon, setIcon] = useState(template?.icon ?? "💬");
  const [bodyFr, setBodyFr] = useState(template?.body_fr ?? "");
  const [bodyEn, setBodyEn] = useState(template?.body_en ?? "");
  const [bodyAr, setBodyAr] = useState(template?.body_ar ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) return toast.error(t("settings.tpl.needLabel"));
    setSaving(true);
    const payload = {
      organization_id: orgId,
      label: label.trim(),
      icon,
      body_fr: bodyFr,
      body_en: bodyEn,
      body_ar: bodyAr,
      key: template?.key ?? label.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40),
    };
    const { error } = template
      ? await supabase.from("message_templates").update(payload).eq("id", template.id)
      : await supabase.from("message_templates").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("settings.saved"));
    onSaved();
  }

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{template ? t("settings.tpl.edit") : t("settings.tpl.add")}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div className="space-y-2">
              <Label>{t("settings.tpl.icon")}</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="text-center text-xl" />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.tpl.label")}</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>🇫🇷 Français</Label>
            <Textarea rows={4} value={bodyFr} onChange={(e) => setBodyFr(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>🇬🇧 English</Label>
            <Textarea rows={4} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>🇸🇦 العربية</Label>
            <Textarea rows={4} value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} dir="rtl" />
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.tpl.varsHint")}</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <Button onClick={save} disabled={saving}>{t("common.save")}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------- Security ---------------- */
function SecurityTab({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { t } = useTranslation();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    if (pwd.length < 6) return toast.error(t("auth.passwordMin"));
    if (pwd !== pwd2) return toast.error(t("settings.sec.pwdMismatch"));
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPwd(""); setPwd2("");
    toast.success(t("settings.sec.pwdChanged"));
  }

  async function sendReset() {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) return toast.error(error.message);
    toast.success(t("settings.sec.resetSent"));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sec.changePwd")}</CardTitle>
          <CardDescription>{t("settings.sec.changePwdHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("settings.sec.newPwd")}</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.sec.confirmPwd")}</Label>
              <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between gap-2">
            <Button variant="outline" onClick={sendReset}>{t("settings.sec.sendReset")}</Button>
            <Button onClick={changePassword} disabled={saving}>{t("common.save")}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sec.session")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> {t("auth.logout")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

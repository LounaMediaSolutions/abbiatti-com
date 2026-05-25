import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Home, Pencil, Trash2, MapPin, Building2, Castle, Hotel, Bed, HelpCircle, Link2, Calendar, Sparkles, History, UserCog, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { IcalManager } from "@/components/IcalManager";
import { PropertyQRCode } from "@/components/PropertyQRCode";
import { PropertyApprovalTimeline } from "@/components/PropertyApprovalTimeline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { getUserAccess, isOrgAdminRole, isSuperAdminRole } from "@/lib/access";

interface Property {
  id: string;
  org_id: string;
  name: string;
  property_type: string;
  address: string | null;
  street_number: string | null;
  street_name: string | null;
  building_name: string | null;
  apartment_number: string | null;
  floor: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  access_code: string | null;
  entry_instructions: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
  listing_platforms: string[] | null;
  categories: string[] | null;
  status: string;
  notes: string | null;
  approval_status: string;
  submitted_by: string | null;
  rejection_reason: string | null;
  qr_token?: string | null;
}

const PROPERTY_SELECT_WITH_PRIVATE_FIELDS = `
  id,
  org_id,
  name,
  property_type,
  address,
  street_number,
  street_name,
  building_name,
  apartment_number,
  floor,
  postal_code,
  city,
  region,
  country,
  access_code,
  entry_instructions,
  bedrooms,
  bathrooms,
  max_guests,
  listing_platforms,
  categories,
  status,
  notes,
  approval_status,
  submitted_by,
  rejection_reason,
  qr_token
`;

const PROPERTY_SELECT_WITHOUT_PRIVATE_FIELDS = `
  id,
  org_id,
  name,
  property_type,
  address,
  street_number,
  street_name,
  building_name,
  apartment_number,
  floor,
  postal_code,
  city,
  region,
  country,
  bedrooms,
  bathrooms,
  max_guests,
  listing_platforms,
  categories,
  status,
  notes,
  approval_status,
  submitted_by,
  rejection_reason,
  qr_token
`;

const PROPERTY_SELECT_LEGACY_FIELDS = `
  id,
  org_id,
  name,
  address,
  city,
  country,
  bedrooms,
  bathrooms,
  status
`;

const hasMissingPropertyPrivateFields = (error: { message?: string } | null) => {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("access_code") || message.includes("entry_instructions");
};

const extractMissingPropertyColumn = (error: { message?: string } | null) => {
  const message = error?.message ?? "";
  const schemaCacheMatch = message.match(/'([^']+)' column of 'properties'/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const postgresMatch = message.match(/column properties\.([a-z_]+)/i);
  return postgresMatch?.[1] ?? null;
};

const omitPrivatePropertyFields = <T extends Record<string, unknown>>(payload: T) => {
  const { access_code: _accessCode, entry_instructions: _entryInstructions, ...rest } = payload;
  return rest;
};

const omitPropertyColumn = <T extends Record<string, unknown>>(payload: T, column: string) => {
  const { [column]: _omitted, ...rest } = payload;
  return rest;
};

const LEGACY_PROPERTY_WRITE_FIELDS = [
  "name",
  "address",
  "city",
  "country",
  "bedrooms",
  "bathrooms",
  "max_guests",
  "org_id",
  "submitted_by",
] as const;

const toLegacyPropertyPayload = (payload: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(payload).filter(([key, value]) =>
      LEGACY_PROPERTY_WRITE_FIELDS.includes(key as (typeof LEGACY_PROPERTY_WRITE_FIELDS)[number]) &&
      value !== undefined,
    ),
  );

const propertySchema = z.object({
  name: z.string().trim().min(1).max(120),
  property_type: z.string().min(1),
  street_number: z.string().trim().max(20).optional(),
  street_name: z.string().trim().max(150).optional(),
  building_name: z.string().trim().max(150).optional(),
  apartment_number: z.string().trim().max(20).optional(),
  floor: z.string().trim().max(20).optional(),
  postal_code: z.string().trim().max(20).optional(),
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  access_code: z.string().trim().max(50).optional(),
  entry_instructions: z.string().max(1000).optional(),
  bedrooms: z.number().int().min(0).max(50),
  bathrooms: z.number().int().min(0).max(50),
  max_guests: z.number().int().min(1).max(100),
  notes: z.string().max(2000).optional(),
});

const PLATFORMS = ["Airbnb", "Booking", "Expedia", "Vrbo"];

export const PROPERTY_CATEGORIES = [
  { value: "family", emoji: "👨‍👩‍👧" },
  { value: "beach", emoji: "🏖️" },
  { value: "mountain", emoji: "⛰️" },
  { value: "city", emoji: "🏙️" },
  { value: "business", emoji: "💼" },
  { value: "romantic", emoji: "💕" },
  { value: "group", emoji: "🎉" },
  { value: "pets", emoji: "🐾" },
  { value: "luxury", emoji: "✨" },
  { value: "budget", emoji: "💰" },
] as const;

const PROPERTY_TYPES = [
  { value: "villa", icon: Castle },
  { value: "apartment", icon: Building2 },
  { value: "house", icon: Home },
  { value: "studio", icon: Hotel },
  { value: "room", icon: Bed },
  { value: "other", icon: HelpCircle },
] as const;

const emptyForm = {
  name: "",
  property_type: "apartment",
  street_number: "", street_name: "", building_name: "",
  apartment_number: "", floor: "",
  postal_code: "", city: "", region: "", country: "",
  access_code: "", entry_instructions: "",
  bedrooms: 1, bathrooms: 1, max_guests: 2,
  notes: "", platforms: [] as string[], categories: [] as string[],
};

// Module-level memo of which property columns the live schema is missing.
// Populated lazily on the first fetchProperties() call; reused across mounts
// so we don't re-do the strip-and-retry discovery loop on every navigation.
const discoveredMissingPropertyFields = new Set<string>();
let propertySchemaProbed = false;

const buildAddress = (p: Partial<Property>) => {
  const line1 = [p.street_number, p.street_name].filter(Boolean).join(" ");
  const detail = [
    p.building_name,
    p.apartment_number ? `Apt ${p.apartment_number}` : null,
    p.floor ? `Fl ${p.floor}` : null,
  ].filter(Boolean).join(" · ");
  const cityLine = [p.postal_code, p.city, p.region, p.country].filter(Boolean).join(", ");
  return [line1, detail, cityLine].filter(Boolean).join("\n");
};

const Properties = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [icalProperty, setIcalProperty] = useState<Property | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [canManageAll, setCanManageAll] = useState(false);
  const [canCreateProperties, setCanCreateProperties] = useState(false);
  const [adminNeedsOrg, setAdminNeedsOrg] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<Property | null>(null);
  const [historyFor, setHistoryFor] = useState<Property | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lastEvents, setLastEvents] = useState<Record<string, { event: string; created_at: string; actor_name: string | null; reason: string | null }>>({});
  const [cohosts, setCohosts] = useState<{ id: string; full_name: string | null }[]>([]);
  const [propertyCohosts, setPropertyCohosts] = useState<Record<string, string | null>>({});
  // Display-only maps: property_id -> resolved admin / cohost names shown on each card.
  const [propertyAdminNames, setPropertyAdminNames] = useState<Record<string, string[]>>({});
  const [propertyCohostNames, setPropertyCohostNames] = useState<Record<string, string[]>>({});
  const [savingCohost, setSavingCohost] = useState<string | null>(null);
  const [supportsPrivateFields, setSupportsPrivateFields] = useState(true);

  const fetchProperties = async () => {
    // Some deployments are missing columns this UI uses (e.g. `status`,
    // `property_type`, `access_code`, ...). Rather than maintaining N fallback
    // SELECTs we start with the full list and dynamically strip whichever
    // column the schema cache rejects, retrying until success.
    //
    // Perf: the *first* page load on a deployment with N missing columns used
    // to cost N+1 sequential roundtrips just to discover the right column set,
    // and *every* navigation back to /properties paid the full cost again.
    // We now memoize the discovered set in module scope (see
    // `discoveredMissingPropertyFields` at the top of this file) so subsequent
    // mounts start from the validated list — usually one roundtrip total.
    const ALL_FIELDS = [
      "id",
      "org_id",
      "name",
      "property_type",
      "address",
      "street_number",
      "street_name",
      "building_name",
      "apartment_number",
      "floor",
      "postal_code",
      "city",
      "region",
      "country",
      "access_code",
      "entry_instructions",
      "bedrooms",
      "bathrooms",
      "max_guests",
      "listing_platforms",
      "categories",
      "status",
      "active",
      "notes",
      "approval_status",
      "submitted_by",
      "rejection_reason",
      "qr_token",
    ];

    const PRIVATE_FIELDS = new Set(["access_code", "entry_instructions"]);
    const DEFAULTS: Record<string, unknown> = {
      property_type: "apartment",
      street_number: null,
      street_name: null,
      building_name: null,
      apartment_number: null,
      floor: null,
      postal_code: null,
      region: null,
      access_code: null,
      entry_instructions: null,
      max_guests: null,
      listing_platforms: null,
      categories: null,
      status: "active",
      active: true,
      approval_status: "approved",
      submitted_by: null,
      rejection_reason: null,
      qr_token: null,
      notes: null,
    };

    // Seed `missing` from the module-level memo so we don't re-discover the
    // same set of absent columns on every page mount.
    const missing = new Set<string>(discoveredMissingPropertyFields);
    let fields = ALL_FIELDS.filter((f) => !missing.has(f));

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const result = await supabase
        .from("properties")
        .select(fields.join(", "))
        .order("created_at", { ascending: false });

      if (!result.error) {
        const lostPrivateField = Array.from(missing).some((f) => PRIVATE_FIELDS.has(f));
        setSupportsPrivateFields(!lostPrivateField);
        // Persist the discovered set so subsequent mounts skip the probe.
        if (!propertySchemaProbed) {
          missing.forEach((f) => discoveredMissingPropertyFields.add(f));
          propertySchemaProbed = true;
        }

        return (result.data ?? []).map((row: any) => {
          const filled: Record<string, unknown> = { ...row };
          // Derive `status` from `active` if it's the only one available.
          if (missing.has("status") && !missing.has("active") && "active" in filled) {
            filled.status = filled.active === false ? "inactive" : "active";
          }
          for (const f of missing) {
            if (!(f in filled)) filled[f] = DEFAULTS[f] ?? null;
          }
          return filled;
        }) as Property[];
      }

      const missingColumn = extractMissingPropertyColumn(result.error);
      if (!missingColumn || !fields.includes(missingColumn)) {
        throw result.error;
      }
      fields = fields.filter((f) => f !== missingColumn);
      missing.add(missingColumn);
      // Update the cache as we discover misses, so even a partial probe is
      // useful if a transient error aborts later iterations.
      discoveredMissingPropertyFields.add(missingColumn);
    }

    throw new Error("Could not reconcile property select with the current schema.");
  };

  const persistPropertyWithSchemaFallback = async (
    initialPayload: Record<string, unknown>,
    action: (payload: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>,
  ) => {
    let payload = initialPayload;
    let removedPrivateFields = false;
    let attemptedLegacyPayload = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await action(payload);
      if (!result.error) {
        return { error: null, removedPrivateFields };
      }

      const missingColumn = extractMissingPropertyColumn(result.error);
      if (!missingColumn || !(missingColumn in payload)) {
        return { error: result.error, removedPrivateFields };
      }

       if (!attemptedLegacyPayload) {
        const legacyPayload = toLegacyPropertyPayload(payload);
        const removedKeys = Object.keys(payload).length - Object.keys(legacyPayload).length;
        attemptedLegacyPayload = true;

        if (removedKeys > 0) {
          removedPrivateFields =
            removedPrivateFields ||
            "access_code" in payload ||
            "entry_instructions" in payload;
          payload = legacyPayload;
          continue;
        }
      }

      if (missingColumn === "access_code" || missingColumn === "entry_instructions") {
        removedPrivateFields = true;
      }

      payload = omitPropertyColumn(payload, missingColumn);
    }

    return {
      error: new Error("Could not reconcile the property payload with the current schema."),
      removedPrivateFields,
    };
  };

  const load = async () => {
    // Only show the page-wide spinner on the very first load. On subsequent
    // mounts (e.g. after navigating away and back) we keep the existing cards
    // visible and refresh in the background — feels instant.
    setLoading((prevLoading) => prevLoading || items.length === 0);

    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (!user) {
      setItems([]);
      setCanApprove(false);
      setCanManageAll(false);
      setCanCreateProperties(false);
      setOrgId(null);
      setLoading(false);
      return;
    }

    // ───── Phase 1 (parallel): everything needed to render the cards ─────
    // - getUserAccess: profiles.role + property_cohosts presence
    // - fetchProperties: the property list (with schema-discovery memoization)
    //
    // Independent of each other. Running both in parallel halves the latency
    // of the critical path.
    const [access, propsResult] = await Promise.all([
      getUserAccess(user.id),
      fetchProperties().catch((error: { message?: string }) => {
        toast.error(error.message ?? t("common.error"));
        return [] as Property[];
      }),
    ]);
    const props = propsResult;

    const canManageOrgProperties = access.isSuperAdmin || isOrgAdminRole(access.role);
    setCanApprove(canManageOrgProperties);
    setCanManageAll(canManageOrgProperties);

    // Visibility filter.
    //
    // Only the platform super-admin sees every property. Everyone below the
    // super-admin in the hierarchy (admins, co-admins, cohosts, employees)
    // sees ONLY the properties they are assigned to — via property_members
    // (admins/co-admins/employees) or property_cohosts (cohosts) — plus any
    // property they created themselves (submitted_by). This replaces the old
    // admin rule that also surfaced every unowned (submitted_by == null)
    // property, which leaked properties an admin was never assigned to.
    let visibleProps: Property[];
    if (access.isSuperAdmin) {
      visibleProps = props;
    } else {
      const [membersRes, cohostsRes] = await Promise.all([
        supabase.from("property_members").select("property_id").eq("user_id", user.id),
        supabase.from("property_cohosts").select("property_id").eq("user_id", user.id),
      ]);
      const allowedIds = new Set<string>();
      ((membersRes.data ?? []) as { property_id: string }[]).forEach((r) =>
        allowedIds.add(r.property_id),
      );
      ((cohostsRes.data ?? []) as { property_id: string }[]).forEach((r) =>
        allowedIds.add(r.property_id),
      );
      visibleProps = props.filter(
        (p) => allowedIds.has(p.id) || p.submitted_by === user.id,
      );
    }

    // Render the cards NOW, before chasing secondary metadata. Cohost picker
    // and approval-history badges will populate in the background pass below.
    setItems(visibleProps);
    setLoading(false);

    // ───── Phase 2 (parallel, non-blocking): fill in secondary metadata ─────
    const visiblePropIds = visibleProps.map((p) => p.id);
    const allPropIds = props.map((p) => p.id);

    const cohostsPromise: Promise<{ id: string; full_name: string | null }[]> = (async () => {
      if (visibleProps.length === 0) return [];
      if (access.isSuperAdmin) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "cohost");
        return (data ?? []) as { id: string; full_name: string | null }[];
      }
      if (isOrgAdminRole(access.role) && access.orgId) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("org_id", access.orgId)
          .eq("role", "cohost");
        return (data ?? []) as { id: string; full_name: string | null }[];
      }
      return [];
    })();

    type Assignment = { property_id: string; user_id: string };
    type ApprovalEvent = {
      property_id: string;
      event: string;
      actor_id: string | null;
      reason: string | null;
      created_at: string;
    };

    // Hoist the supabase builders into untyped locals so the chained generic
    // inference doesn't blow past TS's recursion limit on tables not in
    // types.ts (property_approval_events, in particular).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const assignmentsPromise: Promise<{ data: Assignment[] | null }> =
      visiblePropIds.length
        ? sb
            .from("property_cohosts")
            .select("property_id, user_id")
            .in("property_id", visiblePropIds)
        : Promise.resolve({ data: [] });

    // All profiles within the orgs that own the visible properties. The
    // responsible "admin" for a property is its organization's admin/co-admin
    // (admins are NOT stored in property_members — that table's CHECK
    // constraint only allows cohost/employee roles). We also use these to fall
    // back to org cohosts when a property has no explicit cohost row — the same
    // derivation the property detail "Team" tab uses, so the card matches it.
    type OrgProfile = {
      id: string;
      full_name: string | null;
      role: string | null;
      org_id: string | null;
    };
    const orgIdsForVisible = Array.from(
      new Set(visibleProps.map((p) => p.org_id).filter(Boolean)),
    );
    const orgProfilesPromise: Promise<{ data: OrgProfile[] | null }> =
      orgIdsForVisible.length
        ? sb
            .from("profiles")
            .select("id, full_name, role, org_id")
            .in("org_id", orgIdsForVisible)
        : Promise.resolve({ data: [] });

    const eventsPromise: Promise<{ data: ApprovalEvent[] | null }> =
      allPropIds.length
        ? sb
            .from("property_approval_events")
            .select("property_id, event, actor_id, reason, created_at")
            .in("property_id", allPropIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] });

    // Wait for the independent queries in one trip.
    const [cohostList, assignmentsResult, orgProfilesResult, eventsResult] = await Promise.all([
      cohostsPromise,
      assignmentsPromise,
      orgProfilesPromise,
      eventsPromise,
    ]);
    setCohosts(cohostList);

    if (visibleProps.length) {
      // Index every org profile by id (for name lookup) and bucket the org's
      // admins / cohosts by org_id (for per-property derivation + fallback).
      const orgProfiles = (orgProfilesResult.data ?? []) as Array<{
        id: string;
        full_name: string | null;
        role: string | null;
        org_id: string | null;
      }>;
      const profileById = new Map<string, { full_name: string | null }>();
      const adminIdsByOrg = new Map<string, string[]>();
      const cohostIdsByOrg = new Map<string, string[]>();
      orgProfiles.forEach((pr) => {
        profileById.set(pr.id, { full_name: pr.full_name });
        if (!pr.org_id) return;
        if (isOrgAdminRole(pr.role)) {
          const arr = adminIdsByOrg.get(pr.org_id) ?? [];
          arr.push(pr.id);
          adminIdsByOrg.set(pr.org_id, arr);
        } else if (pr.role === "cohost") {
          const arr = cohostIdsByOrg.get(pr.org_id) ?? [];
          arr.push(pr.id);
          cohostIdsByOrg.set(pr.org_id, arr);
        }
      });

      // ── Explicit cohost assignments: property_id -> [user_id] ──
      const cohostIdsByProp: Record<string, string[]> = {};
      const singleCohostMap: Record<string, string | null> = {};
      visibleProps.forEach((p) => {
        cohostIdsByProp[p.id] = [];
        singleCohostMap[p.id] = null;
      });
      const assignments = (assignmentsResult.data ?? []) as Array<{
        property_id: string;
        user_id: string;
      }>;
      assignments.forEach((a) => {
        (cohostIdsByProp[a.property_id] ??= []).push(a.user_id);
        singleCohostMap[a.property_id] = a.user_id;
      });
      setPropertyCohosts(singleCohostMap);

      // Resolve any assigned cohost whose profile wasn't in the org list
      // (e.g. restricted visibility) so their name still shows on the card.
      const missingIds = Array.from(
        new Set(assignments.map((a) => a.user_id).filter((id) => !profileById.has(id))),
      );
      if (missingIds.length) {
        const { data: extra } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", missingIds);
        (extra ?? []).forEach((pr: { id: string; full_name: string | null }) =>
          profileById.set(pr.id, { full_name: pr.full_name }),
        );
      }

      const unnamed = t("properties.cohostAssign.unnamed", { defaultValue: "Unnamed" });
      const namesFor = (ids: string[]) =>
        ids.map((id) => profileById.get(id)?.full_name || unnamed);

      const adminNamesMap: Record<string, string[]> = {};
      const cohostNamesMap: Record<string, string[]> = {};
      visibleProps.forEach((p) => {
        // Admin(s): the organization's admins / co-admins own the property.
        const adminIds = p.org_id ? adminIdsByOrg.get(p.org_id) ?? [] : [];
        adminNamesMap[p.id] = namesFor(adminIds);

        // Cohost(s): explicit per-property assignment first; if none, fall back
        // to the org's cohosts (matches the property detail "Team" tab).
        let cohostIds = cohostIdsByProp[p.id] ?? [];
        if (cohostIds.length === 0 && p.org_id) {
          cohostIds = cohostIdsByOrg.get(p.org_id) ?? [];
        }
        cohostNamesMap[p.id] = namesFor(cohostIds);
      });
      setPropertyAdminNames(adminNamesMap);
      setPropertyCohostNames(cohostNamesMap);
    }

    if (allPropIds.length) {
      const events = (eventsResult.data ?? []) as Array<{
        property_id: string;
        event: string;
        actor_id: string | null;
        reason: string | null;
        created_at: string;
      }>;
      const latestByProp = new Map<string, (typeof events)[number]>();
      events.forEach((e) => {
        if (!latestByProp.has(e.property_id)) latestByProp.set(e.property_id, e);
      });

      const actorIds = Array.from(
        new Set(
          Array.from(latestByProp.values())
            .map((e) => e.actor_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const nameMap = new Map<string, string | null>();
      if (actorIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        (profiles ?? []).forEach((p: { id: string; full_name: string | null }) =>
          nameMap.set(p.id, p.full_name),
        );
      }

      const summary: Record<
        string,
        { event: string; created_at: string; actor_name: string | null; reason: string | null }
      > = {};
      latestByProp.forEach((e, propId) => {
        summary[propId] = {
          event: e.event,
          created_at: e.created_at,
          actor_name: e.actor_id ? nameMap.get(e.actor_id) ?? null : null,
          reason: e.reason,
        };
      });
      setLastEvents(summary);
    }

    // ───── Phase 3 (best-effort, blocks nothing visible): admin-org fallback
    //
    // Rules:
    //  - If profile.org_id is set, use it. This is the user's real org.
    //  - If empty AND user is admin/co_admin: look up pending_org_id (their
    //    accepted-but-not-yet-applied invite). We do NOT silently fall back
    //    to "first org in DB" for regular admins anymore — that would put
    //    them on someone else's data without their knowledge. The
    //    InvitationBanner / setAdminNeedsOrg state is what nudges them.
    //  - Super-admins are global and org-less by design; we still pick the
    //    oldest org as a default workbench so their create dialog has a
    //    sensible target. They're the only role that can legitimately
    //    operate across orgs.
    let effectiveOrgId = access.orgId;
    if (!effectiveOrgId && canManageOrgProperties) {
      const { data: pendingProfile } = await supabase
        .from("profiles")
        .select("pending_org_id")
        .eq("id", user.id)
        .maybeSingle();
      if (pendingProfile?.pending_org_id) {
        effectiveOrgId = pendingProfile.pending_org_id;
      } else if (access.isSuperAdmin) {
        const { data: firstOrg } = await supabase
          .from("organizations")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstOrg?.id) effectiveOrgId = firstOrg.id;
      }
    }
    const orgRequiredButMissing = isOrgAdminRole(access.role) && !effectiveOrgId;
    setAdminNeedsOrg(orgRequiredButMissing);
    setCanCreateProperties(canManageOrgProperties || access.isCohost);
    setOrgId(effectiveOrgId);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Property) => {
    setEditing(p);
    setForm({
      name: p.name,
      property_type: p.property_type ?? "apartment",
      street_number: p.street_number ?? "",
      street_name: p.street_name ?? "",
      building_name: p.building_name ?? "",
      apartment_number: p.apartment_number ?? "",
      floor: p.floor ?? "",
      postal_code: p.postal_code ?? "",
      city: p.city ?? "",
      region: p.region ?? "",
      country: p.country ?? "",
      access_code: p.access_code ?? "",
      entry_instructions: p.entry_instructions ?? "",
      bedrooms: p.bedrooms ?? 1,
      bathrooms: p.bathrooms ?? 1,
      max_guests: p.max_guests ?? 2,
      notes: p.notes ?? "",
      platforms: p.listing_platforms ?? [],
      categories: p.categories ?? [],
    });
    setOpen(true);
  };

  const toggleCategory = (c: string) => {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c],
    }));
  };

  const togglePlatform = (p: string) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p],
    }));
  };

  const importFromUrl = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-listing", {
        body: { url: importUrl.trim() },
      });
      if (error) throw error;
      const d = (data as any)?.data ?? {};
      setForm((f) => ({
        ...f,
        name: d.name || f.name,
        property_type: d.property_type || f.property_type,
        city: d.city || f.city,
        region: d.region || f.region,
        country: d.country || f.country,
        bedrooms: Number(d.bedrooms) || f.bedrooms,
        bathrooms: Number(d.bathrooms) || f.bathrooms,
        max_guests: Number(d.max_guests) || f.max_guests,
        notes: d.notes || f.notes,
        platforms: importUrl.includes("airbnb") ? Array.from(new Set([...(f.platforms || []), "Airbnb"]))
          : importUrl.includes("booking") ? Array.from(new Set([...(f.platforms || []), "Booking"]))
          : importUrl.includes("vrbo") ? Array.from(new Set([...(f.platforms || []), "Vrbo"]))
          : f.platforms,
      }));
      toast.success(t("properties.imported"));
      setImportUrl("");
    } catch (e: any) {
      toast.error(e.message || t("properties.importFailed"));
    } finally {
      setImporting(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = propertySchema.safeParse({
      ...form,
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      max_guests: Number(form.max_guests),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    const payload = {
      ...parsed.data,
      address: buildAddress(parsed.data as any),
      listing_platforms: form.platforms,
      categories: form.categories,
    };
    const payloadForWrite = supportsPrivateFields ? payload : omitPrivatePropertyFields(payload);

    if (editing) {
      const { error, removedPrivateFields } = await persistPropertyWithSchemaFallback(
        payloadForWrite,
        async (nextPayload) =>
          supabase.from("properties").update(nextPayload as any).eq("id", editing.id),
      );
      if (removedPrivateFields) {
        setSupportsPrivateFields(false);
      }
      if (error) return toast.error(error.message);
      toast.success(t("properties.updated"));
    } else {
      if (!userId) return toast.error("No authenticated user");

      // Resolve the write-target org with explicit, predictable rules so the
      // user never accidentally creates a property under someone else's org:
      //
      //   1. Use profile.org_id (the user's *real* organization). Re-fetch
      //      fresh from the DB to handle the case where the user just got
      //      invited or moved orgs since load() ran.
      //   2. If still missing AND the user is a super-admin (global,
      //      org-less by design), use the in-memory orgId picked during
      //      load() — which already surfaces a notice. We DO NOT silently
      //      pick "first org by created_at" for non-super-admins anymore.
      //   3. Otherwise abort with a clear error pointing the user at the
      //      invitation banner.
      let writeOrgId: string | null = null;
      const { data: freshProfile } = await supabase
        .from("profiles")
        .select("org_id, role")
        .eq("id", userId)
        .maybeSingle();
      if (freshProfile?.org_id) {
        writeOrgId = freshProfile.org_id as string;
      } else if (isSuperAdminRole(freshProfile?.role as string | null)) {
        writeOrgId = orgId; // super-admin's currently-selected org
      }
      if (!writeOrgId) {
        return toast.error(
          t("properties.noOrgForUser", {
            defaultValue:
              "Vous n’êtes rattaché à aucune organisation. Acceptez votre invitation pour pouvoir créer une propriété.",
          }),
        );
      }

      // Capture the new property's id so we can attach the creating admin to it
      // (see auto-assignment below).
      let newPropertyId: string | null = null;
      const { error, removedPrivateFields } = await persistPropertyWithSchemaFallback(
        {
          ...payloadForWrite,
          name: parsed.data.name,
          // The property belongs to the creator's organization. For an admin
          // under an organization this is their org; for a super-admin it's the
          // org they currently have selected.
          org_id: writeOrgId,
          submitted_by: userId,
        },
        async (nextPayload) => {
          const res = await supabase
            .from("properties")
            .insert([nextPayload] as any)
            .select("id")
            .maybeSingle();
          if (!res.error && res.data) {
            newPropertyId = (res.data as { id: string }).id;
          }
          return { error: res.error };
        },
      );
      if (removedPrivateFields) {
        setSupportsPrivateFields(false);
      }
      if (error) return toast.error(error.message);

      // Auto-assign the creating org admin (admin / co_admin) to the new
      // property so it shows up under its Team → Admins tab and remains visible
      // through the assignment-based scoping. Super-admins see every property
      // already, so they don't need a membership row.
      if (newPropertyId && isOrgAdminRole(freshProfile?.role as string | null)) {
        await supabase.from("property_members").insert([
          {
            property_id: newPropertyId,
            user_id: userId,
            role: (freshProfile?.role as string) ?? "admin",
            organization_id: writeOrgId,
            assigned_by: userId,
          },
        ] as never);
      }

      toast.success(t("properties.created"));
    }
    setOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    // Optimistic: drop the card from the list immediately. Avoids the full
    // load() roundtrip (auth + access + properties + cohost assignments +
    // approval events + profiles) that used to spin the Loading state.
    setItems((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDeleteId(null);
    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      // Rollback by revalidating; the failed delete almost always means RLS.
      load();
      return;
    }
    toast.success(t("properties.deleted"));
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkDeleting(true);
    // Optimistic prune.
    setItems((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    const { error } = await supabase.from("properties").delete().in("id", ids);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    setSelectedIds(new Set());
    if (error) {
      toast.error(error.message);
      load(); // resync
      return;
    }
    toast.success(t("properties.bulkDeleted", { count: ids.length, defaultValue: `${ids.length} supprimées` }));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectAllVisible = () => {
    if (!canManageAll) return;
    setSelectedIds(new Set(items.map((p) => p.id)));
  };

  const approveProperty = async (p: Property) => {
    const { error } = await supabase
      .from("properties")
      .update({ approval_status: "approved", rejection_reason: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(t("properties.approval.approved_toast"));
    load();
  };

  const rejectProperty = async () => {
    if (!rejectFor) return;
    const { error } = await supabase
      .from("properties")
      .update({ approval_status: "rejected", rejection_reason: rejectReason || null })
      .eq("id", rejectFor.id);
    if (error) return toast.error(error.message);
    toast.success(t("properties.approval.rejected_toast"));
    setRejectFor(null);
    setRejectReason("");
    load();
  };

  const assignCohost = async (p: Property, newUserId: string | null) => {
    setSavingCohost(p.id);
    try {
      // Remove existing cohost assignments for this property
      const { error: delErr } = await supabase
        .from("property_cohosts")
        .delete()
        .eq("property_id", p.id);
      if (delErr) throw delErr;

      const { error: delMemberErr } = await supabase
        .from("property_members")
        .delete()
        .eq("property_id", p.id)
        .eq("role", "cohost");
      if (delMemberErr) throw delMemberErr;

      if (newUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const assignmentPayload = {
          property_id: p.id,
          user_id: newUserId,
          assigned_by: user.id,
          permissions: ["manage_properties", "manage_reservations", "manage_tasks", "manage_staff", "view_financials", "manage_settings"]
        };
        const { error: insErr } = await supabase.from("property_cohosts").insert([assignmentPayload]);
        if (insErr) throw insErr;
        const { error: memberErr } = await supabase.from("property_members").insert([{
          property_id: p.id,
          user_id: newUserId,
          organization_id: p.org_id,
          role: "cohost",
          assigned_by: user.id,
        }]);
        if (memberErr) throw memberErr;
      }
      setPropertyCohosts((m) => ({ ...m, [p.id]: newUserId }));
      toast.success(t("properties.cohostAssign.saved"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingCohost(null);
    }
  };

  const showApt = ["apartment", "studio", "room"].includes(form.property_type);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {adminNeedsOrg && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          You need to be part of an organization to create properties. Ask a
          super-admin to invite you, then accept the invitation from the banner
          at the top of the page.
        </Card>
      )}
      {canManageAll && selectedIds.size > 0 && (
        <Card
          className="sticky top-2 z-30 flex items-center justify-between gap-3 p-3 bg-primary text-primary-foreground shadow-card"
          data-testid="property-bulk-bar"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-semibold" data-testid="property-bulk-count">
              {selectedIds.size} {t("properties.bulk.selected", { defaultValue: "sélectionnée(s)" })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10 h-8"
              onClick={clearSelection}
            >
              {t("properties.bulk.clear", { defaultValue: "Effacer" })}
            </Button>
            {selectedIds.size < items.length && (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:bg-primary-foreground/10 h-8"
                onClick={selectAllVisible}
              >
                {t("properties.bulk.selectAll", { defaultValue: "Tout sélectionner" })}
              </Button>
            )}
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkConfirmOpen(true)}
            disabled={bulkDeleting}
            data-testid="property-bulk-delete-button"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {t("properties.bulk.deleteN", {
              count: selectedIds.size,
              defaultValue: `Supprimer ${selectedIds.size}`,
            })}
          </Button>
        </Card>
      )}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-secondary">{t("properties.title")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild disabled={!canCreateProperties}>
            <Button onClick={openNew} disabled={!canCreateProperties} data-testid="open-property-dialog">
              <Plus className="h-4 w-4 mr-2" />
              {t("properties.add")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? t("properties.edit") : t("properties.add")}</DialogTitle>
            </DialogHeader>
            {!editing && !canApprove && (
              <div className="rounded-lg border border-amber-400/40 p-3 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
                ⏳ {t("properties.approval.submittedHint")}
              </div>
            )}
            {!editing && (
              <div className="rounded-lg border border-primary/30 p-3 bg-primary/5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("properties.importTitle")}
                </div>
                <p className="text-xs text-muted-foreground">{t("properties.importHint")}</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://www.airbnb.com/rooms/..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                  <Button type="button" onClick={importFromUrl} disabled={importing || !importUrl.trim()}>
                    {importing ? t("common.loading") : t("properties.importBtn")}
                  </Button>
                </div>
              </div>
            )}
            <form onSubmit={save} className="space-y-4" data-testid="property-form">

              <div className="space-y-1.5">
                <Label>{t("properties.name")}</Label>
                <Input
                  required
                  value={form.name}
                  data-testid="property-name-input"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("properties.propertyType")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PROPERTY_TYPES.map(({ value, icon: Icon }) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setForm({ ...form, property_type: value })}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-colors ${
                        form.property_type === value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted border-border"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{t(`properties.types.${value}`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <p className="text-sm font-medium text-secondary">{t("properties.addressSection")}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.streetNumber")}</Label>
                    <Input value={form.street_number} onChange={(e) => setForm({ ...form, street_number: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">{t("properties.streetName")}</Label>
                    <Input
                      value={form.street_name}
                      data-testid="property-street-name-input"
                      onChange={(e) => setForm({ ...form, street_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("properties.buildingName")}</Label>
                  <Input value={form.building_name} onChange={(e) => setForm({ ...form, building_name: e.target.value })} />
                </div>
                {showApt && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("properties.apartmentNumber")}</Label>
                      <Input value={form.apartment_number} onChange={(e) => setForm({ ...form, apartment_number: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("properties.floor")}</Label>
                      <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.postalCode")}</Label>
                    <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.city")}</Label>
                    <Input
                      value={form.city}
                      data-testid="property-city-input"
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.region")}</Label>
                    <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.country")}</Label>
                    <Input
                      value={form.country}
                      data-testid="property-country-input"
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    />
                  </div>
                </div>
                {supportsPrivateFields ? (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("properties.accessCode")}</Label>
                      <Input
                        value={form.access_code}
                        data-testid="property-access-code-input"
                        onChange={(e) => setForm({ ...form, access_code: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("properties.entryInstructions")}</Label>
                      <Textarea rows={2} value={form.entry_instructions} onChange={(e) => setForm({ ...form, entry_instructions: e.target.value })} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-amber-400/50 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                    {t("properties.privateFieldsUnavailable")}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("properties.bedrooms")}</Label>
                  <Input type="number" min={0} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("properties.bathrooms")}</Label>
                  <Input type="number" min={0} value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("properties.maxGuests")}</Label>
                  <Input type="number" min={1} value={form.max_guests} onChange={(e) => setForm({ ...form, max_guests: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("properties.platforms")}</Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <Badge
                      key={p}
                      variant={form.platforms.includes(p) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => togglePlatform(p)}
                    >
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("properties.categories")}</Label>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_CATEGORIES.map((c) => (
                    <Badge
                      key={c.value}
                      variant={form.categories.includes(c.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(c.value)}
                    >
                      {c.emoji} {t(`properties.categoryLabels.${c.value}`)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("properties.notes")}</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("properties.cancel")}</Button>
                <Button type="submit">{t("properties.save")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center shadow-card">
          <Home className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-secondary">{t("properties.empty")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("properties.emptyHint")}</p>
          {canCreateProperties && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              {t("properties.add")}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Card
              key={p.id}
              className={cn(
                "p-4 shadow-card hover:shadow-soft transition-shadow",
                selectedIds.has(p.id) && "ring-2 ring-primary",
              )}
              data-testid="property-card"
              data-selected={selectedIds.has(p.id) ? "true" : "false"}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                {canManageAll && (
                  <Checkbox
                    checked={selectedIds.has(p.id)}
                    onCheckedChange={() => toggleSelect(p.id)}
                    className="mt-1 shrink-0"
                    aria-label={`Select ${p.name}`}
                    data-testid="property-card-checkbox"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3
                    className="font-semibold text-secondary truncate cursor-pointer hover:underline"
                    onClick={() => navigate(`/properties/${p.id}`)}
                    title={t("propertyDetail.open", { defaultValue: "Ouvrir" })}
                  >
                    {p.name}
                  </h3>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t(`properties.types.${p.property_type ?? "apartment"}`)}
                  </p>
                  {(p.city || p.country) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {[p.city, p.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {p.approval_status === "pending" && (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                      ⏳ {t("properties.approval.pending")}
                    </Badge>
                  )}
                  {p.approval_status === "rejected" && (
                    <Badge variant="destructive">{t("properties.approval.rejected")}</Badge>
                  )}
                  {p.approval_status === "approved" && (
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>
                      {p.status === "active" ? t("properties.active") : t("properties.inactive")}
                    </Badge>
                  )}
                </div>
              </div>
              {p.approval_status === "rejected" && p.rejection_reason && (
                <p className="text-xs text-destructive mb-2 italic">"{p.rejection_reason}"</p>
              )}
              <div className="text-xs text-muted-foreground mb-3">
                {p.bedrooms ?? 0} 🛏 · {p.bathrooms ?? 0} 🛁 · {p.max_guests ?? 0} 👤
              </div>
              <div className="space-y-1 mb-3 text-xs" data-testid="property-team-summary">
                <div className="flex items-start gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <span className="font-medium text-secondary shrink-0">
                    {t("properties.adminLabel", { defaultValue: "Admin" })}:
                  </span>
                  <span className="text-muted-foreground truncate" data-testid="property-admin-name">
                    {propertyAdminNames[p.id]?.length
                      ? propertyAdminNames[p.id].join(", ")
                      : t("properties.cohostAssign.unassigned")}
                  </span>
                </div>
                <div className="flex items-start gap-1.5">
                  <UserCog className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <span className="font-medium text-secondary shrink-0">
                    {t("properties.cohostLabel", { defaultValue: "Cohost" })}:
                  </span>
                  <span className="text-muted-foreground truncate" data-testid="property-cohost-name">
                    {propertyCohostNames[p.id]?.length
                      ? propertyCohostNames[p.id].join(", ")
                      : t("properties.cohostAssign.unassigned")}
                  </span>
                </div>
              </div>
              {p.categories && p.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {p.categories.map((c) => {
                    const cat = PROPERTY_CATEGORIES.find((x) => x.value === c);
                    return (
                      <Badge key={c} variant="secondary" className="text-[10px]">
                        {cat?.emoji} {t(`properties.categoryLabels.${c}`, c)}
                      </Badge>
                    );
                  })}
                </div>
              )}
              {p.listing_platforms && p.listing_platforms.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {p.listing_platforms.map((pl) => (
                    <Badge key={pl} variant="outline" className="text-[10px]">{pl}</Badge>
                  ))}
                </div>
              )}
              {canApprove && p.approval_status === "pending" && (
                <div className="flex gap-2 mb-2">
                  <Button size="sm" className="flex-1" onClick={() => approveProperty(p)}>
                    ✓ {t("properties.approval.approve")}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setRejectFor(p)}>
                    ✕ {t("properties.approval.reject")}
                  </Button>
                </div>
              )}
              {lastEvents[p.id] ? (
                <button
                  type="button"
                  onClick={() => setHistoryFor(p)}
                  className="w-full text-left text-[11px] text-muted-foreground mb-2 px-2 py-1 rounded bg-muted/40 hover:bg-muted transition-colors flex items-center gap-1.5 truncate"
                  title={t("properties.approval.history")}
                >
                  <History className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {t(`properties.approval.events.${lastEvents[p.id].event}`)}
                    {lastEvents[p.id].actor_name && <> · {lastEvents[p.id].actor_name}</>}
                    {" · "}
                    {format(new Date(lastEvents[p.id].created_at), "dd MMM HH:mm")}
                  </span>
                </button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-full text-[11px] text-muted-foreground/70 italic mb-2 px-2 py-1 rounded border border-dashed border-border flex items-center gap-1.5 truncate cursor-help">
                      <History className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t("properties.approval.noEventsYet")}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {t("properties.approval.noEventsYetTooltip")}
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Cohost assignment now lives under the property detail "Cohosts" tab. */}
              <div className="space-y-2">
                <Button
                  size="sm"
                  className="w-full"
                  data-testid="property-open-button"
                  onClick={() => navigate(`/properties/${p.id}`)}
                >
                  {t("propertyDetail.open", { defaultValue: "Ouvrir" })} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[88px]"
                    onClick={() => openEdit(p)}
                    disabled={!canManageAll || (p.approval_status === "pending" && !canApprove)}
                    title={p.approval_status === "pending" && !canApprove ? t("properties.approval.lockedHint") : undefined}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> {t("properties.edit")}
                  </Button>
                  <Button variant="outline" size="sm" data-testid="property-ical-button" onClick={() => setIcalProperty(p)} title={t("ical.title")}>
                    <Calendar className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setHistoryFor(p)} title={t("properties.approval.history")}>
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  {(p as any).qr_token && (
                    <PropertyQRCode propertyName={p.name} qrToken={(p as any).qr_token} />
                  )}
                  {canManageAll && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteId(p.id)}
                      aria-label={`${t("properties.delete")} ${p.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("properties.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("properties.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("properties.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={(o) => !o && !bulkDeleting && setBulkConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("properties.bulk.confirmTitle", {
                count: selectedIds.size,
                defaultValue: `Supprimer ${selectedIds.size} propriété(s) ?`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("properties.bulk.confirmBody", {
                defaultValue:
                  "Cette action est irréversible. Toutes les données associées (réservations, tâches, livrets, etc.) seront perdues.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>{t("properties.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={bulkDeleting}
              data-testid="property-bulk-delete-confirm"
            >
              {bulkDeleting
                ? t("properties.bulk.deleting", { defaultValue: "Suppression…" })
                : t("properties.bulk.deleteN", {
                    count: selectedIds.size,
                    defaultValue: `Supprimer ${selectedIds.size}`,
                  })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectFor} onOpenChange={(o) => { if (!o) { setRejectFor(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("properties.approval.reject")} — {rejectFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("properties.approval.rejectReason")}</Label>
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectFor(null); setRejectReason(""); }}>{t("properties.cancel")}</Button>
            <Button variant="destructive" onClick={rejectProperty}>{t("properties.approval.reject")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {icalProperty && (
        <IcalManager
          propertyId={icalProperty.id}
          organizationId={icalProperty.org_id}
          open={!!icalProperty}
          onOpenChange={(o) => !o && setIcalProperty(null)}
        />
      )}

      {historyFor && (
        <PropertyApprovalTimeline
          propertyId={historyFor.id}
          propertyName={historyFor.name}
          open={!!historyFor}
          onOpenChange={(o) => !o && setHistoryFor(null)}
        />
      )}
    </div>
  );
};

export default Properties;

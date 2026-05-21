import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Home,
  MapPin,
  CalendarRange,
  CalendarDays,
  ListTodo,
  FileText,
  Info,
  UserCog,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { PROPERTY_CATEGORIES } from "./Properties";
import { PropertyCohostsTab } from "@/components/PropertyCohostsTab";
import Availability from "./Availability";
import Reservations from "./Reservations";
import Tasks from "./Tasks";
import Reports from "./Reports";

const TABS = ["overview", "availability", "reservations", "tasks", "reports", "cohosts"] as const;
type TabValue = (typeof TABS)[number];

export default function PropertyDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab") as TabValue | null;
  const activeTab: TabValue = tabParam && TABS.includes(tabParam) ? tabParam : "overview";
  const setActiveTab = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", value);
      return next;
    });
  };

  const { data: property, isLoading } = useQuery({
    queryKey: ["property-detail", id],
    queryFn: async () => {
      // RLS scopes visible rows to the user's org + cohost assignments, so a
      // user who can't access this property simply gets nothing back.
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      return data as Record<string, any> | null;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 py-10 text-center">
        <p className="text-muted-foreground">
          {t("propertyDetail.notFound", { defaultValue: "Propriété introuvable ou accès non autorisé." })}
        </p>
        <Button variant="outline" onClick={() => navigate("/properties")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("propertyDetail.backToProperties", { defaultValue: "Retour aux propriétés" })}
        </Button>
      </div>
    );
  }

  const location = [property.city, property.country].filter(Boolean).join(", ");
  const categories: string[] = property.categories ?? [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => navigate("/properties")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("propertyDetail.backToProperties", { defaultValue: "Retour aux propriétés" })}
        </Button>
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Home className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold truncate">{property.name}</h1>
            {location && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {location}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap h-auto justify-start">
          <TabsTrigger value="overview" className="gap-1.5">
            <Info className="h-4 w-4" /> {t("propertyDetail.overview", { defaultValue: "Aperçu" })}
          </TabsTrigger>
          <TabsTrigger value="availability" className="gap-1.5">
            <CalendarRange className="h-4 w-4" /> {t("nav.availability")}
          </TabsTrigger>
          <TabsTrigger value="reservations" className="gap-1.5">
            <CalendarDays className="h-4 w-4" /> {t("nav.reservations")}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <ListTodo className="h-4 w-4" /> {t("nav.tasks")}
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileText className="h-4 w-4" /> {t("nav.reports")}
          </TabsTrigger>
          <TabsTrigger value="cohosts" className="gap-1.5">
            <UserCog className="h-4 w-4" /> {t("propertyDetail.cohosts", { defaultValue: "Cohosts" })}
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t("properties.type", { defaultValue: "Type" })}
                </p>
                <p className="font-medium">
                  {t(`properties.types.${property.property_type ?? "apartment"}`, {
                    defaultValue: property.property_type ?? "—",
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">🛏</p>
                <p className="font-medium">{property.bedrooms ?? 0}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">🛁</p>
                <p className="font-medium">{property.bathrooms ?? 0}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">👤 max</p>
                <p className="font-medium">{property.max_guests ?? 0}</p>
              </div>
            </div>

            {property.address && (
              <div className="text-sm">
                <p className="text-xs uppercase text-muted-foreground">
                  {t("properties.address", { defaultValue: "Adresse" })}
                </p>
                <p className="font-medium">{property.address}</p>
              </div>
            )}

            {categories.length > 0 && (
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  {t("availability.filterByPackage", { defaultValue: "Catégories" })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => {
                    const cat = PROPERTY_CATEGORIES.find((x) => x.value === c);
                    return (
                      <Badge key={c} variant="secondary" className="text-[11px]">
                        {cat?.emoji} {t(`properties.categoryLabels.${c}`, c)}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {property.notes && (
              <div className="text-sm">
                <p className="text-xs uppercase text-muted-foreground">
                  {t("properties.notes", { defaultValue: "Notes" })}
                </p>
                <p className="whitespace-pre-wrap">{property.notes}</p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* SCOPED SUB-PAGES */}
        <TabsContent value="availability">
          <Availability propertyId={id} embedded />
        </TabsContent>
        <TabsContent value="reservations">
          <Reservations propertyId={id} embedded />
        </TabsContent>
        <TabsContent value="tasks">
          <Tasks propertyId={id} embedded />
        </TabsContent>
        <TabsContent value="reports">
          <Reports propertyId={id} embedded />
        </TabsContent>
        <TabsContent value="cohosts">
          <PropertyCohostsTab propertyId={id} orgId={property.org_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

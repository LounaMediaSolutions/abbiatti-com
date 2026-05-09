import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  LayoutDashboard,
  Home,
  CalendarDays,
  ListTodo,
  Package,
  Users,
  Settings as SettingsIcon,
  MessageSquare,
  QrCode,
  LinkIcon,
  Languages,
  HelpCircle,
  Search,
  Rocket,
  BookOpen,
  AlertTriangle,
  Globe,
  Mail,
  Send,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Section = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  descKey: string;
  steps: string[]; // i18n keys
};

const SECTIONS: Section[] = [
  {
    id: "start",
    icon: Rocket,
    titleKey: "help.sections.start.title",
    descKey: "help.sections.start.desc",
    steps: ["help.sections.start.s1", "help.sections.start.s2", "help.sections.start.s3", "help.sections.start.s4"],
  },
  {
    id: "dashboard",
    icon: LayoutDashboard,
    titleKey: "help.sections.dashboard.title",
    descKey: "help.sections.dashboard.desc",
    steps: ["help.sections.dashboard.s1", "help.sections.dashboard.s2"],
  },
  {
    id: "properties",
    icon: Home,
    titleKey: "help.sections.properties.title",
    descKey: "help.sections.properties.desc",
    steps: [
      "help.sections.properties.s1",
      "help.sections.properties.s2",
      "help.sections.properties.s3",
      "help.sections.properties.s4",
    ],
  },
  {
    id: "reservations",
    icon: CalendarDays,
    titleKey: "help.sections.reservations.title",
    descKey: "help.sections.reservations.desc",
    steps: [
      "help.sections.reservations.s1",
      "help.sections.reservations.s2",
      "help.sections.reservations.s3",
      "help.sections.reservations.s4",
    ],
  },
  {
    id: "ical",
    icon: LinkIcon,
    titleKey: "help.sections.ical.title",
    descKey: "help.sections.ical.desc",
    steps: ["help.sections.ical.s1", "help.sections.ical.s2", "help.sections.ical.s3"],
  },
  {
    id: "tasks",
    icon: ListTodo,
    titleKey: "help.sections.tasks.title",
    descKey: "help.sections.tasks.desc",
    steps: [
      "help.sections.tasks.s1",
      "help.sections.tasks.s2",
      "help.sections.tasks.s3",
      "help.sections.tasks.s4",
    ],
  },
  {
    id: "inventory",
    icon: Package,
    titleKey: "help.sections.inventory.title",
    descKey: "help.sections.inventory.desc",
    steps: ["help.sections.inventory.s1", "help.sections.inventory.s2", "help.sections.inventory.s3"],
  },
  {
    id: "team",
    icon: Users,
    titleKey: "help.sections.team.title",
    descKey: "help.sections.team.desc",
    steps: [
      "help.sections.team.s1",
      "help.sections.team.s2",
      "help.sections.team.s3",
      "help.sections.team.s4",
    ],
  },
  {
    id: "qr",
    icon: QrCode,
    titleKey: "help.sections.qr.title",
    descKey: "help.sections.qr.desc",
    steps: ["help.sections.qr.s1", "help.sections.qr.s2", "help.sections.qr.s3"],
  },
  {
    id: "templates",
    icon: MessageSquare,
    titleKey: "help.sections.templates.title",
    descKey: "help.sections.templates.desc",
    steps: ["help.sections.templates.s1", "help.sections.templates.s2", "help.sections.templates.s3"],
  },
  {
    id: "settings",
    icon: SettingsIcon,
    titleKey: "help.sections.settings.title",
    descKey: "help.sections.settings.desc",
    steps: ["help.sections.settings.s1", "help.sections.settings.s2", "help.sections.settings.s3"],
  },
  {
    id: "lang",
    icon: Languages,
    titleKey: "help.sections.lang.title",
    descKey: "help.sections.lang.desc",
    steps: ["help.sections.lang.s1", "help.sections.lang.s2"],
  },
  {
    id: "guestbook",
    icon: BookOpen,
    titleKey: "help.sections.guestbook.title",
    descKey: "help.sections.guestbook.desc",
    steps: ["help.sections.guestbook.s1", "help.sections.guestbook.s2", "help.sections.guestbook.s3", "help.sections.guestbook.s4"],
  },
  {
    id: "tickets",
    icon: AlertTriangle,
    titleKey: "help.sections.tickets.title",
    descKey: "help.sections.tickets.desc",
    steps: ["help.sections.tickets.s1", "help.sections.tickets.s2", "help.sections.tickets.s3", "help.sections.tickets.s4"],
  },
  {
    id: "showcase",
    icon: Globe,
    titleKey: "help.sections.showcase.title",
    descKey: "help.sections.showcase.desc",
    steps: ["help.sections.showcase.s1", "help.sections.showcase.s2", "help.sections.showcase.s3", "help.sections.showcase.s4"],
  },
  {
    id: "bookings",
    icon: Mail,
    titleKey: "help.sections.bookings.title",
    descKey: "help.sections.bookings.desc",
    steps: ["help.sections.bookings.s1", "help.sections.bookings.s2", "help.sections.bookings.s3", "help.sections.bookings.s4"],
  },
  {
    id: "whatsapp",
    icon: Send,
    titleKey: "help.sections.whatsapp.title",
    descKey: "help.sections.whatsapp.desc",
    steps: ["help.sections.whatsapp.s1", "help.sections.whatsapp.s2", "help.sections.whatsapp.s3", "help.sections.whatsapp.s4"],
  },
  {
    id: "reports",
    icon: BarChart3,
    titleKey: "help.sections.reports.title",
    descKey: "help.sections.reports.desc",
    steps: ["help.sections.reports.s1", "help.sections.reports.s2", "help.sections.reports.s3"],
  },
];

const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6"];

export default function Help() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filteredSections = SECTIONS.filter((s) => {
    if (!q) return true;
    const blob = [t(s.titleKey), t(s.descKey), ...s.steps.map((k) => t(k))].join(" ").toLowerCase();
    return blob.includes(q);
  });
  const filteredFaqs = FAQ_KEYS.filter((k) => {
    if (!q) return true;
    const blob = [t(`help.faq.${k}.q`), t(`help.faq.${k}.a`)].join(" ").toLowerCase();
    return blob.includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("help.title")}</h1>
        </div>
        <p className="text-muted-foreground">{t("help.subtitle")}</p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("help.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Quick start grid */}
      {!q && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SECTIONS.slice(0, 8).map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex flex-col items-center text-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <s.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">{t(s.titleKey)}</span>
            </a>
          ))}
        </div>
      )}

      {/* Sections */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("help.guideTitle")}</h2>
        {filteredSections.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("help.noResults")}</p>
        )}
        {filteredSections.map((s) => (
          <Card key={s.id} id={s.id} className="scroll-mt-20">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base">{t(s.titleKey)}</CardTitle>
                  <CardDescription>{t(s.descKey)}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 list-decimal list-inside text-sm">
                {s.steps.map((stepKey) => (
                  <li key={stepKey} className="leading-relaxed">
                    {t(stepKey)}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* FAQ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t("help.faqTitle")}</h2>
          <Badge variant="secondary">FAQ</Badge>
        </div>
        {filteredFaqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("help.noResults")}</p>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Accordion type="single" collapsible className="w-full">
                {filteredFaqs.map((k) => (
                  <AccordionItem key={k} value={k}>
                    <AccordionTrigger className="text-sm text-start">
                      {t(`help.faq.${k}.q`)}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground whitespace-pre-line">
                      {t(`help.faq.${k}.a`)}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </section>

      <p className="text-xs text-muted-foreground text-center pt-4">
        {t("help.footer")}
      </p>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const ComingSoon = ({ titleKey }: { titleKey: string }) => {
  const { t } = useTranslation();
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold text-secondary mb-4">{t(titleKey)}</h1>
      <Card className="p-10 text-center shadow-card">
        <Construction className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Coming soon</p>
      </Card>
    </div>
  );
};

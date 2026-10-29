import { t as uiT } from "@/i18n";
import { useEffect } from "react";
import { Link, useLocation } from "@/lib/router";
import { AlertTriangle, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";

type NotFoundScope = "board" | "invalid_company_prefix" | "global";

interface NotFoundPageProps {
  scope?: NotFoundScope;
  requestedPrefix?: string;
}

export function NotFoundPage({ scope = "global", requestedPrefix }: NotFoundPageProps) {
  const location = useLocation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { companies, selectedCompany } = useCompany();

  useEffect(() => {
    setBreadcrumbs([{ label: uiT("ui:messages.m_0019dfc4b32d63c1") }]);
  }, [setBreadcrumbs]);

  const fallbackCompany = selectedCompany ?? companies[0] ?? null;
  const dashboardHref = fallbackCompany ? `/${fallbackCompany.issuePrefix}/dashboard` : "/";
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const normalizedPrefix = requestedPrefix?.toUpperCase();

  const title = scope === "invalid_company_prefix" ? uiT("ui:messages.m_00c50f7a04046267") : uiT("ui:messages.m_a469ab4ca4e55bf5");
  const description =
    scope === "invalid_company_prefix"
      ? uiT("ui:messages.m_895e90aedd1e2d23", { v0: (normalizedPrefix ?? "unknown") })
      : uiT("ui:messages.m_80eced636168620f");

  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card className="block p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{uiT("ui:messages.m_4b84b327a445b184")}<code className="font-mono">{currentPath}</code>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link to={dashboardHref}>
              <Compass className="mr-1.5 h-4 w-4" />{uiT("ui:messages.m_803f2313cdf44275")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">{uiT("ui:messages.m_a0aac9145249f167")}</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

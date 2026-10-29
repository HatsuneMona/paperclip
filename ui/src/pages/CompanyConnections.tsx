import { t as uiT } from "@/i18n";
import { useEffect } from "react";
import { Link2 } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { DecisionModelSettingsSection } from "../components/decision-models/DecisionModelSettings";
import { FastResponseSettingsSection } from "../components/fast-responses/FastResponseSettings";
import { useFastResponsesEnabled } from "../hooks/useFastResponsesEnabled";
import { PromptInjectionPreventionSettingsSection } from "../components/prompt-injection-prevention/PromptInjectionPreventionSettings";

export function CompanyConnections() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { enabled } = useFastResponsesEnabled();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? uiT("ui:messages.m_de4743c879734dc3"), href: "/dashboard" },
      { label: uiT("ui:messages.m_74a883a037bc227f"), href: "/company/settings" },
      { label: uiT("ui:messages.m_dc273117482b4429") },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_9133af154f20a9d0")}</div>
    );
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{uiT("ui:messages.m_dc273117482b4429")}</h1>
      </div>
      <DecisionModelSettingsSection key={selectedCompanyId} companyId={selectedCompanyId} />
      <div className="max-w-2xl border-t border-border pt-8">
        <PromptInjectionPreventionSettingsSection key={`injection-${selectedCompanyId}`} companyId={selectedCompanyId} />
      </div>
      {enabled && <div className="max-w-2xl border-t border-border pt-8">
        <FastResponseSettingsSection key={`fast-${selectedCompanyId}`} companyId={selectedCompanyId} />
      </div>}
    </div>
  );
}

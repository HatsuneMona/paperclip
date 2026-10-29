import { t as uiT } from "@/i18n";
import { useEffect } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { NewAgentSetup } from "../components/new-agent/NewAgentSetup";

export function NewAgent() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([
      { label: uiT("ui:messages.m_279b44d2ab4b40c0"), href: "/agents" },
      { label: uiT("ui:messages.m_98a23e6db3431d16") },
    ]);
  }, [setBreadcrumbs]);
  return <NewAgentSetup />;
}

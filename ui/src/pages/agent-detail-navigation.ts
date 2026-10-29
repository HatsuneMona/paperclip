import { t as uiT } from "@/i18n";
import { auditSectionHref, type AuditSection } from "./audit/audit-navigation";

export type AgentDetailView =
  | "overview"
  | "instructions"
  | "skills"
  | "runtime"
  | "secrets"
  | "tools"
  | "channels"
  | "permissions"
  | "api-keys"
  | "revisions"
  | "advanced"
  | "run-detail";

export type AgentLocalDetailView = Exclude<AgentDetailView, "run-detail">;

export const AGENT_DETAIL_NAVIGATION: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ value: AgentLocalDetailView; label: string }>;
}> = [
  {
    label: uiT("ui:messages.m_11b39c93777e8f1f"),
    items: [
      { value: "overview", label: uiT("ui:messages.m_d4b1ea5708dd5329") },
      { value: "instructions", label: uiT("ui:messages.m_934652dce41d62d3") },
      { value: "skills", label: uiT("ui:messages.m_66d0f523a379b2de") },
    ],
  },
  {
    label: uiT("ui:messages.m_1093115897879aa3"),
    items: [
      { value: "runtime", label: uiT("ui:messages.m_6711e546a022dbe7") },
      { value: "secrets", label: uiT("ui:messages.m_d8707d411d997657") },
      { value: "tools", label: uiT("ui:messages.m_ea93d6a262ecb87a") },
      { value: "channels", label: uiT("ui:messages.m_4c8906cf76f5740a") },
    ],
  },
  {
    label: "Governance",
    items: [
      { value: "permissions", label: "Permissions / Trust" },
      { value: "api-keys", label: uiT("ui:messages.m_c08f17eb9e11a353") },
      { value: "revisions", label: uiT("ui:messages.m_da80b1d5740caaef") },
      { value: "advanced", label: uiT("ui:messages.m_9f088dbebd6c3c70") },
    ],
  },
] as const;

export function parseAgentDetailView(value: string | null): AgentLocalDetailView {
  if (value === "instructions" || value === "prompts") return "instructions";
  if (value === "skills") return "skills";
  if (value === "runtime" || value === "configure" || value === "configuration") return "runtime";
  if (value === "secrets") return "secrets";
  if (value === "tools") return "tools";
  if (value === "channels") return "channels";
  if (value === "permissions" || value === "trust") return "permissions";
  if (value === "api-keys" || value === "keys") return "api-keys";
  if (value === "revisions" || value === "history") return "revisions";
  if (value === "advanced") return "advanced";
  return "overview";
}

export function agentDetailHref(agentRef: string, view: AgentLocalDetailView = "overview") {
  return `/agents/${agentRef}/${view}`;
}

export function agentLegacyAuditSection(value: string | null): AuditSection | null {
  if (value === "runs") return "runs";
  if (value === "audit" || value === "activity") return "activity";
  if (value === "cost" || value === "costs") return "costs";
  if (value === "budget" || value === "budgets") return "budgets";
  return null;
}

export function agentScopedAuditHref(agentId: string, section: AuditSection) {
  return auditSectionHref(section, {
    mode: section === "activity" ? "agents" : undefined,
    agentId,
  });
}

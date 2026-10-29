import { t as uiT } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import type { DecisionHistoryEntry } from "@paperclipai/shared";
import { decisionModelsApi } from "@/api/decision-models";
import { Link } from "@/lib/router";
import { formatDateTime, formatTokens, formatDetailedCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function DecisionHistoryTable({ entries, fastResponse = false, fastResponsesEnabled = true }: { entries: (DecisionHistoryEntry & { publicationStatus?: string; connectionName?: string | null })[]; fastResponse?: boolean; fastResponsesEnabled?: boolean }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">{fastResponse ? "No fast responses in this period." : "No decision requests in this period."} <Link to={fastResponse && !fastResponsesEnabled ? "/company/settings/instance/experimental" : "/company/settings/connections"} className="underline underline-offset-4">{fastResponse ? fastResponsesEnabled ? "Configure fast response" : "Enable experimental fast responses" : "Configure a decision model"}</Link> to run a test.</p>;
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Recent requests. Inputs are not retained.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={fastResponse ? "Fast responses" : "Decision requests"}>
      <thead><tr className="border-b border-border text-muted-foreground">{["When / feature", "Responsible", "Task", ...(fastResponse ? ["Connection"] : []), "Model", "Status", "Duration", "Tokens in / out", "Cost"].map(label => <th key={label} className="px-3 py-2 text-left font-medium">{label}</th>)}</tr></thead>
      <tbody>{entries.map(row => <tr key={row.id} className="border-b border-border last:border-0">
        <td className="px-3 py-3"><div className="whitespace-nowrap">{formatDateTime(row.startedAt)}</div><div className="text-xs text-muted-foreground">{row.feature === "settings.test" ? "Setup test" : row.feature}</div></td>
        <td className="px-3 py-3">{row.actorType === "system" ? "Paperclip services" : row.userName ?? (row.responsibleUserId === "local-board" ? uiT("ui:messages.m_4816cbfd74aa8297") : "Former user")}</td>
        <td className="px-3 py-3">{row.issueId ? <Link className="underline underline-offset-4" to={`/issues/${row.issueIdentifier ?? row.issueId}`}>{row.issueIdentifier ?? uiT("ui:messages.m_01444a2b442a7b78")}</Link> : "—"}</td>
        {fastResponse && <td className="px-3 py-3">{row.connectionName ?? (row.connectionId ? "Removed connection" : "—")}</td>}
        <td className="px-3 py-3 font-mono text-xs">{row.model}</td>
        <td className="px-3 py-3"><div>{row.status === "succeeded" ? uiT("ui:messages.m_6d9a6f97a5fdaf3b") : row.status === "running" ? uiT("ui:messages.m_f4ccae29e1bb0c20") : row.status === "unknown" ? "Unresolved" : row.status === "skipped" ? uiT("ui:messages.m_12698ce1ea5cd4ab") : row.status === "pending" ? uiT("ui:messages.m_331551b0de4157c9") : uiT("ui:messages.m_031a8f0f659df890")}</div>{row.publicationStatus && <div className="text-xs text-muted-foreground">{row.publicationStatus}</div>}{row.errorCode && <div className="text-xs text-muted-foreground">{row.errorCode.replaceAll("_", " ")}</div>}</td>
        <td className="px-3 py-3 font-mono">{row.durationMs === null ? "—" : uiT("ui:messages.m_7680eb3438117c14", { v0: ((row.durationMs / 1000).toFixed(1)) })}</td>
        <td className="whitespace-nowrap px-3 py-3 font-mono">{row.inputTokens === null ? "—" : formatTokens(row.inputTokens)} / {row.outputTokens === null ? "—" : formatTokens(row.outputTokens)}</td>
        <td className="px-3 py-3 font-mono"><div>{row.costCents === null ? uiT("ui:messages.m_b764cdc0eab71374") : formatDetailedCents(row.costCents)}</div>{row.costStatus !== "unpriced" && row.costStatus && <span className="text-xs text-muted-foreground">{row.costStatus === "estimated" ? uiT("ui:messages.m_b774599a9cd1f9a7") : "Reported"}</span>}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
export function DecisionHistory({ companyId, from, to }: { companyId: string; from?: string | null; to?: string | null }) {
  const query = useQuery({ queryKey: ["decision-history", companyId, from, to], queryFn: () => decisionModelsApi.history(companyId, from, to), refetchInterval: q => q.state.data?.some(row => row.status === "running") ? 5000 : false });
  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading decision requests…</p>;
  if (query.error) return <div role="alert" className="space-y-2"><p className="text-sm text-destructive">Could not load decision requests.</p><Button variant="outline" onClick={() => void query.refetch()}>{uiT("ui:messages.m_d8b8392e2c542950")}</Button></div>;
  return <DecisionHistoryTable entries={query.data ?? []} />;
}

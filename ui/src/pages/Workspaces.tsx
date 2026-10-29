import { t as uiT } from "@/i18n";
import { useEffect, useMemo } from "react";
import { Link, Navigate } from "@/lib/router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { WorkspaceOverviewItem } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { instanceSettingsApi } from "../api/instanceSettings";
import { ProjectWorkspacesContent } from "../components/ProjectWorkspacesContent";
import { SummarySlotCard } from "../components/SummarySlotCard";
import { PageSkeleton } from "../components/PageSkeleton";
import { QueryErrorState, useQueryView } from "../components/QueryView";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import type { ProjectWorkspaceSummary } from "../lib/project-workspaces-tab";
import { queryKeys } from "../lib/queryKeys";
import { projectRouteRef } from "../lib/utils";

type ProjectWorkspaceGroup = {
  projectId: string | null;
  projectName: string;
  projectRef: string | null;
  summaries: ProjectWorkspaceSummary[];
  lastUpdatedAt: Date;
  runningServiceCount: number;
};

function overviewItemToSummary(item: WorkspaceOverviewItem): ProjectWorkspaceSummary {
  return {
    key: item.key,
    kind: item.kind,
    workspaceId: item.workspaceId,
    workspaceName: item.workspaceName,
    cwd: item.cwd,
    branchName: item.branchName,
    lastUpdatedAt: item.lastUpdatedAt,
    projectWorkspaceId: item.projectWorkspaceId,
    executionWorkspaceId: item.executionWorkspaceId,
    executionWorkspaceStatus: item.executionWorkspaceStatus,
    serviceCount: item.serviceCount,
    runningServiceCount: item.runningServiceCount,
    primaryServiceUrl: item.primaryServiceUrl,
    primaryServiceUrlRunning: item.primaryServiceUrlRunning,
    hasRuntimeConfig: item.hasRuntimeConfig,
    linkedIssueCount: item.linkedIssueCount,
    issues: item.linkedIssues,
  };
}

function buildProjectWorkspaceGroups(items: WorkspaceOverviewItem[]): ProjectWorkspaceGroup[] {
  const groups = new Map<string | null, ProjectWorkspaceGroup>();
  for (const item of items) {
    const existing = groups.get(item.projectId);
    const summary = overviewItemToSummary(item);
    if (existing) {
      existing.summaries.push(summary);
      if (summary.lastUpdatedAt.getTime() > existing.lastUpdatedAt.getTime()) {
        existing.lastUpdatedAt = summary.lastUpdatedAt;
      }
      existing.runningServiceCount += summary.runningServiceCount;
      continue;
    }
    groups.set(item.projectId, {
      projectId: item.projectId,
      projectName: item.projectName ?? "Task workspaces",
      projectRef: item.projectId ? projectRouteRef({ id: item.projectId, name: item.projectName ?? "Project", urlKey: item.projectUrlKey }) : null,
      summaries: [summary],
      lastUpdatedAt: summary.lastUpdatedAt,
      runningServiceCount: summary.runningServiceCount,
    });
  }

  return [...groups.values()].sort((a, b) => {
    const runningDiff = b.runningServiceCount - a.runningServiceCount;
    if (runningDiff !== 0) return runningDiff;
    const updatedDiff = b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime();
    return updatedDiff !== 0 ? updatedDiff : a.projectName.localeCompare(b.projectName);
  });
}

export function Workspaces() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const experimentalSettingsQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const experimentalSettingsView = useQueryView(experimentalSettingsQuery);
  const isolatedWorkspacesEnabled = experimentalSettingsQuery.data?.enableIsolatedWorkspaces === true;

  const overviewQuery = useInfiniteQuery({
    queryKey: selectedCompanyId
      ? queryKeys.executionWorkspaces.overview(selectedCompanyId)
      : ["execution-workspaces", "__workspaces-overview__", "disabled"],
    queryFn: ({ pageParam }) => executionWorkspacesApi.listOverview(selectedCompanyId!, { offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: Boolean(selectedCompanyId && isolatedWorkspacesEnabled),
  });
  const overviewView = useQueryView(overviewQuery);

  useEffect(() => {
    setBreadcrumbs([{ label: uiT("ui:messages.m_1377264ba3b0a717") }]);
  }, [setBreadcrumbs]);

  const overviewPages = overviewQuery.data?.pages ?? [];
  const overviewItems = useMemo(
    () => overviewPages.flatMap((page) => page.items),
    [overviewPages],
  );
  const groups = useMemo(() => buildProjectWorkspaceGroups(overviewItems), [overviewItems]);
  const firstPage = overviewPages[0] ?? null;
  const totalWorkspaceCount = firstPage?.total ?? overviewItems.length;
  const dataLoading = overviewQuery.isLoading || overviewView.kind === "reconnecting";
  const error = overviewQuery.error as Error | null;

  // An outage before the settings load must not redirect away as "disabled".
  if (experimentalSettingsQuery.isLoading || experimentalSettingsView.kind === "reconnecting") {
    return <PageSkeleton variant="detail" />;
  }
  // Nor must a failed settings load: with no settings there is no flag to read.
  if (experimentalSettingsView.kind === "error" && experimentalSettingsQuery.data === undefined) {
    return (
      <QueryErrorState
        size="page"
        error={experimentalSettingsQuery.error}
        action="load workspaces"
        onRetry={experimentalSettingsView.retry}
        retrying={experimentalSettingsView.isFetching}
      />
    );
  }
  if (!isolatedWorkspacesEnabled) return <Navigate to="/issues" replace />;
  if (dataLoading) return <PageSkeleton variant="list" />;
  if (overviewView.kind === "error") {
    return <QueryErrorState size="page" error={error} action="load workspaces" onRetry={overviewView.retry} retrying={overviewView.isFetching} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{uiT("ui:messages.m_1377264ba3b0a717")}</h2>
      </div>

      <SummarySlotCard
        companyId={selectedCompanyId}
        scopeKind="workspaces_overview"
        title={uiT("ui:messages.m_970a90e91e265ab9")}
        description={uiT("ui:messages.m_e12879046be5553c")}
      />

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_f7bf9843700ea80f")}</p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.projectId ?? "task-workspaces"} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  {group.projectRef ? <Link
                    to={`/projects/${group.projectRef}/workspaces`}
                    className="text-base font-semibold hover:underline"
                  >
                    {group.projectName}
                  </Link> : <h3 className="text-base font-semibold">{group.projectName}</h3>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {group.summaries.length}{uiT("ui:messages.m_4be0369b18383e64")}{group.summaries.length === 1 ? "" : uiT("ui:messages.m_043a718774c572bd")}
                </span>
              </div>
              <ProjectWorkspacesContent
                companyId={selectedCompanyId!}
                projectId={group.projectId}
                projectRef={group.projectRef}
                summaries={group.summaries}
              />
            </section>
          ))}
          {overviewQuery.hasNextPage ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_7282e1fbb2c6d34c")}{overviewItems.length}{uiT("ui:messages.m_a4282e4b2298b90b")}{totalWorkspaceCount}{uiT("ui:messages.m_fa147e43c4b6171e")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void overviewQuery.fetchNextPage()}
                disabled={overviewQuery.isFetchingNextPage}
              >
                {overviewQuery.isFetchingNextPage ? uiT("ui:messages.m_47d2a515ef2f05b8") : uiT("ui:messages.m_ac8991ef01019cf5")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

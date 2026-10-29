import { t as uiT } from "@/i18n";
import type { AgentAppearance } from "@paperclipai/shared";
import { AgentAvatar } from "@/components/AgentAvatar";
import type { ReactNode } from "react";
import { MoreHorizontal, Play } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

export type RoutineListProjectSummary = {
  name: string;
  color?: string | null;
};

export type RoutineListAgentSummary = {
  id?: string;
  appearance?: AgentAppearance | null;
  name: string;
  icon?: string | null;
};

export type RoutineListRowItem = {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  assigneeAgentId: string | null;
  lastRun?: {
    triggeredAt?: Date | string | null;
    status?: string | null;
  } | null;
};

export function formatLastRunTimestamp(value: Date | string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export function formatRoutineRunStatus(value: string | null | undefined) {
  if (!value) return null;
  return value.replaceAll("_", " ");
}

export function nextRoutineStatus(currentStatus: string, enabled: boolean) {
  if (currentStatus === "archived" && enabled) return "active";
  return enabled ? "active" : "paused";
}

export function RoutineListRow<TRoutine extends RoutineListRowItem>({
  routine,
  projectById,
  agentById,
  runningRoutineId,
  statusMutationRoutineId,
  href,
  configureLabel = "Edit",
  managedByLabel,
  secondaryDetails,
  runNowButton = false,
  disableRunNow = false,
  disableToggle = false,
  hideArchiveAction = false,
  divider = true,
  selected = false,
  selectMode = false,
  extraMenuItems,
  onSelectChange,
  onRunNow,
  onToggleEnabled,
  onToggleArchived,
}: {
  routine: TRoutine;
  projectById: Map<string, RoutineListProjectSummary>;
  agentById: Map<string, RoutineListAgentSummary>;
  runningRoutineId: string | null;
  statusMutationRoutineId: string | null;
  href: string;
  configureLabel?: string;
  managedByLabel?: string | null;
  secondaryDetails?: ReactNode;
  runNowButton?: boolean;
  disableRunNow?: boolean;
  disableToggle?: boolean;
  hideArchiveAction?: boolean;
  /** Render a bottom divider between consecutive rows. Off when the group is its own card. */
  divider?: boolean;
  selected?: boolean;
  selectMode?: boolean;
  extraMenuItems?: ReactNode;
  onSelectChange?: (routine: TRoutine, selected: boolean) => void;
  onRunNow: (routine: TRoutine) => void;
  onToggleEnabled: (routine: TRoutine, enabled: boolean) => void;
  onToggleArchived?: (routine: TRoutine) => void;
}) {
  const enabled = routine.status === "active";
  const isArchived = routine.status === "archived";
  const isStatusPending = statusMutationRoutineId === routine.id;
  const project = routine.projectId ? projectById.get(routine.projectId) ?? null : null;
  const agent = routine.assigneeAgentId ? agentById.get(routine.assigneeAgentId) ?? null : null;
  const isDraft = !isArchived && !routine.assigneeAgentId;
  const runDisabled = runningRoutineId === routine.id || isArchived || disableRunNow;

  return (
    <Link
      to={href}
      className={`group flex flex-col gap-3 px-3 py-3 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center no-underline text-inherit${
        divider ? " border-b border-border last:border-b-0" : ""
      }`}
    >
      {selectMode ? (
        <div
          className="flex items-start pt-0.5 sm:pt-1"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={selected}
            aria-label={uiT("ui:messages.m_58661820dfdc4c9f", { v0: (routine.title) })}
            onChange={(event) => onSelectChange?.(routine, event.target.checked)}
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{routine.title}</span>
          {(isArchived || routine.status === "paused" || isDraft) ? (
            <span className="text-xs text-muted-foreground">
              {isArchived ? uiT("ui:messages.m_dd9e881230ebf6e0") : isDraft ? "draft" : uiT("ui:messages.m_a7a9dc5bcf71adb2")}
            </span>
          ) : null}
          {managedByLabel ? (
            <span className="text-xs text-muted-foreground">{managedByLabel}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: project?.color ?? "var(--project-none)" }}
            />
            <span>{routine.projectId ? (project?.name ?? uiT("ui:messages.m_ed51cfeff0d96984")) : uiT("ui:messages.m_f34c2be0d1c5f562")}</span>
          </span>
          <span className="flex items-center gap-2">
            {routine.assigneeAgentId ? <AgentAvatar agent={{ ...agent, id: routine.assigneeAgentId }} size={16} className="h-3.5 w-3.5 shrink-0"/> : null}
            <span>{routine.assigneeAgentId ? (agent?.name ?? uiT("ui:messages.m_342b4ab21e2eb31a")) : "No default agent"}</span>
          </span>
          <span>
            {formatLastRunTimestamp(routine.lastRun?.triggeredAt)}
            {routine.lastRun ? ` · ${formatRoutineRunStatus(routine.lastRun.status)}` : ""}
          </span>
        </div>
        {secondaryDetails ? (
          <div className="text-xs text-muted-foreground">{secondaryDetails}</div>
        ) : null}
      </div>

      <div className="flex items-center gap-3" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        {runNowButton ? (
          <Button
            variant="outline"
            size="sm"
            disabled={runDisabled}
            onClick={() => onRunNow(routine)}
          >
            <Play className="h-3.5 w-3.5" />
            {runningRoutineId === routine.id ? uiT("ui:messages.m_4977a7e5bb3675c4") : uiT("ui:messages.m_0991397702fabb40")}
          </Button>
        ) : null}

        <div className="flex items-center gap-3">
          <ToggleSwitch
            size="lg"
            checked={enabled}
            onCheckedChange={() => onToggleEnabled(routine, enabled)}
            disabled={isStatusPending || isArchived || disableToggle}
            aria-label={enabled ? `Disable ${routine.title}` : `Enable ${routine.title}`}
          />
          <span className="w-12 text-xs text-muted-foreground">
            {isArchived ? uiT("ui:messages.m_bdb86505f8062d15") : isDraft ? uiT("ui:messages.m_ebf12ef47cf575b3") : enabled ? uiT("ui:messages.m_130011756125313c") : uiT("ui:messages.m_ca7981b46ecf2c17")}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={uiT("ui:messages.m_5057a73d4a150414", { v0: (routine.title) })}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={href}>{configureLabel}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={runDisabled}
              onClick={() => onRunNow(routine)}
            >
              {runningRoutineId === routine.id ? uiT("ui:messages.m_4977a7e5bb3675c4") : uiT("ui:messages.m_0991397702fabb40")}
            </DropdownMenuItem>
            {extraMenuItems ? (
              <>
                <DropdownMenuSeparator />
                {extraMenuItems}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggleEnabled(routine, enabled)}
              disabled={isStatusPending || isArchived || disableToggle}
            >
              {enabled ? uiT("ui:messages.m_858e4ba7a29fd38b") : uiT("ui:messages.m_5342e09f2729fbc6")}
            </DropdownMenuItem>
            {!hideArchiveAction && onToggleArchived ? (
              <DropdownMenuItem
                onClick={() => onToggleArchived(routine)}
                disabled={isStatusPending}
              >
                {routine.status === "archived" ? uiT("ui:messages.m_a76e13b9839270eb") : uiT("ui:messages.m_66f4804ee23ddc09")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  );
}

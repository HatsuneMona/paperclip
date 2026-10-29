import { t as uiT } from "@/i18n";
import { ArrowUpDown, Check, Layers, Plus } from "lucide-react";
import { Link } from "@/lib/router";
import { ToolbarSearch } from "./ToolbarSearch";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export type RoutineGroupBy = "folder" | "none" | "project" | "assignee";
export type RoutineSortField = "updated" | "created" | "title" | "lastRun";
export type RoutineSortDir = "asc" | "desc";

export function RoutinesToolbar({ query, onQueryChange, sortField, sortDir, groupBy, onSortChange, onGroupChange, onNewFolder, onCreateRoutine, runsHref, selectMode, onToggleSelect }: {
  query: string;
  onQueryChange: (value: string) => void;
  sortField: RoutineSortField;
  sortDir: RoutineSortDir;
  groupBy: RoutineGroupBy;
  onSortChange: (field: RoutineSortField, direction: RoutineSortDir) => void;
  onGroupChange: (value: RoutineGroupBy) => void;
  onNewFolder?: () => void;
  onCreateRoutine: () => void;
  runsHref?: string;
  selectMode?: boolean;
  onToggleSelect?: () => void;
}) {
  return <div data-canonical-toolbar="routines" role="toolbar" aria-label="Routines controls" className="flex flex-wrap items-center gap-4">
    <ToolbarSearch query={query} onQueryChange={onQueryChange} label="Search routines" placeholder="Search routines…" />
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={uiT("ui:messages.m_bec69036aa27e7fa")}>
          <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
          <span >{uiT("ui:messages.m_bec69036aa27e7fa")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-0">
        <div className="p-2 space-y-0.5">
          {([
            ["updated", "Updated"],
            ["created", "Created"],
            ["lastRun", "Last run"],
            ["title", "Title"],
          ] as const).map(([field, label]) => (
            <button
                type="button"
              key={field}
              className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                sortField === field
                  ? "bg-accent/50 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
              onClick={() => {
                onSortChange(field, sortField === field
                  ? (sortDir === "asc" ? "desc" : "asc")
                  : (field === "title" ? "asc" : "desc"));
              }}
            >
              <span>{label}</span>
              {sortField === field ? (
                <span className="text-xs text-muted-foreground">
                  {sortDir === "asc" ? uiT("ui:messages.m_cddeba5cfc9a05ad") : uiT("ui:messages.m_5c4419a6999d2a7a")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={uiT("ui:messages.m_34ca0e76608842ff")}>
          <Layers className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
          <span >{uiT("ui:messages.m_34ca0e76608842ff")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-0">
        <div className="p-2 space-y-0.5">
          {([
            ["folder", "Folder"],
            ["project", "Project"],
            ["assignee", "Agent"],
            ["none", "None"],
          ] as const).map(([value, label]) => (
            <button
                type="button"
              key={value}
              className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                groupBy === value
                  ? "bg-accent/50 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
              onClick={() => onGroupChange(value)}
            >
              <span>{label}</span>
              {groupBy === value ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
    <div className="design-toolbar-actions">
      {onToggleSelect && <Button variant="outline" size="sm" onClick={onToggleSelect}>{selectMode ? uiT("ui:messages.m_11a6767d5674c7e4") : uiT("ui:messages.m_2a78025de6aae5e7")}</Button>}
      {runsHref && <Button variant="outline" size="sm" asChild><Link data-toolbar-control to={runsHref}>{uiT("ui:messages.m_346de5a03a7af536")}</Link></Button>}
      {onNewFolder && <Button variant="outline" size="sm" onClick={onNewFolder}><Plus className="h-4 w-4" />{uiT("ui:messages.m_cf28f49ec597a6ed")}</Button>}
      <Button variant="outline" size="sm" data-toolbar-primary onClick={onCreateRoutine}><Plus className="h-4 w-4" />{uiT("ui:messages.m_f0fe070861695af8")}</Button>
    </div>
  </div>;
}

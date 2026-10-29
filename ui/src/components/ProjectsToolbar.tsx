import { t as uiT } from "@/i18n";
import { ArrowUpDown, Check, Plus } from "lucide-react";
import { ToolbarSearch } from "./ToolbarSearch";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export type ProjectSortField = "name" | "updated" | "created" | "targetDate";
export type ProjectSortDir = "asc" | "desc";

const PROJECT_SORT_OPTIONS: Array<{ field: ProjectSortField; label: string }> = [
  { field: "name", label: uiT("ui:messages.m_dcd1d5223f73b3a9") },
  { field: "updated", label: uiT("ui:messages.m_3a5ecca188c0579c") },
  { field: "created", label: uiT("ui:messages.m_d70b9e24bca26b40") },
  { field: "targetDate", label: uiT("ui:messages.m_834cc86be240611d") },
];

/** Canonical project search, sorting and creation controls. State stays with the page. */
export function ProjectsToolbar({ query, onQueryChange, sortField, sortDir, onSortChange, onNewProject: openNewProject }: {
  query: string;
  onQueryChange: (value: string) => void;
  sortField: ProjectSortField;
  sortDir: ProjectSortDir;
  onSortChange: (field: ProjectSortField, direction: ProjectSortDir) => void;
  onNewProject: () => void;
}) {
  const sortLabel = PROJECT_SORT_OPTIONS.find(option => option.field === sortField)?.label ?? "Name";
  return <div data-canonical-toolbar="projects" role="toolbar" aria-label="Projects controls" className="flex flex-wrap items-center gap-4">
    <ToolbarSearch query={query} onQueryChange={onQueryChange} label="Search projects" placeholder="Search projects…" />
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={uiT("ui:messages.m_bec69036aa27e7fa")}>
          <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
          <span>{uiT("ui:messages.m_a2bdb6210584750c")}{sortLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-0">
        <div className="p-2 space-y-0.5">
          {PROJECT_SORT_OPTIONS.map((option) => (
            <button
              key={option.field}
              type="button"
              className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                sortField === option.field
                  ? "bg-accent/50 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
              onClick={() => {
                onSortChange(option.field, sortField === option.field
                  ? (sortDir === "asc" ? "desc" : "asc")
                  : (option.field === "name" || option.field === "targetDate" ? "asc" : "desc"));
              }}
            >
              <span>{option.label}</span>
              {sortField === option.field ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3 w-3" />
                  {sortDir === "asc" ? uiT("ui:messages.m_cddeba5cfc9a05ad") : uiT("ui:messages.m_5c4419a6999d2a7a")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
    <div className="design-toolbar-actions">
      <Button size="sm" variant="outline" data-toolbar-primary onClick={openNewProject}>
          <Plus className="h-4 w-4 mr-1" />{uiT("ui:messages.m_44b7ce21b9f2b32c")}</Button>
    </div>
  </div>;
}

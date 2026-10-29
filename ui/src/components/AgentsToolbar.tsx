import { t as uiT } from "@/i18n";
import { List, Network, Plus } from "lucide-react";
import { ToolbarSearch } from "./ToolbarSearch";
import { Button } from "./ui/button";

export interface AgentsToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  view: "list" | "org";
  onViewChange: (value: "list" | "org") => void;
  hideViewToggle?: boolean;
  onNewAgent: () => void;
}

/** Shared roster search, view controls and actions for the page and stories. */
export function AgentsToolbar({ query, onQueryChange, view, onViewChange, hideViewToggle, onNewAgent }: AgentsToolbarProps) {
  return <div data-canonical-toolbar="agents" role="toolbar" aria-label="Agents controls" className="flex flex-wrap items-center gap-3">
    <div className="design-toolbar-controls flex w-full flex-wrap items-center gap-4">
      <ToolbarSearch query={query} onQueryChange={onQueryChange} label="Search agents" placeholder={uiT("ui:messages.m_e05cb78e973da372")} />
      {!hideViewToggle && <div className="design-view-toggle" role="group" aria-label={uiT("ui:messages.m_c26e47e839f072c8")}>
          <Button type="button" size="icon-sm" variant={view === "list" ? "secondary" : "ghost"} className="design-toolbar-icon" onClick={() => onViewChange("list")} title={uiT("ui:messages.m_5d8c3e1b635eed6f")} aria-label={uiT("ui:messages.m_5d8c3e1b635eed6f")} aria-pressed={view === "list"}><List aria-hidden /></Button>
          <Button type="button" size="icon-sm" variant={view === "org" ? "secondary" : "ghost"} className="design-toolbar-icon" onClick={() => onViewChange("org")} title={uiT("ui:messages.m_a33c82404434fb9d")} aria-label={uiT("ui:messages.m_a33c82404434fb9d")} aria-pressed={view === "org"}><Network aria-hidden /></Button>
      </div>}
      <div className="design-toolbar-actions">
        <Button size="sm" variant="outline" data-toolbar-primary onClick={onNewAgent}><Plus aria-hidden />{uiT("ui:messages.m_c548aab130f7e7dd")}</Button>
      </div>
    </div>
  </div>;
}

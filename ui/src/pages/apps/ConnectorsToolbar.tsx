import { t as uiT } from "@/i18n";
import { ToolbarSearch } from "@/components/ToolbarSearch";
import { CatalogSourceFilters, type CatalogSource } from "./CatalogSourceFilters";

/** Shared catalog search and source filters; data and scope changes stay in Browse. */
export function ConnectorsToolbar({ query, onQueryChange, source, onSourceChange }: {
  query: string;
  onQueryChange: (value: string) => void;
  source: CatalogSource;
  onSourceChange: (value: CatalogSource) => void;
}) {
  return <header data-canonical-toolbar="connectors" role="toolbar" aria-label="Connectors controls" className="flex flex-wrap items-center gap-3">
    <div className="w-full">
      <ToolbarSearch query={query} onQueryChange={onQueryChange} label={uiT("ui:messages.m_706a6068c6a0dcbe")} placeholder={uiT("ui:messages.m_fad7e42dfd243a0f")} inputType="search" />
    </div>
    <CatalogSourceFilters source={source} onChange={onSourceChange} />
  </header>;
}

import { t as uiT } from "@/i18n";
import type { ReactNode } from "react";
import { Check, Layers } from "lucide-react";
import type { ArtifactGroupBy, ArtifactKindFilter } from "@/api/artifacts";
import { TabFilters, type TabSize } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { ToolbarSearch } from "@/components/ToolbarSearch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const ARTIFACT_KIND_FILTERS: { value: ArtifactKindFilter; label: string }[] = [
  { value: "all", label: uiT("ui:messages.m_a52ace420f2175d0") },
  { value: "image", label: uiT("ui:messages.m_be7e2f20129365c2") },
  { value: "video", label: uiT("ui:messages.m_c9a9639463c21952") },
  { value: "document", label: uiT("ui:messages.m_b4e929d8bcfe0418") },
  { value: "text", label: uiT("ui:messages.m_71988c4d8e0803ba") },
  { value: "file", label: uiT("ui:messages.m_abc7e9892806b047") },
];

export const ARTIFACT_GROUP_OPTIONS: { value: ArtifactGroupBy; label: string }[] = [
  { value: "none", label: uiT("ui:messages.m_dc937b59892604f5") },
  { value: "task", label: uiT("ui:messages.m_4bc74b21357c6cf5") },
  { value: "parent_task", label: uiT("ui:messages.m_fb8d859156cd03a0") },
];

export function artifactGroupByLabel(value: ArtifactGroupBy): string {
  return ARTIFACT_GROUP_OPTIONS.find((option) => option.value === value)?.label ?? "None";
}

/** Canonical collection filters; compact standalone, standard in the toolbar. */
export function ArtifactKindFilters({ kind, onKindChange, size = "compact" }: { kind: ArtifactKindFilter; onKindChange: (value: ArtifactKindFilter) => void; size?: TabSize }) {
  return <TabFilters items={ARTIFACT_KIND_FILTERS} value={kind} onValueChange={onKindChange} size={size} label={uiT("ui:messages.m_ff8bce095215ebd7")} />;
}

export interface ArtifactsToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  groupBy: ArtifactGroupBy;
  onGroupByChange: (value: ArtifactGroupBy) => void;
  kind: ArtifactKindFilter;
  onKindChange: (value: ArtifactKindFilter) => void;
  /** Replaces the kind filter row (Artifacts V1 shows its own view tabs). */
  filters?: ReactNode;
}

/** Shared shipped Artifacts controls. Canonical proposal: Components / Toolbars / Artifacts. */
export function ArtifactsToolbar({ query: draftQuery, onQueryChange: setDraftQuery, groupBy, onGroupByChange: selectGroupBy, kind, onKindChange: selectKind, filters }: ArtifactsToolbarProps) {
  const grouping = groupBy !== "none";
  return (
    <div data-canonical-toolbar="artifacts" role="toolbar" aria-label="Artifacts controls" className="flex flex-col items-start gap-4">
      <div className="design-toolbar-controls flex w-full flex-wrap items-center gap-4">
        <ToolbarSearch query={draftQuery} onQueryChange={setDraftQuery} label={uiT("ui:messages.m_c71436cce0eb861d")} placeholder="Search artifacts…" clearLabel="Clear artifact search" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={uiT("ui:messages.m_a8179bab12e3f49c", { v0: (artifactGroupByLabel(groupBy)) })}
              title={uiT("ui:messages.m_49a9799e9ea9f87c")}
              data-testid="artifact-group-control"
              data-group-by={groupBy}
              data-active={grouping}
              className={cn("h-8 w-8 shrink-0", grouping && "bg-accent")}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>{uiT("ui:messages.m_956a51f6b098a41b")}</DropdownMenuLabel>
            {ARTIFACT_GROUP_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`artifact-group-option-${option.value}`}
                aria-selected={groupBy === option.value}
                onSelect={() => selectGroupBy(option.value)}
                className="justify-between"
              >
                {option.label}
                {groupBy === option.value ? <Check className="h-3.5 w-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {filters ?? <ArtifactKindFilters kind={kind} onKindChange={selectKind} size="standard" />}
    </div>
  );
}

import { t as uiT } from "@/i18n";
import { AlertTriangle } from 'lucide-react';
import type { SkillRepositoryPackage, SkillSourceCandidate } from '@paperclipai/shared';

export function skillImportWarnings(candidates: Pick<SkillSourceCandidate, 'path' | 'error' | 'inspection'>[], repositoryPackage?: SkillRepositoryPackage | null, warnings: string[] = []) {
  return [...new Set([
    ...warnings,
    ...(repositoryPackage?.warnings ?? []),
    ...(repositoryPackage?.error ? [repositoryPackage.error] : []),
    ...candidates.flatMap(candidate => [
      ...(candidate.error ? [`${candidate.path} — Needs setup: ${candidate.error}`] : []),
      ...(candidate.inspection?.warnings.filter(warning => warning.includes('not included') || warning.includes('couldn’t be included')) ?? []),
      ...(candidate.inspection?.references.map(reference => `${reference.resolvedPath} — Not included; referenced by ${candidate.path}.`) ?? []),
    ]),
  ])];
}

/** Import warnings disclose omissions without creating another decision. */
export function SkillImportWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return <details className="text-sm" aria-label={uiT("ui:messages.m_39b2572fa78db656")}>
    <summary className="cursor-pointer text-muted-foreground"><span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" />{warnings.length} import {warnings.length === 1 ? uiT("ui:messages.m_4bd9354bb6522334") : uiT("ui:messages.m_227690d7c3030c81")}</span></summary>
    <ul className="mt-2 space-y-2 text-xs text-muted-foreground">{warnings.map(warning => <li className="break-words" key={warning}>{warning}</li>)}</ul>
  </details>;
}

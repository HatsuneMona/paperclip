import { t as uiT } from "@/i18n";
import { useState, type MouseEvent } from "react";
import type { Issue, IssueLockedStub } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { LockedIssueChip, isLockedIssueStub } from "../LockedIssueChip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { StatusIcon } from "../StatusIcon";

export function RemovableIssueReferencePill({
  issue,
  onRemove,
  isMobile = false,
}: {
  issue: NonNullable<Issue["blockedBy"]>[number] | IssueLockedStub;
  onRemove: (issueId: string) => void;
  isMobile?: boolean;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const locked = isLockedIssueStub(issue);
  const issueLabel = locked
    ? issue.identifier ?? "Private task"
    : issue.identifier ?? issue.title;
  const confirmLabel = locked
    ? issue.identifier ?? "this private task"
    : issue.identifier
      ? uiT("ui:messages.m_4e0f4981482faaa7", { v0: (issue.identifier), v1: (issue.title) })
      : issue.title;
  const chipClassName = cn(
    "paperclip-mention-chip paperclip-mention-chip--issue",
    "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs no-underline",
    !locked && issue.identifier && "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-(length:--rad-3) focus-visible:ring-ring",
  );
  // A private blocker referenced from a task you *can* see: show the locked chip
  // (never a title/link) but keep the detach affordance so you aren't stuck
  // blocked by something invisible.
  const content = locked ? (
    <LockedIssueChip identifier={issue.identifier} />
  ) : (
    <>
      <StatusIcon status={issue.status} className="h-3 w-3 shrink-0" />
      <span className="truncate">{issueLabel}</span>
    </>
  );
  const removeLabel = `Remove ${issueLabel} as blocker`;
  const openRemoveConfirmation = () => setIsConfirmOpen(true);
  const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openRemoveConfirmation();
  };
  const confirmRemove = () => {
    onRemove(issue.id);
    setIsConfirmOpen(false);
  };

  return (
    <>
      <span className="group relative inline-flex">
        {isMobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-mention-kind="issue"
                className={chipClassName}
                title={locked ? "Private task" : issue.title}
                aria-label={uiT("ui:messages.m_522221c19ec88cfb", { v0: (issueLabel) })}
              >
                {content}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {!locked && issue.identifier ? (
                <DropdownMenuItem asChild>
                  <Link to={`/issues/${issue.identifier}`}>
                    <ArrowUpRight className="h-4 w-4" />{uiT("ui:messages.m_ecacc67b009d5b68")}</Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem variant="destructive" onSelect={openRemoveConfirmation}>
                <X className="h-4 w-4" />{uiT("ui:messages.m_76792aa60019fa0e")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <button
              type="button"
              className="absolute -right-1 -top-1 z-10 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-colors transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-(length:--rad-2) focus-visible:ring-ring group-hover:opacity-100"
              aria-label={removeLabel}
              title={removeLabel}
              onClick={handleRemove}
            >
              <X className="h-3 w-3" />
            </button>
            {locked ? (
              content
            ) : issue.identifier ? (
              <Link
                to={`/issues/${issue.identifier}`}
                data-mention-kind="issue"
                className={chipClassName}
                title={issue.title}
                aria-label={uiT("ui:messages.m_e4eb199f7a70b94b", { v0: (issueLabel), v1: (issue.title) })}
              >
                {content}
              </Link>
            ) : (
              <span
                data-mention-kind="issue"
                className={chipClassName}
                title={issue.title}
                aria-label={uiT("ui:messages.m_4d9fe20eef4b42cd", { v0: (issue.title) })}
              >
                {content}
              </span>
            )}
          </>
        )}
      </span>
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{uiT("ui:messages.m_b7d963b0caf9a632")}</DialogTitle>
            <DialogDescription>{uiT("ui:messages.m_5948954e3b49be94")}{confirmLabel}{uiT("ui:messages.m_3b94139c92f09956")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{uiT("ui:messages.m_19766ed6ccb2f4a3")}</Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={confirmRemove}>{uiT("ui:messages.m_76792aa60019fa0e")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExpandRelationListButton({
  hiddenCount,
  expanded,
  onClick,
}: {
  hiddenCount: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (!expanded && hiddenCount <= 0) return null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      onClick={onClick}
      aria-label={expanded ? uiT("ui:messages.m_b908f492c1d3015c") : uiT("ui:messages.m_21153fcbaa7805bf", { v0: (hiddenCount) })}
    >
      {expanded ? uiT("ui:messages.m_94ea9b1d33a02975") : uiT("ui:messages.m_df1508f6fa103813", { v0: (hiddenCount) })}
    </button>
  );
}

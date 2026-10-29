import { t as uiT } from "@/i18n";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Agent } from "@paperclipai/shared";
import { AlertTriangle, ArrowUpRight, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Clock, ExternalLink, FileText, GitBranch, ImagePlus, KeyRound, Loader2, MessageSquareQuote, MinusCircle, ShieldAlert, ThumbsUp, TriangleAlert, Wrench, X, XCircle } from "lucide-react";
import { Link } from "@/lib/router";
import { formatAssigneeUserLabel } from "../lib/assignees";
import { describeInteractionAudience, type InteractionAudienceDescription } from "../lib/interaction-audience";
import { interactionResolutionErrorMessage } from "../lib/interaction-resolution-error";
import { buildDocumentAnnotationHash } from "../lib/document-annotation-hash";
import { itemVerdictHref } from "@/lib/item-verdict-links";
import {
  isInteractionPreparingApproval,
  buildSuggestedTaskTree,
  collectSuggestedTaskClientKeys,
  countSuggestedTaskNodes,
  getCheckboxConfirmationSelectedLabels,
  getItemVerdictProgress,
  getQuestionAnswerLabels,
  shouldHideInteractionCard,
  normalizeRequestConfirmationTargetHref,
  type AskUserQuestionsAnswer,
  type AskUserQuestionsInteraction,
  type IssueThreadInteraction,
  type RequestCheckboxConfirmationInteraction,
  type RequestConfirmationInteraction,
  type RequestConfirmationTarget,
  type RequestItemVerdictsInteraction,
  type RequestItemVerdictsItem,
  type RequestItemVerdictsResultItem,
  type RequestItemVerdictValue,
  type SuggestTasksInteraction,
  type SuggestTasksResultCreatedTask,
  type SuggestedTaskDraft,
  type SuggestedTaskTreeNode,
} from "../lib/issue-thread-interactions";
import { cn, formatDateTime, formatShortDate } from "../lib/utils";
import { InteractionPreparationNotice } from "./InteractionPreparationNotice";
import { InteractionAudienceLine } from "./InteractionAudienceLine";
import { MarkdownBody, type MarkdownExternalReferenceMap } from "./MarkdownBody";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { PriorityIcon } from "./PriorityIcon";
import { SHOW_TASK_PRIORITY_UI } from "../lib/ui-flags";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ProposalJustification } from "../pages/secrets/proposal-review";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AppLogo } from "@/pages/apps/AppLogo";
import { ConnectionIntentInteractionBody } from "@/features/connections/ConnectionIntentInteractionBody";
import { QuestionForm } from "./task-chat/QuestionForm";
import { useCoordinatorWorkspaceEnabled } from "@/hooks/useCoordinatorWorkspaceEnabled";
import { CoordinatorTaskCommitment } from "./coordinator/CoordinatorTaskCommitment";

import { DecisionCardFooter } from "./DecisionCardFooter";

const OTHER_ANSWER_ID = "__paperclip_other__";

/**
 * The card's server-evaluated audience, shared with the per-kind subcards below
 * (PAP-17287). A subcard that catches a rejected resolution needs to name who
 * *can* respond, and re-deriving the audience per subcard would let two parts of
 * the same card describe one policy differently.
 */
const InteractionAudienceContext = createContext<InteractionAudienceDescription | null>(null);

/**
 * Turns a rejected resolution into copy for the inline error region: the
 * server's own denial reason, plus who can respond when the denial is an
 * audience refusal. Never invites a retry that policy will refuse again.
 */
function useResolutionErrorMessage() {
  const audience = useContext(InteractionAudienceContext);
  return (error: unknown) => interactionResolutionErrorMessage(error, audience);
}

/**
 * The inline resolution error. Announced through an `aria-live` region because a
 * denial is the only feedback a failed decision gets — the row stays put and no
 * toast fires on the attention surface.
 *
 * The live region is the *outer* wrapper, mounted whether or not there is a
 * message: a region has to be in the accessibility tree before its content
 * changes for the change to be announced. The styled inner div deliberately
 * carries no `role="alert"` — `alert` is itself an assertive live region, and
 * nesting one inside another makes some screen reader / browser pairs announce
 * the same denial twice (PAP-17289).
 */
function InteractionActionError({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive" data-testid="interaction-action-error">
      {message ? (
        <div className="rounded-sm border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </div>
      ) : null}
    </div>
  );
}

interface IssueThreadInteractionCardProps {
  interaction: IssueThreadInteraction;
  /** Reuse the resolver without the task timeline's audit/header chrome. */
  footerSlot?: ReactNode;
  presentationVariant?: "default" | "coordinator-decision";
  agentMap?: Map<string, Agent>;
  currentUserId?: string | null;
  userLabelMap?: ReadonlyMap<string, string> | null;
  onAcceptInteraction?: (
    interaction:
      | SuggestTasksInteraction
      | RequestConfirmationInteraction
      | RequestCheckboxConfirmationInteraction,
    selectedClientKeys?: string[],
    selectedOptionIds?: string[],
    rememberAction?: boolean,
  ) => Promise<void> | void;
  onRejectInteraction?: (
    interaction:
      | SuggestTasksInteraction
      | RequestConfirmationInteraction
      | RequestCheckboxConfirmationInteraction,
    reason?: string,
  ) => Promise<void> | void;
  onSubmitInteractionAnswers?: (
    interaction: AskUserQuestionsInteraction,
    answers: AskUserQuestionsAnswer[],
  ) => Promise<void> | void;
  onCancelInteraction?: (
    interaction: AskUserQuestionsInteraction,
  ) => Promise<void> | void;
  /** Render confirmation CTAs with the primary action rightmost (task-chat grammar). */
  primaryActionOnRight?: boolean;
  onSubmitInteractionVerdicts?: (
    interaction: RequestItemVerdictsInteraction,
    verdicts: { id: string; verdict: RequestItemVerdictValue; reason?: string }[],
  ) => Promise<void> | void;
  onUploadImage?: (file: File) => Promise<string>;
  externalReferences?: MarkdownExternalReferenceMap;
}

function resolveActorLabel(args: {
  agentId?: string | null;
  userId?: string | null;
  agentMap?: Map<string, Agent>;
  currentUserId?: string | null;
  userLabelMap?: ReadonlyMap<string, string> | null;
}) {
  const { agentId, userId, agentMap, currentUserId, userLabelMap } = args;
  if (agentId) {
    return agentMap?.get(agentId)?.name ?? agentId.slice(0, 8);
  }
  if (userId) {
    return formatAssigneeUserLabel(userId, currentUserId, userLabelMap) ?? "Board";
  }
  return "Unknown";
}

/**
 * Administrative terminal outcomes (P1): an interaction that was withdrawn by
 * its board/agent, or auto-expired when its issue reached a terminal state.
 * Both are stored as `status="cancelled"|"expired"` with the distinguishing
 * fact carried on `result.outcome` (there is no dedicated `withdrawn` status).
 */
function getAdministrativeOutcome(
  interaction: IssueThreadInteraction,
): "withdrawn" | "issue_closed" | null {
  const result = interaction.result;
  if (result && typeof result === "object" && "outcome" in result) {
    const outcome = (result as { outcome?: string | null }).outcome;
    if (outcome === "withdrawn" || outcome === "issue_closed") return outcome;
  }
  return null;
}

function getAdministrativeReason(interaction: IssueThreadInteraction): string | null {
  const result = interaction.result;
  if (result && typeof result === "object" && "reason" in result) {
    const reason = (result as { reason?: string | null }).reason;
    if (typeof reason === "string" && reason.trim().length > 0) return reason.trim();
  }
  return null;
}

function statusLabel(status: IssueThreadInteraction["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "answered":
      return "Answered";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function interactionKindLabel(kind: IssueThreadInteraction["kind"]) {
  switch (kind) {
    case "suggest_tasks":
      return "Suggested tasks";
    case "ask_user_questions":
      return "Ask user questions";
    case "request_confirmation":
      return "Confirmation";
    case "request_checkbox_confirmation":
      return "Checkbox confirmation";
    case "request_item_verdicts":
      return "Item verdicts";
    case "connection_intent":
      return "Connection request";
    default:
      return kind;
  }
}

function statusIcon(status: IssueThreadInteraction["status"]) {
  switch (status) {
    case "accepted":
    case "answered":
      return CheckCircle2;
    case "rejected":
    case "cancelled":
    case "failed":
      return XCircle;
    case "expired":
      return AlertTriangle;
    default:
      return CircleDashed;
  }
}

function statusClasses(status: IssueThreadInteraction["status"]) {
  switch (status) {
    case "accepted":
    case "answered":
      return {
        shell: "border-emerald-400/70 bg-transparent",
        badge: "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100",
      };
    case "rejected":
    case "cancelled":
      return {
        shell: "border-rose-400/70 bg-transparent",
        badge: "border-rose-500/60 bg-rose-500/10 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100",
      };
    case "failed":
    case "expired":
      return {
        shell: "border-amber-400/70 bg-transparent",
        badge: "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
      };
    default:
      return {
        shell: "border-sky-500/70 bg-transparent",
        badge: "border-sky-500/70 bg-sky-500/10 text-sky-900 dark:bg-sky-500/15 dark:text-sky-100",
      };
  }
}

/**
 * A confirmation that targets the issue's `plan` document renders as a distinct
 * plan card (PAP-95g): a full state-coloured outline — violet while in review,
 * green once approved, red when changes are requested (PAP-75 palette) — with no
 * left stripe, so plans stand out from comments and status rows.
 */
function isPlanConfirmation(interaction: IssueThreadInteraction): boolean {
  if (interaction.kind !== "request_confirmation") return false;
  const target = interaction.payload.target;
  return target?.type === "issue_document" && target?.key === "plan";
}

function requestConfirmationResumeFailure(interaction: IssueThreadInteraction) {
  if (interaction.kind !== "request_confirmation" && interaction.kind !== "request_checkbox_confirmation") return null;
  return interaction.result?.resumeFailure ?? null;
}

function planStatusClasses(
  status: IssueThreadInteraction["status"],
  resumeFailure?: ReturnType<typeof requestConfirmationResumeFailure>,
  outcome?: string | null,
) {
  switch (status) {
    case "accepted":
    case "answered":
      if (resumeFailure) {
        return {
          shell: "border-2 border-amber-500/70 bg-transparent",
          badge: "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
          label: uiT("ui:messages.m_03dbaee78a06fbac"),
          Icon: AlertTriangle,
        };
      }
      return {
        shell: "border-2 border-green-500/80 bg-transparent",
        badge: "border-green-500/60 bg-green-500/10 text-green-900 dark:bg-green-500/15 dark:text-green-100",
        label: uiT("ui:messages.m_87b42e40c2a290e0"),
        Icon: CheckCircle2,
      };
    case "rejected":
    case "cancelled":
      return {
        shell: "border-2 border-red-500/80 bg-transparent",
        badge: "border-red-500/60 bg-red-500/10 text-red-900 dark:bg-red-500/15 dark:text-red-100",
        label: outcome === "withdrawn" ? uiT("ui:messages.m_00c0b03fcfa2ac02") : uiT("ui:messages.m_10a92a8ad3ee5891"),
        Icon: XCircle,
      };
    case "failed":
    case "expired":
      return {
        shell: "border-2 border-amber-500/70 bg-transparent",
        badge: "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
        label: uiT("ui:messages.m_424a2551d356754c"),
        Icon: AlertTriangle,
      };
    default:
      return {
        shell: "border-2 border-violet-500/80 bg-transparent",
        badge: "border-violet-500/60 bg-violet-500/10 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100",
        label: uiT("ui:messages.m_c39059141ced2ea7"),
        Icon: FileText,
      };
  }
}

/**
 * A `request_confirmation` that carries a `payload.toolAction` block gates a
 * write/destructive MCP tool call (PAP-13726 §D1). It renders as a dedicated
 * tool-approval card (PAP-13745) instead of the generic confirmation rendering.
 * The governing rule: approve = run, so the card never terminally reads
 * "Accepted" — terminal states are Executed / Failed / Declined / Expired.
 */
function toolActionPayload(
  interaction: IssueThreadInteraction,
): NonNullable<RequestConfirmationInteraction["payload"]["toolAction"]> | null {
  if (interaction.kind !== "request_confirmation") return null;
  return interaction.payload.toolAction ?? null;
}

function isToolActionConfirmation(interaction: IssueThreadInteraction): boolean {
  return toolActionPayload(interaction) != null;
}

function secretProposalPayload(
  interaction: IssueThreadInteraction,
): NonNullable<RequestConfirmationInteraction["payload"]["secretProposal"]> | null {
  if (interaction.kind !== "request_confirmation") return null;
  return interaction.payload.secretProposal ?? null;
}

function isSecretProposalConfirmation(interaction: IssueThreadInteraction): boolean {
  return secretProposalPayload(interaction) != null;
}

/**
 * A `request_confirmation` carrying `payload.connectionAuthorization` is asking
 * one person to connect their own account so an agent can act as them
 * (PAP-17835). It keeps the interaction kind and the server-addressed audience;
 * only the presentation differs, and it reads that presentation from the payload
 * rather than parsing the title string.
 */
function connectionAuthorizationPayload(
  interaction: IssueThreadInteraction,
): NonNullable<RequestConfirmationInteraction["payload"]["connectionAuthorization"]> | null {
  if (interaction.kind !== "request_confirmation") return null;
  return interaction.payload.connectionAuthorization ?? null;
}

/**
 * The five states the connection-authorization card can be read in (PAP-17859).
 *
 * `actionable` and `waiting` are the *same* pending row seen by two different
 * readers: consent belongs to the addressed person alone, so who is looking
 * changes what may be offered — not merely whether a button is greyed out.
 */
type ConnectionAuthorizationCardState =
  | "actionable"
  | "waiting"
  | "connected"
  | "declined"
  | "expired";

function connectionAuthorizationCardState({
  interaction,
  isAddressee,
}: {
  interaction: RequestConfirmationInteraction;
  isAddressee: boolean;
}): ConnectionAuthorizationCardState {
  if (interaction.status === "accepted") return "connected";
  if (interaction.status === "rejected") return "declined";
  if (interaction.status === "pending") return isAddressee ? "actionable" : "waiting";
  // expired / cancelled / failed all mean the same thing to a reader here: the
  // authorization run this card carried is over.
  return "expired";
}

/**
 * True only when the signed-in reader *is* the person the server addressed.
 *
 * Deliberately strict: an unknown viewer (`currentUserId` not loaded yet) is
 * never treated as the addressee, so the Connect action cannot flash into view
 * for someone who may not consent. The server re-authorizes the callback
 * regardless; this only decides what the card offers.
 */
function isConnectionAuthorizationAddressee({
  interaction,
  currentUserId,
}: {
  interaction: RequestConfirmationInteraction;
  currentUserId?: string | null;
}): boolean {
  const addressee = interaction.addresseeUserId;
  if (!addressee || !currentUserId) return false;
  return addressee === currentUserId;
}

/**
 * The authorization URL this card may open, or `null`.
 *
 * A target is offered **only while the interaction is pending**. The server
 * re-upserts this row with a freshly minted `state` every time it starts a new
 * authorization run, so a pending card always carries a live target and a
 * resolved/declined/expired one always carries a spent one. Gating on the
 * status is therefore how "never reuse an expired OAuth URL" is enforced —
 * there is no client-visible expiry on the payload to check instead.
 */
function connectionAuthorizationHref(interaction: RequestConfirmationInteraction): string | null {
  if (interaction.status !== "pending") return null;
  const href = interaction.payload.target?.href;
  if (!href) return null;
  return normalizeRequestConfirmationTargetHref(href);
}

type ToolActionCardState =
  | "pending"
  | "running"
  | "executed"
  | "failed"
  | "cancelled"
  | "declined"
  | "expired";

/**
 * Derives the visible lifecycle state from the interaction status plus the
 * `result.toolAction.status` written back by the gateway. The card must render
 * the resolved state without polling — the lifecycle metadata is authoritative,
 * so an optimistic "running…" reconciles to the server's terminal state.
 */
function toolActionCardState(
  interaction: RequestConfirmationInteraction,
): ToolActionCardState {
  const execStatus = interaction.result?.toolAction?.status ?? null;
  if (interaction.status === "pending") return "pending";
  if (interaction.status === "rejected") return "declined";
  if (interaction.status === "cancelled") return "cancelled";
  if (interaction.status === "expired") return "expired";
  // Terminal execution outcomes take precedence over the coarse interaction
  // status so a self-resolving "running…" advances to its real result.
  if (execStatus === "executed") return "executed";
  if (execStatus === "failed") return "failed";
  if (execStatus === "expired") return "expired";
  if (interaction.status === "failed") return "failed";
  // accepted + approved/executing/unknown → the transient running state.
  return "running";
}

function toolActionStatusClasses(state: ToolActionCardState): {
  shell: string;
  badge: string;
  label: string;
  Icon: typeof CheckCircle2;
  spin?: boolean;
  dimmed?: boolean;
} {
  switch (state) {
    case "running":
      return {
        shell: "border-2 border-amber-500/70 bg-transparent",
        badge: "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
        label: uiT("ui:messages.m_46c541363b0253b1"),
        Icon: Loader2,
        spin: true,
      };
    case "executed":
      return {
        shell: "border-2 border-green-500/80 bg-transparent",
        badge: "border-green-500/60 bg-green-500/10 text-green-900 dark:bg-green-500/15 dark:text-green-100",
        label: uiT("ui:messages.m_3aa8b683ebf3703c"),
        Icon: CheckCircle2,
      };
    case "failed":
      return {
        shell: "border-2 border-amber-500/70 bg-transparent",
        badge: "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
        label: uiT("ui:messages.m_031a8f0f659df890"),
        Icon: XCircle,
      };
    case "declined":
      return {
        shell: "border-2 border-red-500/80 bg-transparent",
        badge: "border-red-500/60 bg-red-500/10 text-red-900 dark:bg-red-500/15 dark:text-red-100",
        label: uiT("ui:messages.m_dce083a2c47ffdc4"),
        Icon: XCircle,
        dimmed: true,
      };
    case "cancelled":
      return { shell: "border-2 border-border bg-transparent", badge: "border-border bg-muted text-muted-foreground", label: uiT("ui:messages.m_d353a99eb4556847"), Icon: XCircle, dimmed: true };
    case "expired":
      return {
        shell: "border-2 border-border bg-transparent",
        badge: "border-border bg-muted/60 text-muted-foreground",
        label: uiT("ui:messages.m_424a2551d356754c"),
        Icon: Clock,
        dimmed: true,
      };
    default:
      return {
        shell: "border-2 border-violet-500/80 bg-transparent",
        badge: "border-violet-500/60 bg-violet-500/10 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100",
        label: uiT("ui:messages.m_ae25c9b1d366d159"),
        Icon: ShieldAlert,
      };
  }
}

function TaskField({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "subtle";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-(length:--text-nano) font-medium uppercase tracking-(--tracking-eyebrow)",
        tone === "default"
          ? "border-border/70 bg-transparent text-foreground"
          : "border-border/60 bg-transparent text-muted-foreground",
      )}
    >
      {label}: {value}
    </span>
  );
}

function createdTaskMap(
  createdTasks: readonly SuggestTasksResultCreatedTask[] | undefined,
) {
  return new Map(
    (createdTasks ?? []).map((entry) => [entry.clientKey, entry] as const),
  );
}

function TaskTreeNode({
  node,
  createdByClientKey,
  agentMap,
  currentUserId,
  userLabelMap,
  depth = 0,
  selectedClientKeys,
  skippedClientKeys,
  showSelection,
  onToggleSelection,
}: {
  node: SuggestedTaskTreeNode;
  createdByClientKey: ReadonlyMap<string, SuggestTasksResultCreatedTask>;
  agentMap?: Map<string, Agent>;
  currentUserId?: string | null;
  userLabelMap?: ReadonlyMap<string, string> | null;
  depth?: number;
  selectedClientKeys?: ReadonlySet<string>;
  skippedClientKeys?: ReadonlySet<string>;
  showSelection?: boolean;
  onToggleSelection?: (node: SuggestedTaskTreeNode, checked: boolean) => void;
}) {
  const visibleChildren = node.children.filter((child) => !child.task.hiddenInPreview);
  const hiddenChildCount = node.children
    .filter((child) => child.task.hiddenInPreview)
    .reduce((sum, child) => sum + countSuggestedTaskNodes(child), 0);
  const createdTask = createdByClientKey.get(node.task.clientKey);
  const isSelected = selectedClientKeys?.has(node.task.clientKey) ?? false;
  const isSkipped = skippedClientKeys?.has(node.task.clientKey) ?? false;
  const assigneeLabel = resolveActorLabel({
    agentId: node.task.assigneeAgentId,
    userId: node.task.assigneeUserId,
    agentMap,
    currentUserId,
    userLabelMap,
  });
  const hasExplicitAssignee = Boolean(
    node.task.assigneeAgentId || node.task.assigneeUserId,
  );
  const labels = node.task.labels ?? [];
  const hasMetadata = hasExplicitAssignee
    || Boolean(node.task.billingCode)
    || Boolean(node.task.projectId)
    || labels.length > 0;

  return (
    <>
      <div
        className={cn(
          "relative border-b border-border/60 px-3 py-2.5 last:border-b-0",
          depth > 0 && "before:absolute before:left-3 before:top-0 before:h-full before:w-px before:bg-border/70",
        )}
        style={depth > 0 ? { paddingLeft: `${depth * 24 + 12}px` } : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              {showSelection ? (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onToggleSelection?.(node, checked === true)}
                  aria-label={uiT("ui:messages.m_8890b6d6a699740f", { v0: (node.task.title) })}
                  className="mt-0.5"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  {/* PAP-411: priority UI hidden behind SHOW_TASK_PRIORITY_UI. */}
                  {SHOW_TASK_PRIORITY_UI && node.task.priority ? (
                    <PriorityIcon
                      priority={node.task.priority}
                      className="mt-px"
                    />
                  ) : null}
                  <div className="min-w-0 truncate text-sm font-medium text-foreground">
                    {node.task.title}
                  </div>
                </div>
                {depth > 0 ? (
                  <div className="mt-0.5 text-(length:--text-nano) font-medium uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{uiT("ui:messages.m_4e6d7bdb7ee5f2eb")}</div>
                ) : null}
                {node.task.description ? (
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    {node.task.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {createdTask?.issueId ? (
            <Link
              to={`/issues/${createdTask.identifier ?? createdTask.issueId}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-(length:--text-micro) font-medium text-emerald-900 transition-colors hover:bg-emerald-500/15 dark:text-emerald-100"
            >
              {createdTask.identifier ?? createdTask.issueId.slice(0, 8)}
              <ChevronRight className="h-3 w-3" />
            </Link>
          ) : isSkipped ? (
            <span className="inline-flex shrink-0 items-center rounded-sm border border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-(length:--text-micro) font-medium text-amber-900 dark:text-amber-100">{uiT("ui:messages.m_12698ce1ea5cd4ab")}</span>
          ) : null}
        </div>

        {hasMetadata ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hasExplicitAssignee ? (
              <TaskField label={uiT("ui:messages.m_bc110a6d0722098a")} value={assigneeLabel} />
            ) : null}
            {node.task.billingCode ? (
              <TaskField label={uiT("ui:messages.m_3ac8bbca9a74cfbd")} value={node.task.billingCode} />
            ) : null}
            {node.task.projectId ? (
              <TaskField label={uiT("ui:messages.m_9859597853197476")} value={node.task.projectId} tone="subtle" />
            ) : null}
            {labels.map((label) => (
              <TaskField key={label} label={uiT("ui:messages.m_0e66373f45dcf3dd")} value={label} tone="subtle" />
            ))}
          </div>
        ) : null}

        {hiddenChildCount > 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-sm border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span>
              {hiddenChildCount === 1
                ? uiT("ui:messages.m_20e5cdebdcbad0f4")
                : uiT("ui:messages.m_6f1282d8383bac0f", { v0: (hiddenChildCount) })}
            </span>
          </div>
        ) : null}
      </div>

      {visibleChildren.length > 0 ? (
        <>
          {visibleChildren.map((child) => (
            <TaskTreeNode
              key={child.task.clientKey}
              node={child}
              createdByClientKey={createdByClientKey}
              agentMap={agentMap}
              currentUserId={currentUserId}
              userLabelMap={userLabelMap}
              depth={depth + 1}
              selectedClientKeys={selectedClientKeys}
              skippedClientKeys={skippedClientKeys}
              showSelection={showSelection}
              onToggleSelection={onToggleSelection}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function SuggestTasksCard({
  footerSlot,
  interaction,
  agentMap,
  currentUserId,
  userLabelMap,
  onAcceptInteraction,
  onRejectInteraction,
}: {
  footerSlot?: ReactNode;
  interaction: SuggestTasksInteraction;
  agentMap?: Map<string, Agent>;
  currentUserId?: string | null;
  userLabelMap?: ReadonlyMap<string, string> | null;
  onAcceptInteraction?: (
    interaction: SuggestTasksInteraction,
    selectedClientKeys?: string[],
  ) => Promise<void> | void;
  onRejectInteraction?: (
    interaction: SuggestTasksInteraction,
    reason?: string,
  ) => Promise<void> | void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [working, setWorking] = useState<"accept" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState(
    interaction.result?.rejectionReason ?? "",
  );

  useEffect(() => {
    setRejectReason(interaction.result?.rejectionReason ?? "");
    if (interaction.status !== "pending") {
      setRejecting(false);
      setWorking(null);
    }
  }, [interaction.result?.rejectionReason, interaction.status]);

  const roots = useMemo(
    () =>
      buildSuggestedTaskTree(interaction.payload.tasks).filter(
        (node) => !node.task.hiddenInPreview,
      ),
    [interaction.payload.tasks],
  );
  const createdByClientKey = useMemo(
    () => createdTaskMap(interaction.result?.createdTasks),
    [interaction.result?.createdTasks],
  );
  const skippedClientKeys = useMemo(
    () => new Set(interaction.result?.skippedClientKeys ?? []),
    [interaction.result?.skippedClientKeys],
  );
  const totalTasks = interaction.payload.tasks.length;
  const [selectedClientKeys, setSelectedClientKeys] = useState<Set<string>>(
    () => new Set(interaction.payload.tasks.map((task) => task.clientKey)),
  );
  const taskSelectionSeed = useMemo(
    () => interaction.payload.tasks.map((task) => task.clientKey).join("\n"),
    [interaction.payload.tasks],
  );

  useEffect(() => {
    setSelectedClientKeys(new Set(interaction.payload.tasks.map((task) => task.clientKey)));
  }, [interaction.id, interaction.status, taskSelectionSeed]);

  const taskByClientKey = useMemo(
    () => new Map(interaction.payload.tasks.map((task) => [task.clientKey, task] as const)),
    [interaction.payload.tasks],
  );
  const selectedCount = selectedClientKeys.size;
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();
  const createdCount = interaction.result?.createdTasks?.length ?? 0;
  const skippedCount = interaction.result?.skippedClientKeys?.length ?? 0;

  async function handleAccept() {
    if (!onAcceptInteraction) return;
    setWorking("accept");
    setActionError(null);
    try {
      await onAcceptInteraction(interaction, [...selectedClientKeys]);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function handleReject() {
    if (!onRejectInteraction) return;
    setWorking("reject");
    setActionError(null);
    try {
      await onRejectInteraction(interaction, rejectReason.trim() || undefined);
      setRejecting(false);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function handleToggleSelection(node: SuggestedTaskTreeNode, checked: boolean) {
    const subtreeClientKeys = collectSuggestedTaskClientKeys(node);
    setSelectedClientKeys((current) => {
      const next = new Set(current);
      if (!checked) {
        for (const clientKey of subtreeClientKeys) {
          next.delete(clientKey);
        }
        return next;
      }

      for (const clientKey of subtreeClientKeys) {
        next.add(clientKey);
      }

      let parentClientKey = taskByClientKey.get(node.task.clientKey)?.parentClientKey ?? null;
      while (parentClientKey) {
        next.add(parentClientKey);
        parentClientKey = taskByClientKey.get(parentClientKey)?.parentClientKey ?? null;
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{totalTasks === 1 ? uiT("ui:messages.m_142b5c43a2dd87b9") : uiT("ui:messages.m_c27e53744a693c0f", { v0: (totalTasks) })}</span>
        {interaction.payload.defaultParentId ? (
          <TaskField label={uiT("ui:messages.m_ac981ebffeaa6b4d")} value={interaction.payload.defaultParentId} tone="subtle" />
        ) : null}
      </div>

      <div className="overflow-hidden border border-border/70">
        {roots.map((root) => (
          <TaskTreeNode
            key={root.task.clientKey}
            node={root}
            createdByClientKey={createdByClientKey}
            agentMap={agentMap}
            currentUserId={currentUserId}
            userLabelMap={userLabelMap}
            selectedClientKeys={selectedClientKeys}
            skippedClientKeys={skippedClientKeys}
            showSelection={interaction.status === "pending"}
            onToggleSelection={handleToggleSelection}
          />
        ))}
      </div>

      {interaction.status === "accepted" ? (
        <div className="rounded-sm border border-emerald-500/60 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-emerald-700">{uiT("ui:messages.m_5ac338f055a7abe5")}</div>
          <p className="mt-1 leading-6">
            {skippedCount > 0
              ? uiT("ui:messages.m_2c668cad2c896aef", { v0: (createdCount), v1: (createdCount === 1 ? uiT("ui:messages.m_4a502846d070e208") : uiT("ui:messages.m_02e3fe5aad80ca85")), v2: (skippedCount) })
              : uiT("ui:messages.m_1a9911a9bf51eb02", { v0: (createdCount), v1: (createdCount === 1 ? uiT("ui:messages.m_4a502846d070e208") : uiT("ui:messages.m_02e3fe5aad80ca85")) })}
          </p>
        </div>
      ) : null}

      {interaction.status === "rejected" ? (
        <div className="rounded-sm border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-rose-700">{uiT("ui:messages.m_e57499264f493e58")}</div>
          <p className={cn(
            "mt-1 leading-6",
            !interaction.result?.rejectionReason && "text-rose-900/75",
          )}>
            {interaction.result?.rejectionReason || uiT("ui:messages.m_a63c933ad7a29d41")}
          </p>
        </div>
      ) : null}

      {interaction.status === "pending" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {selectedCount === totalTasks
                  ? uiT("ui:messages.m_37bc6d6a06ee568d", { v0: (totalTasks), v1: (totalTasks === 1 ? uiT("ui:messages.m_4a502846d070e208") : uiT("ui:messages.m_02e3fe5aad80ca85")) })
                  : uiT("ui:messages.m_c2e32bf968db941d", { v0: (selectedCount), v1: (totalTasks), v2: (totalTasks === 1 ? uiT("ui:messages.m_4a502846d070e208") : uiT("ui:messages.m_02e3fe5aad80ca85")) })}
              </span>
              {selectedCount < totalTasks ? (
                <span>
                  {totalTasks - selectedCount}{uiT("ui:messages.m_d3786c4d25bf2fcf")}</span>
              ) : null}
            </div>

            <DecisionCardFooter leading={footerSlot} className="w-full">
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  disabled={!onAcceptInteraction || working !== null || selectedCount === 0}
                  onClick={() => void handleAccept()}
                >
                  {working === "accept" ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_31409c77894fb400")}</>
                  ) : (
                    selectedCount === totalTasks ? uiT("ui:messages.m_43a26ceb78ea73aa") : uiT("ui:messages.m_3db4cde14abef81a")
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onRejectInteraction || working !== null}
                  onClick={() => setRejecting((current) => !current)}
                >{uiT("ui:messages.m_ab604a360777735f")}</Button>
                {selectedCount < totalTasks ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working !== null}
                    onClick={() => setSelectedClientKeys(new Set(interaction.payload.tasks.map((task) => task.clientKey)))}
                  >{uiT("ui:messages.m_2e9246864f088a40")}</Button>
                ) : null}
              </div>
            </DecisionCardFooter>
          </div>

          {rejecting ? (
            <div className="space-y-3">
              <Textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder={uiT("ui:messages.m_11886cf22e87c75b")}
                className="min-h-24 bg-background text-sm"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onRejectInteraction || working !== null}
                  onClick={() => void handleReject()}
                >
                  {working === "reject" ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_dc85af8f2b1d0d67")}</>
                  ) : (
                    uiT("ui:messages.m_6fc943c1e5b36330")
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          <InteractionActionError message={actionError} />
        </div>
      ) : null}
    </div>
  );
}

function QuestionOptionButton({
  id,
  compact = false,
  label,
  description,
  selected,
  selectionMode,
  onClick,
}: {
  id: string;
  compact?: boolean;
  label: string;
  description?: string | null;
  selected: boolean;
  selectionMode: "single" | "multi";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={selectionMode === "single" ? "radio" : "checkbox"}
      aria-checked={selected}
      className={cn(
        compact ? "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring" : "w-full rounded-sm border px-4 py-3 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-(length:--rad-3) focus-visible:ring-ring/50",
        compact ? (selected ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/50") : selected
          ? "border-sky-500/80 bg-sky-500/10 text-sky-950 dark:border-sky-400/80 dark:bg-sky-400/15 dark:text-sky-50"
          : "border-border/70 bg-transparent text-foreground hover:border-sky-500/70 hover:bg-sky-500/10 dark:hover:border-sky-400/70 dark:hover:bg-sky-400/10",
      )}
      id={id}
      onClick={onClick}
    >
      {compact ? <span aria-hidden="true" className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center border", selectionMode === "single" ? "rounded-full" : "rounded-sm", selected ? "border-foreground" : "border-muted-foreground/50")}>
        {selected ? <span className={cn("size-2 bg-foreground", selectionMode === "single" ? "rounded-full" : "rounded-xs")} /> : null}
      </span> : null}
      <div className={compact ? "min-w-0" : "contents"}>
      <div
        className={cn(
          "text-sm font-medium",
          selected && !compact ? "text-sky-950 dark:text-sky-50" : "text-foreground",
        )}
      >
        {label}
      </div>
      {description ? (
        <div
          className={cn(
            "mt-1 text-sm leading-6",
            selected && !compact
              ? "text-sky-900/80 dark:text-sky-100/80"
              : "text-muted-foreground",
          )}
        >
          {description}
        </div>
      ) : null}
      </div>
    </button>
  );
}

function AskUserQuestionsCard({
  footerSlot,
  interaction,
  compact = false,
  onSubmitInteractionAnswers,
  onCancelInteraction,
  externalReferences,
}: {
  footerSlot?: ReactNode;
  interaction: AskUserQuestionsInteraction;
  compact?: boolean;
  onSubmitInteractionAnswers?: (
    interaction: AskUserQuestionsInteraction,
    answers: AskUserQuestionsAnswer[],
  ) => Promise<void> | void;
  onCancelInteraction?: (
    interaction: AskUserQuestionsInteraction,
  ) => Promise<void> | void;
  externalReferences?: MarkdownExternalReferenceMap;
}) {
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      (interaction.result?.answers ?? []).map((answer) => [
        answer.questionId,
        [...answer.optionIds],
      ]),
    ),
  );
  const [draftOtherAnswers, setDraftOtherAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (interaction.result?.answers ?? [])
        .filter((answer) => answer.otherText)
        .map((answer) => [answer.questionId, answer.otherText ?? ""]),
    ),
  );
  const [otherActiveQuestions, setOtherActiveQuestions] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      (interaction.result?.answers ?? [])
        .filter((answer) => answer.otherText)
        .map((answer) => [answer.questionId, true]),
    ),
  );
  const [working, setWorking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();

  useEffect(() => {
    setDraftAnswers(
      Object.fromEntries(
        (interaction.result?.answers ?? []).map((answer) => [
          answer.questionId,
          [...answer.optionIds],
        ]),
      ),
    );
    setDraftOtherAnswers(
      Object.fromEntries(
        (interaction.result?.answers ?? [])
          .filter((answer) => answer.otherText)
          .map((answer) => [answer.questionId, answer.otherText ?? ""]),
      ),
    );
    setOtherActiveQuestions(
      Object.fromEntries(
        (interaction.result?.answers ?? [])
          .filter((answer) => answer.otherText)
          .map((answer) => [answer.questionId, true]),
      ),
    );
  }, [interaction.result?.answers]);

  const questions = interaction.payload.questions;
  const requiredQuestions = questions.filter((question) => question.required);
  const canSubmit = requiredQuestions.every(
    (question) =>
      (draftAnswers[question.id] ?? []).length > 0
      || (
        otherActiveQuestions[question.id] === true
        && (draftOtherAnswers[question.id]?.trim().length ?? 0) > 0
      ),
  );

  function toggleOption(
    questionId: string,
    optionId: string,
    selectionMode: "single" | "multi",
    isFreeText = false,
  ) {
    // A free-text option is a first-class version of the built-in "Other"
    // affordance: selecting it reveals the inline text field and its typed
    // value is submitted as the question's `otherText`.
    if (optionId === OTHER_ANSWER_ID || isFreeText) {
      setOtherActiveQuestions((current) => ({
        ...current,
        [questionId]: !current[questionId],
      }));
      if (selectionMode === "single") {
        setDraftAnswers((current) => ({ ...current, [questionId]: [] }));
      }
      return;
    }

    setDraftAnswers((current) => {
      const existing = current[questionId] ?? [];
      if (selectionMode === "single") {
        return { ...current, [questionId]: [optionId] };
      }
      const next = existing.includes(optionId)
        ? existing.filter((value) => value !== optionId)
        : [...existing, optionId];
      return { ...current, [questionId]: next };
    });
    if (selectionMode === "single") {
      setOtherActiveQuestions((current) => ({ ...current, [questionId]: false }));
    }
  }

  async function handleSubmit() {
    if (!onSubmitInteractionAnswers || !canSubmit) return;
    setWorking(true);
    setActionError(null);
    try {
      await onSubmitInteractionAnswers(
        interaction,
        questions.map((question) => {
          const otherText = otherActiveQuestions[question.id] === true
            ? draftOtherAnswers[question.id]?.trim() ?? ""
            : "";
          return {
            questionId: question.id,
            optionIds: draftAnswers[question.id] ?? [],
            ...(otherText ? { otherText } : {}),
          };
        }),
      );
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function handleCancel() {
    if (!onCancelInteraction) return;
    setCancelling(true);
    setActionError(null);
    try {
      await onCancelInteraction(interaction);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      {!compact ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="border-border/70 bg-background/70 px-2.5 py-1 uppercase tracking-(--tracking-eyebrow) text-foreground/70">
          <MessageSquareQuote className="h-3 w-3" />{uiT("ui:messages.m_85f982633587e0c1")}</Badge>
        <span>
          {questions.length === 1
            ? uiT("ui:messages.m_d69c3b1839e70205")
            : uiT("ui:messages.m_0d98d85d258272d7", { v0: (questions.length) })}
        </span>
      </div> : null}

      {interaction.status === "pending" && interaction.payload.questionSet ? (
        <QuestionForm
          footerSlot={footerSlot}
          id={interaction.id}
          presentation={compact ? "decision" : "default"}
          questionSet={interaction.payload.questionSet}
          draftKey={`issue-question:${interaction.companyId}:${interaction.id}`}
          disabled={!onSubmitInteractionAnswers}
          initialResponse={interaction.result?.answers ? {
            schema: "paperclip.question_response.v1",
            answers: Object.fromEntries(interaction.result.answers.map((answer) => [
              answer.questionId,
              interaction.payload.questionSet!.questions.find((question) => question.id === answer.questionId)?.answerMode === "text"
                ? { text: answer.otherText ?? "" }
                : { selectedOptionIds: answer.optionIds, ...(typeof answer.otherText === "string" ? { customText: answer.otherText } : {}) },
            ])),
          } : null}
          onSubmit={async (response) => {
            const answers = interaction.payload.questionSet!.questions.map((question) => {
              const answer = response.answers[question.id];
              const otherText = question.answerMode === "text" ? answer?.text : answer?.customText?.trim();
              return {
                questionId: question.id,
                optionIds: question.answerMode === "text" ? [] : (answer?.selectedOptionIds ?? []),
                ...(otherText !== undefined ? { otherText } : {}),
              };
            });
            try {
              await onSubmitInteractionAnswers?.(interaction, answers);
            } catch (error) {
              throw new Error(resolutionErrorMessage(error));
            }
          }}
          onCancel={onCancelInteraction ? async () => {
            try {
              await onCancelInteraction(interaction);
            } catch (error) {
              throw new Error(resolutionErrorMessage(error));
            }
          } : undefined}
        />
      ) : interaction.status === "pending" ? (
        <div className="space-y-4">
          {questions.map((question, index) => {
            const hasFreeTextOption = question.options.some(
              (option) => option.freeText === true,
            );
            return (
            <div
              key={question.id}
              className={compact ? "space-y-3" : "rounded-2xl border border-border/70 bg-background/82 p-4 shadow-(--shadow-extract-9)"}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  {!compact ? <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{uiT("ui:messages.m_39821a754d341ad5")}{index + 1}
                  </div> : null}
                  <div
                    id={`${interaction.id}-${question.id}-prompt`}
                    data-decision-prompt={compact ? true : undefined}
                    className={compact ? "text-lg font-medium leading-relaxed text-foreground" : "mt-1 text-sm font-semibold text-foreground"}
                  >
                    {question.prompt}
                  </div>
                  {question.helpText ? (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {question.helpText}
                    </p>
                  ) : null}
                </div>
                {compact ? <span className="sr-only" id={`${interaction.id}-${question.id}-requirements`}>
                  {question.selectionMode === "single" ? "Choose one answer." : "Choose one or more answers."} {question.required ? "Required." : "Optional."}
                </span> : <TaskField
                  label={question.selectionMode === "single" ? uiT("ui:messages.m_831a9d52a9c37435") : uiT("ui:messages.m_1c7919368277ed4e")}
                  value={question.required ? "Required" : "Optional"}
                  tone="subtle"
                />}
              </div>

              <div className="mt-3 space-y-3">
                <div
                  className="grid gap-3"
                  role={question.selectionMode === "single" ? "radiogroup" : "group"}
                  aria-labelledby={`${interaction.id}-${question.id}-prompt`}
                  aria-describedby={compact ? `${interaction.id}-${question.id}-requirements` : undefined}
                  aria-required={question.selectionMode === "single" && question.required ? true : undefined}
                >
                  {question.options.map((option) => {
                    const isFreeText = option.freeText === true;
                    const optionSelected = isFreeText
                      ? otherActiveQuestions[question.id] === true
                      : (draftAnswers[question.id] ?? []).includes(option.id);
                    return (
                      <div key={option.id} className="space-y-2">
                        <QuestionOptionButton
                          compact={compact}
                          id={`${interaction.id}-${question.id}-${option.id}`}
                          label={option.label}
                          description={option.description}
                          selected={optionSelected}
                          selectionMode={question.selectionMode}
                          onClick={() =>
                            toggleOption(question.id, option.id, question.selectionMode, isFreeText)}
                        />
                        {isFreeText && optionSelected ? (
                          <Textarea
                            aria-label={uiT("ui:messages.m_09887c1750031946", { v0: (question.prompt) })}
                            value={draftOtherAnswers[question.id] ?? ""}
                            onChange={(event) =>
                              setDraftOtherAnswers((current) => ({
                                ...current,
                                [question.id]: event.target.value,
                              }))}
                            placeholder={uiT("ui:messages.m_d078bf7520a710d0")}
                            className="min-h-24 bg-background text-sm"
                            autoFocus
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {/*
                 * The built-in "Other" link is the fallback free-text affordance.
                 * Suppress it when the agent already authored a first-class
                 * free-text option so the card never shows two ways to type an
                 * answer (PAP-419).
                 */}
                {hasFreeTextOption || question.allowOther === false ? null : (
                  <>
                    <button
                      type="button"
                      id={`${interaction.id}-${question.id}-other`}
                      aria-expanded={otherActiveQuestions[question.id] === true}
                      className={cn(
                        "text-sm font-medium underline underline-offset-4 transition-colors outline-none focus-visible:ring-(length:--rad-3) focus-visible:ring-ring/50",
                        otherActiveQuestions[question.id]
                          ? "text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() =>
                        toggleOption(question.id, OTHER_ANSWER_ID, question.selectionMode)}
                    >{uiT("ui:messages.m_f97e9da0e3b879f0")}</button>
                    {otherActiveQuestions[question.id] ? (
                      <Textarea
                        aria-label={uiT("ui:messages.m_0b982573e6aff5bf", { v0: (question.prompt) })}
                        value={draftOtherAnswers[question.id] ?? ""}
                        onChange={(event) =>
                          setDraftOtherAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))}
                        placeholder={uiT("ui:messages.m_d078bf7520a710d0")}
                        className="min-h-24 bg-background text-sm"
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>
            );
          })}

          <DecisionCardFooter leading={footerSlot}>
            <div className={compact ? "flex flex-wrap items-center justify-end gap-3" : "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/75 p-4"}>
              {!compact ? <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_02885ec7af193b0a")}</div> : null}
              <div className="flex flex-wrap items-center gap-2">
                {onCancelInteraction ? (
                  <Button
                    size="sm"
                    variant={compact ? "ghost" : "outline"}
                    disabled={working || cancelling}
                    onClick={() => void handleCancel()}
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_7b26131098bb18b2")}</>
                    ) : (
                      uiT("ui:messages.m_437c1e5661520292")
                    )}
                    </Button>
                  ) : null}
                <Button
                  size="sm"
                  disabled={!onSubmitInteractionAnswers || !canSubmit || working || cancelling}
                  onClick={() => void handleSubmit()}
                >
                  {working ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_64115d5b9c794c92")}</>
                  ) : (
                    interaction.payload.submitLabel ?? uiT("ui:messages.m_6d23261523eb641c")
                  )}
                </Button>
              </div>
            </div>
          </DecisionCardFooter>

          <InteractionActionError message={actionError} />
        </div>
      ) : interaction.status === "cancelled" ? (
        <div className="rounded-2xl border border-rose-300/60 bg-rose-50/85 p-4 text-sm leading-6 text-rose-950 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
          <div className="font-semibold">
            {interaction.result?.outcome === "withdrawn"
              ? questions.length === 1 ? uiT("ui:messages.m_7fb9da0d31ce3cfa") : uiT("ui:messages.m_5f00159eb0a684f2")
              : uiT("ui:messages.m_e8960873b52bc79f")}
          </div>
          {interaction.result?.cancellationReason ? (
            <p className="mt-1">{interaction.result.cancellationReason}</p>
          ) : interaction.result?.reason ? (
            <p className="mt-1">{interaction.result.reason}</p>
          ) : (
            <p className="mt-1">{uiT("ui:messages.m_9122bb871bbd9ae5")}</p>
          )}
        </div>
      ) : interaction.status === "expired" ? (
        <div className="rounded-2xl border border-amber-300/70 bg-amber-50/85 p-4 text-sm leading-6 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {interaction.result?.outcome === "issue_closed"
              ? questions.length === 1
                ? uiT("ui:messages.m_25e10cc4b7912257")
                : uiT("ui:messages.m_0f7b109de2e44149")
              : questions.length === 1
                ? uiT("ui:messages.m_9a1e929d06d9edf9")
                : uiT("ui:messages.m_891685543f6e5ab3")}
          </div>
          <p className="mt-1">
            {interaction.result?.outcome === "issue_closed"
              ? uiT("ui:messages.m_7dc5da5d51873165")
              : uiT("ui:messages.m_890aebaab34c22fe")}
          </p>
          {interaction.result?.commentId ? (
            <a
              href={`#comment-${interaction.result.commentId}`}
              className="mt-3 inline-flex text-sm font-medium underline underline-offset-4"
            >{uiT("ui:messages.m_c8799fd3b3b2fed8")}</a>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => {
            const labels = getQuestionAnswerLabels({
              question,
              answers: interaction.result?.answers ?? [],
            });
            return (
              <div
                key={question.id}
                className="rounded-2xl border border-border/70 bg-background/82 p-4"
              >
                <div className="text-sm font-semibold text-foreground">
                  {question.prompt}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {labels.length > 0 ? (
                    labels.map((label) => (
                      <TaskField key={label} label={uiT("ui:messages.m_b2a3aa602762a782")} value={label} />
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">{uiT("ui:messages.m_85dd23047a757de7")}</span>
                  )}
                </div>
              </div>
            );
          })}

          {interaction.result?.summaryMarkdown ? (
            <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/85 p-4">
              <div className="mb-2 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-emerald-700">{uiT("ui:messages.m_6af3ea688c2d33de")}</div>
              <MarkdownBody externalReferences={externalReferences}>{interaction.result.summaryMarkdown}</MarkdownBody>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A custom target key is a machine identifier (e.g. `github:org/repo:pull:16`),
 * not display copy, so unlabeled custom targets render no chip. */
function isDisplayableRequestConfirmationTarget(
  target: RequestConfirmationTarget | null | undefined,
): target is RequestConfirmationTarget {
  if (!target) return false;
  return target.type !== "custom" || Boolean(target.label);
}

function requestConfirmationTargetLabel(target: RequestConfirmationTarget) {
  if (target.label) return target.label;
  if (target.type === "issue_attachment") return "Attachment";
  const revision = target.revisionNumber ? ` v${target.revisionNumber}` : "";
  if (target.type === "issue_document" && target.key === "plan") {
    return `Plan${revision}`;
  }
  return `${target.key}${revision}`;
}

function requestConfirmationTargetHref({
  interaction,
  target,
}: {
  interaction: Pick<IssueThreadInteraction, "issueId" | "id">;
  target: RequestConfirmationTarget;
}) {
  if (target.type === "issue_document" && target.revisionId) {
    return `/issues/${target.issueId ?? interaction.issueId}${buildDocumentAnnotationHash({ documentKey: target.key, revisionId: target.revisionId, interactionId: interaction.id, threadId: null, commentId: null })}`;
  }
  if (target.type === "issue_attachment") {
    return `/api/attachments/${encodeURIComponent(target.attachmentId)}/content`;
  }
  if (target.href) return target.href;
  if (target.type === "issue_document") {
    const issueId = target.issueId ?? interaction.issueId;
    return `/issues/${issueId}#document-${encodeURIComponent(target.key)}`;
  }
  return null;
}

function RequestConfirmationTargetChip({
  interaction,
  target,
  tone = "default",
}: {
  interaction: Pick<IssueThreadInteraction, "issueId" | "id">;
  target: RequestConfirmationTarget | null | undefined;
  tone?: "default" | "subtle";
}) {
  if (!isDisplayableRequestConfirmationTarget(target)) return null;

  const href = requestConfirmationTargetHref({ interaction, target });
  const className = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-0.5 text-(length:--text-nano) font-medium uppercase tracking-(--tracking-eyebrow)",
    tone === "default"
      ? "border-border/70 bg-transparent text-foreground"
      : "border-border/60 bg-transparent text-muted-foreground",
    href && "transition-colors hover:border-sky-500/70 hover:bg-sky-500/10",
  );
  const content = (
    <>
      <GitBranch className="h-3 w-3 shrink-0" />
      <span className="min-w-0 truncate">{requestConfirmationTargetLabel(target)}</span>
    </>
  );

  if (!href) return <span className={className}>{content}</span>;
  if (target.type === "issue_attachment" || /^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {content}
    </Link>
  );
}

function RequestConfirmationResolution({
  interaction,
}: {
  interaction: RequestConfirmationInteraction;
}) {
  const outcome = interaction.result?.outcome;
  const target = interaction.payload.target ?? null;
  const staleTarget = interaction.result?.staleTarget ?? null;

  if (interaction.status === "accepted") {
    const resumeFailure = requestConfirmationResumeFailure(interaction);
    if (resumeFailure) {
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm leading-6 text-foreground">
            <span className="font-medium">{uiT("ui:messages.m_fe00b67b6dd1143f")}</span>
            <RequestConfirmationTargetChip interaction={interaction} target={target} />
          </div>
          <div className="rounded-sm border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-amber-700">{uiT("ui:messages.m_a456bede8c75f3c0")}</div>
            <p className="mt-1 leading-6">
              {resumeFailure.status === "retrying"
                ? uiT("ui:messages.m_ff68a5b418c0ebe6", { v0: (resumeFailure.attempt), v1: (resumeFailure.maxAttempts) })
                : uiT("ui:messages.m_d517e69acc3f1776")}
            </p>
            {resumeFailure.errorCode ? (
              <p className="mt-1 leading-6">{uiT("ui:messages.m_96dc286e65687af1")}<code className="font-mono text-(length:--text-micro)">{resumeFailure.errorCode}</code>
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm leading-6 text-foreground">
        <span className="font-medium">{uiT("ui:messages.m_fe00b67b6dd1143f")}</span>
        <RequestConfirmationTargetChip interaction={interaction} target={target} />
      </div>
    );
  }

  if (interaction.status === "rejected") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm leading-6 text-foreground">
          <span className="font-medium">{uiT("ui:messages.m_dce083a2c47ffdc4")}</span>
          <RequestConfirmationTargetChip interaction={interaction} target={target} />
        </div>
        {interaction.result?.reason ? (
          <div className="rounded-sm border-l-2 border-rose-500/70 bg-rose-500/10 px-3 py-2 text-sm leading-6 text-rose-900 dark:text-rose-100">
            <MarkdownBody>{interaction.result.reason}</MarkdownBody>
          </div>
        ) : null}
      </div>
    );
  }

  if (interaction.status === "cancelled" && outcome === "withdrawn") {
    // Withdrawn is a neutral administrative retraction (P4 design review): the
    // card-level withdrawn footer carries the "Withdrawn by …" attribution and
    // reason, so this body only anchors the target chip — no rose/red styling
    // and no duplicated reason text.
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm leading-6 text-foreground">
        <span className="font-medium">{uiT("ui:messages.m_00c0b03fcfa2ac02")}</span>
        <RequestConfirmationTargetChip interaction={interaction} target={target} />
      </div>
    );
  }

  if (interaction.status === "expired") {
    const expiredByComment = outcome === "superseded_by_comment";
    const expiredByIssueClosed = outcome === "issue_closed";
    const expiredByTargetChange = outcome === "stale_target";
    return (
      <div className="space-y-3 rounded-sm border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        {/*
         * issue_closed already carries its label in the header status badge
         * ("Expired · issue closed"), so this eyebrow would duplicate it
         * verbatim — only render the eyebrow for the states the header shows
         * generically as "Expired".
         */}
        {expiredByIssueClosed ? null : (
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-amber-700">
            {expiredByComment ? uiT("ui:messages.m_2261bc69df12dcbd") : uiT("ui:messages.m_29b61c07a1af4430")}
          </div>
        )}
        <p className="leading-6">
          {expiredByComment
            ? uiT("ui:messages.m_93bcdf36fb064b5b")
            : expiredByIssueClosed
              ? uiT("ui:messages.m_d9d1a93282983a4b")
              : uiT("ui:messages.m_45202d1a0937c682")}
        </p>
        {expiredByComment && interaction.result?.commentId ? (
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-amber-950 hover:bg-amber-500/15 dark:text-amber-50">
            <a href={`#comment-${interaction.result.commentId}`}>{uiT("ui:messages.m_c8799fd3b3b2fed8")}</a>
          </Button>
        ) : null}
        {expiredByTargetChange ? (
          <div className="flex flex-wrap items-center gap-2">
            <RequestConfirmationTargetChip
              interaction={interaction}
              target={staleTarget}
              tone="subtle"
            />
            {isDisplayableRequestConfirmationTarget(staleTarget)
            && isDisplayableRequestConfirmationTarget(target) ? (
              <ChevronRight className="h-3.5 w-3.5 text-amber-700" />
            ) : null}
            <RequestConfirmationTargetChip interaction={interaction} target={target} />
          </div>
        ) : null}
      </div>
    );
  }

  if (interaction.status === "failed") {
    return (
      <p className="text-sm leading-6 text-muted-foreground">{uiT("ui:messages.m_7056ad01b4c11aa6")}</p>
    );
  }

  return null;
}

function ToolActionResolution({
  state,
  interaction,
}: {
  state: ToolActionCardState;
  interaction: RequestConfirmationInteraction;
}) {
  const result = interaction.result?.toolAction;
  const [resultOpen, setResultOpen] = useState(false);
  const output = state === "executed" ? result?.resultSummary?.trim() : null;
  let formattedOutput = output;
  if (output) {
    try { formattedOutput = JSON.stringify(JSON.parse(output), null, 2); } catch { /* Plain-text results remain readable. */ }
  }
  const labels = {
    pending: "Waiting for approval",
    running: "Approved · Running…",
    executed: "Succeeded",
    failed: "Execution failed",
    declined: "Declined",
    expired: "Expired",
    cancelled: "Cancelled",
  };
  const Icon = state === "running" ? Loader2 : state === "executed" ? CheckCircle2 : state === "failed" ? AlertTriangle : state === "expired" ? Clock : MinusCircle;
  const detail = state === "failed" ? result?.errorMessage?.trim() || "The action could not complete."
    : state === "declined" ? interaction.result?.reason?.trim()
    : null;
  const status = <>
    <Icon className={cn("h-3.5 w-3.5 shrink-0", state === "running" && "animate-spin", state === "failed" && "text-destructive")} />
    {labels[state]}
    {result?.rememberedAction ? uiT("ui:messages.m_b2f63ebe84ae46f3") : ""}
  </>;
  return (
    <div className="space-y-1 text-sm text-muted-foreground" aria-live="polite">
      {output ? (
        <Collapsible open={resultOpen} onOpenChange={setResultOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={resultOpen ? uiT("ui:messages.m_1ff4e49e4fd49c0e") : uiT("ui:messages.m_68254305e7a9ea7d")}>
              {status}<ChevronDown className={cn("h-3 w-3", resultOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">{formattedOutput}</pre>
          </CollapsibleContent>
        </Collapsible>
      ) : <p className="flex items-center gap-1.5">{status}</p>}
      {detail ? <p className={cn("break-words", state === "failed" && "text-destructive")}>{detail}</p> : null}
      {state === "executed" && result?.resultHref?.trim() ? (
        <a className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground" href={result.resultHref} target="_blank" rel="noreferrer">{uiT("ui:messages.m_fdb7eafd12ba788b")}<ExternalLink className="h-3 w-3" /></a>
      ) : null}
    </div>
  );
}

function RequestToolActionCard({
  footerSlot,
  interaction,
  state,
  onAcceptInteraction,
  onRejectInteraction,
  externalReferences,
}: {
  footerSlot?: ReactNode;
  interaction: RequestConfirmationInteraction;
  state: ToolActionCardState;
  onAcceptInteraction?: IssueThreadInteractionCardProps["onAcceptInteraction"];
  onRejectInteraction?: (interaction: RequestConfirmationInteraction, reason?: string) => Promise<void> | void;
  externalReferences?: MarkdownExternalReferenceMap;
}) {
  const payload = interaction.payload.toolAction!;
  const [working, setWorking] = useState<"accept" | "always" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();
  const isPending = state === "pending";
  const variant = payload.risk === "destructive" ? "destructive" : "cta";

  useEffect(() => {
    if (!isPending) setWorking(null);
  }, [interaction.id, isPending]);

  async function decide(decision: "accept" | "always" | "reject") {
    setWorking(decision);
    setActionError(null);
    try {
      if (decision === "reject") await onRejectInteraction?.(interaction);
      else await onAcceptInteraction?.(interaction, undefined, undefined, decision === "always");
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="text-foreground">
      <div className="flex items-start gap-3">
        <span role="img" aria-label={payload.appDisplayName || payload.toolDisplayName}>
          <AppLogo name={payload.appDisplayName || payload.toolDisplayName} size={36} />
        </span>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <MarkdownBody externalReferences={externalReferences}>{payload.previewMarkdown || payload.toolDisplayName}</MarkdownBody>
          {!isPending ? <ToolActionResolution state={state} interaction={interaction} /> : null}
        </div>
      </div>
      {isPending ? (
        <DecisionCardFooter leading={footerSlot} className="mt-3">
          <div className={cn(!footerSlot && "mt-3", "flex flex-wrap items-center justify-end gap-2")}>
          <Button size="sm" variant="ghost" disabled={!onRejectInteraction || working !== null} onClick={() => void decide("reject")}>
            {working === "reject" ? uiT("ui:messages.m_fb03c72b9ced6a80") : uiT("ui:messages.m_a2d285b352873457")}
          </Button>
          <div className="inline-flex" role="group" aria-label={uiT("ui:messages.m_9ed200aeb78c5b9b")}>
            <Button size="sm" variant={variant} className={payload.rememberActionScope ? "rounded-r-none" : undefined} disabled={!onAcceptInteraction || working !== null} onClick={() => void decide("accept")}>
              {working === "accept" || working === "always" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{working === "always" ? uiT("ui:messages.m_23e39291d6135814") : uiT("ui:messages.m_e99dcb0a97a2320d")}</> : uiT("ui:messages.m_e31adde562aa3470")}
            </Button>
            {payload.rememberActionScope ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant={variant} className="rounded-l-none border-l border-background/30" aria-label={uiT("ui:messages.m_b8cd0e4b744cdfb7")} disabled={!onAcceptInteraction || working !== null}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void decide("always")} title={payload.rememberActionScope} aria-description={payload.rememberActionScope}>{uiT("ui:messages.m_977618bd8bc7eef4")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          </div>
        </DecisionCardFooter>
      ) : <DecisionCardFooter leading={footerSlot} className="mt-3" />}
      <InteractionActionError message={actionError} />
    </div>
  );
}

type SecretProposalCardState = ToolActionCardState;

function secretProposalCardState(
  interaction: RequestConfirmationInteraction,
): SecretProposalCardState {
  const proposalStatus = interaction.result?.secretProposal?.status ?? null;
  if (interaction.status === "pending") return "pending";
  if (proposalStatus === "executed") return "executed";
  if (proposalStatus === "failed" || interaction.status === "failed") return "failed";
  if (proposalStatus === "expired" || interaction.status === "expired") return "expired";
  if (
    proposalStatus === "rejected"
    || proposalStatus === "withdrawn"
    || interaction.status === "rejected"
    || interaction.status === "cancelled"
  ) {
    return "declined";
  }
  return "running";
}

function secretProposalStatusClasses(state: SecretProposalCardState) {
  if (state === "failed") {
    return {
      shell: "border-2 border-red-500/80 bg-transparent",
      badge: "border-red-500/60 bg-red-500/10 text-red-900 dark:bg-red-500/15 dark:text-red-100",
      label: uiT("ui:messages.m_02bd349299173f7f"),
      Icon: XCircle,
    };
  }
  return toolActionStatusClasses(state);
}

function SecretProposalIdentityHeader({
  state,
}: {
  state: SecretProposalCardState;
}) {
  const dimmed = state === "declined" || state === "expired";
  return (
    <div className={cn("flex items-start gap-3", dimmed && "opacity-60 grayscale")}>
      <div
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground"
      >
        <KeyRound className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold leading-tight text-foreground">{uiT("ui:messages.m_2aea300f8bec71c0")}</div>
      </div>
    </div>
  );
}

function SecretProposalDetails({
  payload,
}: {
  payload: NonNullable<RequestConfirmationInteraction["payload"]["secretProposal"]>;
}) {
  return (
    <dl className="grid gap-3 rounded-sm border border-border/70 bg-muted/30 p-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1">
        <dt className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{uiT("ui:messages.m_60e1f18db6c8a297")}</dt>
        <dd className="truncate text-sm font-medium text-foreground">{payload.sourceSecretLabel}</dd>
      </div>
      <div className="min-w-0 space-y-1">
        <dt className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{uiT("ui:messages.m_d539091489783f89")}</dt>
        <dd className="truncate text-sm font-medium text-foreground">{payload.targetAgentName}</dd>
      </div>
      <div className="min-w-0 space-y-1 sm:col-span-2">
        <dt className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{uiT("ui:messages.m_be59ea68894f6302")}</dt>
        <dd className="break-all font-mono text-sm text-foreground">{payload.configPath}</dd>
      </div>
    </dl>
  );
}

function SecretProposalResolution({
  interaction,
  state,
  resolvedByLabel,
}: {
  interaction: RequestConfirmationInteraction;
  state: SecretProposalCardState;
  resolvedByLabel: string | null;
}) {
  const result = interaction.result?.secretProposal ?? null;
  const who = resolvedByLabel ?? "the board";
  const when = interaction.resolvedAt
    ? formatDateTime(interaction.resolvedAt)
    : result?.updatedAt
      ? formatDateTime(result.updatedAt)
      : null;

  if (state === "running") {
    return (
      <div aria-live="polite" className="flex items-start gap-2 rounded-sm border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        <div>
          <div className="font-medium">{uiT("ui:messages.m_17923f10b195ab78")}{who}{uiT("ui:messages.m_0a5d873cf74d88f3")}</div>
          <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">{uiT("ui:messages.m_5117fae9ab1d3182")}</p>
        </div>
      </div>
    );
  }

  if (state === "executed") {
    return (
      <div aria-live="polite" className="flex items-start gap-2 rounded-sm border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-900 dark:text-green-100">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">{uiT("ui:messages.m_263f6218b09473de")}{who}</div>
          <p className="mt-1 text-green-900/80 dark:text-green-100/80">{uiT("ui:messages.m_c91e5f787cc690ae")}{when ? ` · ${when}` : ""}.
          </p>
        </div>
      </div>
    );
  }

  if (state === "failed") {
    const errorCode = result?.errorCode?.trim();
    return (
      <div aria-live="assertive" className="space-y-2 rounded-sm border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-900 dark:text-red-100">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold uppercase tracking-(--tracking-eyebrow)">{uiT("ui:messages.m_0c4d9095e29b66dd")}</div>
            <p className="mt-1 text-red-900/80 dark:text-red-100/80">{uiT("ui:messages.m_2b88620383f3113d")}</p>
          </div>
        </div>
        {errorCode ? (
          <div className="rounded-sm border border-red-500/50 bg-background/60 px-3 py-2">
            <span className="text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-eyebrow)">{uiT("ui:messages.m_0570b384c3cecf81")}</span>{" "}
            <code className="font-mono text-foreground">{errorCode}</code>
          </div>
        ) : null}
      </div>
    );
  }

  if (state === "declined") {
    const reason = interaction.result?.reason?.trim();
    return (
      <div className="space-y-2 rounded-sm border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-900 dark:text-red-100">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{uiT("ui:messages.m_66c88919768b5e49")}{who}</div>
            <p className="mt-1 text-red-900/80 dark:text-red-100/80">{uiT("ui:messages.m_383649952b47b11a")}</p>
          </div>
        </div>
        {reason ? (
          <div className="rounded-sm border border-red-500/40 bg-background/60 px-3 py-2 text-foreground">
            <MarkdownBody>{reason}</MarkdownBody>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-sm border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium text-foreground">{uiT("ui:messages.m_63284dbbf1a312e6")}{when ? ` · ${when}` : ""}</div>
        <p className="mt-1">{uiT("ui:messages.m_7676878454063aec")}</p>
      </div>
    </div>
  );
}

function RequestSecretProposalCard({
  footerSlot,
  interaction,
  state,
  resolvedByLabel,
  onAcceptInteraction,
  onRejectInteraction,
}: {
  footerSlot?: ReactNode;
  interaction: RequestConfirmationInteraction;
  state: SecretProposalCardState;
  resolvedByLabel: string | null;
  onAcceptInteraction?: (interaction: RequestConfirmationInteraction) => Promise<void> | void;
  onRejectInteraction?: (
    interaction: RequestConfirmationInteraction,
    reason?: string,
  ) => Promise<void> | void;
}) {
  const payload = interaction.payload.secretProposal!;
  const [working, setWorking] = useState<"accept" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();
  const isPending = state === "pending";

  useEffect(() => {
    setActionError(null);
    if (!isPending) setWorking(null);
  }, [interaction.id, isPending]);

  async function handleAccept() {
    if (!onAcceptInteraction) return;
    setWorking("accept");
    setActionError(null);
    try {
      await onAcceptInteraction(interaction);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function handleReject(reason?: string) {
    if (!onRejectInteraction) return;
    setWorking("reject");
    setActionError(null);
    try {
      await onRejectInteraction(interaction, reason);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-4">
      <SecretProposalIdentityHeader state={state} />
      <SecretProposalDetails payload={payload} />
      <ProposalJustification justification={payload.justification} />
      <div className="flex items-center gap-2 text-(length:--text-micro) text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />{uiT("ui:messages.m_d970e4fd1080c607")}{formatDateTime(payload.expiresAt)}
      </div>

      {isPending ? (
        <ConfirmationActionRow
          footerSlot={footerSlot}
          resetKey={`${interaction.id}:${interaction.status}`}
          approveLabel={interaction.payload.acceptLabel ?? "Approve & bind"}
          reviseLabel="Add reason…"
          rejectLabel={interaction.payload.rejectLabel ?? "Reject"}
          approveVariant="cta"
          allowRevise={interaction.payload.allowDeclineReason !== false}
          rejectRequiresReason={interaction.payload.rejectRequiresReason === true}
          reasonPlaceholder={interaction.payload.declineReasonPlaceholder ?? "Optional: explain why this binding should not be created."}
          working={working}
          actionError={actionError}
          preparingApproval={isInteractionPreparingApproval(interaction)}
          canApprove={Boolean(onAcceptInteraction)}
          canReject={Boolean(onRejectInteraction)}
          onApprove={() => void handleAccept()}
          onReject={(reason) => void handleReject(reason)}
          stackActionsOnMobile
        />
      ) : (
        <SecretProposalResolution
          interaction={interaction}
          state={state}
          resolvedByLabel={resolvedByLabel}
        />
      )}
    </div>
  );
}

/**
 * The single approval grammar shared by every plan / task-approval card
 * (PAP-418): **Approve · Revise… · Reject**. "Revise…" reveals an attached text
 * field for the changes you want (the former "decline with a reason" path);
 * bare "Reject" sends the work back with no note. These are the default words —
 * producers may still override the accept/reject labels for domain-specific
 * confirmations (e.g. "Delete selected"), but the shape stays consistent.
 */
const CONFIRMATION_APPROVE_LABEL = "Approve";
const CONFIRMATION_REVISE_LABEL = "Revise…";
const CONFIRMATION_REJECT_LABEL = "Reject";

/**
 * The one action control every confirmation card renders (PAP-418), collapsing
 * what used to be a two-button card plus a separate sticky Plan-pane bar into a
 * single consistent surface. Producer flags tune which affordances appear:
 * `allowDeclineReason: false` drops the Revise… path so only Approve/Reject
 * remain; `rejectRequiresReason: true` drops the bare Reject so every rejection
 * carries a note. The revise text stays attached to the card.
 */
function ConfirmationActionRow({
  footerSlot,
  resetKey,
  approveLabel,
  reviseLabel = CONFIRMATION_REVISE_LABEL,
  rejectLabel,
  approveVariant = "default",
  primaryActionOnRight = false,
  allowRevise,
  rejectRequiresReason,
  reasonPlaceholder,
  working,
  actionError,
  approveDisabled = false,
  preparingApproval = false,
  canApprove,
  canReject,
  onApprove,
  onReject,
  composeReason,
  extraReasonSatisfied = false,
  revisePanelChildren,
  stackActionsOnMobile = false,
}: {
  footerSlot?: ReactNode;
  /** Changing this (interaction id + status) collapses the revise panel and
   * clears its draft text — the row is reused across interaction updates. */
  resetKey: string;
  approveLabel: string;
  reviseLabel?: string;
  rejectLabel: string;
  approveVariant?: React.ComponentProps<typeof Button>["variant"];
  primaryActionOnRight?: boolean;
  allowRevise: boolean;
  rejectRequiresReason: boolean;
  reasonPlaceholder: string;
  working: "accept" | "reject" | null;
  actionError: string | null;
  approveDisabled?: boolean;
  preparingApproval?: boolean;
  canApprove: boolean;
  canReject: boolean;
  onApprove: () => void;
  onReject: (reason: string | undefined) => void;
  /** Compose the final reject reason from the typed text (plan cards append
   * screenshot markdown here). */
  composeReason?: (text: string) => string | undefined;
  /** A required reason is already satisfied by an attachment (e.g. screenshots),
   * so an empty text box should not block sending the revision. */
  extraReasonSatisfied?: boolean;
  /** Extra affordances rendered inside the revise panel (e.g. screenshot attach). */
  revisePanelChildren?: ReactNode;
  /** Give domain cards with longer action labels an intentional narrow-screen
   * hierarchy instead of relying on opportunistic flex wrapping. */
  stackActionsOnMobile?: boolean;
}) {
  const [revising, setRevising] = useState(false);
  const { enabled: coordinatorEnabled } = useCoordinatorWorkspaceEnabled();
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    setRevising(false);
    setReason("");
    setAttempted(false);
  }, [resetKey]);

  const trimmed = reason.trim();
  const reasonMissing = rejectRequiresReason && trimmed.length === 0 && !extraReasonSatisfied;

  function submitRevision() {
    setAttempted(true);
    if (!canReject || reasonMissing) return;
    onReject(composeReason ? composeReason(reason) : trimmed || undefined);
  }

  return (
    <div className="space-y-3">
      {preparingApproval ? <InteractionPreparationNotice /> : null}
      <DecisionCardFooter leading={footerSlot} className={coordinatorEnabled && revising ? "hidden" : undefined}>
        <div
          data-testid="confirmation-actions"
          hidden={coordinatorEnabled && revising}
          data-mobile-layout={stackActionsOnMobile ? "stacked" : "inline"}
          className={cn(
            stackActionsOnMobile
              ? "grid grid-cols-2 items-stretch gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end"
              : "flex flex-wrap items-center justify-end gap-2",
            primaryActionOnRight && "flex-row-reverse justify-start",
            coordinatorEnabled && revising && "hidden",
          )}
        >
          <Button
            size="sm"
            variant={revising ? "outline" : approveVariant}
            className={stackActionsOnMobile ? "col-span-2 w-full sm:col-auto sm:w-auto" : undefined}
            disabled={!canApprove || working !== null || approveDisabled || preparingApproval}
            onClick={onApprove}
          >
            {working === "accept" ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_e99dcb0a97a2320d")}</>
            ) : (
              approveLabel
            )}
          </Button>
          {allowRevise ? (
            <Button
              size="sm"
              variant="outline"
              className={stackActionsOnMobile ? "w-full sm:w-auto" : undefined}
              disabled={!canReject || working !== null}
              onClick={() => {
                setAttempted(false);
                setRevising((current) => !current);
              }}
            >
              {reviseLabel}
            </Button>
          ) : null}
          {!rejectRequiresReason ? (
            <Button
              size="sm"
              variant="ghost"
              className={stackActionsOnMobile ? "w-full sm:w-auto" : undefined}
              disabled={!canReject || working !== null}
              onClick={() => onReject(undefined)}
            >
              {working === "reject" && !revising ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_09868524d9262e41")}</>
              ) : (
                rejectLabel
              )}
            </Button>
          ) : null}
        </div>
      </DecisionCardFooter>

      {revising ? (
        <div className="space-y-3 rounded-sm border border-border/70 bg-background/75 p-3">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={reasonPlaceholder}
            aria-invalid={attempted && reasonMissing}
            className={cn(
              "min-h-24 bg-background text-sm",
              attempted && reasonMissing && "border-rose-500 focus-visible:ring-rose-500/25",
            )}
          />
          {attempted && reasonMissing ? (
            <p className="text-xs text-destructive">{uiT("ui:messages.m_d5ef6ba97db8fdf1")}</p>
          ) : null}
          {revisePanelChildren}
          <DecisionCardFooter leading={footerSlot}>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={working !== null}
                onClick={() => {
                  setRevising(false);
                  setAttempted(false);
                }}
              >{uiT("ui:messages.m_19766ed6ccb2f4a3")}</Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canReject || working !== null}
                onClick={submitRevision}
              >
                {working === "reject" ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_b8ed5279e897be5d")}</>
                ) : (
                  uiT("ui:messages.m_953cc98c1bd59e81")
                )}
              </Button>
            </div>
          </DecisionCardFooter>
        </div>
      ) : null}

      <InteractionActionError message={actionError} />
    </div>
  );
}

function connectionAuthorizationStatusClasses(
  state: ConnectionAuthorizationCardState,
  copy: { providerName: string; addresseeLabel: string },
): {
  shell: string;
  badge: string;
  label: string;
  Icon: typeof CheckCircle2;
} {
  switch (state) {
    case "actionable":
      return {
        shell: "border-2 border-sky-500/70 bg-transparent",
        badge: "border-sky-500/60 bg-sky-500/10 text-sky-900 dark:bg-sky-500/15 dark:text-sky-100",
        label: uiT("ui:messages.m_adf69e75cc7d3c9d"),
        Icon: KeyRound,
      };
    case "waiting":
      // Not a warning and not a failure: someone else's decision is simply
      // outstanding. The calm inert lane keeps it out of the reader's queue.
      return {
        shell: "border-border bg-transparent",
        badge: "border-border bg-muted/60 text-muted-foreground",
        label: uiT("ui:messages.m_499293feda7dfd2d", { v0: (copy.addresseeLabel) }),
        Icon: Clock,
      };
    case "connected":
      return {
        shell: "border-2 border-green-500/80 bg-transparent",
        badge: "border-green-500/60 bg-green-500/10 text-green-900 dark:bg-green-500/15 dark:text-green-100",
        label: uiT("ui:messages.m_db4ed330c9ec2ce6", { v0: (copy.providerName) }),
        Icon: CheckCircle2,
      };
    case "declined":
      return {
        shell: "border-border bg-transparent",
        badge: "border-border bg-muted/60 text-muted-foreground",
        label: "Not connected",
        Icon: MinusCircle,
      };
    case "expired":
    default:
      return {
        shell: "border-border bg-transparent",
        badge: "border-border bg-muted/60 text-muted-foreground",
        label: uiT("ui:messages.m_92b4263f21419cf4"),
        Icon: CircleDashed,
      };
  }
}

/**
 * Connection authorization — "Connect your Gmail to continue" (PAP-17796
 * Surface F, corrected in PAP-17859).
 *
 * This is deliberately *not* the generic Approve / Revise… / Reject grammar it
 * used to fall through to. Authorization is not a review: there is nothing to
 * revise, "Reject" is the wrong word for declining to link your own account,
 * and only one person in the company can answer at all. So the card composes
 * one title, one body, and exactly the affordances the reader legitimately has:
 *
 * - the addressed person gets the single primary **Connect <Provider>** target
 *   plus a plain **Not now**;
 * - anybody else gets **Waiting for <Person>** and no action at all — a
 *   policy-forbidden action is omitted, never rendered disabled, and the card
 *   must not imply a teammate can consent on their behalf;
 * - once resolved it states the outcome, who resolved it, and when.
 *
 * The primary action is a link to the server-minted authorization URL, not an
 * accept call: the OAuth callback is what resolves this interaction, so the
 * card never claims success the provider has not granted.
 */
function RequestConnectionAuthorizationCard({
  footerSlot,
  interaction,
  state,
  isAddressee,
  providerName,
  addresseeLabel,
  requestingAgentLabel,
  resolvedByLabel,
  resolvedByAgent,
  onRejectInteraction,
}: {
  footerSlot?: ReactNode;
  interaction: RequestConfirmationInteraction;
  state: ConnectionAuthorizationCardState;
  /** Is the signed-in reader the person the server addressed? */
  isAddressee: boolean;
  providerName: string;
  addresseeLabel: string;
  requestingAgentLabel: string | null;
  resolvedByLabel: string | null;
  resolvedByAgent: boolean;
  onRejectInteraction?: (
    interaction: RequestConfirmationInteraction,
    reason?: string,
  ) => Promise<void> | void;
}) {
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();
  const href = connectionAuthorizationHref(interaction);
  const declineReason = getAdministrativeReason(interaction);

  useEffect(() => {
    setActionError(null);
    setWorking(false);
  }, [interaction.id, interaction.status]);

  async function handleNotNow() {
    if (!onRejectInteraction) return;
    setWorking(true);
    setActionError(null);
    try {
      await onRejectInteraction(interaction);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  // One body, composed here rather than split between the header summary and a
  // payload prompt that repeats the title.
  //
  // The server's summary is written in the second person ("needs *your* Gmail
  // identity for work running as *you*") because the server addressed one
  // person. Shown to a teammate it names the wrong account, so a reader who is
  // not the addressee gets the same fact stated about them. Caught by rendering
  // the card, not by reading it.
  const agentLabel = requestingAgentLabel ?? "An agent";
  const lead = isAddressee
    ? interaction.summary?.trim()
      || `${agentLabel} needs your ${providerName} identity for work running as you.`
    : `${agentLabel} ${state === "connected" ? "needed" : "needs"} ${addresseeLabel}'s ${providerName} identity for work running as them.`;
  // Only the actionable state needs the consent boundary spelled out; the other
  // states carry it in their own status line.
  const consentSentence = state === "actionable" ? "No one else can complete this step." : null;

  return (
    <div className="space-y-4">
      <p
        className="max-w-3xl text-sm leading-6 text-muted-foreground"
        data-testid="connection-authorization-body"
      >
        {consentSentence ? `${lead} ${consentSentence}` : lead}
      </p>

      {state === "actionable" ? (
        <div className="space-y-3">
          {href ? (
            <DecisionCardFooter leading={footerSlot}>
              <div
                data-testid="connection-authorization-actions"
                className="grid grid-cols-1 items-stretch gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end"
              >
                <Button asChild size="sm" variant="cta" className="w-full sm:w-auto">
                  <a href={href} target="_blank" rel="noreferrer">{uiT("ui:messages.m_3b887c9884f2c97a")}{providerName}
                    <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  disabled={!onRejectInteraction || working}
                  onClick={() => void handleNotNow()}
                >
                  {working ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_23e39291d6135814")}</>
                  ) : (
                    uiT("ui:messages.m_a0e63d7c7125d29a")
                  )}
                </Button>
              </div>
            </DecisionCardFooter>
          ) : (
            // A pending card with no usable target is a server-side gap, not an
            // invitation to reuse an old URL.
            <ConnectionAuthorizationStatusLine
              Icon={TriangleAlert}
              testId="connection-authorization-no-target"
              headline="This authorization link is unavailable"
              detail={`Ask ${requestingAgentLabel ?? "the agent"} to send a fresh ${providerName} authorization link.`}
            />
          )}
          <InteractionActionError message={actionError} />
        </div>
      ) : state === "waiting" ? (
        <ConnectionAuthorizationStatusLine
          Icon={Clock}
          testId="connection-authorization-waiting"
          headline={`Waiting for ${addresseeLabel}`}
          detail={`Only ${addresseeLabel} can connect their own ${providerName} account.`}
        />
      ) : state === "connected" ? (
        <ConnectionAuthorizationStatusLine
          Icon={CheckCircle2}
          testId="connection-authorization-connected"
          headline={`${providerName} connected`}
          detail={
            <>{uiT("ui:messages.m_9952ce521b785711")}{" "}
              <span className="font-medium text-foreground">
                {/* "You" is display-cased for a badge; this is mid-sentence. */}
                {(resolvedByLabel ?? addresseeLabel) === "You" ? uiT("ui:messages.m_bb0347a468d97e98") : resolvedByLabel ?? addresseeLabel}
              </span>
              {resolvedByAgent ? <ResolvedByAgentChip /> : null}
              {interaction.resolvedAt ? uiT("ui:messages.m_4c6ed53c0a4cf54e", { v0: (formatDateTime(interaction.resolvedAt)) }) : ""}
            </>
          }
        />
      ) : (
        // Declined or expired. No Connect action: the authorization target this
        // card carried is spent, and the agent asks again with a fresh one
        // rather than the board replaying a dead URL.
        <ConnectionAuthorizationStatusLine
          Icon={state === "declined" ? MinusCircle : CircleDashed}
          testId={state === "declined" ? "connection-authorization-declined" : "connection-authorization-expired"}
          headline={state === "declined" ? `${providerName} was not connected` : "This authorization request expired"}
          detail={
            declineReason
              ?? `${requestingAgentLabel ?? "The agent"} can ask again with a new ${providerName} authorization link.`
          }
        />
      )}
    </div>
  );
}

function ConnectionAuthorizationStatusLine({
  Icon,
  testId,
  headline,
  detail,
}: {
  Icon: typeof CheckCircle2;
  testId: string;
  headline: string;
  detail: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-start gap-2 rounded-sm border border-border/70 bg-muted/30 p-3"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 space-y-0.5 text-sm">
        <div className="font-medium text-foreground">{headline}</div>
        <div className="leading-6 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function RequestConfirmationCard({
  footerSlot,
  interaction,
  compact = false,
  isPlan = false,
  primaryActionOnRight = false,
  onAcceptInteraction,
  onRejectInteraction,
  onUploadImage,
  externalReferences,
}: {
  footerSlot?: ReactNode;
  interaction: RequestConfirmationInteraction;
  compact?: boolean;
  isPlan?: boolean;
  primaryActionOnRight?: boolean;
  onAcceptInteraction?: (
    interaction: RequestConfirmationInteraction,
  ) => Promise<void> | void;
  onRejectInteraction?: (
    interaction: RequestConfirmationInteraction,
    reason?: string,
  ) => Promise<void> | void;
  onUploadImage?: (file: File) => Promise<string>;
  externalReferences?: MarkdownExternalReferenceMap;
}) {
  const [working, setWorking] = useState<"accept" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();
  const [shots, setShots] = useState<{ name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Screenshots ride along in the revise note as markdown image refs so the
  // board can attach images when sending a plan back — no schema change needed.
  const allowScreenshots = isPlan && Boolean(onUploadImage);
  const rejectRequiresReason = interaction.payload.rejectRequiresReason === true;
  const allowRevise = interaction.payload.allowDeclineReason !== false;
  const reasonPlaceholder =
    interaction.payload.declineReasonPlaceholder
    ?? (interaction.payload.acceptLabel === "Approve plan"
      ? "Optional: what would you like revised?"
      : "Optional: tell the agent what you'd change.");

  useEffect(() => {
    setActionError(null);
    setShots([]);
    setUploadError(null);
    if (interaction.status !== "pending") {
      setWorking(null);
    }
  }, [interaction.id, interaction.result?.reason, interaction.status]);

  async function handleAddScreenshots(files: FileList | null) {
    if (!onUploadImage || !files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      const uploaded: { name: string; url: string }[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const url = await onUploadImage(file);
        uploaded.push({ name: file.name || "screenshot", url });
      }
      if (uploaded.length > 0) setShots((current) => [...current, ...uploaded]);
    } catch {
      setUploadError(uiT("ui:messages.m_0764ae5ab3086410"));
    } finally {
      setUploading(false);
    }
  }

  function composeReason(text: string) {
    const trimmed = text.trim();
    if (shots.length === 0) return trimmed || undefined;
    const images = shots.map((s) => `![${s.name}](${s.url})`).join("\n");
    return [trimmed, images].filter(Boolean).join("\n\n");
  }

  async function handleAccept() {
    if (!onAcceptInteraction) return;
    setWorking("accept");
    setActionError(null);
    try {
      await onAcceptInteraction(interaction);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function handleReject(reason: string | undefined) {
    if (!onRejectInteraction) return;
    setWorking("reject");
    setActionError(null);
    try {
      await onRejectInteraction(interaction, reason);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-4">
      {interaction.status === "pending" ? (
        <div className={compact ? "space-y-3" : "space-y-3 rounded-sm border border-border/70 bg-background/75 p-4"}>
          <div data-decision-prompt={compact ? true : undefined} className={compact ? "text-lg font-medium leading-relaxed text-foreground" : "text-sm leading-6 text-foreground"}>
            {interaction.payload.prompt}
          </div>
          {interaction.payload.detailsMarkdown ? (
            compact ? <details className="group/confirmation-details">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight aria-hidden className="h-3.5 w-3.5 transition-transform group-open/confirmation-details:rotate-90 motion-reduce:transition-none" />{uiT("ui:messages.m_45989de49fb7f66d")}</summary>
              <div className="mt-2 rounded-sm bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground">
                <MarkdownBody externalReferences={externalReferences}>{interaction.payload.detailsMarkdown}</MarkdownBody>
              </div>
            </details> : <div className="border-t border-border/60 pt-3 text-sm">
              <MarkdownBody externalReferences={externalReferences}>{interaction.payload.detailsMarkdown}</MarkdownBody>
            </div>
          ) : null}
          <RequestConfirmationTargetChip
            interaction={interaction}
            target={interaction.payload.target}
          />
        </div>
      ) : null}

      {interaction.status === "pending" ? (
        <ConfirmationActionRow
          footerSlot={footerSlot}
          resetKey={`${interaction.id}:${interaction.status}`}
          approveLabel={interaction.payload.acceptLabel ?? CONFIRMATION_APPROVE_LABEL}
          rejectLabel={CONFIRMATION_REJECT_LABEL}
          approveVariant={isPlan ? "cta" : "default"}
          primaryActionOnRight={primaryActionOnRight}
          allowRevise={allowRevise}
          rejectRequiresReason={rejectRequiresReason}
          reasonPlaceholder={reasonPlaceholder}
          working={working}
          actionError={actionError}
          preparingApproval={isInteractionPreparingApproval(interaction)}
          canApprove={Boolean(onAcceptInteraction)}
          canReject={Boolean(onRejectInteraction)}
          onApprove={() => void handleAccept()}
          onReject={(reason) => void handleReject(reason)}
          composeReason={composeReason}
          extraReasonSatisfied={shots.length > 0}
          revisePanelChildren={
            allowScreenshots ? (
              <div className="space-y-2">
                {shots.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {shots.map((shot, index) => (
                      <div
                        key={`${shot.url}-${index}`}
                        className="group relative h-16 w-16 overflow-hidden rounded-sm border border-border/70"
                      >
                        <img
                          src={shot.url}
                          alt={shot.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label={uiT("ui:messages.m_86790c6d4f116494", { v0: (shot.name) })}
                          className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() =>
                            setShots((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleAddScreenshots(event.target.value ? event.target.files : null);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={working !== null || uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{uiT("ui:messages.m_72cb29c90ccd8361")}</>
                  ) : (
                    <>
                      <ImagePlus className="mr-2 h-3.5 w-3.5" />{uiT("ui:messages.m_d0f8e01df872f862")}</>
                  )}
                </Button>
                {uploadError ? (
                  <p className="text-xs text-destructive">{uploadError}</p>
                ) : null}
              </div>
            ) : null
          }
        />
      ) : (
        <RequestConfirmationResolution interaction={interaction} />
      )}
    </div>
  );
}

const CHECKBOX_SUMMARY_LABEL_LIMIT = 8;

function RequestCheckboxConfirmationResolution({
  interaction,
}: {
  interaction: RequestCheckboxConfirmationInteraction;
}) {
  const target = interaction.payload.target ?? null;
  const [expanded, setExpanded] = useState(false);

  if (interaction.status === "accepted") {
    const totalOptions = interaction.payload.options.length;
    const selectedLabels = getCheckboxConfirmationSelectedLabels({
      payload: interaction.payload,
      result: interaction.result,
    });
    const selectedCount = interaction.result?.selectedOptionIds?.length ?? selectedLabels.length;
    const visibleLabels = expanded
      ? selectedLabels
      : selectedLabels.slice(0, CHECKBOX_SUMMARY_LABEL_LIMIT);
    const hiddenCount = selectedLabels.length - CHECKBOX_SUMMARY_LABEL_LIMIT;
    const hasHiddenLabels = hiddenCount > 0;
    const chipClassName =
      "inline-flex items-center rounded-sm border border-border/60 bg-transparent px-2 py-0.5 text-(length:--text-nano) font-medium uppercase tracking-(--tracking-eyebrow) text-muted-foreground";

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm leading-6 text-foreground">
          <span className="font-medium">
            {selectedCount === 0
              ? uiT("ui:messages.m_1962f778e51c0325")
              : uiT("ui:messages.m_6e1d685a26f2eaaf", { v0: (selectedCount), v1: (totalOptions), v2: (totalOptions === 1 ? uiT("ui:messages.m_a11a75e0feeecc1a") : uiT("ui:messages.m_a793ab8fcc2afce5")) })}
          </span>
          <RequestConfirmationTargetChip interaction={interaction} target={target} />
        </div>
        {visibleLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleLabels.map((label, index) => (
              <TaskField key={`${label}-${index}`} label={uiT("ui:messages.m_57fd7a0cf33f2666")} value={label} />
            ))}
            {hasHiddenLabels ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className={cn(
                  chipClassName,
                  "cursor-pointer transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                )}
                aria-expanded={expanded}
              >
                {expanded ? uiT("ui:messages.m_94ea9b1d33a02975") : uiT("ui:messages.m_8769eb5def333374", { v0: (hiddenCount) })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (interaction.status === "rejected") {
    return <RequestConfirmationResolution interaction={interaction as unknown as RequestConfirmationInteraction} />;
  }

  if (interaction.status === "expired") {
    return <RequestConfirmationResolution interaction={interaction as unknown as RequestConfirmationInteraction} />;
  }

  if (interaction.status === "failed") {
    return (
      <p className="text-sm leading-6 text-muted-foreground">{uiT("ui:messages.m_7056ad01b4c11aa6")}</p>
    );
  }

  return null;
}

function CheckboxOptionRow({
  id,
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  label: string;
  description?: string | null;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 transition-colors",
        checked ? "bg-sky-500/10" : "hover:bg-sky-500/5",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onToggle(value === true)}
        aria-label={label}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-5 text-foreground">{label}</div>
        {description ? (
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </label>
  );
}

function RequestCheckboxConfirmationCard({
  footerSlot,
  interaction,
  primaryActionOnRight = false,
  onAcceptInteraction,
  onRejectInteraction,
  externalReferences,
}: {
  footerSlot?: ReactNode;
  interaction: RequestCheckboxConfirmationInteraction;
  primaryActionOnRight?: boolean;
  onAcceptInteraction?: (
    interaction: RequestCheckboxConfirmationInteraction,
    selectedClientKeys: undefined,
    selectedOptionIds: string[],
  ) => Promise<void> | void;
  onRejectInteraction?: (
    interaction: RequestCheckboxConfirmationInteraction,
    reason?: string,
  ) => Promise<void> | void;
  externalReferences?: MarkdownExternalReferenceMap;
}) {
  const options = interaction.payload.options;
  const optionIds = useMemo(() => options.map((option) => option.id), [options]);
  const validOptionIds = useMemo(() => new Set(optionIds), [optionIds]);
  const minSelected = interaction.payload.minSelected ?? 0;
  const maxSelected = interaction.payload.maxSelected ?? null;

  const defaultSelected = useMemo(
    () =>
      new Set(
        (interaction.payload.defaultSelectedOptionIds ?? []).filter((id) => validOptionIds.has(id)),
      ),
    [interaction.payload.defaultSelectedOptionIds, validOptionIds],
  );

  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(() => new Set(defaultSelected));
  const [working, setWorking] = useState<"accept" | "reject" | null>(null);
  const [acceptAttempted, setAcceptAttempted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();

  const optionSeed = useMemo(() => optionIds.join("\n"), [optionIds]);

  useEffect(() => {
    setSelectedOptionIds(new Set(defaultSelected));
    setAcceptAttempted(false);
    setActionError(null);
    if (interaction.status !== "pending") {
      setWorking(null);
    }
  }, [interaction.id, interaction.status, interaction.result?.reason, defaultSelected, optionSeed]);

  const rejectRequiresReason = interaction.payload.rejectRequiresReason === true;
  const allowRevise = interaction.payload.allowDeclineReason !== false;
  const reasonPlaceholder =
    interaction.payload.declineReasonPlaceholder ?? "Optional: tell the agent what you'd change.";

  const selectedCount = selectedOptionIds.size;
  const totalOptions = options.length;
  const atMax = maxSelected != null && selectedCount >= maxSelected;
  const belowMin = selectedCount < minSelected;
  const aboveMax = maxSelected != null && selectedCount > maxSelected;
  const selectionValid = !belowMin && !aboveMax;

  const validationMessage = belowMin
    ? minSelected === 1
      ? "Select at least 1 option."
      : `Select at least ${minSelected} options.`
    : aboveMax && maxSelected != null
      ? maxSelected === 1
        ? "Select at most 1 option."
        : `Select at most ${maxSelected} options.`
      : null;

  function toggleOption(optionId: string, checked: boolean) {
    setSelectedOptionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(optionId);
      } else {
        next.delete(optionId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    const capped = maxSelected != null ? optionIds.slice(0, maxSelected) : optionIds;
    setSelectedOptionIds(new Set(capped));
  }

  function handleClearSelection() {
    setSelectedOptionIds(new Set());
  }

  async function handleAccept() {
    setAcceptAttempted(true);
    if (!onAcceptInteraction || !selectionValid) return;
    setWorking("accept");
    setActionError(null);
    try {
      await onAcceptInteraction(interaction, undefined, [...selectedOptionIds]);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function handleReject(reason: string | undefined) {
    if (!onRejectInteraction) return;
    setWorking("reject");
    setActionError(null);
    try {
      await onRejectInteraction(interaction, reason);
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  if (interaction.status !== "pending") {
    return (
      <div className="space-y-4">
        <RequestCheckboxConfirmationResolution interaction={interaction} />
      </div>
    );
  }

  const selectionSummary = totalOptions > 0 && selectedCount === totalOptions
    ? `All ${totalOptions} options selected`
    : `${selectedCount} of ${totalOptions} ${totalOptions === 1 ? "option" : "options"} selected`;
  const boundsHint = maxSelected != null
    ? `Pick ${minSelected === maxSelected ? `exactly ${maxSelected}` : `${minSelected}-${maxSelected}`}.`
    : minSelected > 0
      ? `Pick at least ${minSelected}.`
      : null;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-sm border border-border/70 bg-background/75 p-4">
        {/* Show each piece of state once: a connection-authorization prompt is
            the same sentence as the card title, so repeating it here is noise. */}
        {interaction.payload.prompt === interaction.title ? null : (
          <div className="text-sm leading-6 text-foreground">{interaction.payload.prompt}</div>
        )}
        {interaction.payload.detailsMarkdown ? (
          <div className="border-t border-border/60 pt-3 text-sm">
            <MarkdownBody externalReferences={externalReferences}>{interaction.payload.detailsMarkdown}</MarkdownBody>
          </div>
        ) : null}
        <RequestConfirmationTargetChip
          interaction={interaction}
          target={interaction.payload.target}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{selectionSummary}</span>
            {boundsHint ? <span>{boundsHint}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={working !== null || selectedCount === totalOptions || (maxSelected != null && selectedCount >= maxSelected)}
              onClick={handleSelectAll}
            >{uiT("ui:messages.m_1fc9a387654d410f")}</Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={working !== null || selectedCount === 0}
              onClick={handleClearSelection}
            >{uiT("ui:messages.m_cea4d2e010b8fd52")}</Button>
          </div>
        </div>

        <div
          role="group"
          aria-label={uiT("ui:messages.m_aaabfe0b43a1950b")}
          className="max-h-80 overflow-y-auto rounded-sm border border-border/70"
        >
          {options.map((option) => {
            const checked = selectedOptionIds.has(option.id);
            return (
              <CheckboxOptionRow
                key={option.id}
                id={`${interaction.id}-${option.id}`}
                label={option.label}
                description={option.description}
                checked={checked}
                disabled={working !== null || (!checked && atMax)}
                onToggle={(value) => toggleOption(option.id, value)}
              />
            );
          })}
        </div>

        {acceptAttempted && validationMessage ? (
          <p className="text-xs text-destructive">{validationMessage}</p>
        ) : null}

        <ConfirmationActionRow
          footerSlot={footerSlot}
          resetKey={`${interaction.id}:${interaction.status}`}
          approveLabel={interaction.payload.acceptLabel ?? CONFIRMATION_APPROVE_LABEL}
          rejectLabel={interaction.payload.rejectLabel ?? CONFIRMATION_REJECT_LABEL}
          primaryActionOnRight={primaryActionOnRight}
          allowRevise={allowRevise}
          rejectRequiresReason={rejectRequiresReason}
          reasonPlaceholder={reasonPlaceholder}
          working={working}
          actionError={actionError}
          preparingApproval={isInteractionPreparingApproval(interaction)}
          canApprove={Boolean(onAcceptInteraction)}
          canReject={Boolean(onRejectInteraction)}
          onApprove={() => void handleAccept()}
          onReject={(reason) => void handleReject(reason)}
        />
      </div>
    </div>
  );
}

// --- Per-item verdicts (C3) ---------------------------------------------

const VERDICT_LABEL: Record<RequestItemVerdictValue, string> = {
  approve: "Approve",
  reject: "Reject",
  defer: "Defer",
};

/** Present-tense past-participle label for a resolved verdict chip. */
const VERDICT_RESOLVED_LABEL: Record<RequestItemVerdictValue, string> = {
  approve: "Approved",
  reject: "Rejected",
  defer: "Deferred",
};

function verdictChipClasses(verdict: RequestItemVerdictValue) {
  switch (verdict) {
    case "approve":
      return "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100";
    case "reject":
      return "border-rose-500/60 bg-rose-500/10 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100";
    default:
      return "border-border/70 bg-muted/40 text-muted-foreground";
  }
}

function VerdictConsequenceChip({ verdict }: { verdict: RequestItemVerdictValue }) {
  const Icon = verdict === "approve" ? CheckCircle2 : verdict === "reject" ? XCircle : MinusCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow)",
        verdictChipClasses(verdict),
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {VERDICT_RESOLVED_LABEL[verdict]}
    </span>
  );
}

function ItemVerdictDeepLink({ item, interaction }: { item: RequestItemVerdictsItem; interaction: RequestItemVerdictsInteraction }) {
  const href = itemVerdictHref(item, interaction);
  if (!href) return null;
  const isInternal = !href.startsWith("/api/") && (href.startsWith("/") || href.startsWith("#"));
  const className =
    "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
  const label = (
    <>{uiT("ui:messages.m_ed077f3d8125d60d")}{isInternal ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ExternalLink className="h-3 w-3" aria-hidden />}
    </>
  );
  if (isInternal) {
    return (
      <Link to={href} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {label}
    </a>
  );
}

function ItemVerdictSegmentedControl({
  itemId,
  verdicts,
  value,
  disabled,
  onSelect,
}: {
  itemId: string;
  verdicts: RequestItemVerdictValue[];
  value: RequestItemVerdictValue | null;
  disabled: boolean;
  onSelect: (verdict: RequestItemVerdictValue) => void;
}) {
  return (
    <div
      role="group"
      aria-label={uiT("ui:messages.m_849de4eb8d64c99c")}
      className="flex shrink-0 flex-wrap items-center gap-2"
    >
      {verdicts.map((verdict) => {
        const active = value === verdict;
        const variant = verdict === "reject"
          ? (active ? "destructive" : "outline")
          : verdict === "approve"
            ? (active ? "default" : "outline")
            : (active ? "secondary" : "outline");
        const Icon = verdict === "approve" ? Check : verdict === "reject" ? X : MinusCircle;
        return (
          <Button
            key={verdict}
            type="button"
            size="sm"
            variant={variant}
            disabled={disabled}
            aria-pressed={active}
            aria-label={uiT("ui:messages.m_fb77b19d01e3933b", { v0: (VERDICT_LABEL[verdict]) })}
            className="min-h-11 min-w-24"
            onClick={() => onSelect(verdict)}
            data-verdict={verdict}
            data-item-id={itemId}
            data-active={active}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {VERDICT_LABEL[verdict]}
          </Button>
        );
      })}
    </div>
  );
}

interface VerdictDraft {
  verdict: RequestItemVerdictValue;
  reason: string;
}

function RequestItemVerdictsCard({
  footerSlot,
  interaction,
  onSubmitInteractionVerdicts,
  externalReferences,
}: {
  footerSlot?: ReactNode;
  interaction: RequestItemVerdictsInteraction;
  onSubmitInteractionVerdicts?: (
    interaction: RequestItemVerdictsInteraction,
    verdicts: { id: string; verdict: RequestItemVerdictValue; reason?: string }[],
  ) => Promise<void> | void;
  externalReferences?: MarkdownExternalReferenceMap;
}) {
  const payload = interaction.payload;
  const items = payload.items;
  const enabledVerdicts = useMemo<RequestItemVerdictValue[]>(
    () => payload.verdicts ?? ["approve", "reject"],
    [payload.verdicts],
  );
  const requireReasonOn = useMemo(
    () => new Set<RequestItemVerdictValue>(payload.requireReasonOn ?? ["reject"]),
    [payload.requireReasonOn],
  );
  const allowBulkApprove = payload.allowBulkApprove !== false && enabledVerdicts.includes("approve");
  const reasonLabel = payload.reasonLabel ?? "Reason";

  const resolvedById = useMemo(
    () => new Map<string, RequestItemVerdictsResultItem>((interaction.result?.items ?? []).map((item) => [item.id, item])),
    [interaction.result],
  );

  const [drafts, setDrafts] = useState<Map<string, VerdictDraft>>(new Map());
  const [applyingItemIds, setApplyingItemIds] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resolutionErrorMessage = useResolutionErrorMessage();

  // When the server merges newly-resolved items, drop their local drafts and
  // clear the applying/working state so the terminal chips take over (S3 → S4).
  useEffect(() => {
    setDrafts((current) => {
      let changed = false;
      const next = new Map(current);
      for (const id of [...next.keys()]) {
        if (resolvedById.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setApplyingItemIds(new Set());
    setWorking(false);
    setActionError(null);
  }, [resolvedById]);

  const progress = getItemVerdictProgress({ payload, result: interaction.result });
  const isTerminal = interaction.status !== "pending";
  const isExpired = interaction.status === "expired";
  const isComplete = interaction.status === "answered" || progress.decided === progress.total;

  const draftEntries = [...drafts.entries()];
  const draftCount = draftEntries.length;
  const invalidDraftIds = new Set(
    draftEntries
      .filter(([, draft]) => requireReasonOn.has(draft.verdict) && draft.reason.trim().length === 0)
      .map(([id]) => id),
  );
  // Apply is enabled as soon as there is ≥1 draft (spec §1). If a required
  // reject reason is missing, clicking Apply reveals the inline error instead
  // of silently submitting — the reason gates the actual submit (spec AC).
  const hasDrafts = draftCount > 0 && !working && Boolean(onSubmitInteractionVerdicts);
  const canApply = hasDrafts && invalidDraftIds.size === 0;

  function toggleDraft(itemId: string, verdict: RequestItemVerdictValue) {
    setDrafts((current) => {
      const next = new Map(current);
      const existing = next.get(itemId);
      if (existing?.verdict === verdict) {
        next.delete(itemId); // per-item undo
      } else {
        next.set(itemId, { verdict, reason: existing?.reason ?? "" });
      }
      return next;
    });
  }

  function setDraftReason(itemId: string, reason: string) {
    setDrafts((current) => {
      const existing = current.get(itemId);
      if (!existing) return current;
      const next = new Map(current);
      next.set(itemId, { ...existing, reason });
      return next;
    });
  }

  function handleApproveAll() {
    if (!allowBulkApprove) return;
    setDrafts((current) => {
      const next = new Map(current);
      for (const id of progress.pendingItemIds) {
        const existing = next.get(id);
        next.set(id, { verdict: "approve", reason: existing?.reason ?? "" });
      }
      return next;
    });
  }

  async function handleApply() {
    setAttempted(true);
    if (!onSubmitInteractionVerdicts || draftCount === 0 || invalidDraftIds.size > 0) return;
    const verdicts = draftEntries.map(([id, draft]) => ({
      id,
      verdict: draft.verdict,
      reason: draft.reason.trim() ? draft.reason.trim() : undefined,
    }));
    setWorking(true);
    setApplyingItemIds(new Set(verdicts.map((entry) => entry.id)));
    setActionError(null);
    try {
      await onSubmitInteractionVerdicts(interaction, verdicts);
      // Success: the parent refetch updates `interaction.result`, the effect
      // above clears drafts + applying state, and terminal chips render.
    } catch (error) {
      setActionError(resolutionErrorMessage(error));
      setApplyingItemIds(new Set());
      setWorking(false);
    }
  }

  const applyLabel = draftCount === 0
    ? "Apply 0 decisions"
    : `Apply ${draftCount} decision${draftCount === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4">
      {/* Prompt + details (S1) */}
      <div className="space-y-3 rounded-sm border border-border/70 bg-background/75 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm leading-6 text-foreground">{payload.prompt}</div>
          <VerdictProgressBadge progress={progress} pendingReason={invalidDraftIds.size > 0} />
        </div>
        {payload.detailsMarkdown ? (
          <div className="border-t border-border/60 pt-3 text-sm">
            <MarkdownBody externalReferences={externalReferences}>{payload.detailsMarkdown}</MarkdownBody>
          </div>
        ) : null}
        {interaction.payload.target ? (
          <RequestConfirmationTargetChip interaction={interaction} target={interaction.payload.target} />
        ) : null}
      </div>

      {/* Stale / superseded notice (S6) */}
      {isExpired ? (
        <div className="rounded-sm border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {interaction.result?.outcome === "superseded_by_comment"
              ? uiT("ui:messages.m_080c089706f6ea0f")
              : interaction.result?.outcome === "stale_target"
                ? uiT("ui:messages.m_66123ea977259592")
                : uiT("ui:messages.m_36cd0712e3aa8335")}
          </div>
          {progress.decided > 0 ? (
            <p className="mt-1 text-xs leading-5">
              {progress.decided === 1 ? uiT("ui:messages.m_f4000d8ca4f0fdf5") : uiT("ui:messages.m_56aa0570f64f15fc", { v0: (progress.decided) })}{uiT("ui:messages.m_26943104fab5a2e7")}</p>
          ) : null}
        </div>
      ) : null}

      {/* Item list (S1/S2/S3/S4) */}
      <ul className="space-y-2" aria-label={uiT("ui:messages.m_6cac728c6d49cabe")}>
        {items.map((item) => {
          const resolved = resolvedById.get(item.id);
          const applying = applyingItemIds.has(item.id);
          const draft = drafts.get(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-sm border border-border/70 bg-background/60 p-3",
                draft && !resolved && "border-border",
              )}
              data-item-id={item.id}
              data-item-state={resolved ? "resolved" : applying ? "applying" : draft ? "draft" : "pending"}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium leading-5 text-foreground">{item.label}</span>
                    <ItemVerdictDeepLink item={item} interaction={interaction} />
                  </div>
                  {item.description ? (
                    <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{item.description}</p>
                  ) : null}
                  {item.previewMarkdown ? (
                    <div className="mt-2 rounded-sm border border-border/50 bg-muted/20 px-2.5 py-2 text-xs">
                      <MarkdownBody externalReferences={externalReferences}>{item.previewMarkdown}</MarkdownBody>
                    </div>
                  ) : null}
                  {resolved?.reason ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground">{reasonLabel}: </span>
                      {resolved.reason}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {resolved ? (
                    <VerdictConsequenceChip verdict={resolved.verdict} />
                  ) : applying ? (
                    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border/70 bg-muted/40 px-2 py-0.5 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />{uiT("ui:messages.m_3329a9bb48b9c8d4")}</span>
                  ) : isTerminal ? (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-border/70 bg-muted/30 px-2 py-0.5 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
                      <CircleDashed className="h-3.5 w-3.5" aria-hidden />{uiT("ui:messages.m_4fb8e6bd5ffdafb6")}</span>
                  ) : (
                    <ItemVerdictSegmentedControl
                      itemId={item.id}
                      verdicts={enabledVerdicts}
                      value={draft?.verdict ?? null}
                      disabled={working}
                      onSelect={(verdict) => toggleDraft(item.id, verdict)}
                    />
                  )}
                </div>
              </div>

              {/* Draft reason field (S2) — reveals when the draft verdict needs a reason */}
              {!resolved && !applying && draft && requireReasonOn.has(draft.verdict) ? (
                <div className="mt-3 space-y-1.5">
                  <label
                    htmlFor={`${interaction.id}-${item.id}-reason`}
                    className="text-xs font-medium text-foreground"
                  >
                    {reasonLabel}
                  </label>
                  <Textarea
                    id={`${interaction.id}-${item.id}-reason`}
                    value={draft.reason}
                    onChange={(event) => setDraftReason(item.id, event.target.value)}
                    placeholder={uiT("ui:messages.m_0149096b8e353627")}
                    aria-invalid={attempted && invalidDraftIds.has(item.id)}
                    className={cn(
                      "min-h-16 bg-background text-sm",
                      attempted && invalidDraftIds.has(item.id) && "border-rose-500 focus-visible:ring-rose-500/25",
                    )}
                  />
                  {attempted && invalidDraftIds.has(item.id) ? (
                    <p className="text-xs text-destructive">{uiT("ui:messages.m_7bac9427778c2724")}{VERDICT_LABEL[draft.verdict].toLowerCase()}{uiT("ui:messages.m_1ec8bfc5c3c0c5c0")}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Complete summary (S5) */}
      {isComplete && !isExpired ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <span className="font-medium">
            {progress.decided}{uiT("ui:messages.m_c18905f5e7ba6072")}{progress.approved}{uiT("ui:messages.m_fa552f18cd584e6c")}{progress.rejected}{uiT("ui:messages.m_76d920c4b1d2fdd5")}{progress.deferred > 0 ? uiT("ui:messages.m_45c830a8191a47ec", { v0: (progress.deferred) }) : ""}
          </span>
        </div>
      ) : null}

      {/* Pinned batch bar (S1/S2) — only while items remain actionable */}
      {!isTerminal && progress.pendingItemIds.length > 0 ? (
        <DecisionCardFooter leading={footerSlot}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <div className="text-xs text-muted-foreground">
              {draftCount > 0
                ? uiT("ui:messages.m_846180a4202f3066", { v0: (draftCount), v1: (draftCount === 1 ? "" : uiT("ui:messages.m_043a718774c572bd")) })
                : uiT("ui:messages.m_881de88bc923c13d")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {allowBulkApprove ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={working || progress.pendingItemIds.length === 0}
                  onClick={handleApproveAll}
                >
                  <ThumbsUp className="h-4 w-4" aria-hidden />{uiT("ui:messages.m_ae067b6871072a45")}</Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="default"
                aria-disabled={!canApply}
                disabled={!hasDrafts}
                onClick={() => void handleApply()}
              >
                {working ? (
                  <>
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />{uiT("ui:messages.m_3329a9bb48b9c8d4")}</>
                ) : (
                  applyLabel
                )}
              </Button>
            </div>
          </div>
        </DecisionCardFooter>
      ) : null}

      <InteractionActionError message={actionError} />
    </div>
  );
}

function VerdictProgressBadge({
  progress,
  pendingReason,
}: {
  progress: ReturnType<typeof getItemVerdictProgress>;
  pendingReason: boolean;
}) {
  const pct = progress.total > 0 ? Math.round((progress.decided / progress.total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {/* Von Restorff accent when a draft reject is missing its reason */}
      {pendingReason ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-eyebrow) text-amber-900 dark:text-amber-100">
          <AlertTriangle className="h-3 w-3" aria-hidden />{uiT("ui:messages.m_e2d71a28dacc5d9e")}</span>
      ) : null}
      <div
        className="flex items-center gap-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.decided}
        aria-label={uiT("ui:messages.m_d95cde7cac421f2f", { v0: (progress.decided), v1: (progress.total) })}
      >
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
          {progress.decided}{uiT("ui:messages.m_a4282e4b2298b90b")}{progress.total}{uiT("ui:messages.m_9c843b82f79501bd")}</span>
      </div>
    </div>
  );
}

export function IssueThreadInteractionCard({
  interaction,
  presentationVariant = "default",
  footerSlot,
  agentMap,
  currentUserId,
  userLabelMap,
  onAcceptInteraction,
  onRejectInteraction,
  onSubmitInteractionAnswers,
  onCancelInteraction,
  primaryActionOnRight,
  onSubmitInteractionVerdicts,
  onUploadImage,
  externalReferences,
}: IssueThreadInteractionCardProps) {
  const { enabled: coordinatorEnabled } = useCoordinatorWorkspaceEnabled();
  const compactDecision = presentationVariant === "coordinator-decision";
  // Single enforcement point (PAP-424, plan from PAP-420; extended by PAP-437):
  // a card that should never be drawn — a degenerate `ask_user_questions`
  // (placeholder junk like the onboarding `Test / A` card, no genuine question)
  // or a stale sibling the server auto-expired when its creator posted a newer
  // question (`superseded_by_newer_interaction`). Every render site (both thread
  // backbones + the attention resolver) routes through this component, so
  // suppressing here suppresses it everywhere at once. The interaction is still
  // created and stored server-side; only the render is suppressed. Composition
  // sites additionally filter it so no empty slot lingers.
  if (shouldHideInteractionCard(interaction)) return null;
  const isPlan = isPlanConfirmation(interaction);
  const isToolAction =
    interaction.kind === "request_confirmation" && isToolActionConfirmation(interaction);
  const isSecretProposal =
    interaction.kind === "request_confirmation" && isSecretProposalConfirmation(interaction);
  const connectionAuthorization = connectionAuthorizationPayload(interaction);
  const isConnectionAddressee =
    connectionAuthorization && interaction.kind === "request_confirmation"
      ? isConnectionAuthorizationAddressee({ interaction, currentUserId })
      : false;
  const connectionAuthorizationState =
    connectionAuthorization && interaction.kind === "request_confirmation"
      ? connectionAuthorizationCardState({ interaction, isAddressee: isConnectionAddressee })
      : null;
  const toolActionState =
    isToolAction && interaction.kind === "request_confirmation"
      ? toolActionCardState(interaction)
      : null;
  const toolActionStyles = toolActionState ? toolActionStatusClasses(toolActionState) : null;
  const secretProposalState =
    isSecretProposal && interaction.kind === "request_confirmation"
      ? secretProposalCardState(interaction)
      : null;
  const secretProposalStyles = secretProposalState
    ? secretProposalStatusClasses(secretProposalState)
    : null;
  const resumeFailure = requestConfirmationResumeFailure(interaction);
  const planStyles = isPlan
    ? planStatusClasses(
        interaction.status,
        resumeFailure,
        interaction.result && "outcome" in interaction.result ? interaction.result.outcome : null,
      )
    : null;
  // Interactions can be directed at a specific agent or board user. Resolved
  // before the status styling because the connection-authorization badge names
  // the addressee ("Waiting for Carol").
  const addresseeLabel = interaction.addresseeAgentId || interaction.addresseeUserId
    ? resolveActorLabel({
        agentId: interaction.addresseeAgentId,
        userId: interaction.addresseeUserId,
        agentMap,
        currentUserId,
        userLabelMap,
      })
    : null;
  const connectionAuthorizationStyles = connectionAuthorization && connectionAuthorizationState
    ? connectionAuthorizationStatusClasses(connectionAuthorizationState, {
        providerName: connectionAuthorization.providerName,
        addresseeLabel: addresseeLabel ?? "the addressed person",
      })
    : null;
  const activeStyles =
    connectionAuthorizationStyles ?? secretProposalStyles ?? toolActionStyles ?? planStyles;
  const adminOutcome = getAdministrativeOutcome(interaction);
  const adminReason = adminOutcome ? getAdministrativeReason(interaction) : null;
  // P4 (design review R2): a withdrawal is a neutral administrative retraction by
  // the requester — NOT a board "no". It must not inherit the `cancelled` card's
  // rose/red border + XCircle, which is pixel-identical to a rejected plan and
  // mis-signals a denial to anyone scanning the thread. Give withdrawn its own
  // inert lane (sibling to the calm `expired` state): muted border/badge +
  // MinusCircle ("retracted"). This overrides the plan/tool-action/status styling
  // so a withdrawn plan or confirmation reads "closed", not "changes requested".
  const withdrawnStyles =
    adminOutcome === "withdrawn"
      ? { shell: "border-border bg-transparent", badge: "border-border bg-muted/60 text-muted-foreground" }
      : null;
  const StatusIcon = withdrawnStyles
    ? MinusCircle
    : activeStyles
      ? activeStyles.Icon
      : statusIcon(interaction.status);
  const iconSpin = secretProposalStyles?.spin ?? toolActionStyles?.spin ?? false;
  const styles = withdrawnStyles ?? activeStyles ?? statusClasses(interaction.status);
  const createdByLabel = resolveActorLabel({
    agentId: interaction.createdByAgentId,
    userId: interaction.createdByUserId,
    agentMap,
    currentUserId,
    userLabelMap,
  });
  const resolvedByLabel =
    interaction.resolvedByAgentId || interaction.resolvedByUserId
      ? resolveActorLabel({
          agentId: interaction.resolvedByAgentId,
          userId: interaction.resolvedByUserId,
          agentMap,
          currentUserId,
          userLabelMap,
        })
      : null;
  // P4: audit-visible distinction between agent and human resolution.
  const resolvedByAgent = Boolean(interaction.resolvedByAgentId);
  // PAP-17280: the effective audience, shown *before* anyone responds so a
  // reader never has to guess whether an open card is waiting on them. Derived
  // from the same server snapshot the resolver routes enforce, so the copy
  // cannot promise a wider audience than the API allows.
  const audience = describeInteractionAudience({
    interaction,
    creatorLabel: createdByLabel,
    addresseeLabel,
  });
  if (coordinatorEnabled && !compactDecision && interaction.kind === "suggest_tasks") {
    return <InteractionAudienceContext.Provider value={audience}>
      <CoordinatorTaskCommitment interaction={interaction}>
        <div className="p-4 space-y-3">
          {interaction.status === "pending" ? <InteractionAudienceLine audience={audience} /> : null}
          <SuggestTasksCard interaction={interaction} agentMap={agentMap} currentUserId={currentUserId}
            userLabelMap={userLabelMap} onAcceptInteraction={onAcceptInteraction} onRejectInteraction={onRejectInteraction} />
        </div>
      </CoordinatorTaskCommitment>
    </InteractionAudienceContext.Provider>;
  }
  if (interaction.kind === "connection_intent" && interaction.payload.accessRequest) {
    return (
      <div id={`interaction-${interaction.id}`}>
        <ConnectionIntentInteractionBody
          footerSlot={footerSlot}
          interaction={interaction}
          currentUserId={currentUserId}
          addresseeLabel={addresseeLabel ?? "the addressed person"}
        />
      </div>
    );
  }
  if (isToolAction && interaction.kind === "request_confirmation" && toolActionState) {
    return (
      <InteractionAudienceContext.Provider value={audience}>
        <RequestToolActionCard
          footerSlot={footerSlot}
          interaction={interaction}
          state={toolActionState}
          onAcceptInteraction={onAcceptInteraction}
          onRejectInteraction={onRejectInteraction}
          externalReferences={externalReferences}
        />
      </InteractionAudienceContext.Provider>
    );
  }
  const statusText =
    adminOutcome === "withdrawn"
      ? "Withdrawn"
      : adminOutcome === "issue_closed"
        ? "Expired · issue closed"
        : activeStyles
          ? activeStyles.label
          : statusLabel(interaction.status);

  // The decision surface already names its source task. The actionable prompt
  // carries the heading; keep only distinct context, not a second task title.
  const bodyNamesDecision = interaction.kind === "ask_user_questions"
    || (interaction.kind === "request_confirmation" && !connectionAuthorization && !isSecretProposal);
  const bodyContext = interaction.kind === "ask_user_questions"
    ? [interaction.payload.questionSet?.description, ...interaction.payload.questions.flatMap(question => [question.prompt, question.helpText])]
    : interaction.kind === "request_confirmation" ? [interaction.payload.prompt, interaction.payload.detailsMarkdown] : [];
  const summaryIsRepeated = bodyContext.some(text => text?.trim() === interaction.summary?.trim());
  const addressedElsewhere = Boolean(interaction.addresseeAgentId
    || (interaction.addresseeUserId && interaction.addresseeUserId !== currentUserId));

  return (
    // Every nested subcard resolves the same interaction, so they all explain a
    // denial with the same audience the header states (PAP-17287).
    <InteractionAudienceContext.Provider value={audience}>
      <div data-presentation={presentationVariant} className={compactDecision ? "coordinator-decision-content space-y-4" : cn("rounded-lg border p-5 shadow-none", styles.shell)}>
        {compactDecision ? <>
          {!bodyNamesDecision && interaction.title ? <h2 className="text-lg font-medium">{interaction.title}</h2> : null}
          {interaction.summary && !summaryIsRepeated && !connectionAuthorization && interaction.kind !== "connection_intent" ? <p className="text-sm text-muted-foreground">{interaction.summary}</p> : null}
          {interaction.status === "pending" ? <div className={addressedElsewhere ? undefined : "sr-only"}><InteractionAudienceLine audience={audience} variant="compact" /></div> : null}
        </> : <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="interaction-status-badge"
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow)",
                  styles.badge,
                )}
              >
                <StatusIcon className={cn("h-3.5 w-3.5", iconSpin && "animate-spin")} />
                {isSecretProposal ? (
                  <span className="flex flex-col sm:flex-row sm:items-center sm:gap-1">
                    <span>{uiT("ui:messages.m_c769362857f641b3")}</span>
                    <span className="hidden text-current/60 sm:inline">/</span>
                    <span>{statusText}</span>
                  </span>
                ) : connectionAuthorization ? (
                  // One state, in the reader's own terms: "Action required",
                  // "Waiting for Carol", "Gmail connected". The interaction kind
                  // is machinery the person being asked does not need.
                  <span>{statusText}</span>
                ) : (
                  <>
                    {isPlan ? uiT("ui:messages.m_fa8ed0bdabdd6bcb") : interactionKindLabel(interaction.kind)}
                    <span className="text-current/60">/</span>
                    {statusText}
                  </>
                )}
              </span>
              {addresseeLabel ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="gap-1"
                      data-testid="interaction-addressee-badge"
                    >
                      <Bot className="h-3 w-3" />{uiT("ui:messages.m_98502e168ecfa993")}{addresseeLabel}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">{uiT("ui:messages.m_f8fc21c15bacf45e")}{addresseeLabel}{uiT("ui:messages.m_6aabcb218e328c0b")}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>

            <div className="mt-3 text-lg font-bold text-foreground">
              {interaction.title
                ?? (interaction.kind === "suggest_tasks"
                  ? uiT("ui:messages.m_7673189563a39fca")
                  : interaction.kind === "ask_user_questions"
                    // Only a human-only card is genuinely "for the operator";
                    // an open card is answerable by any teammate (PAP-17280).
                    ? interaction.payload.title
                      ?? (audience.policy === "human_only"
                        ? uiT("ui:messages.m_09c5a86ef56d95bb")
                        : uiT("ui:messages.m_9b3aa9589f653d3f"))
                  : interaction.kind === "request_checkbox_confirmation"
                    ? uiT("ui:messages.m_afc8475cf2354609")
                    : isSecretProposal
                      ? uiT("ui:messages.m_c2a0831be09d67a5")
                    : connectionAuthorization
                      ? uiT("ui:messages.m_d0ded5faa54406e7", { v0: (connectionAuthorization.providerName) })
                    : isToolAction
                      ? uiT("ui:messages.m_76497c62df975fb0")
                      : interaction.kind === "request_item_verdicts"
                        ? uiT("ui:messages.m_2309d9300f709e31")
                        : isPlan
                          ? uiT("ui:messages.m_649e8b225605125a")
                          : uiT("ui:messages.m_92e16918fc3e80aa"))}
            </div>
            {/* A connection-authorization card composes its own single body
                below, because the closing sentence depends on whether the
                reader is the person who may consent. Rendering the summary here
                as well would be the second body PAP-17859 removed. */}
            {interaction.summary && !connectionAuthorization && interaction.kind !== "connection_intent" ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {interaction.summary}
              </p>
            ) : null}
            {interaction.status === "pending" ? (
              <InteractionAudienceLine audience={audience} className="mt-3" />
            ) : null}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-sm border border-border/70 bg-transparent px-3 py-2 text-right text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{formatShortDate(interaction.createdAt)}</div>
                <div>{uiT("ui:messages.m_b1fadb1b15f440f4")}{createdByLabel}</div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{uiT("ui:messages.m_f21b805903d72219")}{formatDateTime(interaction.createdAt)}
            </TooltipContent>
          </Tooltip>
        </div>}

        <div className={compactDecision ? undefined : "mt-5"}>
          {interaction.kind === "suggest_tasks" ? (
            <SuggestTasksCard
              footerSlot={footerSlot}
              interaction={interaction}
              agentMap={agentMap}
              currentUserId={currentUserId}
              userLabelMap={userLabelMap}
              onAcceptInteraction={onAcceptInteraction}
              onRejectInteraction={onRejectInteraction}
            />
          ) : interaction.kind === "ask_user_questions" ? (
            <AskUserQuestionsCard
              footerSlot={footerSlot}
              interaction={interaction}
              compact={compactDecision}
              onSubmitInteractionAnswers={onSubmitInteractionAnswers}
              onCancelInteraction={onCancelInteraction}
              externalReferences={externalReferences}
            />
          ) : interaction.kind === "request_checkbox_confirmation" ? (
            <RequestCheckboxConfirmationCard
              footerSlot={footerSlot}
              interaction={interaction}
              primaryActionOnRight={primaryActionOnRight}
              onAcceptInteraction={onAcceptInteraction}
              onRejectInteraction={onRejectInteraction}
              externalReferences={externalReferences}
            />
          ) : connectionAuthorization
            && interaction.kind === "request_confirmation"
            && connectionAuthorizationState ? (
            <RequestConnectionAuthorizationCard
              footerSlot={footerSlot}
              interaction={interaction}
              state={connectionAuthorizationState}
              isAddressee={isConnectionAddressee}
              providerName={connectionAuthorization.providerName}
              addresseeLabel={addresseeLabel ?? "the addressed person"}
              requestingAgentLabel={connectionAuthorization.requestingAgentName ?? null}
              resolvedByLabel={resolvedByLabel}
              resolvedByAgent={resolvedByAgent}
              onRejectInteraction={onRejectInteraction}
            />
          ) : isSecretProposal && interaction.kind === "request_confirmation" && secretProposalState ? (
            <RequestSecretProposalCard
              footerSlot={footerSlot}
              interaction={interaction}
              state={secretProposalState}
              resolvedByLabel={resolvedByLabel}
              onAcceptInteraction={onAcceptInteraction}
              onRejectInteraction={onRejectInteraction}
            />
          ) : interaction.kind === "connection_intent" ? (
            <ConnectionIntentInteractionBody
              footerSlot={footerSlot}
              interaction={interaction}
              currentUserId={currentUserId}
              addresseeLabel={addresseeLabel ?? "the addressed person"}
              addresseeName={interaction.addresseeUserId ? userLabelMap?.get(interaction.addresseeUserId) : undefined}
            />
          ) : interaction.kind === "request_item_verdicts" ? (
            <RequestItemVerdictsCard
              footerSlot={footerSlot}
              interaction={interaction}
              onSubmitInteractionVerdicts={onSubmitInteractionVerdicts}
              externalReferences={externalReferences}
            />
          ) : (
            <RequestConfirmationCard
              footerSlot={footerSlot}
              interaction={interaction}
              compact={compactDecision}
              isPlan={isPlan}
              primaryActionOnRight={primaryActionOnRight}
              onAcceptInteraction={onAcceptInteraction}
              onRejectInteraction={onRejectInteraction}
              onUploadImage={onUploadImage}
              externalReferences={externalReferences}
            />
          )}
        </div>

        {footerSlot && ((interaction.status !== "pending" && interaction.kind !== "connection_intent") || (connectionAuthorization && connectionAuthorizationState !== "actionable")) ? <DecisionCardFooter leading={footerSlot} /> : null}

        {adminOutcome === "withdrawn" ? (
          <div
            className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground"
            data-testid="interaction-withdrawn-footer"
          >
            <div>{uiT("ui:messages.m_305109dc492182d2")}{" "}
              <span className="font-medium text-foreground">{resolvedByLabel ?? uiT("ui:messages.m_647936ec3e40783d")}</span>
              {resolvedByAgent ? <ResolvedByAgentChip /> : null}
              {interaction.resolvedAt ? uiT("ui:messages.m_4c6ed53c0a4cf54e", { v0: (formatShortDate(interaction.resolvedAt)) }) : ""}
            </div>
            {adminReason ? (
              <div className="mt-1 italic text-muted-foreground/90">"{adminReason}"</div>
            ) : null}
          </div>
        ) : adminOutcome === "issue_closed" && interaction.resolvedAt ? (
          // The header badge + body already explain the issue-closed expiry;
          // the footer is just the audit timestamp.
          <div
            className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground"
            data-testid="interaction-issue-closed-footer"
          >
            {formatShortDate(interaction.resolvedAt)}
          </div>
        ) : resolvedByLabel && !isToolAction && !connectionAuthorization ? (
          // The connection-authorization card states its own resolver and
          // timestamp inside the "Gmail connected" block, so the shared footer
          // would repeat it.
          <div
            className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-0.5 border-t border-border/60 pt-3 text-xs text-muted-foreground"
            data-testid="interaction-resolved-footer"
          >{uiT("ui:messages.m_55b02ae184233b41")}<span className="font-medium text-foreground">{resolvedByLabel}</span>
            {resolvedByAgent ? <ResolvedByAgentChip /> : null}
            {interaction.resolvedAt ? uiT("ui:messages.m_4c6ed53c0a4cf54e", { v0: (formatShortDate(interaction.resolvedAt)) }) : ""}
          </div>
        ) : null}
      </div>
    </InteractionAudienceContext.Provider>
  );
}

/**
 * Small audit chip marking that an interaction was resolved by an agent (rather
 * than a human board member) — governed agent resolution introduced in P2.
 */
function ResolvedByAgentChip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="ml-1 gap-1 border-indigo-500/50 py-0 text-[length:--text-micro] text-indigo-700 dark:text-indigo-200"
          data-testid="interaction-resolved-by-agent-chip"
        >
          <Bot className="h-3 w-3" />{uiT("ui:messages.m_11b39c93777e8f1f")}</Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">{uiT("ui:messages.m_a511fb1064bcb2a0")}</TooltipContent>
    </Tooltip>
  );
}

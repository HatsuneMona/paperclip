import { t as uiT } from "@/i18n";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical, Lock, Play } from "lucide-react";
import type {
  InstanceExperimentalSettings,
  InstanceExperimentalSettingsWithManaged,
  InstanceFeatureKey,
  ManagedSettingMetadata,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { experimentalSettingKey } from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { getWorktreeInstanceId, isWorktreeRuntime } from "../lib/worktree-branding";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/lib/router";
import { CoordinatorWorkspaceSetting } from "@/components/CoordinatorWorkspaceSetting";

type WorktreeRunExecutionDisplayState =
  | { kind: "off" }
  | { kind: "armed"; activatedAt: string }
  | { kind: "fail_closed"; reason: "missing_cutoff" | "missing_instance_id" | "instance_mismatch" };

/**
 * Mirror of the server's `resolveWorktreeRunExecutionActivation` fail-closed
 * ladder (server/src/services/instance-settings.ts) so the card never claims a
 * copied/legacy row is arming execution. The derived fields are display-only —
 * the PATCH the toggle sends still writes just the boolean.
 */
function resolveWorktreeRunExecutionDisplayState(
  settings:
    | Pick<
        InstanceExperimentalSettings,
        | "enableWorktreeRunExecution"
        | "worktreeRunExecutionActivatedAt"
        | "worktreeRunExecutionActivationInstanceId"
      >
    | undefined,
  currentInstanceId: string | null,
): WorktreeRunExecutionDisplayState {
  if (settings?.enableWorktreeRunExecution !== true) return { kind: "off" };
  if (!settings.worktreeRunExecutionActivatedAt) return { kind: "fail_closed", reason: "missing_cutoff" };
  if (!currentInstanceId) return { kind: "fail_closed", reason: "missing_instance_id" };
  if (settings.worktreeRunExecutionActivationInstanceId !== currentInstanceId) {
    return { kind: "fail_closed", reason: "instance_mismatch" };
  }
  return { kind: "armed", activatedAt: settings.worktreeRunExecutionActivatedAt };
}

function formatActivationTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// PAP-11233: keep Conference Room code intact, but hide the user-facing opt-in for now.
const SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING = false;

function ManagedByCloudBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Lock aria-hidden="true" />{uiT("ui:messages.m_1c9b7618c1cd77c2")}</Badge>
  );
}

function ExperimentalToggleCard({
  title,
  description,
  footnote,
  checked,
  onCheckedChange,
  disabled,
  settingKey,
  managed,
  ariaLabel,
}: {
  title: string;
  description: string;
  footnote?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  /** Flag key backing this card; operator-hidden keys render nothing. */
  settingKey: InstanceFeatureKey;
  managed?: ManagedSettingMetadata;
  ariaLabel: string;
}) {
  const { hidden: hiddenSettings } = useHiddenSettings();
  const isManaged = managed?.managed === true;
  if (hiddenSettings.has(experimentalSettingKey(settingKey))) return null;
  return (
    <Card id={`experimental-${settingKey}`} className="block scroll-mt-4 bg-transparent p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {isManaged ? <ManagedByCloudBadge /> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          {footnote ? <p className="max-w-2xl text-xs text-muted-foreground">{footnote}</p> : null}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={(next) => {
            if (isManaged) return;
            onCheckedChange(next);
          }}
          disabled={disabled || isManaged}
          aria-label={ariaLabel}
        />
      </div>
    </Card>
  );
}

export function InstanceExperimentalSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { hidden: hiddenSettings } = useHiddenSettings();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: uiT("ui:messages.m_74a883a037bc227f"), href: "/company/settings" },
      { label: uiT("ui:messages.m_3dc9f569422dcfda") },
    ]);
  }, [setBreadcrumbs]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const toggleMutation = useMutation<
    InstanceExperimentalSettingsWithManaged,
    Error,
    PatchInstanceExperimentalSettings,
    { previousSettings?: InstanceExperimentalSettingsWithManaged }
  >({
    mutationFn: async (patch: PatchInstanceExperimentalSettings) =>
      instanceSettingsApi.updateExperimental(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instance.experimentalSettings });
      const previousSettings = queryClient.getQueryData<InstanceExperimentalSettingsWithManaged>(
        queryKeys.instance.experimentalSettings,
      );
      if (previousSettings) {
        queryClient.setQueryData<InstanceExperimentalSettingsWithManaged>(
          queryKeys.instance.experimentalSettings,
          { ...previousSettings, ...patch },
        );
      }
      return { previousSettings };
    },
    onSuccess: async (updatedSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, updatedSettings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all }),
        queryClient.invalidateQueries({ queryKey: ["built-in-agents"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
        queryClient.invalidateQueries({ queryKey: ["apps"] }),
      ]);
    },
    onError: (error, _patch, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.instance.experimentalSettings, context.previousSettings);
      }
      setActionError(error instanceof Error ? error.message : uiT("ui:messages.m_4dca3a12e5a744e5"));
    },
  });

  if (experimentalQuery.isLoading) {
    return (
      <div className="max-w-6xl space-y-6">
        <CoordinatorWorkspaceSetting key="personal-workspace" />
        <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_2f2d8e11776aaaa1")}</div>
      </div>
    );
  }

  if (experimentalQuery.error) {
    return (
      <div className="max-w-6xl space-y-6">
        <CoordinatorWorkspaceSetting key="personal-workspace" />
        <div className="text-sm text-destructive">
          {experimentalQuery.error instanceof Error
            ? experimentalQuery.error.message
            : uiT("ui:messages.m_73f7e3e898d5cc93")}
        </div>
      </div>
    );
  }

  const inWorktree = isWorktreeRuntime();
  // Present only on cloud-managed instances: keys the managed overlay controls
  // render locked with the "Managed by Paperclip Cloud" badge. Self-hosted
  // responses carry no `managedKeys`, so every card stays editable.
  const managedKeys = experimentalQuery.data?.managedKeys ?? {};
  const enableWorktreeRunExecution = experimentalQuery.data?.enableWorktreeRunExecution === true;
  const worktreeRunExecutionManaged = managedKeys.enableWorktreeRunExecution?.managed === true;
  const worktreeRunExecutionState = resolveWorktreeRunExecutionDisplayState(
    experimentalQuery.data,
    getWorktreeInstanceId(),
  );
  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableNativeRunner = experimentalQuery.data?.enableNativeRunner === true;
  const enableChatConnectors = experimentalQuery.data?.enableChatConnectors === true;
  const enableManagedSandboxOnly = experimentalQuery.data?.enableManagedSandboxOnly === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  const enableIsolatedWorkspacesByDefault =
    experimentalQuery.data?.enableIsolatedWorkspacesByDefault === true;
  // Streamlined left navigation is now the standard sidebar (PAP-12472); the
  // experimental opt-out was retired, so it no longer surfaces a toggle here.
  const enableStreamlinedUi = experimentalQuery.data?.enableStreamlinedUi !== false;
  const enableConferenceRoomChat = experimentalQuery.data?.enableConferenceRoomChat === true;
  const enableClassicTaskInterface = experimentalQuery.data?.enableClassicTaskInterface === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableExperimentalFileViewer =
    experimentalQuery.data?.enableExperimentalFileViewer === true;
  const enableExternalObjects = experimentalQuery.data?.enableExternalObjects === true;
  const enableBuiltInAgents = experimentalQuery.data?.enableBuiltInAgents === true;
  const enableBetaSkills = experimentalQuery.data?.enableBetaSkills === true;
  const enableSummaries = experimentalQuery.data?.enableSummaries === true;
  const enableStatusCards = experimentalQuery.data?.enableStatusCards === true;
  const summariesManaged = managedKeys.enableSummaries?.managed === true;
  const statusCardsManaged = managedKeys.enableStatusCards?.managed === true;
  const statusCardsBlockedByManagedSummaries = summariesManaged && !enableSummaries;
  const summariesRequiredByManagedStatusCards = statusCardsManaged && enableStatusCards;
  const enableDecisions = experimentalQuery.data?.enableDecisions === true;
  const enableGoalsSidebarLink = experimentalQuery.data?.enableGoalsSidebarLink === true;
  const enableCases = experimentalQuery.data?.enableCases === true;
  const enableServerInfoDebugView = experimentalQuery.data?.enableServerInfoDebugView === true;
  const enablePaperclipDeveloperMode =
    experimentalQuery.data?.enablePaperclipDeveloperMode === true;
  const enableSimplifiedEnglishInteractions =
    experimentalQuery.data?.enableSimplifiedEnglishInteractions === true;
  const enableFirstTaskPlanProposal =
    experimentalQuery.data?.enableFirstTaskPlanProposal === true;
  const enableSmokeLab = experimentalQuery.data?.enableSmokeLab === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;
  const isVisible = (key: InstanceFeatureKey) => !hiddenSettings.has(experimentalSettingKey(key));
  const showWorktreeRunExecution = inWorktree && isVisible("enableWorktreeRunExecution");
  const showDeveloperSection = showWorktreeRunExecution || ([
    "autoRestartDevServerWhenIdle",
    "enableManagedSandboxOnly",
    "enablePaperclipDeveloperMode",
    "enableServerInfoDebugView",
    "enableSmokeLab",
    "enableIssuePlanDecompositions",
  ] satisfies InstanceFeatureKey[]).some(isVisible);
  const showLegacySection = isVisible("enableClassicTaskInterface") || isVisible("enableGoalsSidebarLink");
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_3dc9f569422dcfda")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_ea7508fa4f2ef0e9")}</p>
      </div>

      <CoordinatorWorkspaceSetting key="personal-workspace" />

      <div
        role="alert"
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{uiT("ui:messages.m_c56337a6aee9131e")}</p>
            <p className="text-muted-foreground">
              These features are opt-in and come with no compatibility guarantees. They may change, break, or be
              removed without notice. Avoid relying on them for critical or production workflows.
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="experimental-features-heading">
        <div className="space-y-1">
          <h2 id="experimental-features-heading" className="text-sm font-semibold">{uiT("ui:messages.m_6c39e69019727335")}</h2>
          <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_18601bbe98558398")}</p>
        </div>

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_f085d2e840edaa34")}
          description="Talk to each agent in one ongoing conversation. Clarify goals and create tasks for execution. Chat leads the Work group and opens an agent rail beside the nav, and each chat's side panel shows the agent's tasks and artifacts as cards."
          footnote="Turning this off preserves conversations and lets active runs finish, but prevents new messages."
          checked={experimentalQuery.data?.enableAgentChat ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableAgentChat: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableAgentChat"
          managed={managedKeys.enableAgentChat}
          ariaLabel="Toggle agent chat experimental setting"
        />

        <ExperimentalToggleCard
          title="Artifacts V1"
          description="Show artifacts the way the artifact directions lab settled: paper stacks and tiles on the Artifacts page, compact rows in the panel's Artifacts tab, and grouped rows in the task thread."
          footnote="Presentation only. Turning this off restores the current cards; no data changes."
          checked={experimentalQuery.data?.enableArtifactsV1 ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableArtifactsV1: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableArtifactsV1"
          managed={managedKeys.enableArtifactsV1}
          ariaLabel="Toggle artifacts V1 experimental setting"
        />

        <ExperimentalToggleCard
          title="Assistant connections (MCP)"
          description="Connect Codex, Claude, and other assistants to your Paperclip organization. People sign in, select an organization once, and approve access to review work, delegate tasks, and add feedback."
          footnote={<>Requires an authenticated instance with a configured public URL. Takes effect immediately. Turning this off blocks assistant calls and event delivery; work already delegated continues.{experimentalQuery.data?.enablePublicMcp && <> <Link className="underline" to="/apps/assistant-connection">Set up an assistant connection</Link></>}</>}
          checked={experimentalQuery.data?.enablePublicMcp === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enablePublicMcp: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enablePublicMcp"
          managed={managedKeys.enablePublicMcp}
          ariaLabel="Toggle assistant connections experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_f9c378a36b089aab")}
          description="Allow agents to pin beta releases of the Paperclip core skill. Disabling this returns every agent to the default live skill without removing saved pins."
          checked={enableBetaSkills}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBetaSkills: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBetaSkills"
          managed={managedKeys.enableBetaSkills}
          ariaLabel="Toggle beta skills experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_d65ba4e58d87949d")}
          description="Show Paperclip-managed built-in agent surfaces, including built-in roster badges, the Built-in agents tab, and built-in agent setup controls."
          checked={enableBuiltInAgents}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBuiltInAgents: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBuiltInAgents"
          managed={managedKeys.enableBuiltInAgents}
          ariaLabel="Toggle built-in agents experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_2249bd503ec47d72")}
          description={uiT("ui:messages.m_fc07b4894a97dc95")}
          footnote="Turning Cases off hides the tab and blocks the case API; existing case data is kept."
          checked={enableCases}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCases: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCases"
          managed={managedKeys.enableCases}
          ariaLabel="Toggle cases experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_b5191e9ebba4ab96")}
          description="Connect agents to Slack, Discord, Microsoft Teams, and Telegram conversations."
          footnote="Turning this off hides experimental chat setup and connected-task controls. Existing chat connections keep running. AgentMail, GitHub review bots, and tool connectors are controlled separately."
          checked={enableChatConnectors}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableChatConnectors: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableChatConnectors"
          managed={managedKeys.enableChatConnectors}
          ariaLabel="Toggle chat connectors experimental setting"
        />

        <ExperimentalToggleCard
          title="Combined Inbox + Task List"
          description="Fold Inbox into Tasks. One Tasks row carries the unread badge, and a Views menu reaches every inbox view (Mine, Unread, Blocked, Recent, Everything) and every task view."
          footnote="Old Inbox links redirect to the matching view. Turning this off restores the separate Inbox; no data changes."
          checked={experimentalQuery.data?.enableCombinedInboxTasks ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCombinedInboxTasks: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCombinedInboxTasks"
          managed={managedKeys.enableCombinedInboxTasks}
          ariaLabel="Toggle combined inbox and task list experimental setting"
        />

        {SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING ? (
          <ExperimentalToggleCard
            title={uiT("ui:messages.m_d312c1e7609ca6df")}
            description="Adds a Conference Room — one chat where you and your whole team work together — plus the live activity feed and the redesigned onboarding. Also restyles task threads as chat bubbles. Turn off anytime to restore the classic UI."
            checked={enableConferenceRoomChat}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableConferenceRoomChat: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableConferenceRoomChat"
            managed={managedKeys.enableConferenceRoomChat}
            ariaLabel="Toggle conference room chat experimental setting"
          />
        ) : null}

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_cfa6a08af3ed5871")}
          description="Show the Decisions item in the main sidebar — the attention home that surfaces the tasks awaiting your input — while the surface is still being evaluated."
          checked={enableDecisions}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableDecisions: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableDecisions"
          managed={managedKeys.enableDecisions}
          ariaLabel="Toggle decisions experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_a70f2090909fdcf5")}
          description={uiT("ui:messages.m_b3175287dda828db")}
          checked={enableEnvironments}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableEnvironments: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableEnvironments"
          managed={managedKeys.enableEnvironments}
          ariaLabel="Toggle environments experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_ea85e671d52a8ee7")}
          description={uiT("ui:messages.m_c25bca5aab256e8d")}
          checked={enableExternalObjects}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExternalObjects: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExternalObjects"
          managed={managedKeys.enableExternalObjects}
          ariaLabel="Toggle external objects experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_16c5b8d606467cce")}
          description={uiT("ui:messages.m_0744839207f63ac5")}
          checked={enableIsolatedWorkspaces}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableIsolatedWorkspaces: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableIsolatedWorkspaces"
          managed={managedKeys.enableIsolatedWorkspaces}
          ariaLabel="Toggle isolated workspaces experimental setting"
        />

        <ExperimentalToggleCard
          title="Experimental fast responses"
          description="Allow short acknowledgements while agents begin work. Configure them in Settings → Connections."
          checked={experimentalQuery.data?.enableFastResponses ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableFastResponses: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableFastResponses"
          managed={managedKeys.enableFastResponses}
          ariaLabel="Toggle fast responses experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_25de8c4849879dd2")}
          description={uiT("ui:messages.m_11e499649bca1bae")}
          checked={enableExperimentalFileViewer}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExperimentalFileViewer: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExperimentalFileViewer"
          managed={managedKeys.enableExperimentalFileViewer}
          ariaLabel="Toggle experimental file viewer setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_49698152f4dce002")}
          description="When the user's first request is a single task, the chief of staff writes a short plan document and a checkbox card instead of a one-card confirmation. Applies to organizations created after the toggle is flipped."
          checked={enableFirstTaskPlanProposal}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableFirstTaskPlanProposal: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableFirstTaskPlanProposal"
          managed={managedKeys.enableFirstTaskPlanProposal}
          ariaLabel="Toggle first task plan proposal experimental setting"
        />

        <ExperimentalToggleCard
          title="GitHub review bots"
          description="Connect agents to GitHub with their own App identity to review pull requests and respond to issues."
          footnote="Independent of Chat connectors. Turning this off hides setup and management; existing bots keep running. GitHub tool connections stay available."
          checked={experimentalQuery.data?.enableGitHubReviewBots === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableGitHubReviewBots: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableGitHubReviewBots"
          managed={managedKeys.enableGitHubReviewBots}
          ariaLabel="Toggle GitHub review bots experimental setting"
        />

        <ExperimentalToggleCard
          title="Grok Bot"
          description="Connect an existing Grok Bot as an agent. Verify routine delivery and an authenticated reply before assigning work."
          footnote="Requires Assistant connections (MCP), Paperclip Runner, and authenticated public HTTPS. Usage is not reported. Turning this off blocks Grok calls and new dispatch."
          checked={experimentalQuery.data?.enableGrokBot === true}
          onCheckedChange={checked => toggleMutation.mutate({ enableGrokBot: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableGrokBot" managed={managedKeys.enableGrokBot}
          ariaLabel="Toggle Grok Bot experimental setting"
        />


        <ExperimentalToggleCard
          title={uiT("ui:messages.m_8c63d24a3b8b88f6")}
          description={uiT("ui:messages.m_e4b849fed91dd17e")}
          footnote="Turning this off hides setup for these connectors. Existing connections keep running."
          checked={experimentalQuery.data?.enableMemoryConnectors === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableMemoryConnectors: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableMemoryConnectors"
          managed={managedKeys.enableMemoryConnectors}
          ariaLabel="Toggle memory connectors experimental setting"
        />

        <ExperimentalToggleCard
          title="Muse — Personal agent"
          description="Connect your personal Meta Muse. Pair it, detect its receiver, and verify an independent background reply before assigning tasks."
          footnote="Requires Paperclip Runner and an authenticated instance with a public HTTPS URL. Turning this off blocks new work; cleanup and stop evidence remain available. Provider usage and cost are unavailable."
          checked={experimentalQuery.data?.enableMuse === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableMuse: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableMuse"
          managed={managedKeys.enableMuse}
          ariaLabel="Toggle Muse experimental setting"
        />

        <ExperimentalToggleCard
          title="OpenAI Dot"
          description="Add OpenAI Dot as a standalone agent choice. Pair your Dot and verify event delivery before assigning work."
          footnote="Requires Assistant connections (MCP) and an authenticated instance with a public HTTPS URL. Turning this off blocks Dot calls and new work; saved connections are kept."
          checked={experimentalQuery.data?.enableOpenAiDot === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableOpenAiDot: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableOpenAiDot"
          managed={managedKeys.enableOpenAiDot}
          ariaLabel="Toggle OpenAI Dot experimental setting"
        />


        <ExperimentalToggleCard
          title={uiT("ui:messages.m_aacfc564be2ab279")}
          description="Allow agents to select Paperclip Runner, including authenticated runner ingress when a sandbox requires it. First-run setup offers qualified GitHub Copilot. Turning this off hides the choice without affecting existing native runs."
          checked={enableNativeRunner}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableNativeRunner: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableNativeRunner"
          managed={managedKeys.enableNativeRunner}
          ariaLabel="Toggle Paperclip Runner experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_6f7129868f1e8152")}
          description="Instruct agents to write user interactions (plan confirmations, questions, suggested tasks, checkbox prompts) in ASD-STE100 Simplified Technical English, with brief context on what information the decision needs and what happens for each choice."
          checked={enableSimplifiedEnglishInteractions}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableSimplifiedEnglishInteractions: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableSimplifiedEnglishInteractions"
          managed={managedKeys.enableSimplifiedEnglishInteractions}
          ariaLabel="Toggle simplified english interactions experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_a992c41e645a01c6")}
          description={uiT("ui:messages.m_7e3b32f64f5656d0")}
          footnote="Enabling Status Cards also enables Summaries."
          checked={enableStatusCards}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked
                ? { enableSummaries: true, enableStatusCards: true }
                : { enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || statusCardsBlockedByManagedSummaries}
          settingKey="enableStatusCards"
          managed={managedKeys.enableStatusCards}
          ariaLabel="Toggle status cards experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_7e741dd57836a8d1")}
          description={uiT("ui:messages.m_07709940c02a8b6f")}
          footnote="Turning this off restores the legacy shell and navigation. Task and page data are unchanged."
          checked={enableStreamlinedUi}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableStreamlinedUi: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableStreamlinedUi"
          managed={managedKeys.enableStreamlinedUi}
          ariaLabel="Toggle Streamlined UI experimental setting"
        />

        <ExperimentalToggleCard
          title={uiT("ui:messages.m_87bc590e047d3df4")}
          description="Show Summarizer-generated status slots on project and workspace pages, with on-demand refresh and revision history. Existing summary data is kept when this is disabled."
          footnote="Status Cards requires Summaries. Disabling Summaries also disables Status Cards."
          checked={enableSummaries}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked || !enableStatusCards
                ? { enableSummaries: checked }
                : { enableSummaries: false, enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || summariesRequiredByManagedStatusCards}
          settingKey="enableSummaries"
          managed={managedKeys.enableSummaries}
          ariaLabel="Toggle summaries experimental setting"
        />

        {enableIsolatedWorkspaces && (
          <ExperimentalToggleCard
            title={uiT("ui:messages.m_10a22b32ed952492")}
            description="Treat a project that has no execution workspace policy of its own as if it selected isolated workspaces, so its tasks get a per-task worktree instead of sharing the project checkout. A project that carries its own policy keeps it."
            checked={enableIsolatedWorkspacesByDefault}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableIsolatedWorkspacesByDefault: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableIsolatedWorkspacesByDefault"
            managed={managedKeys.enableIsolatedWorkspacesByDefault}
            ariaLabel="Toggle isolated workspaces by default experimental setting"
          />
        )}
      </section>

      {showDeveloperSection ? (
        <section className="space-y-3" aria-labelledby="developer-mode-heading">
          <div className="space-y-1">
            <h2 id="developer-mode-heading" className="text-sm font-semibold">{uiT("ui:messages.m_583aec778d48e139")}</h2>
            <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_6a2266866b748e7c")}</p>
          </div>

          <ExperimentalToggleCard
            title={uiT("ui:messages.m_0a38cef93ab9d266")}
            description="In `pnpm dev:once`, wait for all queued and running local agent runs to finish, then restart the server automatically when backend changes or migrations make the current boot stale."
            checked={autoRestartDevServerWhenIdle}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ autoRestartDevServerWhenIdle: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="autoRestartDevServerWhenIdle"
            managed={managedKeys.autoRestartDevServerWhenIdle}
            ariaLabel="Toggle guarded dev-server auto-restart"
          />

          <ExperimentalToggleCard
            title={uiT("ui:messages.m_700f95ac2a103641")}
            description={uiT("ui:messages.m_98d7dfb49bec6cd4")}
            checked={enableManagedSandboxOnly}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableManagedSandboxOnly: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableManagedSandboxOnly"
            managed={managedKeys.enableManagedSandboxOnly}
            ariaLabel="Toggle managed environment only experimental setting"
          />

          <ExperimentalToggleCard
            title={uiT("ui:messages.m_583aec778d48e139")}
            description={uiT("ui:messages.m_661a5edf657a6461")}
            checked={enablePaperclipDeveloperMode}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enablePaperclipDeveloperMode: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enablePaperclipDeveloperMode"
            managed={managedKeys.enablePaperclipDeveloperMode}
            ariaLabel="Toggle Paperclip developer mode experimental setting"
          />

          {showWorktreeRunExecution ? (
            <Card className="block bg-transparent p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{uiT("ui:messages.m_ddf0b4126c8d5127")}</h3>
                      {worktreeRunExecutionManaged ? <ManagedByCloudBadge /> : null}
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      This is an isolated git-worktree preview instance. Turn this on to let the scheduler execute runs
                      here. Only tasks created after enabling will run automatically — copied/pre-existing tasks stay
                      parked. Toggling off and on resets the cutoff.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={enableWorktreeRunExecution}
                    onCheckedChange={(checked) => {
                      if (worktreeRunExecutionManaged) return;
                      toggleMutation.mutate({ enableWorktreeRunExecution: checked });
                    }}
                    disabled={toggleMutation.isPending || worktreeRunExecutionManaged}
                    aria-label={uiT("ui:messages.m_0818b1789db9ffab")}
                  />
                </div>

                {worktreeRunExecutionState.kind === "armed" ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-foreground">
                    <Play className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{uiT("ui:messages.m_590de07dbd7e5349")}{" "}
                      <span className="font-medium">
                        {formatActivationTimestamp(worktreeRunExecutionState.activatedAt)}
                      </span>
                      .
                    </span>
                  </div>
                ) : null}

                {worktreeRunExecutionState.kind === "fail_closed" ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">{uiT("ui:messages.m_7f517ce7f9bb3d8e")}</p>
                      <p className="text-muted-foreground">
                        {worktreeRunExecutionState.reason === "instance_mismatch"
                          ? uiT("ui:messages.m_bb8225347471b184")
                          : uiT("ui:messages.m_122b697179700cdf")}{" "}{uiT("ui:messages.m_bb5fd3d44f2ca7a4")}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <ExperimentalToggleCard
            title={uiT("ui:messages.m_bf7d35b54ddf6ebf")}
            description={uiT("ui:messages.m_da21aa822f8ef28e")}
            checked={enableServerInfoDebugView}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableServerInfoDebugView: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableServerInfoDebugView"
            managed={managedKeys.enableServerInfoDebugView}
            ariaLabel="Toggle server info debug view experimental setting"
          />

          <ExperimentalToggleCard
            title="Smoke Lab"
            description='Add a "Smoke Lab" tab under Apps → Developer and an "Integration smoke" card on the dashboard for exercising every integration path against deterministic local fixtures (fake OAuth provider + loopback MCP servers). Private (non-public) deployments only.'
            checked={enableSmokeLab}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableSmokeLab: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableSmokeLab"
            managed={managedKeys.enableSmokeLab}
            ariaLabel="Toggle smoke lab experimental setting"
          />

          <ExperimentalToggleCard
            title={uiT("ui:messages.m_6de8a3e6d2b27308")}
            description="Show accepted-plan decomposition history on task detail pages. Intended for debugging and validating subtask creation behavior while the presentation is still being refined."
            checked={enableIssuePlanDecompositions}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableIssuePlanDecompositions: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableIssuePlanDecompositions"
            managed={managedKeys.enableIssuePlanDecompositions}
            ariaLabel="Toggle task plan decomposition panel experimental setting"
          />
        </section>
      ) : null}

      {showLegacySection ? (
        <section className="space-y-3" aria-labelledby="legacy-heading">
          <div className="space-y-1">
            <h2 id="legacy-heading" className="text-sm font-semibold">{uiT("ui:messages.m_1432897a6136de54")}</h2>
            <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_c8a12a1f9b0e1f60")}</p>
          </div>

          <ExperimentalToggleCard
            title={uiT("ui:messages.m_bc2e9527f09d202c")}
            description="Restores the previous task detail page: the page-level header with inline description editing, the plain comment thread, and the fixed Properties sidebar. Chat-only features — streaming activity folding, inline plan and question cards, the three-mode composer — are unavailable in the classic view."
            footnote="Switching takes effect immediately. No task data is affected."
            checked={enableClassicTaskInterface}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableClassicTaskInterface: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableClassicTaskInterface"
            managed={managedKeys.enableClassicTaskInterface}
            ariaLabel="Toggle classic task interface experimental setting"
          />

          <ExperimentalToggleCard
            title={uiT("ui:messages.m_1229533e28502771")}
            description={uiT("ui:messages.m_4f370832b26d4ac3")}
            checked={enableGoalsSidebarLink}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableGoalsSidebarLink: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableGoalsSidebarLink"
            managed={managedKeys.enableGoalsSidebarLink}
            ariaLabel="Toggle goals sidebar link experimental setting"
          />
        </section>
      ) : null}
    </div>
  );
}

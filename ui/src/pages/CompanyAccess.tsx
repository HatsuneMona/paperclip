import { t as uiT } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HUMAN_COMPANY_MEMBERSHIP_ROLE_LABELS,
  hidesCompanyPage,
  type Agent,
} from "@paperclipai/shared";
import { Shield, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { accessApi, type CompanyMember } from "@/api/access";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import { cloudApi } from "@/api/cloud";
import { issuesApi } from "@/api/issues";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Link, Navigate, useSearchParams } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { cloudStackInviteUrl } from "@/lib/cloudLinks";
import { usePluginSlots } from "@/plugins/slots";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTabBar } from "@/components/PageTabBar";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { useCloudInstance } from "@/hooks/useCloudInstance";
import { InvitesSection } from "@/components/access/InvitesSection";

const reassignmentIssueStatuses = "backlog,todo,in_progress,in_review,blocked,failed,timed_out";
type EditableMemberStatus = "pending" | "active" | "suspended";

export function CompanyAccess() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const cloud = useCloudInstance();
  const cloudStacksQuery = useQuery({
    queryKey: queryKeys.cloud.stacks,
    queryFn: () => cloudApi.listStacks(),
    enabled: Boolean(cloud && selectedCompanyId),
    staleTime: 30_000,
    retry: false,
  });
  const currentStack = cloudStacksQuery.data?.stacks.find((stack) => stack.isCurrent);
  // Company roles can differ from Cloud roles. Only the current stack's
  // owner/admin may invite, even if another portfolio entry grants ownership.
  const cloudInviteUrl = cloud && !cloudStacksQuery.isError &&
    (currentStack?.role === "owner" || currentStack?.role === "admin")
    ? cloudStackInviteUrl(cloud.cloudBaseUrl, currentStack.stackSlug)
    : null;
  // Invites render as a tab of this page; `company.invites` hides just that
  // tab while `company.members` (the route gate) hides the whole page.
  const { hidden: hiddenSettings } = useHiddenSettings();
  const hideInvitesTab = hidesCompanyPage(hiddenSettings, "company.invites");
  const requestedTab = searchParams.get("tab") === "invites" ? "invites" : "members";
  const activeTab = hideInvitesTab ? "members" : requestedTab;
  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "invites") {
          next.set("tab", "invites");
        } else {
          next.delete("tab");
        }
        return next;
      },
      { replace: true },
    );
  };
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [reassignmentTarget, setReassignmentTarget] = useState<string>("__unassigned");
  const [draftRole, setDraftRole] = useState<CompanyMember["membershipRole"]>(null);
  const [draftStatus, setDraftStatus] = useState<EditableMemberStatus>("active");

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? uiT("ui:messages.m_d764d42592fc9687"), href: "/dashboard" },
      { label: uiT("ui:messages.m_74a883a037bc227f"), href: "/company/settings" },
      { label: uiT("ui:messages.m_1044a4c056d0d685") },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const membersQuery = useQuery({
    queryKey: queryKeys.access.companyMembers(selectedCompanyId ?? ""),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? ""),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const joinRequestsQuery = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId ?? "", "pending_approval"),
    queryFn: () => accessApi.listJoinRequests(selectedCompanyId!, "pending_approval"),
    enabled: !!selectedCompanyId && !!membersQuery.data?.access.canApproveJoinRequests,
  });

  const refreshAccessData = async () => {
    if (!selectedCompanyId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyMembers(selectedCompanyId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId, "pending_approval") });
  };

  const updateMemberMutation = useMutation({
    mutationFn: async (input: { memberId: string; membershipRole: CompanyMember["membershipRole"]; status: EditableMemberStatus }) => {
      return accessApi.updateMember(selectedCompanyId!, input.memberId, {
        membershipRole: input.membershipRole,
        status: input.status,
      });
    },
    onSuccess: async () => {
      setEditingMemberId(null);
      await refreshAccessData();
      pushToast({
        title: uiT("ui:messages.m_06cfa34a2955fbc4"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: uiT("ui:messages.m_b5a62f4d97fd0718"),
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const approveJoinRequestMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.approveJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await refreshAccessData();
      pushToast({
        title: uiT("ui:messages.m_d1a4dcc6d8643181"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: uiT("ui:messages.m_3b65e5b7c998c9dc"),
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const rejectJoinRequestMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.rejectJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await refreshAccessData();
      pushToast({
        title: uiT("ui:messages.m_c8110f2795ab6182"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: uiT("ui:messages.m_4d68f6e11d9ae57f"),
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const editingMember = useMemo(
    () => membersQuery.data?.members.find((member) => member.id === editingMemberId) ?? null,
    [editingMemberId, membersQuery.data?.members],
  );
  const removingMember = useMemo(
    () => membersQuery.data?.members.find((member) => member.id === removingMemberId) ?? null,
    [removingMemberId, membersQuery.data?.members],
  );

  const assignedIssuesQuery = useQuery({
    queryKey: ["access", "member-assigned-issues", selectedCompanyId ?? "", removingMember?.principalId ?? ""],
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        assigneeUserId: removingMember!.principalId,
        status: reassignmentIssueStatuses,
      }),
    enabled: !!selectedCompanyId && !!removingMember,
  });

  const archiveMemberMutation = useMutation({
    mutationFn: async (input: { memberId: string; target: string }) => {
      const reassignment =
        input.target.startsWith("agent:")
          ? { assigneeAgentId: input.target.slice("agent:".length), assigneeUserId: null }
          : input.target.startsWith("user:")
            ? { assigneeAgentId: null, assigneeUserId: input.target.slice("user:".length) }
            : null;
      return accessApi.archiveMember(selectedCompanyId!, input.memberId, { reassignment });
    },
    onSuccess: async (result) => {
      setRemovingMemberId(null);
      setReassignmentTarget("__unassigned");
      await refreshAccessData();
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
      }
      pushToast({
        title: uiT("ui:messages.m_5dcec1a428cd55fc"),
        body:
          result.reassignedIssueCount > 0
            ? `${result.reassignedIssueCount} assigned task${result.reassignedIssueCount === 1 ? "" : "s"} cleaned up.`
            : undefined,
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: uiT("ui:messages.m_1cff79b7eb0ba837"),
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  useEffect(() => {
    if (!editingMember) return;
    setDraftRole(editingMember.membershipRole);
    setDraftStatus(isEditableMemberStatus(editingMember.status) ? editingMember.status : "suspended");
  }, [editingMember]);

  useEffect(() => {
    if (!removingMember) return;
    setReassignmentTarget("__unassigned");
  }, [removingMember]);

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_62d9b06f28003dcb")}</div>;
  }

  if (membersQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_d853e542d81026ae")}</div>;
  }

  if (membersQuery.error) {
    const message =
      membersQuery.error instanceof ApiError && membersQuery.error.status === 403
        ? "You do not have permission to manage organization members."
        : membersQuery.error instanceof Error
          ? membersQuery.error.message
          : "Failed to load organization members.";
    return <div className="text-sm text-destructive">{message}</div>;
  }

  const members = membersQuery.data?.members ?? [];
  const access = membersQuery.data?.access;
  const pendingHumanJoinRequests =
    joinRequestsQuery.data?.filter((request) => request.requestType === "human") ?? [];
  const joinRequestActionPending =
    approveJoinRequestMutation.isPending || rejectJoinRequestMutation.isPending;
  const activeReassignmentUsers = members.filter(
    (member) =>
      member.status === "active" &&
      member.principalType === "user" &&
      member.id !== removingMemberId,
  );
  const activeReassignmentAgents = (agentsQuery.data ?? []).filter(isAssignableAgent);
  const assignedIssues = assignedIssuesQuery.data ?? [];

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_51f5fdb4d6dd879f")}</h1>
        </div>
        {cloudInviteUrl && (
          <Button asChild>
            <a href={cloudInviteUrl}><UserPlus />{uiT("ui:messages.m_27bf0f2d3f3f5490")}</a>
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col gap-4">
        {!hideInvitesTab && (
          <PageTabBar
            items={[
              { value: "members", label: uiT("ui:messages.m_1044a4c056d0d685") },
              { value: "invites", label: uiT("ui:messages.m_f212a985ab1612db") },
            ]}
            align="start"
            value={activeTab}
            onValueChange={handleTabChange}
          />
        )}
        <TabsContent value="members" className="space-y-8">

      {access && !access.currentUserRole && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">{uiT("ui:messages.m_2a78a6a4a427ccb7")}</div>
      )}

      <section className="space-y-4">
        {access?.canApproveJoinRequests && pendingHumanJoinRequests.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{uiT("ui:messages.m_0229ff9dbaf34d31")}</h3>
                <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_882e00befaa2e539")}</p>
              </div>
              <Badge variant="outline">{pendingHumanJoinRequests.length}{uiT("ui:messages.m_f9ad5e1de7d0af51")}</Badge>
            </div>
            <div className="space-y-3">
              {pendingHumanJoinRequests.map((request) => (
                <PendingJoinRequestCard
                  key={request.id}
                  title={
                    request.requesterUser?.name ||
                    request.requestEmailSnapshot ||
                    request.requestingUserId ||
                    uiT("ui:messages.m_08c8b631ee643cc5")
                  }
                  subtitle={
                    request.requesterUser?.email ||
                    request.requestEmailSnapshot ||
                    request.requestingUserId ||
                    uiT("ui:messages.m_5b623554d3deff32")
                  }
                  context={
                    request.invite
                      ? `${request.invite.allowedJoinTypes} join invite${request.invite.humanRole ? ` • default role ${request.invite.humanRole}` : ""}`
                      : "Invite metadata unavailable"
                  }
                  detail={`Submitted ${new Date(request.createdAt).toLocaleString()}`}
                  approveLabel="Approve human"
                  rejectLabel="Reject human"
                  disabled={joinRequestActionPending}
                  onApprove={() => approveJoinRequestMutation.mutate(request.id)}
                  onReject={() => rejectJoinRequestMutation.mutate(request.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-(--sz-44rem) text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2 font-medium">{uiT("ui:messages.m_dcd1d5223f73b3a9")}</th>
                <th className="px-3 py-2 font-medium">{uiT("ui:messages.m_969ccbd3cf6300ec")}</th>
                <th className="px-3 py-2 font-medium">{uiT("ui:messages.m_14736a2eb9f4159f")}</th>
                <th className="px-3 py-2 font-medium">{uiT("ui:messages.m_920e413c7d411b61")}</th>
                <th className="px-3 py-2 text-right font-medium">{uiT("ui:messages.m_64cff1319d2fd2cb")}</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-muted-foreground">{uiT("ui:messages.m_1a5d8214d85704d8")}</td>
                </tr>
              ) : members.map((member) => {
                const removalReason = member.removal?.reason ?? null;
                const canArchive = member.removal?.canArchive ?? true;
                const displayName = memberDisplayName(member);
                return (
                  <tr key={member.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar size="sm">
                          {member.user?.image ? <AvatarImage src={member.user.image} alt={displayName} /> : null}
                          <AvatarFallback>{memberInitials(member)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium">{displayName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {member.user?.email || member.principalId}
                    </td>
                    <td className="px-3 py-3">
                      {member.membershipRole
                        ? HUMAN_COMPANY_MEMBERSHIP_ROLE_LABELS[member.membershipRole]
                        : uiT("ui:messages.m_8d2dd4e8c7caa1ac")}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={member.status === "active" ? "secondary" : member.status === "suspended" ? "destructive" : "outline"}>
                        {member.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingMemberId(member.id)}>{uiT("ui:messages.m_464c4ffd019e1e96")}</Button>
                        <span
                          className="inline-flex"
                          title={!canArchive ? removalReason ?? undefined : undefined}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRemovingMemberId(member.id)}
                            disabled={!canArchive}
                            title={!canArchive ? removalReason ?? undefined : undefined}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />{uiT("ui:messages.m_c3812fc4acb861d5")}</Button>
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMemberId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{uiT("ui:messages.m_a07deaf5beb8e62b")}</DialogTitle>
            <DialogDescription>{uiT("ui:messages.m_7f15b2e1ba26fe51")}{editingMember?.user?.name || editingMember?.user?.email || editingMember?.principalId}.
            </DialogDescription>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">{uiT("ui:messages.m_a90b2f79c4eb5976")}</span>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                    value={draftRole ?? ""}
                    onChange={(event) =>
                      setDraftRole((event.target.value || null) as CompanyMember["membershipRole"])
                    }
                  >
                    <option value="">{uiT("ui:messages.m_8d2dd4e8c7caa1ac")}</option>
                    {Object.entries(HUMAN_COMPANY_MEMBERSHIP_ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">{uiT("ui:messages.m_33ea27405702c925")}</span>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                    value={draftStatus}
                    onChange={(event) =>
                      setDraftStatus(event.target.value as EditableMemberStatus)
                    }
                  >
                    <option value="active">{uiT("ui:messages.m_92340695899bd2d8")}</option>
                    <option value="pending">{uiT("ui:messages.m_331551b0de4157c9")}</option>
                    <option value="suspended">{uiT("ui:messages.m_e392a3891c070abe")}</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMemberId(null)}>{uiT("ui:messages.m_19766ed6ccb2f4a3")}</Button>
            <Button
              onClick={() => {
                if (!editingMember) return;
                updateMemberMutation.mutate({
                  memberId: editingMember.id,
                  membershipRole: draftRole,
                  status: draftStatus,
                });
              }}
              disabled={updateMemberMutation.isPending}
            >
              {updateMemberMutation.isPending ? uiT("ui:messages.m_23e39291d6135814") : uiT("ui:messages.m_7a89d25405f83e6a")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removingMember} onOpenChange={(open) => !open && setRemovingMemberId(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{uiT("ui:messages.m_9438e0ba8e6374b3")}</DialogTitle>
            <DialogDescription>{uiT("ui:messages.m_603be23fb06ab3e6")}{memberDisplayName(removingMember)}{uiT("ui:messages.m_af0a57ed9f1deee0")}</DialogDescription>
          </DialogHeader>
          {removingMember && (
            <div className="space-y-5">
              <div className="rounded-lg border border-border px-3 py-3">
                <div className="text-sm font-medium">{memberDisplayName(removingMember)}</div>
                <div className="text-sm text-muted-foreground">{removingMember.user?.email || removingMember.principalId}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {assignedIssuesQuery.isLoading
                    ? uiT("ui:messages.m_12ce7101dd969fc1")
                    : uiT("ui:messages.m_9864fb9833c3fbac", { v0: (assignedIssues.length), v1: (assignedIssues.length === 1 ? "" : uiT("ui:messages.m_043a718774c572bd")) })}
                </div>
              </div>

              {assignedIssues.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">{uiT("ui:messages.m_d7a62538ee99e6ac")}</div>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={reassignmentTarget}
                    onChange={(event) => setReassignmentTarget(event.target.value)}
                  >
                    <option value="__unassigned">{uiT("ui:messages.m_d15439ac5e9c2389")}</option>
                    {activeReassignmentUsers.length > 0 ? (
                      <optgroup label={uiT("ui:messages.m_b370fddfc712a78b")}>
                        {activeReassignmentUsers.map((member) => (
                          <option key={member.id} value={`user:${member.principalId}`}>
                            {memberDisplayName(member)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {activeReassignmentAgents.length > 0 ? (
                      <optgroup label={uiT("ui:messages.m_279b44d2ab4b40c0")}>
                        {activeReassignmentAgents.map((agent) => (
                          <option key={agent.id} value={`agent:${agent.id}`}>
                            {agent.name} ({agent.role})
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <div className="max-h-36 overflow-auto rounded-lg border border-border">
                    {assignedIssues.slice(0, 6).map((issue) => (
                      <div key={issue.id} className="border-b border-border px-3 py-2 text-sm last:border-b-0">
                        <div className="font-medium">{issue.identifier ?? issue.id.slice(0, 8)}</div>
                        <div className="truncate text-muted-foreground">{issue.title}</div>
                      </div>
                    ))}
                    {assignedIssues.length > 6 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {assignedIssues.length - 6}{uiT("ui:messages.m_eb24d84375b07d2b")}{assignedIssues.length - 6 === 1 ? "" : uiT("ui:messages.m_043a718774c572bd")}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingMemberId(null)}>{uiT("ui:messages.m_19766ed6ccb2f4a3")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!removingMember) return;
                archiveMemberMutation.mutate({
                  memberId: removingMember.id,
                  target: reassignmentTarget,
                });
              }}
              disabled={archiveMemberMutation.isPending || assignedIssuesQuery.isLoading}
            >
              {archiveMemberMutation.isPending ? uiT("ui:messages.m_60d18e42fd5a5b25") : uiT("ui:messages.m_9438e0ba8e6374b3")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
        {!hideInvitesTab && (
          <TabsContent value="invites">
            <InvitesSection />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export function CompanyAccessLegacyRoute() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { slots, isLoading, errorMessage } = usePluginSlots({
    slotTypes: ["companySettingsPage"],
    companyId: selectedCompanyId,
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: uiT("ui:messages.m_74a883a037bc227f"), href: "/company/settings" },
      { label: uiT("ui:messages.m_ec5ba0abb717da87") },
    ]);
  }, [setBreadcrumbs]);

  const permissionsSlot = slots.find((slot) => slot.routePath === "permissions");
  if (permissionsSlot) {
    return <Navigate to="/company/settings/permissions" replace />;
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_901c8b8af28ad042")}</div>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_638876bfcb131482")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_a27c92d594591158")}</p>
      </div>

      <div className="space-y-4 rounded-xl border border-border px-5 py-5">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{uiT("ui:messages.m_fc13de47ac828589")}</h2>
          <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_6608485028b6538d")}</p>
          {errorMessage ? (
            <p className="text-sm text-destructive">{uiT("ui:messages.m_f929ee2ea5139cf6")}{errorMessage}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/company/settings/members">{uiT("ui:messages.m_44784b824de50e34")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/company/settings/members?tab=invites">{uiT("ui:messages.m_fcb62d82c0917780")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function memberDisplayName(member: CompanyMember | null) {
  if (!member) return "this member";
  return member.user?.name?.trim() || member.user?.email || member.principalId;
}

function memberInitials(member: CompanyMember) {
  const value = memberDisplayName(member).trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return value.slice(0, 2).toUpperCase();
}

function isAssignableAgent(agent: Agent) {
  return agent.status !== "terminated" && agent.status !== "pending_approval";
}

function isEditableMemberStatus(status: CompanyMember["status"]): status is EditableMemberStatus {
  return status === "pending" || status === "active" || status === "suspended";
}

function PendingJoinRequestCard({
  title,
  subtitle,
  context,
  detail,
  detailSecondary,
  approveLabel,
  rejectLabel,
  disabled,
  onApprove,
  onReject,
}: {
  title: string;
  subtitle: string;
  context: string;
  detail: string;
  detailSecondary?: string;
  approveLabel: string;
  rejectLabel: string;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div>
            <div className="font-medium">{title}</div>
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          </div>
          <div className="text-sm text-muted-foreground">{context}</div>
          <div className="text-sm text-muted-foreground">{detail}</div>
          {detailSecondary ? <div className="text-sm text-muted-foreground">{detailSecondary}</div> : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onReject} disabled={disabled}>
            {rejectLabel}
          </Button>
          <Button type="button" onClick={onApprove} disabled={disabled}>
            {approveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

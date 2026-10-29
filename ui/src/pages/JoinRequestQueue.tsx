import { t as uiT } from "@/i18n";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus2 } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

export function JoinRequestQueue() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending_approval" | "approved" | "rejected">("pending_approval");
  const [requestType, setRequestType] = useState<"all" | "human" | "agent">("all");

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? uiT("ui:messages.m_d764d42592fc9687"), href: "/dashboard" },
      { label: "Inbox", href: "/inbox" },
      { label: uiT("ui:messages.m_26fe033758d63747") },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const requestsQuery = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId ?? "", `${status}:${requestType}`),
    queryFn: () =>
      accessApi.listJoinRequests(
        selectedCompanyId!,
        status,
        requestType === "all" ? undefined : requestType,
      ),
    enabled: !!selectedCompanyId,
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.approveJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!, `${status}:${requestType}`) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyMembers(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!) });
      pushToast({ title: uiT("ui:messages.m_d1a4dcc6d8643181"), tone: "success" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.rejectJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!, `${status}:${requestType}`) });
      pushToast({ title: uiT("ui:messages.m_c8110f2795ab6182"), tone: "success" });
    },
  });

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_2317c6a6bf957d19")}</div>;
  }

  if (requestsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_6aaf5068256131bb")}</div>;
  }

  if (requestsQuery.error) {
    const message =
      requestsQuery.error instanceof ApiError && requestsQuery.error.status === 403
        ? "You do not have permission to review join requests for this organization."
        : requestsQuery.error instanceof Error
          ? requestsQuery.error.message
          : "Failed to load join requests.";
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_a51c104b51cc3123")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Review human and agent join requests outside the mixed inbox feed. This queue uses the same approval mutations as the inline inbox cards.
        </p>
      </div>

      <Card className="flex-row flex-wrap gap-3 p-4">
        <label className="space-y-2 text-sm">
          <span className="font-medium">{uiT("ui:messages.m_920e413c7d411b61")}</span>
          <select
            className="rounded-md border border-border bg-background px-3 py-2"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "pending_approval" | "approved" | "rejected")
            }
          >
            <option value="pending_approval">{uiT("ui:messages.m_bb33a7f41817b38d")}</option>
            <option value="approved">{uiT("ui:messages.m_87b42e40c2a290e0")}</option>
            <option value="rejected">{uiT("ui:messages.m_aea4a04a80426ed8")}</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">{uiT("ui:messages.m_6db8df2da928ebd3")}</span>
          <select
            className="rounded-md border border-border bg-background px-3 py-2"
            value={requestType}
            onChange={(event) =>
              setRequestType(event.target.value as "all" | "human" | "agent")
            }
          >
            <option value="all">{uiT("ui:messages.m_a52ace420f2175d0")}</option>
            <option value="human">{uiT("ui:messages.m_9ffa865f2bc6e850")}</option>
            <option value="agent">{uiT("ui:messages.m_11b39c93777e8f1f")}</option>
          </select>
        </label>
      </Card>

      <div className="space-y-4">
        {(requestsQuery.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">{uiT("ui:messages.m_bf9e13fbd9e55b1e")}</div>
        ) : (
          requestsQuery.data!.map((request) => (
            <Card key={request.id} className="block p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={request.status === "pending_approval" ? "secondary" : request.status === "approved" ? "outline" : "destructive"}>
                      {request.status.replace("_", " ")}
                    </Badge>
                    <Badge variant="outline">{request.requestType}</Badge>
                    {request.adapterType ? <Badge variant="outline">{request.adapterType}</Badge> : null}
                  </div>
                  <div>
                    <div className="text-base font-medium">
                      {request.requestType === "human"
                        ? request.requesterUser?.name || request.requestEmailSnapshot || request.requestingUserId || uiT("ui:messages.m_08c8b631ee643cc5")
                        : request.agentName || uiT("ui:messages.m_ef1e967cb399e455")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {request.requestType === "human"
                        ? request.requesterUser?.email || request.requestEmailSnapshot || request.requestingUserId
                        : request.capabilities || request.requestIp}
                    </div>
                  </div>
                </div>

                {request.status === "pending_approval" ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => rejectMutation.mutate(request.id)}
                      disabled={rejectMutation.isPending}
                    >{uiT("ui:messages.m_ab604a360777735f")}</Button>
                    <Button
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending}
                    >{uiT("ui:messages.m_6007acbe30b2cd98")}</Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium uppercase tracking-wide">{uiT("ui:messages.m_b13541ba608ff338")}</div>
                  <div className="mt-2">
                    {request.invite
                      ? uiT("ui:messages.m_08f022e5acf228e1", { v0: (request.invite.allowedJoinTypes), v1: (request.invite.humanRole ? uiT("ui:messages.m_86b63efdc83a6bd1", { v0: (request.invite.humanRole) }) : "") })
                      : uiT("ui:messages.m_1ba4d74c6db5a3c4")}
                  </div>
                  {request.invite?.inviteMessage ? (
                    <div className="mt-2 text-foreground">{request.invite.inviteMessage}</div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium uppercase tracking-wide">{uiT("ui:messages.m_b6e3369e005b7240")}</div>
                  <div className="mt-2">{uiT("ui:messages.m_f0833d2813771590")}{new Date(request.createdAt).toLocaleString()}</div>
                  <div>{uiT("ui:messages.m_6b4f32b9476438a2")}{request.requestIp}</div>
                  {request.requestType === "agent" && request.capabilities ? <div>{request.capabilities}</div> : null}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

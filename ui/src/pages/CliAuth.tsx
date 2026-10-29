import { t as uiT } from "@/i18n";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { accessApi } from "../api/access";
import { ApiError } from "../api/client";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";

function cliAuthRetryDelay(error: unknown): number {
  const body = error instanceof ApiError && error.body && typeof error.body === "object"
    ? error.body as { details?: unknown } : null;
  const details = body?.details && typeof body.details === "object"
    ? body.details as { retryAfterSeconds?: unknown } : null;
  const milliseconds = typeof details?.retryAfterSeconds === "number" ? details.retryAfterSeconds * 1000 : Number.NaN;
  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.max(1000, milliseconds) : 60_000;
}

function isCliAuthRateLimit(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429;
}

export function CliAuthPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const challengeId = (params.id ?? "").trim();
  const token = (searchParams.get("token") ?? "").trim();
  const currentPath = useMemo(
    () => `/cli-auth/${encodeURIComponent(challengeId)}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
    [challengeId, token],
  );

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const challengeQueryKey = useMemo(() => ["cli-auth-challenge", challengeId, token] as const, [challengeId, token]);
  const retryWindowEndsAt = useMemo(() => Date.now() + 10 * 60_000, [challengeId, token]);
  const challengeQuery = useQuery({
    queryKey: challengeQueryKey,
    queryFn: () => accessApi.getCliAuthChallenge(challengeId, token),
    enabled: challengeId.length > 0 && token.length > 0,
    retry: (failureCount, error) => {
      if (!isCliAuthRateLimit(error) || failureCount >= 3) return false;
      const knownChallenge = queryClient.getQueryData<{ expiresAt: string }>(challengeQueryKey);
      const knownExpiry = Date.parse(knownChallenge?.expiresAt ?? "");
      const deadline = Number.isFinite(knownExpiry) ? Math.min(knownExpiry, retryWindowEndsAt) : retryWindowEndsAt;
      return Date.now() + cliAuthRetryDelay(error) < deadline;
    },
    retryDelay: (_failureCount, error) => cliAuthRetryDelay(error),
  });

  const approveMutation = useMutation({
    mutationFn: () => accessApi.approveCliAuthChallenge(challengeId, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await challengeQuery.refetch();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => accessApi.cancelCliAuthChallenge(challengeId, token),
    onSuccess: async () => {
      await challengeQuery.refetch();
    },
  });

  if (!challengeId || !token) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{uiT("ui:messages.m_528646e315519886")}</div>;
  }

  const waitingForRateLimit = isCliAuthRateLimit(challengeQuery.failureReason) && challengeQuery.isFetching;
  if (sessionQuery.isLoading || challengeQuery.isLoading || waitingForRateLimit) {
    return <div role="status" className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">
      {waitingForRateLimit ? "Too many CLI approval requests. Retrying shortly..." : uiT("ui:messages.m_c2b409b8fd4afdce")}
    </div>;
  }

  if (challengeQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_0c42ba6c8d9839ff")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {challengeQuery.error instanceof Error ? challengeQuery.error.message : uiT("ui:messages.m_ef7f2fbfba3af9a4")}
          </p>
        </Card>
      </div>
    );
  }

  const challenge = challengeQuery.data;
  if (!challenge) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{uiT("ui:messages.m_14e6eaba3bf496c2")}</div>;
  }

  if (challenge.status === "approved") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-xl font-semibold">{uiT("ui:messages.m_e272a242b66810aa")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{uiT("ui:messages.m_c62ea5b24db4f657")}</p>
          <p className="mt-4 text-sm text-muted-foreground">{uiT("ui:messages.m_d8c56c2a6a805250")}<span className="font-mono text-foreground">{challenge.command}</span>
          </p>
        </Card>
      </div>
    );
  }

  if (challenge.status === "cancelled" || challenge.status === "expired") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-xl font-semibold">
            {challenge.status === "expired" ? uiT("ui:messages.m_73f61eb5567252d9") : uiT("ui:messages.m_a2f522c6dd8731b4")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{uiT("ui:messages.m_c79509c42d65a402")}</p>
        </Card>
      </div>
    );
  }

  if (challenge.requiresSignIn || !sessionQuery.data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-xl font-semibold">{uiT("ui:messages.m_255346f25669fce1")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{uiT("ui:messages.m_da2e72ba2d43d92b")}</p>
          <Button asChild className="mt-4">
            <Link to={`/auth?next=${encodeURIComponent(currentPath)}`}>{uiT("ui:messages.m_5d4f5eb117173ca0")}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="block p-6">
        <h1 className="text-xl font-semibold">{uiT("ui:messages.m_4b83de726cedf85d")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A CLI client is requesting full board access to the organizations you can access on this instance. Approve only if you started this request in your own terminal.
        </p>

        <div className="mt-5 space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">{uiT("ui:messages.m_713166971d730f81")}</div>
            <div className="font-mono text-foreground">{challenge.command}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{uiT("ui:messages.m_0c77fe09ab336a3e")}</div>
            <div className="text-foreground">{challenge.clientName ?? "paperclipai cli"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{uiT("ui:messages.m_823034752058e97b")}</div>
            <div className="text-foreground">
              {challenge.requestedAccess === "instance_admin_required" ? uiT("ui:messages.m_03507f86120fc6e4") : uiT("ui:messages.m_4816cbfd74aa8297")}
            </div>
          </div>
          {challenge.requestedCompanyName && (
            <div>
              <div className="text-muted-foreground">Organization for audit context</div>
              <div className="text-foreground">{challenge.requestedCompanyName}</div>
            </div>
          )}
        </div>

        {(approveMutation.error || cancelMutation.error) && (
          <p className="mt-4 text-sm text-destructive">
            {(approveMutation.error ?? cancelMutation.error) instanceof Error
              ? ((approveMutation.error ?? cancelMutation.error) as Error).message
              : uiT("ui:messages.m_77e4aece0005efc4")}
          </p>
        )}

        {!challenge.canApprove && (
          <p className="mt-4 text-sm text-destructive">
            {challenge.requestedAccess === "instance_admin_required"
              ? uiT("ui:messages.m_c18f2ad88f41bfe6")
              : "You do not have access to the requested organization."}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={!challenge.canApprove || approveMutation.isPending || cancelMutation.isPending}
          >
            {approveMutation.isPending ? uiT("ui:messages.m_cee0e61bdf8c8bda") : uiT("ui:messages.m_e4749018a2f970fd")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => cancelMutation.mutate()}
            disabled={approveMutation.isPending || cancelMutation.isPending}
          >
            {cancelMutation.isPending ? uiT("ui:messages.m_7b26131098bb18b2") : uiT("ui:messages.m_19766ed6ccb2f4a3")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

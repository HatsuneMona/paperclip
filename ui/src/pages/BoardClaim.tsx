import { t as uiT } from "@/i18n";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BoardClaimPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const token = (params.token ?? "").trim();
  const code = (searchParams.get("code") ?? "").trim();
  const currentPath = useMemo(
    () => `/board-claim/${encodeURIComponent(token)}${code ? `?code=${encodeURIComponent(code)}` : ""}`,
    [token, code],
  );

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const statusQuery = useQuery({
    queryKey: ["board-claim", token, code],
    queryFn: () => accessApi.getBoardClaimStatus(token, code),
    enabled: token.length > 0 && code.length > 0,
    retry: false,
  });

  const claimMutation = useMutation({
    mutationFn: () => accessApi.claimBoard(token, code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await statusQuery.refetch();
    },
  });

  if (!token || !code) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{uiT("ui:messages.m_1dec9c583064f072")}</div>;
  }

  if (statusQuery.isLoading || sessionQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{uiT("ui:messages.m_ec52a8fe1f7b8805")}</div>;
  }

  if (statusQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_8e6d8ef564937430")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {statusQuery.error instanceof Error ? statusQuery.error.message : uiT("ui:messages.m_ef7f2fbfba3af9a4")}
          </p>
        </Card>
      </div>
    );
  }

  const status = statusQuery.data;
  if (!status) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{uiT("ui:messages.m_7d34a321f9bf87df")}</div>;
  }

  if (status.status === "claimed") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_d2127feb776aea44")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{uiT("ui:messages.m_a5661a2901ea7f15")}</p>
          <Button asChild className="mt-4">
            <Link to="/">{uiT("ui:messages.m_673ae8242de169d3")}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!sessionQuery.data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{uiT("ui:messages.m_255346f25669fce1")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{uiT("ui:messages.m_56ba53d4363b7fdf")}</p>
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
        <h1 className="text-xl font-semibold">{uiT("ui:messages.m_fb94488405b21f95")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{uiT("ui:messages.m_02627d6d19525f14")}</p>

        {claimMutation.error && (
          <p className="mt-3 text-sm text-destructive">
            {claimMutation.error instanceof Error ? claimMutation.error.message : uiT("ui:messages.m_a598c43178a63e89")}
          </p>
        )}

        <Button
          className="mt-5"
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
        >
          {claimMutation.isPending ? uiT("ui:messages.m_702f4ab2f2deb555") : uiT("ui:messages.m_7f2ebb1c5b00fca9")}
        </Button>
      </Card>
    </div>
  );
}

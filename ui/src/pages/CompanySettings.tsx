import { t as uiT } from "@/i18n";
import { ChangeEvent, useEffect, useState } from "react";
import { AgentObservabilitySettingsSection } from "../components/observability/AgentObservabilitySettings";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type InteractionResolverGovernance,
  type IssueThreadInteractionKind,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useOptionalToastActions } from "../context/ToastContext";
import { useCloudInstance } from "../hooks/useCloudInstance";
import { resolveCompanyArchiveDeparture } from "../lib/company-selection";
import { cloudPortfolioManageUrl } from "../lib/cloudLinks";
import { navigateTopLevel } from "@/lib/browserNavigation";
import { companiesApi } from "../api/companies";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import {
  InteractionGovernancePanel,
  applyGovernanceChange,
  type GovernanceField,
  type GovernanceSelectValue,
} from "../components/InteractionGovernancePanel";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";
import { InstanceGeneralSettings } from "./InstanceGeneralSettings";

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toastActions = useOptionalToastActions();
  const cloud = useCloudInstance();
  // Managed instances derive the task ID prefix from the company name, so a
  // rename here also renumbers the existing task IDs.
  const isCloudManaged = Boolean(cloud);
  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [governance, setGovernance] = useState<InteractionResolverGovernance>({});

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setLogoUrl(selectedCompany.logoUrl ?? "");
    setGovernance(selectedCompany.interactionResolverGovernance ?? {});
  }, [selectedCompany]);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const governanceMutation = useMutation({
    mutationFn: (next: InteractionResolverGovernance) =>
      companiesApi.update(selectedCompanyId!, { interactionResolverGovernance: next }),
    onSuccess: (company) => {
      setGovernance(company.interactionResolverGovernance ?? {});
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  function handleGovernanceChange(
    kind: IssueThreadInteractionKind,
    field: GovernanceField,
    value: GovernanceSelectValue,
  ) {
    const next = applyGovernanceChange(governance, kind, field, value);
    setGovernance(next);
    governanceMutation.mutate(next);
  }

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  const archiveMutation = useMutation({
    mutationFn: ({ companyId }: { companyId: string }) =>
      companiesApi.archive(companyId),
    onSuccess: async (_result, { companyId }) => {
      // Never stay on the archived company's settings: the only visible
      // change would be the archive button going inert. Leave for wherever
      // still makes sense (another active company, the Cloud portfolio, or
      // the companies list), with a toast naming what happened.
      const archived = companies.find((company) => company.id === companyId);
      const archivedName = archived?.name ?? "Organization";
      const departure = resolveCompanyArchiveDeparture({
        archivedCompanyId: companyId,
        companies,
        cloudPortfolioUrl: cloudPortfolioManageUrl(cloud?.cloudBaseUrl),
      });
      if (departure.kind === "cloud_portfolio") {
        // The whole organization is on its way to being archived by the
        // control plane; a full navigation to the Cloud portfolio replaces
        // this document, so cache invalidation below would never run.
        navigateTopLevel(departure.url);
        return;
      }
      if (departure.kind === "company") {
        toastActions?.pushToast({
          title: uiT("ui:messages.m_7fed88830a66d575", { v0: (archivedName) }),
          body: `Switched to ${departure.company.name}.`,
          tone: "info",
          dedupeKey: `company-archive-departure:${companyId}`,
        });
        setSelectedCompanyId(departure.company.id);
        navigate(`/${departure.company.issuePrefix}/dashboard`, { replace: true });
      } else {
        toastActions?.pushToast({
          title: uiT("ui:messages.m_7fed88830a66d575", { v0: (archivedName) }),
          body: "You can unarchive it from this list.",
          tone: "info",
          dedupeKey: `company-archive-departure:${companyId}`,
        });
        navigate(`/${archived?.issuePrefix ?? ""}/companies`, { replace: true });
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? uiT("ui:messages.m_de4743c879734dc3"), href: "/dashboard" },
      { label: uiT("ui:messages.m_74a883a037bc227f") }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">{uiT("ui:messages.m_9133af154f20a9d0")}</div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null
    });
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{uiT("ui:messages.m_c910d474dcd724bf")}</h1>
      </div>

      {/* General */}
      <div className="max-w-2xl space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{uiT("ui:messages.m_c910d474dcd724bf")}</div>
        <div className="space-y-3">
          <Field label={uiT("ui:messages.m_9a807d52ba21603e")} hint={uiT("ui:messages.m_51280e67f5c36c51")}>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            {isCloudManaged && (
              <p className="mt-1 text-xs text-muted-foreground">{uiT("ui:messages.m_2766ca5b87767cb4")}</p>
            )}
          </Field>
          <Field
            label={uiT("ui:messages.m_526e0087cc3f254d")}
            hint={uiT("ui:messages.m_1053d046fa506843")}
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder={uiT("ui:messages.m_4322c2356e421094")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="max-w-2xl space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{uiT("ui:messages.m_3907fa7f80722a6f")}</div>
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                className="rounded-(--rad-14)"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label={uiT("ui:messages.m_d707dc2f1936efd8")}
                hint={uiT("ui:messages.m_fd8a49c56c55e970")}
              >
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? uiT("ui:messages.m_60d18e42fd5a5b25") : uiT("ui:messages.m_f1c1afa450870ba9")}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : uiT("ui:messages.m_9faf7b9427524425"))}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">{uiT("ui:messages.m_def73c874daa508e")}</span>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
          >
            {generalMutation.isPending ? uiT("ui:messages.m_dc85af8f2b1d0d67") : uiT("ui:messages.m_dd0ae7a5cbcf2339")}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">{uiT("ui:messages.m_b5c120b316c237a0")}</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : uiT("ui:messages.m_2c07997249abaa76")}
            </span>
          )}
        </div>
      )}

      {/* Hiring */}
      <div className="max-w-2xl space-y-4" data-testid="company-settings-team-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{uiT("ui:messages.m_4e414af41b7d4876")}</div>
        <div>
          <ToggleField
            label={uiT("ui:messages.m_411a6ac4e074946c")}
            hint={uiT("ui:messages.m_67728aa69055ee83")}
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
            toggleTestId="company-settings-team-approval-toggle"
          />
        </div>
      </div>

      {/* Interaction governance */}
      <InteractionGovernancePanel
        governance={governance}
        onChange={handleGovernanceChange}
        isPending={governanceMutation.isPending}
        errorMessage={
          governanceMutation.isError
            ? governanceMutation.error instanceof Error
              ? governanceMutation.error.message
              : uiT("ui:messages.m_d33b037f371764a0")
            : null
        }
      />

      <AgentObservabilitySettingsSection companyId={selectedCompanyId!} />

      <InstanceGeneralSettings embedded />

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">{uiT("ui:messages.m_3c1c01b405853556")}</div>
        <div className="space-y-3 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">{uiT("ui:messages.m_490473488c7a476a")}</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  uiT("ui:messages.m_fabbdab1d4d30d2b", { v0: (selectedCompany.name) })
                );
                if (!confirmed) return;
                archiveMutation.mutate({ companyId: selectedCompanyId });
              }}
            >
              {archiveMutation.isPending
                ? uiT("ui:messages.m_6f3407113f077430")
                : selectedCompany.status === "archived"
                ? uiT("ui:messages.m_ca88c0193c1079de")
                : uiT("ui:messages.m_00e7fa80dc2b6303")}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : uiT("ui:messages.m_45dfcd8f4d71ad0c")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

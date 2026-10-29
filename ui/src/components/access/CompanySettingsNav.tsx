import { t as uiT } from "@/i18n";
import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useCloudInstance } from "@/hooks/useCloudInstance";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { INSTANCE_SETTINGS_PATH_PREFIX } from "@/lib/instance-settings";
import { useLocation, useNavigate } from "@/lib/router";

const items = [
  { value: "general", label: uiT("ui:messages.m_c910d474dcd724bf"), href: "/company/settings" },
  { value: "export", label: uiT("ui:messages.m_3664895579f0a7e6"), href: "/company/export" },
  { value: "import", label: uiT("ui:messages.m_2cff9baabf56ca00"), href: "/company/import" },
  { value: "members", label: uiT("ui:messages.m_1044a4c056d0d685"), href: "/company/settings/members" },
  { value: "secrets", label: uiT("ui:messages.m_d8707d411d997657"), href: "/company/settings/secrets" },
  { value: "instance-profile", label: uiT("ui:messages.m_d696a35bdd1883da"), href: `${INSTANCE_SETTINGS_PATH_PREFIX}/profile` },
  { value: "instance-environments", label: uiT("ui:messages.m_07437cd651bed86e"), href: `${INSTANCE_SETTINGS_PATH_PREFIX}/environments` },
  { value: "connections", label: uiT("ui:messages.m_dc273117482b4429"), href: "/company/settings/connections" },
  { value: "instance-access", label: uiT("ui:messages.m_ec5ba0abb717da87"), href: `${INSTANCE_SETTINGS_PATH_PREFIX}/access` },
  { value: "instance-experimental", label: uiT("ui:messages.m_3dc9f569422dcfda"), href: `${INSTANCE_SETTINGS_PATH_PREFIX}/experimental` },
  { value: "instance-plugins", label: uiT("ui:messages.m_9514b7ff4860ead7"), href: `${INSTANCE_SETTINGS_PATH_PREFIX}/plugins` },
  { value: "instance-adapters", label: uiT("ui:messages.m_d20547a8145f719f"), href: `${INSTANCE_SETTINGS_PATH_PREFIX}/adapters` },
] as const;

type CompanySettingsTab = (typeof items)[number]["value"];

/** Tab values suppressed when their page is operator-hidden. */
const hiddenSettingKeyByTab: Partial<Record<CompanySettingsTab, string>> = {
  export: "company.export",
  import: "company.import",
  members: "company.members",
  secrets: "company.secrets",
  "instance-profile": "instance.profile",
  "instance-environments": "instance.environments",
  "instance-access": "instance.access",
  "instance-experimental": "instance.experimental",
  "instance-plugins": "instance.plugins",
  "instance-adapters": "instance.adapters",
};

export function getCompanySettingsTab(pathname: string): CompanySettingsTab {
  if (pathname.includes("/company/settings/connections")) {
    return "connections";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/profile`)) {
    return "instance-profile";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/environments`)) {
    return "instance-environments";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/access`)) {
    return "instance-access";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/experimental`)) {
    return "instance-experimental";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/plugins`)) {
    return "instance-plugins";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/adapters`)) {
    return "instance-adapters";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/general`)) {
    return "general";
  }

  if (pathname.includes("/company/settings/environments")) {
    return "instance-environments";
  }

  if (pathname.includes("/company/export")) {
    return "export";
  }

  if (pathname.includes("/company/import")) {
    return "import";
  }

  if (pathname.includes("/company/settings/members") || pathname.includes("/company/settings/access")) {
    return "members";
  }

  if (pathname.includes("/company/settings/invites")) {
    // Invites live on the Members page now; the old URL redirects there.
    return "members";
  }

  if (pathname.includes("/company/settings/secrets")) {
    return "secrets";
  }

  return "general";
}

export function CompanySettingsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hidden: hiddenSettings } = useHiddenSettings();
  // Import is floored server-side on cloud-managed instances (403 cloud_managed), so the
  // tab is suppressed there rather than dead-ending.
  const isCloud = Boolean(useCloudInstance());
  const activeTab = getCompanySettingsTab(location.pathname);
  const visibleItems = items.filter((item) => {
    if (item.value === "import" && isCloud) return false;
    const hiddenKey = hiddenSettingKeyByTab[item.value];
    return !hiddenKey || !hiddenSettings.has(hiddenKey);
  });

  function handleTabChange(value: string) {
    const nextTab = visibleItems.find((item) => item.value === value);
    if (!nextTab || nextTab.value === activeTab) return;
    navigate(nextTab.href);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageTabBar
        items={visibleItems.map(({ value, label }) => ({ value, label }))}
        value={activeTab}
        onValueChange={handleTabChange}
        align="start"
      />
    </Tabs>
  );
}

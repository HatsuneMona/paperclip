import { t as uiT } from "@/i18n";
import { Activity, LayoutGrid, KeyRound, Wrench, Boxes } from "lucide-react";

/**
 * Gateway detail tabs (PAP-11200). Terminology is locked by the approved
 * PAP-11178 design of record: Overview · Apps & tools · Tokens · Activity ·
 * Advanced. Raw protocol / JSON / transport details live under Advanced.
 */
export const GATEWAY_TABS = [
  { key: "overview", label: uiT("ui:messages.m_d4b1ea5708dd5329"), icon: LayoutGrid },
  { key: "apps", label: "Apps & tools", icon: Boxes },
  { key: "tokens", label: uiT("ui:messages.m_a039dfb9628b53dd"), icon: KeyRound },
  { key: "activity", label: uiT("ui:messages.m_38da1505ca837328"), icon: Activity },
  { key: "advanced", label: uiT("ui:messages.m_9f088dbebd6c3c70"), icon: Wrench },
] as const;

export type GatewayTabKey = (typeof GATEWAY_TABS)[number]["key"];

export function gatewayTabHref(gatewayId: string, tab: GatewayTabKey): string {
  return `/apps/gateways/${gatewayId}/${tab}`;
}

export function isGatewayTabKey(value: string | undefined): value is GatewayTabKey {
  return GATEWAY_TABS.some((tab) => tab.key === value);
}

export function gatewayTabLabel(tabKey: GatewayTabKey): string {
  return GATEWAY_TABS.find((tab) => tab.key === tabKey)?.label ?? "Overview";
}

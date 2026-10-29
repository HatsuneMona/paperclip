import { t as uiT } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Braces,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  Play,
  Repeat,
  Send,
  type LucideIcon,
} from "lucide-react";
import { routinesApi } from "@/api/routines";
import { queryKeys } from "@/lib/queryKeys";
import { useParams } from "@/lib/router";
import { ContextualSidebarFrame } from "./ContextualSidebarFrame";
import { SidebarNavItem } from "./SidebarNavItem";

export const ROUTINE_DETAIL_VIEWS = [
  "overview",
  "triggers",
  "variables",
  "delivery",
  "secrets",
  "history",
  "runs",
  "activity",
] as const;

export type RoutineDetailView = (typeof ROUTINE_DETAIL_VIEWS)[number];

export type RoutineContextualNavItem = {
  view: Exclude<RoutineDetailView, "history">;
  label: string;
  icon: LucideIcon;
};

export const ROUTINE_CONTEXTUAL_NAV_ITEMS: readonly RoutineContextualNavItem[] = [
  { view: "overview", label: uiT("ui:messages.m_d4b1ea5708dd5329"), icon: LayoutDashboard },
  { view: "triggers", label: uiT("ui:messages.m_e62f2148a64d96bb"), icon: CalendarClock },
  { view: "variables", label: uiT("ui:messages.m_02db55bac5e3f7ce"), icon: Braces },
  { view: "delivery", label: uiT("ui:messages.m_52bfe584a5fc4505"), icon: Send },
  { view: "secrets", label: uiT("ui:messages.m_d8707d411d997657"), icon: KeyRound },
];

export function isRoutineDetailView(value: string | null | undefined): value is RoutineDetailView {
  return ROUTINE_DETAIL_VIEWS.includes(value as RoutineDetailView);
}

export function routineDetailHref(routineId: string, view: RoutineDetailView = "overview") {
  return `/routines/${routineId}/${view}`;
}

/** Keep routine configuration and operations in the routine detail shell. */
export function resolveRoutineDetailDestination(input: {
  routineId: string;
  section?: string | null;
  legacyTab?: string | null;
}) {
  const requested = input.legacyTab ?? input.section;
  if (isRoutineDetailView(requested)) return routineDetailHref(input.routineId, requested);
  return routineDetailHref(input.routineId, "overview");
}

export function RoutineContextualSidebar({
  routineId: routineIdProp,
  title,
}: {
  routineId?: string;
  title?: string;
} = {}) {
  const params = useParams<{ routineId?: string }>();
  const routineId = routineIdProp ?? params.routineId ?? "";
  const { data: routine } = useQuery({
    queryKey: queryKeys.routines.detail(routineId),
    queryFn: () => routinesApi.get(routineId),
    enabled: Boolean(routineId && !title),
  });
  const frameTitle = title ?? routine?.title ?? "Routine";

  return (
    <ContextualSidebarFrame
      surface="routine"
      title={frameTitle}
      icon={Repeat}
      fallbackTo="/routines"
      showHeader={false}
      className="border-r border-border bg-background"
    >
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-label="Routine navigation">
        <div className="flex flex-col gap-0.5">
          {ROUTINE_CONTEXTUAL_NAV_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.view}
              to={routineDetailHref(routineId, item.view)}
              label={item.label}
              icon={item.icon}
              end
            />
          ))}
        </div>

        <p className="px-4 pb-1 pt-5 text-(length:--text-nano) font-mono font-medium uppercase tracking-widest text-muted-foreground/60">{uiT("ui:messages.m_58c3939c4ce986c8")}</p>
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem
            to={routineDetailHref(routineId, "runs")}
            label={uiT("ui:messages.m_848f54e89660cea4")}
            icon={Play}
          />
          <SidebarNavItem
            to={routineDetailHref(routineId, "activity")}
            label={uiT("ui:messages.m_38da1505ca837328")}
            icon={Activity}
          />
        </div>
      </nav>
    </ContextualSidebarFrame>
  );
}

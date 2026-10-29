import { t as uiT } from "@/i18n";
import type { Issue } from "@paperclipai/shared";
import { Boxes, CircleCheck, CirclePlus, FolderOpen, History, LayoutDashboard, MessageCircle, Package, Repeat, Search, Unplug, Users } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { SidebarAccountMenu } from "./SidebarAccountMenu";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";
import { SidebarNavExpandedProvider, SidebarNavItem } from "./SidebarNavItem";
import { SidebarSection } from "./SidebarSection";
import { TruncatedTextMarqueeProvider } from "./TruncatedText";
import { Button } from "./ui/button";
import { FlyoutAppearanceProvider } from "./ui/flyout";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useScrollbarWhileScrolling } from "./side-panel/use-scrollbar-while-scrolling";

export type DesignSidebarRecentTask = Pick<Issue, "id" | "companyId" | "identifier" | "title">;

/** Shared staged sidebar. The caller supplies company-scoped recent tasks and actions. */
export function DesignSidebar({ onNewTask, recentTasks = [] }: { onNewTask: () => void; recentTasks?: readonly DesignSidebarRecentTask[] }) {
  const { selectedCompany } = useCompany();
  const root = `/${selectedCompany?.issuePrefix ?? "PAP"}`;
  const companyRecentTasks = recentTasks.filter(task => task.companyId === selectedCompany?.id);
  const handleRecentScroll = useScrollbarWhileScrolling();
  return (
    <FlyoutAppearanceProvider><TruncatedTextMarqueeProvider><SidebarNavExpandedProvider>
      <div className="design-sidebar">
        <div className="design-sidebar-brand">
          <SidebarCompanyMenu showChevron={false} />
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" className="design-sidebar-search" aria-label="Global search" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }))}><Search aria-hidden /></Button></TooltipTrigger><TooltipContent side="right">Search tasks, agents, projects</TooltipContent></Tooltip>
        </div>
        <nav className="design-sidebar-navigation" aria-label="Main navigation">
          <div className="design-sidebar-primary">
            <Button variant="ghost" className="design-sidebar-new-task" onClick={onNewTask}><CirclePlus aria-hidden />{uiT("ui:messages.m_718e58cc20d67514")}</Button>
            <SidebarNavItem className="design-sidebar-item" to={`${root}/dashboard`} label={uiT("ui:messages.m_67b696468610b879")} icon={LayoutDashboard} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/chats`} label={uiT("ui:messages.m_460b3a7da007b7af")} icon={MessageCircle} />
          </div>
          <SidebarSection label={uiT("ui:messages.m_104ab9213e28e4ff")}>
            <SidebarNavItem className="design-sidebar-item" to={`${root}/issues`} label="Tasks" icon={CircleCheck} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/projects`} label={uiT("ui:messages.m_04e2a9728af75840")} icon={FolderOpen} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/routines`} label={uiT("ui:messages.m_61b7bb44e2b47b7c")} icon={Repeat} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/artifacts`} label={uiT("ui:messages.m_314ae71b8c8dc9c9")} icon={Package} />
          </SidebarSection>
          <SidebarSection label={uiT("ui:messages.m_b1ee7e9705a211e0")}>
            <SidebarNavItem className="design-sidebar-item" to={`${root}/agents`} label={uiT("ui:messages.m_279b44d2ab4b40c0")} icon={Users} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/skills`} label={uiT("ui:messages.m_66d0f523a379b2de")} icon={Boxes} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/apps`} label={uiT("ui:messages.m_c3d2e79ebdd046c6")} icon={Unplug} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/activity`} label={uiT("ui:messages.m_bb6aea28739637ea")} icon={History} />
          </SidebarSection>
          {companyRecentTasks.length > 0 ? <div className="design-sidebar-recents">
            <SidebarSection label={uiT("ui:messages.m_49a027ddc61602c1")}>
              <div onScroll={handleRecentScroll} className="design-sidebar-recent-list scrollbar-while-scrolling" role="region" aria-label={uiT("ui:messages.m_7b940d847536b182")} tabIndex={0}>
              {companyRecentTasks.map(issue => <SidebarNavItem key={issue.id} className="design-sidebar-item" to={`${root}/issues/${issue.identifier}`} label={issue.title} />)}
              </div>
            </SidebarSection>
          </div> : null}
        </nav>
        <div className="design-sidebar-account"><SidebarAccountMenu forceExpanded /></div>
      </div>
    </SidebarNavExpandedProvider></TruncatedTextMarqueeProvider></FlyoutAppearanceProvider>
  );
}

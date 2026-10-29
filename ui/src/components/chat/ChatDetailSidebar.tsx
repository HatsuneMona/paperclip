import { t as uiT } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { queryKeys } from "@/lib/queryKeys";
import {
  Activity,
  GitPullRequest,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import { SidebarNavItem } from "../SidebarNavItem";
import { contextualSidebarStyles } from "../contextual-sidebar-styles";

export function ChatDetailSidebar({
  endpointId,
  NavItem = SidebarNavItem,
}: {
  endpointId: string;
  NavItem?: typeof SidebarNavItem;
}) {
  const endpoint = useQuery({
    queryKey: queryKeys.chatEndpoints.detail(endpointId),
    queryFn: () => chatEndpointsApi.get(endpointId),
    enabled: Boolean(endpointId),
  });
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-border bg-background">
      <nav
        aria-label="Chat connection"
        data-slot="contextual-sidebar-nav"
        className={contextualSidebarStyles.nav}
      >
        <div
          data-slot="contextual-sidebar-group"
          className={contextualSidebarStyles.group}
        >
          <NavItem
            to={`/apps/chat/${endpointId}/settings`}
            label={uiT("ui:messages.m_74a883a037bc227f")}
            icon={Settings}
            end
          />
          <NavItem
            to={`/apps/chat/${endpointId}/access`}
            label={uiT("ui:messages.m_ec5ba0abb717da87")}
            icon={Users}
            end
          />
          {endpoint.data?.provider === "github" && (
            <NavItem
              to={`/apps/chat/${endpointId}/reviews`}
              label="Reviews"
              icon={GitPullRequest}
            />
          )}
          <NavItem
            to={`/apps/chat/${endpointId}/conversations`}
            label={uiT("ui:messages.m_1d432f58690c2b4a")}
            icon={MessageSquare}
            end
          />
          <NavItem
            to={`/apps/chat/${endpointId}/activity`}
            label={uiT("ui:messages.m_38da1505ca837328")}
            icon={Activity}
            end
          />
        </div>
      </nav>
    </aside>
  );
}

import { NavLink, useLocation } from "react-router-dom";
import {
  Database,
  Globe,
  LayoutDashboard,
  Mail,
  Settings,
  Shield,
  Users,
  Activity,
  FileText,
  Zap,
  CreditCard,
  ShieldCheck
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";

const navigation = [
  {
    title: "Overview",
    url: "/",
    icon: LayoutDashboard,
    group: "main"
  },
  {
    title: "Email Accounts",
    url: "/email-accounts",
    icon: Mail,
    group: "main"
  },
  {
    title: "Proxy Manager",
    url: "/proxies",
    icon: Globe,
    group: "main"
  },
  {
    title: "Crawl Jobs",
    url: "/jobs",
    icon: Activity,
    group: "main"
  },
  {
    title: "Sorter",
    url: "/results",
    icon: Database,
    group: "main"
  },
  {
    title: "Billing",
    url: "/billing",
    icon: CreditCard,
    group: "main"
  },
  {
    title: "Super Admin",
    url: "/admin",
    icon: ShieldCheck,
    group: "admin"
  },
  {
    title: "Users",
    url: "/users",
    icon: Users,
    group: "admin"
  },
  {
    title: "API Keys",
    url: "/api-keys",
    icon: Shield,
    group: "admin"
  },
  {
    title: "Reports",
    url: "/reports",
    icon: FileText,
    group: "admin"
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    group: "system"
  }
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";
  const { isSuperAdmin } = useIsSuperAdmin();

  const isActive = (path: string) => {
    if (path === "/") {
      return currentPath === "/";
    }
    return currentPath.startsWith(path);
  };

  const getNavClassName = (path: string) =>
    isActive(path)
      ? "bg-primary text-primary-foreground font-medium shadow-glow"
      : "hover:bg-accent hover:text-accent-foreground";

  const mainItems = navigation.filter(item => item.group === "main");
  const adminItems = navigation.filter(item => item.group === "admin");
  const systemItems = navigation.filter(item => item.group === "system");

  return (
    <Sidebar className={collapsed ? "w-16" : "w-64"}>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-lg font-bold text-sidebar-foreground">ZapCrawler</h2>
              <p className="text-xs text-sidebar-foreground/60">Dashboard</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-4">
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={getNavClassName(item.url)}
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={getNavClassName(item.url)}
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={getNavClassName(item.url)}
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
"use client";

import {
  BarChart3,
  Coins,
  CreditCard,
  FileText,
  Handshake,
  Home,
  LayoutGrid,
  LineChart,
  Server,
  Shield,
  Users,
} from "@/components/icons";
import { SidebarShell, SidebarAvatar } from "./SidebarShell";
import type { NavGroup } from "./SidebarShell";

/* ------------------------------------------------------------------ */
/*  Admin / Super-Admin sidebar — PRD §6.2 Admin navigation profile   */
/*  8 items: Dashboard, Users, Moderation, Workspaces,               */
/*           Revenue, Analytics, System Health, Audit Logs            */
/* ------------------------------------------------------------------ */

const baseItems = [
  { href: "/admin/dashboard", label: "Dashboard Overview", icon: Home },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/dealers", label: "Dealers", icon: Handshake },
  { href: "/admin/moderation", label: "Moderation", icon: Shield },
  { href: "/admin/workspaces", label: "Workspaces", icon: LayoutGrid },
  {
    href: "/admin/plans",
    label: "Tier Plans",
    icon: CreditCard,
    superAdminOnly: true,
  },
  { href: "/admin/upload-credits", label: "Upload Credits", icon: Coins },
  { href: "/admin/revenue", label: "Revenue", icon: LineChart },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/system", label: "System Health", icon: Server },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: FileText },
];

interface AdminSidebarProps {
  userName: string;
  avatarUrl?: string;
  platformRole: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AdminSidebar({
  userName,
  avatarUrl,
  platformRole,
  mobileOpen,
  onMobileClose,
}: AdminSidebarProps) {
  const groups: NavGroup[] = [
    {
      items: baseItems.filter(
        (item) => !item.superAdminOnly || platformRole === "super_admin",
      ),
    },
  ];

  return (
    <SidebarShell
      subtitle="Admin Console"
      groups={groups}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
      footer={
        <SidebarAvatar
          name={userName}
          avatarUrl={avatarUrl}
          badge={platformRole === "super_admin" ? "Super Admin" : "Admin"}
        />
      }
    />
  );
}

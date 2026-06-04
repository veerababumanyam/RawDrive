"use client";

import {
  BarChart3,
  CalendarDays,
  Film,
  Home,
  ImageIcon,
  MessageSquare,
  Settings,
  ShoppingBag,
  Wallet,
} from "@/components/icons";
import { SidebarShell, SidebarAvatar } from "./SidebarShell";
import type { NavGroup, NavItem } from "./SidebarShell";

/* ------------------------------------------------------------------ */
/*  Studio / Photographer sidebar — PRD §6.2 Studio navigation       */
/*  Business operations stay directly discoverable from the rail.     */
/* ------------------------------------------------------------------ */

const groups: NavGroup[] = [
  {
    title: "Creative",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/galleries", label: "Galleries", icon: ImageIcon },
    ],
  },
  {
    title: "Business",
    items: [
      {
        href: "/crm",
        label: "Studio CRM",
        icon: BarChart3,
        activeHrefs: ["/crm", "/settings/packages", "/reports/gstr1"],
      },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/billing", label: "Billing", icon: Wallet },
    ],
  },
  {
    title: "Marketplace",
    items: [
      {
        href: "/marketplace/freelancers",
        label: "Freelancers",
        icon: ShoppingBag,
      },
      {
        href: "/marketplace/camera-rentals",
        label: "Camera Rentals",
        icon: Film,
      },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
];

const utilityItems: NavItem[] = [
  {
    href: "/settings/profile",
    label: "Settings",
    icon: Settings,
    activeHrefs: [
      "/settings",
      "/settings/profile",
      "/settings/business",
      "/settings/storage",
      "/settings/pwa",
      "/settings/security",
      "/settings/subscription",
      "/settings/packages",
      "/settings/plans",
    ],
  },
];

interface StudioSidebarProps {
  userName: string;
  avatarUrl?: string;
  planBadge?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function StudioSidebar({
  userName,
  avatarUrl,
  planBadge,
  mobileOpen,
  onMobileClose,
}: StudioSidebarProps) {
  return (
    <SidebarShell
      subtitle=""
      groups={groups}
      utilityItems={utilityItems}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
      footer={
        <SidebarAvatar
          name={userName}
          avatarUrl={avatarUrl}
          badge={planBadge || "Free Plan"}
          badgeHref="/settings/subscription"
        />
      }
    />
  );
}

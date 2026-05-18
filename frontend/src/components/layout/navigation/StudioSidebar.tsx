"use client";

import {
  BarChart3,
  BrainCircuit,
  Home,
  ImageIcon,
  MessageSquare,
  Monitor,
  Radio,
  Settings,
  ShoppingBag,
  UserCircle,
} from "lucide-react";
import { SidebarShell, SidebarAvatar } from "./SidebarShell";
import type { NavGroup } from "./SidebarShell";

/* ------------------------------------------------------------------ */
/*  Studio / Photographer sidebar — PRD §6.2 Studio navigation       */
/*  Business operations are grouped under Studio CRM.                 */
/* ------------------------------------------------------------------ */

const groups: NavGroup[] = [
  {
    title: "Creative",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/galleries", label: "Galleries", icon: ImageIcon },
      { href: "/streams", label: "Live Streams", icon: Radio },
      { href: "/ai", label: "AI Studio", icon: BrainCircuit },
    ],
  },
  {
    title: "Business",
    items: [
      {
        href: "/crm",
        label: "Studio CRM",
        icon: BarChart3,
        activeHrefs: ["/crm", "/calendar", "/billing", "/settings/packages", "/reports/gstr1"],
      },
    ],
  },
  {
    title: "Grow",
    items: [
      { href: "/marketplace/freelancers", label: "Marketplace", icon: ShoppingBag },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/desktop", label: "Desktop App", icon: Monitor },
      { href: "/settings/profile", label: "Profile", icon: UserCircle },
      { href: "/settings/business", label: "Business Profile", icon: Settings },
      { href: "/settings/storage", label: "Storage", icon: Settings },
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

export function StudioSidebar({ userName, avatarUrl, planBadge, mobileOpen, onMobileClose }: StudioSidebarProps) {
  return (
    <SidebarShell
      subtitle="Creative Studio"
      groups={groups}
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

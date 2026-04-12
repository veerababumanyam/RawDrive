"use client";

import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Handshake,
  Home,
  ImageIcon,
  MessageSquare,
  Monitor,
  Radio,
  ReceiptText,
  Settings,
  ShoppingBag,
  UserCircle,
  Users,
} from "lucide-react";
import { SidebarShell, SidebarAvatar } from "./SidebarShell";
import type { NavGroup } from "./SidebarShell";

/* ------------------------------------------------------------------ */
/*  Studio / Photographer sidebar — PRD §6.2 Studio navigation       */
/*  10 items in 4 groups: Creative, Business, Grow, Settings          */
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
      { href: "/crm/contacts", label: "Clients", icon: Users },
      { href: "/crm", label: "Leads", icon: BarChart3 },
      { href: "/crm/deals", label: "Deals", icon: Handshake },
      { href: "/calendar", label: "Bookings", icon: CalendarDays },
      { href: "/billing", label: "Invoices", icon: ReceiptText },
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
  planBadge?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function StudioSidebar({ userName, planBadge, mobileOpen, onMobileClose }: StudioSidebarProps) {
  return (
    <SidebarShell
      subtitle="Creative Studio"
      groups={groups}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
      footer={
        <SidebarAvatar
          name={userName}
          badge={planBadge || "Pro Plan"}
        />
      }
    />
  );
}

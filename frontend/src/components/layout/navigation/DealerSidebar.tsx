"use client";

import {
  Home,
  PieChart,
  Ticket,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { SidebarShell, SidebarAvatar } from "./SidebarShell";
import type { NavGroup } from "./SidebarShell";

/* ------------------------------------------------------------------ */
/*  Dealer sidebar — PRD §6.2 Dealer navigation profile              */
/*  6 items: Dashboard, My Territory, Registrations,                  */
/*           Coupons, Revenue Share, Payouts                          */
/* ------------------------------------------------------------------ */

const groups: NavGroup[] = [
  {
    items: [
      { href: "/dealer", label: "Dashboard Overview", icon: Home },
      { href: "/dealer/registrations", label: "Registrations", icon: UserPlus },
      { href: "/dealer/photographers", label: "Photographers", icon: Users },
      { href: "/dealer/coupons", label: "Coupons", icon: Ticket },
      { href: "/dealer/revenue-share", label: "Revenue Share", icon: PieChart },
      { href: "/dealer/payouts", label: "Payouts", icon: Wallet },
    ],
  },
];

interface DealerSidebarProps {
  userName: string;
  avatarUrl?: string;
  territory?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function DealerSidebar({ userName, avatarUrl, territory, mobileOpen, onMobileClose }: DealerSidebarProps) {
  return (
    <SidebarShell
      subtitle="Dealer Portal"
      groups={groups}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
      footer={
        <SidebarAvatar
          name={userName}
          avatarUrl={avatarUrl}
          badge={territory || "Dealer"}
        />
      }
    />
  );
}

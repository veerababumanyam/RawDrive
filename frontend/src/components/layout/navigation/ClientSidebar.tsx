"use client";

import {
  Download,
  Heart,
  ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { SidebarShell, SidebarAvatar } from "./SidebarShell";
import type { NavGroup } from "./SidebarShell";

/* ------------------------------------------------------------------ */
/*  Client sidebar — PRD §6.2 Client navigation profile              */
/*  4 items: Galleries, Proofing, Favorites, Downloads               */
/*  Narrower sidebar — minimal chrome, photo-first experience        */
/* ------------------------------------------------------------------ */

const groups: NavGroup[] = [
  {
    items: [
      { href: "/galleries", label: "Galleries", icon: ImageIcon },
      { href: "/proofing", label: "Proofing", icon: CheckCircle2 },
      { href: "/favorites", label: "Favorites", icon: Heart },
      { href: "/downloads", label: "Downloads", icon: Download },
    ],
  },
];

interface ClientSidebarProps {
  userName: string;
  avatarUrl?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function ClientSidebar({ userName, avatarUrl, mobileOpen, onMobileClose }: ClientSidebarProps) {
  return (
    <SidebarShell
      subtitle="My Photos"
      groups={groups}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
      footer={
        <SidebarAvatar
          name={userName}
          avatarUrl={avatarUrl}
          badge="Client"
        />
      }
    />
  );
}

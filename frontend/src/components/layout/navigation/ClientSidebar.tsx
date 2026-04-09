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
}

export function ClientSidebar({ userName }: ClientSidebarProps) {
  return (
    <SidebarShell
      subtitle="My Photos"
      groups={groups}
      footer={
        <SidebarAvatar
          name={userName}
          badge="Client"
        />
      }
    />
  );
}

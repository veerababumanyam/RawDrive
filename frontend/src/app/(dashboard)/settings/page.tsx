"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Coins,
  CreditCard,
  HardDrive,
  LayoutGrid,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { getStoredPlatformRole } from "@/lib/auth";

// Settings hub — replaces the old `redirect("/settings/profile")` shim
// so the "Settings" user-menu entry actually lands somewhere distinct
// from the "Profile" entry. QA T-068's original fix avoided a 404 but
// created the "Profile and Settings both open the same screen" bug
// that's now on the books.
//
// Admin users also get an "Admin Console" tile here — there is no
// dedicated `/admin/settings` platform-config page yet (the
// `platform_settings` table has API CRUD but no UI), so this is the
// single place admins can jump into the operational admin area from
// the user menu.

interface Tile {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  // When present, tile renders only if the viewer's platform_role
  // matches one of the listed roles.
  requireRoles?: string[];
  testId: string;
}

const TILES: Tile[] = [
  {
    href: "/settings/profile",
    label: "Profile",
    description: "Display name, phone, avatar.",
    icon: UserRound,
    testId: "settings-tile-profile",
  },
  {
    href: "/settings/business",
    label: "Business",
    description: "Studio identity, GSTIN, branding.",
    icon: BriefcaseBusiness,
    testId: "settings-tile-business",
  },
  {
    href: "/settings/security",
    label: "Security",
    description: "Password and multi-factor authentication.",
    icon: ShieldCheck,
    testId: "settings-tile-security",
  },
  {
    href: "/settings/storage",
    label: "Storage",
    description: "Usage, quotas, and BYOS (enterprise).",
    icon: HardDrive,
    testId: "settings-tile-storage",
  },
  {
    href: "/settings/packages",
    label: "Gallery packages",
    description: "Client-facing delivery packages.",
    icon: CreditCard,
    testId: "settings-tile-packages",
  },
  {
    href: "/admin/upload-credits",
    label: "Upload Credits",
    description: "Grant upload credits to any workspace. Audit-logged, idempotent.",
    icon: Coins,
    requireRoles: ["super_admin", "admin"],
    testId: "settings-tile-upload-credits",
  },
  {
    href: "/admin/dashboard",
    label: "Admin Console",
    description: "Platform-wide users, workspaces, revenue, moderation.",
    icon: LayoutGrid,
    requireRoles: ["super_admin", "admin"],
    testId: "settings-tile-admin",
  },
];

export default function SettingsHubPage() {
  const [role, setRole] = useState<string>("photographer");

  // Role is read from JWT claims — resolved client-side to keep the
  // hub a pure Client Component. Non-admins never see the Admin Console
  // tile because the filter happens before render.
  useEffect(() => {
    setRole(getStoredPlatformRole());
  }, []);

  const visibleTiles = TILES.filter(
    (tile) => !tile.requireRoles || tile.requireRoles.includes(role),
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-8">
      <header>
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
          Settings
        </h1>
        <p className="text-text-secondary mt-2 text-sm">
          Workspace, account, and (for admins) platform configuration.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              data-testid={tile.testId}
              className="group block rounded-xl border border-border-subtle bg-surface-container-low p-5 transition-colors hover:border-accent/40 hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-text-secondary group-hover:text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text-primary">
                    {tile.label}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {tile.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  CalendarDays,
  FolderOpen,
  Home,
  ImageIcon,
  MessageSquare,
  ReceiptText,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { getStoredAccessToken, getStoredAccessTokenClaims, getStoredPlatformRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";

// Roles that can see each nav item
const PHOTOGRAPHER_ROLES = ["photographer", "assistant", "studio_manager", "admin", "super_admin"];
const ADMIN_ROLES = ["admin", "super_admin"];
const DEALER_ROLES = ["dealer", "admin", "super_admin"];

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home, roles: [...PHOTOGRAPHER_ROLES, "dealer"] },
  { href: "/galleries", label: "Galleries", icon: ImageIcon, roles: PHOTOGRAPHER_ROLES },
  { href: "/crm/contacts", label: "Clients", icon: Users, roles: PHOTOGRAPHER_ROLES },
  { href: "/crm", label: "CRM", icon: BarChart3, roles: PHOTOGRAPHER_ROLES },
  { href: "/calendar", label: "Bookings", icon: CalendarDays, roles: PHOTOGRAPHER_ROLES },
  { href: "/billing", label: "Invoices", icon: ReceiptText, roles: PHOTOGRAPHER_ROLES },
  { href: "/ai", label: "AI Studio", icon: BrainCircuit, roles: PHOTOGRAPHER_ROLES },
  { href: "/marketplace/freelancers", label: "Marketplace", icon: ShoppingBag, roles: PHOTOGRAPHER_ROLES },
  { href: "/messages", label: "Messages", icon: MessageSquare, roles: [...PHOTOGRAPHER_ROLES, "dealer"] },
  { href: "/dealer", label: "Dealer", icon: Store, roles: DEALER_ROLES },
  { href: "/moderation", label: "Moderation", icon: Shield, roles: ADMIN_ROLES },
  { href: "/settings/storage", label: "Settings", icon: Settings, roles: [...PHOTOGRAPHER_ROLES, "dealer"] },
  { href: "/admin/users", label: "Admin", icon: Shield, roles: ADMIN_ROLES },
];

const headerNavItems = [
  {
    href: "/dashboard",
    label: "Home",
    icon: Home,
    title: "Open your studio dashboard",
  },
  {
    href: "/galleries",
    label: "Projects",
    icon: FolderOpen,
    title: "Browse gallery projects and client deliveries",
  },
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>(() => {
    if (typeof window === "undefined") return "photographer";
    return getStoredPlatformRole();
  });
  const [userInfo, setUserInfo] = useState<{ display_name?: string; email?: string }>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      window.location.assign("/login");
      return;
    }

    // Redirect to onboarding if workspace not set up yet (unless already there)
    if (!isOnboarding) {
      const claims = getStoredAccessTokenClaims();
      if (claims?.workspace_id === "pending-onboarding" || !claims?.workspace_id) {
        window.location.assign("/onboarding");
        return;
      }
    }

    setRole(getStoredPlatformRole());
    try {
      const stored = localStorage.getItem("user");
      if (stored) setUserInfo(JSON.parse(stored));
    } catch { /* fallback */ }
    setAuthenticated(true);
  }, [isOnboarding]);

  if (authenticated === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface text-text-primary">
        Loading workspace...
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  // During onboarding, render a minimal layout without sidebar/header
  if (isOnboarding) {
    return (
      <div className="min-h-[100dvh] overflow-x-hidden bg-surface text-text-primary">
        <main className="min-h-screen px-4 pb-12 pt-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface text-text-primary">
      <aside className="glass-surface fixed left-0 top-0 z-50 hidden h-screen w-[var(--sidebar-width-expanded)] flex-col px-4 py-8 lg:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <Image
            src="/logo/android-chrome-192x192.png"
            alt="RawDrive Logo"
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg"
          />
          <div>
            <h1 className="font-headline text-lg font-bold tracking-[-0.04em] text-accent">
              RawDrive
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
              Creative Studio
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.filter((item) => item.roles.includes(role)).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
                  active
                    ? "bg-surface-container-high text-accent shadow-sm"
                    : "text-text-secondary hover:bg-surface-container-low hover:text-text-primary",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="surface-panel flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-high">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-xs font-bold text-text-primary">
              {(userInfo.display_name || userInfo.email || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm text-text-primary">{userInfo.display_name || userInfo.email || "User"}</p>
              <p className="text-[10px] text-text-tertiary">View Profile</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="glass-surface fixed right-0 top-0 z-40 grid h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 lg:w-[calc(100%-var(--sidebar-width-expanded))] lg:px-8 md:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)_minmax(0,1fr)]">
        <nav className="hidden min-w-0 items-center gap-2 md:flex" aria-label="Workspace quick navigation">
          {headerNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.title}
                title={item.title}
                className={cn(
                  "inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-surface-container-high text-accent shadow-sm"
                    : "text-text-secondary hover:bg-surface-container-low hover:text-text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative min-w-0 w-full max-w-md md:justify-self-center">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            aria-label="Search galleries, clients, or files"
            placeholder="Search galleries, clients, or files..."
            className="input-base w-full pl-10 pr-4 text-sm"
          />
        </div>

        <div className="flex items-center justify-self-end gap-3">
          <ThemeToggleButton />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent"
          >
            <Bell className="h-5 w-5" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-bold text-text-primary">
            AS
          </div>
        </div>
      </header>

      <main className="min-h-screen px-4 pb-12 pt-24 lg:ml-[var(--sidebar-width-expanded)] lg:px-8">{children}</main>
    </div>
  );
}

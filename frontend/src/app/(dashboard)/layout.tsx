"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  FolderOpen,
  Home,
  Search,
} from "lucide-react";
import { getStoredAccessToken, getStoredAccessTokenClaims, getStoredPlatformRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";
import {
  AdminSidebar,
  DealerSidebar,
  StudioSidebar,
  ClientSidebar,
} from "@/components/layout/navigation";

/* ------------------------------------------------------------------ */
/*  Role-specific header quick-nav items                              */
/* ------------------------------------------------------------------ */

const studioHeaderNav = [
  { href: "/dashboard", label: "Home", icon: Home, title: "Open your studio dashboard" },
  { href: "/galleries", label: "Projects", icon: FolderOpen, title: "Browse gallery projects and client deliveries" },
] as const;

const adminHeaderNav = [
  { href: "/admin/dashboard", label: "Overview", icon: Home, title: "Admin dashboard overview" },
] as const;

const dealerHeaderNav = [
  { href: "/dealer", label: "Overview", icon: Home, title: "Dealer dashboard overview" },
] as const;

const clientHeaderNav = [
  { href: "/galleries", label: "My Galleries", icon: Home, title: "View your photo galleries" },
] as const;

function getHeaderNav(role: string) {
  switch (role) {
    case "super_admin":
    case "admin":
      return adminHeaderNav;
    case "dealer":
      return dealerHeaderNav;
    case "client":
      return clientHeaderNav;
    default:
      return studioHeaderNav;
  }
}

/* ------------------------------------------------------------------ */
/*  Role-specific search placeholders                                 */
/* ------------------------------------------------------------------ */

function getSearchPlaceholder(role: string) {
  switch (role) {
    case "super_admin":
    case "admin":
      return "Search users, workspaces, or logs...";
    case "dealer":
      return "Search registrations or coupons...";
    case "client":
      return "Search your photos...";
    default:
      return "Search galleries, clients, or files...";
  }
}

/* ------------------------------------------------------------------ */
/*  Role → Sidebar component (completely separate nav per role)       */
/* ------------------------------------------------------------------ */

function RoleSidebar({ role, userInfo }: { role: string; userInfo: { display_name?: string; email?: string } }) {
  const name = userInfo.display_name || userInfo.email || "User";

  switch (role) {
    case "super_admin":
    case "admin":
      return <AdminSidebar userName={name} platformRole={role} />;
    case "dealer":
      return <DealerSidebar userName={name} />;
    case "client":
      return <ClientSidebar userName={name} />;
    case "photographer":
    case "team_member":
    case "assistant":
    case "studio_manager":
    default:
      return <StudioSidebar userName={name} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Main dashboard layout                                             */
/* ------------------------------------------------------------------ */

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const [authenticated] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const token = getStoredAccessToken();
    if (!token) return false;
    if (!isOnboarding) {
      const claims = getStoredAccessTokenClaims();
      if (claims?.workspace_id === "pending-onboarding" || !claims?.workspace_id) {
        return false;
      }
    }
    return true;
  });
  const [role] = useState<string>(() => {
    if (typeof window === "undefined") return "photographer";
    return getStoredPlatformRole();
  });
  const [userInfo] = useState<{ display_name?: string; email?: string }>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

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

  const headerNavItems = getHeaderNav(role);
  const searchPlaceholder = getSearchPlaceholder(role);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface text-text-primary">
      {/* Role-specific sidebar — completely different component per role */}
      <RoleSidebar role={role} userInfo={userInfo} />

      {/* Header bar — offset from sidebar on desktop */}
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
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="input-base w-full pl-10 pr-4 text-sm"
          />
        </div>

        <div className="flex items-center justify-self-end gap-3">
          <ThemeToggleButton />
          <button
            type="button"
            aria-label="Notifications"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent"
          >
            <Bell className="h-5 w-5" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-bold text-text-primary">
            {(userInfo.display_name || userInfo.email || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Main content — offset by sidebar on desktop */}
      <main className="min-h-screen px-4 pb-12 pt-24 lg:ml-[var(--sidebar-width-expanded)] lg:px-8">{children}</main>
    </div>
  );
}

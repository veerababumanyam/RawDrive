"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";
import {
  getStoredAccessToken,
  getStoredAccessTokenClaims,
  getStoredPlatformRole,
  logoutAuthSession,
  refreshAuthSession,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";
import { HeaderClock } from "@/components/layout/HeaderClock";
import { PwaInstallBanner, PwaInstallHeaderButton } from "@/components/pwa/install-banner";
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

function RoleSidebar({ role, userInfo, mobileOpen, onMobileClose }: {
  role: string;
  userInfo: { display_name?: string; email?: string; avatar_url?: string; plan_tier?: string };
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const name = userInfo.display_name || userInfo.email || "User";
  const avatarUrl = userInfo.avatar_url;

  const tierLabel = userInfo.plan_tier
    ? userInfo.plan_tier.charAt(0).toUpperCase() + userInfo.plan_tier.slice(1) + " Plan"
    : undefined;

  switch (role) {
    case "super_admin":
    case "admin":
      return <AdminSidebar userName={name} avatarUrl={avatarUrl} platformRole={role} mobileOpen={mobileOpen} onMobileClose={onMobileClose} />;
    case "dealer":
      return <DealerSidebar userName={name} avatarUrl={avatarUrl} mobileOpen={mobileOpen} onMobileClose={onMobileClose} />;
    case "client":
      return <ClientSidebar userName={name} avatarUrl={avatarUrl} mobileOpen={mobileOpen} onMobileClose={onMobileClose} />;
    case "photographer":
    case "team_member":
    case "assistant":
    case "studio_manager":
    default:
      return <StudioSidebar userName={name} avatarUrl={avatarUrl} planBadge={tierLabel} mobileOpen={mobileOpen} onMobileClose={onMobileClose} />;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/* ------------------------------------------------------------------ */
/*  User menu dropdown — profile, settings, logout                    */
/* ------------------------------------------------------------------ */

function UserMenu({ userInfo, role }: { userInfo: { display_name?: string; email?: string; avatar_url?: string }; role: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = (userInfo.display_name || userInfo.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const displayName = userInfo.display_name || userInfo.email || "User";
  const roleBadge =
    role === "super_admin" ? "Super Admin" :
    role === "admin" ? "Admin" :
    role === "dealer" ? "Dealer" :
    role === "client" ? "Client" :
    "Photographer";

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await logoutAuthSession(API_BASE);
    window.location.assign("/login");
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="User menu"
        className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-bold text-text-primary transition-colors hover:bg-surface-container-highest hover:text-accent focus:ring-2 focus:ring-secondary/50 focus:outline-none"
      >
        {initials}
        {userInfo.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userInfo.avatar_url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right animate-in fade-in slide-in-from-top-1 duration-150 surface-panel rounded-2xl shadow-xl border border-white/[0.06] overflow-hidden"
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-sm font-bold text-text-primary">
                {initials}
                {userInfo.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userInfo.avatar_url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
                {userInfo.email && userInfo.display_name && (
                  <p className="truncate text-xs text-text-tertiary">{userInfo.email}</p>
                )}
                <p className="text-[10px] font-label uppercase tracking-[0.15em] text-text-tertiary mt-0.5">{roleBadge}</p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <a
              href="/settings/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            >
              <User className="h-4 w-4" />
              <span>Profile</span>
            </a>
            <a
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </a>
          </div>

          {/* Logout */}
          <div className="border-t border-white/[0.06] py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-feedback-error transition-colors hover:bg-feedback-error/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main dashboard layout                                             */
/* ------------------------------------------------------------------ */

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>("photographer");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Display profile used by the sidebar avatar and role header. Never
  // persisted across sessions — the layout fetches a fresh copy on
  // every mount via getCurrentUser() so a server-side name change
  // propagates on the next page load. localStorage was intentionally
  // not used because clearLegacyStoredTokens() actively wipes the
  // "user" key, which silently reset the avatar back to "U".
  const [userInfo, setUserInfo] = useState<{ display_name?: string; email?: string; avatar_url?: string; plan_tier?: string }>({});

  useEffect(() => {
    let active = true;

    async function ensureSession() {
      let token = getStoredAccessToken();
      if (!token) {
        token = await refreshAuthSession(API_BASE);
      }
      if (!active) {
        return;
      }
      if (!token) {
        setAuthenticated(false);
        window.location.assign("/login");
        return;
      }

      const claims = getStoredAccessTokenClaims();
      const platformRole = claims?.platform_role;
      const isAdminRole = platformRole === "super_admin" || platformRole === "admin";
      if (!isOnboarding && !isAdminRole && (claims?.workspace_id === "pending-onboarding" || !claims?.workspace_id)) {
        setAuthenticated(false);
        window.location.assign("/onboarding");
        return;
      }

      setRole(getStoredPlatformRole());
      setAuthenticated(true);

      // Populate the avatar + greeting from GET /auth/me. A failure
      // here degrades the sidebar to the email-local-part fallback,
      // never to a hardcoded "User".
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && active) {
          const me = await res.json();
          setUserInfo({ display_name: me.display_name, email: me.email, avatar_url: me.avatar_url || undefined, plan_tier: me.plan_tier || undefined });
          // Dealer first-login: force password change before proceeding
          if (me.must_change_password && !pathname.startsWith("/settings/security")) {
            window.location.assign("/settings/security?change_required=1");
            return;
          }
        }
      } catch { /* keep empty userInfo — sidebar falls back safely */ }
    }

    void ensureSession();
    return () => {
      active = false;
    };
  }, [isOnboarding]);

  // 2026-05-18: refetch /auth/me when the plans page dispatches
  // `rawdrive:plan-changed` after a successful Razorpay payment
  // verification. Without this, the user has to reload to see the
  // sidebar profile chip update from "Starter Plan" to the new tier
  // — even though the plans page itself updates immediately. We
  // could narrow the refetch to just the plan_tier field, but the
  // /auth/me round-trip is small (single row, indexed lookup) and
  // refetching the whole profile keeps display_name/avatar in sync
  // with anything else a payment flow might have changed.
  useEffect(() => {
    let active = true;
    function onPlanChanged() {
      const token = getStoredAccessToken();
      if (!token) return;
      fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => {
          if (!active || !me) return;
          setUserInfo({
            display_name: me.display_name,
            email: me.email,
            avatar_url: me.avatar_url || undefined,
            plan_tier: me.plan_tier || undefined,
          });
        })
        .catch(() => { /* keep current userInfo */ });
    }
    window.addEventListener("rawdrive:plan-changed", onPlanChanged);
    return () => {
      active = false;
      window.removeEventListener("rawdrive:plan-changed", onPlanChanged);
    };
  }, []);

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
      <RoleSidebar role={role} userInfo={userInfo} mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      {/* Header bar — offset from sidebar on desktop */}
      <header className="bg-surface border-b border-border fixed right-0 top-0 z-40 grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 transition-[width] duration-200 ease-out lg:w-[calc(100%-var(--sidebar-width))] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)_minmax(0,1fr)] lg:px-6">
        {/* Mobile hamburger — opens sidebar drawer on < lg screens */}
        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent lg:hidden"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <nav className="hidden min-w-0 items-center gap-2 lg:flex" aria-label="Workspace quick navigation">
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

        <form
          className="relative min-w-0 w-full max-w-md md:justify-self-center"
          onSubmit={(e) => {
            e.preventDefault();
            const q = (e.currentTarget.elements.namedItem("global-search") as HTMLInputElement)?.value?.trim();
            if (q) window.location.assign(`/galleries?q=${encodeURIComponent(q)}`);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="search"
            name="global-search"
            aria-label={searchPlaceholder}
            title=""
            placeholder={searchPlaceholder}
            className="input-base w-full pl-12 pr-4 text-sm"
          />
        </form>

        <div className="flex items-center justify-self-end gap-3">
          {/* Issue #1: dashboard-wide live clock. Mounted in the
              shared header so every authenticated route surfaces the
              current time without per-page work. */}
          <HeaderClock />
          {/* PWA install affordance — renders only when Chromium has
              emitted beforeinstallprompt and the app isn't already
              installed. Sits next to the bell so it's a peer of the
              other ambient header actions, not a CTA. */}
          <PwaInstallHeaderButton />
          <ThemeToggleButton />
          <a
            href="/notifications"
            aria-label="Notifications"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent"
          >
            <Bell className="h-5 w-5" />
          </a>
          <UserMenu userInfo={userInfo} role={role} />
        </div>
      </header>

      {/* Main content — offset by sidebar on desktop */}
      <main className="min-h-screen px-4 pb-12 pt-24 transition-[margin-left] duration-200 ease-out lg:ml-[var(--sidebar-width)] lg:px-6">{children}</main>

      {/* PWA install banner — mounted once at layout level so every
          authenticated page surfaces the same prompt. The component
          self-hides unless Chromium has emitted beforeinstallprompt,
          and respects a 30-day dismiss cooldown via localStorage. */}
      <PwaInstallBanner />
    </div>
  );
}

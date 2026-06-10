"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  Gear as Settings,
  Home,
  LogOut,
  Menu,
  Photo,
  Search,
  User,
  XMark as X,
} from "@/components/icons";
import {
  getStoredAccessToken,
  getStoredAccessTokenClaims,
  getStoredPlatformRole,
  logoutAuthSession,
  refreshAuthSession,
} from "@/lib/auth";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";
import { HeaderClock } from "@/components/layout/HeaderClock";
import {
  PwaInstallBanner,
  PwaInstallHeaderButton,
} from "@/components/pwa/install-banner";
import { DashboardUploadProvider } from "@/components/upload/dashboard-upload-provider";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { UploadCreditPill } from "@/components/streams/UploadCreditPill";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  AdminSidebar,
  DealerSidebar,
  StudioSidebar,
  ClientSidebar,
} from "@/components/layout/navigation";

/* ------------------------------------------------------------------ */
/*  Role-specific header quick-nav items                              */
/* ------------------------------------------------------------------ */

function getHomeHref(role: string) {
  switch (role) {
    case "super_admin":
    case "admin":
      return "/admin/dashboard";
    case "dealer":
      return "/dealer";
    case "client":
      return "/galleries";
    default:
      return "/dashboard";
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

function roleShowsUploadCredits(role: string): boolean {
  return (
    role === "photographer" ||
    role === "team_member" ||
    role === "assistant" ||
    role === "studio_manager"
  );
}

function formatPlanBadge(tier?: string): string | undefined {
  if (!tier) return undefined;
  const labels: Record<string, string> = {
    free: "Starter",
    standard: "Starter",
    starter: "Creator",
    creator: "Creator",
    pro: "Pro Photographer",
    professional: "Pro Photographer",
    pro_photographer: "Pro Photographer",
    business: "Elite Studio",
    enterprise: "Elite Studio",
    elite_studio: "Elite Studio",
    studio: "Studio",
  };
  return `${labels[tier] ?? tier.replaceAll("_", " ")} Plan`;
}

/* ------------------------------------------------------------------ */
/*  Role → Sidebar component (completely separate nav per role)       */
/* ------------------------------------------------------------------ */

function RoleSidebar({
  role,
  userInfo,
  mobileOpen,
  onMobileClose,
}: {
  role: string;
  userInfo: {
    display_name?: string;
    email?: string;
    avatar_url?: string;
    plan_tier?: string;
  };
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const name = userInfo.display_name || userInfo.email || "User";
  const avatarUrl = userInfo.avatar_url;
  const tierLabel = formatPlanBadge(userInfo.plan_tier);

  switch (role) {
    case "super_admin":
    case "admin":
      return (
        <AdminSidebar
          userName={name}
          avatarUrl={avatarUrl}
          platformRole={role}
          mobileOpen={mobileOpen}
          onMobileClose={onMobileClose}
        />
      );
    case "dealer":
      return (
        <DealerSidebar
          userName={name}
          avatarUrl={avatarUrl}
          mobileOpen={mobileOpen}
          onMobileClose={onMobileClose}
        />
      );
    case "client":
      return (
        <ClientSidebar
          userName={name}
          avatarUrl={avatarUrl}
          mobileOpen={mobileOpen}
          onMobileClose={onMobileClose}
        />
      );
    case "photographer":
    case "team_member":
    case "assistant":
    case "studio_manager":
    default:
      return (
        <StudioSidebar
          userName={name}
          avatarUrl={avatarUrl}
          planBadge={tierLabel}
          mobileOpen={mobileOpen}
          onMobileClose={onMobileClose}
        />
      );
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/* ------------------------------------------------------------------ */
/*  User menu dropdown — profile, settings, logout                    */
/* ------------------------------------------------------------------ */

function UserMenu({
  userInfo,
  role,
}: {
  userInfo: { display_name?: string; email?: string; avatar_url?: string };
  role: string;
}) {
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
    role === "super_admin"
      ? "Super Admin"
      : role === "admin"
        ? "Admin"
        : role === "dealer"
          ? "Dealer"
          : role === "client"
            ? "Client"
            : "Photographer";

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
          <img
            src={userInfo.avatar_url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right animate-in fade-in slide-in-from-top-1 duration-150 surface-panel rounded-2xl shadow-xl border border-text-media/10 overflow-hidden"
          // Inline positioning: .surface-panel sets `position: relative` for
          // its glass pseudo-layers, which would otherwise override the
          // `absolute` utility and pull this menu into the header flow.
          style={{ position: "absolute", top: "100%", right: 0 }}
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-text-media/10">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-sm font-bold text-text-primary">
                {initials}
                {userInfo.avatar_url && (
                  <img
                    src={userInfo.avatar_url}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {displayName}
                </p>
                {userInfo.email && userInfo.display_name && (
                  <p className="truncate text-xs text-text-tertiary">
                    {userInfo.email}
                  </p>
                )}
                <p className="text-[10px] font-label uppercase tracking-[0.15em] text-text-tertiary mt-0.5">
                  {roleBadge}
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <a
              href="/settings/profile#profile-avatar-url"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            >
              <User className="h-4 w-4" />
              <span>Change profile photo</span>
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
          <div className="border-t border-text-media/10 py-1">
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
  const isOnboarding =
    pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isSecurityPage = pathname.startsWith("/settings/security");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>("photographer");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Display profile used by the sidebar avatar and role header. Never
  // persisted across sessions — the layout fetches a fresh copy on
  // every mount via getCurrentUser() so a server-side name change
  // propagates on the next page load. localStorage was intentionally
  // not used because clearLegacyStoredTokens() actively wipes the
  // "user" key, which silently reset the avatar back to "U".
  const [userInfo, setUserInfo] = useState<{
    display_name?: string;
    email?: string;
    avatar_url?: string;
    plan_tier?: string;
  }>({});

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
      // Dealer and client accounts are admin-provisioned and have their own
      // role-specific dashboards. They must never be sent through the
      // photographer self-service onboarding flow. Admins are also excluded.
      // /settings/security is also exempted so a must_change_password redirect
      // cannot loop back into the onboarding check.
      const skipOnboarding =
        platformRole === "super_admin" ||
        platformRole === "admin" ||
        platformRole === "dealer" ||
        platformRole === "client";
      if (
        !isOnboarding &&
        !isSecurityPage &&
        !skipOnboarding &&
        (claims?.workspace_id === "pending-onboarding" || !claims?.workspace_id)
      ) {
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
          setUserInfo({
            display_name: me.display_name,
            email: me.email,
            avatar_url: me.avatar_url || undefined,
            plan_tier: me.plan_tier || undefined,
          });
          // First-login forced password change — redirect to security settings.
          if (me.must_change_password && !isSecurityPage) {
            window.location.assign("/settings/security?change_required=1");
            return;
          }
        }
      } catch {
        /* keep empty userInfo — sidebar falls back safely */
      }
    }

    void ensureSession();
    return () => {
      active = false;
    };
  }, [isOnboarding, isSecurityPage]);

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
        .catch(() => {
          /* keep current userInfo */
        });
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
      <div className="min-h-[100dvh] overflow-x-clip bg-surface text-text-primary">
        <main className="min-h-screen px-4 pb-12 pt-8">{children}</main>
      </div>
    );
  }

  const searchPlaceholder = getSearchPlaceholder(role);
  const homeHref = getHomeHref(role);

  return (
    <DashboardUploadProvider>
      <div className="min-h-[100dvh] overflow-x-clip bg-surface text-text-primary">
      {/* S5-G1: persistent read-only banner for admin impersonation sessions.
          Self-hides for normal sessions; when active it sets
          data-impersonation on <html> so mutating controls dim + disable. */}
      <ImpersonationBanner />
      {/* Role-specific sidebar — completely different component per role */}
      <RoleSidebar
        role={role}
        userInfo={userInfo}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Header bar — offset from sidebar on desktop */}
      <header className="dashboard-header glass-adaptive fixed right-0 top-0 z-40 flex w-full items-center px-3 transition-[width] duration-200 ease-out sm:px-4 md:w-[calc(100%-var(--sidebar-width))] md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Mobile hamburger — opens sidebar drawer on < lg screens */}
          <GlassIconButton
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            label={sidebarOpen ? "Close navigation" : "Open navigation"}
            size="sm"
            variant="ghost"
            className="dashboard-header__mobile-nav shrink-0 bg-surface-container-high text-text-secondary hover:bg-surface-container-highest hover:text-accent"
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </GlassIconButton>
          <nav
            className="dashboard-header__shortcuts flex shrink-0 items-center"
            aria-label="Primary workspace shortcuts"
          >
            <Link
              href={homeHref}
              aria-label="Home"
              title="Open home"
              className="glass-icon-button glass-icon-button--md glass-icon-button--ghost shrink-0 text-text-secondary hover:bg-surface-container-high hover:text-accent"
            >
              <Home className="h-5 w-5" />
            </Link>
            <Link
              href="/galleries"
              aria-label="Galleries"
              title="Open galleries"
              className="glass-icon-button glass-icon-button--md glass-icon-button--ghost shrink-0 text-text-secondary hover:bg-surface-container-high hover:text-accent"
            >
              <Photo className="h-5 w-5" />
            </Link>
          </nav>

          <form
            className="dashboard-header__search relative min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              const q = (
                e.currentTarget.elements.namedItem(
                  "global-search",
                ) as HTMLInputElement
              )?.value?.trim();
              if (q)
                window.location.assign(`/galleries?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="search"
              name="global-search"
              aria-label={searchPlaceholder}
              title=""
              placeholder={searchPlaceholder}
              className="input-base search-input-with-icon dashboard-header__search-input w-full text-sm"
            />
          </form>
        </div>

        <div className="dashboard-header__actions ml-2 flex shrink-0 items-center justify-end">
          {/* Issue #1: dashboard-wide live clock. Mounted in the
              shared header so every authenticated route surfaces the
              current time without per-page work. */}
          <HeaderClock />
          {/* PWA install affordance — renders only when Chromium has
              emitted beforeinstallprompt and the app isn't already
              installed. Sits next to the bell so it's a peer of the
              other ambient header actions, not a CTA. */}
          <PwaInstallHeaderButton />
          {roleShowsUploadCredits(role) && (
            <UploadCreditPill className="dashboard-header__credits" />
          )}
          <ThemeToggleButton />
          <a
            href="/notifications"
            aria-label="Notifications"
            className="glass-icon-button glass-icon-button--md glass-icon-button--ghost shrink-0 text-text-secondary hover:bg-surface-container-high hover:text-accent"
          >
            <Bell className="h-5 w-5" />
          </a>
          <UserMenu userInfo={userInfo} role={role} />
        </div>
      </header>

      {/* Main content — offset by sidebar on desktop */}
      <main className="dashboard-main min-h-screen px-4 pb-12 transition-[margin-left] duration-200 ease-out md:ml-[var(--sidebar-width)] md:px-6">
        {children}
      </main>

      {/* PWA install banner — mounted once at layout level so every
          authenticated page surfaces the same prompt. The component
          self-hides unless Chromium has emitted beforeinstallprompt,
          and respects a 30-day dismiss cooldown via localStorage. */}
      <PwaInstallBanner />
      </div>
    </DashboardUploadProvider>
  );
}

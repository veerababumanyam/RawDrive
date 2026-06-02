"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "rawdrive:sidebar:collapsed";

/* ------------------------------------------------------------------ */
/*  Shared sidebar container + nav-item renderer used by all roles    */
/* ------------------------------------------------------------------ */

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeHrefs?: string[];
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

interface SidebarShellProps {
  /** Appears below the logo — e.g. "Admin Console", "Dealer Portal" */
  subtitle: string;
  /** Navigation groups (optional section headers) */
  groups: NavGroup[];
  /** Footer content — avatar area at the bottom */
  footer: ReactNode;
  /** Mobile drawer open state — when true, sidebar slides in on < lg screens */
  mobileOpen?: boolean;
  /** Callback to close the mobile drawer */
  onMobileClose?: () => void;
}

export function SidebarShell({ subtitle, groups, footer, mobileOpen, onMobileClose }: SidebarShellProps) {
  const pathname = usePathname();
  // Desktop-only collapse state. Persisted to localStorage so the
  // photographer's preferred rail width survives reloads. The mobile
  // drawer ignores this — collapsed-mode is meaningless on small
  // screens where the rail is hidden behind a hamburger.
  const [collapsed, setCollapsed] = useState(false);
  // Collect all hrefs to resolve prefix-match collisions (e.g., /crm vs /crm/contacts)
  const allHrefs = groups.flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.activeHrefs ?? [])]));

  // Hydrate collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") setCollapsed(true);
    } catch { /* localStorage may be unavailable in private mode */ }
  }, []);

  // Mirror collapsed state onto <html data-sidebar-collapsed> so the
  // global CSS variable --sidebar-width flips and the dashboard layout
  // (which reads var(--sidebar-width)) reflows with the same animation.
  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "false";
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch { /* swallow — preference is best-effort */ }
  }, [collapsed]);

  // Close mobile drawer on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileOpen]);

  return (
    <>
      {/* Backdrop overlay for mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "bg-surface border-b border-border fixed left-0 top-0 z-50 h-screen w-[var(--sidebar-width)] flex-col px-4 py-8 transition-[width,transform] duration-200 ease-out",
          // Desktop: always visible
          "lg:flex lg:translate-x-0",
          // Mobile: slide in/out
          mobileOpen
            ? "flex translate-x-0"
            : "hidden -translate-x-full lg:flex",
        )}
      >
      {/* Logo + subtitle — always rendered first so the brand mark is the
          top-most element of the rail in both expanded and collapsed
          states. The toggle button below never overlaps it. */}
      <Link
        href="https://rawdrive.in"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open RawDrive website"
        className={cn(
          "mb-4 flex items-center gap-3 rounded-xl py-2 transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
          collapsed ? "justify-center" : "px-2",
        )}
      >
        <Image
          src="/logo/android-chrome-192x192.png"
          alt="RawDrive Logo"
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-lg"
        />
        <div className="sidebar-collapse-hide">
          <h1 className="font-headline text-lg font-bold tracking-[-0.04em] text-accent">
            RawDrive
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
            {subtitle}
          </p>
        </div>
      </Link>

      {/* Desktop collapse/expand toggle — sits BELOW the logo so the brand
          mark is never overlapped. Hidden on mobile (drawer UX makes
          collapse meaningless on small screens). When expanded the toggle
          right-aligns with the nav-item padding; when collapsed it
          centers in the 64px rail directly under the logo. */}
      <div className={cn("mb-6 hidden lg:flex", collapsed ? "justify-center" : "justify-end px-2")}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-pressed={collapsed}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-container-high hover:text-text-primary"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 space-y-6 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.title ?? gi}>
            {group.title && (
              <p className="sidebar-collapse-hide mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-tertiary">
                {group.title}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                // Exact match or prefix match — but only if no sibling is a deeper match
                const activeTargets = [item.href, ...(item.activeHrefs ?? [])];
                const isMatch = activeTargets.some(
                  (href) => pathname === href || pathname.startsWith(`${href}/`),
                );
                const hasDeeperSibling = isMatch && allHrefs.some(
                  (h) => h !== item.href && h.startsWith(`${item.href}/`) && pathname.startsWith(h),
                );
                const active = isMatch && !hasDeeperSibling;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "sidebar-nav-link flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
                      active
                        ? "bg-surface-container-high text-accent shadow-sm"
                        : "text-text-secondary hover:bg-surface-container-low hover:text-text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="sidebar-collapse-hide">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — avatar / role badge */}
      <div className="mt-auto">{footer}</div>
    </aside>
    </>
  );
}

/* Reusable avatar footer block */
export function SidebarAvatar({
  name,
  badge,
  badgeHref,
  avatarUrl,
}: {
  name: string;
  badge: string;
  badgeHref?: string;
  avatarUrl?: string;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const badgeEl = badgeHref ? (
    <Link
      href={badgeHref}
      className="text-[10px] text-text-tertiary underline-offset-2 hover:text-accent hover:underline transition-colors"
    >
      {badge}
    </Link>
  ) : (
    <p className="text-[10px] text-text-tertiary">{badge}</p>
  );

  return (
    <div className="surface-panel sidebar-nav-link flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-high" title={`${name} — ${badge}`}>
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-bold text-text-primary">
        {initials}
        {avatarUrl && (
          <img src={avatarUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
      </div>
      <div className="sidebar-collapse-hide overflow-hidden">
        <p className="truncate text-sm text-text-primary">{name}</p>
        {badgeEl}
      </div>
    </div>
  );
}

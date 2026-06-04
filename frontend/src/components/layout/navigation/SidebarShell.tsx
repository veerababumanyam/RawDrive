"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ChevronDoubleLeft, ChevronDoubleRight } from "@/components/icons";

const SIDEBAR_COLLAPSED_KEY = "rawdrive:sidebar:collapsed";
const SIDEBAR_WIDTH_KEY = "rawdrive:sidebar:expanded-width";
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 360;
const SIDEBAR_WIDTH_STEP = 8;
const SIDEBAR_WIDTH_FALLBACK = 240;

function clampSidebarWidth(width: number) {
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

function readStoredSidebarWidth() {
  if (typeof window === "undefined") return SIDEBAR_WIDTH_FALLBACK;

  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw === null) return SIDEBAR_WIDTH_FALLBACK;
    const stored = Number(raw);
    if (!Number.isFinite(stored)) return SIDEBAR_WIDTH_FALLBACK;
    return clampSidebarWidth(stored);
  } catch {
    return SIDEBAR_WIDTH_FALLBACK;
  }
}

function applySidebarExpandedWidth(width: number) {
  const value = `${clampSidebarWidth(width)}px`;
  document.documentElement.style.setProperty("--sidebar-width-expanded", value);
  document.body?.style.setProperty("--sidebar-width-expanded", value);
}

function persistSidebarExpandedWidth(width: number) {
  const next = clampSidebarWidth(width);
  applySidebarExpandedWidth(next);
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
  } catch {
    /* storage may be blocked; the current page still keeps the resize */
  }
  return next;
}

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
  /** Persistent utility rows pinned above the footer */
  utilityItems?: NavItem[];
  /** Footer content — avatar area at the bottom */
  footer: ReactNode;
  /** Mobile drawer open state — when true, sidebar slides in on phone screens */
  mobileOpen?: boolean;
  /** Callback to close the mobile drawer */
  onMobileClose?: () => void;
}

export function SidebarShell({
  subtitle,
  groups,
  utilityItems = [],
  footer,
  mobileOpen,
  onMobileClose,
}: SidebarShellProps) {
  const pathname = usePathname();
  // Desktop-only collapse state. Persisted to localStorage so the
  // photographer's preferred rail width survives reloads. The mobile
  // drawer ignores this — collapsed-mode is meaningless on small
  // screens where the rail is hidden behind a hamburger.
  const [collapsed, setCollapsed] = useState(() => {
    // Hydrate collapsed state from localStorage on first render. The lazy
    // initializer runs only on the client (this is a "use client" component)
    // so window access is safe. Falls back to false if localStorage is
    // unavailable (private-browsing mode).
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [expandedWidth, setExpandedWidth] = useState(readStoredSidebarWidth);
  const expandedWidthRef = useRef(expandedWidth);
  // Collect all hrefs to resolve prefix-match collisions (e.g., /crm vs /crm/contacts)
  const allNavItems = [
    ...groups.flatMap((group) => group.items),
    ...utilityItems,
  ];
  const allHrefs = allNavItems.flatMap((i) => [
    i.href,
    ...(i.activeHrefs ?? []),
  ]);
  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    // Exact match or prefix match — but only if no sibling is a deeper match
    const activeTargets = [item.href, ...(item.activeHrefs ?? [])];
    const isMatch = activeTargets.some(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    );
    const hasDeeperSibling =
      isMatch &&
      allHrefs.some(
        (h) =>
          h !== item.href &&
          h.startsWith(`${item.href}/`) &&
          pathname.startsWith(h),
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
  };

  // Mirror collapsed state onto <html data-sidebar-collapsed> so the
  // global CSS variable --sidebar-width flips and the dashboard layout
  // (which reads var(--sidebar-width)) reflows with the same animation.
  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed
      ? "true"
      : "false";
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* swallow — preference is best-effort */
    }
  }, [collapsed]);

  useEffect(() => {
    expandedWidthRef.current = expandedWidth;
    applySidebarExpandedWidth(expandedWidth);
  }, [expandedWidth]);

  const commitSidebarWidth = useCallback((width: number) => {
    const next = persistSidebarExpandedWidth(width);
    expandedWidthRef.current = next;
    setExpandedWidth(next);
  }, []);

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (collapsed) return;

      event.preventDefault();
      const startX = event.clientX;
      const startWidth =
        event.currentTarget.parentElement?.getBoundingClientRect().width ??
        expandedWidthRef.current;
      let latestWidth = startWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.documentElement.dataset.sidebarResizing = "true";
      document.body.dataset.sidebarResizing = "true";
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function cleanup() {
        delete document.documentElement.dataset.sidebarResizing;
        delete document.body.dataset.sidebarResizing;
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      }

      function handlePointerMove(moveEvent: PointerEvent) {
        latestWidth = clampSidebarWidth(
          startWidth + moveEvent.clientX - startX,
        );
        applySidebarExpandedWidth(latestWidth);
      }

      function handlePointerUp() {
        cleanup();
        commitSidebarWidth(latestWidth);
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [collapsed, commitSidebarWidth],
  );

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (collapsed) return;

      let nextWidth: number | null = null;
      if (event.key === "ArrowLeft") {
        nextWidth = expandedWidthRef.current - SIDEBAR_WIDTH_STEP;
      } else if (event.key === "ArrowRight") {
        nextWidth = expandedWidthRef.current + SIDEBAR_WIDTH_STEP;
      } else if (event.key === "Home") {
        nextWidth = SIDEBAR_WIDTH_MIN;
      } else if (event.key === "End") {
        nextWidth = SIDEBAR_WIDTH_MAX;
      }

      if (nextWidth === null) return;
      event.preventDefault();
      commitSidebarWidth(nextWidth);
    },
    [collapsed, commitSidebarWidth],
  );

  // Close mobile drawer on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  return (
    <>
      {/* Backdrop overlay for mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-surface-scrim-strong/50 glass-blur-subtle md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "sidebar-shell fixed left-0 top-0 z-50 h-screen flex-col border-r border-border bg-surface px-4 py-8 transition-[width,transform] duration-200 ease-out",
          // Tablet/desktop: always visible and sticky to the viewport
          "md:flex md:translate-x-0",
          // Phones: slide in/out as a drawer
          mobileOpen
            ? "flex translate-x-0"
            : "hidden -translate-x-full md:flex",
        )}
      >
        {/* Logo + optional subtitle — always rendered first so the brand mark is the
          top-most element of the rail in both expanded and collapsed
          states. The toggle button below never overlaps it. */}
        <a
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
            <h1 className="font-headline text-lg font-bold text-accent">
              RawDrive
            </h1>
            {subtitle ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {subtitle}
              </p>
            ) : null}
          </div>
        </a>

        <GlassIconButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setCollapsed((c) => !c)}
          label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-pressed={collapsed}
          className="sidebar-collapse-button text-text-tertiary hover:bg-surface-container-high hover:text-text-primary"
        >
          {collapsed ? <ChevronDoubleRight /> : <ChevronDoubleLeft />}
        </GlassIconButton>

        {!collapsed && (
          <div
            role="separator"
            aria-label="Resize navigation"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_WIDTH_MIN}
            aria-valuemax={SIDEBAR_WIDTH_MAX}
            aria-valuenow={expandedWidth}
            tabIndex={0}
            className="sidebar-resize-handle"
            onPointerDown={handleResizePointerDown}
            onKeyDown={handleResizeKeyDown}
          />
        )}

        {/* Navigation groups */}
        <nav className="flex-1 space-y-6 overflow-y-auto">
          {groups.map((group, gi) => (
            <div key={group.title ?? gi}>
              {group.title && (
                <p className="sidebar-collapse-hide mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-tertiary">
                  {group.title}
                </p>
              )}
              <div className="space-y-1">{group.items.map(renderNavItem)}</div>
            </div>
          ))}
        </nav>

        {/* Footer — avatar / role badge */}
        <div className="mt-auto space-y-3">
          {utilityItems.length > 0 && (
            <div className="space-y-1" aria-label="Sidebar utilities">
              <p className="sidebar-collapse-hide mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-tertiary">
                Tools
              </p>
              {utilityItems.map(renderNavItem)}
            </div>
          )}
          {footer}
        </div>
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
    <div
      className="sidebar-nav-link flex w-full items-center gap-3 overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-container-low hover:text-text-primary"
      title={`${name} — ${badge}`}
    >
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-bold text-text-primary">
        {initials}
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>
      <div className="sidebar-collapse-hide overflow-hidden">
        <p className="truncate text-sm text-text-primary">{name}</p>
        {badgeEl}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
  // Collect all hrefs to resolve prefix-match collisions (e.g., /crm vs /crm/contacts)
  const allHrefs = groups.flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.activeHrefs ?? [])]));

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
          "bg-surface border-b border-border fixed left-0 top-0 z-50 h-screen w-[var(--sidebar-width-expanded)] flex-col px-4 py-8 transition-transform duration-300 ease-out",
          // Desktop: always visible
          "lg:flex lg:translate-x-0",
          // Mobile: slide in/out
          mobileOpen
            ? "flex translate-x-0"
            : "hidden -translate-x-full lg:flex",
        )}
      >
      {/* Logo + subtitle */}
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
            {subtitle}
          </p>
        </div>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 space-y-6 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.title ?? gi}>
            {group.title && (
              <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-tertiary">
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
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
                      active
                        ? "bg-surface-container-high text-accent shadow-sm"
                        : "text-text-secondary hover:bg-surface-container-low hover:text-text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
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
}: {
  name: string;
  badge: string;
}) {
  return (
    <div className="surface-panel flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-high">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-xs font-bold text-text-primary">
        {name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </div>
      <div className="overflow-hidden">
        <p className="truncate text-sm text-text-primary">{name}</p>
        <p className="text-[10px] text-text-tertiary">{badge}</p>
      </div>
    </div>
  );
}

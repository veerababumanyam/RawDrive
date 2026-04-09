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
  Home,
  ImageIcon,
  MessageSquare,
  ReceiptText,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Upload,
  Users,
} from "lucide-react";
import { getStoredAccessToken, getStoredAccessTokenClaims } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/galleries", label: "Galleries", icon: ImageIcon },
  { href: "/crm/contacts", label: "Clients", icon: Users },
  { href: "/crm", label: "CRM", icon: BarChart3 },
  { href: "/calendar", label: "Bookings", icon: CalendarDays },
  { href: "/billing", label: "Invoices", icon: ReceiptText },
  { href: "/ai", label: "AI Studio", icon: BrainCircuit },
  { href: "/marketplace/freelancers", label: "Marketplace", icon: ShoppingBag },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/dealer", label: "Dealer", icon: Store },
  { href: "/moderation", label: "Moderation", icon: Shield },
  { href: "/settings/storage", label: "Settings", icon: Settings },
  { href: "/admin/users", label: "Admin", icon: Shield },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
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

    const frame = window.requestAnimationFrame(() => setAuthenticated(true));
    return () => window.cancelAnimationFrame(frame);
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
          {navItems.map((item) => {
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
              AS
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm text-text-primary">Arjun Singh</p>
              <p className="text-[10px] text-text-tertiary">View Profile</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="glass-surface fixed right-0 top-0 z-40 flex h-16 w-full items-center justify-between px-4 lg:w-[calc(100%-var(--sidebar-width-expanded))] lg:px-8">
        <div className="flex flex-1 items-center gap-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search galleries, clients, or files..."
              className="input-base w-full pl-10 pr-4 text-sm"
            />
          </div>

          <div className="hidden items-center gap-4 font-headline text-sm md:flex">
            <Link href="/" className="font-bold text-accent">
              Home
            </Link>
            <Link href="/galleries" className="text-text-secondary transition-opacity hover:opacity-80">
              Projects
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggleButton />
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-accent">
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

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Home,
  ImageIcon,
  Bell,
  ReceiptText,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/galleries", label: "Galleries", icon: ImageIcon },
  { href: "/crm/contacts", label: "Clients", icon: Users },
  { href: "/calendar", label: "Bookings", icon: CalendarDays },
  { href: "/billing", label: "Invoices", icon: ReceiptText },
  { href: "/crm", label: "Analytics", icon: BarChart3 },
  { href: "/settings/storage", label: "Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      window.location.assign("/login");
      return;
    }

    const frame = window.requestAnimationFrame(() => setAuthenticated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (authenticated === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0e0c1e] text-[#e8e2fc]">
        Loading workspace...
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#0e0c1e] text-[#e8e2fc]">
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[240px] flex-col bg-violet-950/40 py-8 shadow-[0px_0px_40px_rgba(163,166,255,0.06)] backdrop-blur-xl lg:flex">
        <div className="mb-10 px-6">
          <h1 className="font-headline text-2xl font-bold tracking-[-0.06em] text-[#a3a6ff]">
            RawDrive
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-400/60">
            Creative Studio
          </p>
        </div>

        <nav className="flex-1 space-y-2 px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  active
                    ? "border-r-2 border-[#a3a6ff] bg-[#a3a6ff]/10 text-[#a3a6ff]"
                    : "text-slate-400/80 hover:bg-[#a3a6ff]/5 hover:text-[#a3a6ff]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-4">
          <div className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-all hover:bg-white/5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#a3a6ff]/20 bg-[#1f1d35] text-xs font-bold text-white">
              AS
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm text-[#e8e2fc]">Arjun Singh</p>
              <p className="text-[10px] text-slate-400/60">View Profile</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="fixed right-0 top-0 z-40 flex h-16 w-full items-center justify-between bg-violet-950/30 px-4 backdrop-blur-md lg:w-[calc(100%-240px)] lg:px-8">
        <div className="flex flex-1 items-center gap-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search galleries, clients, or files..."
              className="w-full rounded-xl border border-[#48455a]/15 bg-black/20 py-2 pl-10 pr-4 text-sm text-[#e8e2fc] outline-none transition-all focus:border-[#a3a6ff] focus:ring-1 focus:ring-[#a3a6ff]"
            />
          </div>

          <div className="hidden items-center gap-4 font-headline text-sm md:flex">
            <Link href="/" className="font-bold text-[#a3a6ff]">
              Home
            </Link>
            <Link href="/galleries" className="text-slate-400 transition-opacity hover:opacity-80">
              Projects
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-[#a3a6ff] transition-all hover:bg-white/5">
            <Bell className="h-5 w-5" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[#a3a6ff]/20 bg-[#1f1d35] text-xs font-bold text-white">
            AS
          </div>
        </div>
      </header>

      <main className="min-h-screen px-4 pb-12 pt-24 lg:ml-[240px] lg:px-8">{children}</main>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/system", label: "System Health" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav className="border-b border-border-default mb-6" aria-label="Admin navigation">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {adminNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  active
                    ? "border-accent-default text-accent-default"
                    : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-strong",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}

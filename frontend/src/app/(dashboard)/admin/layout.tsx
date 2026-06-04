"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const adminNav = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/dealers", label: "Dealers" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/system", label: "System Health" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <div>
      <nav
        className="mb-8 bg-surface-container-low/40 glass-blur-medium border border-border-subtle rounded-2xl p-1.5 flex gap-1 overflow-x-auto"
        aria-label="Admin navigation"
      >
        {adminNav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-xl transition-all ${
                active
                  ? "bg-surface-container-high text-accent font-semibold glass-blur-full"
                  : "text-text-tertiary hover:text-text-primary hover:bg-surface-container-high/40"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

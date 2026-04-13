"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const CRM_NAV_ITEMS = [
  { href: "/crm", label: "Overview", active: ["/crm"] },
  { href: "/crm/inquiries", label: "Inquiries", active: ["/crm/inquiries"] },
  { href: "/crm/contacts", label: "Clients", active: ["/crm/contacts"] },
  { href: "/crm/projects", label: "Projects", active: ["/crm/projects", "/crm/deals"] },
  { href: "/calendar", label: "Calendar", active: ["/calendar"] },
  { href: "/crm/documents", label: "Documents", active: ["/crm/documents"] },
  { href: "/billing", label: "Billing", active: ["/billing"] },
  { href: "/reports/gstr1", label: "Reports", active: ["/reports"] },
  { href: "/settings/packages", label: "Price Book", active: ["/settings/packages"] },
] as const;

function matchesPath(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function CRMSecondaryNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Studio CRM sections" className="overflow-x-auto pb-1">
      <div className="flex gap-2 rounded-2xl border border-border-default bg-surface-raised p-2">
        {CRM_NAV_ITEMS.map((item) => {
          const active = item.href === "/crm"
            ? pathname === "/crm"
            : item.active.some((path) => matchesPath(pathname, path));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-primary text-text-inverse"
                  : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

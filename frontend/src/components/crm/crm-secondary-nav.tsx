"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const CRM_NAV_ITEMS = [
  { href: "/crm", label: "Overview", active: ["/crm"] },
  { href: "/crm/inquiries", label: "Inquiries", active: ["/crm/inquiries"] },
  { href: "/crm/contacts", label: "Clients", active: ["/crm/contacts"] },
  {
    href: "/crm/projects",
    label: "Projects",
    active: ["/crm/projects", "/crm/deals"],
  },
  { href: "/calendar", label: "Calendar", active: ["/calendar"] },
  { href: "/crm/documents", label: "Documents", active: ["/crm/documents"] },
  { href: "/billing", label: "Billing", active: ["/billing"] },
  { href: "/reports/gstr1", label: "Reports", active: ["/reports"] },
  {
    href: "/settings/packages",
    label: "Price Book",
    active: ["/settings/packages"],
  },
] as const;

function matchesPath(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function CRMSecondaryNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Studio CRM sections" className="crm-secondary-nav">
      <div className="glass-segmented crm-secondary-nav__tabs">
        {CRM_NAV_ITEMS.map((item) => {
          const active =
            item.href === "/crm"
              ? pathname === "/crm"
              : item.active.some((path) => matchesPath(pathname, path));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="glass-segmented-option crm-secondary-nav__tab"
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

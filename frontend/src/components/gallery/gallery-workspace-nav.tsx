"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface GalleryWorkspaceNavProps {
  galleryId: string;
}

// Each section is either a path relative to /galleries/{id} (sub-page of
// the current gallery) OR an absolute dashboard href (escape hatch that
// navigates out of the current gallery). The discriminator is which key
// is present.
type Section =
  | { label: string; path: string }
  | { label: string; absoluteHref: string };

const sections: Section[] = [
  // Overview — empty path points to the current gallery's detail page
  // (/galleries/{id}). Sits first so it's the default option when the
  // user opens the mobile dropdown on the gallery's main page.
  { label: "Overview", path: "" },
  // Galleries — absolute href, navigates back to the gallery list. Second
  // so the user can always return to "all my galleries" with one tap
  // regardless of which sub-page they're on.
  { label: "Galleries", absoluteHref: "/galleries" },
  { label: "Cover & Design", path: "/cover" },
  { label: "AI", path: "/ai" },
  { label: "Settings", path: "/settings" },
];

function resolveHref(section: Section, base: string): string {
  return "absoluteHref" in section ? section.absoluteHref : `${base}${section.path}`;
}

function isActive(section: Section, pathname: string, base: string): boolean {
  if ("absoluteHref" in section) {
    // Galleries link is active only on /galleries exactly — not on any
    // /galleries/{id}/... sub-route. Distinct prefix match.
    return pathname === section.absoluteHref;
  }
  if (section.path.startsWith("#")) return false;
  const href = `${base}${section.path}`;
  return pathname === href || (section.path === "" && pathname === base);
}

export function GalleryWorkspaceNav({ galleryId }: GalleryWorkspaceNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/galleries/${galleryId}`;

  // Pre-compute the active section so both the mobile dropdown and the
  // desktop chip strip render the same selection.
  const activeHref = (() => {
    const match = sections.find((s) => isActive(s, pathname, base));
    return match ? resolveHref(match, base) : "";
  })();

  return (
    <nav aria-label="Gallery workspace" className="surface-panel p-2">
      {/* Mobile (<sm): native <select> dropdown. Navigation uses
          router.push so the route change flows through the Next.js
          client router (no full-page reload). The Galleries option
          carries an absolute href so selecting it returns to the
          gallery list. */}
      <select
        value={activeHref}
        onChange={(event) => {
          const next = event.target.value;
          if (next) router.push(next);
        }}
        className="block w-full rounded-xl border border-border-default bg-surface-container px-3 py-2 text-sm font-semibold text-text-primary transition-colors focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30 sm:hidden"
        aria-label="Jump to gallery section"
      >
        {sections.map((section) => (
          <option key={section.label} value={resolveHref(section, base)}>
            {section.label}
          </option>
        ))}
      </select>

      {/* Desktop (sm+): pill chip strip. */}
      <div className="hidden min-w-max items-center gap-1 overflow-x-auto sm:flex">
        {sections.map((section) => {
          const href = resolveHref(section, base);
          const active = isActive(section, pathname, base);

          return (
            <Link
              key={section.label}
              href={href}
              className={cn(
                "rounded-full px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2",
                active
                  ? "bg-accent-primary text-text-inverse"
                  : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

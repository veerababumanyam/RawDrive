"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface GalleryWorkspaceNavProps {
  galleryId: string;
}

const sections = [
  { label: "Overview", path: "" },
  { label: "Photos", path: "#photos" },
  { label: "Albums", path: "#albums" },
  { label: "Cover & Design", path: "/cover" },
  { label: "Share", path: "#share" },
  { label: "Proofing", path: "/proofing" },
  { label: "Delivery", path: "#delivery" },
  { label: "Sales", path: "#sales" },
  { label: "Insights", path: "/analytics" },
  { label: "AI", path: "/ai" },
  { label: "Settings", path: "/settings" },
];

export function GalleryWorkspaceNav({ galleryId }: GalleryWorkspaceNavProps) {
  const pathname = usePathname();
  const base = `/galleries/${galleryId}`;

  return (
    <nav
      aria-label="Gallery workspace"
      className="surface-panel overflow-x-auto p-2"
    >
      <div className="flex min-w-max items-center gap-1">
        {sections.map((section) => {
          const href = `${base}${section.path}`;
          const pathOnly = href.split("#")[0];
          const active = !section.path.startsWith("#") && (pathname === pathOnly || (section.path === "" && pathname === base));

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

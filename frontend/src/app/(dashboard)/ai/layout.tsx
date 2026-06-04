"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const tabs = [
  { href: "/ai", label: "Overview" },
  { href: "/ai/search", label: "Search" },
  { href: "/ai/faces", label: "People" },
  { href: "/ai/duplicates", label: "Duplicates" },
  { href: "/ai/settings", label: "Settings" },
];
export default function AILayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      {" "}
      <div>
        {" "}
        <h1 className="text-2xl font-bold text-text-primary">AI Studio</h1>{" "}
        <p className="text-sm text-text-secondary mt-1">
          {" "}
          Intelligent tools for face detection, search, and photo curation{" "}
        </p>{" "}
      </div>{" "}
      <nav className="flex gap-1 rounded-xl bg-surface-sunken p-1">
        {" "}
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== "/ai" && pathname?.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors touch-min flex items-center ${isActive ? "bg-surface-raised text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
            >
              {" "}
              {tab.label}{" "}
            </Link>
          );
        })}{" "}
      </nav>{" "}
      <div>{children}</div>{" "}
    </div>
  );
}

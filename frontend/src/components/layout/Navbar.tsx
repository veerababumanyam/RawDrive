"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggleButton } from "@/components/theme/ThemeToggleButton";
import { IndianFlag } from "@/components/layout/IndianFlag";

const solutionsLinks = [
  { href: "/solutions/galleries", label: "Client Galleries" },
  { href: "/solutions/ai-intelligence", label: "AI Culling & FaceID" },
  { href: "/solutions/digital-invitations", label: "Digital Invitations" },
  { href: "/solutions/crm-contracts", label: "CRM & Contracts" },
  { href: "/solutions/live-streaming", label: "Live Streaming" },
  { href: "/solutions/scheduling", label: "Calendar & Scheduling" },
];

const marketplacesLinks = [
  { href: "/marketplaces/freelancer", label: "Freelancer Marketplace" },
  { href: "/marketplaces/rentals", label: "Camera Rentals" },
];

const companyLinks = [
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // Hero-overlay variant: on the landing page ("/"), the navbar floats over
  // a full-bleed photographic hero instead of sitting on a solid surface.
  // We apply a reduced-opacity glass backdrop (.landing-navbar-overlay in
  // globals.css) instead of .glass-surface, so the photo still shows
  // through at the top of the page AND the navbar stays clearly visible
  // once the visitor scrolls past the hero onto the content sections.
  // The theme toggle stays visible on the landing too — theme is now
  // synced to the OS preference across all routes (Q10 reversal).
  // Every other marketing route continues to render the default navbar,
  // bit-for-bit unchanged.
  const pathname = usePathname();
  const isHeroOverlay = pathname === "/";

  return (
    <header
      className={cn(
        "sticky top-0 z-[var(--z-sticky)]",
        isHeroOverlay ? "landing-navbar-overlay" : "glass-surface",
      )}
      style={{ height: "var(--navbar-height)" }}
      data-variant={isHeroOverlay ? "hero-overlay" : "default"}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 lg:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2 text-xl font-bold text-text-primary"
          aria-label="RawDrive home"
        >
          <Image
            src="/logo/android-chrome-192x192.png"
            alt="RawDrive Logo"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg"
          />
          RawDrive
          {/* Patriotic flourish — decorative only, kept tight against the
              wordmark so it reads as part of the brand identity. */}
          <IndianFlag className="ml-1 self-center group-hover:scale-[1.08]" />
        </Link>

        <nav className="hidden h-full items-center gap-6 lg:flex" aria-label="Main navigation">
          <div
            className="group relative flex h-full items-center"
            onMouseEnter={() => setOpenDropdown("solutions")}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button className="flex items-center gap-1 text-sm font-medium text-text-secondary transition-colors hover:text-accent group-hover:text-accent">
              Products & Solutions <ChevronDown className="h-4 w-4" />
            </button>
            {openDropdown === "solutions" && (
              <div className="surface-panel absolute left-0 top-full w-56 p-2">
                {solutionsLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div
            className="group relative flex h-full items-center"
            onMouseEnter={() => setOpenDropdown("marketplaces")}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button className="flex items-center gap-1 text-sm font-medium text-text-secondary transition-colors hover:text-accent group-hover:text-accent">
              Marketplaces <ChevronDown className="h-4 w-4" />
            </button>
            {openDropdown === "marketplaces" && (
              <div className="surface-panel absolute left-0 top-full w-48 p-2">
                {marketplacesLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/dealership"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-accent"
          >
            Partner Program
          </Link>

          <Link
            href="/pricing"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-accent"
          >
            Pricing
          </Link>

          <div
            className="group relative flex h-full items-center"
            onMouseEnter={() => setOpenDropdown("company")}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button className="flex items-center gap-1 text-sm font-medium text-text-secondary transition-colors hover:text-accent group-hover:text-accent">
              Company <ChevronDown className="h-4 w-4" />
            </button>
            {openDropdown === "company" && (
              <div className="surface-panel absolute left-0 top-full w-40 p-2">
                {companyLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <ThemeToggleButton />

          <Link
            href="/login"
            className="inline-flex items-center text-sm font-medium text-text-secondary transition-colors hover:text-accent"
            style={{ minHeight: "var(--touch-target-min)" }}
          >
            Login
          </Link>
          <Link
            href="/register"
            className="btn-primary px-4 py-2 text-sm font-semibold"
            style={{ minHeight: "var(--touch-target-min)" }}
          >
            Get Started
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggleButton />

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:text-accent"
            style={{ minWidth: "var(--touch-target-min)", minHeight: "var(--touch-target-min)" }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "glass-surface absolute left-0 right-0 top-full overflow-y-auto border-t border-border lg:hidden",
          "transition-all",
          mobileMenuOpen ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0",
        )}
        style={{ transitionDuration: "var(--duration-normal)" }}
      >
        <nav className="flex flex-col gap-1 px-4 py-4" aria-label="Mobile navigation">
          <div className="py-2">
            <p className="px-3 text-xs font-bold uppercase tracking-wider text-text-tertiary">
              Products
            </p>
            {solutionsLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="soft-divider my-1" />

          <div className="py-2">
            <p className="px-3 text-xs font-bold uppercase tracking-wider text-text-tertiary">
              Marketplaces
            </p>
            {marketplacesLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="soft-divider my-1" />

          <Link
            href="/dealership"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            onClick={() => setMobileMenuOpen(false)}
          >
            Partner Program
          </Link>
          <Link
            href="/pricing"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            onClick={() => setMobileMenuOpen(false)}
          >
            Pricing
          </Link>

          <div className="soft-divider my-1" />

          <div className="py-2">
            <p className="px-3 text-xs font-bold uppercase tracking-wider text-text-tertiary">
              Company
            </p>
            {companyLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/login"
              className="rounded-lg bg-surface-container-low px-3 py-3 text-center text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-high"
              onClick={() => setMobileMenuOpen(false)}
            >
              Login
            </Link>
            <Link
              href="/register"
              className="btn-primary px-4 py-3 text-center text-sm font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      className="glass-surface sticky top-0 z-[var(--z-sticky)]"
      style={{ height: "var(--navbar-height)" }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="text-xl font-bold text-text-primary"
          aria-label="RawDrive home"
        >
          RawDrive
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-secondary transition-colors hover:text-accent"
              style={{ transitionDuration: "var(--duration-fast)" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-accent"
            style={{
              transitionDuration: "var(--duration-fast)",
              minHeight: "var(--touch-target-min)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Login
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover active:bg-accent-active"
            style={{
              transitionDuration: "var(--duration-fast)",
              minHeight: "var(--touch-target-min)",
            }}
          >
            Get Started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg p-2 text-text-secondary transition-colors hover:text-accent md:hidden"
          style={{ minWidth: "var(--touch-target-min)", minHeight: "var(--touch-target-min)" }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "glass-surface absolute left-0 right-0 top-full border-t border-border md:hidden",
          "transition-all overflow-hidden",
          mobileMenuOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        )}
        style={{ transitionDuration: "var(--duration-normal)" }}
      >
        <nav className="flex flex-col gap-1 px-4 py-4" aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-accent-subtle hover:text-accent"
              style={{ minHeight: "var(--touch-target-min)" }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-lg px-3 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-accent-subtle hover:text-accent"
            style={{ minHeight: "var(--touch-target-min)" }}
            onClick={() => setMobileMenuOpen(false)}
          >
            Login
          </Link>
          <Link
            href="/register"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
            style={{ minHeight: "var(--touch-target-min)" }}
            onClick={() => setMobileMenuOpen(false)}
          >
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";

const solutionsLinks = [
  { href: "/solutions/galleries", label: "Client Galleries" },
  { href: "/solutions/ai-intelligence", label: "AI & FaceID" },
  { href: "/solutions/digital-invitations", label: "Digital Invitations" },
  { href: "/solutions/crm-contracts", label: "CRM & Contracts" },
  { href: "/solutions/live-streaming", label: "Live Streaming" },
  { href: "/solutions/scheduling", label: "Scheduling" },
];

const marketplacesLinks = [
  { href: "/marketplaces/freelancer", label: "Freelancer Marketplace" },
  { href: "/marketplaces/rentals", label: "Camera Rentals" },
];

const companyLinks = [
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refund", label: "Refund Policy" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-elevated">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-text-primary">
              <Image src="/logo/android-chrome-192x192.png" alt="RawDrive Logo" width={32} height={32} className="h-8 w-8 rounded-lg" />
              RawDrive
            </Link>
            <p className="mt-3 max-w-xs text-sm text-text-secondary">
              The Operating System for Photography Businesses in India.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-text-tertiary">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-3 py-1 text-accent font-medium">
                Made with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> in India
              </span>
            </div>
          </div>

          {/* Solutions & Product */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Products</h3>
            <ul className="mt-3 space-y-2">
              {solutionsLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary transition-colors hover:text-accent"
                    style={{ transitionDuration: "var(--duration-fast)" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/pricing"
                  className="text-sm text-text-secondary transition-colors hover:text-accent"
                >
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Marketplaces & Deals */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Network</h3>
            <ul className="mt-3 space-y-2">
              {marketplacesLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary transition-colors hover:text-accent"
                    style={{ transitionDuration: "var(--duration-fast)" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/dealership"
                  className="text-sm text-text-secondary transition-colors hover:text-accent"
                >
                  Partner Program
                </Link>
              </li>
            </ul>
          </div>

          {/* Company & Legal */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Company</h3>
            <ul className="mt-3 mb-6 space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary transition-colors hover:text-accent"
                    style={{ transitionDuration: "var(--duration-fast)" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <h3 className="text-sm font-semibold text-text-primary">Legal</h3>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary transition-colors hover:text-accent"
                    style={{ transitionDuration: "var(--duration-fast)" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border-subtle pt-6 text-sm text-text-tertiary sm:flex-row">
          <div>&copy; {new Date().getFullYear()} RawDrive. All rights reserved.</div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-text-secondary">Powered By</span>
            <a
              href="https://cobolt.pro/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-transform hover:scale-105"
            >
              <Image
                src="/CoBolt/CoBolt_Name_Logo.png"
                alt="CoBolt Logo"
                width={140}
                height={35}
                className="h-8 w-auto md:h-9"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import Image from "next/image";

const solutionsLinks = [
  { href: "/solutions/galleries", label: "Client Galleries" },
  { href: "/solutions/ai-intelligence", label: "AI & FaceID" },
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
  { href: "/legal", label: "Legal Notice" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refund", label: "Refund Policy" },
];

const contactLinks = [
  { href: "mailto:infor@rawdrive.in", label: "infor@rawdrive.in" },
  { href: "mailto:support@rawdrive.in", label: "support@rawdrive.in" },
  { href: "mailto:contactus@rawdrive.in", label: "contactus@rawdrive.in" },
  { href: "tel:+91928112993", label: "contact:+91 928112993 ,+91 9010012299", type: "phone" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-elevated">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="flex items-center gap-2.5"
              aria-label="RawDrive home"
            >
              <Image
                src="/logo/android-chrome-192x192.png"
                alt="RawDrive Logo"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-xl object-cover"
              />
              <div>
                <div className="text-lg font-bold leading-none text-text-primary">
                  RawDrive
                </div>
                <div className="mt-0.5 text-xs text-text-tertiary">Built in India</div>
              </div>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-text-secondary">
              Studio operations, client galleries, proofing, AI workflows, scheduling, and
              delivery in one photography-first workspace.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-text-tertiary">
              {contactLinks.map((link) => (
                <li key={link.href} className="flex items-center gap-2">
                  {link.type === "phone" ? (
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.89.66 2.78a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.29-1.22a2 2 0 0 1 2.11-.45c.89.31 1.82.53 2.78.66A2 2 0 0 1 22 16.92z" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m2 7 10 7 10-7" />
                    </svg>
                  )}
                  <a href={link.href} className="hover:text-accent transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
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

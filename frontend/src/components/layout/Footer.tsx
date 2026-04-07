import Link from "next/link";
import { Heart } from "lucide-react";

const productLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
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
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Link href="/" className="text-xl font-bold text-text-primary">
              RawDrive
            </Link>
            <p className="mt-3 text-sm text-text-secondary">
              The Operating System for Photography Businesses in India.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-text-tertiary">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-3 py-1 text-accent font-medium">
                Made with <Heart className="h-3 w-3 fill-current" /> in India
              </span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Product</h3>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
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

          {/* Legal */}
          <div>
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

          {/* Social */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Connect</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="#"
                  className="text-sm text-text-secondary transition-colors hover:text-accent"
                  style={{ transitionDuration: "var(--duration-fast)" }}
                  aria-label="Instagram"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm text-text-secondary transition-colors hover:text-accent"
                  style={{ transitionDuration: "var(--duration-fast)" }}
                  aria-label="Twitter"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm text-text-secondary transition-colors hover:text-accent"
                  style={{ transitionDuration: "var(--duration-fast)" }}
                  aria-label="YouTube"
                >
                  YouTube
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm text-text-secondary transition-colors hover:text-accent"
                  style={{ transitionDuration: "var(--duration-fast)" }}
                  aria-label="LinkedIn"
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border-subtle pt-6 text-center text-xs text-text-tertiary">
          &copy; {new Date().getFullYear()} RawDrive. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

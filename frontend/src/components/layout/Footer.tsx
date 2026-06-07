import Link from "next/link";
import Image from "next/image";
import { Envelope, Phone } from "@/components/icons";
import { SafeEmailLink } from "@/components/marketing/SafeEmailLink";
import {
  RAWDRIVE_CONTACT_EMAILS,
  type RawDriveContactEmail,
} from "@/lib/contact-email";

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

const footerLinkGroups = [
  {
    title: "Products",
    links: [...solutionsLinks, { href: "/pricing", label: "Pricing" }],
    dense: true,
  },
  {
    title: "Network",
    links: [
      ...marketplacesLinks,
      { href: "/dealership", label: "Partner Program" },
    ],
  },
  {
    title: "Company & Legal",
    links: [...companyLinks, ...legalLinks],
    dense: true,
  },
];

type FooterContactLink =
  | {
      type: "email";
      email: RawDriveContactEmail;
      label: string;
    }
  | {
      type: "phone";
      href: string;
      label: string;
    };

const contactLinks: FooterContactLink[] = [
  {
    type: "email",
    email: RAWDRIVE_CONTACT_EMAILS.info,
    label: "Product information",
  },
  {
    type: "email",
    email: RAWDRIVE_CONTACT_EMAILS.support,
    label: "Support",
  },
  {
    type: "email",
    email: RAWDRIVE_CONTACT_EMAILS.contactus,
    label: "General contact",
  },
  {
    href: "tel:+91928112993",
    label: "+91 92811 2993",
    type: "phone",
  },
  {
    href: "tel:+919010012299",
    label: "+91 90100 12299",
    type: "phone",
  },
];

type FooterLink = {
  href: string;
  label: string;
};

function FooterLinkGroup({
  title,
  links,
  dense = false,
}: {
  title: string;
  links: FooterLink[];
  dense?: boolean;
}) {
  const headingId = `footer-${title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")}`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="site-footer__heading">
        {title}
      </h2>
      <ul
        className={
          dense
            ? "site-footer__link-list site-footer__link-list--dense"
            : "site-footer__link-list"
        }
      >
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="site-footer__link">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <section className="site-footer__brand" aria-label="RawDrive contact">
            <Link
              href="/"
              className="site-footer__brand-link touch-target-link"
              aria-label="RawDrive home"
            >
              <Image
                src="/logo/android-chrome-192x192.png"
                alt="RawDrive Logo"
                width={32}
                height={32}
                className="site-footer__brand-logo"
              />
              <div>
                <span className="site-footer__brand-name">RawDrive</span>
                <span className="site-footer__brand-origin">
                  Built in India
                </span>
              </div>
            </Link>
            <p className="site-footer__summary">
              Studio operations, client galleries, proofing, AI workflows,
              scheduling, and delivery in one photography-first workspace.
            </p>
            <ul className="site-footer__contact-list">
              {contactLinks.map((link) => (
                <li key={link.type === "phone" ? link.href : link.label}>
                  {link.type === "phone" ? (
                    <a href={link.href} className="site-footer__contact-link">
                      <Phone
                        className="site-footer__contact-icon"
                        aria-hidden="true"
                      />
                      <span className="site-footer__contact-label">
                        {link.label}
                      </span>
                    </a>
                  ) : (
                    <SafeEmailLink
                      localPart={link.email.localPart}
                      domain={link.email.domain}
                      className="site-footer__contact-link"
                      ariaLabel={`Email ${link.label}`}
                    >
                      {(display) => (
                        <>
                          <Envelope
                            className="site-footer__contact-icon"
                            aria-hidden="true"
                          />
                          <span className="site-footer__contact-label">
                            {display}
                          </span>
                        </>
                      )}
                    </SafeEmailLink>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <nav
            className="site-footer__navigation"
            aria-label="Footer navigation"
          >
            {footerLinkGroups.map((group) => (
              <FooterLinkGroup
                key={group.title}
                title={group.title}
                links={group.links}
                dense={group.dense}
              />
            ))}
          </nav>
        </div>

        <div className="site-footer__meta">
          <p className="site-footer__copyright">
            &copy; {new Date().getFullYear()} RawDrive. All rights reserved.
          </p>
          <a
            href="https://cobolt.pro/"
            target="_blank"
            rel="noopener noreferrer"
            className="site-footer__partner-link"
            aria-label="Powered by CoBolt"
          >
            <span>Powered by</span>
            <Image
              src="/CoBolt/CoBolt_Name_Logo.png"
              alt="CoBolt Logo"
              width={112}
              height={28}
              className="site-footer__partner-logo"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}

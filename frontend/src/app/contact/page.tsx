import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import {
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { SafeEmailLink } from "@/components/marketing/SafeEmailLink";
import {
  RAWDRIVE_CONTACT_EMAILS,
  type RawDriveContactEmail,
} from "@/lib/contact-email";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("contact");

type ContactCard = {
  icon: LucideIcon;
  title: string;
  // Single-destination cards (email, location) carry copy + href and render as
  // one Link. The phone card instead carries `phones` and renders each number
  // as its own tel: link, so the displayed numbers and the dialled numbers can
  // never diverge.
  copy?: string;
  email?: RawDriveContactEmail;
  href?: string;
  phones?: { display: string; href: string }[];
};

const contactCards: ContactCard[] = [
  {
    icon: Mail,
    title: "Sales & Partnerships",
    email: RAWDRIVE_CONTACT_EMAILS.info,
  },
  {
    icon: MessageSquareText,
    title: "Product Support",
    email: RAWDRIVE_CONTACT_EMAILS.support,
  },
  {
    icon: Mail,
    title: "General Contact",
    email: RAWDRIVE_CONTACT_EMAILS.contactus,
  },
  {
    icon: Phone,
    title: "Phone & WhatsApp",
    phones: [
      { display: "+91 92811 2993", href: "tel:+91928112993" },
      { display: "+91 90100 12299", href: "tel:+919010012299" },
    ],
  },
  {
    icon: MapPin,
    title: "Studio Operations",
    copy: "Mumbai, Bengaluru, Delhi NCR",
    href: "/about",
  },
];

export default function ContactPage() {
  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            Contact RawDrive
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold tracking-[-0.03em] text-text-primary md:text-6xl">
              Reach the team behind your studio&apos;s next operating system.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              We can help with onboarding, partnerships, demos, support, and
              rollout planning for your photography business.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {contactCards.map((card) => {
              const Icon = card.icon;
              const head = (
                <>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-5 font-headline text-xl font-bold text-text-primary">
                    {card.title}
                  </h2>
                </>
              );

              // Phone card: a container (not a Link) holding one tel: anchor per
              // number — nesting anchors inside a Link would be invalid markup.
              if (card.phones) {
                return (
                  <div key={card.title} className="surface-panel p-5">
                    {head}
                    <div className="mt-2 space-y-1">
                      {card.phones.map((phone) => (
                        <a
                          key={phone.href}
                          href={phone.href}
                          className="block text-sm leading-7 text-text-secondary transition-colors hover:text-accent"
                        >
                          {phone.display}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              }

              if (card.email) {
                return (
                  <SafeEmailLink
                    key={card.title}
                    localPart={card.email.localPart}
                    domain={card.email.domain}
                    className="surface-panel p-5 transition-colors hover:bg-surface-container-high"
                    ariaLabel={`Email RawDrive ${card.title}`}
                  >
                    {(display) => (
                      <>
                        {head}
                        <p className="mt-2 text-sm leading-7 text-text-secondary">
                          {display}
                        </p>
                      </>
                    )}
                  </SafeEmailLink>
                );
              }

              return (
                <Link
                  key={card.title}
                  href={card.href ?? "#"}
                  className="surface-panel p-5 transition-colors hover:bg-surface-container-high"
                >
                  {head}
                  <p className="mt-2 text-sm leading-7 text-text-secondary">
                    {card.copy}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <Image
                src="/marketing/rawdrive-company-network.avif"
                alt="RawDrive contact page preview for studio support and sales"
                width={1600}
                height={1000}
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="h-auto w-full object-cover"
              />
            </div>
          </div>

          <div className="surface-panel p-8">
            <h2 className="font-headline text-2xl font-bold text-text-primary">
              Fastest way to get a reply
            </h2>
            <p className="mt-3 leading-7 text-text-secondary">
              For live projects, send us your studio name, city, and the
              workflow you want help with. We&apos;ll route you to the right
              team faster.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <SafeEmailLink
                localPart={RAWDRIVE_CONTACT_EMAILS.contactus.localPart}
                domain={RAWDRIVE_CONTACT_EMAILS.contactus.domain}
                className="btn-primary px-6 py-3 text-sm font-semibold"
                ariaLabel="Email the RawDrive team"
              >
                Email the team
              </SafeEmailLink>
              <Link
                href="/pricing"
                className="btn-tertiary border border-border px-6 py-3 text-sm font-semibold"
              >
                Explore pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

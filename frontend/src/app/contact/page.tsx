import Link from "next/link";
import type { Metadata } from "next";
import { Mail, MapPin, MessageSquareText, Phone } from "lucide-react";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("contact");

const contactCards = [
  {
    icon: Mail,
    title: "Sales & Partnerships",
    copy: "infor@rawdrive.in",
    href: "mailto:infor@rawdrive.in",
  },
  {
    icon: MessageSquareText,
    title: "Product Support",
    copy: "support@rawdrive.in",
    href: "mailto:support@rawdrive.in",
  },
  {
    icon: Mail,
    title: "General Contact",
    copy: "contactus@rawdrive.in",
    href: "mailto:contactus@rawdrive.in",
  },
  {
    icon: Phone,
    title: "Phone & WhatsApp",
    copy: "contact:+91 928112993 ,+91 9010012299",
    href: "tel:+91928112993",
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
              We can help with onboarding, partnerships, demos, support, and rollout planning for
              your photography business.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {contactCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="surface-panel p-5 transition-colors hover:bg-surface-container-high"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
                  <card.icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 font-headline text-xl font-bold text-text-primary">
                  {card.title}
                </h2>
                <p className="mt-2 text-sm leading-7 text-text-secondary">{card.copy}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <img
                src="/stitch/contact.png"
                alt="RawDrive contact page preview for studio support and sales"
                className="h-auto w-full object-cover"
              />
            </div>
          </div>

          <div className="surface-panel p-8">
            <h2 className="font-headline text-2xl font-bold text-text-primary">
              Fastest way to get a reply
            </h2>
            <p className="mt-3 leading-7 text-text-secondary">
              For live projects, send us your studio name, city, and the workflow you want help
              with. We&apos;ll route you to the right team faster.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="mailto:contactus@rawdrive.in"
                className="btn-primary px-6 py-3 text-sm font-semibold"
              >
                Email the team
              </Link>
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

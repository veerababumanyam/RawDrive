import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { Banknote, BadgeCheck, MapPinned, Sparkles } from "lucide-react";
import { DealerApplicationButton } from "@/components/DealerApplicationButton";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("dealership");

const dealerBenefits = [
  {
    icon: MapPinned,
    title: "Own a territory",
    description:
      "Take responsibility for a city or state cluster and build a trusted RawDrive presence there.",
  },
  {
    icon: BadgeCheck,
    title: "Structured onboarding",
    description:
      "Use a cleaner, guided registration path instead of disconnected spreadsheets and manual follow-ups.",
  },
  {
    icon: Banknote,
    title: "Recurring earnings",
    description:
      "Earn from successful activations, renewals, and long-tail studio relationships in your region.",
  },
];

export default function DealershipPage() {
  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            Dealer Portal
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold tracking-[-0.03em] text-text-primary md:text-6xl">
              Become the local growth engine for RawDrive in your market.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              Help studios in your region adopt RawDrive, support onboarding,
              and build recurring relationships around gallery delivery, CRM, AI
              workflows, and marketplace growth.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {dealerBenefits.map((benefit) => (
              <article key={benefit.title} className="surface-panel p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
                  <benefit.icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 font-headline text-xl font-bold text-text-primary">
                  {benefit.title}
                </h2>
                <p className="mt-2 text-sm leading-7 text-text-secondary">
                  {benefit.description}
                </p>
              </article>
            ))}
          </div>

          <div className="glass-card p-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-subtle px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
              <Sparkles className="h-4 w-4" />
              Registration flow
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {["Business details", "Tax and legal", "Banking and payout"].map(
                (step, index) => (
                  <div key={step} className="surface-panel p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-text-tertiary">
                      Step {index + 1}
                    </p>
                    <p className="mt-3 font-headline text-lg font-bold text-text-primary">
                      {step}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <DealerApplicationButton />
            <Link
              href="/contact"
              className="btn-tertiary border border-border px-6 py-3 text-sm font-semibold"
            >
              Talk to partnerships
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-8 top-10 h-48 rounded-full bg-accent-muted blur-[120px]" />
          <div className="glass-card relative overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <Image
                src="/marketing/rawdrive-company-network.avif"
                alt="RawDrive partner dealership registration preview"
                width={1600}
                height={1000}
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

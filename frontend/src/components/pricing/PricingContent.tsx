"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Tag } from "lucide-react";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";
import type { PlanCatalogPlan } from "@/lib/plans";

const faqItems = [
  {
    q: "Is Starter a trial?",
    a: "No. Starter is free forever with 5GB storage, 1 event, limited AI face search, watermarked galleries, and no photo selling.",
  },
  {
    q: "How does Pay Per Event work?",
    a: "Pay Per Event is for one delivery cycle: a 7-day upload window, 30 days of client access, and 90 days of storage retention without a monthly subscription.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can move from Starter or Pay Per Event to a monthly plan when your event volume grows.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept UPI, credit/debit cards, net banking, and wallets through the configured payment provider. Elite Studio can be handled through sales-assisted billing.",
  },
  {
    q: "Is GST included in the pricing?",
    a: "Prices are shown in INR and are exclusive of GST. The checkout shows the final payable amount before confirmation.",
  },
  {
    q: "What is the wedding bundle?",
    a: "The wedding bundle is Rs. 499 per wedding for multi-day events and larger galleries.",
  },
  {
    q: "Can I extend a Pay Per Event gallery?",
    a: "Yes. Extension packs add 30 days, 90 days, or a permanent archive for galleries that need more time.",
  },
  {
    q: "Is my data stored in India?",
    a: "Yes, all data is stored in Indian data centers (Mumbai region) and is DPDPA compliant.",
  },
];

function formatPrice(price: number): string {
  if (price === -1) return "Custom";
  if (price === 0) return "Rs. 0";
  return `Rs. ${price.toLocaleString("en-IN")}`;
}

function monthlyEquivalent(plan: PlanCatalogPlan): number {
  if (!plan.annualPrice) return plan.monthlyPrice;
  return Math.round(plan.annualPrice / 12);
}

function annualNote(plan: PlanCatalogPlan): string {
  if (!plan.annualPrice) return "";
  return `Billed ${formatPrice(plan.annualPrice)}/year`;
}

export function PricingContent() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [coupon, setCoupon] = useState("");
  const { plans } = usePlanCatalog();
  const activePlans = plans
    .filter((plan) => plan.active)
    .sort((a, b) => a.rank - b.rank);
  const payPerEventPlan = activePlans.find(
    (plan) => plan.id === "pay_per_event",
  );
  const starterPlan = activePlans.find((plan) => plan.id === "free");
  const subscriptionPlans = activePlans.filter(
    (plan) =>
      plan.paid && plan.id !== "pay_per_event" && plan.id !== "free",
  );

  const eventAddOns = [
    {
      price: "Rs. 49",
      title: "Extend +30 days",
      description: "Keep a gallery live for another month.",
    },
    {
      price: "Rs. 99",
      title: "Extend +90 days",
      description: "A full extra quarter of client access.",
    },
    {
      price: "Rs. 199",
      title: "Archive forever",
      description: "Download plus permanent archive of the event.",
    },
  ];

  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            Pricing
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold text-text-primary md:text-6xl">
              Pricing built for real photographer workflows.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              Upload, share, let clients select, and move on. Pay per event, or
              choose a monthly plan when you scale.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Event-first delivery",
                body: "Pay Per Event is built for occasional shoots and one-off delivery cycles without a recurring subscription.",
              },
              {
                title: "Working photographers",
                body: "Creator and Pro Photographer add AI face search, client selection, WhatsApp delivery, branding, and photo selling.",
              },
              {
                title: "Studios and branches",
                body: "Studio and Elite Studio add team access, custom domains, analytics, API access, white-label options, and premium support.",
              },
            ].map((item) => (
              <div key={item.title} className="surface-panel p-5">
                <h2 className="font-headline text-xl font-bold text-text-primary">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-text-secondary">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <div className="surface-panel inline-flex max-w-max items-center gap-3 px-4 py-3">
            <span
              className={`text-sm font-medium ${!isAnnual ? "text-text-primary" : "text-text-tertiary"}`}
            >
              Monthly
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isAnnual}
              aria-label="Toggle annual billing"
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors"
              style={{
                backgroundColor: isAnnual
                  ? "var(--accent-default)"
                  : "var(--surface-sunken)",
                transitionDuration: "var(--duration-fast)",
                minHeight: "var(--touch-target-min)",
                minWidth: "var(--touch-target-min)",
              }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-surface-elevated shadow-sm transition-transform"
                style={{
                  transform: isAnnual ? "translateX(22px)" : "translateX(3px)",
                  transitionDuration: "var(--duration-fast)",
                }}
              />
            </button>
            <span
              className={`text-sm font-medium ${isAnnual ? "text-text-primary" : "text-text-tertiary"}`}
            >
              Annual <span className="text-accent">(2 months free)</span>
            </span>
          </div>
        </div>
      </section>

      {payPerEventPlan && (
        <section className="px-4 pb-10 lg:px-8">
          <div className="surface-panel mx-auto max-w-7xl p-6 lg:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-4">
                <span className="inline-flex rounded-full border border-border bg-surface-sunken px-3 py-1 text-xs font-bold uppercase text-accent">
                  No subscription
                </span>
                <div className="space-y-2">
                  <h2 className="font-headline text-2xl font-bold text-text-primary">
                    {payPerEventPlan.name} - Delivery Cycle
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                    The way many photographers actually work. One clean price
                    per event, no monthly commitment.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "7 days upload window",
                    "30 days client access",
                    "90 days storage retention",
                  ].map((item) => (
                    <span
                      key={item}
                      className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-xs font-medium text-text-secondary"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-text-secondary">
                  Wedding bundle:{" "}
                  <span className="font-semibold text-accent">
                    Rs. 499 per wedding
                  </span>{" "}
                  for multi-day, larger galleries.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-4 sm:flex-row lg:flex-col">
                <div>
                  <p className="text-4xl font-extrabold text-text-primary">
                    {formatPrice(payPerEventPlan.monthlyPrice)}
                  </p>
                  <p className="text-sm font-medium text-text-secondary">
                    / event
                  </p>
                </div>
                <Link
                  href="/register?plan=free"
                  className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
                  style={{
                    minHeight: "var(--touch-target-min)",
                    transitionDuration: "var(--duration-fast)",
                  }}
                >
                  Create account
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="px-4 pb-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {subscriptionPlans.map((plan) => {
            const displayedPrice = isAnnual
              ? monthlyEquivalent(plan)
              : plan.monthlyPrice;
            const ctaHref = plan.selfServe
              ? `/register?plan=${encodeURIComponent(plan.id)}&interval=${isAnnual ? "annual" : "monthly"}`
              : "/contact";
            const ctaLabel =
              plan.id === "elite_studio"
                ? "Talk to sales"
                : plan.id === "pro_photographer"
                  ? "Go Pro"
                  : `Start ${plan.name}`;

            return (
              <div
                key={plan.id}
                data-plan={plan.id}
                className={`relative flex flex-col rounded-xl border p-6 shadow-glass ${
                  plan.popular
                    ? "border-accent bg-accent-subtle"
                    : "border-border bg-surface-elevated"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-text-inverse">
                    Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-text-primary">
                  {plan.name}
                </h3>
                <p className="mt-3 text-3xl font-bold text-text-primary">
                  {formatPrice(displayedPrice)}
                </p>
                <p className="text-sm font-medium text-text-secondary">
                  / month
                </p>
                <p className="mt-2 min-h-4 text-xs font-semibold text-accent">
                  {isAnnual ? annualNote(plan) : ""}
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={ctaHref}
                  className={`mt-6 inline-flex items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                    plan.popular
                      ? "bg-accent text-text-inverse hover:bg-accent-hover"
                      : "border border-border bg-surface-elevated text-text-primary hover:bg-accent-subtle hover:text-accent"
                  }`}
                  style={{
                    minHeight: "var(--touch-target-min)",
                    transitionDuration: "var(--duration-fast)",
                  }}
                >
                  {ctaLabel}
                </Link>
              </div>
            );
          })}
        </div>

        {starterPlan && (
          <div className="surface-panel mx-auto mt-6 flex max-w-7xl flex-col gap-4 border-dashed p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <h2 className="font-headline text-xl font-bold text-text-primary">
                {starterPlan.name} - Free forever
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                A beginner-friendly gallery plan: 5GB, 1 event, limited AI face
                search, watermarked galleries, and no photo selling.
              </p>
            </div>
            <Link
              href="/register?plan=free"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-accent-subtle hover:text-accent"
              style={{
                minHeight: "var(--touch-target-min)",
                transitionDuration: "var(--duration-fast)",
              }}
            >
              Create free account
            </Link>
          </div>
        )}
      </section>

      <section className="px-4 pb-16 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6 text-center">
          <div className="space-y-2">
            <h2 className="font-headline text-2xl font-bold text-text-primary">
              Add-ons and extension packs
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-text-secondary">
              For Pay Per Event galleries that need more time, keep delivery
              moving without changing the studio plan.
            </p>
          </div>
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
            {eventAddOns.map((addon) => (
              <div key={addon.title} className="surface-panel p-5">
                <p className="text-2xl font-extrabold text-accent">
                  {addon.price}
                </p>
                <h3 className="mt-2 font-semibold text-text-primary">
                  {addon.title}
                </h3>
                <p className="mt-2 text-xs leading-6 text-text-secondary">
                  {addon.description}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-tertiary">
            All prices are in INR and exclusive of GST. Annual plans are billed
            at 10 months for 12 months of access.
          </p>
        </div>
      </section>

      {/* Coupon Code */}
      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-md text-center">
          <h2 className="mb-4 text-xl font-bold text-text-primary">
            <Tag
              className="mr-2 inline-block h-5 w-5 text-accent"
              aria-hidden="true"
            />
            Have a Coupon Code?
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder="Enter coupon code"
              className="flex-1 rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
              style={{ height: "var(--touch-target-min)" }}
              aria-label="Coupon code"
            />
            <button
              type="button"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
              style={{
                minHeight: "var(--touch-target-min)",
                transitionDuration: "var(--duration-fast)",
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-surface-sunken px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-text-primary">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-surface-elevated shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-4 py-4 text-left text-sm font-medium text-text-primary"
                  aria-expanded={openFaq === i}
                  style={{ minHeight: "var(--touch-target-min)" }}
                >
                  {item.q}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                    style={{ transitionDuration: "var(--duration-fast)" }}
                    aria-hidden="true"
                  />
                </button>
                <div
                  className="grid"
                  style={{
                    gridTemplateRows: openFaq === i ? "1fr" : "0fr",
                    transition: "grid-template-rows var(--duration-normal)",
                  }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="px-4 pb-4 text-sm text-text-secondary">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

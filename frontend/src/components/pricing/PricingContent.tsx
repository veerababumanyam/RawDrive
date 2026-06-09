"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Tag } from "lucide-react";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";
import { type PlanCatalogPlan } from "@/lib/plans";

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

const subscriptionSummaries: Record<string, string> = {
  free: "Hook beginners with a free starter gallery. Goal: get users to upgrade later.",
  creator: "Side & weekend photographers getting started.",
  pro_photographer: "The main money plan for working pros.",
  studio: "Studios with a team and a brand to protect.",
  elite_studio: "High-end & multi-branch studios.",
};

function subscriptionPlanLabel(plan: PlanCatalogPlan): string {
  if (plan.id === "free") return "Free forever";
  if (!plan.selfServe) return "Sales assisted";
  if (plan.galleries === -1) return "Unlimited events";
  if (plan.galleries > 0) return `${plan.galleries} events / month`;
  return plan.storage;
}

function featuredPlanLabel(plan: PlanCatalogPlan): string {
  if (plan.popular) return "Best Value";
  return "";
}

export function PricingContent() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [coupon, setCoupon] = useState("");
  const { plans } = usePlanCatalog();
  const activePlans = plans
    .filter((plan) => plan.active && plan.id !== "pay_per_event")
    .sort((a, b) => a.rank - b.rank);
  const subscriptionPlans = activePlans.filter(
    (plan) => plan.id === "free" || plan.paid,
  );

  const faqItems = [
    {
      q: "What is included in Starter?",
      a: "Starter is free with 1GB storage, 1 event, limited AI face search, watermarked galleries, and no selling.",
    },
    {
      q: "Can I switch plans later?",
      a: "Yes. You can move from Starter to a monthly plan when your event volume grows.",
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
      q: "Is my data stored in India?",
      a: "Yes, all data is stored in Indian data centers (Mumbai region) and is DPDPA compliant.",
    },
  ];

  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase text-accent">
            Pricing
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold text-text-primary md:text-6xl">
              Pricing built for real photographer workflows.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              Upload, share, let clients select, and move on with monthly plans
              built for recurring photography delivery.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Creator workflows",
                body: "Creator helps photographers manage active galleries, AI face search, client selection, and branded delivery in one subscription.",
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
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full border border-border bg-surface-sunken px-3 py-1 text-xs font-bold uppercase text-accent">
                Subscription plans
              </span>
              <div className="space-y-2">
                <h2 className="font-headline text-2xl font-bold text-text-primary">
                  Monthly subscriptions
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                  Predictable plans for photographers and studios with recurring
                  events, client selection, AI face search, branding, and sales
                  workflows in one place.
                </p>
              </div>
            </div>

            <div className="surface-panel inline-flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:w-auto sm:justify-start">
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
                className="touch-min inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors"
                style={{
                  minWidth: "var(--touch-target-min)",
                  transitionDuration: "var(--duration-fast)",
                }}
              >
                <span
                  className="flex h-7 w-12 items-center rounded-full border border-border transition-colors"
                  style={{
                    backgroundColor: isAnnual
                      ? "var(--accent-default)"
                      : "var(--surface-sunken)",
                    transitionDuration: "var(--duration-fast)",
                  }}
                >
                  <span
                    className="inline-block h-5 w-5 rounded-full bg-surface-elevated shadow-sm transition-transform"
                    style={{
                      transform: isAnnual
                        ? "translateX(var(--space-5))"
                        : "translateX(var(--space-1))",
                      transitionDuration: "var(--duration-fast)",
                    }}
                  />
                </span>
              </button>
              <span
                className={`text-sm font-medium ${isAnnual ? "text-text-primary" : "text-text-tertiary"}`}
              >
                Annual <span className="text-accent">(2 months free)</span>
              </span>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
            {subscriptionPlans.map((plan) => {
              const displayedPrice = isAnnual
                ? monthlyEquivalent(plan)
                : plan.monthlyPrice;
              const ctaHref =
                plan.id === "free"
                  ? "/register?plan=free"
                  : plan.selfServe
                    ? `/register?plan=${encodeURIComponent(plan.id)}&interval=${isAnnual ? "annual" : "monthly"}`
                    : "/contact";
              const ctaLabel =
                plan.id === "free"
                  ? "Create free account"
                  : plan.id === "elite_studio"
                    ? "Talk to sales"
                    : plan.id === "pro_photographer"
                      ? "Go Pro"
                      : `Start ${plan.name}`;
              const badgeLabel = featuredPlanLabel(plan);
              const isFeaturedPlan = Boolean(badgeLabel);
              const summary =
                plan.description ||
                subscriptionSummaries[plan.id] ||
                "A complete RawDrive workspace for ongoing gallery delivery.";

              return (
                <article
                  key={plan.id}
                  data-plan={plan.id}
                  className={`flex min-h-full flex-col rounded-2xl border p-6 shadow-glass transition-colors ${
                    isFeaturedPlan
                      ? "border-accent bg-accent-subtle"
                      : "border-border bg-surface-elevated"
                  }`}
                  style={{
                    transitionDuration: "var(--duration-fast)",
                  }}
                >
                  <div className="flex min-h-10 items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-accent">
                        {subscriptionPlanLabel(plan)}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-text-primary">
                        {plan.name}
                      </h3>
                    </div>
                    {badgeLabel && (
                      <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-text-inverse">
                        {badgeLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 min-h-16 text-sm leading-6 text-text-secondary">
                    {summary}
                  </p>
                  <div className="mt-5 border-t border-border-subtle pt-5">
                    <p className="text-3xl font-bold text-text-primary">
                      {plan.id === "free"
                        ? "Free"
                        : formatPrice(displayedPrice)}
                    </p>
                    {plan.id !== "free" && (
                      <p className="text-sm font-medium text-text-secondary">
                        / month
                      </p>
                    )}
                    <p className="mt-2 min-h-5 text-xs font-semibold text-accent">
                      {plan.id === "free"
                        ? "Free forever"
                        : isAnnual
                          ? annualNote(plan)
                          : "Monthly billing"}
                    </p>
                  </div>
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
                    className={`touch-min mt-6 inline-flex items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors ${
                      isFeaturedPlan
                        ? "bg-accent text-text-inverse hover:bg-accent-hover"
                        : "border border-border bg-surface-elevated text-text-primary hover:bg-accent-subtle hover:text-accent"
                    }`}
                    style={{
                      transitionDuration: "var(--duration-fast)",
                    }}
                  >
                    {ctaLabel}
                  </Link>
                </article>
              );
            })}
          </div>
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

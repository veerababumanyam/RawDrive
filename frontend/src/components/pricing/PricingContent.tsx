"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, HardDrive, Video, Tag } from "lucide-react";
import { pricingPlans, storageBoosters, streamingPacks } from "@/lib/tokens";
import { useStreamingPackages, formatINR } from "@/lib/streaming-packages";

const faqItems = [
  {
    q: "Is there a free trial?",
    a: "Yes! The Free plan gives you 30 days to explore RawDrive with 1GB storage, 3 galleries, and 5 client profiles.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. You can upgrade or downgrade at any time. Pro-rated credits apply when upgrading mid-cycle.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept UPI, credit/debit cards, net banking, and wallets via Razorpay. Enterprise plans support bank transfers.",
  },
  {
    q: "Is GST included in the pricing?",
    a: "Prices shown are exclusive of GST. 18% GST will be added at checkout as per Indian tax regulations.",
  },
  {
    q: "Do you offer refunds?",
    a: "Yes, we offer a 7-day refund policy on paid plans. See our refund policy for full details.",
  },
  {
    q: "What happens when my free trial ends?",
    a: "Your account enters read-only mode. Your data is preserved for 30 days. Upgrade to any paid plan to restore full access.",
  },
  {
    q: "Can I add more storage without upgrading?",
    a: "Yes! Storage booster packs let you add extra storage to any plan without upgrading your tier.",
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

export function PricingContent() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [coupon, setCoupon] = useState("");

  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            Pricing
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold tracking-[-0.03em] text-text-primary md:text-6xl">
              Choose the plan that matches your studio today and scale without replatforming later.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              This route now leans on the original Stitch plan-selection page instead of a generic SaaS pricing header.
            </p>
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
                backgroundColor: isAnnual ? "var(--accent-default)" : "var(--surface-sunken)",
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
              Annual <span className="text-accent">(Save 17%)</span>
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-8 top-10 h-48 rounded-full bg-accent-muted blur-[120px]" />
          <div className="glass-card relative overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <img
                src="/stitch/pricing.png"
                alt="Stitch pricing page preview"
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {pricingPlans.map((plan) => {
            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            const period = plan.id === "free" ? "/30 days" : isAnnual ? "/year" : "/month";

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
                <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>
                <p className="mt-3 text-3xl font-bold text-text-primary">
                  {formatPrice(price)}
                </p>
                <p className="text-sm text-text-tertiary">
                  {period}
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.id === "enterprise" ? "/register?plan=enterprise" : "/register"}
                  className={`mt-6 inline-flex items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                    plan.popular
                      ? "bg-accent text-text-inverse hover:bg-accent-hover"
                      : "border border-border bg-surface-elevated text-text-primary hover:bg-accent-subtle hover:text-accent"
                  }`}
                  style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
                >
                  Get Started
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="bg-surface-sunken px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-text-primary">
            Feature Comparison
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-elevated shadow-glass">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-surface-elevated px-4 py-3 text-text-primary font-semibold">
                    Feature
                  </th>
                  {pricingPlans.map((p) => (
                    <th key={p.id} className="px-4 py-3 text-center text-text-primary font-semibold">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Storage", values: ["1GB", "50GB", "250GB", "2TB", "Unlimited"] },
                  { label: "Galleries", values: ["3", "10", "50", "200", "Unlimited"] },
                  { label: "Client Profiles", values: ["5", "20", "100", "500", "Unlimited"] },
                  { label: "AI Culling", values: [false, false, true, true, true] },
                  { label: "Client Proofing", values: [false, true, true, true, true] },
                  { label: "CRM & Bookings", values: [false, "Basic", "Full", "Full", "Full"] },
                  { label: "Live Streaming", values: [false, false, "5/mo", "20/mo", "Unlimited"] },
                  { label: "Marketplace", values: [false, false, true, "Premium", "Premium"] },
                  { label: "API Access", values: [false, false, false, true, true] },
                  { label: "White Label", values: [false, false, false, false, true] },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-border-subtle">
                    <td className="sticky left-0 bg-surface-elevated px-4 py-3 font-medium text-text-primary">
                      {row.label}
                    </td>
                    {row.values.map((val, i) => (
                      <td key={i} className="px-4 py-3 text-center text-text-secondary">
                        {val === true ? (
                          <Check className="mx-auto h-4 w-4 text-accent" />
                        ) : val === false ? (
                          <span className="text-text-tertiary">—</span>
                        ) : (
                          val
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Storage Boosters */}
      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-text-primary">
            <HardDrive className="mr-2 inline-block h-6 w-6 text-accent" aria-hidden="true" />
            Storage Boosters
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {storageBoosters.map((b) => (
              <div
                key={b.name}
                className="rounded-xl border border-border bg-surface-elevated p-6 text-center shadow-glass"
              >
                <h3 className="text-lg font-semibold text-text-primary">{b.name}</h3>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  Rs. {b.price.toLocaleString("en-IN")}
                </p>
                <p className="text-sm text-text-tertiary">{b.storage} extra storage</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Streaming Packs */}
      <section className="bg-surface-sunken px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-text-primary">
            <Video className="mr-2 inline-block h-6 w-6 text-accent" aria-hidden="true" />
            Streaming Session Packs
          </h2>
          <LiveStreamingPackagesGrid />
          {/* Build-time fallback list, hidden when the API populates above. */}
          <noscript>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {streamingPacks.map((p) => (
                <div
                  key={p.name}
                  className="rounded-xl border border-border bg-surface-elevated p-6 text-center shadow-glass"
                >
                  <h3 className="text-lg font-semibold text-text-primary">{p.name}</h3>
                  <p className="mt-2 text-2xl font-bold text-text-primary">
                    Rs. {p.price.toLocaleString("en-IN")}
                  </p>
                  <p className="text-sm text-text-tertiary">{p.sessions} streaming minutes</p>
                </div>
              ))}
            </div>
          </noscript>
        </div>
      </section>

      {/* Coupon Code */}
      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-md text-center">
          <h2 className="mb-4 text-xl font-bold text-text-primary">
            <Tag className="mr-2 inline-block h-5 w-5 text-accent" aria-hidden="true" />
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
              style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
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
                  className={`overflow-hidden transition-all ${
                    openFaq === i ? "max-h-40 pb-4" : "max-h-0"
                  }`}
                  style={{ transitionDuration: "var(--duration-normal)" }}
                >
                  <p className="px-4 text-sm text-text-secondary">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// LiveStreamingPackagesGrid renders the live, API-sourced streaming
// packages catalogue. Falls back to the build-time tokens.ts list inside
// <noscript> for non-JS clients (handled in the parent).
function LiveStreamingPackagesGrid() {
  const { packages, loading, error } = useStreamingPackages();

  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-border bg-surface-elevated/40"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  if (error || packages.length === 0) {
    return (
      <p className="text-center text-sm text-text-tertiary">
        Live pricing temporarily unavailable. Please refresh.
      </p>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((p) => (
        <div
          key={p.id}
          className="rounded-xl border border-border bg-surface-elevated p-6 text-center shadow-glass"
        >
          <h3 className="text-lg font-semibold text-text-primary">{p.name}</h3>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            Rs. {formatINR(p.price_paise)}
          </p>
          <p className="text-sm text-text-tertiary">
            {p.minutes} streaming minutes
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            up to {p.max_concurrent_viewers} viewers · {p.replay_ttl_days}d replay
          </p>
        </div>
      ))}
    </div>
  );
}

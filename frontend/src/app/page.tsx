import Link from "next/link";
import {
  Image,
  CheckCircle,
  Sparkles,
  Users,
  Video,
  Store,
  Heart,
  Camera,
  Globe,
  Shield,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RawDrive — The Operating System for Photography Businesses in India",
  description:
    "All-in-one platform for Indian photographers — gallery delivery, client proofing, AI culling, CRM, live streaming, and marketplaces.",
};

const features = [
  {
    icon: Image,
    title: "Gallery Delivery",
    description:
      "Deliver stunning, branded galleries to clients with password protection, download controls, and expiry dates.",
  },
  {
    icon: CheckCircle,
    title: "Client Proofing",
    description:
      "Let clients select, favourite, and approve photos directly in-browser with real-time collaboration.",
  },
  {
    icon: Sparkles,
    title: "AI Culling",
    description:
      "Automatically sort thousands of photos by quality, sharpness, and duplicates — save hours of editing time.",
  },
  {
    icon: Users,
    title: "CRM & Bookings",
    description:
      "Manage leads, bookings, contracts, invoices, and payments in one unified dashboard.",
  },
  {
    icon: Video,
    title: "Live Streaming",
    description:
      "Stream weddings and events live to remote guests with branded overlays and multi-camera support.",
  },
  {
    icon: Store,
    title: "Marketplaces",
    description:
      "List your services on the RawDrive marketplace and get discovered by clients in your city.",
  },
];

const planTeaser = [
  { name: "Free", price: "Rs. 0", note: "90-day trial" },
  { name: "Starter", price: "Rs. 500", note: "/month" },
  { name: "Professional", price: "Rs. 1,200", note: "/month", popular: true },
  { name: "Business", price: "Rs. 5,000", note: "/month" },
];

const stats = [
  { value: "10,000+", label: "Photographers" },
  { value: "50L+", label: "Photos Delivered" },
  { value: "500+", label: "Cities Covered" },
  { value: "99.9%", label: "Uptime" },
];

function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "RawDrive",
        url: "https://rawdrive.in",
        logo: "https://rawdrive.in/logo/android-chrome-512x512.png",
        sameAs: [],
      },
      {
        "@type": "SoftwareApplication",
        name: "RawDrive",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "0",
          highPrice: "5000",
          priceCurrency: "INR",
          offerCount: 5,
        },
      },
    ],
  };
  // Static trusted content — no user input involved
  const html = JSON.stringify(data);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function LandingPage() {
  return (
    <>
      <JsonLd />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-surface px-4 py-20 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
            The Operating System for Photography Businesses in India
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
            Gallery delivery, client proofing, AI culling, CRM, live streaming, and
            marketplaces — everything you need to run your photography business, in one
            platform.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-base font-semibold text-text-inverse shadow-glass transition-colors hover:bg-accent-hover active:bg-accent-active"
              style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
            >
              Get Started Free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface-elevated px-6 py-3 text-base font-semibold text-text-primary shadow-sm transition-colors hover:bg-accent-subtle hover:text-accent"
              style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="bg-surface-sunken px-4 py-20 lg:px-8" id="features-preview">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary">
              Everything You Need to Run Your Studio
            </h2>
            <p className="mt-4 text-text-secondary">
              Six powerful tools, one platform. No more juggling apps.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-surface-elevated p-6 shadow-glass transition-transform hover:scale-[1.01]"
                style={{ transitionDuration: "var(--duration-normal)" }}
              >
                <feature.icon className="h-8 w-8 text-accent" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-semibold text-text-primary">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-text-secondary">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="bg-surface px-4 py-20 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-text-primary">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-text-secondary">Start free. Scale as you grow.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {planTeaser.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-6 text-center shadow-glass transition-transform hover:scale-[1.01] ${
                  plan.popular
                    ? "border-accent bg-accent-subtle"
                    : "border-border bg-surface-elevated"
                }`}
                style={{ transitionDuration: "var(--duration-normal)" }}
              >
                {plan.popular && (
                  <span className="mb-3 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-text-inverse">
                    Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>
                <p className="mt-2 text-2xl font-bold text-text-primary">{plan.price}</p>
                <p className="text-sm text-text-tertiary">{plan.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
              style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
            >
              View Full Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-surface-sunken px-4 py-20 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-accent">{stat.value}</p>
                <p className="mt-1 text-sm text-text-secondary">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
            <div className="flex items-center gap-2 rounded-full bg-accent-subtle px-4 py-2">
              <Heart className="h-4 w-4 text-accent fill-current" aria-hidden="true" />
              <span className="text-sm font-medium text-accent">Made in India</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-accent-subtle px-4 py-2">
              <Camera className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="text-sm font-medium text-accent">Built for Photographers</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-accent-subtle px-4 py-2">
              <Globe className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="text-sm font-medium text-accent">11 Indian Languages</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-accent-subtle px-4 py-2">
              <Shield className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="text-sm font-medium text-accent">DPDPA Compliant</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Image,
  CheckCircle,
  Sparkles,
  Users,
  Video,
  Store,
  BarChart3,
  Shield,
  Globe,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

const featureSections = [
  {
    id: "gallery-delivery",
    icon: Image,
    title: "Gallery Delivery",
    description: "Deliver stunning, branded photo galleries to your clients.",
    bullets: [
      "Password-protected client galleries",
      "Custom branding and watermarks",
      "Download controls and expiry dates",
      "Mobile-optimized viewing experience",
      "Bulk download with ZIP packaging",
    ],
  },
  {
    id: "client-proofing",
    icon: CheckCircle,
    title: "Client Proofing",
    description: "Let clients select, favourite, and approve photos in real time.",
    bullets: [
      "Real-time photo selection and favouriting",
      "Comment and annotation tools",
      "Side-by-side comparison mode",
      "Approval workflows with notifications",
      "Export approved selections automatically",
    ],
  },
  {
    id: "ai-culling",
    icon: Sparkles,
    title: "AI Culling",
    description: "Automatically sort thousands of photos — save hours of editing.",
    bullets: [
      "Automatic quality scoring and ranking",
      "Duplicate and near-duplicate detection",
      "Blur, exposure, and sharpness analysis",
      "Face detection and grouping",
      "Custom culling rules and presets",
    ],
  },
  {
    id: "crm-bookings",
    icon: Users,
    title: "CRM & Bookings",
    description: "Manage your entire client lifecycle in one dashboard.",
    bullets: [
      "Lead capture and pipeline management",
      "Online booking with calendar sync",
      "Contract generation and e-signatures",
      "Automated invoicing (GST compliant)",
      "Payment tracking with Razorpay integration",
    ],
  },
  {
    id: "live-streaming",
    icon: Video,
    title: "Live Streaming",
    description: "Stream weddings and events live to remote guests.",
    bullets: [
      "HD live streaming with low latency",
      "Branded overlays and custom themes",
      "Multi-camera support",
      "Live photo sharing during events",
      "Recording and playback options",
    ],
  },
  {
    id: "marketplaces",
    icon: Store,
    title: "Marketplaces",
    description: "Get discovered by clients in your city and beyond.",
    bullets: [
      "Searchable photographer directory",
      "Portfolio showcase with SEO",
      "Review and rating system",
      "Lead generation from marketplace",
      "Category-based discovery (wedding, portrait, etc.)",
    ],
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics & Insights",
    description: "Understand your business performance with detailed analytics.",
    bullets: [
      "Gallery view and download analytics",
      "Revenue and booking trends",
      "Client engagement metrics",
      "Popular photo insights from proofing",
      "Custom report generation",
    ],
  },
  {
    id: "security",
    icon: Shield,
    title: "Security & Privacy",
    description: "Enterprise-grade security built for Indian regulations.",
    bullets: [
      "DPDPA and GDPR compliant",
      "End-to-end encryption at rest",
      "Data stored in Indian data centers",
      "Role-based access control",
      "Audit logs and compliance reports",
    ],
  },
  {
    id: "localization",
    icon: Globe,
    title: "Indian Localization",
    description: "Built for India — languages, payments, and compliance.",
    bullets: [
      "11 Indian language support",
      "INR pricing with GST handling",
      "UPI and Razorpay payments",
      "Aadhaar-based verification (optional)",
      "Regional marketplace discovery",
    ],
  },
  {
    id: "customization",
    icon: Palette,
    title: "White Label & Branding",
    description: "Make RawDrive your own with full branding customization.",
    bullets: [
      "Custom domain support",
      "Logo and color theme customization",
      "Branded email templates",
      "Custom gallery themes",
      "White-label option for Enterprise",
    ],
  },
];

export function FeaturesContent() {
  const [activeSection, setActiveSection] = useState(featureSections[0].id);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    sectionRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            Feature Showcase
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold tracking-[-0.03em] text-text-primary md:text-6xl">
              Every core workflow, rebuilt around the original Stitch feature direction.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              Explore the product surfaces that matter most to photography businesses: delivery,
              proofing, AI, CRM, streaming, analytics, privacy, and local operations.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-sm font-semibold">
              Start free trial
            </Link>
            <Link
              href="/pricing"
              className="btn-tertiary border border-border px-6 py-3 text-sm font-semibold"
            >
              Compare plans
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass-card overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <img
                src="/stitch/features-a.png"
                alt="Stitch features showcase preview"
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
          <div className="glass-card overflow-hidden p-3 sm:translate-y-12">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <img
                src="/stitch/features-b.png"
                alt="Stitch features showcase secondary preview"
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-20 lg:px-8">
        <div className="flex gap-8">
          {/* Sticky sidebar nav (desktop) */}
          <nav
            className="hidden w-56 shrink-0 lg:block"
            aria-label="Feature navigation"
          >
            <div className="sticky top-20 space-y-1">
              {featureSections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm transition-colors",
                    activeSection === s.id
                      ? "bg-accent-subtle text-accent font-medium"
                      : "text-text-secondary hover:bg-accent-subtle hover:text-accent"
                  )}
                  style={{
                    transitionDuration: "var(--duration-fast)",
                    minHeight: "var(--touch-target-min)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {s.title}
                </a>
              ))}
            </div>
          </nav>

          {/* Horizontal tabs (mobile) */}
          <nav
            className="sticky top-16 z-[var(--z-sticky)] -mx-4 mb-8 overflow-x-auto bg-surface px-4 py-3 lg:hidden"
            aria-label="Feature navigation mobile"
          >
            <div className="flex gap-2">
              {featureSections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-3 py-2 text-xs font-medium transition-colors",
                    activeSection === s.id
                      ? "bg-accent text-text-inverse"
                      : "bg-surface-elevated text-text-secondary border border-border"
                  )}
                  style={{ transitionDuration: "var(--duration-fast)", minHeight: "36px" }}
                >
                  {s.title}
                </a>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 space-y-20">
            {featureSections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                ref={(el) => {
                  if (el) sectionRefs.current.set(section.id, el);
                }}
                className="scroll-mt-24"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-subtle">
                    <section.icon className="h-6 w-6 text-accent" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">{section.title}</h2>
                    <p className="mt-2 text-text-secondary">{section.description}</p>
                  </div>
                </div>
                <ul className="mt-6 space-y-3 pl-16">
                  {section.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      <CheckCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        aria-hidden="true"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pl-16">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
                    style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
                  >
                    Try {section.title} Free
                  </Link>
                </div>
              </section>
            ))}

            {/* Final CTA */}
            <section className="rounded-2xl bg-accent-subtle p-8 text-center">
              <h2 className="text-2xl font-bold text-text-primary">
                Ready to Transform Your Photography Business?
              </h2>
              <p className="mt-4 text-text-secondary">
                Join thousands of Indian photographers who trust RawDrive.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
                  style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
                >
                  Get Started Free
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-surface-elevated px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-accent-subtle hover:text-accent"
                  style={{ minHeight: "var(--touch-target-min)", transitionDuration: "var(--duration-fast)" }}
                >
                  View Pricing
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

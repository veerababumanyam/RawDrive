import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarDays,
  CheckCircle2,
  Camera,
  Heart,
  ImageIcon,
  ReceiptText,
  Sparkles,
  Tv,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "RawDrive | India's Premium Photography SaaS",
  description:
    "The all-in-one platform for Indian photographers. Manage galleries, deliver to clients, handle GST invoices, and grow your studio with AI.",
};

const features = [
  {
    icon: ImageIcon,
    title: "Gallery Management",
    description:
      "High-speed uploads with automated folder structures and client-ready previews.",
  },
  {
    icon: CheckCircle2,
    title: "Client Proofing",
    description:
      "Let clients select their favorites with a single tap. Mobile-optimized for easy viewing.",
  },
  {
    icon: ReceiptText,
    title: "GST Invoicing",
    description:
      "Automated GST compliance for India. Generate professional tax invoices in seconds.",
  },
  {
    icon: Sparkles,
    title: "AI Smart Culling",
    description:
      "Save hours of work. Our AI automatically detects blurry shots and duplicates for you.",
  },
  {
    icon: Tv,
    title: "Live Streaming",
    description:
      "Stream wedding highlights directly to guests who couldn't make it, integrated with your gallery.",
  },
  {
    icon: CalendarDays,
    title: "Booking Calendar",
    description:
      "Manage your dates and advance payments with an intuitive studio-wide calendar.",
  },
];

const stats = [
  { value: "5,000+", label: "Active Studios", tone: "text-accent" },
  { value: "1M+", label: "Photos Delivered", tone: "text-accent-primary" },
  { value: "Rs. 50Cr+", label: "Revenue Processed", tone: "text-accent-tertiary" },
];

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-surface text-text-primary selection:bg-accent selection:text-text-inverse">
      <main className="pt-20">
        <section className="mx-auto grid min-h-[100dvh] max-w-7xl items-center gap-12 px-6 md:grid-cols-2">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-accent">
              <Sparkles className="h-4 w-4" />
              India&apos;s #1 Photography SaaS
            </div>

            <h1 className="font-headline text-5xl font-extrabold leading-[0.95] text-text-primary md:text-7xl">
              Professional Photography, <span className="text-accent">Simplified</span>
            </h1>

            <p className="max-w-lg text-lg leading-8 text-text-secondary">
              The all-in-one platform for Indian photographers. Manage galleries,
              deliver to clients, handle GST invoices, and grow your studio with
              cutting-edge AI.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/register"
                className="inline-flex rounded-xl bg-accent px-8 py-4 text-lg font-bold text-text-inverse shadow-glass transition-all hover:shadow-lg active:scale-95"
              >
                Start Free Trial
              </Link>
              <Link
                href="/login"
                className="inline-flex rounded-xl border border-border bg-surface-elevated px-8 py-4 text-lg font-bold text-text-primary transition-all hover:bg-surface-sunken"
              >
                Watch Demo
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 text-sm text-text-tertiary">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" />
                5,000+ Photographers
              </div>
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-accent" />
                Made in India
              </div>
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-accent" />
                DPDPA Compliant
              </div>
            </div>
          </div>

          <div className="relative hidden md:block">
            <div className="absolute -inset-4 rounded-full bg-accent-muted blur-3xl" />
            <div className="relative overflow-hidden rounded-[1.25rem] border border-border bg-surface-elevated shadow-2xl backdrop-blur-md">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDB9mQtzsQntF6IssWlOlcKYOZ-_zY0ZBq9AaidjZXttyGH5tpujmSsYXTQJuSX5Jxmz6SKu--PQVckHRLa0bRX4rFQu-6jDZhohX9970IsK4eWXkqKabALdSo6yWQa07334qVCuO0LBbCtMTYQ2gf486_dskCSo65jUnKg0NiNDv0Q2nmPI7PZyf8UJMwTMZa0OxbiNFlaDQULV81ydHyLtp0f0kQpgn1OKiJVMrPmSLtB38g4P3Tv-SC1uTuw7gzeFiEQj8HCMqM"
                alt="RawDrive dashboard preview"
                className="h-auto w-full opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent opacity-40" />
            </div>

            <div className="absolute -bottom-6 -left-6 flex items-center gap-4 rounded-xl border border-border bg-surface-elevated p-4 shadow-2xl backdrop-blur-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-text-inverse">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-text-tertiary">New Client Booking</p>
                <p className="font-bold text-text-primary">Premium Wedding Set</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-16 space-y-4 text-center">
            <h2 className="font-headline text-4xl font-bold text-text-primary">
              Everything your studio needs
            </h2>
            <p className="mx-auto max-w-2xl text-text-secondary">
              Built specifically for the workflow of modern Indian photography studios.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-[1.25rem] border border-border bg-surface-elevated p-8 backdrop-blur-md transition-all hover:border-accent"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="font-headline text-xl font-bold text-text-primary">
                  {feature.title}
                </h3>
                <p className="mt-3 leading-7 text-text-secondary">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="overflow-hidden bg-surface-sunken py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-12 text-center">
              <h2 className="font-headline text-3xl font-bold text-text-primary">
                Trusted by Indian Photographers
              </h2>
            </div>

            <div className="grid gap-12 lg:grid-cols-3 lg:items-center">
              <div className="space-y-10 lg:col-span-1">
                {stats.map((stat) => (
                  <div key={stat.label} className="space-y-2">
                    <p className={`font-headline text-4xl font-black ${stat.tone}`}>
                      {stat.value}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-[0.26em] text-text-tertiary">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-2">
                <div className="rounded-[1.75rem] border border-border bg-surface-elevated p-8 backdrop-blur-md">
                  <p className="font-headline text-2xl font-bold text-text-primary">
                    From first inquiry to final delivery, RawDrive keeps the whole
                    studio moving.
                  </p>
                  <p className="mt-4 max-w-2xl leading-8 text-text-secondary">
                    Premium client galleries, GST-ready billing, AI-assisted sorting,
                    and a workflow built for Indian studios that need polish without
                    operational chaos.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                      href="/register"
                      className="inline-flex rounded-xl bg-accent px-6 py-3 font-bold text-text-inverse shadow-glass transition-all hover:shadow-lg"
                    >
                      Start Free Trial
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex rounded-xl border border-border bg-surface-elevated px-6 py-3 font-semibold text-text-primary transition-all hover:bg-surface-sunken"
                    >
                      See Pricing
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

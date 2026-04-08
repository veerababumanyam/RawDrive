import type { Metadata } from "next";
import { Cpu, ShieldCheck, Sparkles, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us | RawDrive",
  description:
    "Learn more about RawDrive and our mission to transform photography business operations.",
};

const principles = [
  {
    icon: ShieldCheck,
    title: "Privacy First",
    description:
      "Photographers trust us with once-in-a-lifetime work, so every workflow is designed around secure sharing and controlled access.",
  },
  {
    icon: Cpu,
    title: "AI With Intent",
    description:
      "Our tooling speeds up culling, search, and delivery without turning the product into a generic AI dashboard.",
  },
  {
    icon: Sparkles,
    title: "Editorial Experience",
    description:
      "The interface is built to feel like a premium gallery space where the work leads and the UI supports quietly.",
  },
];

const teamHighlights = [
  "Built for Indian photography studios, not generic cloud storage teams.",
  "Focused on fast delivery, proofing, GST workflows, and marketplace growth.",
  "Designed around client presentation as much as operational control.",
  "Grounded in the original Stitch art direction instead of placeholder filler.",
];

export default function AboutPage() {
  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            About RawDrive
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold tracking-[-0.03em] text-text-primary md:text-6xl">
              Built to make photography businesses feel as premium as the work they deliver.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              RawDrive exists to give studios a real operating system: galleries, client proofing,
              invoicing, scheduling, AI workflows, and marketplaces in one polished environment.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {teamHighlights.map((item) => (
              <div key={item} className="surface-panel p-5 text-sm leading-7 text-text-secondary">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-10 top-10 h-48 rounded-full bg-accent-muted blur-[120px]" />
          <div className="glass-card relative overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <img
                src="/stitch/about.png"
                alt="Stitch about page preview"
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="grid gap-6 md:grid-cols-3">
          {principles.map((principle) => (
            <article key={principle.title} className="surface-panel p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
                <principle.icon className="h-6 w-6" />
              </div>
              <h2 className="mt-6 font-headline text-2xl font-bold text-text-primary">
                {principle.title}
              </h2>
              <p className="mt-3 leading-7 text-text-secondary">{principle.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="glass-card p-8 lg:p-10">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-subtle px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
              <Users className="h-4 w-4" />
              Our approach
            </div>
            <h2 className="font-headline text-3xl font-bold tracking-[-0.02em] text-text-primary">
              We design for the entire studio lifecycle, not just file storage.
            </h2>
            <p className="leading-8 text-text-secondary">
              From lead capture to final delivery, every part of the product is meant to feel
              intentional. That same principle now drives this page body too, using the Stitch
              original as the visual reference instead of a placeholder section.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

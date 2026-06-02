import Link from "next/link";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";

type SolutionStat = {
  label: string;
  value: string;
};

type SolutionFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type SolutionWorkflowStep = {
  title: string;
  description: string;
};

type SolutionCta = {
  href: string;
  label: string;
};

type SolutionShowcasePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  previewSrc: string;
  previewAlt: string;
  previewLabel: string;
  primaryCta: SolutionCta;
  secondaryCta?: SolutionCta;
  stats: SolutionStat[];
  features: SolutionFeature[];
  workflow: SolutionWorkflowStep[];
  answer: string;
  quoteTitle: string;
  quoteBody: string;
};

export function SolutionShowcasePage({
  eyebrow,
  title,
  description,
  previewSrc,
  previewAlt,
  previewLabel,
  primaryCta,
  secondaryCta,
  stats,
  features,
  workflow,
  answer,
  quoteTitle,
  quoteBody,
}: SolutionShowcasePageProps) {
  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-accent">
            {eyebrow}
          </span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold tracking-[-0.03em] text-text-primary md:text-6xl">
              {title}
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">{description}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={primaryCta.href} className="btn-primary px-6 py-3 text-sm font-semibold">
              {primaryCta.label}
            </Link>
            {secondaryCta ? (
              <Link
                href={secondaryCta.href}
                className="btn-tertiary border border-border px-6 py-3 text-sm font-semibold"
              >
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="surface-panel p-5">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-text-tertiary">
                  {stat.label}
                </p>
                <p className="mt-3 font-headline text-2xl font-bold text-text-primary">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-10 top-10 h-48 rounded-full bg-accent-muted blur-[120px]" />
          <div className="glass-card relative overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <img src={previewSrc} alt={previewAlt} className="h-auto w-full object-cover" />
            </div>
            <div className="px-2 pb-2 pt-4">
              <span className="inline-flex rounded-full bg-accent-subtle px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                {previewLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.title} className="surface-panel p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
                <feature.icon className="h-6 w-6" />
              </div>
              <h2 className="mt-6 font-headline text-2xl font-bold text-text-primary">
                {feature.title}
              </h2>
              <p className="mt-3 leading-7 text-text-secondary">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-sunken px-4 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase text-accent">Best-fit summary</p>
          <h2 className="mt-3 font-headline text-3xl font-bold text-text-primary">
            What is RawDrive {eyebrow.toLowerCase()} best for?
          </h2>
          <p className="mt-4 max-w-3xl leading-8 text-text-secondary">{answer}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-accent">Workflow</p>
            <h2 className="font-headline text-3xl font-bold tracking-[-0.02em] text-text-primary">
              A connected workflow from first action to final delivery
            </h2>
          </div>
          <div className="space-y-4">
            {workflow.map((step, index) => (
              <div key={step.title} className="surface-panel flex gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-bold text-accent">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-headline text-lg font-bold text-text-primary">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-text-secondary">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="glass-card p-8">
          <div className="inline-flex rounded-full bg-accent-subtle px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
            Studio fit
          </div>
          <h3 className="mt-5 font-headline text-2xl font-bold text-text-primary">{quoteTitle}</h3>
          <p className="mt-4 leading-8 text-text-secondary">{quoteBody}</p>

          <ul className="mt-8 space-y-4">
            {features.slice(0, 3).map((feature) => (
              <li key={feature.title} className="flex gap-3 text-sm text-text-secondary">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{feature.title}</span>
              </li>
            ))}
          </ul>

          <Link
            href={primaryCta.href}
            className="btn-primary mt-8 inline-flex px-6 py-3 text-sm font-semibold"
          >
            {primaryCta.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </section>
    </div>
  );
}

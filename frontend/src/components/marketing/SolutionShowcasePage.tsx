import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  type LucideIcon,
} from "@/components/icons";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/seo";

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

type SolutionAvailabilityNotice = {
  label: string;
  title: string;
  description: string;
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
  availabilityNotice?: SolutionAvailabilityNotice;
  /** Route path of this page, e.g. "/solutions/galleries" — used for BreadcrumbList JSON-LD. */
  path: string;
  /** Short label for this page in the breadcrumb trail (defaults to the eyebrow). */
  breadcrumbName?: string;
};

export async function SolutionShowcasePage({
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
  availabilityNotice,
  path,
  breadcrumbName,
}: SolutionShowcasePageProps) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: breadcrumbName ?? eyebrow, path },
  ]);

  return (
    <div className="bg-surface text-text-primary">
      <JsonLd id="solution-breadcrumb" data={breadcrumb} nonce={nonce} />
      <section className="solution-showcase-grid mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
        {availabilityNotice ? (
          <div
            className="solution-availability-banner solution-availability-banner--top"
            role="status"
          >
            <div className="solution-availability-banner__icon">
              <Clock3 aria-hidden="true" />
            </div>
            <div className="solution-availability-banner__content">
              <p className="solution-availability-banner__label">
                {availabilityNotice.label}
              </p>
              <h2 className="solution-availability-banner__title">
                {availabilityNotice.title}
              </h2>
              <p className="solution-availability-banner__description">
                {availabilityNotice.description}
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-8">
          <span className="eyebrow-pill">{eyebrow}</span>
          <div className="space-y-5">
            <h1 className="font-headline text-4xl font-extrabold text-text-primary md:text-6xl">
              {title}
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={primaryCta.href}
              className="btn-primary px-6 py-3 text-sm font-semibold"
            >
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
                <p className="form-label">{stat.label}</p>
                <p className="mt-3 font-headline text-2xl font-bold text-text-primary">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="solution-preview-glow" />
          <div className="glass-card relative overflow-hidden p-3">
            <div className="solution-preview-frame">
              <Image
                src={previewSrc}
                alt={previewAlt}
                width={1600}
                height={1000}
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="h-auto w-full object-cover"
              />
            </div>
            <div className="px-2 pb-2 pt-4">
              <span className="eyebrow-pill px-3 py-1">{previewLabel}</span>
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
              <p className="mt-3 leading-7 text-text-secondary">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-sunken px-4 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase text-accent">
            Best-fit summary
          </p>
          <h2 className="mt-3 font-headline text-3xl font-bold text-text-primary">
            What is RawDrive {eyebrow.toLowerCase()} best for?
          </h2>
          <p className="mt-4 max-w-3xl leading-8 text-text-secondary">
            {answer}
          </p>
        </div>
      </section>

      <section className="solution-showcase-grid mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="form-label text-accent">Workflow</p>
            <h2 className="font-headline text-3xl font-bold text-text-primary">
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
                  <h3 className="font-headline text-lg font-bold text-text-primary">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-text-secondary">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="glass-card p-8">
          <div className="eyebrow-pill px-3 py-1">Studio fit</div>
          <h3 className="mt-5 font-headline text-2xl font-bold text-text-primary">
            {quoteTitle}
          </h3>
          <p className="mt-4 leading-8 text-text-secondary">{quoteBody}</p>

          <ul className="mt-8 space-y-4">
            {features.slice(0, 3).map((feature) => (
              <li
                key={feature.title}
                className="flex gap-3 text-sm text-text-secondary"
              >
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

import { headers } from "next/headers";
import Link from "next/link";
import { MapPin, SlidersHorizontal, Star } from "@/components/icons";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/seo";

type MarketplaceCard = {
  name: string;
  location: string;
  specialty: string;
  badge: string;
  price: string;
  image: string;
  note: string;
};

type MarketplaceShowcasePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  previewSrc: string;
  previewAlt: string;
  primaryCta: {
    href: string;
    label: string;
  };
  secondaryCta?: {
    href: string;
    label: string;
  };
  filters: string[];
  answer: string;
  cards: MarketplaceCard[];
  /** Optional caption shown above the cards, e.g. to flag sample/example data. */
  cardsNote?: string;
  /** Route path of this page, e.g. "/marketplaces/freelancer" — used for BreadcrumbList JSON-LD. */
  path: string;
  /** Short label for this page in the breadcrumb trail (defaults to the eyebrow). */
  breadcrumbName?: string;
};

export async function MarketplaceShowcasePage({
  eyebrow,
  title,
  description,
  previewSrc,
  previewAlt,
  primaryCta,
  secondaryCta,
  filters,
  answer,
  cards,
  cardsNote,
  path,
  breadcrumbName,
}: MarketplaceShowcasePageProps) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: breadcrumbName ?? eyebrow, path },
  ]);

  return (
    <div className="bg-surface text-text-primary">
      <JsonLd id="marketplace-breadcrumb" data={breadcrumb} nonce={nonce} />
      <section className="solution-showcase-grid mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
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
          <div className="surface-panel flex flex-wrap gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <SlidersHorizontal className="h-4 w-4 text-accent" />
              Search by need, city, and specialty
            </div>
            {filters.map((filter) => (
              <span
                key={filter}
                className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-medium text-text-secondary"
              >
                {filter}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="solution-preview-glow" />
          <div className="glass-card relative overflow-hidden p-3">
            <div className="solution-preview-frame">
              <img
                src={previewSrc}
                alt={previewAlt}
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface-sunken px-4 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase text-accent">
            Marketplace fit
          </p>
          <h2 className="mt-3 font-headline text-3xl font-bold text-text-primary">
            Who is this RawDrive marketplace for?
          </h2>
          <p className="mt-4 max-w-3xl leading-8 text-text-secondary">
            {answer}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 lg:px-8">
        {cardsNote ? (
          <p className="mb-6 text-sm text-text-tertiary">{cardsNote}</p>
        ) : null}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article key={card.name} className="surface-panel overflow-hidden">
              <div className="aspect-[4/3] bg-surface-container-high">
                <img
                  src={card.image}
                  alt={card.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-headline text-2xl font-bold text-text-primary">
                      {card.name}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      {card.specialty}
                    </p>
                  </div>
                  <span className="eyebrow-pill px-3 py-1">{card.badge}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-text-secondary">
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-accent" />
                    {card.location}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Star className="h-4 w-4 text-accent" />
                    {card.price}
                  </span>
                </div>
                <p className="leading-7 text-text-secondary">{card.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

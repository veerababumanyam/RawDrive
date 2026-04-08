import Link from "next/link";
import { MapPin, SlidersHorizontal, Star } from "lucide-react";

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
  cards: MarketplaceCard[];
};

export function MarketplaceShowcasePage({
  eyebrow,
  title,
  description,
  previewSrc,
  previewAlt,
  primaryCta,
  secondaryCta,
  filters,
  cards,
}: MarketplaceShowcasePageProps) {
  return (
    <div className="bg-surface text-text-primary">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
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
          <div className="surface-panel flex flex-wrap gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <SlidersHorizontal className="h-4 w-4 text-accent" />
              Filters inspired by Stitch
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
          <div className="absolute inset-x-8 top-10 h-48 rounded-full bg-accent-muted blur-[120px]" />
          <div className="glass-card relative overflow-hidden p-3">
            <div className="overflow-hidden rounded-[1.5rem] bg-surface-container-high">
              <img src={previewSrc} alt={previewAlt} className="h-auto w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article key={card.name} className="surface-panel overflow-hidden">
              <div className="aspect-[4/3] bg-surface-container-high">
                <img src={card.image} alt={card.name} className="h-full w-full object-cover" />
              </div>
              <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-headline text-2xl font-bold text-text-primary">
                      {card.name}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">{card.specialty}</p>
                  </div>
                  <span className="rounded-full bg-accent-subtle px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                    {card.badge}
                  </span>
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

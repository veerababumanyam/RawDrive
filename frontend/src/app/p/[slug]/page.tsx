import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  getPublicPhotographerProfile,
  type PhotographerProfile,
  type ProfileCustomLink,
  type ProfileGallery,
} from "@/lib/api/photographer-profile";
import {
  customLinkHref,
  normalizeCustomLinks,
} from "@/lib/profile-custom-links";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle,
  Envelope,
  FolderOpen,
  Globe,
  MapPin,
  Phone,
  Photo,
  Send,
  Star,
  Tag,
} from "@/components/icons";
import { ProfileViewTracker } from "./profile-view-tracker";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

async function loadProfile(slug: string) {
  try {
    return await getPublicPhotographerProfile(slug);
  } catch {
    notFound();
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { profile, galleries, public_url } = await loadProfile(slug);
  const displayName =
    profile.display_name || profile.business_name || "Wedding Photographer";
  const title =
    profile.meta_title || `${displayName} - Indian Wedding Photographer`;
  const description =
    profile.meta_description ||
    profile.short_bio ||
    profile.tagline ||
    "Professional Indian wedding photographer profile on RawDrive.";
  const image =
    profile.og_image_url ||
    profile.avatar_cropped_url ||
    profile.avatar_url ||
    firstGalleryCover(galleries);

  return {
    title,
    description,
    keywords: profile.meta_keywords,
    alternates: public_url ? { canonical: public_url } : undefined,
    openGraph: {
      title,
      description,
      url: public_url,
      images: image ? [image] : undefined,
      type: "profile",
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicPhotographerProfilePage({ params }: Props) {
  const { slug } = await params;
  const { profile, galleries, public_url } = await loadProfile(slug);
  const avatar = profile.avatar_cropped_url || profile.avatar_url;
  // Public business logo (brand mark). Already a presigned absolute URL from the
  // API — rendered as a plain <img>, never decrypted (it is not a gallery asset).
  const logo = profile.business_logo_rendered_url || profile.business_logo_url;
  const displayName =
    profile.display_name || profile.business_name || "Wedding Photographer";
  const location = [profile.primary_city, profile.state, profile.country]
    .filter(Boolean)
    .join(", ");
  const testimonials = profileTestimonials(profile.testimonials);
  const customLinks = profileCustomLinks(profile.custom_links);
  const socials = socialLinks(profile);
  const serviceTags = [
    ...profile.specializations,
    ...profile.photography_styles,
    ...profile.languages_spoken,
  ];
  const equipment = equipmentLabels(profile.equipment);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: displayName,
    description:
      profile.meta_description || profile.short_bio || profile.tagline,
    image: avatar || firstGalleryCover(galleries),
    url: public_url,
    address: location
      ? { "@type": "PostalAddress", addressLocality: location }
      : undefined,
    telephone: profile.primary_phone || profile.whatsapp_number || undefined,
    email: profile.primary_email || undefined,
    areaServed: profile.covered_cities,
    priceRange: priceRange(profile),
  };

  return (
    <main className="min-h-screen bg-surface text-text-primary">
      <ProfileViewTracker slug={slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto min-h-screen max-w-xl px-4 py-6 sm:py-10">
        <section className="text-center">
          {logo ? (
            <div className="mx-auto mb-5 flex h-12 max-w-xs items-center justify-center">
              <img
                src={logo}
                alt={`${displayName} logo`}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : null}
          <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-raised shadow-glass">
            {avatar ? (
              <img
                src={avatar}
                alt={`${displayName} profile photo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <Photo className="h-10 w-10 text-text-tertiary" />
            )}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase text-text-tertiary">
            Indian Wedding Photographer
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-text-primary">
            {displayName}
          </h1>
          {profile.tagline ? (
            <p className="mx-auto mt-3 max-w-sm text-base leading-6 text-text-secondary">
              {profile.tagline}
            </p>
          ) : null}
          {location ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-container-low px-3 py-2 text-sm text-text-secondary">
              <MapPin className="h-4 w-4 text-accent" />
              <span>{location}</span>
            </div>
          ) : null}
        </section>

        <section className="mt-6 space-y-3" aria-label="Contact actions">
          {profile.whatsapp_number ? (
            <LinkBlock
              href={whatsappHref(profile.whatsapp_number)}
              label="WhatsApp"
              value="Message for availability"
              icon={<Send className="h-5 w-5" />}
              primary
            />
          ) : null}
          {profile.primary_email ? (
            <LinkBlock
              href={`mailto:${profile.primary_email}`}
              label="Email"
              value={profile.primary_email}
              icon={<Envelope className="h-5 w-5" />}
            />
          ) : null}
          {profile.primary_phone ? (
            <LinkBlock
              href={`tel:${profile.primary_phone}`}
              label="Call"
              value={profile.primary_phone}
              icon={<Phone className="h-5 w-5" />}
            />
          ) : null}
        </section>

        {galleries.length ? (
          <SectionBlock
            title="Featured galleries"
            icon={<FolderOpen className="h-5 w-5" />}
          >
            <div className="space-y-3">
              {galleries.map((gallery) => (
                <GalleryLink key={gallery.id} gallery={gallery} />
              ))}
            </div>
          </SectionBlock>
        ) : null}

        {profile.short_bio || profile.long_bio ? (
          <SectionBlock title="About" icon={<Briefcase className="h-5 w-5" />}>
            <p className="whitespace-pre-line text-sm leading-6 text-text-secondary">
              {profile.long_bio || profile.short_bio}
            </p>
          </SectionBlock>
        ) : null}

        {serviceTags.length ? (
          <SectionBlock
            title="Services"
            icon={<CheckCircle className="h-5 w-5" />}
          >
            <TagCloud values={serviceTags} />
          </SectionBlock>
        ) : null}

        {profile.starting_price || profile.price_range_max ? (
          <SectionBlock title="Pricing" icon={<Tag className="h-5 w-5" />}>
            <p className="text-2xl font-semibold text-text-primary">
              {priceRange(profile)}
            </p>
            {profile.payment_terms ? (
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {profile.payment_terms}
              </p>
            ) : null}
          </SectionBlock>
        ) : null}

        {testimonials.length || profile.average_rating ? (
          <SectionBlock title="Reviews" icon={<Star className="h-5 w-5" />}>
            {profile.average_rating ? (
              <p className="mb-3 text-sm font-semibold text-text-primary">
                {profile.average_rating.toFixed(1)} / 5 average rating
              </p>
            ) : null}
            <div className="space-y-3">
              {testimonials.map((item, index) => (
                <blockquote
                  key={`${item.name}-${index}`}
                  className="rounded-xl bg-surface-container-low p-4"
                >
                  <p className="text-sm leading-6 text-text-secondary">
                    {item.quote}
                  </p>
                  {item.name ? (
                    <footer className="mt-2 text-xs font-semibold text-text-primary">
                      {item.name}
                    </footer>
                  ) : null}
                </blockquote>
              ))}
            </div>
          </SectionBlock>
        ) : null}

        {profile.covered_cities.length || profile.travel_availability ? (
          <SectionBlock title="Location" icon={<MapPin className="h-5 w-5" />}>
            {profile.travel_availability ? (
              <p className="text-sm leading-6 text-text-secondary">
                {profile.travel_availability}
              </p>
            ) : null}
            {profile.covered_cities.length ? (
              <div className="mt-3">
                <TagCloud values={profile.covered_cities} />
              </div>
            ) : null}
          </SectionBlock>
        ) : null}

        {profile.years_experience || profile.total_weddings_shot ? (
          <section className="mt-4 grid grid-cols-2 gap-3">
            {profile.years_experience ? (
              <Metric
                icon={<CalendarDays className="h-5 w-5" />}
                label="Experience"
                value={`${profile.years_experience}+ years`}
              />
            ) : null}
            {profile.total_weddings_shot ? (
              <Metric
                icon={<Photo className="h-5 w-5" />}
                label="Weddings"
                value={`${profile.total_weddings_shot}+`}
              />
            ) : null}
          </section>
        ) : null}

        {profile.featured_in.length ? (
          <SectionBlock
            title="Awards / badges"
            icon={<Star className="h-5 w-5" />}
          >
            <TagCloud values={profile.featured_in} />
          </SectionBlock>
        ) : null}

        {equipment.length ? (
          <SectionBlock title="Equipment" icon={<Photo className="h-5 w-5" />}>
            <TagCloud values={equipment} />
          </SectionBlock>
        ) : null}

        {socials.length || customLinks.length ? (
          <section className="mt-4 space-y-3" aria-label="Links">
            {socials.map((link) => (
              <LinkBlock
                key={link.label}
                href={link.href}
                label={link.label}
                value={link.value}
                icon={<Globe className="h-5 w-5" />}
              />
            ))}
            {customLinks.map((link) => (
              <LinkBlock
                key={`${link.label}-${link.url}`}
                href={customLinkHref(link.url)}
                label={link.label}
                value={link.url}
                icon={<ArrowRight className="h-5 w-5" />}
              />
            ))}
          </section>
        ) : null}

        <footer className="py-8 text-center text-xs text-text-tertiary">
          Powered by RawDrive
        </footer>
      </div>
    </main>
  );
}

function firstGalleryCover(galleries: ProfileGallery[]) {
  const cover = galleries
    .map((gallery) => gallery.cover_thumbnails || {})
    .map(
      (thumbs) =>
        thumbs.display_webp ||
        thumbs.thumb_lg_webp ||
        thumbs.thumb_md_webp ||
        thumbs.thumb_sm_webp ||
        "",
    )
    .find(Boolean);
  return cover ? getStorageBackedUrl(cover) : "";
}

function priceRange(profile: PhotographerProfile): string {
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
  if (profile.starting_price && profile.price_range_max) {
    return `${money.format(profile.starting_price)} - ${money.format(profile.price_range_max)}`;
  }
  if (profile.starting_price)
    return `From ${money.format(profile.starting_price)}`;
  if (profile.price_range_max)
    return `Up to ${money.format(profile.price_range_max)}`;
  return "Custom quote";
}

function whatsappHref(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : externalUrl(value);
}

function externalUrl(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value.replace(/^@/, "")}`;
}

function socialLinks(profile: PhotographerProfile) {
  return [
    ["Instagram", profile.social_instagram],
    ["Facebook", profile.social_facebook],
    ["LinkedIn", profile.social_linkedin],
    ["YouTube", profile.social_youtube],
    ["Pinterest", profile.social_pinterest],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => ({
      label,
      value: String(value),
      href: socialUrl(label, String(value)),
    }));
}

function socialUrl(label: string, value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const handle = value.replace(/^@/, "");
  switch (label) {
    case "Instagram":
      return `https://instagram.com/${handle}`;
    case "Facebook":
      return `https://facebook.com/${handle}`;
    case "LinkedIn":
      return `https://linkedin.com/in/${handle}`;
    case "YouTube":
      return `https://youtube.com/${handle}`;
    case "Pinterest":
      return `https://pinterest.com/${handle}`;
    default:
      return externalUrl(value);
  }
}

function profileCustomLinks(links: ProfileCustomLink[]): ProfileCustomLink[] {
  return normalizeCustomLinks(links);
}

function profileTestimonials(value: unknown[]) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const quote = String(record.quote || record.text || record.body || "");
      const name = String(record.name || record.client || "");
      return quote ? { quote, name } : null;
    })
    .filter((item): item is { quote: string; name: string } => Boolean(item));
}

function equipmentLabels(value: Record<string, unknown>): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .flatMap(([key, item]) => {
      if (Array.isArray(item)) return item.map(String);
      if (typeof item === "string" && item.trim()) return [item];
      if (typeof item === "boolean" && item) return [key];
      return [];
    })
    .slice(0, 12);
}

function SectionBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-border-default bg-surface-raised p-4 shadow-glass">
      <div className="mb-3 flex items-center gap-2 text-text-primary">
        <span className="text-accent">{icon}</span>
        <h2 className="text-sm font-semibold uppercase text-text-tertiary">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function LinkBlock({
  href,
  label,
  value,
  icon,
  primary = false,
}: {
  href: string;
  label: string;
  value?: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className={
        primary
          ? "touch-target-link group flex items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-text-inverse shadow-glass"
          : "touch-target-link group flex items-center gap-3 rounded-2xl border border-border-default bg-surface-raised px-4 py-3 text-text-primary shadow-glass"
      }
    >
      <span
        className={
          primary
            ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-text-inverse"
            : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-accent"
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-semibold">{label}</span>
        {value ? (
          <span
            className={
              primary
                ? "mt-1 block truncate text-xs text-text-inverse"
                : "mt-1 block truncate text-xs text-text-tertiary"
            }
          >
            {value}
          </span>
        ) : null}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
    </a>
  );
}

function GalleryLink({ gallery }: { gallery: ProfileGallery }) {
  const cover = getStorageBackedUrl(
    gallery.cover_thumbnails?.thumb_md_webp ||
      gallery.cover_thumbnails?.thumb_sm_webp ||
      gallery.cover_thumbnails?.thumb_lg_webp ||
      gallery.cover_thumbnails?.display_webp ||
      "",
  );
  return (
    <a
      href={`/g/${gallery.slug}?from=profile`}
      className="touch-target-link flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-container-low p-3 text-text-primary"
    >
      <span className="flex h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-sunken">
        {cover ? (
          <img
            src={cover}
            alt={`${gallery.title} gallery cover`}
            className="h-full w-full object-cover"
          />
        ) : (
          <FolderOpen className="m-auto h-6 w-6 text-text-tertiary" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          {gallery.title}
        </span>
        {gallery.description ? (
          <span className="mt-1 line-clamp-2 text-xs text-text-tertiary">
            {gallery.description}
          </span>
        ) : null}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary" />
    </a>
  );
}

function TagCloud({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="status-badge status-badge--accent">
          {value}
        </span>
      ))}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border-default bg-surface-raised p-4 shadow-glass">
      <div className="text-accent">{icon}</div>
      <p className="mt-3 text-lg font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-tertiary">{label}</p>
    </div>
  );
}

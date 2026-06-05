import { notFound } from "next/navigation";
import {
  getPublicStudioLanding,
  type PublicStudioGallery,
  type PublicStudioProfile,
} from "@/lib/api/galleries";
import { getApiBaseUrl } from "@/lib/api/base-url";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { StudioGalleryGrid } from "./StudioGalleryGrid";

interface Props {
  searchParams?: Promise<{ ws?: string }>;
}

const API_BASE = getApiBaseUrl();

function absoluteApiUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

function pickGalleryCover(gallery?: PublicStudioGallery | null): string {
  const variants = gallery?.cover_thumbnails;
  if (!variants) return "";
  const url =
    variants.thumb_lg_webp ||
    variants.thumb_md_webp ||
    variants.thumb_sm_webp ||
    variants.display_webp ||
    "";
  return getStorageBackedUrl(url);
}

function studioAddress(studio: PublicStudioProfile): string {
  return [
    studio.address_line1,
    studio.address_line2,
    studio.city,
    studio.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function StudioLogo({ studio }: { studio: PublicStudioProfile }) {
  const logoUrl = absoluteApiUrl(studio.logo_url);
  if (!logoUrl) {
    return (
      <div
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-surface-elevated/80 text-2xl font-semibold text-text-primary shadow-glass"
      >
        {studio.display_name.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={`${studio.display_name} logo`}
      className="h-16 w-16 shrink-0 rounded-2xl border border-border-subtle bg-surface-elevated object-cover shadow-glass"
    />
  );
}

export default async function StudioLandingPage({ searchParams }: Props) {
  const query = searchParams ? await searchParams : {};
  const ws = typeof query.ws === "string" && query.ws ? query.ws : "";
  if (!ws) notFound();

  let landing;
  try {
    landing = await getPublicStudioLanding(ws);
  } catch (err) {
    // A genuine "studio not found" (404) renders the not-found page. Any other
    // failure (backend unreachable, 5xx, timeout) must SURFACE rather than be
    // masked as a 404 — that masking silently hid a production outage where SSR
    // could not reach the API. Log it and rethrow so it is a visible error.
    if ((err as { notFound?: boolean } | null)?.notFound) notFound();
    console.error(`[studio] landing SSR failed for ws=${ws}:`, err);
    throw err;
  }

  const { studio, galleries, counts } = landing;
  const initialNextCursor = landing.next_cursor ?? null;
  const heroCover = pickGalleryCover(galleries[0]);
  const address = studioAddress(studio);
  const logoUrl = absoluteApiUrl(studio.logo_url);

  return (
    <main className="min-h-screen bg-surface text-text-primary">
      <section className="relative min-h-[72vh] overflow-hidden">
        {heroCover ? (
          <img
            src={heroCover}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-surface-overlay glass-blur-subtle" />
        <div className="absolute inset-0 bg-surface-sunken/70" />

        <div className="relative mx-auto flex min-h-[72vh] max-w-7xl flex-col justify-end px-6 py-10 sm:px-8 lg:px-10">
          <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-4">
              <StudioLogo studio={studio} />
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-text-secondary">
                  Client Galleries
                </p>
                <h1 className="mt-2 text-4xl font-semibold text-text-primary sm:text-6xl">
                  {studio.display_name}
                </h1>
              </div>
            </div>

            <p className="max-w-2xl text-lg text-text-secondary sm:text-xl">
              Browse the latest published galleries from {studio.display_name}.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href="#galleries"
                className="inline-flex min-h-[44px] items-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-text-inverse transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                View galleries
              </a>
              {studio.website ? (
                <a
                  href={studio.website}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle bg-surface-elevated/70 px-5 py-3 text-sm font-semibold text-text-primary glass-blur-soft transition hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-border-focus"
                >
                  Visit website
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border-subtle bg-surface-elevated/70 px-6 py-6 glass-blur-soft sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-text-tertiary">Published galleries</p>
            <p className="mt-1 text-2xl font-semibold text-text-primary">
              {counts.published_galleries}
            </p>
          </div>
          {studio.phone ? (
            <a
              className="rounded-xl p-3 text-text-secondary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
              href={`tel:${studio.phone}`}
            >
              <span className="block text-sm text-text-tertiary">Phone</span>
              <span className="mt-1 block font-medium text-text-primary">
                {studio.phone}
              </span>
            </a>
          ) : null}
          {studio.email ? (
            <a
              className="rounded-xl p-3 text-text-secondary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
              href={`mailto:${studio.email}`}
            >
              <span className="block text-sm text-text-tertiary">Email</span>
              <span className="mt-1 block font-medium text-text-primary">
                {studio.email}
              </span>
            </a>
          ) : null}
          {address ? (
            <div className="rounded-xl p-3">
              <span className="block text-sm text-text-tertiary">Studio</span>
              <span className="mt-1 block font-medium text-text-primary">
                {address}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="galleries"
        className="mx-auto max-w-7xl px-6 py-12 sm:px-8 lg:px-10"
      >
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-text-tertiary">
              Latest work
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-text-primary">
              Published galleries
            </h2>
          </div>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              aria-hidden="true"
              className="hidden h-10 w-10 rounded-xl border border-border-subtle object-cover sm:block"
            />
          ) : null}
        </div>

        <StudioGalleryGrid
          subdomain={studio.business_subdomain}
          initialGalleries={galleries}
          initialNextCursor={initialNextCursor}
        />
      </section>
    </main>
  );
}

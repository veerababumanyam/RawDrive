import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getPublicGallery,
  getPublicGalleryAlbums,
  getPublicGalleryAssets,
  getPublicGalleryBranding,
  getPublicGalleryWithSession,
} from "@/lib/api/galleries";
import { PublicGalleryAlbumChips } from "@/components/gallery/public-gallery-album-chips";
import { listPublicBanners, listPublicProducts } from "@/lib/api/commerce";
import { PublicGalleryEnhancements } from "@/components/gallery/public-gallery-enhancements";
import { PublicGalleryGrid } from "@/components/gallery/public-gallery-grid";
import { PublicGalleryProducts } from "@/components/gallery/public-gallery-products";
import { PublicGalleryBanners } from "@/components/gallery/public-gallery-banners";
import { GalleryPasswordGate } from "@/components/gallery/gallery-password-gate";
import { GalleryLockedShell } from "@/components/gallery/gallery-locked-shell";
import { SharePinGate } from "@/components/gallery/share-pin-gate";
import { PublicGalleryHero } from "@/components/gallery/public-gallery-hero";
import { PublicGallerySessionBridge } from "@/components/gallery/public-gallery-session-bridge";
import { GalleryExpiryBanner } from "@/components/gallery/gallery-expiry-banner";
import {
  galleryAccentCssVars,
  resolveGalleryAccent,
} from "@/lib/gallery-accent";
import {
  readPublicDesignConfig,
  readPublicCoverThumbnails,
} from "@/lib/gallery-design-config";
import { EmbeddedVideosPanel } from "@/components/gallery/embedded-videos-panel";
import { readEmbeddedVideos } from "@/lib/embedded-videos";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { Clock, Photo } from "@/components/icons";
import { buildPublicGalleryJsonLd, serializeJsonLd } from "@/lib/seo";
import { OfflineCacher } from "@/components/offline/offline-cacher";
import { OfflineStorageLauncher } from "@/components/offline/offline-storage-launcher";
import { PublicGalleryOfflineGate } from "@/components/gallery/public-gallery-offline-gate";
import {
  resolveEffectiveSessionToken,
  shouldInstallMintedSession,
} from "./session-token";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ album?: string; ws?: string; share?: string }>;
}

export const dynamic = "force-dynamic";

function PublicGalleryUnavailable({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: "clock" | "photo";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="max-w-md px-4 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-sunken">
          {icon === "clock" ? (
            <Clock className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
          ) : (
            <Photo className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
          )}
        </div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{body}</p>
      </div>
    </div>
  );
}

export default async function PublicGalleryPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const albumId =
    typeof query.album === "string" && query.album ? query.album : undefined;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("gallery_session")?.value;
  // `ws` is set by middleware.ts when the request arrived via the per-business
  // subdomain `<biz>-<code>.rawdrive.in/<gallery-slug>`. Forwarded to the
  // backend API so the gallery lookup is scoped to that workspace; absence
  // means the request hit the apex `/g/<slug>` route and falls back to the
  // unscoped legacy lookup.
  const ws = typeof query.ws === "string" && query.ws ? query.ws : undefined;
  // S4-G2: a share-link landing arrives as /g/{slug}?share=<token>. When the
  // link is PIN-gated and no session cookie exists yet, we render the PIN gate
  // (which mints the session and reloads). The bare token alone never unlocks.
  const shareToken =
    typeof query.share === "string" && query.share ? query.share : undefined;

  let gallery;
  let effectiveSessionToken = sessionToken;
  // When the visitor had no gallery_session cookie but the backend minted a
  // fresh share-scoped session during THIS server-side render (returned via the
  // X-Gallery-Session header), that token unlocked the SSR render only — it was
  // never installed in the browser. Capture it so PublicGallerySessionBridge can
  // persist it client-side (cookie + sessionStorage); otherwise the next client
  // navigation (Find me, People, Back to gallery, photo links) has no session
  // and is denied. Null whenever a cookie already exists or nothing was minted.
  // See issue #156.
  let freshlyMintedSessionToken: string | null = null;
  try {
    const result = await getPublicGalleryWithSession(
      slug,
      ws,
      sessionToken,
      shareToken,
    );
    gallery = result.gallery;
    // Prefer the freshly-minted, this-gallery-scoped token over a possibly
    // stale `gallery_session` cookie, and surface a differing mint to the
    // bridge so the stale cookie is corrected client-side too. See
    // ./session-token.ts for why (issue #182).
    if (shouldInstallMintedSession(sessionToken, result.gallerySessionToken)) {
      freshlyMintedSessionToken = result.gallerySessionToken;
    }
    effectiveSessionToken = resolveEffectiveSessionToken(
      sessionToken,
      result.gallerySessionToken,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("410") || msg.includes("expired")) {
      return (
        <PublicGalleryUnavailable
          title="Gallery Has Expired"
          body="This gallery is no longer available. Please contact the photographer if you need access."
          icon="clock"
        />
      );
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return (
        <PublicGalleryUnavailable
          title="Gallery Not Yet Available"
          body="This gallery has not been published yet. Please check back soon or contact the photographer for access."
          icon="photo"
        />
      );
    }
    notFound();
  }

  // S4-G3: the backend returns a minimal locked shell ({ access_gated: true,
  // access_mode, has_password }) for a private / invite-only gallery viewed
  // without a valid session. Render a real locked state instead of falling
  // through to an empty grid. If the visitor arrived via a PIN-gated share
  // link (?share=<token>), offer the PIN gate so they can unlock in place.
  if (gallery.access_gated === true) {
    const branding = await getPublicGalleryBranding(slug, ws, shareToken).catch(
      () => null,
    );
    const brandName = branding?.can_customize ? branding.brand_name : undefined;
    const logoUrl = branding?.can_customize ? branding.logo_url : undefined;
    if (shareToken) {
      return (
        <SharePinGate
          slug={slug}
          shareToken={shareToken}
          ws={ws}
          brandName={brandName}
          logoUrl={logoUrl}
        />
      );
    }
    const mode = (gallery.access_mode || "").toLowerCase();
    return (
      <GalleryLockedShell
        variant={mode === "invite-only" ? "invite-only" : "private"}
        title={gallery.title}
        brandName={brandName}
        logoUrl={logoUrl}
      />
    );
  }

  const hasPassword = gallery.settings?.has_password === true;
  const followupShareToken = effectiveSessionToken ? undefined : shareToken;

  if (hasPassword && !effectiveSessionToken) {
    const branding = await getPublicGalleryBranding(slug, ws, shareToken).catch(
      () => null,
    );
    return (
      <GalleryPasswordGate
        slug={slug}
        brandName={branding?.can_customize ? branding.brand_name : undefined}
        logoUrl={branding?.can_customize ? branding.logo_url : undefined}
      >
        <></>
      </GalleryPasswordGate>
    );
  }

  let assets;
  try {
    assets = await getPublicGalleryAssets(
      slug,
      albumId,
      ws,
      effectiveSessionToken,
      followupShareToken,
    );
  } catch (err) {
    if (hasPassword) {
      const branding = await getPublicGalleryBranding(
        slug,
        ws,
        shareToken,
      ).catch(() => null);
      return (
        <GalleryPasswordGate
          slug={slug}
          brandName={branding?.can_customize ? branding.brand_name : undefined}
          logoUrl={branding?.can_customize ? branding.logo_url : undefined}
        >
          <></>
        </GalleryPasswordGate>
      );
    }
    throw err;
  }

  // Fetch products, banners, branding, and the public album list in
  // parallel. Albums are best-effort — getPublicGalleryAlbums swallows
  // errors and returns [] so an album-service outage doesn't blow up
  // the whole public page; the chip strip simply hides itself.
  const [products, banners, branding, albums] = await Promise.all([
    listPublicProducts(slug, ws, followupShareToken, effectiveSessionToken),
    listPublicBanners(slug, ws, followupShareToken, effectiveSessionToken),
    getPublicGalleryBranding(
      slug,
      ws,
      followupShareToken,
      effectiveSessionToken,
    ).catch(() => null),
    getPublicGalleryAlbums(slug, ws, effectiveSessionToken, followupShareToken),
  ]);

  // For the "All Photos" chip count we need the gallery-wide asset
  // count, not just the currently-rendered (album-filtered) set.
  // Re-fetch only when an album filter is active; otherwise reuse the
  // already-loaded `assets` length to avoid a second round-trip.
  const totalAssetCount = albumId
    ? (
        await getPublicGalleryAssets(
          slug,
          undefined,
          ws,
          effectiveSessionToken,
          followupShareToken,
        ).catch(() => [])
      ).length
    : assets.length;

  // Design config saved by the Gallery Design Studio. The public viewer
  // needs this so the share link renders with the cover image, cover
  // style, typography, accent color, and grid layout the photographer
  // configured. Cover thumbnails are resolved server-side (see
  // backend/internal/handler/public_gallery_handler.go::GetBySlug) so the
  // saved cover image renders even when an album filter (?album=X) would
  // otherwise hide it from the asset list.
  const designConfig = readPublicDesignConfig(gallery.settings);
  const designCoverThumbnails = readPublicCoverThumbnails(gallery.settings);
  // SEC-1: the backend mints a short-lived, gallery-scoped asset-access token
  // into gallery.settings.asset_access_token once access is proven (valid
  // session forwarded on this server-side fetch). Header-less <img>/<audio>
  // byte loads carry it as ?at= — the durable session is never put in a URL.
  const assetAccessToken =
    gallery.settings &&
    typeof (gallery.settings as Record<string, unknown>).asset_access_token ===
      "string"
      ? ((gallery.settings as Record<string, unknown>)
          .asset_access_token as string)
      : null;
  const designCoverAssetId =
    designConfig?.cover?.assetId || gallery.cover_asset_id;
  const designCoverAsset = designCoverAssetId
    ? (assets.find((asset) => asset.id === designCoverAssetId) ?? null)
    : null;
  // 2026-05-18: embedded YouTube/Vimeo videos. Same shape the dashboard
  // editor writes — see frontend/src/lib/embedded-videos.ts. Empty list
  // makes the panel render nothing (read-only short-circuits).
  const embeddedVideos = readEmbeddedVideos(
    gallery.settings as Record<string, unknown> | undefined,
  );

  // White-label accent: layer the studio / per-gallery brand colour over the
  // active theme by overriding the accent token custom properties for this
  // subtree. All `accent-*` token classes (grid selection, buttons, links) and
  // their color-mix derivations adopt it automatically. Null → theme default.
  const galleryAccent = resolveGalleryAccent({
    design: designConfig,
    branding,
  });

  // ImageGallery structured data so shared links are grounded for search
  // and AI engines. Uses the same encrypted-safe cover resolution as
  // generateMetadata above.
  const jsonLdCoverManifest = {
    ...(gallery.cover_asset?.thumbnail_urls ?? {}),
    ...(gallery.cover_thumbnails ?? {}),
  } as Record<string, string>;
  const jsonLdCoverKey =
    jsonLdCoverManifest["og_image"] ||
    jsonLdCoverManifest["cover_1280"] ||
    jsonLdCoverManifest["display_webp"];
  const galleryJsonLd = buildPublicGalleryJsonLd({
    slug,
    title: gallery.title,
    description:
      gallery.description ||
      `View ${gallery.title} by ${
        branding?.can_customize ? branding.brand_name : "RawDrive"
      }`,
    brandName: branding?.can_customize ? branding.brand_name : "RawDrive",
    imageUrl:
      jsonLdCoverKey &&
      !jsonLdCoverKey.toLowerCase().split("?", 1)[0].endsWith(".enc")
        ? getStorageBackedUrl(jsonLdCoverKey)
        : undefined,
    publishedAt: gallery.published_at,
  });

  // Offline gate: when the visitor is offline AND this gallery has a saved local
  // copy, render the decrypt-capable React renderer (<OfflineGalleryView/>, which
  // reuses PublicGalleryGrid → useDecryptedAssetUrl so E2EE galleries decrypt
  // cache-first from Cache Storage) instead of the online content below. When
  // online, the gate returns `galleryBody` untouched — the online path is
  // byte-for-byte unchanged. The OfflineCacher still runs inside `galleryBody`
  // online so the local copy stays warm. See public-gallery-offline-gate.tsx.
  const galleryBody = (
    <div
      className="min-h-screen bg-surface"
      style={galleryAccentCssVars(galleryAccent)}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(galleryJsonLd) }}
      />
      {/* Install the server-render-minted share session into the browser so
          "Find me", People, "Back to gallery", and photo links keep working
          after a no-PIN share-link unlock. Mounts only when a fresh session was
          minted this render (no pre-existing cookie). See issue #156. */}
      {freshlyMintedSessionToken && (
        <PublicGallerySessionBridge
          slug={slug}
          gallerySessionToken={freshlyMintedSessionToken}
        />
      )}
      <OfflineCacher
        gallery={gallery}
        assets={assets}
        ws={ws ?? null}
        assetAccessToken={assetAccessToken}
      />
      <PublicGalleryHero
        gallery={gallery}
        assets={assets}
        branding={branding}
        design={designConfig}
        designCoverAsset={designCoverAsset}
        designCoverThumbnails={designCoverThumbnails}
        // Public slideshow ("Play" CTA next to "View Gallery"). When the
        // gallery has music it auto-opens on mount so the music plays as soon
        // as the share link loads. assetAccessToken is the byte-only ?at=
        // token; the durable share token is only forwarded when no asset
        // token was minted (same split the grid uses).
        slug={slug}
        ws={ws}
        hasMusic={Boolean(gallery.music_asset_id)}
        assetAccessToken={assetAccessToken}
        shareToken={assetAccessToken ? undefined : followupShareToken}
        // "Find me" photo-search CTA in the hero CTA row (replaces the old
        // floating FAB). face_detection_enabled defaults to true in the schema
        // (migration 046), so only an explicit false hides the CTA.
        faceDetectionEnabled={gallery.face_detection_enabled !== false}
      />

      <GalleryExpiryBanner expiresAt={gallery.expires_at} />

      <PublicGalleryBanners
        slug={slug}
        ws={ws}
        shareToken={followupShareToken}
        gallerySessionToken={effectiveSessionToken}
        initialBanners={banners}
      />

      <PublicGalleryAlbumChips
        slug={slug}
        albums={albums}
        totalAssetCount={totalAssetCount}
        activeAlbumId={albumId}
      />

      <div id="gallery-grid" className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
        {/* The public slideshow launch control ("Play") now lives in the hero
            next to "View Gallery" — see PublicGalleryHero. */}
        {/* Embedded YouTube/Vimeo videos in read-only mode. Shows the
            same iframe grid the photographer sees in the dashboard
            editor; the panel auto-hides when the gallery has none. */}
        {embeddedVideos.length > 0 && (
          <EmbeddedVideosPanel
            galleryId={gallery.id}
            initialVideos={embeddedVideos}
            readOnly
          />
        )}
        <PublicGalleryGrid
          slug={slug}
          assets={assets}
          galleryType={gallery.gallery_type}
          maxSelections={gallery.max_selections || 0}
          downloadEnabled={gallery.download_enabled !== false}
          downloadQuality={gallery.download_quality}
          design={designConfig}
          watermark={gallery.watermark_config as Record<string, unknown> | null}
          watermarkLogoUrl={
            branding?.can_customize ? branding.logo_url : undefined
          }
          // gallerySessionToken (durable session, from the SameSite=Strict
          // cookie) authenticates the header-based JSON APIs: favorites and
          // proofing submit. assetAccessToken (SEC-1) is the byte-only ?at=
          // token for protected image/download URLs — kept separate so the
          // durable session never lands in a URL.
          gallerySessionToken={effectiveSessionToken ?? null}
          assetAccessToken={assetAccessToken}
          workspaceScope={ws ?? null}
        />
      </div>

      <PublicGalleryProducts
        slug={slug}
        workspaceScope={ws}
        shareToken={followupShareToken}
        gallerySessionToken={effectiveSessionToken}
        products={products}
      />

      <PublicGalleryEnhancements
        slug={slug}
        faceIdEnabled={Boolean(gallery.faceid_enabled)}
        encrypted={Boolean(gallery.cover_asset?.is_encrypted)}
      />

      {/* Reachable entry point for the offline manage/remove surface
          (DPDP/GDPR erasure of locally-cached gallery bytes). Client-only —
          it probes navigator.storage / Cache Storage and self-hides where
          offline saving is unsupported. */}
      <OfflineStorageLauncher />
    </div>
  );

  // Wrap the online body in the offline gate. When the visitor is offline and a
  // local copy exists, the gate swaps in <OfflineGalleryView/>; otherwise it
  // renders `galleryBody` untouched. Password gating already happened up-front
  // (see the `hasPassword && !effectiveSessionToken` short-circuit above), so by
  // the time we reach here access is proven and no second gate is needed.
  const galleryContent = (
    <PublicGalleryOfflineGate slug={slug}>
      {galleryBody}
    </PublicGalleryOfflineGate>
  );

  return galleryContent;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  // Read `ws` (set by middleware on requests via <biz>-<code>.rawdrive.in)
  // and forward it to both API calls — otherwise metadata would use the
  // unscoped lookup and leak the title of any same-slug gallery in a
  // different workspace, even when the body correctly 404s.
  const query = searchParams ? await searchParams : {};
  const ws = typeof query.ws === "string" && query.ws ? query.ws : undefined;
  try {
    const [gallery, branding] = await Promise.all([
      getPublicGallery(slug, ws),
      getPublicGalleryBranding(slug, ws).catch(() => null),
    ]);
    const brandName = branding?.can_customize
      ? branding.brand_name
      : "RawDrive";
    const description =
      gallery.description || `View ${gallery.title} by ${brandName}`;
    // Rich share preview: prefer the purpose-built og_image derivative
    // (1200x630), then responsive cover variants, then the large thumb.
    // Skip encrypted covers — their bytes cannot be fetched by crawlers.
    const coverManifest = {
      ...(gallery.cover_asset?.thumbnail_urls ?? {}),
      ...(gallery.cover_thumbnails ?? {}),
    } as Record<string, string>;
    const ogKey =
      coverManifest["og_image"] ||
      coverManifest["cover_1280"] ||
      coverManifest["cover_1920"] ||
      coverManifest["display_webp"] ||
      coverManifest["thumb_lg_webp"];
    const ogImageUrl =
      ogKey && !ogKey.toLowerCase().split("?", 1)[0].endsWith(".enc")
        ? getStorageBackedUrl(ogKey)
        : undefined;
    const canonicalPath = `/g/${slug}`;
    return {
      title: `${gallery.title} | ${brandName}`,
      description,
      alternates: { canonical: canonicalPath },
      openGraph: {
        title: gallery.title,
        description,
        type: "website",
        url: canonicalPath,
        siteName: brandName,
        ...(ogImageUrl
          ? {
              images: [
                {
                  url: ogImageUrl,
                  width: 1200,
                  height: 630,
                  alt: gallery.title,
                },
              ],
            }
          : {}),
      },
      twitter: {
        card: ogImageUrl ? "summary_large_image" : "summary",
        title: gallery.title,
        description,
        ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
      },
    };
  } catch {
    return { title: "Gallery Not Found" };
  }
}

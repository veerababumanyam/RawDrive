import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getPublicGallery,
  getPublicGalleryAssets,
  getPublicGalleryBranding,
} from "@/lib/api/galleries";
import { SinglePhotoView } from "@/components/gallery/single-photo-view";

// Public single-photo viewer. The per-tile Share button on the public
// gallery grid (and the lightbox toolbar's Share button) builds links to
// this route so a recipient sees only the shared photo — not the rest of
// the gallery. The page enforces:
//
//   - Gallery is published (otherwise 404)
//   - Gallery has not expired (otherwise 410-equivalent unavailable page)
//   - Asset belongs to this gallery (otherwise 404 — prevents asset-id
//     enumeration from sister galleries)
//
// We deliberately do NOT enforce gallery password-gating here for v1.
// Rationale: the share link is itself the access grant (it carries the
// asset UUID and the photographer chose to share it). If the photographer
// has set a password, the gallery shell is gated but a direct asset-share
// link bypasses it. If we add password enforcement later it should be an
// explicit gallery setting ("Require password on shared-photo links") so
// existing share URLs don't break overnight.

interface Props {
  params: Promise<{ slug: string; assetId: string }>;
  searchParams?: Promise<{ ws?: string }>;
}

function PhotoUnavailable({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="max-w-md px-4 text-center">
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{body}</p>
      </div>
    </div>
  );
}

export default async function PublicSinglePhotoPage({ params, searchParams }: Props) {
  const { slug, assetId } = await params;
  const query = searchParams ? await searchParams : {};
  const ws = typeof query.ws === "string" && query.ws ? query.ws : undefined;
  // S4-G1: forward the gallery-session cookie (when present) so a gated
  // gallery's asset listing + protected image bytes resolve for a recipient
  // who already unlocked the gallery shell in this browser.
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("gallery_session")?.value ?? null;

  let gallery;
  let assets;
  try {
    gallery = await getPublicGallery(slug, ws, sessionToken);
    assets = await getPublicGalleryAssets(slug, undefined, ws, sessionToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("410") || msg.includes("expired")) {
      return (
        <PhotoUnavailable
          title="Photo Has Expired"
          body="This photo is no longer available. Please contact the photographer if you need access."
        />
      );
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return (
        <PhotoUnavailable
          title="Photo Not Available"
          body="This photo is not currently published. Please check back soon or contact the photographer."
        />
      );
    }
    notFound();
  }

  const photo = assets.find((a) => a.id === assetId);
  if (!photo) {
    // Verifies the asset actually belongs to this gallery — prevents a
    // recipient from swapping the assetId in the URL to view a photo from
    // a different (sibling) gallery they weren't shared.
    return (
      <PhotoUnavailable
        title="Photo Not Found"
        body="This photo is not part of the shared gallery."
      />
    );
  }

  const branding = await getPublicGalleryBranding(slug, ws).catch(() => null);

  return (
    <SinglePhotoView
      slug={slug}
      photo={photo}
      gallery={gallery}
      branding={branding}
      gallerySessionToken={sessionToken}
    />
  );
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug, assetId } = await params;
  const query = searchParams ? await searchParams : {};
  const ws = typeof query.ws === "string" && query.ws ? query.ws : undefined;
  try {
    const [gallery, branding] = await Promise.all([
      getPublicGallery(slug, ws),
      getPublicGalleryBranding(slug, ws).catch(() => null),
    ]);
    const brandName = branding?.can_customize ? branding.brand_name : "RawDrive";
    return {
      title: `Photo | ${brandName}`,
      description: `A photo shared from ${gallery.title}`,
      // Single-photo view is meant for direct recipient access — don't let
      // search engines index a per-asset URL that may carry private content.
      robots: { index: false, follow: false },
      openGraph: {
        title: `${gallery.title}`,
        description: `Shared photo from ${brandName}`,
        type: "website",
        images: assetId ? undefined : [],
      },
    };
  } catch {
    return { title: "Photo Not Found", robots: { index: false, follow: false } };
  }
}

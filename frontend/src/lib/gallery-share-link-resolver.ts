import type {
  CreateGalleryShareLinkInput,
  GalleryShareLink,
} from "@/lib/api/galleries";

const STABLE_SHARE_CHANNEL = "copy";
const REUSABLE_STABLE_CHANNELS = new Set([STABLE_SHARE_CHANNEL, "share-qr"]);

interface ReusableShareLinkOptions {
  downloadAllowed: boolean;
  now?: Date;
}

interface ResolveStableShareLinkInput extends ReusableShareLinkOptions {
  token: string;
  galleryId: string;
  expiryDays?: number;
  listLinks: (token: string, galleryId: string) => Promise<GalleryShareLink[]>;
  createLink: (
    token: string,
    galleryId: string,
    input: CreateGalleryShareLinkInput,
  ) => Promise<GalleryShareLink>;
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isReusableStableGalleryShareLink(
  link: GalleryShareLink,
  { downloadAllowed, now = new Date() }: ReusableShareLinkOptions,
): boolean {
  if (link.revoked_at) return false;
  if (link.permissions?.access_mode !== "public") return false;
  if (!REUSABLE_STABLE_CHANNELS.has(link.permissions?.channel ?? "")) {
    return false;
  }
  if (link.download_allowed !== downloadAllowed) return false;
  if (link.max_access_count != null) return false;
  if (link.expires_at) {
    const expiresAt = Date.parse(link.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      return false;
    }
  }
  return true;
}

export function newestReusableStableGalleryShareLink(
  links: readonly GalleryShareLink[],
  options: ReusableShareLinkOptions,
): GalleryShareLink | null {
  return (
    links
      .filter((link) => isReusableStableGalleryShareLink(link, options))
      .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))[0] ??
    null
  );
}

export async function resolveStablePublicGalleryShareLink({
  token,
  galleryId,
  downloadAllowed,
  expiryDays,
  listLinks,
  createLink,
  now = new Date(),
}: ResolveStableShareLinkInput): Promise<GalleryShareLink> {
  const existing = newestReusableStableGalleryShareLink(
    await listLinks(token, galleryId),
    { downloadAllowed, now },
  );
  if (existing) return existing;

  return createLink(token, galleryId, {
    access_mode: "public",
    download_allowed: downloadAllowed,
    channel: STABLE_SHARE_CHANNEL,
    ...(expiryDays !== undefined ? { expiry_days: expiryDays } : {}),
  });
}

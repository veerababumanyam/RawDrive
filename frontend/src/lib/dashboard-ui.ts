export const invoiceStatusClasses: Record<string, string> = {
  draft: "status-badge status-badge--neutral",
  sent: "status-badge status-badge--info",
  paid: "status-badge status-badge--success",
  partially_paid: "status-badge status-badge--warning",
  overdue: "status-badge status-badge--danger",
  cancelled: "status-badge status-badge--neutral",
};

export const leadStageClasses: Record<string, string> = {
  new: "status-badge status-badge--info",
  contacted: "status-badge status-badge--warning",
  qualified: "status-badge status-badge--accent",
  proposal: "status-badge status-badge--warning",
  negotiation: "status-badge status-badge--info",
  won: "status-badge status-badge--success",
  lost: "status-badge status-badge--danger",
};

export const calendarEventClasses: Record<string, string> = {
  shoot: "status-badge status-badge--accent",
  meeting: "status-badge status-badge--info",
  editing: "status-badge status-badge--accent",
  personal: "status-badge status-badge--success",
  travel: "status-badge status-badge--warning",
  blocked: "status-badge status-badge--danger",
};

export const moderationReasonClasses: Record<string, string> = {
  auto_flagged: "status-badge status-badge--warning",
  reported: "status-badge status-badge--danger",
};

export const availabilityClasses: Record<string, string> = {
  available: "status-badge status-badge--success",
  unavailable: "status-badge status-badge--danger",
};

export const proofingStatusClasses: Record<string, string> = {
  selected: "status-badge status-badge--accent",
  approved: "status-badge status-badge--success",
  rejected: "status-badge status-badge--danger",
};

export const galleryStatusClasses: Record<string, string> = {
  draft: "status-badge status-badge--neutral",
  active: "status-badge status-badge--accent",
  archived: "status-badge status-badge--neutral",
};

export const galleryTypeClasses: Record<string, string> = {
  proofing: "status-badge status-badge--accent",
  delivery: "status-badge status-badge--info",
};

/**
 * Build a preview URL for an asset, selecting the best available
 * thumbnail variant (smallest → largest for card grids, caller is
 * expected to pass the appropriate variant prefs if they need larger).
 *
 * The backend now emits `/storage/{key}` URLs from the thumbnail
 * worker (see backend/internal/worker/thumbnail_worker.go) so every
 * thumbnail flows through the backend's JWT-authed streaming proxy.
 * Because the proxy accepts either an Authorization header OR a
 * `?token=...` query-param, we append the stored access token to the
 * URL so bare `<img src>` tags work without a custom fetcher. The
 * backend re-verifies the token on every request, so the URL stays
 * bound to the caller's session and cannot be exfiltrated to another
 * user.
 *
 * Legacy rows that still hold presigned R2 URLs are passed through
 * unchanged, so clients hitting a pre-fix asset row fall back to the
 * presigned URL (which worked fine against production R2 even if the
 * UAT bridge was unreachable).
 */
export function getAssetPreviewUrl(
  asset?: {
    thumbnail_urls?: Record<string, string>;
    download_url?: string;
  },
  token?: string | null,
): string {
  if (!asset) return "";

  // Variant preference order — smallest first for grid cards.
  const variants = asset.thumbnail_urls ?? {};
  const preferred = variants.thumb_sm_webp ?? variants.thumb_sm ?? variants.thumb_md ?? variants.thumb_lg;
  const chosen = preferred ?? Object.values(variants)[0] ?? asset.download_url ?? "";
  if (!chosen) return "";

  // Only append the token when the URL is one of OUR storage proxy
  // paths — legacy presigned URLs already carry their own auth.
  if (token && chosen.includes("/storage/")) {
    const sep = chosen.includes("?") ? "&" : "?";
    return `${chosen}${sep}token=${encodeURIComponent(token)}`;
  }
  return chosen;
}

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

export function getAssetPreviewUrl(asset?: {
  thumbnail_urls?: Record<string, string>;
  download_url?: string;
}) {
  if (!asset) {
    return "";
  }

  const thumbnails = asset.thumbnail_urls ? Object.values(asset.thumbnail_urls) : [];
  return thumbnails[0] ?? asset.download_url ?? "";
}

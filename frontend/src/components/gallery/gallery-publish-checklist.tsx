import Link from "next/link";
import type { Gallery } from "@/lib/api/galleries";
import type { Asset } from "@/lib/api/assets";

interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  critical?: boolean;
  actionHref?: string;
}

interface GalleryPublishChecklistProps {
  gallery: Gallery;
  assets: Array<{ asset: Asset | null }>;
}

export function GalleryPublishChecklist({ gallery, assets }: GalleryPublishChecklistProps) {
  const hasWebP = assets.some((entry) =>
    Boolean(entry.asset?.thumbnail_urls?.display_webp || entry.asset?.thumbnail_urls?.thumb_lg_webp),
  );
  const items: ChecklistItem[] = [
    {
      key: "client",
      label: "Client is linked for CRM continuity",
      ok: Boolean(gallery.primary_contact_id || gallery.contact_id),
      critical: true,
      actionHref: `/galleries/${gallery.id}/settings`,
    },
    {
      key: "cover",
      label: "Cover photo and focal point are set",
      ok: Boolean(gallery.cover_asset_id),
      critical: true,
      actionHref: `/galleries/${gallery.id}/cover`,
    },
    {
      key: "webp",
      label: "WebP display derivatives are ready",
      ok: hasWebP,
      critical: true,
    },
    {
      key: "design",
      label: "Design and theme reviewed",
      ok: Boolean(gallery.cover_template && gallery.cover_template !== "none"),
      actionHref: `/galleries/${gallery.id}/design`,
    },
    {
      key: "access",
      label: "Access, downloads, proofing, and expiry are intentional",
      ok: gallery.download_enabled !== undefined || Boolean(gallery.expires_at),
      actionHref: `/galleries/${gallery.id}/settings`,
    },
    {
      key: "share",
      label: "Share copy and public preview reviewed",
      ok: gallery.is_published,
      actionHref: `/galleries/${gallery.id}#share-center`,
    },
  ];
  const missingCritical = items.filter((item) => item.critical && !item.ok).length;

  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Publish Checklist</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">Ready for client sharing</h2>
        </div>
        <span className={missingCritical ? "status-badge status-badge--warning" : "status-badge status-badge--success"}>
          {missingCritical ? `${missingCritical} blockers` : "Ready"}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-sunken p-3">
            <div>
              <p className="text-xs font-medium text-text-primary">{item.label}</p>
              {!item.ok && (
                <p className="mt-1 text-xs text-text-tertiary">
                  {item.critical ? "Blocks safe publishing unless overridden." : "Recommended before sharing."}
                </p>
              )}
            </div>
            {item.ok ? (
              <span className="status-badge status-badge--success">OK</span>
            ) : item.actionHref ? (
              <Link href={item.actionHref} className="text-xs text-accent-primary hover:underline">
                Fix
              </Link>
            ) : (
              <span className="status-badge status-badge--warning">Missing</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

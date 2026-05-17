/**
 * Public-side reader for the gallery design config persisted by the Gallery
 * Design Studio at `/galleries/{id}/design`.
 *
 * The design payload lives at `gallery.settings.design_config` (writer:
 * `backend/internal/service/gallery_design_service.go` ::
 * `UpdateDesignConfig`). The public viewer at `/g/{slug}` needs the
 * design to render the saved cover + grid layout when a client opens the
 * share link — without this, share links render with a default header and
 * a hard-coded `columns-1 sm:columns-2 lg:columns-3` masonry, ignoring
 * every choice made in the studio.
 *
 * Keys are camelCase here because that's what the frontend reducer in
 * `frontend/src/app/(dashboard)/galleries/[id]/design/page.tsx` dispatches
 * and what the backend struct tags accept after the 2026-05-17 mismatch fix.
 *
 * The reader is intentionally permissive — every field is optional, every
 * type is narrowed defensively, and unknown shapes fall back to undefined
 * so the viewer can apply its legacy behavior. Treating this as
 * "best-effort projection" keeps a broken/empty `design_config` from
 * masking the gallery entirely.
 */

export interface PublicDesignConfig {
  theme?: {
    id?: string;
    variant?: "light" | "dark" | "auto";
    accentColor?: string;
  };
  cover?: {
    assetId?: string | null;
    styleId?: string;
    focalPoint?: { x: number; y: number };
    title?: string;
    subtitle?: string;
  };
  typography?: {
    pairingId?: string;
    headingFont?: string;
    bodyFont?: string;
    titleSize?: number;
    subtitleSize?: number;
  };
  grid?: {
    layout?: "masonry" | "grid" | "justified" | "carousel";
    columns?: number;
    gap?: number;
    showInfo?: boolean;
  };
  version?: number;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

export function readPublicDesignConfig(
  settings: Record<string, unknown> | undefined | null,
): PublicDesignConfig | null {
  if (!settings) return null;
  const raw = settings["design_config"];
  const root = asObject(raw);
  if (!root) return null;

  const themeRaw = asObject(root.theme);
  const coverRaw = asObject(root.cover);
  const typoRaw = asObject(root.typography);
  const gridRaw = asObject(root.grid);
  const focal = asObject(coverRaw?.focalPoint);
  const variant = asString(themeRaw?.variant);
  const layout = asString(gridRaw?.layout);

  return {
    theme: themeRaw
      ? {
          id: asString(themeRaw.id),
          variant: variant === "light" || variant === "dark" || variant === "auto" ? variant : undefined,
          accentColor: asString(themeRaw.accentColor),
        }
      : undefined,
    cover: coverRaw
      ? {
          assetId: asString(coverRaw.assetId) ?? null,
          styleId: asString(coverRaw.styleId),
          focalPoint: focal
            ? {
                x: asNumber(focal.x) ?? 50,
                y: asNumber(focal.y) ?? 50,
              }
            : undefined,
          title: asString(coverRaw.title),
          subtitle: asString(coverRaw.subtitle),
        }
      : undefined,
    typography: typoRaw
      ? {
          pairingId: asString(typoRaw.pairingId),
          headingFont: asString(typoRaw.headingFont),
          bodyFont: asString(typoRaw.bodyFont),
          titleSize: asNumber(typoRaw.titleSize),
          subtitleSize: asNumber(typoRaw.subtitleSize),
        }
      : undefined,
    grid: gridRaw
      ? {
          layout:
            layout === "masonry" || layout === "grid" || layout === "justified" || layout === "carousel"
              ? layout
              : undefined,
          columns: asNumber(gridRaw.columns),
          gap: asNumber(gridRaw.gap),
          showInfo: asBool(gridRaw.showInfo),
        }
      : undefined,
    version: asNumber(root.version),
  };
}

export function readPublicCoverThumbnails(
  settings: Record<string, unknown> | undefined | null,
): Record<string, string> | null {
  if (!settings) return null;
  const raw = settings["cover_thumbnails"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

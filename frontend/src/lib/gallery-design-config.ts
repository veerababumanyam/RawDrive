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
    layoutPreset?:
      | "classic-wedding"
      | "editorial-split"
      | "luxury-dark"
      | "haldi-warm"
      | "reception-glow"
      | "minimal-studio"
      | "story-cover"
      | "proofing-first";
    mediaMode?: "single-photo" | "slideshow" | "short-video" | "photo-grid";
    focalPoint?: { x: number; y: number };
    mobileFocalPoint?: { x: number; y: number };
    mobileAspectRatio?: string;
    title?: string;
    subtitle?: string;
    // Free-positioned text overlay — written by the Cover & Design page's
    // drag editor. When set, the public hero renders the title/subtitle at
    // these (x, y) percentage coordinates of the cover frame rather than
    // the styleId's fixed justify-end-with-textAlign position. Either or
    // both can be set; missing values fall back to the legacy positioning.
    titlePosition?: { x: number; y: number };
    subtitlePosition?: { x: number; y: number };
    // Text alignment for the dragged overlay — `start`/`end` use the drop
    // point as the anchor edge so the text grows toward the opposite edge;
    // `center` anchors the midpoint at the drop point.
    textAlign?: "left" | "center" | "right";
    // Overlay readability controls. textColor is a hex string; textShadow
    // toggles a CSS text-shadow that makes light copy legible over busy
    // photos without requiring a full scrim layer.
    textColor?: string;
    titleColor?: string;
    subtitleColor?: string;
    textShadow?: boolean;
    scrimStyle?:
      | "none"
      | "soft-gradient"
      | "cinematic-dark"
      | "warm-vignette"
      | "blur-band"
      | "light-wash";
    textBackdrop?: "none" | "glass" | "dark" | "light";
    // Aspect-ratio override for the cover frame. When set, replaces the
    // styleId's declared aspectRatio so users can crop a 21/9 panoramic
    // to 4/3 without picking a whole new style. Format: "W/H" string.
    aspectRatio?: string;
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
  sceneHeaders?: Array<{
    id: string;
    label: string;
    enabled: boolean;
    assetId?: string | null;
  }>;
  branding?: {
    logoPlacement?: "hidden" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
    monogram?: string;
    brandColor?: string;
    watermarkStyle?: "none" | "subtle-corner" | "center-mark" | "tiled";
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

function asOneOf<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  const text = asString(value);
  return text && allowed.includes(text) ? text : undefined;
}

const COVER_PRESETS = [
  "classic-wedding",
  "editorial-split",
  "luxury-dark",
  "haldi-warm",
  "reception-glow",
  "minimal-studio",
  "story-cover",
  "proofing-first",
] as const;

const MEDIA_MODES = ["single-photo", "slideshow", "short-video", "photo-grid"] as const;
const SCRIM_STYLES = ["none", "soft-gradient", "cinematic-dark", "warm-vignette", "blur-band", "light-wash"] as const;
const TEXT_BACKDROPS = ["none", "glass", "dark", "light"] as const;
const LOGO_PLACEMENTS = ["hidden", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
const WATERMARK_STYLES = ["none", "subtle-corner", "center-mark", "tiled"] as const;

function readPoint(value: unknown, fallbackY: number) {
  const point = asObject(value);
  if (!point) return undefined;
  return {
    x: asNumber(point.x) ?? 50,
    y: asNumber(point.y) ?? fallbackY,
  };
}

function readSceneHeaders(raw: unknown): PublicDesignConfig["sceneHeaders"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const scenes = raw.flatMap((entry) => {
    const scene = asObject(entry);
    if (!scene) return [];
    const id = asString(scene.id);
    const label = asString(scene.label);
    if (!id || !label) return [];
    return [{
      id,
      label,
      enabled: asBool(scene.enabled) ?? false,
      assetId: asString(scene.assetId) ?? null,
    }];
  });
  return scenes.length > 0 ? scenes : undefined;
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
  const brandingRaw = asObject(root.branding);
  const focal = asObject(coverRaw?.focalPoint);
  const variant = asString(themeRaw?.variant);
  const layout = asString(gridRaw?.layout);
  const coverTextAlign = asString(coverRaw?.textAlign);
  const sceneHeaders = readSceneHeaders(root.sceneHeaders);

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
          layoutPreset: asOneOf(coverRaw.layoutPreset, COVER_PRESETS),
          mediaMode: asOneOf(coverRaw.mediaMode, MEDIA_MODES),
          focalPoint: focal
            ? {
                x: asNumber(focal.x) ?? 50,
                y: asNumber(focal.y) ?? 50,
              }
            : undefined,
          mobileFocalPoint: readPoint(coverRaw.mobileFocalPoint, 50),
          mobileAspectRatio: asString(coverRaw.mobileAspectRatio),
          title: asString(coverRaw.title),
          subtitle: asString(coverRaw.subtitle),
          titlePosition: readPoint(coverRaw.titlePosition, 50),
          subtitlePosition: readPoint(coverRaw.subtitlePosition, 60),
          textAlign:
            coverTextAlign === "left" || coverTextAlign === "center" || coverTextAlign === "right"
              ? coverTextAlign
              : undefined,
          textColor: asString(coverRaw.textColor),
          titleColor: asString(coverRaw.titleColor),
          subtitleColor: asString(coverRaw.subtitleColor),
          textShadow: asBool(coverRaw.textShadow),
          scrimStyle: asOneOf(coverRaw.scrimStyle, SCRIM_STYLES),
          textBackdrop: asOneOf(coverRaw.textBackdrop, TEXT_BACKDROPS),
          aspectRatio: asString(coverRaw.aspectRatio),
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
    sceneHeaders,
    branding: brandingRaw
      ? {
          logoPlacement: asOneOf(brandingRaw.logoPlacement, LOGO_PLACEMENTS),
          monogram: asString(brandingRaw.monogram),
          brandColor: asString(brandingRaw.brandColor),
          watermarkStyle: asOneOf(brandingRaw.watermarkStyle, WATERMARK_STYLES),
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

export function readGalleryCoverAssetId(
  settings: Record<string, unknown> | undefined | null,
  fallbackAssetId?: string | null,
): string | undefined {
  const designAssetId = readPublicDesignConfig(settings)?.cover?.assetId;
  return designAssetId || fallbackAssetId || undefined;
}

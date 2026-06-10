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

export type CoverDevice = "desktop" | "phone";
export type CoverDeviceTarget = CoverDevice | "both";

export type CoverPresetId =
  | "classic-wedding"
  | "editorial-split"
  | "luxury-dark"
  | "haldi-warm"
  | "mehendi-green"
  | "sangeet-night"
  | "engagement-soft"
  | "reception-glow"
  | "minimal-studio"
  | "story-cover"
  | "proofing-first"
  | "housewarming-warm"
  | "birthday-bright"
  | "corporate-clean"
  | "portfolio-editorial";

export type CoverMediaMode =
  | "single-photo"
  | "slideshow"
  | "short-video"
  | "photo-grid";

export const SLIDESHOW_INTERVAL_DEFAULT_MS = 5000;
export const SLIDESHOW_INTERVAL_MIN_MS = 2000;
export const SLIDESHOW_INTERVAL_MAX_MS = 15000;
export const CLIENT_SIDE_MEDIA_ENCRYPTION_SETTING =
  "client_side_media_encryption_enabled";

export type CoverScrimStyle =
  | "none"
  | "soft-gradient"
  | "cinematic-dark"
  | "warm-vignette"
  | "blur-band"
  | "light-wash";

export type CoverTextBackdrop = "none" | "glass" | "dark" | "light";
export type CoverTextAlign = "left" | "center" | "right";
export type CoverPoint = { x: number; y: number };

export interface CoverDeviceTypography {
  headingFont?: string;
  bodyFont?: string;
  titleLanguage?: string;
  subtitleLanguage?: string;
  titleWeight?: number;
  subtitleWeight?: number;
  titleItalic?: boolean;
  subtitleItalic?: boolean;
  titleSize?: number;
  subtitleSize?: number;
}

export interface CoverDeviceProfile {
  assetId?: string | null;
  assetSlots?: Array<string | null>;
  styleId?: string;
  layoutPreset?: CoverPresetId;
  mediaMode?: CoverMediaMode;
  focalPoint?: CoverPoint;
  zoom?: number;
  slotFocalPoints?: CoverPoint[];
  slotZooms?: number[];
  aspectRatio?: string;
  title?: string;
  subtitle?: string;
  titleVisible?: boolean;
  subtitleVisible?: boolean;
  titlePosition?: CoverPoint;
  subtitlePosition?: CoverPoint;
  textAlign?: CoverTextAlign;
  textColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  textShadow?: boolean;
  scrimStyle?: CoverScrimStyle;
  textBackdrop?: CoverTextBackdrop;
  typography?: CoverDeviceTypography;
}

export type CoverProfileThumbnailMap = Partial<
  Record<CoverDevice, Record<string, string>>
>;

export interface ResolvedCoverDeviceProfile {
  device: CoverDevice;
  cover: CoverDeviceProfile;
  typography: CoverDeviceTypography;
}

export interface PublicDesignConfig {
  theme?: {
    id?: string;
    variant?: "light" | "dark" | "auto";
    accentColor?: string;
  };
  cover?: {
    assetId?: string | null;
    assetSlots?: Array<string | null>;
    styleId?: string;
    layoutPreset?: CoverPresetId;
    mediaMode?: CoverMediaMode;
    focalPoint?: CoverPoint;
    mobileFocalPoint?: CoverPoint;
    zoom?: number;
    mobileZoom?: number;
    slotFocalPoints?: CoverPoint[];
    mobileSlotFocalPoints?: CoverPoint[];
    slotZooms?: number[];
    mobileSlotZooms?: number[];
    mobileAspectRatio?: string;
    title?: string;
    subtitle?: string;
    titleVisible?: boolean;
    subtitleVisible?: boolean;
    // Free-positioned text overlay — written by the Cover & Design page's
    // drag editor. When set, the public hero renders the title/subtitle at
    // these (x, y) percentage coordinates of the cover frame rather than
    // the styleId's fixed justify-end-with-textAlign position. Either or
    // both can be set; missing values fall back to the legacy positioning.
    titlePosition?: CoverPoint;
    subtitlePosition?: CoverPoint;
    mobileTitlePosition?: CoverPoint;
    mobileSubtitlePosition?: CoverPoint;
    // Text alignment for the dragged overlay — `start`/`end` use the drop
    // point as the anchor edge so the text grows toward the opposite edge;
    // `center` anchors the midpoint at the drop point.
    textAlign?: CoverTextAlign;
    // Overlay readability controls. textColor is a hex string; textShadow
    // toggles a CSS text-shadow that makes light copy legible over busy
    // photos without requiring a full scrim layer.
    textColor?: string;
    titleColor?: string;
    subtitleColor?: string;
    textShadow?: boolean;
    scrimStyle?: CoverScrimStyle;
    textBackdrop?: CoverTextBackdrop;
    // Aspect-ratio override for the cover frame. When set, replaces the
    // styleId's declared aspectRatio so users can crop a 21/9 panoramic
    // to 4/3 without picking a whole new style. Format: "W/H" string.
    aspectRatio?: string;
    deviceProfiles?: Partial<Record<CoverDevice, CoverDeviceProfile>>;
  };
  typography?: {
    pairingId?: string;
    headingFont?: string;
    bodyFont?: string;
    titleLanguage?: string;
    subtitleLanguage?: string;
    titleWeight?: number;
    subtitleWeight?: number;
    titleItalic?: boolean;
    subtitleItalic?: boolean;
    titleSize?: number;
    subtitleSize?: number;
    mobileTitleSize?: number;
    mobileSubtitleSize?: number;
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
    logoPlacement?:
      | "hidden"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right";
    monogram?: string;
    brandColor?: string;
    watermarkStyle?: "none" | "subtle-corner" | "center-mark" | "tiled";
    logoSize?: number;
    logoOpacity?: number;
    watermarkText?: string;
    watermarkOpacity?: number;
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
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

export function normalizeSlideshowIntervalMs(value: unknown): number {
  const rawValue = typeof value === "string" ? Number(value) : asNumber(value);
  if (rawValue === undefined || !Number.isFinite(rawValue)) {
    return SLIDESHOW_INTERVAL_DEFAULT_MS;
  }
  const interval = Math.round(rawValue);
  return Math.min(
    SLIDESHOW_INTERVAL_MAX_MS,
    Math.max(SLIDESHOW_INTERVAL_MIN_MS, interval),
  );
}

export function readGallerySlideshowIntervalMs(settings: unknown): number {
  const rawSettings = asObject(settings);
  return normalizeSlideshowIntervalMs(rawSettings?.slideshow_interval_ms);
}

export function readGalleryClientSideMediaEncryptionEnabled(
  settings: unknown,
): boolean {
  const rawSettings = asObject(settings);
  return (
    rawSettings?.[CLIENT_SIDE_MEDIA_ENCRYPTION_SETTING] === true ||
    rawSettings?.client_side_encryption_enabled === true
  );
}

function asOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | undefined {
  const text = asString(value);
  return text && allowed.includes(text) ? text : undefined;
}

const COVER_PRESETS = [
  "classic-wedding",
  "editorial-split",
  "luxury-dark",
  "haldi-warm",
  "mehendi-green",
  "sangeet-night",
  "engagement-soft",
  "reception-glow",
  "minimal-studio",
  "story-cover",
  "proofing-first",
  "housewarming-warm",
  "birthday-bright",
  "corporate-clean",
  "portfolio-editorial",
] as const;

const MEDIA_MODES = [
  "single-photo",
  "slideshow",
  "short-video",
  "photo-grid",
] as const;
const SCRIM_STYLES = [
  "none",
  "soft-gradient",
  "cinematic-dark",
  "warm-vignette",
  "blur-band",
  "light-wash",
] as const;
const TEXT_BACKDROPS = ["none", "glass", "dark", "light"] as const;
const LOGO_PLACEMENTS = [
  "hidden",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;
const WATERMARK_STYLES = [
  "none",
  "subtle-corner",
  "center-mark",
  "tiled",
] as const;
const COVER_ZOOM_MIN = 1;
const COVER_ZOOM_MAX = 3;

function readPoint(value: unknown, fallbackY: number) {
  const point = asObject(value);
  if (!point) return undefined;
  return {
    x: asNumber(point.x) ?? 50,
    y: asNumber(point.y) ?? fallbackY,
  };
}

function readAssetSlots(raw: unknown): Array<string | null> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const slots = raw.map((entry) => (typeof entry === "string" ? entry : null));
  return slots.length > 0 ? slots : undefined;
}

function mutableRecord(raw: unknown): Record<string, unknown> {
  return { ...(asObject(raw) ?? {}) };
}

function assetSlotsWithPrimary(
  rawSlots: unknown,
  assetId: string,
): Array<string | null> {
  const slots = readAssetSlots(rawSlots) ?? [];
  const next = [...slots];
  if (next.length === 0) next.push(assetId);
  else next[0] = assetId;
  return next;
}

function coverProfileWithPrimaryAsset(
  rawProfile: unknown,
  assetId: string,
): Record<string, unknown> {
  const profile = mutableRecord(rawProfile);
  profile.assetId = assetId;
  profile.assetSlots = assetSlotsWithPrimary(profile.assetSlots, assetId);
  return profile;
}

export function buildGalleryCoverDeviceDesignConfig(
  settings: Record<string, unknown> | undefined | null,
  assetId: string,
  target: CoverDeviceTarget,
): Record<string, unknown> {
  const trimmedAssetId = assetId.trim();
  if (!trimmedAssetId) {
    throw new Error("Cover asset id is required.");
  }

  const root = mutableRecord(asObject(settings)?.design_config);
  const cover = mutableRecord(root.cover);
  const deviceProfiles = mutableRecord(cover.deviceProfiles);

  if (target === "desktop" || target === "both") {
    deviceProfiles.desktop = coverProfileWithPrimaryAsset(
      deviceProfiles.desktop,
      trimmedAssetId,
    );
    cover.assetId = trimmedAssetId;
    cover.assetSlots = assetSlotsWithPrimary(cover.assetSlots, trimmedAssetId);
  }

  if (target === "phone" || target === "both") {
    deviceProfiles.phone = coverProfileWithPrimaryAsset(
      deviceProfiles.phone,
      trimmedAssetId,
    );
  }

  cover.deviceProfiles = deviceProfiles;
  root.cover = cover;
  return root;
}

function readPointList(raw: unknown): CoverPoint[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const points = raw.map((entry) => readPoint(entry, 50) || { x: 50, y: 50 });
  return points.length > 0 ? points : undefined;
}

function readCoverZoom(raw: unknown): number | undefined {
  const zoom = asNumber(raw);
  if (zoom === undefined) return undefined;
  return (
    Math.round(Math.min(COVER_ZOOM_MAX, Math.max(COVER_ZOOM_MIN, zoom)) * 100) /
    100
  );
}

function readCoverZoomList(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const zooms = raw.map((entry) => readCoverZoom(entry) ?? COVER_ZOOM_MIN);
  return zooms.length > 0 ? zooms : undefined;
}

function readOptionalAssetId(
  raw: Record<string, unknown>,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(raw, "assetId")) return undefined;
  return asString(raw.assetId) ?? null;
}

function readCoverDeviceTypography(
  raw: unknown,
): CoverDeviceTypography | undefined {
  const typo = asObject(raw);
  if (!typo) return undefined;
  const out: CoverDeviceTypography = {
    headingFont: asString(typo.headingFont),
    bodyFont: asString(typo.bodyFont),
    titleLanguage: asString(typo.titleLanguage),
    subtitleLanguage: asString(typo.subtitleLanguage),
    titleWeight: asNumber(typo.titleWeight),
    subtitleWeight: asNumber(typo.subtitleWeight),
    titleItalic: asBool(typo.titleItalic),
    subtitleItalic: asBool(typo.subtitleItalic),
    titleSize: asNumber(typo.titleSize),
    subtitleSize: asNumber(typo.subtitleSize),
  };
  return Object.values(out).some((value) => value !== undefined)
    ? out
    : undefined;
}

function readCoverDeviceProfile(raw: unknown): CoverDeviceProfile | undefined {
  const profile = asObject(raw);
  if (!profile) return undefined;
  const coverTextAlign = asString(profile.textAlign);
  const out: CoverDeviceProfile = {
    assetId: readOptionalAssetId(profile),
    assetSlots: readAssetSlots(profile.assetSlots),
    styleId: asString(profile.styleId),
    layoutPreset: asOneOf(profile.layoutPreset, COVER_PRESETS),
    mediaMode: asOneOf(profile.mediaMode, MEDIA_MODES),
    focalPoint: readPoint(profile.focalPoint, 50),
    zoom: readCoverZoom(profile.zoom),
    slotFocalPoints: readPointList(profile.slotFocalPoints),
    slotZooms: readCoverZoomList(profile.slotZooms),
    aspectRatio: asString(profile.aspectRatio),
    title: asString(profile.title),
    subtitle: asString(profile.subtitle),
    titleVisible: asBool(profile.titleVisible),
    subtitleVisible: asBool(profile.subtitleVisible),
    titlePosition: readPoint(profile.titlePosition, 50),
    subtitlePosition: readPoint(profile.subtitlePosition, 60),
    textAlign:
      coverTextAlign === "left" ||
      coverTextAlign === "center" ||
      coverTextAlign === "right"
        ? coverTextAlign
        : undefined,
    textColor: asString(profile.textColor),
    titleColor: asString(profile.titleColor),
    subtitleColor: asString(profile.subtitleColor),
    textShadow: asBool(profile.textShadow),
    scrimStyle: asOneOf(profile.scrimStyle, SCRIM_STYLES),
    textBackdrop: asOneOf(profile.textBackdrop, TEXT_BACKDROPS),
    typography: readCoverDeviceTypography(profile.typography),
  };
  return Object.values(out).some((value) => value !== undefined)
    ? out
    : undefined;
}

function readCoverDeviceProfiles(
  raw: unknown,
): Partial<Record<CoverDevice, CoverDeviceProfile>> | undefined {
  const profiles = asObject(raw);
  if (!profiles) return undefined;
  const desktop = readCoverDeviceProfile(profiles.desktop);
  const phone = readCoverDeviceProfile(profiles.phone);
  if (!desktop && !phone) return undefined;
  return { ...(desktop ? { desktop } : {}), ...(phone ? { phone } : {}) };
}

function readSceneHeaders(
  raw: unknown,
): PublicDesignConfig["sceneHeaders"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const scenes = raw.flatMap((entry) => {
    const scene = asObject(entry);
    if (!scene) return [];
    const id = asString(scene.id);
    const label = asString(scene.label);
    if (!id || !label) return [];
    return [
      {
        id,
        label,
        enabled: asBool(scene.enabled) ?? false,
        assetId: asString(scene.assetId) ?? null,
      },
    ];
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
          variant:
            variant === "light" || variant === "dark" || variant === "auto"
              ? variant
              : undefined,
          accentColor: asString(themeRaw.accentColor),
        }
      : undefined,
    cover: coverRaw
      ? {
          assetId: asString(coverRaw.assetId) ?? null,
          assetSlots: readAssetSlots(coverRaw.assetSlots),
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
          zoom: readCoverZoom(coverRaw.zoom),
          mobileZoom: readCoverZoom(coverRaw.mobileZoom),
          slotFocalPoints: readPointList(coverRaw.slotFocalPoints),
          mobileSlotFocalPoints: readPointList(coverRaw.mobileSlotFocalPoints),
          slotZooms: readCoverZoomList(coverRaw.slotZooms),
          mobileSlotZooms: readCoverZoomList(coverRaw.mobileSlotZooms),
          mobileAspectRatio: asString(coverRaw.mobileAspectRatio),
          title: asString(coverRaw.title),
          subtitle: asString(coverRaw.subtitle),
          titleVisible: asBool(coverRaw.titleVisible),
          subtitleVisible: asBool(coverRaw.subtitleVisible),
          titlePosition: readPoint(coverRaw.titlePosition, 50),
          subtitlePosition: readPoint(coverRaw.subtitlePosition, 60),
          mobileTitlePosition: readPoint(coverRaw.mobileTitlePosition, 56),
          mobileSubtitlePosition: readPoint(
            coverRaw.mobileSubtitlePosition,
            68,
          ),
          textAlign:
            coverTextAlign === "left" ||
            coverTextAlign === "center" ||
            coverTextAlign === "right"
              ? coverTextAlign
              : undefined,
          textColor: asString(coverRaw.textColor),
          titleColor: asString(coverRaw.titleColor),
          subtitleColor: asString(coverRaw.subtitleColor),
          textShadow: asBool(coverRaw.textShadow),
          scrimStyle: asOneOf(coverRaw.scrimStyle, SCRIM_STYLES),
          textBackdrop: asOneOf(coverRaw.textBackdrop, TEXT_BACKDROPS),
          aspectRatio: asString(coverRaw.aspectRatio),
          deviceProfiles: readCoverDeviceProfiles(coverRaw.deviceProfiles),
        }
      : undefined,
    typography: typoRaw
      ? {
          pairingId: asString(typoRaw.pairingId),
          headingFont: asString(typoRaw.headingFont),
          bodyFont: asString(typoRaw.bodyFont),
          titleLanguage: asString(typoRaw.titleLanguage),
          subtitleLanguage: asString(typoRaw.subtitleLanguage),
          titleWeight: asNumber(typoRaw.titleWeight),
          subtitleWeight: asNumber(typoRaw.subtitleWeight),
          titleItalic: asBool(typoRaw.titleItalic),
          subtitleItalic: asBool(typoRaw.subtitleItalic),
          titleSize: asNumber(typoRaw.titleSize),
          subtitleSize: asNumber(typoRaw.subtitleSize),
          mobileTitleSize: asNumber(typoRaw.mobileTitleSize),
          mobileSubtitleSize: asNumber(typoRaw.mobileSubtitleSize),
        }
      : undefined,
    grid: gridRaw
      ? {
          layout:
            layout === "masonry" ||
            layout === "grid" ||
            layout === "justified" ||
            layout === "carousel"
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
          logoSize: asNumber(brandingRaw.logoSize),
          logoOpacity: asNumber(brandingRaw.logoOpacity),
          watermarkText: asString(brandingRaw.watermarkText),
          watermarkOpacity: asNumber(brandingRaw.watermarkOpacity),
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

export function readPublicCoverProfileThumbnails(
  settings: Record<string, unknown> | undefined | null,
): CoverProfileThumbnailMap | null {
  if (!settings) return null;
  const raw = asObject(settings["cover_profile_thumbnails"]);
  if (!raw) return null;
  const out: CoverProfileThumbnailMap = {};
  for (const device of ["desktop", "phone"] as const) {
    const urlsRaw = asObject(raw[device]);
    if (!urlsRaw) continue;
    const urls: Record<string, string> = {};
    for (const [key, value] of Object.entries(urlsRaw)) {
      if (typeof value === "string" && value.length > 0) urls[key] = value;
    }
    if (Object.keys(urls).length > 0) out[device] = urls;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function mergeCoverProfiles(
  base: CoverDeviceProfile,
  override: CoverDeviceProfile | undefined,
): CoverDeviceProfile {
  if (!override) return base;
  const merged: CoverDeviceProfile = { ...base };
  for (const [key, value] of Object.entries(override) as Array<
    [keyof CoverDeviceProfile, CoverDeviceProfile[keyof CoverDeviceProfile]]
  >) {
    if (key === "typography" || value === undefined) continue;
    merged[key] = value as never;
  }
  merged.typography = {
    ...(base.typography || {}),
    ...(override.typography || {}),
  };
  for (const key of Object.keys(merged.typography) as Array<
    keyof CoverDeviceTypography
  >) {
    if (merged.typography[key] === undefined) delete merged.typography[key];
  }
  return {
    ...merged,
    typography:
      Object.keys(merged.typography).length > 0 ? merged.typography : undefined,
  };
}

function legacyDesktopProfile(
  cover: PublicDesignConfig["cover"] | undefined,
  typography: PublicDesignConfig["typography"] | undefined,
): CoverDeviceProfile {
  return {
    assetId: cover?.assetId,
    assetSlots: cover?.assetSlots,
    styleId: cover?.styleId,
    layoutPreset: cover?.layoutPreset,
    mediaMode: cover?.mediaMode,
    focalPoint: cover?.focalPoint,
    zoom: cover?.zoom,
    slotFocalPoints: cover?.slotFocalPoints,
    slotZooms: cover?.slotZooms,
    aspectRatio: cover?.aspectRatio,
    title: cover?.title,
    subtitle: cover?.subtitle,
    titleVisible: cover?.titleVisible,
    subtitleVisible: cover?.subtitleVisible,
    titlePosition: cover?.titlePosition,
    subtitlePosition: cover?.subtitlePosition,
    textAlign: cover?.textAlign,
    textColor: cover?.textColor,
    titleColor: cover?.titleColor,
    subtitleColor: cover?.subtitleColor,
    textShadow: cover?.textShadow,
    scrimStyle: cover?.scrimStyle,
    textBackdrop: cover?.textBackdrop,
    typography: {
      headingFont: typography?.headingFont,
      bodyFont: typography?.bodyFont,
      titleLanguage: typography?.titleLanguage,
      subtitleLanguage: typography?.subtitleLanguage,
      titleWeight: typography?.titleWeight,
      subtitleWeight: typography?.subtitleWeight,
      titleItalic: typography?.titleItalic,
      subtitleItalic: typography?.subtitleItalic,
      titleSize: typography?.titleSize,
      subtitleSize: typography?.subtitleSize,
    },
  };
}

function legacyPhoneProfile(
  desktop: CoverDeviceProfile,
  cover: PublicDesignConfig["cover"] | undefined,
  typography: PublicDesignConfig["typography"] | undefined,
): CoverDeviceProfile {
  return {
    ...desktop,
    focalPoint: cover?.mobileFocalPoint || desktop.focalPoint,
    zoom: cover?.mobileZoom || desktop.zoom,
    slotFocalPoints: cover?.mobileSlotFocalPoints || desktop.slotFocalPoints,
    slotZooms: cover?.mobileSlotZooms || desktop.slotZooms,
    aspectRatio: cover?.mobileAspectRatio || desktop.aspectRatio,
    titlePosition: cover?.mobileTitlePosition || desktop.titlePosition,
    subtitlePosition: cover?.mobileSubtitlePosition || desktop.subtitlePosition,
    typography: {
      ...(desktop.typography || {}),
      titleSize: typography?.mobileTitleSize || desktop.typography?.titleSize,
      subtitleSize:
        typography?.mobileSubtitleSize || desktop.typography?.subtitleSize,
    },
  };
}

export function resolveCoverDeviceProfile(
  design: PublicDesignConfig | null | undefined,
  device: CoverDevice,
): ResolvedCoverDeviceProfile {
  const cover = design?.cover;
  const legacyDesktop = legacyDesktopProfile(cover, design?.typography);
  const desktop = mergeCoverProfiles(
    legacyDesktop,
    cover?.deviceProfiles?.desktop,
  );
  const resolvedCover =
    device === "phone"
      ? mergeCoverProfiles(
          legacyPhoneProfile(desktop, cover, design?.typography),
          cover?.deviceProfiles?.phone,
        )
      : desktop;

  return {
    device,
    cover: resolvedCover,
    typography: resolvedCover.typography || {},
  };
}

export function readGalleryCoverAssetId(
  settings: Record<string, unknown> | undefined | null,
  fallbackAssetId?: string | null,
): string | undefined {
  const designAssetId = resolveCoverDeviceProfile(
    readPublicDesignConfig(settings),
    "desktop",
  ).cover.assetId;
  return designAssetId || fallbackAssetId || undefined;
}

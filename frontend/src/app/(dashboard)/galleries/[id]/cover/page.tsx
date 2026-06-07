"use client";

/**
 * Cover & Design — unified gallery design editor.
 *
 * Replaces the original Cover Photo page and absorbs the functionality of
 * the standalone Gallery Design Studio (`/galleries/[id]/design`). Writes
 * to `gallery.settings.design_config` — the same field the public viewer
 * at `/g/{slug}` reads — so changes flow straight through to clients.
 *
 * What this page does:
 *   1. Pick the cover asset, pan it, and zoom it on a live preview.
 *   2. Author title + subtitle text and drag them anywhere on the cover.
 *   3. Choose typography pairing and tune title/subtitle sizes.
 *   4. Choose grid layout, column count, gap, and per-photo info.
 *   5. Manage embedded videos and reels without leaving the workbench.
 *   6. Choose theme variant + accent color and per-cover overrides
 *      (text color, text shadow, aspect ratio).
 *
 * UX shape:
 *   - Desktop-first split editor. Live preview beside task tabs.
 *   - Sections: Cover / Text / Media / Videos / Brand / Grid / Photos.
 *   - All interactions land on the same preview — no separate "preview"
 *     screen. Desktop/phone preview and a sticky save dock keep the editor
 *     fast without opening a second design studio surface.
 *
 * Schema compatibility:
 *   The persisted shape matches `frontend/src/lib/gallery-design-config.ts`
 *   (PublicDesignConfig). New fields added 2026-05-18 by this rewrite:
 *     cover.titlePosition       — drag-positioned title (0..100 percent)
 *     cover.subtitlePosition    — drag-positioned subtitle
 *     cover.textAlign           — alignment at drop point
 *     cover.textColor           — overlay text color (hex)
 *     cover.textShadow          — toggle a readability shadow
 *     cover.aspectRatio         — overrides the styleId's aspectRatio
 *     cover.zoom/slotZooms      — per-photo-slot crop zoom
 *   When unset, the public viewer falls back to the legacy bottom-anchored
 *   layout the design studio used.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useDeferredValue,
} from "react";
import { useParams } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";
import { getApiBaseUrl } from "@/lib/api/base-url";
import {
  getGallery,
  listGalleryAssets,
  updateGalleryDesign,
  type Gallery,
} from "@/lib/api/galleries";
import {
  getWorkspaceProfile,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { getAsset, type Asset } from "@/lib/api/assets";
import { useUpload } from "@/hooks/use-upload";
import {
  FILMSTRIP_VARIANTS,
  GRID_VARIANTS,
  LIGHTBOX_VARIANTS,
} from "@/lib/media-encryption/asset-media";
import { getOrCreateSyncedGalleryMediaKey } from "@/lib/media-encryption/gallery-media-key-sync";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { UploadDropzone, UploadProgress } from "@/components/upload";
import { TermsAcceptanceModal } from "@/components/legal/terms-acceptance-modal";
import { EmbeddedVideosPanel } from "@/components/gallery/embedded-videos-panel";
import {
  COVER_TEMPLATES,
  coverTemplateSlotIndices,
  getCoverTemplate,
  type CoverTemplate,
} from "@/components/gallery/cover-templates";
import { GalleryPageShell } from "@/components/gallery/gallery-page-shell";
import { GalleryPageHeader } from "@/components/gallery/gallery-page-header";
import { ResizableWorkspaceSplit } from "@/components/gallery/resizable-workspace-split";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";
import { SelectableTile } from "@/components/ui/selectable-tile";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Check, Loader2, Photo, RefreshCw } from "@/components/icons";
import {
  buildCoverGoogleFontsHref,
  COVER_FONT_WEIGHTS,
  COVER_TEXT_LANGUAGES,
  fontFamilyForCoverText,
  getCoverFontsForLanguage,
  getCoverLanguage,
  normalizeCoverFontForLanguage,
  normalizeCoverFontWeight,
  type CoverFontOption,
} from "@/lib/indian-cover-typography";
import { components as designComponents } from "@/lib/tokens";
import { readEmbeddedVideos, type EmbeddedVideo } from "@/lib/embedded-videos";
import type {
  CoverDevice,
  CoverDeviceProfile,
  CoverDeviceTypography,
} from "@/lib/gallery-design-config";

// ──────────────────────────── Data ────────────────────────────

type ThemeVariant = "light" | "dark" | "auto";
type GridLayout = "masonry" | "grid" | "justified" | "carousel";
type TextAlign = "left" | "center" | "right";
type TabId =
  | "cover"
  | "text"
  | "media"
  | "videos"
  | "brand"
  | "grid"
  | "photos";
type PreviewDevice = CoverDevice;

const EDITOR_TABS: Array<{
  id: TabId;
  label: string;
  mobileLabel: string;
}> = [
  { id: "cover", label: "Cover", mobileLabel: "Cover" },
  { id: "text", label: "Text", mobileLabel: "Text" },
  { id: "media", label: "Media", mobileLabel: "Media" },
  { id: "videos", label: "Videos", mobileLabel: "Videos" },
  { id: "brand", label: "Brand", mobileLabel: "Brand" },
  { id: "grid", label: "Grid", mobileLabel: "Grid" },
  { id: "photos", label: "Photos", mobileLabel: "Photos" },
];

type CoverPresetId =
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
type CoverMediaMode =
  | "single-photo"
  | "slideshow"
  | "short-video"
  | "photo-grid";
type ScrimStyle =
  | "none"
  | "soft-gradient"
  | "cinematic-dark"
  | "warm-vignette"
  | "blur-band"
  | "light-wash";
type TextBackdrop = "none" | "glass" | "dark" | "light";
type LogoPlacement =
  | "hidden"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
type WatermarkStyle = "none" | "subtle-corner" | "center-mark" | "tiled";

const LOGO_PLACEMENT_OPTIONS: Array<{ id: LogoPlacement; label: string }> = [
  { id: "hidden", label: "Hidden" },
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

const WATERMARK_STYLE_OPTIONS: Array<{ id: WatermarkStyle; label: string }> = [
  { id: "none", label: "None" },
  { id: "subtle-corner", label: "Subtle corner" },
  { id: "center-mark", label: "Center mark" },
  { id: "tiled", label: "Tiled" },
];

interface FocalPoint {
  x: number;
  y: number;
}
interface TextPos {
  x: number;
  y: number;
}
interface SceneHeaderConfig {
  id: string;
  label: string;
  enabled: boolean;
  assetId: string | null;
}

interface DesignConfig {
  theme: { id: string; variant: ThemeVariant; accentColor: string };
  cover: {
    assetId: string | null;
    assetSlots: Array<string | null>;
    styleId: string;
    layoutPreset: CoverPresetId;
    mediaMode: CoverMediaMode;
    focalPoint: FocalPoint;
    mobileFocalPoint: FocalPoint;
    zoom: number;
    mobileZoom: number;
    slotFocalPoints: FocalPoint[];
    mobileSlotFocalPoints: FocalPoint[];
    slotZooms: number[];
    mobileSlotZooms: number[];
    mobileAspectRatio: string;
    title: string;
    subtitle: string;
    titleVisible: boolean;
    subtitleVisible: boolean;
    titlePosition: TextPos;
    subtitlePosition: TextPos;
    mobileTitlePosition: TextPos;
    mobileSubtitlePosition: TextPos;
    textAlign: TextAlign;
    // Per-element colors. 2026-05-18: split from a single `textColor` so
    // users can pick a different hex for title vs subtitle. `textColor`
    // stays in the saved shape as a legacy fallback — configFromGallery
    // migrates it into both fields on first read when the new fields
    // aren't present.
    textColor: string;
    titleColor: string;
    subtitleColor: string;
    textShadow: boolean;
    scrimStyle: ScrimStyle;
    textBackdrop: TextBackdrop;
    aspectRatio: string;
    deviceProfiles?: Partial<Record<PreviewDevice, CoverDeviceProfile>>;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    titleLanguage: string;
    subtitleLanguage: string;
    titleWeight: number;
    subtitleWeight: number;
    titleItalic: boolean;
    subtitleItalic: boolean;
    titleSize: number;
    subtitleSize: number;
    mobileTitleSize: number;
    mobileSubtitleSize: number;
  };
  grid: {
    layout: GridLayout;
    columns: number;
    gap: number;
    showInfo: boolean;
  };
  sceneHeaders: SceneHeaderConfig[];
  branding: {
    logoPlacement: LogoPlacement;
    monogram: string;
    brandColor: string;
    watermarkStyle: WatermarkStyle;
    logoSize: number;
    logoOpacity: number;
    watermarkText: string;
    watermarkOpacity: number;
    applyToAll: boolean;
  };
  legacyBranding: boolean;
  version: number;
}

const TITLE_SIZE_MIN = 16;
const TITLE_SIZE_MAX = 96;
const SUBTITLE_SIZE_MIN = 10;
const SUBTITLE_SIZE_MAX = 40;
const MOBILE_TITLE_SIZE_MIN = 18;
const MOBILE_TITLE_SIZE_MAX = 72;
const MOBILE_SUBTITLE_SIZE_MIN = 10;
const MOBILE_SUBTITLE_SIZE_MAX = 32;
const LOGO_SIZE_MIN = 28;
const LOGO_SIZE_MAX = 96;
const COVER_SLOT_ZOOM_MIN = 1;
const COVER_SLOT_ZOOM_MAX = 3;

// Editor-offered grid layouts. The schema's `layout` field still
// accepts masonry/carousel (the public viewer can render them) — they
// just aren't exposed as new editor choices anymore. Legacy galleries
// with masonry/carousel saved continue to render correctly on the
// public viewer; the editor migrates them to "grid" on first load via
// configFromGallery so the picker has a valid selection.
const GRID_LAYOUTS: { id: GridLayout; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "justified", label: "Justified" },
];

// Auto-default gap (px) when the gap slider was removed 2026-05-18.
// 8px is a tight-but-readable default that mirrors what the public
// viewer renders with grid.gap=8 — typical wedding gallery spacing.
const DEFAULT_GRID_GAP = 8;
const COVER_PHOTO_PAGE_SIZE = 36;
const COVER_COLORS = designComponents.mediaCover.presetColors;
const COVER_FIELD_CLASS = "input-base w-full text-sm";
const COVER_RANGE_CLASS = "cover-range-input";
const COVER_COLOR_CLASS = "cover-color-input";
const COVER_PREVIEW_UNAVAILABLE =
  "Preview unavailable. Refresh or regenerate thumbnails.";

function coverPreviewErrorMessage(
  error: string | null | undefined,
  fallback = "Preview unavailable",
): string {
  if (!error) return fallback;
  if (
    error.startsWith("Encrypted media fetch failed:") ||
    error.startsWith("Media fetch failed:") ||
    error === "Encrypted media decrypt failed" ||
    error === "Missing encrypted media manifest"
  ) {
    return COVER_PREVIEW_UNAVAILABLE;
  }
  return error;
}

const COVER_PRESETS: Array<{
  id: CoverPresetId;
  name: string;
  mood: string;
  patch: {
    cover: Partial<DesignConfig["cover"]>;
    typography: Partial<DesignConfig["typography"]>;
    theme?: Partial<DesignConfig["theme"]>;
    grid?: Partial<DesignConfig["grid"]>;
  };
}> = [
  {
    id: "classic-wedding",
    name: "Classic Wedding",
    mood: "Centered, timeless",
    patch: {
      cover: {
        styleId: "classic-full",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 67 },
        subtitlePosition: { x: 50, y: 78 },
        textAlign: "center",
        scrimStyle: "soft-gradient",
        textBackdrop: "none",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.textMedia,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "Playfair Display",
        bodyFont: "Inter",
        titleSize: 52,
        subtitleSize: 18,
      },
      theme: { variant: "dark" },
      grid: { layout: "grid", columns: 3 },
    },
  },
  {
    id: "editorial-split",
    name: "Editorial Split",
    mood: "Magazine left",
    patch: {
      cover: {
        styleId: "editorial-left",
        aspectRatio: "4/3",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 24, y: 62 },
        subtitlePosition: { x: 24, y: 74 },
        textAlign: "left",
        scrimStyle: "blur-band",
        textBackdrop: "dark",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.textMedia,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "Cormorant Garamond",
        bodyFont: "Manrope",
        titleSize: 58,
        subtitleSize: 18,
      },
      theme: { variant: "dark" },
    },
  },
  {
    id: "luxury-dark",
    name: "Luxury Dark",
    mood: "Reception-ready",
    patch: {
      cover: {
        styleId: "cinematic-dark",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 56 },
        subtitlePosition: { x: 50, y: 67 },
        textAlign: "center",
        scrimStyle: "cinematic-dark",
        textBackdrop: "glass",
        textShadow: true,
        titleColor: COVER_COLORS.warmTitle,
        subtitleColor: COVER_COLORS.warmSubtitle,
        textColor: COVER_COLORS.warmTitle,
      },
      typography: {
        headingFont: "Cormorant Garamond",
        bodyFont: "Montserrat",
        titleSize: 60,
        subtitleSize: 17,
      },
      theme: { variant: "dark" },
    },
  },
  {
    id: "haldi-warm",
    name: "Haldi Warm",
    mood: "Yellow, joyful",
    patch: {
      cover: {
        styleId: "hero-overlay",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 58 },
        subtitlePosition: { x: 50, y: 69 },
        textAlign: "center",
        scrimStyle: "warm-vignette",
        textBackdrop: "glass",
        textShadow: true,
        titleColor: COVER_COLORS.haldiTitle,
        subtitleColor: COVER_COLORS.haldiSubtitle,
        textColor: COVER_COLORS.haldiTitle,
      },
      typography: {
        headingFont: "Lora",
        bodyFont: "Manrope",
        titleSize: 54,
        subtitleSize: 18,
      },
      theme: { variant: "dark", accentColor: COVER_COLORS.warmAccent },
      grid: { layout: "grid", columns: 4 },
    },
  },
  {
    id: "mehendi-green",
    name: "Mehendi Green",
    mood: "Botanical, intimate",
    patch: {
      cover: {
        styleId: "classic-split",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 60 },
        subtitlePosition: { x: 50, y: 72 },
        mobileTitlePosition: { x: 50, y: 56 },
        mobileSubtitlePosition: { x: 50, y: 68 },
        textAlign: "center",
        mediaMode: "single-photo",
        scrimStyle: "warm-vignette",
        textBackdrop: "glass",
        textShadow: true,
        titleColor: COVER_COLORS.haldiTitle,
        subtitleColor: COVER_COLORS.haldiSubtitle,
        textColor: COVER_COLORS.haldiTitle,
      },
      typography: {
        headingFont: "Lora",
        bodyFont: "Manrope",
        titleSize: 52,
        subtitleSize: 17,
        mobileTitleSize: 42,
        mobileSubtitleSize: 15,
      },
      theme: { variant: "dark", accentColor: COVER_COLORS.warmAccent },
      grid: { layout: "grid", columns: 4 },
    },
  },
  {
    id: "sangeet-night",
    name: "Sangeet Night",
    mood: "Stage, music, motion",
    patch: {
      cover: {
        styleId: "cinematic-wide",
        aspectRatio: "21/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 54 },
        subtitlePosition: { x: 50, y: 65 },
        mobileTitlePosition: { x: 50, y: 52 },
        mobileSubtitlePosition: { x: 50, y: 63 },
        textAlign: "center",
        mediaMode: "slideshow",
        scrimStyle: "cinematic-dark",
        textBackdrop: "glass",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.receptionSubtitle,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "Montserrat",
        bodyFont: "DM Sans",
        titleSize: 56,
        subtitleSize: 18,
        mobileTitleSize: 44,
        mobileSubtitleSize: 15,
      },
      theme: { variant: "dark" },
      grid: { layout: "grid", columns: 5 },
    },
  },
  {
    id: "engagement-soft",
    name: "Engagement Soft",
    mood: "Romantic, airy",
    patch: {
      cover: {
        styleId: "elegant-frame",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 61 },
        subtitlePosition: { x: 50, y: 72 },
        mobileTitlePosition: { x: 50, y: 58 },
        mobileSubtitlePosition: { x: 50, y: 69 },
        textAlign: "center",
        scrimStyle: "soft-gradient",
        textBackdrop: "glass",
        textShadow: true,
        titleColor: COVER_COLORS.warmTitle,
        subtitleColor: COVER_COLORS.warmSubtitle,
        textColor: COVER_COLORS.warmTitle,
      },
      typography: {
        headingFont: "Cormorant Garamond",
        bodyFont: "Lato",
        titleSize: 58,
        subtitleSize: 17,
        mobileTitleSize: 44,
        mobileSubtitleSize: 15,
      },
      theme: { variant: "dark", accentColor: COVER_COLORS.warmAccent },
    },
  },
  {
    id: "reception-glow",
    name: "Reception Glow",
    mood: "Stage lights",
    patch: {
      cover: {
        styleId: "cinematic-wide",
        aspectRatio: "21/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 56 },
        subtitlePosition: { x: 50, y: 66 },
        textAlign: "center",
        scrimStyle: "cinematic-dark",
        textBackdrop: "glass",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.receptionSubtitle,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "Montserrat",
        bodyFont: "DM Sans",
        titleSize: 50,
        subtitleSize: 16,
      },
      theme: { variant: "dark" },
    },
  },
  {
    id: "minimal-studio",
    name: "Minimal Studio",
    mood: "Clean portfolio",
    patch: {
      cover: {
        styleId: "classic-minimal",
        aspectRatio: "21/9",
        mobileAspectRatio: "3/4",
        titlePosition: { x: 50, y: 52 },
        subtitlePosition: { x: 50, y: 63 },
        textAlign: "center",
        scrimStyle: "light-wash",
        textBackdrop: "light",
        textShadow: false,
        titleColor: COVER_COLORS.editorialTitle,
        subtitleColor: COVER_COLORS.editorialSubtitle,
        textColor: COVER_COLORS.editorialTitle,
      },
      typography: {
        headingFont: "Manrope",
        bodyFont: "Inter",
        titleSize: 46,
        subtitleSize: 16,
      },
      theme: { variant: "light" },
    },
  },
  {
    id: "story-cover",
    name: "Story Cover",
    mood: "Album opener",
    patch: {
      cover: {
        styleId: "magazine-spread",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 48 },
        subtitlePosition: { x: 50, y: 60 },
        textAlign: "center",
        mediaMode: "slideshow",
        scrimStyle: "soft-gradient",
        textBackdrop: "none",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.textMedia,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "Playfair Display",
        bodyFont: "Lato",
        titleSize: 56,
        subtitleSize: 18,
      },
      theme: { variant: "dark" },
    },
  },
  {
    id: "proofing-first",
    name: "Proofing First",
    mood: "Action-focused",
    patch: {
      cover: {
        styleId: "modern-grid",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 56 },
        subtitlePosition: { x: 50, y: 67 },
        textAlign: "center",
        mediaMode: "photo-grid",
        scrimStyle: "cinematic-dark",
        textBackdrop: "dark",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.textMedia,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "DM Sans",
        bodyFont: "Inter",
        titleSize: 44,
        subtitleSize: 16,
      },
      theme: { variant: "dark" },
      grid: { layout: "grid", columns: 5 },
    },
  },
  {
    id: "housewarming-warm",
    name: "Housewarming Warm",
    mood: "Family, blessing",
    patch: {
      cover: {
        styleId: "magazine-minimal",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 72, y: 54 },
        subtitlePosition: { x: 72, y: 66 },
        mobileTitlePosition: { x: 50, y: 56 },
        mobileSubtitlePosition: { x: 50, y: 67 },
        textAlign: "right",
        scrimStyle: "light-wash",
        textBackdrop: "light",
        textShadow: false,
        titleColor: COVER_COLORS.editorialTitle,
        subtitleColor: COVER_COLORS.editorialSubtitle,
        textColor: COVER_COLORS.editorialTitle,
      },
      typography: {
        headingFont: "Lora",
        bodyFont: "Manrope",
        titleSize: 44,
        subtitleSize: 16,
        mobileTitleSize: 36,
        mobileSubtitleSize: 14,
      },
      theme: { variant: "light", accentColor: COVER_COLORS.warmAccent },
    },
  },
  {
    id: "birthday-bright",
    name: "Birthday Bright",
    mood: "Colorful, celebratory",
    patch: {
      cover: {
        styleId: "modern-grid",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 52 },
        subtitlePosition: { x: 50, y: 64 },
        mobileTitlePosition: { x: 50, y: 50 },
        mobileSubtitlePosition: { x: 50, y: 62 },
        textAlign: "center",
        mediaMode: "photo-grid",
        scrimStyle: "soft-gradient",
        textBackdrop: "glass",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.textMedia,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "DM Sans",
        bodyFont: "Inter",
        titleSize: 46,
        subtitleSize: 16,
        mobileTitleSize: 38,
        mobileSubtitleSize: 14,
      },
      theme: { variant: "dark" },
      grid: { layout: "grid", columns: 4 },
    },
  },
  {
    id: "corporate-clean",
    name: "Corporate Clean",
    mood: "Brand-forward",
    patch: {
      cover: {
        styleId: "magazine-minimal",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 72, y: 50 },
        subtitlePosition: { x: 72, y: 61 },
        mobileTitlePosition: { x: 50, y: 52 },
        mobileSubtitlePosition: { x: 50, y: 63 },
        textAlign: "right",
        scrimStyle: "light-wash",
        textBackdrop: "light",
        textShadow: false,
        titleColor: COVER_COLORS.editorialTitle,
        subtitleColor: COVER_COLORS.editorialSubtitle,
        textColor: COVER_COLORS.editorialTitle,
      },
      typography: {
        headingFont: "Manrope",
        bodyFont: "Inter",
        titleSize: 42,
        subtitleSize: 15,
        mobileTitleSize: 34,
        mobileSubtitleSize: 13,
      },
      theme: { variant: "light" },
      grid: { layout: "grid", columns: 3 },
    },
  },
  {
    id: "portfolio-editorial",
    name: "Portfolio Editorial",
    mood: "Photographer showcase",
    patch: {
      cover: {
        styleId: "elegant-border",
        aspectRatio: "16/9",
        mobileAspectRatio: "4/5",
        titlePosition: { x: 50, y: 55 },
        subtitlePosition: { x: 50, y: 66 },
        mobileTitlePosition: { x: 50, y: 54 },
        mobileSubtitlePosition: { x: 50, y: 65 },
        textAlign: "center",
        scrimStyle: "cinematic-dark",
        textBackdrop: "none",
        textShadow: true,
        titleColor: COVER_COLORS.textMedia,
        subtitleColor: COVER_COLORS.receptionSubtitle,
        textColor: COVER_COLORS.textMedia,
      },
      typography: {
        headingFont: "Playfair Display",
        bodyFont: "Lato",
        titleSize: 54,
        subtitleSize: 17,
        mobileTitleSize: 42,
        mobileSubtitleSize: 14,
      },
      theme: { variant: "dark" },
    },
  },
];

type CoverDesignOption = {
  id: string;
  name: string;
  mood: string;
  template: CoverTemplate;
  presetId?: CoverPresetId;
};

const COVER_PRESET_STYLE_IDS = new Set(
  COVER_PRESETS.map((preset) => preset.patch.cover.styleId).filter(
    (styleId): styleId is string => Boolean(styleId),
  ),
);

const COVER_DESIGNS: CoverDesignOption[] = [
  ...COVER_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    mood: preset.mood,
    template: getCoverTemplate(preset.patch.cover.styleId),
    presetId: preset.id,
  })),
  ...COVER_TEMPLATES.filter(
    (template) => !COVER_PRESET_STYLE_IDS.has(template.id),
  ).map((template) => ({
    id: `template-${template.id}`,
    name: template.name,
    mood: template.mood,
    template,
  })),
];

const MEDIA_MODES: Array<{
  id: CoverMediaMode;
  label: string;
  detail: string;
}> = [
  { id: "single-photo", label: "Single Photo", detail: "Classic hero cover" },
  { id: "slideshow", label: "Slideshow", detail: "Rotating opener" },
  { id: "short-video", label: "Short Video", detail: "Motion-first cover" },
  { id: "photo-grid", label: "Photo Grid", detail: "Editorial collage" },
];

const COVER_SCRIM_OPTIONS: Array<{
  id: ScrimStyle;
  label: string;
}> = [
  { id: "soft-gradient", label: "Soft gradient" },
  { id: "cinematic-dark", label: "Cinematic dark" },
  { id: "warm-vignette", label: "Warm vignette" },
  { id: "blur-band", label: "Blur band" },
  { id: "light-wash", label: "Light wash" },
  { id: "none", label: "None" },
];

const COVER_TEXT_BACKDROP_OPTIONS: Array<{
  id: TextBackdrop;
  label: string;
}> = [
  { id: "glass", label: "Glass plate" },
  { id: "dark", label: "Dark plate" },
  { id: "light", label: "Light plate" },
  { id: "none", label: "Text only" },
];

const COVER_TREATMENTS: Array<{
  id: string;
  name: string;
  mood: string;
  scrimStyle: ScrimStyle;
  textBackdrop: TextBackdrop;
  textShadow: boolean;
  titleColor: string;
  subtitleColor: string;
  accentColor?: string;
}> = [
  {
    id: "cinematic-glass",
    name: "Cinematic Glass",
    mood: "Dark gradient, frosted title plate",
    scrimStyle: "cinematic-dark",
    textBackdrop: "glass",
    textShadow: true,
    titleColor: COVER_COLORS.textMedia,
    subtitleColor: COVER_COLORS.receptionSubtitle,
  },
  {
    id: "warm-glow",
    name: "Warm Glow",
    mood: "Champagne tint for haldi or reception",
    scrimStyle: "warm-vignette",
    textBackdrop: "glass",
    textShadow: true,
    titleColor: COVER_COLORS.haldiTitle,
    subtitleColor: COVER_COLORS.haldiSubtitle,
    accentColor: COVER_COLORS.warmAccent,
  },
  {
    id: "editorial-frost",
    name: "Editorial Frost",
    mood: "Light wash with a soft copy panel",
    scrimStyle: "light-wash",
    textBackdrop: "light",
    textShadow: false,
    titleColor: COVER_COLORS.editorialTitle,
    subtitleColor: COVER_COLORS.editorialSubtitle,
    accentColor: COVER_COLORS.warmAccent,
  },
  {
    id: "blur-band",
    name: "Blur Band",
    mood: "Horizontal band blended into the photo",
    scrimStyle: "blur-band",
    textBackdrop: "dark",
    textShadow: true,
    titleColor: COVER_COLORS.textMedia,
    subtitleColor: COVER_COLORS.textMedia,
  },
  {
    id: "clean-shadow",
    name: "Clean Shadow",
    mood: "Photo-first with lifted text",
    scrimStyle: "soft-gradient",
    textBackdrop: "none",
    textShadow: true,
    titleColor: COVER_COLORS.textMedia,
    subtitleColor: COVER_COLORS.textMedia,
  },
];

const DEFAULT_CONFIG: DesignConfig = {
  theme: { id: "liquid-glass", variant: "dark", accentColor: "" },
  cover: {
    assetId: null,
    assetSlots: [],
    styleId: "classic-full",
    layoutPreset: "classic-wedding",
    mediaMode: "single-photo",
    focalPoint: { x: 50, y: 50 },
    mobileFocalPoint: { x: 50, y: 50 },
    zoom: 1,
    mobileZoom: 1,
    slotFocalPoints: [],
    mobileSlotFocalPoints: [],
    slotZooms: [],
    mobileSlotZooms: [],
    mobileAspectRatio: "4/5",
    title: "",
    subtitle: "",
    titleVisible: true,
    subtitleVisible: true,
    titlePosition: { x: 50, y: 70 },
    subtitlePosition: { x: 50, y: 82 },
    mobileTitlePosition: { x: 50, y: 58 },
    mobileSubtitlePosition: { x: 50, y: 70 },
    textAlign: "center",
    textColor: COVER_COLORS.textMedia,
    titleColor: COVER_COLORS.textMedia,
    subtitleColor: COVER_COLORS.textMedia,
    textShadow: true,
    scrimStyle: "soft-gradient",
    textBackdrop: "none",
    aspectRatio: "16/9",
  },
  typography: {
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    titleLanguage: "english",
    subtitleLanguage: "english",
    titleWeight: 600,
    subtitleWeight: 400,
    titleItalic: false,
    subtitleItalic: false,
    titleSize: 48,
    subtitleSize: 18,
    mobileTitleSize: 38,
    mobileSubtitleSize: 15,
  },
  grid: { layout: "grid", columns: 3, gap: DEFAULT_GRID_GAP, showInfo: false },
  sceneHeaders: [],
  branding: {
    logoPlacement: "top-left",
    monogram: "",
    brandColor: "",
    watermarkStyle: "none",
    logoSize: 40,
    logoOpacity: 100,
    watermarkText: "",
    watermarkOpacity: 70,
    applyToAll: false,
  },
  legacyBranding: false,
  version: 4,
};

// ───────────── Helpers ─────────────

function readSavedAssetSlots(value: unknown): Array<string | null> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry : null));
}

function readSavedFocalPoints(value: unknown): FocalPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return { x: 50, y: 50 };
    const point = entry as Partial<FocalPoint>;
    return {
      x:
        typeof point.x === "number" && Number.isFinite(point.x)
          ? clamp(Math.round(point.x), 0, 100)
          : 50,
      y:
        typeof point.y === "number" && Number.isFinite(point.y)
          ? clamp(Math.round(point.y), 0, 100)
          : 50,
    };
  });
}

function clampCoverZoom(value: unknown, fallback = COVER_SLOT_ZOOM_MIN) {
  const zoom = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(zoom)) return fallback;
  return (
    Math.round(clamp(zoom, COVER_SLOT_ZOOM_MIN, COVER_SLOT_ZOOM_MAX) * 100) /
    100
  );
}

function readSavedSlotZooms(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => clampCoverZoom(entry));
}

function readLegacySceneHeaders(value: unknown): SceneHeaderConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const scene = entry as Record<string, unknown>;
    const id = typeof scene.id === "string" ? scene.id : "";
    const label = typeof scene.label === "string" ? scene.label : "";
    if (!id || !label) return [];
    return [
      {
        id,
        label,
        enabled: scene.enabled === true,
        assetId: typeof scene.assetId === "string" ? scene.assetId : null,
      },
    ];
  });
}

function isMeaningfulBrandingConfig(
  value: Partial<DesignConfig["branding"]> | undefined,
): boolean {
  if (!value || typeof value !== "object") return false;
  if (typeof value.monogram === "string" && value.monogram.trim()) return true;
  if (typeof value.brandColor === "string" && value.brandColor.trim()) {
    return true;
  }
  if (typeof value.watermarkText === "string" && value.watermarkText.trim()) {
    return true;
  }
  if (value.watermarkStyle && value.watermarkStyle !== "none") return true;
  if (value.logoPlacement && value.logoPlacement !== "top-left") return true;
  if (typeof value.logoSize === "number" && value.logoSize !== 40) return true;
  if (typeof value.logoOpacity === "number" && value.logoOpacity !== 100) {
    return true;
  }
  if (
    typeof value.watermarkOpacity === "number" &&
    value.watermarkOpacity !== 70
  ) {
    return true;
  }
  return false;
}

function workspaceProfileBranding(
  profile: WorkspaceProfile | null,
): DesignConfig["branding"] {
  const defaults = profile?.gallery_branding_defaults;
  if (!profile?.public_branding_enabled || !defaults) {
    return {
      ...DEFAULT_CONFIG.branding,
      logoPlacement: "hidden",
      watermarkStyle: "none",
    };
  }
  return {
    ...DEFAULT_CONFIG.branding,
    logoPlacement: defaults.logo_placement || "top-left",
    monogram: defaults.monogram || "",
    brandColor: profile.brand_accent_color || "",
    watermarkStyle: defaults.watermark_style || "none",
    logoSize: defaults.logo_size ?? DEFAULT_CONFIG.branding.logoSize,
    logoOpacity: defaults.logo_opacity ?? DEFAULT_CONFIG.branding.logoOpacity,
    watermarkText: defaults.watermark_text || "",
    watermarkOpacity:
      defaults.watermark_opacity ?? DEFAULT_CONFIG.branding.watermarkOpacity,
    applyToAll: true,
  };
}

function normalizeSavedCoverProfile(
  profile: CoverDeviceProfile,
): CoverDeviceProfile {
  const normalized: CoverDeviceProfile = { ...profile };
  if (profile.zoom === undefined) {
    delete normalized.zoom;
  } else {
    normalized.zoom = clampCoverZoom(profile.zoom);
  }
  if (Array.isArray(profile.slotZooms)) {
    normalized.slotZooms = readSavedSlotZooms(profile.slotZooms);
  } else {
    delete normalized.slotZooms;
  }
  return normalized;
}

function normalizeTextPosition(value: unknown, fallback: TextPos): TextPos {
  if (!value || typeof value !== "object") return fallback;
  const point = value as Partial<TextPos>;
  return {
    x:
      typeof point.x === "number" && Number.isFinite(point.x)
        ? clamp(Math.round(point.x), 0, 100)
        : fallback.x,
    y:
      typeof point.y === "number" && Number.isFinite(point.y)
        ? clamp(Math.round(point.y), 0, 100)
        : fallback.y,
  };
}

function desktopTypographyProfile(
  typography: DesignConfig["typography"],
): CoverDeviceTypography {
  return {
    headingFont: typography.headingFont,
    bodyFont: typography.bodyFont,
    titleLanguage: typography.titleLanguage,
    subtitleLanguage: typography.subtitleLanguage,
    titleWeight: typography.titleWeight,
    subtitleWeight: typography.subtitleWeight,
    titleItalic: typography.titleItalic,
    subtitleItalic: typography.subtitleItalic,
    titleSize: typography.titleSize,
    subtitleSize: typography.subtitleSize,
  };
}

function profileFromConfig(
  config: DesignConfig,
  device: PreviewDevice,
): CoverDeviceProfile {
  const sharedCoverFields: Partial<CoverDeviceProfile> = {
    title: config.cover.title,
    subtitle: config.cover.subtitle,
    titleVisible: config.cover.titleVisible,
    subtitleVisible: config.cover.subtitleVisible,
    textAlign: config.cover.textAlign,
    textColor: config.cover.textColor,
    titleColor: config.cover.titleColor,
    subtitleColor: config.cover.subtitleColor,
    textShadow: config.cover.textShadow,
    scrimStyle: config.cover.scrimStyle,
    textBackdrop: config.cover.textBackdrop,
  };
  const sharedTypographyFields: CoverDeviceTypography = {
    headingFont: config.typography.headingFont,
    bodyFont: config.typography.bodyFont,
    titleLanguage: config.typography.titleLanguage,
    subtitleLanguage: config.typography.subtitleLanguage,
    titleWeight: config.typography.titleWeight,
    subtitleWeight: config.typography.subtitleWeight,
    titleItalic: config.typography.titleItalic,
    subtitleItalic: config.typography.subtitleItalic,
  };
  const desktop: CoverDeviceProfile = {
    assetId: config.cover.assetId,
    assetSlots: config.cover.assetSlots,
    styleId: config.cover.styleId,
    layoutPreset: config.cover.layoutPreset,
    mediaMode: config.cover.mediaMode,
    focalPoint: config.cover.focalPoint,
    zoom: config.cover.zoom,
    slotFocalPoints: config.cover.slotFocalPoints,
    slotZooms: config.cover.slotZooms,
    aspectRatio: config.cover.aspectRatio,
    title: config.cover.title,
    subtitle: config.cover.subtitle,
    titleVisible: config.cover.titleVisible,
    subtitleVisible: config.cover.subtitleVisible,
    titlePosition: config.cover.titlePosition,
    subtitlePosition: config.cover.subtitlePosition,
    textAlign: config.cover.textAlign,
    textColor: config.cover.textColor,
    titleColor: config.cover.titleColor,
    subtitleColor: config.cover.subtitleColor,
    textShadow: config.cover.textShadow,
    scrimStyle: config.cover.scrimStyle,
    textBackdrop: config.cover.textBackdrop,
    typography: desktopTypographyProfile(config.typography),
  };
  const savedDesktop = config.cover.deviceProfiles?.desktop;
  const resolvedDesktop = {
    ...desktop,
    ...(savedDesktop || {}),
    ...sharedCoverFields,
    typography: {
      ...(desktop.typography || {}),
      ...(savedDesktop?.typography || {}),
      ...sharedTypographyFields,
      titleSize:
        savedDesktop?.typography?.titleSize ?? config.typography.titleSize,
      subtitleSize:
        savedDesktop?.typography?.subtitleSize ??
        config.typography.subtitleSize,
    },
  };
  if (device === "desktop") return resolvedDesktop;

  const phoneBase: CoverDeviceProfile = {
    ...resolvedDesktop,
    focalPoint: config.cover.mobileFocalPoint,
    zoom: config.cover.mobileZoom,
    slotFocalPoints:
      config.cover.mobileSlotFocalPoints.length > 0
        ? config.cover.mobileSlotFocalPoints
        : resolvedDesktop.slotFocalPoints,
    slotZooms:
      config.cover.mobileSlotZooms.length > 0
        ? config.cover.mobileSlotZooms
        : resolvedDesktop.slotZooms,
    aspectRatio: config.cover.mobileAspectRatio,
    titlePosition: config.cover.mobileTitlePosition,
    subtitlePosition: config.cover.mobileSubtitlePosition,
    typography: {
      ...(resolvedDesktop.typography || {}),
      titleSize: config.typography.mobileTitleSize,
      subtitleSize: config.typography.mobileSubtitleSize,
    },
  };
  const savedPhone = config.cover.deviceProfiles?.phone;
  return {
    ...phoneBase,
    ...(savedPhone || {}),
    ...sharedCoverFields,
    typography: {
      ...(phoneBase.typography || {}),
      ...(savedPhone?.typography || {}),
      ...sharedTypographyFields,
      titleSize:
        savedPhone?.typography?.titleSize ?? config.typography.mobileTitleSize,
      subtitleSize:
        savedPhone?.typography?.subtitleSize ??
        config.typography.mobileSubtitleSize,
    },
  };
}

function setProfileForDevice(
  config: DesignConfig,
  device: PreviewDevice,
  profile: CoverDeviceProfile,
): DesignConfig {
  const nextProfiles = {
    ...(config.cover.deviceProfiles || {}),
    [device]: profile,
  };
  if (device === "phone") {
    return {
      ...config,
      cover: {
        ...config.cover,
        mobileFocalPoint: profile.focalPoint || config.cover.mobileFocalPoint,
        mobileZoom: clampCoverZoom(profile.zoom, config.cover.mobileZoom),
        mobileSlotFocalPoints:
          profile.slotFocalPoints || config.cover.mobileSlotFocalPoints,
        mobileSlotZooms: profile.slotZooms || config.cover.mobileSlotZooms,
        mobileAspectRatio:
          profile.aspectRatio || config.cover.mobileAspectRatio,
        mobileTitlePosition:
          profile.titlePosition || config.cover.mobileTitlePosition,
        mobileSubtitlePosition:
          profile.subtitlePosition || config.cover.mobileSubtitlePosition,
        deviceProfiles: nextProfiles,
      },
      typography: {
        ...config.typography,
        mobileTitleSize:
          profile.typography?.titleSize || config.typography.mobileTitleSize,
        mobileSubtitleSize:
          profile.typography?.subtitleSize ||
          config.typography.mobileSubtitleSize,
      },
    };
  }

  return {
    ...config,
    cover: {
      ...config.cover,
      assetId: profile.assetId ?? null,
      assetSlots: profile.assetSlots || [],
      styleId: (profile.styleId as CoverTemplate["id"]) || config.cover.styleId,
      layoutPreset:
        (profile.layoutPreset as CoverPresetId) || config.cover.layoutPreset,
      mediaMode:
        (profile.mediaMode as CoverMediaMode) || config.cover.mediaMode,
      focalPoint: profile.focalPoint || config.cover.focalPoint,
      zoom: clampCoverZoom(profile.zoom, config.cover.zoom),
      slotFocalPoints: profile.slotFocalPoints || config.cover.slotFocalPoints,
      slotZooms: profile.slotZooms || config.cover.slotZooms,
      aspectRatio: profile.aspectRatio || config.cover.aspectRatio,
      title: profile.title ?? config.cover.title,
      subtitle: profile.subtitle ?? config.cover.subtitle,
      titleVisible: profile.titleVisible ?? config.cover.titleVisible,
      subtitleVisible: profile.subtitleVisible ?? config.cover.subtitleVisible,
      titlePosition: profile.titlePosition || config.cover.titlePosition,
      subtitlePosition:
        profile.subtitlePosition || config.cover.subtitlePosition,
      textAlign: (profile.textAlign as TextAlign) || config.cover.textAlign,
      textColor: profile.textColor || config.cover.textColor,
      titleColor: profile.titleColor || config.cover.titleColor,
      subtitleColor: profile.subtitleColor || config.cover.subtitleColor,
      textShadow: profile.textShadow ?? config.cover.textShadow,
      scrimStyle: (profile.scrimStyle as ScrimStyle) || config.cover.scrimStyle,
      textBackdrop:
        (profile.textBackdrop as TextBackdrop) || config.cover.textBackdrop,
      deviceProfiles: nextProfiles,
    },
    typography: normalizeTypography({
      ...config.typography,
      ...(profile.typography || {}),
      mobileTitleSize: config.typography.mobileTitleSize,
      mobileSubtitleSize: config.typography.mobileSubtitleSize,
    }),
  };
}

function updateProfileForDevice(
  config: DesignConfig,
  device: PreviewDevice,
  coverPatch: Partial<CoverDeviceProfile>,
  typographyPatch?: Partial<CoverDeviceTypography>,
): DesignConfig {
  const current = profileFromConfig(config, device);
  return setProfileForDevice(config, device, {
    ...current,
    ...coverPatch,
    typography: {
      ...(current.typography || {}),
      ...(typographyPatch || {}),
    },
  });
}

function updateSharedTypographyProfiles(
  config: DesignConfig,
  patch: Partial<CoverDeviceTypography>,
): DesignConfig {
  let next = {
    ...config,
    typography: normalizeTypography({
      ...config.typography,
      ...patch,
    }),
  };
  next = updateProfileForDevice(next, "desktop", {}, patch);
  next = updateProfileForDevice(next, "phone", {}, patch);
  return next;
}

function updateSharedCoverProfiles(
  config: DesignConfig,
  patch: Partial<CoverDeviceProfile>,
): DesignConfig {
  let next = {
    ...config,
    cover: {
      ...config.cover,
      ...patch,
    },
  };
  next = updateProfileForDevice(next, "desktop", patch);
  next = updateProfileForDevice(next, "phone", patch);
  return next;
}

function copyDesktopToPhoneProfile(config: DesignConfig): DesignConfig {
  return setProfileForDevice(
    config,
    "phone",
    profileFromConfig(config, "desktop"),
  );
}

function textPositionForDevice(
  config: DesignConfig,
  target: "title" | "subtitle",
  previewDevice: PreviewDevice,
): TextPos {
  const profile = profileFromConfig(config, previewDevice);
  if (target === "title") {
    return (
      (profile.titlePosition as TextPos | undefined) ||
      config.cover.titlePosition
    );
  }
  return (
    (profile.subtitlePosition as TextPos | undefined) ||
    config.cover.subtitlePosition
  );
}

function setTextPositionForDevice(
  config: DesignConfig,
  target: "title" | "subtitle",
  previewDevice: PreviewDevice,
  next: { x?: string | number; y?: string | number },
): DesignConfig {
  const current = textPositionForDevice(config, target, previewDevice);
  return updateProfileForDevice(config, previewDevice, {
    [target === "title" ? "titlePosition" : "subtitlePosition"]: {
      x: next.x === undefined ? current.x : clampPercentInput(next.x),
      y: next.y === undefined ? current.y : clampPercentInput(next.y),
    },
  });
}

function textSizeForDevice(
  config: DesignConfig,
  target: "title" | "subtitle",
  previewDevice: PreviewDevice,
) {
  const profileSize =
    target === "title"
      ? profileFromConfig(config, previewDevice).typography?.titleSize
      : profileFromConfig(config, previewDevice).typography?.subtitleSize;
  if (profileSize) return profileSize;
  if (target === "title") {
    return previewDevice === "phone"
      ? config.typography.mobileTitleSize
      : config.typography.titleSize;
  }
  return previewDevice === "phone"
    ? config.typography.mobileSubtitleSize
    : config.typography.subtitleSize;
}

function setTextSizeForDevice(
  config: DesignConfig,
  target: "title" | "subtitle",
  previewDevice: PreviewDevice,
  value: string | number,
): DesignConfig {
  const bounds =
    target === "title"
      ? previewDevice === "phone"
        ? [MOBILE_TITLE_SIZE_MIN, MOBILE_TITLE_SIZE_MAX]
        : [TITLE_SIZE_MIN, TITLE_SIZE_MAX]
      : previewDevice === "phone"
        ? [MOBILE_SUBTITLE_SIZE_MIN, MOBILE_SUBTITLE_SIZE_MAX]
        : [SUBTITLE_SIZE_MIN, SUBTITLE_SIZE_MAX];
  return updateProfileForDevice(
    config,
    previewDevice,
    {},
    {
      [target === "title" ? "titleSize" : "subtitleSize"]: clampTextSizeInput(
        value,
        bounds[0],
        bounds[1],
      ),
    },
  );
}

function coverAssetIdForSlot(
  config: DesignConfig,
  assets: Asset[],
  slotIndex: number,
  previewDevice: PreviewDevice = "desktop",
): string | null {
  const profile = profileFromConfig(config, previewDevice);
  if (slotIndex === 0) {
    return profile.assetId || profile.assetSlots?.[0] || null;
  }
  return (
    profile.assetSlots?.[slotIndex] ||
    assets[slotIndex]?.id ||
    profile.assetId ||
    null
  );
}

function coverAssetForSlot(
  config: DesignConfig,
  assets: Asset[],
  slotIndex: number,
  previewDevice: PreviewDevice = "desktop",
): Asset | null {
  const assetId = coverAssetIdForSlot(config, assets, slotIndex, previewDevice);
  return assetId ? assets.find((asset) => asset.id === assetId) || null : null;
}

function coverSlotFocalPoint(
  config: DesignConfig,
  slotIndex: number,
  previewDevice: PreviewDevice,
): FocalPoint {
  const profile = profileFromConfig(config, previewDevice);
  if (slotIndex === 0) {
    return (
      (profile.focalPoint as FocalPoint | undefined) || {
        x: 50,
        y: 50,
      }
    );
  }
  const points = profile.slotFocalPoints || [];
  return points[slotIndex] || { x: 50, y: 50 };
}

function coverSlotZoom(
  config: DesignConfig,
  slotIndex: number,
  previewDevice: PreviewDevice,
): number {
  const profile = profileFromConfig(config, previewDevice);
  if (slotIndex === 0) {
    return clampCoverZoom(profile.zoom);
  }
  const zooms = profile.slotZooms || [];
  return clampCoverZoom(zooms[slotIndex]);
}

function setCoverSlotAsset(
  config: DesignConfig,
  slotIndex: number,
  assetId: string,
  previewDevice: PreviewDevice = "desktop",
): DesignConfig {
  const profile = profileFromConfig(config, previewDevice);
  const assetSlots = [...(profile.assetSlots || [])];
  assetSlots[slotIndex] = assetId;
  return updateProfileForDevice(config, previewDevice, {
    assetId: slotIndex === 0 ? assetId : profile.assetId,
    assetSlots,
  });
}

function setCoverSlotFocalPoint(
  config: DesignConfig,
  slotIndex: number,
  previewDevice: PreviewDevice,
  point: FocalPoint,
): DesignConfig {
  const nextPoint = {
    x: clamp(Math.round(point.x), 0, 100),
    y: clamp(Math.round(point.y), 0, 100),
  };
  if (slotIndex === 0) {
    return updateProfileForDevice(config, previewDevice, {
      focalPoint: nextPoint,
    });
  }
  const profile = profileFromConfig(config, previewDevice);
  const points = [...(profile.slotFocalPoints || [])];
  points[slotIndex] = nextPoint;
  return updateProfileForDevice(config, previewDevice, {
    slotFocalPoints: points,
  });
}

function setCoverSlotZoom(
  config: DesignConfig,
  slotIndex: number,
  previewDevice: PreviewDevice,
  zoom: number,
): DesignConfig {
  const nextZoom = clampCoverZoom(zoom);
  if (slotIndex === 0) {
    return updateProfileForDevice(config, previewDevice, {
      zoom: nextZoom,
    });
  }
  const profile = profileFromConfig(config, previewDevice);
  const zooms = [...(profile.slotZooms || [])];
  while (zooms.length <= slotIndex) zooms.push(COVER_SLOT_ZOOM_MIN);
  zooms[slotIndex] = nextZoom;
  return updateProfileForDevice(config, previewDevice, {
    slotZooms: zooms,
  });
}

function normalizeTypography(
  typography: DesignConfig["typography"],
): DesignConfig["typography"] {
  const titleLanguage = getCoverLanguage(typography.titleLanguage).id;
  const subtitleLanguage = getCoverLanguage(typography.subtitleLanguage).id;
  return {
    ...typography,
    titleLanguage,
    subtitleLanguage,
    headingFont: normalizeCoverFontForLanguage(
      typography.headingFont,
      titleLanguage,
    ),
    bodyFont: normalizeCoverFontForLanguage(
      typography.bodyFont,
      subtitleLanguage,
    ),
    titleWeight: normalizeCoverFontWeight(typography.titleWeight, 600),
    subtitleWeight: normalizeCoverFontWeight(typography.subtitleWeight, 400),
    titleItalic: Boolean(typography.titleItalic),
    subtitleItalic: Boolean(typography.subtitleItalic),
    titleSize: clampTextSizeInput(
      typography.titleSize,
      TITLE_SIZE_MIN,
      TITLE_SIZE_MAX,
    ),
    subtitleSize: clampTextSizeInput(
      typography.subtitleSize,
      SUBTITLE_SIZE_MIN,
      SUBTITLE_SIZE_MAX,
    ),
    mobileTitleSize: clampTextSizeInput(
      typography.mobileTitleSize || typography.titleSize,
      MOBILE_TITLE_SIZE_MIN,
      MOBILE_TITLE_SIZE_MAX,
    ),
    mobileSubtitleSize: clampTextSizeInput(
      typography.mobileSubtitleSize || typography.subtitleSize,
      MOBILE_SUBTITLE_SIZE_MIN,
      MOBILE_SUBTITLE_SIZE_MAX,
    ),
  };
}

function applyCoverTemplate(
  config: DesignConfig,
  template: CoverTemplate,
  assets: Asset[],
  previewDevice: PreviewDevice = "desktop",
): DesignConfig {
  const mobileTitlePosition = {
    x:
      template.textAlign === "left"
        ? 28
        : template.textAlign === "right"
          ? 72
          : 50,
    y: Math.min(template.titlePosition.y, 58),
  };
  const mobileSubtitlePosition = {
    x:
      template.textAlign === "left"
        ? 28
        : template.textAlign === "right"
          ? 72
          : 50,
    y: Math.min(template.subtitlePosition.y, 70),
  };
  let next = updateProfileForDevice(config, previewDevice, {
    styleId: template.id,
    mediaMode: template.mediaMode,
    aspectRatio:
      previewDevice === "phone"
        ? template.mobileAspectRatio
        : template.aspectRatio,
    textAlign: template.textAlign,
    titlePosition:
      previewDevice === "phone" ? mobileTitlePosition : template.titlePosition,
    subtitlePosition:
      previewDevice === "phone"
        ? mobileSubtitlePosition
        : template.subtitlePosition,
  });
  if (previewDevice === "desktop" && !config.cover.deviceProfiles?.phone) {
    next = {
      ...next,
      cover: {
        ...next.cover,
        mobileAspectRatio: template.mobileAspectRatio,
        mobileTitlePosition,
        mobileSubtitlePosition,
      },
    };
  }
  const activeProfile = profileFromConfig(next, previewDevice);
  if (activeProfile.assetId && !activeProfile.assetSlots?.[0]) {
    next = setCoverSlotAsset(next, 0, activeProfile.assetId, previewDevice);
  }
  for (const slotIndex of coverTemplateSlotIndices(template)) {
    const profile = profileFromConfig(next, previewDevice);
    const savedAssetId =
      slotIndex === 0
        ? profile.assetId || profile.assetSlots?.[0]
        : profile.assetSlots?.[slotIndex];
    if (savedAssetId) continue;
    const fallbackAsset = assets[slotIndex] || assets[0];
    if (fallbackAsset) {
      next = setCoverSlotAsset(
        next,
        slotIndex,
        fallbackAsset.id,
        previewDevice,
      );
    }
  }
  return next;
}

// Pull a partial design_config out of `gallery.settings` and merge into our
// strict DesignConfig shape. Anything missing keeps its default so users
// who never opened the page get sensible starting state.
function configFromGallery(gallery: Gallery): DesignConfig {
  const settings = (gallery.settings ?? {}) as Record<string, unknown>;
  const raw = settings["design_config"] as Record<string, unknown> | undefined;
  const legacyCoverStyle = settings["cover_style"] as
    | { focal_point?: FocalPoint; aspect_ratio?: string }
    | undefined;

  let merged: DesignConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  // Default title from gallery.title — most users will want this as the
  // starting overlay, not the placeholder string from DEFAULT_CONFIG.
  merged.cover.title = gallery.title || "";
  merged.cover.subtitle = gallery.description || "";

  if (raw && typeof raw === "object") {
    const theme = raw.theme as Partial<DesignConfig["theme"]> | undefined;
    if (theme) Object.assign(merged.theme, theme);
    const cover = raw.cover as Partial<DesignConfig["cover"]> | undefined;
    if (cover) Object.assign(merged.cover, cover);
    const typo = raw.typography as
      | Partial<DesignConfig["typography"]>
      | undefined;
    if (typo) Object.assign(merged.typography, typo);
    const grid = raw.grid as Partial<DesignConfig["grid"]> | undefined;
    if (grid) Object.assign(merged.grid, grid);
    merged.sceneHeaders = readLegacySceneHeaders(raw.sceneHeaders);
    const branding = raw.branding as
      | Partial<DesignConfig["branding"]>
      | undefined;
    if (isMeaningfulBrandingConfig(branding)) {
      Object.assign(merged.branding, branding);
      merged.legacyBranding = true;
    }
  }

  merged.cover.assetSlots = readSavedAssetSlots(merged.cover.assetSlots);
  merged.cover.slotFocalPoints = readSavedFocalPoints(
    merged.cover.slotFocalPoints,
  );
  merged.cover.mobileSlotFocalPoints = readSavedFocalPoints(
    merged.cover.mobileSlotFocalPoints,
  );
  merged.cover.zoom = clampCoverZoom(merged.cover.zoom);
  merged.cover.mobileZoom = clampCoverZoom(merged.cover.mobileZoom);
  merged.cover.slotZooms = readSavedSlotZooms(merged.cover.slotZooms);
  merged.cover.mobileSlotZooms = readSavedSlotZooms(
    merged.cover.mobileSlotZooms,
  );
  if (!merged.cover.assetId && merged.cover.assetSlots[0]) {
    merged.cover.assetId = merged.cover.assetSlots[0];
  }

  // Pre-design-config legacy path — pull focal_point + aspect_ratio out of
  // the older `settings.cover_style` slot so first-time users see their
  // existing cover positioning, not a default 50/50 crosshair.
  if (legacyCoverStyle?.focal_point && !raw) {
    merged.cover.focalPoint = legacyCoverStyle.focal_point;
  }
  if (legacyCoverStyle?.aspect_ratio && !raw) {
    merged.cover.aspectRatio = legacyCoverStyle.aspect_ratio;
  }

  // Legacy cover_asset_id wins only when design_config didn't already pick
  // a coverAssetId — otherwise the studio's choice is the source of truth.
  if (gallery.cover_asset_id && !merged.cover.assetId) {
    merged.cover.assetId = gallery.cover_asset_id;
  }

  // Editor only offers "grid" / "justified" as of 2026-05-18. Legacy
  // galleries with masonry/carousel saved would land on the picker with
  // nothing selected, which is confusing. Migrate them to "grid" on read
  // so the editor always shows a valid current choice. The public viewer
  // schema still accepts all four — this clamp is editor-only.
  if (merged.grid.layout !== "grid" && merged.grid.layout !== "justified") {
    merged.grid.layout = "grid";
  }

  // 2026-05-18: per-element title/subtitle colors split from the legacy
  // single `textColor`. The merged.cover.titleColor/subtitleColor fields
  // were set from Object.assign(cover) above if the saved JSON contained
  // them. For older galleries that only have textColor saved, the
  // Object.assign step doesn't write anything to titleColor/subtitleColor
  // (DEFAULT_CONFIG defaults them to the text-media preset), so we backfill them from
  // the legacy textColor here. The first user save will then persist all
  // three keys side-by-side.
  const savedCover =
    (raw && typeof raw === "object"
      ? (raw.cover as
          | { titleColor?: string; subtitleColor?: string }
          | undefined)
      : undefined) ?? {};
  if (!savedCover.titleColor && merged.cover.textColor) {
    merged.cover.titleColor = merged.cover.textColor;
  }
  if (!savedCover.subtitleColor && merged.cover.textColor) {
    merged.cover.subtitleColor = merged.cover.textColor;
  }
  merged.cover.titleVisible = merged.cover.titleVisible !== false;
  merged.cover.subtitleVisible = merged.cover.subtitleVisible !== false;
  merged.cover.titlePosition = normalizeTextPosition(
    merged.cover.titlePosition,
    DEFAULT_CONFIG.cover.titlePosition,
  );
  merged.cover.subtitlePosition = normalizeTextPosition(
    merged.cover.subtitlePosition,
    DEFAULT_CONFIG.cover.subtitlePosition,
  );
  merged.cover.mobileTitlePosition = normalizeTextPosition(
    merged.cover.mobileTitlePosition,
    merged.cover.titlePosition,
  );
  merged.cover.mobileSubtitlePosition = normalizeTextPosition(
    merged.cover.mobileSubtitlePosition,
    merged.cover.subtitlePosition,
  );
  merged.typography = normalizeTypography(merged.typography);
  const savedDeviceProfiles = merged.cover.deviceProfiles;
  if (savedDeviceProfiles?.desktop) {
    merged = setProfileForDevice(
      merged,
      "desktop",
      normalizeSavedCoverProfile(savedDeviceProfiles.desktop),
    );
  }
  if (savedDeviceProfiles?.phone) {
    merged = setProfileForDevice(
      merged,
      "phone",
      normalizeSavedCoverProfile(savedDeviceProfiles.phone),
    );
  }
  merged.branding.logoSize = clamp(
    Math.round(
      Number(merged.branding.logoSize) || DEFAULT_CONFIG.branding.logoSize,
    ),
    LOGO_SIZE_MIN,
    LOGO_SIZE_MAX,
  );
  const savedLogoOpacity = Number(merged.branding.logoOpacity);
  merged.branding.logoOpacity = clamp(
    Math.round(
      Number.isFinite(savedLogoOpacity)
        ? savedLogoOpacity
        : DEFAULT_CONFIG.branding.logoOpacity,
    ),
    0,
    100,
  );
  merged.branding.watermarkText =
    typeof merged.branding.watermarkText === "string"
      ? merged.branding.watermarkText
      : "";
  const savedWatermarkOpacity = Number(merged.branding.watermarkOpacity);
  merged.branding.watermarkOpacity = clamp(
    Math.round(
      Number.isFinite(savedWatermarkOpacity)
        ? savedWatermarkOpacity
        : DEFAULT_CONFIG.branding.watermarkOpacity,
    ),
    0,
    100,
  );

  return merged;
}

function applyCoverPreset(
  config: DesignConfig,
  presetId: CoverPresetId,
  assets: Asset[] = [],
  previewDevice: PreviewDevice = "desktop",
): DesignConfig {
  const preset = COVER_PRESETS.find((p) => p.id === presetId);
  if (!preset) return config;
  const next = updateProfileForDevice(
    {
      ...config,
      theme: { ...config.theme, ...(preset.patch.theme || {}) },
      grid: { ...config.grid, ...(preset.patch.grid || {}) },
    },
    previewDevice,
    {
      ...(preset.patch.cover || {}),
      layoutPreset: preset.id,
    },
    preset.patch.typography,
  );
  return applyCoverTemplate(
    next,
    getCoverTemplate(
      profileFromConfig(next, previewDevice).styleId || config.cover.styleId,
    ),
    assets,
    previewDevice,
  );
}

function applyCoverDesign(
  config: DesignConfig,
  design: CoverDesignOption,
  assets: Asset[] = [],
  previewDevice: PreviewDevice = "desktop",
): DesignConfig {
  if (design.presetId) {
    return applyCoverPreset(config, design.presetId, assets, previewDevice);
  }
  return applyCoverTemplate(config, design.template, assets, previewDevice);
}

function applyCoverTreatment(
  config: DesignConfig,
  treatment: (typeof COVER_TREATMENTS)[number],
): DesignConfig {
  const next = updateSharedCoverProfiles(config, {
    scrimStyle: treatment.scrimStyle,
    textBackdrop: treatment.textBackdrop,
    textShadow: treatment.textShadow,
    titleColor: treatment.titleColor,
    subtitleColor: treatment.subtitleColor,
    textColor: treatment.titleColor,
  });
  if (!treatment.accentColor) return next;
  return {
    ...next,
    theme: {
      ...next.theme,
      accentColor: treatment.accentColor,
    },
  };
}

function coverTreatmentMatches(
  profile: CoverDeviceProfile,
  config: DesignConfig,
  treatment: (typeof COVER_TREATMENTS)[number],
): boolean {
  return (
    ((profile.scrimStyle as ScrimStyle) || config.cover.scrimStyle) ===
      treatment.scrimStyle &&
    ((profile.textBackdrop as TextBackdrop) || config.cover.textBackdrop) ===
      treatment.textBackdrop &&
    (profile.textShadow ?? config.cover.textShadow) === treatment.textShadow &&
    (profile.titleColor || config.cover.titleColor) === treatment.titleColor &&
    (profile.subtitleColor || config.cover.subtitleColor) ===
      treatment.subtitleColor &&
    (!treatment.accentColor ||
      config.theme.accentColor === treatment.accentColor)
  );
}

function prepareDesignConfigForSave(config: DesignConfig): DesignConfig {
  const desktop = profileFromConfig(config, "desktop");
  const phone = profileFromConfig(config, "phone");
  const payload: DesignConfig = {
    ...config,
    cover: {
      ...config.cover,
      assetId: desktop.assetId ?? null,
      assetSlots: desktop.assetSlots || [],
      styleId: desktop.styleId || config.cover.styleId,
      layoutPreset:
        (desktop.layoutPreset as CoverPresetId) || config.cover.layoutPreset,
      mediaMode:
        (desktop.mediaMode as CoverMediaMode) || config.cover.mediaMode,
      focalPoint: (desktop.focalPoint as FocalPoint) || config.cover.focalPoint,
      zoom: clampCoverZoom(desktop.zoom, config.cover.zoom),
      slotFocalPoints:
        (desktop.slotFocalPoints as FocalPoint[]) ||
        config.cover.slotFocalPoints,
      slotZooms:
        (desktop.slotZooms as number[] | undefined) || config.cover.slotZooms,
      aspectRatio: desktop.aspectRatio || config.cover.aspectRatio,
      title: desktop.title ?? config.cover.title,
      subtitle: desktop.subtitle ?? config.cover.subtitle,
      titleVisible: desktop.titleVisible ?? config.cover.titleVisible,
      subtitleVisible: desktop.subtitleVisible ?? config.cover.subtitleVisible,
      titlePosition:
        (desktop.titlePosition as TextPos) || config.cover.titlePosition,
      subtitlePosition:
        (desktop.subtitlePosition as TextPos) || config.cover.subtitlePosition,
      textAlign: (desktop.textAlign as TextAlign) || config.cover.textAlign,
      textColor: desktop.textColor || config.cover.textColor,
      titleColor: desktop.titleColor || config.cover.titleColor,
      subtitleColor: desktop.subtitleColor || config.cover.subtitleColor,
      textShadow: desktop.textShadow ?? config.cover.textShadow,
      scrimStyle: (desktop.scrimStyle as ScrimStyle) || config.cover.scrimStyle,
      textBackdrop:
        (desktop.textBackdrop as TextBackdrop) || config.cover.textBackdrop,
      mobileFocalPoint:
        (phone.focalPoint as FocalPoint) || config.cover.mobileFocalPoint,
      mobileZoom: clampCoverZoom(phone.zoom, config.cover.mobileZoom),
      mobileSlotFocalPoints:
        (phone.slotFocalPoints as FocalPoint[]) ||
        config.cover.mobileSlotFocalPoints,
      mobileSlotZooms:
        (phone.slotZooms as number[] | undefined) ||
        config.cover.mobileSlotZooms,
      mobileAspectRatio: phone.aspectRatio || config.cover.mobileAspectRatio,
      mobileTitlePosition:
        (phone.titlePosition as TextPos) || config.cover.mobileTitlePosition,
      mobileSubtitlePosition:
        (phone.subtitlePosition as TextPos) ||
        config.cover.mobileSubtitlePosition,
      deviceProfiles: {
        desktop,
        phone,
      },
    },
    typography: normalizeTypography({
      ...config.typography,
      ...(desktop.typography || {}),
      mobileTitleSize:
        phone.typography?.titleSize || config.typography.mobileTitleSize,
      mobileSubtitleSize:
        phone.typography?.subtitleSize || config.typography.mobileSubtitleSize,
    }),
  };
  delete (payload as { legacyBranding?: boolean }).legacyBranding;
  if (!config.legacyBranding) {
    delete (payload as Partial<DesignConfig>).branding;
  }
  return payload;
}

function coverScrimStyle(
  style: ScrimStyle,
  variant: ThemeVariant,
): string | null {
  if (style === "none") return null;
  if (style === "soft-gradient")
    return "linear-gradient(to bottom, var(--cover-scrim-soft-start), var(--cover-scrim-soft-end))";
  if (style === "cinematic-dark")
    return "linear-gradient(180deg, var(--cover-scrim-cinematic-start), var(--cover-scrim-cinematic-end))";
  if (style === "warm-vignette")
    return "radial-gradient(circle at 50% 45%, var(--cover-scrim-warm), var(--cover-scrim-soft-end) 72%)";
  if (style === "blur-band")
    return "linear-gradient(to bottom, transparent 36%, var(--cover-scrim-band) 55%, transparent 76%)";
  if (style === "light-wash")
    return "linear-gradient(to bottom, var(--cover-scrim-light-start), var(--cover-scrim-light-end))";
  if (variant === "dark") return "var(--cover-scrim-dark)";
  if (variant === "auto") return "var(--cover-scrim-auto)";
  return null;
}

function textBackdropStyle(
  style: TextBackdrop,
): React.CSSProperties | undefined {
  if (style === "glass") {
    return {
      background: "var(--cover-text-backdrop-glass-bg)",
      backdropFilter:
        "blur(calc(var(--glass-blur) * 0.6)) saturate(var(--glass-saturation))",
      border: "1px solid var(--cover-text-backdrop-glass-border)",
      borderRadius: "var(--radius-xl)",
      boxShadow: "var(--shadow-md)",
      padding: "var(--cover-text-backdrop-padding)",
    };
  }
  if (style === "dark") {
    return {
      background: "var(--cover-text-backdrop-dark-bg)",
      borderRadius: "var(--radius-xl)",
      padding: "var(--cover-text-backdrop-padding)",
    };
  }
  if (style === "light") {
    return {
      background: "var(--cover-text-backdrop-light-bg)",
      borderRadius: "var(--radius-xl)",
      padding: "var(--cover-text-backdrop-padding)",
    };
  }
  return undefined;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function pctFromEvent(e: { clientX: number; clientY: number }, rect: DOMRect) {
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

function clampPercentInput(value: string | number) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? clamp(Math.round(next), 0, 100) : 50;
}

function clampTextSizeInput(value: string | number, lo: number, hi: number) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? clamp(Math.round(next), lo, hi) : lo;
}

const loadedFontHrefs = new Set<string>();
function ensureFontsLoaded(href: string | null) {
  if (!href) return;
  if (typeof document === "undefined" || loadedFontHrefs.has(href)) return;
  loadedFontHrefs.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

async function hydrateGalleryAssets(
  token: string,
  rows: Awaited<ReturnType<typeof listGalleryAssets>>,
): Promise<Asset[]> {
  const hydrated = rows.every((entry) => entry.asset !== undefined)
    ? rows.map((entry) => entry.asset ?? null)
    : await Promise.all(
        rows.map(async (entry) => {
          try {
            return await getAsset(token, entry.asset_id);
          } catch {
            return null;
          }
        }),
      );
  return hydrated.filter((asset): asset is Asset => asset !== null);
}

// ───────────── Page ─────────────

type DragKind = "focal" | "title" | "subtitle" | null;

export default function CoverDesignPage() {
  const params = useParams();
  const galleryId = params.id as string;
  const stageRef = useRef<HTMLDivElement>(null);
  const dragKindRef = useRef<DragKind>(null);

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [config, setConfig] = useState<DesignConfig>(DEFAULT_CONFIG);
  const [workspaceProfile, setWorkspaceProfile] =
    useState<WorkspaceProfile | null>(null);
  const [tab, setTab] = useState<TabId>("cover");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [activeText, setActiveText] = useState<"title" | "subtitle">("title");
  const [activeCoverSlot, setActiveCoverSlot] = useState(0);
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  // Track the last-saved snapshot of the config so we can show a "dirty"
  // dot on the Save button when current state differs (and clear it
  // immediately on successful save). 2026-05-18: replaces silent
  // "Saving…" text-only feedback that users were missing entirely.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  // `justSaved` runs a brief green check-icon state on the button right
  // after a successful save. Auto-clears after 1800ms so the button
  // returns to its idle look but the user has had a clear "yes that
  // worked" moment.
  const [justSaved, setJustSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const completedCoverUploadKeyRef = useRef("");

  const token = useMemo(() => getStoredAccessToken(), []);
  const apiUrl = useMemo(() => getApiBaseUrl(), []);
  const uploadEncryption = useMemo(
    () => ({
      getKey: () => getOrCreateSyncedGalleryMediaKey(galleryId),
    }),
    [galleryId],
  );
  const upload = useUpload(apiUrl, token, {
    encryption: uploadEncryption,
    destination: { galleryId },
    onTermsRequired: () => setTermsModalOpen(true),
  });

  const updateConfig: React.Dispatch<React.SetStateAction<DesignConfig>> =
    useCallback((action) => {
      setConfig((current) =>
        typeof action === "function"
          ? (action as (value: DesignConfig) => DesignConfig)(current)
          : action,
      );
    }, []);

  // Mount: fetch gallery + assets, hydrate config from gallery.settings.
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [g, galleryAssets, profile] = await Promise.all([
          getGallery(token, galleryId),
          // PERF-23: ask the server to embed each asset in one bulk query so we
          // skip the per-asset getAsset() fan-out (the gallery detail page does
          // the same). The loop below remains the fallback for an older server
          // or a degraded include response.
          listGalleryAssets(token, galleryId, { includeAssets: true }),
          getWorkspaceProfile(token).catch(() => null),
        ]);
        if (cancelled) return;
        setGallery(g);
        setWorkspaceProfile(profile);

        const realAssets = await hydrateGalleryAssets(token, galleryAssets);
        if (cancelled) return;
        setAssets(realAssets);

        const initial = configFromGallery(g);
        const persistedSnapshot = JSON.stringify(
          prepareDesignConfigForSave(initial),
        );
        if (!initial.cover.assetId) {
          initial.cover.assetId = realAssets[0]?.id || null;
          if (initial.cover.assetId) {
            initial.cover.assetSlots[0] = initial.cover.assetId;
          }
        }
        setConfig(initial);
        // If no photographer-set cover exists yet, keep the first asset visible
        // as the working default while the saved snapshot stays at the persisted
        // state. Saving then makes that default durable through Design Studio.
        setSavedSnapshot((prev) => (prev ? prev : persistedSnapshot));
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load Cover & Design data:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId]);

  const completedCoverUploadKey = useMemo(
    () =>
      upload.items
        .filter((item) => item.status === "complete" && item.assetId)
        .map((item) => item.assetId as string)
        .sort()
        .join("|"),
    [upload.items],
  );

  useEffect(() => {
    if (
      !completedCoverUploadKey ||
      completedCoverUploadKeyRef.current === completedCoverUploadKey
    ) {
      return;
    }
    completedCoverUploadKeyRef.current = completedCoverUploadKey;
    if (!token) return;

    let cancelled = false;
    const completedIds = upload.items
      .filter((item) => item.status === "complete" && item.assetId)
      .map((item) => item.assetId as string);
    const preferredAssetId = completedIds[completedIds.length - 1] ?? null;

    (async () => {
      try {
        const rows = await listGalleryAssets(token, galleryId, {
          includeAssets: true,
        });
        const nextAssets = await hydrateGalleryAssets(token, rows);
        if (cancelled) return;
        setAssets(nextAssets);
        const uploadedAsset =
          (preferredAssetId
            ? nextAssets.find((asset) => asset.id === preferredAssetId)
            : null) ?? null;
        if (uploadedAsset) {
          setConfig((current) =>
            setCoverSlotAsset(
              current,
              activeCoverSlot,
              uploadedAsset.id,
              previewDevice,
            ),
          );
          setSaveMessage(
            "Cover photo uploaded. Review the crop, then save Cover & Design.",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setSaveError(
            err instanceof Error
              ? err.message
              : "Failed to refresh cover photos after upload.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    completedCoverUploadKey,
    galleryId,
    activeCoverSlot,
    previewDevice,
    token,
    upload.items,
  ]);

  // Lazy-load the active title/subtitle fonts so the live preview matches what
  // the public viewer will render. Same Google Fonts URL the public
  // hero injects via <link>.
  useEffect(() => {
    if (!loaded) return;
    ensureFontsLoaded(
      buildCoverGoogleFontsHref([
        config.typography.headingFont,
        config.typography.bodyFont,
      ]),
    );
  }, [loaded, config.typography.headingFont, config.typography.bodyFont]);

  // Preload the currently selected language catalogs so the custom
  // font-picker dropdown can show each option styled in its own script.
  // We intentionally load only the title/subtitle languages instead of every
  // Indian script at once; the catalog is large enough that loading all of it
  // would make the editor heavier for no benefit.
  useEffect(() => {
    if (!loaded) return;
    ensureFontsLoaded(
      buildCoverGoogleFontsHref([
        ...getCoverFontsForLanguage(config.typography.titleLanguage).map(
          (font) => font.name,
        ),
        ...getCoverFontsForLanguage(config.typography.subtitleLanguage).map(
          (font) => font.name,
        ),
      ]),
    );
  }, [
    loaded,
    config.typography.titleLanguage,
    config.typography.subtitleLanguage,
  ]);

  const activeCoverProfile = profileFromConfig(config, previewDevice);
  const activeTemplate = getCoverTemplate(
    activeCoverProfile.styleId || config.cover.styleId,
  );
  const activeCoverSlotIndex = Math.min(
    activeCoverSlot,
    activeTemplate.slotCount - 1,
  );
  const hasCoverPreview = coverTemplateSlotIndices(activeTemplate).some(
    (slotIndex) =>
      Boolean(coverAssetForSlot(config, assets, slotIndex, previewDevice)),
  );

  // ───────────── Drag handlers ─────────────

  const onStagePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!stageRef.current) return;
      // What's being dragged is decided by data-handle on the target.
      const target = e.target as HTMLElement;
      const handle = target.closest<HTMLElement>("[data-handle]");
      const slot = target.closest<HTMLElement>("[data-cover-slot]");
      if (slot?.dataset.coverSlot) {
        const slotIndex = Number(slot.dataset.coverSlot);
        if (Number.isFinite(slotIndex)) {
          setActiveCoverSlot(slotIndex);
          setTab("photos");
        }
      }
      const kind = (handle?.dataset.handle as DragKind) || "focal";
      if (kind === "title" || kind === "subtitle") {
        setActiveText(kind);
        setTab("text");
      }
      dragKindRef.current = kind;
      setDragKind(kind);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pen drivers */
      }
      e.preventDefault();
    },
    [],
  );

  const onStagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const kind = dragKindRef.current;
      if (!kind || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const { x, y } = pctFromEvent(e, rect);
      setConfig((c) => {
        if (kind === "focal") {
          return setCoverSlotFocalPoint(
            c,
            activeCoverSlotIndex,
            previewDevice,
            {
              x,
              y,
            },
          );
        }
        if (kind === "title") {
          return setTextPositionForDevice(c, "title", previewDevice, { x, y });
        }
        if (kind === "subtitle") {
          return setTextPositionForDevice(c, "subtitle", previewDevice, {
            x,
            y,
          });
        }
        return c;
      });
    },
    [activeCoverSlotIndex, previewDevice],
  );

  const onStagePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragKindRef.current = null;
      setDragKind(null);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // ───────────── Save ─────────────

  const handleSave = async () => {
    if (!token) {
      setSaveError("Your session expired. Please log in again.");
      return;
    }
    if (!config.cover.assetId) {
      setSaveError("Pick a cover photo before saving.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    setJustSaved(false);
    try {
      const payload = prepareDesignConfigForSave(config);
      await updateGalleryDesign(
        token,
        galleryId,
        payload as unknown as Record<string, unknown>,
      );
      // Capture the snapshot of what we just sent so the dirty-dot logic
      // recognises this state as "clean". Use JSON.stringify of the same
      // serialisation we sent over the wire so the comparison is exact.
      setSavedSnapshot(JSON.stringify(payload));
      setSaveMessage("Cover & Design saved.");
      setJustSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save design.",
      );
    } finally {
      setSaving(false);
    }
  };

  // After a successful save, the green "Saved" pulse lives for 1800ms.
  // Long enough to register, short enough that the next click attempt
  // gets the regular idle Save button back. The toast text below the
  // header (`saveMessage`) auto-clears 3.5s after the same save so the
  // page returns to a clean state without manual dismissal.
  useEffect(() => {
    if (!justSaved) return;
    const t1 = window.setTimeout(() => setJustSaved(false), 1800);
    const t2 = window.setTimeout(() => setSaveMessage(""), 3500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [justSaved]);

  const isDirty =
    savedSnapshot !== "" &&
    savedSnapshot !== JSON.stringify(prepareDesignConfigForSave(config));

  // ───────────── Derived preview state ─────────────

  const activeScrim = coverScrimStyle(
    (activeCoverProfile.scrimStyle as ScrimStyle) || config.cover.scrimStyle,
    config.theme.variant,
  );
  // Drag anchor is always the CENTER of the text bounding box, regardless
  // of textAlign. Earlier behavior used textAlign to pick the anchor edge
  // (left = left edge, right = right edge), which made dragging feel
  // disconnected — the user's pointer grabbed the text but a different
  // edge tracked their finger. Center anchoring matches how Canva / Figma
  // / Keynote handle freely-positioned text: the object is grabbed at its
  // visual middle. textAlign still controls multi-line alignment inside
  // the box; it just no longer affects WHERE the box sits relative to the
  // saved position.
  const textShadowStyle =
    (activeCoverProfile.textShadow ?? config.cover.textShadow)
      ? "var(--cover-text-shadow)"
      : undefined;
  const activeTextBackdropStyle = textBackdropStyle(
    (activeCoverProfile.textBackdrop as TextBackdrop) ||
      config.cover.textBackdrop,
  );
  const previewTitle = activeCoverProfile.title?.trim() || gallery?.title || "";
  const previewSubtitle =
    activeCoverProfile.subtitle?.trim() || gallery?.description || "";
  const previewTitlePosition = textPositionForDevice(
    config,
    "title",
    previewDevice,
  );
  const previewSubtitlePosition = textPositionForDevice(
    config,
    "subtitle",
    previewDevice,
  );
  const previewTitleSize = textSizeForDevice(config, "title", previewDevice);
  const previewSubtitleSize = textSizeForDevice(
    config,
    "subtitle",
    previewDevice,
  );
  const activeTypographyProfile =
    activeCoverProfile.typography ||
    desktopTypographyProfile(config.typography);
  const effectiveBranding = config.legacyBranding
    ? config.branding
    : workspaceProfileBranding(workspaceProfile);
  const watermarkLabel =
    effectiveBranding.watermarkText.trim() || effectiveBranding.monogram;

  // ───────────── Render ─────────────

  return (
    <GalleryPageShell
      galleryId={galleryId}
      width="full"
      mode="workbench"
      className="text-on-surface"
    >
      <div className="sr-only">
        <GalleryPageHeader title="Cover & Design" />
      </div>

      {(saveMessage || saveError) && (
        <div role="status" aria-live="polite">
          {saveMessage && (
            <Badge variant="success">
              <Check aria-hidden />
              {saveMessage}
            </Badge>
          )}
          {saveError && <Badge variant="danger">{saveError}</Badge>}
        </div>
      )}

      <ResizableWorkspaceSplit
        className="cover-editor-layout cover-workbench"
        storageKey="rawdrive:gallery-workspace:cover:split:v1"
        label="Resize live preview and settings"
        secondarySide="end"
        defaultSecondaryPercent={34}
        minSecondaryPercent={26}
        maxSecondaryPercent={46}
        minSecondaryPx={340}
        maxSecondaryPx={520}
      >
        {/* ───────── LIVE PREVIEW ───────── */}
        <section className="cover-preview-section cover-preview-pane">
          <div className="cover-preview-toolbar mb-3 flex flex-wrap items-center justify-between gap-3">
            <div
              className="glass-segmented cover-device-toggle"
              role="group"
              aria-label="Preview device"
            >
              {(["desktop", "phone"] as PreviewDevice[]).map((device) => (
                <button
                  key={device}
                  type="button"
                  onClick={() => setPreviewDevice(device)}
                  aria-pressed={previewDevice === device}
                  aria-label={
                    device === "desktop" ? "Desktop preview" : "Phone preview"
                  }
                  className="glass-segmented-option"
                >
                  {device === "desktop" ? "Desktop" : "Phone"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-on-surface-variant">
                {previewDevice === "phone"
                  ? "Phone profile is active for cover edits."
                  : "Desktop profile is active for cover edits."}
              </p>
              <GlassButton
                type="button"
                variant="surface"
                size="sm"
                onClick={() =>
                  updateConfig((current) => copyDesktopToPhoneProfile(current))
                }
              >
                Copy desktop to phone
              </GlassButton>
            </div>
          </div>
          <div
            ref={stageRef}
            onPointerDown={hasCoverPreview ? onStagePointerDown : undefined}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            className={`cover-editor-stage cover-editor-stage--${previewDevice} relative w-full select-none overflow-hidden ${
              hasCoverPreview
                ? dragKind
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-default"
            } ${previewDevice === "phone" ? "mx-auto max-w-sm" : ""}`}
            style={{
              aspectRatio:
                activeCoverProfile.aspectRatio ||
                (previewDevice === "phone"
                  ? config.cover.mobileAspectRatio
                  : config.cover.aspectRatio),
              touchAction: "none",
            }}
            aria-label="Cover preview — drag photo to pan, use photo zoom to resize, drag title/subtitle to position"
          >
            <CoverTemplateStage
              template={activeTemplate}
              config={config}
              assets={assets}
              token={token}
              previewDevice={previewDevice}
              activeSlot={activeCoverSlotIndex}
              onSelectSlot={(slotIndex) => {
                setActiveCoverSlot(slotIndex);
                setTab("photos");
              }}
            />

            {activeScrim && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: activeScrim }}
              />
            )}

            {previewDevice === "phone" && (
              <div
                className="cover-preview-safe-zone pointer-events-none absolute inset-x-7 inset-y-12 z-10 rounded-xl"
                aria-label="Mobile safe zone"
              >
                <span className="cover-preview-safe-zone-label absolute left-3 top-3">
                  Safe zone
                </span>
              </div>
            )}

            {/* Title overlay — draggable. whitespace: pre prevents the
                browser from soft-wrapping single-line titles when they get
                close to the canvas edge during a drag. Earlier behavior
                used whitespace-pre-wrap + maxWidth:80%, so "Ram Wedding"
                would split mid-drag into "Ram" / "Wedding" the moment the
                container's available width fell below the text's natural
                width — felt like the title was fighting back against the
                user. Multi-line titles work by typing an explicit newline,
                which `pre` preserves. */}
            {activeCoverProfile.titleVisible !== false && previewTitle && (
              <h2
                data-handle="title"
                lang={
                  getCoverLanguage(activeTypographyProfile.titleLanguage)
                    .htmlLang
                }
                dir={
                  getCoverLanguage(activeTypographyProfile.titleLanguage).dir
                }
                className={`absolute touch-none font-semibold tracking-tight transition-shadow ${
                  activeText === "title" && tab === "text"
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-scrim-strong/30"
                    : ""
                }`}
                style={{
                  left: `${previewTitlePosition.x}%`,
                  top: `${previewTitlePosition.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: fontFamilyForCoverText(
                    activeTypographyProfile.headingFont,
                    activeTypographyProfile.titleLanguage,
                  ),
                  fontSize: `${previewTitleSize}px`,
                  fontWeight: activeTypographyProfile.titleWeight,
                  fontStyle: activeTypographyProfile.titleItalic
                    ? "italic"
                    : "normal",
                  direction: getCoverLanguage(
                    activeTypographyProfile.titleLanguage,
                  ).dir,
                  color:
                    activeCoverProfile.titleColor ||
                    activeCoverProfile.textColor ||
                    config.cover.titleColor ||
                    config.cover.textColor,
                  textShadow: textShadowStyle,
                  textAlign:
                    (activeCoverProfile.textAlign as TextAlign) ||
                    config.cover.textAlign,
                  cursor: "grab",
                  padding: "var(--space-1) var(--space-2)",
                  borderRadius: "var(--radius-sm)",
                  lineHeight: 1.1,
                  userSelect: "none",
                  whiteSpace: "pre",
                  ...activeTextBackdropStyle,
                }}
                onClick={() => {
                  setActiveText("title");
                  setTab("text");
                }}
              >
                {previewTitle}
              </h2>
            )}

            {/* Subtitle overlay — draggable. Same wrap rules as title. */}
            {activeCoverProfile.subtitleVisible !== false &&
              previewSubtitle && (
                <p
                  data-handle="subtitle"
                  lang={
                    getCoverLanguage(activeTypographyProfile.subtitleLanguage)
                      .htmlLang
                  }
                  dir={
                    getCoverLanguage(activeTypographyProfile.subtitleLanguage)
                      .dir
                  }
                  className={`absolute touch-none transition-shadow ${
                    activeText === "subtitle" && tab === "text"
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-scrim-strong/30"
                      : ""
                  }`}
                  style={{
                    left: `${previewSubtitlePosition.x}%`,
                    top: `${previewSubtitlePosition.y}%`,
                    transform: "translate(-50%, -50%)",
                    fontFamily: fontFamilyForCoverText(
                      activeTypographyProfile.bodyFont,
                      activeTypographyProfile.subtitleLanguage,
                    ),
                    fontSize: `${previewSubtitleSize}px`,
                    fontWeight: activeTypographyProfile.subtitleWeight,
                    fontStyle: activeTypographyProfile.subtitleItalic
                      ? "italic"
                      : "normal",
                    direction: getCoverLanguage(
                      activeTypographyProfile.subtitleLanguage,
                    ).dir,
                    color:
                      activeCoverProfile.subtitleColor ||
                      activeCoverProfile.textColor ||
                      config.cover.subtitleColor ||
                      config.cover.textColor,
                    textShadow: textShadowStyle,
                    textAlign:
                      (activeCoverProfile.textAlign as TextAlign) ||
                      config.cover.textAlign,
                    cursor: "grab",
                    padding: "var(--space-1) var(--space-2)",
                    borderRadius: "var(--radius-sm)",
                    lineHeight: 1.3,
                    userSelect: "none",
                    whiteSpace: "pre",
                    ...activeTextBackdropStyle,
                  }}
                  onClick={() => {
                    setActiveText("subtitle");
                    setTab("text");
                  }}
                >
                  {previewSubtitle}
                </p>
              )}

            {/* Drag-hint pill */}
            {hasCoverPreview && !dragKind && (
              <div className="cover-preview-drag-hint pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
                {tab === "text"
                  ? "Drag title / subtitle to position"
                  : activeTemplate.slotCount > 1
                    ? `Drag photo ${activeCoverSlotIndex + 1} to pan; use zoom below`
                    : "Drag photo to pan; use zoom below"}
              </div>
            )}

            {effectiveBranding.logoPlacement !== "hidden" &&
              effectiveBranding.monogram && (
                <div
                  className={`cover-brand-mark pointer-events-none absolute z-20 inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                    effectiveBranding.logoPlacement === "top-right"
                      ? "right-4 top-4"
                      : effectiveBranding.logoPlacement === "bottom-left"
                        ? "bottom-4 left-4"
                        : effectiveBranding.logoPlacement === "bottom-right"
                          ? "bottom-4 right-4"
                          : "left-4 top-4"
                  }`}
                  style={{
                    color: effectiveBranding.brandColor || undefined,
                    borderColor: effectiveBranding.brandColor || undefined,
                    width: `${effectiveBranding.logoSize}px`,
                    minWidth: `${effectiveBranding.logoSize}px`,
                    height: `${effectiveBranding.logoSize}px`,
                    opacity: effectiveBranding.logoOpacity / 100,
                  }}
                >
                  {effectiveBranding.monogram}
                </div>
              )}
            {effectiveBranding.watermarkStyle !== "none" && watermarkLabel && (
              <div
                className={`cover-watermark-preview cover-watermark-preview--${effectiveBranding.watermarkStyle}`}
                style={{
                  color:
                    effectiveBranding.brandColor ||
                    config.cover.textColor ||
                    undefined,
                  opacity: effectiveBranding.watermarkOpacity / 100,
                }}
                aria-hidden
              >
                {effectiveBranding.watermarkStyle === "tiled"
                  ? Array.from({ length: 6 }, (_, index) => (
                      <span key={index}>{watermarkLabel}</span>
                    ))
                  : watermarkLabel}
              </div>
            )}
          </div>
        </section>

        <section
          className="cover-inspector-pane"
          aria-label="Cover design controls"
        >
          <div
            className="cover-inspector-tabs glass-segmented"
            role="group"
            aria-label="Cover editor sections"
          >
            {EDITOR_TABS.map((editorTab) => (
              <button
                key={editorTab.id}
                type="button"
                className="glass-segmented-option"
                data-cover-editor-tab={editorTab.id}
                aria-pressed={tab === editorTab.id}
                onClick={() => setTab(editorTab.id)}
              >
                {editorTab.label}
              </button>
            ))}
          </div>

          <div
            className="cover-mobile-task-tabs"
            role="group"
            aria-label="Mobile cover editor sections"
          >
            {EDITOR_TABS.map((editorTab) => (
              <button
                key={editorTab.id}
                type="button"
                className="cover-mobile-task-tab"
                data-cover-editor-tab={editorTab.id}
                data-state={tab === editorTab.id ? "active" : "idle"}
                aria-pressed={tab === editorTab.id}
                onClick={() => setTab(editorTab.id)}
              >
                {editorTab.mobileLabel}
              </button>
            ))}
          </div>

          {/* ───────── EDITOR PANEL ───────── */}
          <section>
            {/* The panel body renders the active section selected from the
              dedicated task tabs above. */}
            {tab === "videos" ? (
              <EmbeddedVideosPanel
                galleryId={galleryId}
                initialVideos={readEmbeddedVideos(gallery?.settings)}
                className="cover-videos-panel"
                onChange={(next: EmbeddedVideo[]) => {
                  setGallery((prev) =>
                    prev
                      ? {
                          ...prev,
                          settings: {
                            ...(prev.settings ?? {}),
                            embedded_videos: next,
                          },
                        }
                      : prev,
                  );
                }}
              />
            ) : (
              <Card variant="panel" padding="md" className="cover-editor-panel">
                {tab === "cover" && (
                  <PanelCover
                    assets={assets}
                    config={config}
                    setConfig={updateConfig}
                    previewDevice={previewDevice}
                    setActiveCoverSlot={setActiveCoverSlot}
                  />
                )}
                {tab === "photos" && (
                  <PanelGalleryPhotos
                    assets={assets}
                    token={token}
                    config={config}
                    setConfig={updateConfig}
                    previewDevice={previewDevice}
                    activeCoverSlot={activeCoverSlotIndex}
                    setActiveCoverSlot={setActiveCoverSlot}
                    onFilesAccepted={upload.addFiles}
                    uploadItems={upload.items}
                    uploadPaused={upload.isPaused}
                    onCancelUpload={upload.cancel}
                    onRetryUpload={upload.retry}
                  />
                )}
                {tab === "text" && (
                  <PanelText
                    config={config}
                    setConfig={updateConfig}
                    albumTitle={gallery?.title || ""}
                    albumSubtitle={gallery?.description || ""}
                    previewDevice={previewDevice}
                    activeText={activeText}
                    setActiveText={setActiveText}
                    setTab={setTab}
                  />
                )}
                {tab === "media" && (
                  <PanelMedia
                    config={config}
                    setConfig={updateConfig}
                    assets={assets}
                    previewDevice={previewDevice}
                  />
                )}
                {tab === "brand" && (
                  <PanelBrand config={config} setConfig={updateConfig} />
                )}
                {tab === "grid" && (
                  <PanelGrid
                    config={config}
                    setConfig={updateConfig}
                    assets={assets}
                    token={token}
                  />
                )}
              </Card>
            )}
          </section>

          <div className="cover-save-dock" aria-live="polite">
            <GlassButton
              type="button"
              onClick={handleSave}
              disabled={saving || !config.cover.assetId}
              aria-label={
                saving
                  ? "Saving cover and design"
                  : justSaved
                    ? "Cover and design saved"
                    : isDirty
                      ? "Save cover and design (unsaved changes)"
                      : "Save cover and design"
              }
              variant={justSaved ? "success" : "primary"}
              icon={
                saving ? (
                  <Loader2 className="cover-save-button__spinner" aria-hidden />
                ) : justSaved ? (
                  <Check aria-hidden />
                ) : undefined
              }
              className="cover-save-button"
            >
              {saving ? "Saving..." : justSaved ? "Saved" : "Save"}
              {isDirty && !saving && !justSaved && (
                <span className="cover-save-button__dirty" aria-hidden />
              )}
            </GlassButton>
          </div>
        </section>
      </ResizableWorkspaceSplit>
      <TermsAcceptanceModal
        open={termsModalOpen}
        token={token}
        onAccepted={() => setTermsModalOpen(false)}
        onCancel={() => setTermsModalOpen(false)}
      />
    </GalleryPageShell>
  );
}

// ───────────── Shared controls ─────────────

/**
 * FontPicker — custom dropdown with per-option font preview.
 *
 * Native <select> options don't honor `font-family` styling reliably
 * across browsers (Webkit/Chromium render every option in the OS UI
 * font regardless of the CSS), so the user can't tell which option
 * is which serif/sans/mono without picking it first. This component
 * is a button + absolutely-positioned popover panel, where each
 * option's button is styled in the font itself — Figma/Canva pattern.
 *
 * Keyboard:
 *   - Click trigger or Space/Enter opens the panel
 *   - Arrow Up/Down moves focus within the open panel
 *   - Enter on an option commits + closes
 *   - Escape closes without committing
 *
 * Click-outside closes the panel without commit.
 */
function FontPicker({
  id,
  value,
  languageId,
  options,
  sampleText,
  onChange,
  onOpenChange,
  ariaLabel,
}: {
  id: string;
  value: string;
  languageId: string;
  options: CoverFontOption[];
  sampleText: string;
  onChange: (next: string) => void;
  onOpenChange?: (open: boolean) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Notify parent when the popover opens so they can hoist active-text
  // state (e.g. PanelText uses this to keep the preview overlay's
  // selection ring in sync with whichever font input the user is in).
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Click-outside to close. Use mousedown so the close happens before
  // any other click handler fires inside the panel.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Escape closes; ArrowDown/ArrowUp scrolls focused option within the
  // panel. Lives on container so global keyboard nav still works when
  // the user re-clicks the trigger.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!listRef.current) return;
        const buttons = Array.from(
          listRef.current.querySelectorAll<HTMLButtonElement>(
            "[data-font-option]",
          ),
        );
        const currentIdx = buttons.findIndex(
          (b) => b === document.activeElement,
        );
        const nextIdx =
          e.key === "ArrowDown"
            ? Math.min(buttons.length - 1, currentIdx + 1)
            : Math.max(0, currentIdx === -1 ? 0 : currentIdx - 1);
        buttons[nextIdx]?.focus();
      }
    },
    [open],
  );

  // Scroll the selected option into view when the popover opens — makes
  // the dropdown feel native (jumps to current value rather than top).
  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector<HTMLButtonElement>(
      `[data-font-option="${CSS.escape(value)}"]`,
    );
    selected?.scrollIntoView?.({ block: "nearest" });
    selected?.focus();
  }, [open, value]);

  return (
    <div
      ref={containerRef}
      className="cover-font-picker"
      onKeyDown={handleKeyDown}
    >
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || `Select font, current: ${value}`}
        className="cover-font-trigger"
      >
        <span
          className="cover-font-trigger__value"
          style={{ fontFamily: fontFamilyForCoverText(value, languageId) }}
        >
          {value}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className={`cover-font-trigger__chevron ${open ? "cover-font-trigger__chevron--open" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1.5 6 6.5 11 1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel || "Font options"}
          className="cover-font-popover"
        >
          {options.map((f) => {
            const selected = f.name === value;
            return (
              <button
                key={f.name}
                type="button"
                role="option"
                aria-selected={selected}
                data-font-option={f.name}
                data-state={selected ? "selected" : "unselected"}
                onClick={() => {
                  onChange(f.name);
                  setOpen(false);
                }}
                className="cover-font-option"
                style={{
                  fontFamily: fontFamilyForCoverText(f.name, languageId),
                }}
              >
                <span className="cover-font-option__name">{f.name}</span>
                <span
                  className="cover-font-option__sample"
                  style={{
                    fontFamily: fontFamilyForCoverText(f.name, languageId),
                  }}
                  aria-hidden
                >
                  {sampleText}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CoverTemplateMiniPreview({ template }: { template: CoverTemplate }) {
  return (
    <span
      className={`cover-template-mini cover-template-mini--${template.layout}`}
      aria-hidden
    >
      {coverTemplateSlotIndices(template).map((slotIndex) => (
        <span key={slotIndex} className="cover-template-mini__photo" />
      ))}
      <span className="cover-template-mini__title" />
      {template.layout === "outline" && (
        <span className="cover-template-mini__outline" />
      )}
    </span>
  );
}

function CoverTreatmentPreview({
  treatment,
}: {
  treatment: (typeof COVER_TREATMENTS)[number];
}) {
  return (
    <span
      className={`cover-treatment-preview cover-treatment-preview--${treatment.id}`}
      aria-hidden
    >
      <span className="cover-treatment-preview__photo" />
      <span className="cover-treatment-preview__scrim" />
      <span className="cover-treatment-preview__copy">
        <span className="cover-treatment-preview__title" />
        <span className="cover-treatment-preview__subtitle" />
      </span>
    </span>
  );
}

function CoverTemplateStage({
  template,
  config,
  assets,
  token,
  previewDevice,
  activeSlot,
  onSelectSlot,
}: {
  template: CoverTemplate;
  config: DesignConfig;
  assets: Asset[];
  token: string | null;
  previewDevice: PreviewDevice;
  activeSlot: number;
  onSelectSlot: (slotIndex: number) => void;
}) {
  return (
    <div
      className={`cover-template-layout cover-template-layout--${template.layout}`}
      data-cover-template={template.id}
    >
      {coverTemplateSlotIndices(template).map((slotIndex) => (
        <CoverTemplateStageSlot
          key={slotIndex}
          asset={coverAssetForSlot(config, assets, slotIndex, previewDevice)}
          token={token}
          focalPoint={coverSlotFocalPoint(config, slotIndex, previewDevice)}
          zoom={coverSlotZoom(config, slotIndex, previewDevice)}
          slotIndex={slotIndex}
          active={slotIndex === activeSlot}
          onSelect={() => onSelectSlot(slotIndex)}
        />
      ))}
      {template.layout === "journal" && (
        <div className="cover-template-journal-panel" aria-hidden />
      )}
      {template.layout === "outline" && (
        <div className="cover-template-outline" aria-hidden />
      )}
    </div>
  );
}

function CoverTemplateStageSlot({
  asset,
  token,
  focalPoint,
  zoom,
  slotIndex,
  active,
  onSelect,
}: {
  asset: Asset | null;
  token: string | null;
  focalPoint: FocalPoint;
  zoom: number;
  slotIndex: number;
  active: boolean;
  onSelect: () => void;
}) {
  const media = useDecryptedAssetUrl(asset, LIGHTBOX_VARIANTS, token);
  const previewStatus = media.loading
    ? "Decrypting cover preview"
    : media.error
      ? coverPreviewErrorMessage(media.error, "Cover key needed")
      : asset
        ? "Cover preview unavailable"
        : "Choose a photo for this template slot";

  return (
    <div
      role="button"
      tabIndex={0}
      data-cover-slot={slotIndex}
      data-state={active ? "active" : "idle"}
      className="cover-template-slot"
      aria-label={`Cover template photo ${slotIndex + 1}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {media.src ? (
        <img
          src={media.src}
          alt={asset?.filename || `Cover photo ${slotIndex + 1}`}
          className="cover-template-slot__image"
          style={{
            objectPosition: `${focalPoint.x}% ${focalPoint.y}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${focalPoint.x}% ${focalPoint.y}%`,
          }}
          draggable={false}
        />
      ) : (
        <LockedMediaFallback
          asset={asset}
          error={media.loading ? null : media.error}
          message={previewStatus}
          className="cover-template-slot__fallback"
        />
      )}
      <span className="cover-template-slot__badge">Photo {slotIndex + 1}</span>
    </div>
  );
}

// ───────────────────────── Panels ─────────────────────────

function PanelCover({
  assets,
  config,
  setConfig,
  previewDevice,
  setActiveCoverSlot,
}: {
  assets: Asset[];
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  previewDevice: PreviewDevice;
  setActiveCoverSlot: (slotIndex: number) => void;
}) {
  const activeCoverProfile = profileFromConfig(config, previewDevice);
  const activeTemplate = getCoverTemplate(
    activeCoverProfile.styleId || config.cover.styleId,
  );
  const activeLayoutPreset =
    activeCoverProfile.layoutPreset || config.cover.layoutPreset;
  const activeNeutralDesign = COVER_DESIGNS.find(
    (design) => !design.presetId && design.template.id === activeTemplate.id,
  );
  const activeCoverDesign =
    activeNeutralDesign ||
    COVER_DESIGNS.find((design) => design.presetId === activeLayoutPreset) ||
    COVER_DESIGNS.find((design) => design.template.id === activeTemplate.id);
  const activeScrimStyle =
    (activeCoverProfile.scrimStyle as ScrimStyle) || config.cover.scrimStyle;
  const activeTextBackdrop =
    (activeCoverProfile.textBackdrop as TextBackdrop) ||
    config.cover.textBackdrop;
  const activeTitleColor =
    activeCoverProfile.titleColor ||
    config.cover.titleColor ||
    COVER_COLORS.textMedia;
  const activeSubtitleColor =
    activeCoverProfile.subtitleColor ||
    config.cover.subtitleColor ||
    COVER_COLORS.textMedia;
  const activeAccentColor = config.theme.accentColor || COVER_COLORS.textMedia;
  const activeTreatment = COVER_TREATMENTS.find((treatment) =>
    coverTreatmentMatches(activeCoverProfile, config, treatment),
  );

  return (
    <div className="cover-panel-stack">
      <section className="cover-section" aria-labelledby="cover-designs-title">
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-designs-title" className="cover-section-title">
              Cover designs
            </h3>
            <p className="cover-section-copy">
              Choose one cover direction with its layout, tone, and photo slots.
            </p>
          </div>
          <Badge variant="accent" className="uppercase">
            {(activeCoverDesign?.name || activeTemplate.name).toUpperCase()}
          </Badge>
        </div>
        <div
          className="cover-design-grid"
          role="group"
          aria-label="Cover designs"
        >
          {COVER_DESIGNS.map((design) => {
            const active = activeCoverDesign?.id === design.id;
            return (
              <SelectableTile
                key={design.id}
                onClick={() => {
                  setConfig((c) =>
                    applyCoverDesign(c, design, assets, previewDevice),
                  );
                  setActiveCoverSlot(0);
                }}
                selected={active}
                className="cover-design-tile"
                media={<CoverTemplateMiniPreview template={design.template} />}
                title={design.name}
                description={design.mood}
                aria-label={`Use ${design.name} design`}
              />
            );
          })}
        </div>
      </section>

      <section
        className="cover-section cover-treatment-section"
        aria-labelledby="cover-treatment-title"
      >
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-treatment-title" className="cover-section-title">
              Visual treatment
            </h3>
            <p className="cover-section-copy">
              Blend the title, gradient, and tint into the selected photo.
            </p>
          </div>
          <Badge variant="accent" className="uppercase">
            {activeTreatment ? activeTreatment.name : "Custom"}
          </Badge>
        </div>
        <div
          className="cover-treatment-grid"
          role="group"
          aria-label="Cover visual treatments"
        >
          {COVER_TREATMENTS.map((treatment) => {
            const active = activeTreatment?.id === treatment.id;
            return (
              <SelectableTile
                key={treatment.id}
                onClick={() =>
                  setConfig((c) => applyCoverTreatment(c, treatment))
                }
                selected={active}
                className="cover-treatment-tile"
                media={<CoverTreatmentPreview treatment={treatment} />}
                title={treatment.name}
                description={treatment.mood}
                aria-label={`Use ${treatment.name} cover treatment`}
              />
            );
          })}
        </div>
        <div className="cover-treatment-controls">
          <label className="cover-field-stack">
            <span className="form-label">Gradient overlay</span>
            <select
              value={activeScrimStyle}
              onChange={(event) =>
                setConfig((c) =>
                  updateSharedCoverProfiles(c, {
                    scrimStyle: event.target.value as ScrimStyle,
                  }),
                )
              }
              aria-label="Cover gradient treatment"
              className={COVER_FIELD_CLASS}
            >
              {COVER_SCRIM_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Text finish</span>
            <select
              value={activeTextBackdrop}
              onChange={(event) =>
                setConfig((c) =>
                  updateSharedCoverProfiles(c, {
                    textBackdrop: event.target.value as TextBackdrop,
                  }),
                )
              }
              aria-label="Cover text finish"
              className={COVER_FIELD_CLASS}
            >
              {COVER_TEXT_BACKDROP_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Title color</span>
            <input
              type="color"
              value={activeTitleColor}
              onChange={(event) => {
                const color = event.target.value;
                setConfig((c) =>
                  updateSharedCoverProfiles(c, {
                    titleColor: color,
                    textColor: color,
                  }),
                );
              }}
              aria-label="Cover treatment title color"
              className={COVER_COLOR_CLASS}
            />
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Subtitle color</span>
            <input
              type="color"
              value={activeSubtitleColor}
              onChange={(event) => {
                const color = event.target.value;
                setConfig((c) =>
                  updateSharedCoverProfiles(c, {
                    subtitleColor: color,
                  }),
                );
              }}
              aria-label="Cover treatment subtitle color"
              className={COVER_COLOR_CLASS}
            />
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Accent tint</span>
            <input
              type="color"
              value={activeAccentColor}
              onChange={(event) =>
                setConfig((c) => ({
                  ...c,
                  theme: { ...c.theme, accentColor: event.target.value },
                }))
              }
              aria-label="Cover accent tint"
              className={COVER_COLOR_CLASS}
            />
          </label>
          <div className="cover-treatment-shadow">
            <span className="form-label">Emboss shadow</span>
            <ToggleSwitch
              checked={activeCoverProfile.textShadow ?? config.cover.textShadow}
              label="Emboss shadow"
              checkedLabel="On"
              uncheckedLabel="Off"
              onCheckedChange={(checked) =>
                setConfig((c) =>
                  updateSharedCoverProfiles(c, { textShadow: checked }),
                )
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PanelGalleryPhotos({
  assets,
  token,
  config,
  setConfig,
  previewDevice,
  activeCoverSlot,
  setActiveCoverSlot,
  onFilesAccepted,
  uploadItems,
  uploadPaused,
  onCancelUpload,
  onRetryUpload,
}: {
  assets: Asset[];
  token: string | null;
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  previewDevice: PreviewDevice;
  activeCoverSlot: number;
  setActiveCoverSlot: (slotIndex: number) => void;
  onFilesAccepted: (files: File[]) => void;
  uploadItems: ReturnType<typeof useUpload>["items"];
  uploadPaused: boolean;
  onCancelUpload: ReturnType<typeof useUpload>["cancel"];
  onRetryUpload: ReturnType<typeof useUpload>["retry"];
}) {
  const coverPhotoPagingKey = `${assets.length}:${activeCoverSlot}:${previewDevice}`;
  const [coverPhotoPaging, setCoverPhotoPaging] = useState(() => ({
    key: coverPhotoPagingKey,
    limit: COVER_PHOTO_PAGE_SIZE,
  }));
  let coverPhotoLimit = coverPhotoPaging.limit;
  if (coverPhotoPaging.key !== coverPhotoPagingKey) {
    const nextPaging = {
      key: coverPhotoPagingKey,
      limit: COVER_PHOTO_PAGE_SIZE,
    };
    setCoverPhotoPaging(nextPaging);
    coverPhotoLimit = nextPaging.limit;
  }

  const activeCoverProfile = profileFromConfig(config, previewDevice);
  const activeTemplate = getCoverTemplate(
    activeCoverProfile.styleId || config.cover.styleId,
  );
  const activeCoverSlotIndex = Math.min(
    activeCoverSlot,
    activeTemplate.slotCount - 1,
  );
  const activeSlotAssetId = coverAssetIdForSlot(
    config,
    assets,
    activeCoverSlotIndex,
    previewDevice,
  );
  const activeSlotAsset = activeSlotAssetId
    ? (assets.find((asset) => asset.id === activeSlotAssetId) ?? null)
    : null;
  const usedSlotIndexesByAssetId = useMemo(() => {
    const next = new Map<string, number[]>();
    for (const slotIndex of coverTemplateSlotIndices(activeTemplate)) {
      const assetId = coverAssetIdForSlot(
        config,
        assets,
        slotIndex,
        previewDevice,
      );
      if (!assetId) continue;
      const slots = next.get(assetId) ?? [];
      slots.push(slotIndex);
      next.set(assetId, slots);
    }
    return next;
  }, [activeTemplate, assets, config, previewDevice]);
  const activeFocalPoint = coverSlotFocalPoint(
    config,
    activeCoverSlotIndex,
    previewDevice,
  );
  const activeZoom = coverSlotZoom(config, activeCoverSlotIndex, previewDevice);
  const pagedCoverAssets = useMemo(
    () => assets.slice(0, coverPhotoLimit),
    [assets, coverPhotoLimit],
  );
  const hasMoreCoverAssets = assets.length > pagedCoverAssets.length;

  return (
    <div className="cover-panel-stack">
      <section
        className="cover-section cover-slot-controls"
        aria-labelledby="cover-slot-title"
      >
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-slot-title" className="cover-section-title">
              Gallery photos
            </h3>
            <p className="cover-section-copy">
              Pick the active template slot, choose its photo, then pan and zoom
              it in the live preview.
            </p>
          </div>
          <Badge variant="accent" className="uppercase">
            Photo {activeCoverSlotIndex + 1}
          </Badge>
        </div>
        <div
          className="cover-slot-tabs"
          role="group"
          aria-label="Template photo slots"
        >
          {coverTemplateSlotIndices(activeTemplate).map((slotIndex) => {
            const slotAssetId = coverAssetIdForSlot(
              config,
              assets,
              slotIndex,
              previewDevice,
            );
            const slotAsset = slotAssetId
              ? (assets.find((asset) => asset.id === slotAssetId) ?? null)
              : null;
            return (
              <button
                key={slotIndex}
                type="button"
                className="cover-slot-tab"
                data-state={
                  slotIndex === activeCoverSlotIndex ? "active" : "idle"
                }
                aria-pressed={slotIndex === activeCoverSlotIndex}
                title={slotAsset?.filename || `Choose photo ${slotIndex + 1}`}
                onClick={() => setActiveCoverSlot(slotIndex)}
              >
                Photo {slotIndex + 1}
              </button>
            );
          })}
        </div>
        <div className="cover-info-panel">
          {activeSlotAsset
            ? `Photo ${activeCoverSlotIndex + 1}: ${activeSlotAsset.filename}`
            : `Photo ${activeCoverSlotIndex + 1}: no gallery photo selected`}
        </div>
        <div className="cover-slot-focal-grid">
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-slot-pan-x" className="form-label">
                Move left/right
              </label>
              <span className="cover-range-value">{activeFocalPoint.x}%</span>
            </div>
            <input
              id="cover-slot-pan-x"
              type="range"
              min={0}
              max={100}
              step={1}
              value={activeFocalPoint.x}
              onChange={(event) =>
                setConfig((c) =>
                  setCoverSlotFocalPoint(
                    c,
                    activeCoverSlotIndex,
                    previewDevice,
                    {
                      ...activeFocalPoint,
                      x: Number(event.target.value),
                    },
                  ),
                )
              }
              className={COVER_RANGE_CLASS}
            />
          </div>
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-slot-pan-y" className="form-label">
                Move up/down
              </label>
              <span className="cover-range-value">{activeFocalPoint.y}%</span>
            </div>
            <input
              id="cover-slot-pan-y"
              type="range"
              min={0}
              max={100}
              step={1}
              value={activeFocalPoint.y}
              onChange={(event) =>
                setConfig((c) =>
                  setCoverSlotFocalPoint(
                    c,
                    activeCoverSlotIndex,
                    previewDevice,
                    {
                      ...activeFocalPoint,
                      y: Number(event.target.value),
                    },
                  ),
                )
              }
              className={COVER_RANGE_CLASS}
            />
          </div>
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-slot-zoom" className="form-label">
                Photo zoom
              </label>
              <span className="cover-range-value">
                {Math.round(activeZoom * 100)}%
              </span>
            </div>
            <input
              id="cover-slot-zoom"
              type="range"
              min={Math.round(COVER_SLOT_ZOOM_MIN * 100)}
              max={Math.round(COVER_SLOT_ZOOM_MAX * 100)}
              step={5}
              value={Math.round(activeZoom * 100)}
              onChange={(event) =>
                setConfig((c) =>
                  setCoverSlotZoom(
                    c,
                    activeCoverSlotIndex,
                    previewDevice,
                    Number(event.target.value) / 100,
                  ),
                )
              }
              className={COVER_RANGE_CLASS}
            />
          </div>
        </div>
      </section>

      <section
        className="cover-section cover-photo-picker"
        aria-labelledby="cover-photo-title"
      >
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-photo-title" className="cover-section-title">
              Choose from gallery
            </h3>
            <p className="cover-section-copy">
              These photos are paged so large galleries stay responsive.
            </p>
          </div>
          <Badge variant="neutral" className="cover-section-count">
            {assets.length} {assets.length === 1 ? "photo" : "photos"}
          </Badge>
        </div>
        <div className="cover-upload-stack">
          <UploadDropzone
            onFilesAccepted={onFilesAccepted}
            disabled={!token || uploadPaused}
          />
          <UploadProgress
            items={uploadItems}
            onCancel={onCancelUpload}
            onRetry={onRetryUpload}
          />
        </div>
        <div
          className="cover-photo-grid"
          role="group"
          aria-label="Cover photo choices"
        >
          {pagedCoverAssets.map((a, index) => {
            const active =
              coverAssetIdForSlot(
                config,
                assets,
                activeCoverSlotIndex,
                previewDevice,
              ) === a.id;
            const usedSlotIndexes = usedSlotIndexesByAssetId.get(a.id) ?? [];
            const slotBadge =
              usedSlotIndexes.length > 0
                ? usedSlotIndexes
                    .map((slotIndex) => `Photo ${slotIndex + 1}`)
                    .join(", ")
                : "";
            return (
              <SelectableTile
                key={a.id}
                onClick={() =>
                  setConfig((c) =>
                    setCoverSlotAsset(
                      c,
                      activeCoverSlotIndex,
                      a.id,
                      previewDevice,
                    ),
                  )
                }
                selected={active}
                className="cover-photo-tile"
                title={a.filename || `Photo ${index + 1}`}
                description={
                  active
                    ? `Photo ${activeCoverSlotIndex + 1} slot`
                    : slotBadge
                      ? `Used in ${slotBadge}`
                      : `Photo ${index + 1}`
                }
                media={
                  <span className="cover-photo-tile__media-wrap">
                    <DecryptedPreviewImage
                      asset={a}
                      token={token}
                      variants={FILMSTRIP_VARIANTS}
                      alt={a.filename}
                      className="cover-photo-tile__image"
                      fallbackMode="compact"
                    />
                    {slotBadge ? (
                      <span className="cover-photo-tile__slot-badge">
                        {slotBadge}
                      </span>
                    ) : null}
                  </span>
                }
                aria-label={`Use ${a.filename} as template photo ${activeCoverSlotIndex + 1}`}
              />
            );
          })}
        </div>
        {hasMoreCoverAssets && (
          <div className="cover-photo-load-more">
            <GlassButton
              type="button"
              variant="surface"
              size="sm"
              onClick={() =>
                setCoverPhotoPaging((current) => ({
                  ...current,
                  limit: current.limit + COVER_PHOTO_PAGE_SIZE,
                }))
              }
            >
              Load more photos
            </GlassButton>
            <span className="cover-photo-load-more__count">
              Showing {pagedCoverAssets.length} of {assets.length}
            </span>
          </div>
        )}
        {assets.length === 0 && (
          <p className="cover-empty-note">
            No ready photos are linked to this gallery yet. Upload photos here
            or add them from the gallery before choosing Photo{" "}
            {activeCoverSlotIndex + 1} for the cover.
          </p>
        )}
      </section>

      <div className="cover-panel-divider">
        <GlassButton
          type="button"
          variant="surface"
          size="md"
          icon={<RefreshCw aria-hidden />}
          onClick={() =>
            setConfig((c) =>
              updateProfileForDevice(c, previewDevice, {
                focalPoint: { x: 50, y: 50 },
                zoom: 1,
                slotFocalPoints: [],
                slotZooms: [],
              }),
            )
          }
          className="cover-panel-reset-button"
        >
          Reset {previewDevice} crops ({activeFocalPoint.x}%,{" "}
          {activeFocalPoint.y}%, {Math.round(activeZoom * 100)}%)
        </GlassButton>
      </div>
    </div>
  );
}

function DecryptedPreviewImage({
  asset,
  token,
  variants,
  alt,
  className,
  fallbackMode = "default",
}: {
  asset: Asset | null;
  token: string | null;
  variants: readonly string[];
  alt: string;
  className: string;
  fallbackMode?: "default" | "compact";
}) {
  const media = useDecryptedAssetUrl(asset, variants, token);

  if (!asset) return null;
  const previewErrorMessage = coverPreviewErrorMessage(media.error);

  if (media.loading) {
    if (fallbackMode === "compact") {
      return (
        <span
          className="cover-photo-tile__fallback"
          role="status"
          aria-label={`Preparing ${asset.filename}`}
        >
          <Photo className="cover-photo-tile__fallback-icon" aria-hidden />
          <span className="cover-photo-tile__fallback-text">Preparing</span>
        </span>
      );
    }

    return (
      <div
        className="flex h-full w-full animate-pulse items-center justify-center bg-surface-container-high"
        role="status"
        aria-label={`Decrypting ${asset.filename}`}
      />
    );
  }

  if (media.src) {
    return (
      <img
        src={media.src}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    );
  }

  if (fallbackMode === "compact") {
    return (
      <LockedMediaFallback
        asset={asset}
        error={media.error}
        message={previewErrorMessage}
        mode="compact"
        allowRecovery={false}
        className="cover-photo-tile__fallback"
      />
    );
  }

  return (
    <LockedMediaFallback
      asset={asset}
      error={media.error}
      message={previewErrorMessage}
      className="bg-surface-container-high px-2 text-2xs text-on-surface-variant"
    />
  );
}

function PanelText({
  config,
  setConfig,
  albumTitle,
  albumSubtitle,
  previewDevice,
  activeText,
  setActiveText,
  setTab,
}: {
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  albumTitle: string;
  albumSubtitle: string;
  previewDevice: PreviewDevice;
  activeText: "title" | "subtitle";
  setActiveText: (t: "title" | "subtitle") => void;
  setTab: (tab: TabId) => void;
}) {
  // 2026-05-18 (v2): Typography panel absorbed into Text. Each element
  // (Title, Subtitle) is its own card: text input → font dropdown →
  // size slider + color swatch. The shared style block earlier this
  // session held a "Font pairing" select, an Alignment row, and a
  // readability-shadow toggle — pairing is gone (fonts now live in
  // each card), alignment is gone (drag-positioned overlays don't
  // need it), only the shadow toggle remains, inlined at the bottom.
  // Treat the active-text state as a hint to the preview overlay rather
  // than as a panel-mode switch: both inputs are visible at once, focusing
  // an input updates the active-text marker so the preview highlights
  // the corresponding overlay. This collapses the previous chunky Title/
  // Subtitle toggle into a behavioral side-effect of cursor focus, and
  // gives the panel a single-stream column that reads like a Notion-style
  // form rather than a tabbed control.
  const readabilityPoints =
    (config.cover.textShadow ? 1 : 0) +
    (config.cover.scrimStyle !== "none" ? 1 : 0) +
    (config.cover.textBackdrop !== "none" ? 1 : 0) +
    (textSizeForDevice(config, "title", previewDevice) >= 36 ? 1 : 0);
  const readabilityLabel =
    readabilityPoints >= 3
      ? "Strong"
      : readabilityPoints >= 2
        ? "Good"
        : "Needs help";
  const titleLanguage = getCoverLanguage(config.typography.titleLanguage);
  const subtitleLanguage = getCoverLanguage(config.typography.subtitleLanguage);
  const titleFonts = getCoverFontsForLanguage(titleLanguage.id);
  const subtitleFonts = getCoverFontsForLanguage(subtitleLanguage.id);
  const titlePosition = textPositionForDevice(config, "title", previewDevice);
  const subtitlePosition = textPositionForDevice(
    config,
    "subtitle",
    previewDevice,
  );
  const titleSize = textSizeForDevice(config, "title", previewDevice);
  const subtitleSize = textSizeForDevice(config, "subtitle", previewDevice);
  const titleSizeMin =
    previewDevice === "phone" ? MOBILE_TITLE_SIZE_MIN : TITLE_SIZE_MIN;
  const titleSizeMax =
    previewDevice === "phone" ? MOBILE_TITLE_SIZE_MAX : TITLE_SIZE_MAX;
  const subtitleSizeMin =
    previewDevice === "phone" ? MOBILE_SUBTITLE_SIZE_MIN : SUBTITLE_SIZE_MIN;
  const subtitleSizeMax =
    previewDevice === "phone" ? MOBILE_SUBTITLE_SIZE_MAX : SUBTITLE_SIZE_MAX;
  const titleUsesAlbumDefault =
    Boolean(albumTitle) &&
    (config.cover.title.trim() === "" || config.cover.title === albumTitle);
  const subtitleUsesAlbumDefault =
    Boolean(albumSubtitle) &&
    (config.cover.subtitle.trim() === "" ||
      config.cover.subtitle === albumSubtitle);
  const activeDeviceLabel = previewDevice === "phone" ? "Phone" : "Desktop";

  return (
    <div className="space-y-6">
      <section className="cover-control-card">
        <div className="cover-control-card__header">
          <div>
            <h3 className="form-label">Layers</h3>
            <p className="cover-helper-text">
              {activeDeviceLabel} text layout is active.
            </p>
          </div>
        </div>
        <div className="cover-layer-grid">
          <GlassButton
            type="button"
            variant="surface"
            onClick={() => setTab("cover")}
            className="cover-layer-button"
          >
            Cover photos
          </GlassButton>
          <GlassButton
            type="button"
            variant={activeText === "title" ? "primary" : "surface"}
            onClick={() => setActiveText("title")}
            className="cover-layer-button"
          >
            Title
          </GlassButton>
          <GlassButton
            type="button"
            variant={activeText === "subtitle" ? "primary" : "surface"}
            onClick={() => setActiveText("subtitle")}
            className="cover-layer-button"
          >
            Subtitle
          </GlassButton>
        </div>
        <div className="cover-layer-toggle-grid">
          <ToggleSwitch
            checked={config.cover.titleVisible}
            label="Show title layer"
            checkedLabel="Title on"
            uncheckedLabel="Title off"
            onCheckedChange={(checked) =>
              setConfig((c) => ({
                ...c,
                cover: { ...c.cover, titleVisible: checked },
              }))
            }
          />
          <ToggleSwitch
            checked={config.cover.subtitleVisible}
            label="Show subtitle layer"
            checkedLabel="Subtitle on"
            uncheckedLabel="Subtitle off"
            onCheckedChange={(checked) =>
              setConfig((c) => ({
                ...c,
                cover: { ...c.cover, subtitleVisible: checked },
              }))
            }
          />
        </div>
      </section>

      {/* ───────── TITLE GROUP ─────────
          Everything about the title in one block: text input, size
          slider, color. Section heading + position chip up top. Active
          ring on inputs syncs to the preview overlay's selection. */}
      <section
        className="cover-control-card"
        data-state={activeText === "title" ? "active" : "idle"}
      >
        <div className="cover-control-card__header">
          <div className="cover-heading-stack">
            <h3 className="form-label">Title</h3>
            <span className="cover-helper-text">
              {titleUsesAlbumDefault ? "Using album name" : "Custom title"}
            </span>
          </div>
          <div className="cover-header-actions">
            {albumTitle && (
              <GlassButton
                type="button"
                variant="surface"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    cover: { ...c.cover, title: albumTitle },
                  }))
                }
                className="cover-inline-action"
              >
                Use album name
              </GlassButton>
            )}
            <span
              className="cover-position-badge"
              data-state={activeText === "title" ? "active" : "idle"}
              aria-label={`${activeDeviceLabel} title position ${titlePosition.x}% horizontal, ${titlePosition.y}% vertical`}
            >
              {activeDeviceLabel} {titlePosition.x}, {titlePosition.y}
            </span>
          </div>
        </div>

        <label htmlFor="cover-title-input" className="sr-only">
          Cover title text
        </label>
        <textarea
          id="cover-title-input"
          lang={titleLanguage.htmlLang}
          dir={titleLanguage.dir}
          value={config.cover.title}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              cover: { ...c.cover, title: e.target.value },
            }))
          }
          onFocus={() => setActiveText("title")}
          placeholder="Your gallery title"
          className={`${COVER_FIELD_CLASS} cover-textarea`}
          rows={2}
          spellCheck={false}
          autoCapitalize="none"
          inputMode="text"
        />

        <div className="cover-field-grid cover-field-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Horizontal</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={titlePosition.x}
              onChange={(e) =>
                setConfig((c) =>
                  setTextPositionForDevice(c, "title", previewDevice, {
                    x: e.target.value,
                  }),
                )
              }
              onFocus={() => setActiveText("title")}
              className={COVER_FIELD_CLASS}
              aria-label="Title horizontal position"
            />
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Vertical</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={titlePosition.y}
              onChange={(e) =>
                setConfig((c) =>
                  setTextPositionForDevice(c, "title", previewDevice, {
                    y: e.target.value,
                  }),
                )
              }
              onFocus={() => setActiveText("title")}
              className={COVER_FIELD_CLASS}
              aria-label="Title vertical position"
            />
          </label>
        </div>

        <div className="cover-field-grid cover-field-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Language</span>
            <select
              id="cover-title-language"
              value={titleLanguage.id}
              onChange={(e) => {
                const nextLanguage = e.target.value;
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, {
                    titleLanguage: nextLanguage,
                    headingFont: normalizeCoverFontForLanguage(
                      c.typography.headingFont,
                      nextLanguage,
                    ),
                  }),
                );
              }}
              onFocus={() => setActiveText("title")}
              className={`${COVER_FIELD_CLASS} cover-language-select`}
              aria-label="Title language"
            >
              {COVER_TEXT_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label} · {language.nativeLabel}
                </option>
              ))}
            </select>
          </label>

          {/* Per-element font picker — custom popover dropdown so each
              option renders styled in its own font (native <select>
              doesn't honor per-option font-family in Chromium/Webkit).
              See FontPicker for keyboard nav + click-outside behavior. */}
          <div className="cover-field-stack">
            <label htmlFor="cover-title-font" className="form-label">
              Font
            </label>
            <FontPicker
              id="cover-title-font"
              value={config.typography.headingFont}
              languageId={titleLanguage.id}
              options={titleFonts}
              sampleText={titleLanguage.sample}
              onChange={(next) =>
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, { headingFont: next }),
                )
              }
              onOpenChange={(opened) => {
                if (opened) setActiveText("title");
              }}
              ariaLabel="Title font"
            />
          </div>
        </div>

        <div className="cover-field-grid cover-field-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Weight</span>
            <select
              id="cover-title-weight"
              value={config.typography.titleWeight}
              onChange={(e) =>
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, {
                    titleWeight: Number(e.target.value),
                  }),
                )
              }
              onFocus={() => setActiveText("title")}
              className={COVER_FIELD_CLASS}
              aria-label="Title font weight"
            >
              {COVER_FONT_WEIGHTS.map((weight) => (
                <option key={weight.value} value={weight.value}>
                  {weight.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cover-toggle-row cover-text-style-toggle">
            <span className="cover-toggle-row__copy">
              <span className="cover-scene-card__title">Italic</span>
              <span className="cover-helper-text">Slanted title style</span>
            </span>
            <ToggleSwitch
              checked={config.typography.titleItalic}
              label="Italic title"
              checkedLabel="Italic"
              uncheckedLabel="Roman"
              onCheckedChange={(checked) =>
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, { titleItalic: checked }),
                )
              }
            />
          </div>
        </div>

        <div className="cover-range-color-grid">
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-title-size" className="form-label">
                Title font size
              </label>
              <input
                type="number"
                min={titleSizeMin}
                max={titleSizeMax}
                step={1}
                value={titleSize}
                onChange={(e) =>
                  setConfig((c) =>
                    setTextSizeForDevice(
                      c,
                      "title",
                      previewDevice,
                      e.target.value,
                    ),
                  )
                }
                onFocus={() => setActiveText("title")}
                className="input-base cover-size-input"
                aria-label="Title font size value"
              />
            </div>
            <input
              id="cover-title-size"
              type="range"
              min={titleSizeMin}
              max={titleSizeMax}
              step={1}
              value={titleSize}
              onChange={(e) =>
                setConfig((c) =>
                  setTextSizeForDevice(
                    c,
                    "title",
                    previewDevice,
                    e.target.value,
                  ),
                )
              }
              onFocus={() => setActiveText("title")}
              className={COVER_RANGE_CLASS}
            />
          </div>
          <div className="cover-field-stack">
            <label htmlFor="cover-title-color" className="form-label">
              Color
            </label>
            <input
              id="cover-title-color"
              type="color"
              value={config.cover.titleColor || COVER_COLORS.textMedia}
              onChange={(e) =>
                setConfig((c) =>
                  updateSharedCoverProfiles(c, {
                    titleColor: e.target.value,
                    textColor: e.target.value,
                  }),
                )
              }
              onFocus={() => setActiveText("title")}
              className={COVER_COLOR_CLASS}
              aria-label="Title color picker"
            />
          </div>
        </div>
      </section>

      {/* ───────── SUBTITLE GROUP ─────────
          Identical structure to the title group so the panel reads as
          two parallel cards. Slight visual differentiation comes only
          from the active-ring (which the focus on either input drives). */}
      <section
        className="cover-control-card"
        data-state={activeText === "subtitle" ? "active" : "idle"}
      >
        <div className="cover-control-card__header">
          <div className="cover-heading-stack">
            <h3 className="form-label">Subtitle</h3>
            <span className="cover-helper-text">
              {subtitleUsesAlbumDefault
                ? "Using album description"
                : "Custom subtitle"}
            </span>
          </div>
          <div className="cover-header-actions">
            {albumSubtitle && (
              <GlassButton
                type="button"
                variant="surface"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    cover: { ...c.cover, subtitle: albumSubtitle },
                  }))
                }
                className="cover-inline-action"
              >
                Use description
              </GlassButton>
            )}
            <span
              className="cover-position-badge"
              data-state={activeText === "subtitle" ? "active" : "idle"}
              aria-label={`${activeDeviceLabel} subtitle position ${subtitlePosition.x}% horizontal, ${subtitlePosition.y}% vertical`}
            >
              {activeDeviceLabel} {subtitlePosition.x}, {subtitlePosition.y}
            </span>
          </div>
        </div>

        <label htmlFor="cover-subtitle-input" className="sr-only">
          Cover subtitle text
        </label>
        <textarea
          id="cover-subtitle-input"
          lang={subtitleLanguage.htmlLang}
          dir={subtitleLanguage.dir}
          value={config.cover.subtitle}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              cover: { ...c.cover, subtitle: e.target.value },
            }))
          }
          onFocus={() => setActiveText("subtitle")}
          placeholder="Optional subtitle"
          className={`${COVER_FIELD_CLASS} cover-textarea`}
          rows={2}
          spellCheck={false}
          autoCapitalize="none"
          inputMode="text"
        />

        <div className="cover-field-grid cover-field-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Horizontal</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={subtitlePosition.x}
              onChange={(e) =>
                setConfig((c) =>
                  setTextPositionForDevice(c, "subtitle", previewDevice, {
                    x: e.target.value,
                  }),
                )
              }
              onFocus={() => setActiveText("subtitle")}
              className={COVER_FIELD_CLASS}
              aria-label="Subtitle horizontal position"
            />
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Vertical</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={subtitlePosition.y}
              onChange={(e) =>
                setConfig((c) =>
                  setTextPositionForDevice(c, "subtitle", previewDevice, {
                    y: e.target.value,
                  }),
                )
              }
              onFocus={() => setActiveText("subtitle")}
              className={COVER_FIELD_CLASS}
              aria-label="Subtitle vertical position"
            />
          </label>
        </div>

        <div className="cover-field-grid cover-field-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Language</span>
            <select
              id="cover-subtitle-language"
              value={subtitleLanguage.id}
              onChange={(e) => {
                const nextLanguage = e.target.value;
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, {
                    subtitleLanguage: nextLanguage,
                    bodyFont: normalizeCoverFontForLanguage(
                      c.typography.bodyFont,
                      nextLanguage,
                    ),
                  }),
                );
              }}
              onFocus={() => setActiveText("subtitle")}
              className={`${COVER_FIELD_CLASS} cover-language-select`}
              aria-label="Subtitle language"
            >
              {COVER_TEXT_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label} · {language.nativeLabel}
                </option>
              ))}
            </select>
          </label>

          <div className="cover-field-stack">
            <label htmlFor="cover-subtitle-font" className="form-label">
              Font
            </label>
            <FontPicker
              id="cover-subtitle-font"
              value={config.typography.bodyFont}
              languageId={subtitleLanguage.id}
              options={subtitleFonts}
              sampleText={subtitleLanguage.sample}
              onChange={(next) =>
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, { bodyFont: next }),
                )
              }
              onOpenChange={(opened) => {
                if (opened) setActiveText("subtitle");
              }}
              ariaLabel="Subtitle font"
            />
          </div>
        </div>

        <div className="cover-field-grid cover-field-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Weight</span>
            <select
              id="cover-subtitle-weight"
              value={config.typography.subtitleWeight}
              onChange={(e) =>
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, {
                    subtitleWeight: Number(e.target.value),
                  }),
                )
              }
              onFocus={() => setActiveText("subtitle")}
              className={COVER_FIELD_CLASS}
              aria-label="Subtitle font weight"
            >
              {COVER_FONT_WEIGHTS.map((weight) => (
                <option key={weight.value} value={weight.value}>
                  {weight.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cover-toggle-row cover-text-style-toggle">
            <span className="cover-toggle-row__copy">
              <span className="cover-scene-card__title">Italic</span>
              <span className="cover-helper-text">Slanted subtitle style</span>
            </span>
            <ToggleSwitch
              checked={config.typography.subtitleItalic}
              label="Italic subtitle"
              checkedLabel="Italic"
              uncheckedLabel="Roman"
              onCheckedChange={(checked) =>
                setConfig((c) =>
                  updateSharedTypographyProfiles(c, {
                    subtitleItalic: checked,
                  }),
                )
              }
            />
          </div>
        </div>

        <div className="cover-range-color-grid">
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-subtitle-size" className="form-label">
                Subtitle font size
              </label>
              <input
                type="number"
                min={subtitleSizeMin}
                max={subtitleSizeMax}
                step={1}
                value={subtitleSize}
                onChange={(e) =>
                  setConfig((c) =>
                    setTextSizeForDevice(
                      c,
                      "subtitle",
                      previewDevice,
                      e.target.value,
                    ),
                  )
                }
                onFocus={() => setActiveText("subtitle")}
                className="input-base cover-size-input"
                aria-label="Subtitle font size value"
              />
            </div>
            <input
              id="cover-subtitle-size"
              type="range"
              min={subtitleSizeMin}
              max={subtitleSizeMax}
              step={1}
              value={subtitleSize}
              onChange={(e) =>
                setConfig((c) =>
                  setTextSizeForDevice(
                    c,
                    "subtitle",
                    previewDevice,
                    e.target.value,
                  ),
                )
              }
              onFocus={() => setActiveText("subtitle")}
              className={COVER_RANGE_CLASS}
            />
          </div>
          <div className="cover-field-stack">
            <label htmlFor="cover-subtitle-color" className="form-label">
              Color
            </label>
            <input
              id="cover-subtitle-color"
              type="color"
              value={config.cover.subtitleColor || COVER_COLORS.textMedia}
              onChange={(e) =>
                setConfig((c) =>
                  updateSharedCoverProfiles(c, {
                    subtitleColor: e.target.value,
                  }),
                )
              }
              onFocus={() => setActiveText("subtitle")}
              className={COVER_COLOR_CLASS}
              aria-label="Subtitle color picker"
            />
          </div>
        </div>
      </section>

      {/* 2026-05-18: shared Style section collapsed.
          - Font pairing dropdown removed — fonts are now per-element
            inside each card (title.headingFont, subtitle.bodyFont).
          - Alignment row removed — with drag-positioned overlays, single-
            line title/subtitle don't show internal alignment, and the
            override no longer earns its real estate. textAlign stays in
            saved state defaulted to "center" so the public viewer's
            anchor math keeps working.
          - Only the readability-shadow toggle remained shared, so it
            lives inline at the bottom of the panel as a compact row. */}
      <section className="cover-control-card">
        <div className="cover-control-card__header">
          <div>
            <h3 className="form-label">Readability assistant</h3>
            <p className="cover-helper-text">
              Checks the cover text setup and offers safe one-click fixes.
            </p>
          </div>
          <Badge
            variant={
              readabilityPoints >= 3
                ? "success"
                : readabilityPoints >= 2
                  ? "warning"
                  : "danger"
            }
          >
            {readabilityLabel}
          </Badge>
        </div>
        <div className="cover-action-grid">
          <GlassButton
            type="button"
            variant="surface"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                cover: {
                  ...c.cover,
                  scrimStyle: "soft-gradient",
                  textShadow: true,
                },
              }))
            }
            className="cover-action-button"
          >
            Gradient scrim
          </GlassButton>
          <GlassButton
            type="button"
            variant="surface"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                cover: { ...c.cover, textBackdrop: "glass", textShadow: true },
              }))
            }
            className="cover-action-button"
          >
            Glass title plate
          </GlassButton>
          <GlassButton
            type="button"
            variant="surface"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                cover: {
                  ...c.cover,
                  scrimStyle: "blur-band",
                  textShadow: true,
                },
              }))
            }
            className="cover-action-button"
          >
            Blur band
          </GlassButton>
          <GlassButton
            type="button"
            variant="surface"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                cover: {
                  ...c.cover,
                  scrimStyle: "cinematic-dark",
                  textBackdrop: "dark",
                  textShadow: true,
                },
              }))
            }
            className="cover-action-button"
          >
            Darker overlay
          </GlassButton>
        </div>
      </section>

      <div className="cover-panel-divider">
        <ToggleSwitch
          checked={config.cover.textShadow}
          label="Readability shadow"
          checkedLabel="Shadow on"
          uncheckedLabel="Shadow off"
          onCheckedChange={(checked) =>
            setConfig((c) => ({
              ...c,
              cover: { ...c.cover, textShadow: checked },
            }))
          }
        />
      </div>

      <p className="cover-helper-text">
        Drag the title or subtitle on the preview to reposition.
      </p>
    </div>
  );
}

function PanelMedia({
  config,
  setConfig,
  assets,
  previewDevice,
}: {
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  assets: Asset[];
  previewDevice: PreviewDevice;
}) {
  const videoCount = assets.filter((asset) =>
    asset.content_type?.startsWith("video/"),
  ).length;
  const activeMediaMode =
    profileFromConfig(config, previewDevice).mediaMode ||
    config.cover.mediaMode;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Cover media mode</h3>
        <p className="text-xs text-on-surface-variant">
          Choose how the public gallery opens before clients reach the photo
          grid.
        </p>
      </div>
      <div className="cover-option-grid cover-option-grid--2">
        {MEDIA_MODES.map((mode) => {
          const active = activeMediaMode === mode.id;
          const disabled = mode.id === "short-video" && videoCount === 0;
          return (
            <SelectableTile
              key={mode.id}
              onClick={() => {
                setConfig((c) =>
                  updateProfileForDevice(c, previewDevice, {
                    mediaMode: mode.id,
                  }),
                );
              }}
              disabled={disabled}
              selected={active}
              title={mode.label}
              description={
                disabled ? "Upload a video to use this mode" : mode.detail
              }
            />
          );
        })}
      </div>
      <div className="cover-info-panel">
        {activeMediaMode === "single-photo" &&
          "A single cover photo gives the fastest first paint and cleanest hero."}
        {activeMediaMode === "slideshow" &&
          "The public hero will use available gallery thumbnails as a rotating opener."}
        {activeMediaMode === "short-video" &&
          "Short video mode plays the selected video cover when the cover asset is video."}
        {activeMediaMode === "photo-grid" &&
          "Photo grid mode opens with a 2x2 collage using the cover plus the next gallery images."}
      </div>
    </div>
  );
}

function PanelBrand({
  config,
  setConfig,
}: {
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
}) {
  const branding = config.branding;
  const brandColor = branding.brandColor || COVER_COLORS.textMedia;
  const updateBranding = (patch: Partial<DesignConfig["branding"]>) =>
    setConfig((c) => ({
      ...c,
      legacyBranding: true,
      branding: {
        ...DEFAULT_CONFIG.branding,
        ...c.branding,
        ...patch,
      },
    }));

  return (
    <div className="cover-panel-stack">
      <section className="cover-section" aria-labelledby="cover-brand-title">
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-brand-title" className="cover-section-title">
              Cover brand
            </h3>
            <p className="cover-section-copy">
              Use business defaults, or override the logo mark and watermark for
              this gallery cover only.
            </p>
          </div>
          <Badge variant={config.legacyBranding ? "accent" : "neutral"}>
            {config.legacyBranding ? "Cover override" : "Business defaults"}
          </Badge>
        </div>

        <div className="cover-option-grid cover-option-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Monogram</span>
            <input
              type="text"
              value={branding.monogram}
              onChange={(event) =>
                updateBranding({ monogram: event.target.value })
              }
              placeholder="Studio initials"
              className={COVER_FIELD_CLASS}
            />
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Logo placement</span>
            <select
              value={branding.logoPlacement}
              onChange={(event) =>
                updateBranding({
                  logoPlacement: event.target.value as LogoPlacement,
                })
              }
              className={COVER_FIELD_CLASS}
            >
              {LOGO_PLACEMENT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Brand color</span>
            <input
              type="color"
              value={brandColor}
              onChange={(event) =>
                updateBranding({ brandColor: event.target.value })
              }
              aria-label="Cover brand color"
              className={COVER_COLOR_CLASS}
            />
          </label>
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-logo-size" className="form-label">
                Logo size
              </label>
              <span className="cover-range-value">{branding.logoSize}px</span>
            </div>
            <input
              id="cover-logo-size"
              type="range"
              min={LOGO_SIZE_MIN}
              max={LOGO_SIZE_MAX}
              step={1}
              value={branding.logoSize}
              onChange={(event) =>
                updateBranding({ logoSize: Number(event.target.value) })
              }
              className={COVER_RANGE_CLASS}
            />
          </div>
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-logo-opacity" className="form-label">
                Logo opacity
              </label>
              <span className="cover-range-value">{branding.logoOpacity}%</span>
            </div>
            <input
              id="cover-logo-opacity"
              type="range"
              min={10}
              max={100}
              step={5}
              value={branding.logoOpacity}
              onChange={(event) =>
                updateBranding({ logoOpacity: Number(event.target.value) })
              }
              className={COVER_RANGE_CLASS}
            />
          </div>
        </div>
      </section>

      <section
        className="cover-section"
        aria-labelledby="cover-watermark-title"
      >
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-watermark-title" className="cover-section-title">
              Watermark
            </h3>
            <p className="cover-section-copy">
              Add a cover watermark without changing public gallery download
              protection.
            </p>
          </div>
        </div>
        <div className="cover-option-grid cover-option-grid--2">
          <label className="cover-field-stack">
            <span className="form-label">Watermark text</span>
            <input
              type="text"
              value={branding.watermarkText}
              onChange={(event) =>
                updateBranding({ watermarkText: event.target.value })
              }
              placeholder="Studio or photographer name"
              className={COVER_FIELD_CLASS}
            />
          </label>
          <label className="cover-field-stack">
            <span className="form-label">Watermark style</span>
            <select
              value={branding.watermarkStyle}
              onChange={(event) =>
                updateBranding({
                  watermarkStyle: event.target.value as WatermarkStyle,
                })
              }
              className={COVER_FIELD_CLASS}
            >
              {WATERMARK_STYLE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-watermark-opacity" className="form-label">
                Watermark opacity
              </label>
              <span className="cover-range-value">
                {branding.watermarkOpacity}%
              </span>
            </div>
            <input
              id="cover-watermark-opacity"
              type="range"
              min={10}
              max={100}
              step={5}
              value={branding.watermarkOpacity}
              onChange={(event) =>
                updateBranding({
                  watermarkOpacity: Number(event.target.value),
                })
              }
              className={COVER_RANGE_CLASS}
            />
          </div>
        </div>
      </section>

      <div className="cover-panel-divider">
        <ToggleSwitch
          checked={config.legacyBranding}
          label="Cover-specific brand"
          checkedLabel="Override on"
          uncheckedLabel="Using defaults"
          onCheckedChange={(checked) =>
            setConfig((c) => ({
              ...c,
              legacyBranding: checked,
              branding: {
                ...DEFAULT_CONFIG.branding,
                ...c.branding,
              },
            }))
          }
        />
      </div>
    </div>
  );
}

function PanelGrid({
  config,
  setConfig,
  assets,
  token,
}: {
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  assets: Asset[];
  token: string | null;
}) {
  // useDeferredValue lets the slider thumb + value label update in the
  // urgent render lane while the heavy GridLivePreview (12 image tiles
  // + CSS-columns masonry layout) re-renders in a deferred lane. Without
  // this, dragging the Columns/Gap slider felt unresponsive because every
  // tick (~60Hz) was kicking off a full preview re-layout that held up
  // the next pointer event — sliders appeared frozen even though their
  // state was updating. The deferred grid stays one frame behind during
  // rapid drag and snaps to the final value on idle.
  const deferredGrid = useDeferredValue(config.grid);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Grid layout</h3>
        <p className="text-xs text-on-surface-variant">
          How photos arrange in the public gallery.
        </p>
      </div>
      <div className="cover-option-grid cover-option-grid--2">
        {GRID_LAYOUTS.map((g) => (
          <SelectableTile
            key={g.id}
            selected={config.grid.layout === g.id}
            onClick={() =>
              setConfig((c) => ({ ...c, grid: { ...c.grid, layout: g.id } }))
            }
            title={g.label}
            className="cover-compact-tile"
          />
        ))}
      </div>

      <div className="cover-panel-divider cover-field-stack">
        <div className="cover-field-row">
          <label htmlFor="cover-grid-cols" className="form-label">
            Columns
          </label>
          <span className="cover-range-value">{config.grid.columns}</span>
        </div>
        <input
          id="cover-grid-cols"
          type="range"
          min={1}
          max={6}
          step={1}
          value={config.grid.columns}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              grid: { ...c.grid, columns: Number(e.target.value) },
            }))
          }
          className={COVER_RANGE_CLASS}
        />
      </div>

      <div className="cover-panel-divider cover-toggle-row">
        <span className="cover-toggle-row__copy">
          <span className="cover-scene-card__title">Filename captions</span>
          <span className="cover-helper-text">
            Show filename caption under photos
          </span>
        </span>
        <ToggleSwitch
          checked={config.grid.showInfo}
          label="Filename captions"
          checkedLabel="On"
          uncheckedLabel="Off"
          onCheckedChange={(checked) =>
            setConfig((c) => ({
              ...c,
              grid: { ...c.grid, showInfo: checked },
            }))
          }
        />
      </div>

      {/* Live grid preview — renders the user's actual gallery assets in
          the chosen layout so they see exactly how the published page
          will arrange photos. Mirrors the rules in public-gallery-grid:
          grid uses N square cells, justified uses varied-width flex rows.
          (Masonry/carousel branches retained inside GridLivePreview for
          legacy galleries that have those saved.) */}
      <div className="cover-panel-divider cover-field-stack">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Preview</h3>
          <span className="text-2xs text-on-surface-variant/70">
            {config.grid.layout} · {config.grid.columns} col
          </span>
        </div>
        <GridLivePreview grid={deferredGrid} assets={assets} token={token} />
      </div>
    </div>
  );
}

function GridLivePreview({
  grid,
  assets,
  token,
}: {
  grid: DesignConfig["grid"];
  assets: Asset[];
  token: string | null;
}) {
  // Cap the preview at 12 tiles so it stays compact even for big galleries.
  // Empty-state handled below — if the gallery has no assets yet, show a
  // placeholder grid using surface tiles so users can still preview the
  // layout choice before uploading.
  const sample = assets.slice(0, 12);
  const empty = sample.length === 0;
  const placeholderCount = empty ? Math.max(6, grid.columns * 2) : 0;
  const gap = grid.gap;
  const cols = grid.columns;

  if (grid.layout === "carousel") {
    return (
      <div className="cover-grid-preview-surface cover-grid-preview-surface--scroll">
        <div className="cover-grid-preview-carousel" style={{ gap }}>
          {(empty ? Array.from({ length: placeholderCount }) : sample).map(
            (a, i) => {
              const asset = empty ? null : (a as Asset);
              return (
                <div
                  key={i}
                  className="cover-grid-preview-tile cover-grid-preview-tile--carousel"
                >
                  <DecryptedPreviewImage
                    asset={asset}
                    token={token}
                    variants={GRID_VARIANTS}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              );
            },
          )}
        </div>
      </div>
    );
  }

  if (grid.layout === "masonry") {
    // CSS columns + break-inside-avoid is the same technique
    // public-gallery-grid uses for masonry. Heights vary so the asymmetry
    // is visible at preview scale.
    const tokenHeights = [
      "calc(var(--space-16) + var(--space-1))",
      "var(--space-20)",
      "calc(var(--space-16) + var(--space-4))",
      "calc(var(--space-20) + var(--space-5))",
      "calc(var(--space-20) + var(--space-2))",
      "calc(var(--space-20) + var(--space-4))",
      "calc(var(--space-16) + var(--space-3))",
      "calc(var(--space-20) + var(--space-1))",
      "calc(var(--space-20) + var(--space-3))",
      "calc(var(--space-20) + var(--space-1))",
      "calc(var(--space-20) + var(--space-4))",
      "calc(var(--space-20) + var(--space-2))",
    ];
    return (
      <div
        className="cover-grid-preview-surface"
        style={{ columnCount: cols, columnGap: gap }}
      >
        {(empty ? Array.from({ length: placeholderCount }) : sample).map(
          (a, i) => {
            const asset = empty ? null : (a as Asset);
            const h = tokenHeights[i % tokenHeights.length];
            return (
              <div
                key={i}
                className="cover-grid-preview-tile"
                style={{
                  ["--gap" as never]: `${gap}px`,
                  marginBottom: gap,
                  height: h,
                  breakInside: "avoid",
                }}
              >
                <DecryptedPreviewImage
                  asset={asset}
                  token={token}
                  variants={GRID_VARIANTS}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            );
          },
        )}
      </div>
    );
  }

  if (grid.layout === "justified") {
    // Justified: flex rows with varying-width tiles, all the same height.
    // public-gallery-grid uses flex-row + flex-grow tiles.
    const widthWeights = [1.5, 1, 2, 1, 1.7, 1.2, 1, 1.8, 1.3, 1.4, 1, 1.6];
    return (
      <div
        className="cover-grid-preview-surface"
        style={{ display: "flex", flexWrap: "wrap", gap }}
      >
        {(empty ? Array.from({ length: placeholderCount }) : sample).map(
          (a, i) => {
            const asset = empty ? null : (a as Asset);
            const w = widthWeights[i % widthWeights.length];
            return (
              <div
                key={i}
                className="cover-grid-preview-tile"
                style={{ flex: `${w} 1 0`, height: "var(--space-20)" }}
              >
                <DecryptedPreviewImage
                  asset={asset}
                  token={token}
                  variants={GRID_VARIANTS}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            );
          },
        )}
      </div>
    );
  }

  // grid (default) — uniform square cells in N columns.
  return (
    <div
      className="cover-grid-preview-surface"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
      }}
    >
      {(empty ? Array.from({ length: placeholderCount }) : sample).map(
        (a, i) => {
          const asset = empty ? null : (a as Asset);
          return (
            <div key={i} className="cover-grid-preview-tile aspect-square">
              <DecryptedPreviewImage
                asset={asset}
                token={token}
                variants={GRID_VARIANTS}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          );
        },
      )}
    </div>
  );
}

// PanelTheme was removed 2026-05-18 — the theme tab (theme preset picker
// + scrim variant + accent color override) was confusing users because
// the accent color silently flowed into the cover hero's title color,
// duplicating the Text-tab color picker. Title/subtitle colors are now
// owned exclusively by PanelText (titleColor + subtitleColor). config.theme
// stays in state for backward-compat with legacy saved designs, but no
// UI surface edits it from this page.

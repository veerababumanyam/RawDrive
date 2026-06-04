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
 *   1. Pick the cover asset and pan it (focal point) on a live preview.
 *   2. Author title + subtitle text and drag them anywhere on the cover.
 *   3. Choose typography pairing and tune title/subtitle sizes.
 *   4. Choose grid layout, column count, gap, and per-photo info.
 *   5. Choose theme variant + accent color and per-cover overrides
 *      (text color, text shadow, aspect ratio).
 *
 * UX shape:
 *   - Mobile-first. Live preview at top, tab bar at bottom.
 *   - 5 tabs: Cover / Text / Typography / Grid / Theme.
 *   - All interactions land on the same preview — no separate "preview"
 *     screen, no preview-device toggle, no undo history (lighter than
 *     the design studio, deliberately).
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
import Link from "next/link";
import { useParams } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getGallery,
  listGalleryAssets,
  updateGalleryDesign,
  type Gallery,
} from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import {
  FILMSTRIP_VARIANTS,
  GRID_VARIANTS,
  LIGHTBOX_VARIANTS,
} from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { GalleryPageShell } from "@/components/gallery/gallery-page-shell";
import { GalleryPageHeader } from "@/components/gallery/gallery-page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";
import { SelectableTile } from "@/components/ui/selectable-tile";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Check, Key, Loader2, Photo, RefreshCw } from "@/components/icons";
import { components as designComponents } from "@/lib/tokens";

// ──────────────────────────── Data ────────────────────────────

type ThemeVariant = "light" | "dark" | "auto";
type GridLayout = "masonry" | "grid" | "justified" | "carousel";
type TextAlign = "left" | "center" | "right";
type TabId = "cover" | "text" | "media" | "scenes" | "brand" | "grid";
type PreviewDevice = "desktop" | "phone";
type CoverPresetId =
  | "classic-wedding"
  | "editorial-split"
  | "luxury-dark"
  | "haldi-warm"
  | "reception-glow"
  | "minimal-studio"
  | "story-cover"
  | "proofing-first";
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
    styleId: string;
    layoutPreset: CoverPresetId;
    mediaMode: CoverMediaMode;
    focalPoint: FocalPoint;
    mobileFocalPoint: FocalPoint;
    mobileAspectRatio: string;
    title: string;
    subtitle: string;
    titlePosition: TextPos;
    subtitlePosition: TextPos;
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
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    titleSize: number;
    subtitleSize: number;
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
    applyToAll: boolean;
  };
  version: number;
}

// Flat, deduped font catalog. Used by the per-element font selectors
// inside PanelText so title and subtitle each pick independently — the
// older "Font pairing" concept was removed 2026-05-18. Order groups
// serif headlines first, sans-serif next, mono last so the dropdown
// reads top-down by visual weight.
const FONT_OPTIONS: {
  name: string;
  classification: "serif" | "sans" | "mono";
}[] = [
  { name: "Playfair Display", classification: "serif" },
  { name: "Cormorant Garamond", classification: "serif" },
  { name: "Lora", classification: "serif" },
  { name: "Manrope", classification: "sans" },
  { name: "Montserrat", classification: "sans" },
  { name: "DM Sans", classification: "sans" },
  { name: "Inter", classification: "sans" },
  { name: "Lato", classification: "sans" },
  { name: "Open Sans", classification: "sans" },
  { name: "Source Sans Pro", classification: "sans" },
  { name: "DM Mono", classification: "mono" },
];

// Build the font-family CSS string for an option, using a sensible
// fallback class based on the font's classification. Serif heads
// fall back to Georgia, sans bodies to system-ui, mono to ui-monospace.
function fontFamilyFor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const def = FONT_OPTIONS.find((f) => f.name === name);
  const fallback =
    def?.classification === "serif"
      ? "Georgia, serif"
      : def?.classification === "mono"
        ? "ui-monospace, Menlo, monospace"
        : "Inter, system-ui, sans-serif";
  return `'${name}', ${fallback}`;
}

const TITLE_SIZE_MIN = 16;
const TITLE_SIZE_MAX = 96;
const SUBTITLE_SIZE_MIN = 10;
const SUBTITLE_SIZE_MAX = 40;

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
const COVER_COLORS = designComponents.mediaCover.presetColors;
const COVER_FIELD_CLASS = "input-base w-full text-sm";
const COVER_RANGE_CLASS = "cover-range-input";
const COVER_COLOR_CLASS = "cover-color-input";

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

const DEFAULT_SCENE_HEADERS: SceneHeaderConfig[] = [
  { id: "haldi", label: "Haldi", enabled: false, assetId: null },
  { id: "mehendi", label: "Mehendi", enabled: false, assetId: null },
  { id: "wedding", label: "Wedding", enabled: false, assetId: null },
  { id: "reception", label: "Reception", enabled: false, assetId: null },
  { id: "family", label: "Family", enabled: false, assetId: null },
  {
    id: "couple-portraits",
    label: "Couple Portraits",
    enabled: false,
    assetId: null,
  },
];

const LOGO_PLACEMENTS: Array<{ id: LogoPlacement; label: string }> = [
  { id: "hidden", label: "Hidden" },
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
];

const WATERMARK_STYLES: Array<{ id: WatermarkStyle; label: string }> = [
  { id: "none", label: "None" },
  { id: "subtle-corner", label: "Subtle Corner" },
  { id: "center-mark", label: "Center Mark" },
  { id: "tiled", label: "Tiled" },
];

const DEFAULT_CONFIG: DesignConfig = {
  theme: { id: "liquid-glass", variant: "dark", accentColor: "" },
  cover: {
    assetId: null,
    styleId: "classic-full",
    layoutPreset: "classic-wedding",
    mediaMode: "single-photo",
    focalPoint: { x: 50, y: 50 },
    mobileFocalPoint: { x: 50, y: 50 },
    mobileAspectRatio: "4/5",
    title: "",
    subtitle: "",
    titlePosition: { x: 50, y: 70 },
    subtitlePosition: { x: 50, y: 82 },
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
    titleSize: 48,
    subtitleSize: 18,
  },
  grid: { layout: "grid", columns: 3, gap: DEFAULT_GRID_GAP, showInfo: false },
  sceneHeaders: DEFAULT_SCENE_HEADERS,
  branding: {
    logoPlacement: "top-left",
    monogram: "",
    brandColor: "",
    watermarkStyle: "none",
    applyToAll: false,
  },
  version: 3,
};

// ───────────── Helpers ─────────────

// Pull a partial design_config out of `gallery.settings` and merge into our
// strict DesignConfig shape. Anything missing keeps its default so users
// who never opened the page get sensible starting state.
function configFromGallery(gallery: Gallery): DesignConfig {
  const settings = (gallery.settings ?? {}) as Record<string, unknown>;
  const raw = settings["design_config"] as Record<string, unknown> | undefined;
  const legacyCoverStyle = settings["cover_style"] as
    | { focal_point?: FocalPoint; aspect_ratio?: string }
    | undefined;

  const merged: DesignConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

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
    const sceneHeaders = raw.sceneHeaders as SceneHeaderConfig[] | undefined;
    if (Array.isArray(sceneHeaders)) {
      const byId = new Map(
        DEFAULT_SCENE_HEADERS.map((scene) => [scene.id, { ...scene }]),
      );
      for (const scene of sceneHeaders) {
        if (!scene || typeof scene !== "object") continue;
        const fallback = byId.get(scene.id);
        if (!fallback) continue;
        byId.set(scene.id, { ...fallback, ...scene });
      }
      merged.sceneHeaders = Array.from(byId.values());
    }
    const branding = raw.branding as
      | Partial<DesignConfig["branding"]>
      | undefined;
    if (branding) Object.assign(merged.branding, branding);
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

  return merged;
}

function applyCoverPreset(
  config: DesignConfig,
  presetId: CoverPresetId,
): DesignConfig {
  const preset = COVER_PRESETS.find((p) => p.id === presetId);
  if (!preset) return config;
  return {
    ...config,
    theme: { ...config.theme, ...(preset.patch.theme || {}) },
    cover: {
      ...config.cover,
      ...preset.patch.cover,
      layoutPreset: preset.id,
    },
    typography: { ...config.typography, ...preset.patch.typography },
    grid: { ...config.grid, ...(preset.patch.grid || {}) },
  };
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

function buildGoogleFontsHref(heading: string, body: string): string {
  const families = heading === body ? [heading] : [heading, body];
  const param = families
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${param}&display=swap`;
}

const loadedFontHrefs = new Set<string>();
function ensureFontsLoaded(href: string) {
  if (typeof document === "undefined" || loadedFontHrefs.has(href)) return;
  loadedFontHrefs.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
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
  const [tab, setTab] = useState<TabId>("cover");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [activeText, setActiveText] = useState<"title" | "subtitle">("title");
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

  // Mount: fetch gallery + assets, hydrate config from gallery.settings.
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [g, galleryAssets] = await Promise.all([
          getGallery(token, galleryId),
          // PERF-23: ask the server to embed each asset in one bulk query so we
          // skip the per-asset getAsset() fan-out (the gallery detail page does
          // the same). The loop below remains the fallback for an older server
          // or a degraded include response.
          listGalleryAssets(token, galleryId, { includeAssets: true }),
        ]);
        if (cancelled) return;
        setGallery(g);

        const hydrated = galleryAssets.every(
          (entry) => entry.asset !== undefined,
        )
          ? galleryAssets.map((entry) => entry.asset ?? null)
          : await Promise.all(
              galleryAssets.map(async (entry) => {
                try {
                  return await getAsset(token, entry.asset_id);
                } catch {
                  return null;
                }
              }),
            );
        if (cancelled) return;
        const realAssets = hydrated.filter((a): a is Asset => a !== null);
        setAssets(realAssets);

        const initial = configFromGallery(g);
        const persistedSnapshot = JSON.stringify(initial);
        if (!initial.cover.assetId) {
          initial.cover.assetId = realAssets[0]?.id || null;
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

  // Lazy-load the active font pairing so the live preview matches what
  // the public viewer will render. Same Google Fonts URL the public
  // hero injects via <link>.
  useEffect(() => {
    if (!loaded) return;
    const href = buildGoogleFontsHref(
      config.typography.headingFont,
      config.typography.bodyFont,
    );
    ensureFontsLoaded(href);
  }, [loaded, config.typography.headingFont, config.typography.bodyFont]);

  // Preload the full FONT_OPTIONS catalog once so the custom font-picker
  // dropdown can show each option styled in its own font. Without this,
  // the dropdown list would fall back to the browser default font for
  // every option until the user picks one. One Google Fonts <link> is
  // cheaper than 11 individual ones — request all families up front.
  useEffect(() => {
    if (!loaded) return;
    const allFamilies = FONT_OPTIONS.map((f) => f.name);
    const param = allFamilies
      .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
      .join("&");
    ensureFontsLoaded(
      `https://fonts.googleapis.com/css2?${param}&display=swap`,
    );
  }, [loaded]);

  const token = useMemo(() => getStoredAccessToken(), []);
  const selectedAsset = assets.find((a) => a.id === config.cover.assetId);
  const coverMedia = useDecryptedAssetUrl(
    selectedAsset,
    LIGHTBOX_VARIANTS,
    token,
  );
  const hasCoverPreview = Boolean(coverMedia.src);
  const coverPreviewStatus = coverMedia.loading
    ? "Decrypting cover preview"
    : coverMedia.error
      ? "Cover key needed"
      : "Cover preview unavailable";

  // ───────────── Drag handlers ─────────────

  const onStagePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!stageRef.current) return;
      // What's being dragged is decided by data-handle on the target.
      const target = e.target as HTMLElement;
      const handle = target.closest<HTMLElement>("[data-handle]");
      const kind = (handle?.dataset.handle as DragKind) || "focal";
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
          return {
            ...c,
            cover: {
              ...c.cover,
              [previewDevice === "phone" ? "mobileFocalPoint" : "focalPoint"]: {
                x: Math.round(x),
                y: Math.round(y),
              },
            },
          };
        }
        if (kind === "title") {
          return {
            ...c,
            cover: {
              ...c.cover,
              titlePosition: { x: Math.round(x), y: Math.round(y) },
            },
          };
        }
        if (kind === "subtitle") {
          return {
            ...c,
            cover: {
              ...c.cover,
              subtitlePosition: { x: Math.round(x), y: Math.round(y) },
            },
          };
        }
        return c;
      });
    },
    [previewDevice],
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
      await updateGalleryDesign(
        token,
        galleryId,
        config as unknown as Record<string, unknown>,
      );
      // Capture the snapshot of what we just sent so the dirty-dot logic
      // recognises this state as "clean". Use JSON.stringify of the same
      // serialisation we sent over the wire so the comparison is exact.
      setSavedSnapshot(JSON.stringify(config));
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
    savedSnapshot !== "" && savedSnapshot !== JSON.stringify(config);

  // ───────────── Derived preview state ─────────────

  const activeScrim = coverScrimStyle(
    config.cover.scrimStyle,
    config.theme.variant,
  );
  const activeFocalPoint =
    previewDevice === "phone"
      ? config.cover.mobileFocalPoint
      : config.cover.focalPoint;
  // Drag anchor is always the CENTER of the text bounding box, regardless
  // of textAlign. Earlier behavior used textAlign to pick the anchor edge
  // (left = left edge, right = right edge), which made dragging feel
  // disconnected — the user's pointer grabbed the text but a different
  // edge tracked their finger. Center anchoring matches how Canva / Figma
  // / Keynote handle freely-positioned text: the object is grabbed at its
  // visual middle. textAlign still controls multi-line alignment inside
  // the box; it just no longer affects WHERE the box sits relative to the
  // saved position.
  const textShadowStyle = config.cover.textShadow
    ? "var(--cover-text-shadow)"
    : undefined;
  const activeTextBackdropStyle = textBackdropStyle(config.cover.textBackdrop);

  // ───────────── Render ─────────────

  return (
    <GalleryPageShell galleryId={galleryId} className="text-on-surface">
      <GalleryPageHeader
        backHref={`/galleries/${galleryId}`}
        eyebrow="Cover & Design"
        title="Cover & Design"
        subtitle={gallery?.title || "Loading…"}
        actions={
          <>
            {/* Section selector — replaces the horizontal tab strip that
              used to sit under the preview. A dropdown is denser (one
              element instead of five) and pairs naturally with the
              Preview/Save buttons. Native <select> for predictable
              keyboard nav + iOS picker UX; styled to match the dark
              theme rather than rebuilt as a custom popover. */}
            <label htmlFor="cover-tab-select" className="sr-only">
              Editor section
            </label>
            <select
              id="cover-tab-select"
              value={tab}
              onChange={(e) => setTab(e.target.value as TabId)}
              className="input-base cover-header-select"
            >
              <option value="cover">Cover</option>
              <option value="text">Text</option>
              <option value="media">Media</option>
              <option value="scenes">Scenes</option>
              <option value="brand">Brand</option>
              <option value="grid">Grid</option>
            </select>
            {gallery?.slug && (
              <Link
                href={`/galleries/${galleryId}/preview`}
                className="glass-button glass-button--surface glass-button--md cover-header-action"
              >
                Preview
              </Link>
            )}
            {/* Save button — three visual states that give the user
              concrete feedback at every step of the save cycle:
                1. Idle (clean)   — neutral primary gradient, "Save"
                2. Idle (dirty)   — same gradient + a small amber dot in
                                    the upper-right corner of the button
                                    marking "unsaved changes"
                3. Saving         — spinner + "Saving…" + disabled
                4. Just saved     — green tint + check icon + "Saved" for
                                    1800ms before falling back to idle
              The previous version only swapped text from "Save" → "Saving…"
              for one render tick — users genuinely couldn't tell whether
              the click registered. */}
            <GlassButton
              type="button"
              onClick={handleSave}
              disabled={saving || !config.cover.assetId}
              aria-live="polite"
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
              {/* Unsaved-changes dot in the button corner. Only visible in
                the idle-dirty state — not during save or right after. */}
              {isDirty && !saving && !justSaved && (
                <span className="cover-save-button__dirty" aria-hidden />
              )}
            </GlassButton>
          </>
        }
      />

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

      {/* Single-column layout — preview spans the full content width up to
          a comfortable reading max, then the editor sits directly below.
          No side panel, no sticky pane: the cover image is the page's
          subject and gets the entire content rectangle. mx-auto + max-w
          keeps the cover from stretching absurdly wide on 4K monitors
          where a 16:9 frame would become a runway. */}
      <div className="flex w-full flex-col gap-5 sm:gap-7 lg:gap-8">
        {/* ───────── LIVE PREVIEW ───────── */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
            <p className="text-xs text-on-surface-variant">
              {previewDevice === "phone"
                ? "Phone crop uses its own focal point and safe zone."
                : "Desktop crop follows the full gallery cover."}
            </p>
          </div>
          <div
            ref={stageRef}
            onPointerDown={hasCoverPreview ? onStagePointerDown : undefined}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            className={`cover-editor-stage relative w-full select-none overflow-hidden ${
              hasCoverPreview
                ? dragKind
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-default"
            } ${previewDevice === "phone" ? "mx-auto max-w-sm" : ""}`}
            style={{
              aspectRatio:
                previewDevice === "phone"
                  ? config.cover.mobileAspectRatio
                  : config.cover.aspectRatio,
              maxHeight:
                previewDevice === "phone"
                  ? "min(78vh, 760px)"
                  : "min(78vh, 820px)",
              touchAction: "none",
            }}
            aria-label="Cover preview — drag photo to pan, drag title/subtitle to position"
          >
            {coverMedia.src ? (
              <img
                src={coverMedia.src}
                alt={selectedAsset?.filename || "Cover preview"}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  objectPosition: `${activeFocalPoint.x}% ${activeFocalPoint.y}%`,
                }}
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-container to-surface-container-high">
                {selectedAsset && (
                  <span
                    className="cover-preview-status"
                    aria-label={`${selectedAsset.filename}: ${coverMedia.error || coverPreviewStatus}`}
                    title={coverMedia.error || coverPreviewStatus}
                  >
                    {coverMedia.loading ? (
                      <Photo
                        className="cover-preview-status__icon"
                        aria-hidden
                      />
                    ) : (
                      <Key className="cover-preview-status__icon" aria-hidden />
                    )}
                    <span>{coverPreviewStatus}</span>
                  </span>
                )}
              </div>
            )}

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
            {config.cover.title && (
              <h2
                data-handle="title"
                className={`absolute touch-none font-semibold tracking-tight transition-shadow ${
                  activeText === "title" && tab === "text"
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-scrim-strong/30"
                    : ""
                }`}
                style={{
                  left: `${config.cover.titlePosition.x}%`,
                  top: `${config.cover.titlePosition.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: `'${config.typography.headingFont}', serif`,
                  fontSize: `${config.typography.titleSize}px`,
                  color: config.cover.titleColor || config.cover.textColor,
                  textShadow: textShadowStyle,
                  textAlign: config.cover.textAlign,
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
                {config.cover.title}
              </h2>
            )}

            {/* Subtitle overlay — draggable. Same wrap rules as title. */}
            {config.cover.subtitle && (
              <p
                data-handle="subtitle"
                className={`absolute touch-none transition-shadow ${
                  activeText === "subtitle" && tab === "text"
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-scrim-strong/30"
                    : ""
                }`}
                style={{
                  left: `${config.cover.subtitlePosition.x}%`,
                  top: `${config.cover.subtitlePosition.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: `'${config.typography.bodyFont}', sans-serif`,
                  fontSize: `${config.typography.subtitleSize}px`,
                  color: config.cover.subtitleColor || config.cover.textColor,
                  textShadow: textShadowStyle,
                  textAlign: config.cover.textAlign,
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
                {config.cover.subtitle}
              </p>
            )}

            {/* Drag-hint pill */}
            {hasCoverPreview && !dragKind && (
              <div className="cover-preview-drag-hint pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
                {tab === "text"
                  ? "Drag title / subtitle to position"
                  : "Drag photo to pan"}
              </div>
            )}

            {config.branding.logoPlacement !== "hidden" &&
              config.branding.monogram && (
                <div
                  className={`cover-brand-mark pointer-events-none absolute z-20 inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                    config.branding.logoPlacement === "top-right"
                      ? "right-4 top-4"
                      : config.branding.logoPlacement === "bottom-left"
                        ? "bottom-4 left-4"
                        : config.branding.logoPlacement === "bottom-right"
                          ? "bottom-4 right-4"
                          : "left-4 top-4"
                  }`}
                  style={{
                    color: config.branding.brandColor || undefined,
                    borderColor: config.branding.brandColor || undefined,
                  }}
                >
                  {config.branding.monogram}
                </div>
              )}
          </div>
        </section>

        {/* ───────── EDITOR PANEL ───────── */}
        <section>
          {/* Section picker moved into the page header as a dropdown
              next to Preview/Save. The panel body renders the active
              section's controls without a tab bar above it. */}
          <Card variant="panel" padding="md">
            {tab === "cover" && (
              <PanelCover
                assets={assets}
                token={token}
                config={config}
                setConfig={setConfig}
              />
            )}
            {tab === "text" && (
              <PanelText
                config={config}
                setConfig={setConfig}
                activeText={activeText}
                setActiveText={setActiveText}
              />
            )}
            {tab === "grid" && (
              <PanelGrid
                config={config}
                setConfig={setConfig}
                assets={assets}
                token={token}
              />
            )}
            {tab === "media" && (
              <PanelMedia
                config={config}
                setConfig={setConfig}
                assets={assets}
              />
            )}
            {tab === "scenes" && (
              <PanelScenes
                config={config}
                setConfig={setConfig}
                assets={assets}
              />
            )}
            {tab === "brand" && (
              <PanelBrand config={config} setConfig={setConfig} />
            )}
          </Card>
        </section>
      </div>
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
  onChange,
  onOpenChange,
  ariaLabel,
}: {
  id: string;
  value: string;
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
    selected?.scrollIntoView({ block: "nearest" });
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
          style={{ fontFamily: fontFamilyFor(value) }}
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
          {FONT_OPTIONS.map((f) => {
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
                style={{ fontFamily: fontFamilyFor(f.name) }}
              >
                <span className="cover-font-option__name">{f.name}</span>
                <span
                  className="cover-font-option__sample"
                  style={{ fontFamily: fontFamilyFor(f.name) }}
                  aria-hidden
                >
                  Aa
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Panels ─────────────────────────

function PanelCover({
  assets,
  token,
  config,
  setConfig,
}: {
  assets: Asset[];
  token: string | null;
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
}) {
  return (
    <div className="cover-panel-stack">
      <section className="cover-section" aria-labelledby="cover-presets-title">
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-presets-title" className="cover-section-title">
              Design presets
            </h3>
            <p className="cover-section-copy">
              One-tap cover direction for wedding galleries.
            </p>
          </div>
          <Badge variant="accent" className="uppercase">
            {config.cover.layoutPreset.replace(/-/g, " ")}
          </Badge>
        </div>
        <div
          className="cover-preset-grid"
          role="group"
          aria-label="Cover design presets"
        >
          {COVER_PRESETS.map((preset) => {
            const active = config.cover.layoutPreset === preset.id;
            return (
              <SelectableTile
                key={preset.id}
                onClick={() => setConfig((c) => applyCoverPreset(c, preset.id))}
                selected={active}
                title={preset.name}
                description={preset.mood}
              />
            );
          })}
        </div>
      </section>

      <section
        className="cover-section cover-photo-picker"
        aria-labelledby="cover-photo-title"
      >
        <div className="cover-section-header">
          <div className="cover-section-heading">
            <h3 id="cover-photo-title" className="cover-section-title">
              Cover photo
            </h3>
          </div>
          <Badge variant="neutral" className="cover-section-count">
            {assets.length} {assets.length === 1 ? "photo" : "photos"}
          </Badge>
        </div>
        <div
          className="cover-photo-grid"
          role="group"
          aria-label="Cover photo choices"
        >
          {assets.map((a, index) => {
            const active = config.cover.assetId === a.id;
            return (
              <SelectableTile
                key={a.id}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    cover: { ...c.cover, assetId: a.id },
                  }))
                }
                selected={active}
                className="cover-photo-tile"
                title={a.filename || `Photo ${index + 1}`}
                description={active ? "Current cover" : `Photo ${index + 1}`}
                media={
                  <DecryptedPreviewImage
                    asset={a}
                    token={token}
                    variants={FILMSTRIP_VARIANTS}
                    alt={a.filename}
                    className="cover-photo-tile__image"
                    fallbackMode="compact"
                  />
                }
                aria-label={`Use ${a.filename} as cover`}
              />
            );
          })}
        </div>
        {assets.length === 0 && (
          <p className="cover-empty-note">
            Upload photos to the gallery to choose a cover.
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
            setConfig((c) => ({
              ...c,
              cover: {
                ...c.cover,
                focalPoint: { x: 50, y: 50 },
                mobileFocalPoint: { x: 50, y: 50 },
              },
            }))
          }
          className="cover-panel-reset-button"
        >
          Reset focal points ({config.cover.focalPoint.x}%,{" "}
          {config.cover.focalPoint.y}% / phone {config.cover.mobileFocalPoint.x}
          %, {config.cover.mobileFocalPoint.y}%)
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
      <span
        className="cover-photo-tile__fallback"
        aria-label={`${asset.filename}: ${media.error || "Preview unavailable"}`}
        title={media.error || "Preview unavailable"}
      >
        <Key className="cover-photo-tile__fallback-icon" aria-hidden />
        <span className="cover-photo-tile__fallback-text">Key needed</span>
      </span>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-container-high px-2 text-center text-2xs text-on-surface-variant">
      {media.error || "Preview unavailable"}
    </div>
  );
}

function PanelText({
  config,
  setConfig,
  activeText,
  setActiveText,
}: {
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  activeText: "title" | "subtitle";
  setActiveText: (t: "title" | "subtitle") => void;
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
    (config.typography.titleSize >= 36 ? 1 : 0);
  const readabilityLabel =
    readabilityPoints >= 3
      ? "Strong"
      : readabilityPoints >= 2
        ? "Good"
        : "Needs help";

  return (
    <div className="space-y-6">
      {/* ───────── TITLE GROUP ─────────
          Everything about the title in one block: text input, size
          slider, color. Section heading + position chip up top. Active
          ring on inputs syncs to the preview overlay's selection. */}
      <section
        className="cover-control-card"
        data-state={activeText === "title" ? "active" : "idle"}
      >
        <div className="cover-control-card__header">
          <h3 className="form-label">Title</h3>
          <span
            className="cover-position-badge"
            data-state={activeText === "title" ? "active" : "idle"}
            aria-label={`Title position ${config.cover.titlePosition.x}% horizontal, ${config.cover.titlePosition.y}% vertical`}
          >
            {config.cover.titlePosition.x}, {config.cover.titlePosition.y}
          </span>
        </div>

        <input
          id="cover-title-input"
          value={config.cover.title}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              cover: { ...c.cover, title: e.target.value },
            }))
          }
          onFocus={() => setActiveText("title")}
          placeholder="Your gallery title"
          className={COVER_FIELD_CLASS}
        />

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
            onChange={(next) =>
              setConfig((c) => ({
                ...c,
                typography: { ...c.typography, headingFont: next },
              }))
            }
            onOpenChange={(opened) => {
              if (opened) setActiveText("title");
            }}
            ariaLabel="Title font"
          />
        </div>

        <div className="cover-range-color-grid">
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-title-size" className="form-label">
                Size
              </label>
              <span className="cover-range-value">
                {config.typography.titleSize}px
              </span>
            </div>
            <input
              id="cover-title-size"
              type="range"
              min={TITLE_SIZE_MIN}
              max={TITLE_SIZE_MAX}
              step={1}
              value={config.typography.titleSize}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  typography: {
                    ...c.typography,
                    titleSize: Number(e.target.value),
                  },
                }))
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
                setConfig((c) => ({
                  ...c,
                  cover: {
                    ...c.cover,
                    titleColor: e.target.value,
                    textColor: e.target.value,
                  },
                }))
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
          <h3 className="form-label">Subtitle</h3>
          <span
            className="cover-position-badge"
            data-state={activeText === "subtitle" ? "active" : "idle"}
            aria-label={`Subtitle position ${config.cover.subtitlePosition.x}% horizontal, ${config.cover.subtitlePosition.y}% vertical`}
          >
            {config.cover.subtitlePosition.x}, {config.cover.subtitlePosition.y}
          </span>
        </div>

        <input
          id="cover-subtitle-input"
          value={config.cover.subtitle}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              cover: { ...c.cover, subtitle: e.target.value },
            }))
          }
          onFocus={() => setActiveText("subtitle")}
          placeholder="Optional subtitle"
          className={COVER_FIELD_CLASS}
        />

        <div className="cover-field-stack">
          <label htmlFor="cover-subtitle-font" className="form-label">
            Font
          </label>
          <FontPicker
            id="cover-subtitle-font"
            value={config.typography.bodyFont}
            onChange={(next) =>
              setConfig((c) => ({
                ...c,
                typography: { ...c.typography, bodyFont: next },
              }))
            }
            onOpenChange={(opened) => {
              if (opened) setActiveText("subtitle");
            }}
            ariaLabel="Subtitle font"
          />
        </div>

        <div className="cover-range-color-grid">
          <div className="cover-field-stack">
            <div className="cover-field-row">
              <label htmlFor="cover-subtitle-size" className="form-label">
                Size
              </label>
              <span className="cover-range-value">
                {config.typography.subtitleSize}px
              </span>
            </div>
            <input
              id="cover-subtitle-size"
              type="range"
              min={SUBTITLE_SIZE_MIN}
              max={SUBTITLE_SIZE_MAX}
              step={1}
              value={config.typography.subtitleSize}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  typography: {
                    ...c.typography,
                    subtitleSize: Number(e.target.value),
                  },
                }))
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
                setConfig((c) => ({
                  ...c,
                  cover: { ...c.cover, subtitleColor: e.target.value },
                }))
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
}: {
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  assets: Asset[];
}) {
  const videoCount = assets.filter((asset) =>
    asset.content_type?.startsWith("video/"),
  ).length;

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
          const active = config.cover.mediaMode === mode.id;
          const disabled = mode.id === "short-video" && videoCount === 0;
          return (
            <SelectableTile
              key={mode.id}
              onClick={() => {
                setConfig((c) => ({
                  ...c,
                  cover: { ...c.cover, mediaMode: mode.id },
                }));
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
        {config.cover.mediaMode === "single-photo" &&
          "A single cover photo gives the fastest first paint and cleanest hero."}
        {config.cover.mediaMode === "slideshow" &&
          "The public hero will use available gallery thumbnails as a rotating opener."}
        {config.cover.mediaMode === "short-video" &&
          "Short video mode plays the selected video cover when the cover asset is video."}
        {config.cover.mediaMode === "photo-grid" &&
          "Photo grid mode opens with a 2x2 collage using the cover plus the next gallery images."}
      </div>
    </div>
  );
}

function PanelScenes({
  config,
  setConfig,
  assets,
}: {
  config: DesignConfig;
  setConfig: React.Dispatch<React.SetStateAction<DesignConfig>>;
  assets: Asset[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Scene headers</h3>
        <p className="text-xs text-on-surface-variant">
          Prepare mini-cover moments for the rituals and story sections
          photographers deliver most often.
        </p>
      </div>
      <div className="cover-option-grid cover-option-grid--2">
        {config.sceneHeaders.map((scene) => (
          <div
            key={scene.id}
            className="cover-control-card cover-scene-card"
            data-state={scene.enabled ? "active" : "idle"}
          >
            <div className="cover-control-card__header">
              <span className="cover-scene-card__copy">
                <span className="cover-scene-card__title">{scene.label}</span>
                <span className="cover-helper-text">Scene header</span>
              </span>
              <ToggleSwitch
                checked={scene.enabled}
                label={`${scene.label} scene header`}
                checkedLabel="On"
                uncheckedLabel="Off"
                className="cover-scene-card__toggle"
                onCheckedChange={(checked) =>
                  setConfig((c) => ({
                    ...c,
                    sceneHeaders: c.sceneHeaders.map((item) =>
                      item.id === scene.id
                        ? { ...item, enabled: checked }
                        : item,
                    ),
                  }))
                }
              />
            </div>
            <label className="cover-field-stack">
              <span className="form-label">Mini-cover</span>
              <select
                value={scene.assetId || ""}
                disabled={!scene.enabled}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    sceneHeaders: c.sceneHeaders.map((item) =>
                      item.id === scene.id
                        ? { ...item, assetId: e.target.value || null }
                        : item,
                    ),
                  }))
                }
                aria-label={`${scene.label} mini-cover`}
                className={COVER_FIELD_CLASS}
              >
                <option value="">Use gallery cover</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.filename}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <p className="cover-helper-text">
        Enabled scenes are saved with this cover design and can power future
        album/ritual section headers.
      </p>
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
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Studio branding</h3>
        <p className="text-xs text-on-surface-variant">
          Add a monogram, brand tint, watermark behavior, and placement for the
          public cover.
        </p>
      </div>

      <div className="cover-field-grid cover-field-grid--2">
        <label className="cover-field-stack">
          <span className="form-label">Monogram</span>
          <input
            value={config.branding.monogram}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                branding: {
                  ...c.branding,
                  monogram: e.target.value.toUpperCase().slice(0, 4),
                },
              }))
            }
            placeholder="AR"
            className={`${COVER_FIELD_CLASS} uppercase`}
            aria-label="Monogram"
          />
        </label>
        <label className="cover-field-stack">
          <span className="form-label">Brand color</span>
          <input
            type="color"
            value={
              config.branding.brandColor ||
              config.theme.accentColor ||
              COVER_COLORS.textMedia
            }
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                branding: { ...c.branding, brandColor: e.target.value },
                theme: { ...c.theme, accentColor: e.target.value },
              }))
            }
            className={COVER_COLOR_CLASS}
            aria-label="Brand color"
          />
        </label>
      </div>

      <section className="cover-control-card">
        <h4 className="form-label">Logo placement</h4>
        <div className="cover-option-grid cover-option-grid--3">
          {LOGO_PLACEMENTS.map((placement) => {
            const active = config.branding.logoPlacement === placement.id;
            return (
              <SelectableTile
                key={placement.id}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    branding: { ...c.branding, logoPlacement: placement.id },
                  }))
                }
                selected={active}
                title={placement.label}
                className="cover-compact-tile"
              />
            );
          })}
        </div>
      </section>

      <section className="cover-control-card">
        <h4 className="form-label">Watermark style</h4>
        <div className="cover-option-grid cover-option-grid--2">
          {WATERMARK_STYLES.map((watermark) => {
            const active = config.branding.watermarkStyle === watermark.id;
            return (
              <SelectableTile
                key={watermark.id}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    branding: { ...c.branding, watermarkStyle: watermark.id },
                  }))
                }
                selected={active}
                title={watermark.label}
                className="cover-compact-tile"
              />
            );
          })}
        </div>
      </section>

      <div className="cover-panel-divider cover-toggle-row">
        <span className="cover-toggle-row__copy">
          <span className="cover-scene-card__title">
            Apply this look to all galleries
          </span>
          <span className="cover-helper-text">
            Saved as intent for the studio design system.
          </span>
        </span>
        <ToggleSwitch
          checked={config.branding.applyToAll}
          label="Apply this look to all galleries"
          checkedLabel="On"
          uncheckedLabel="Off"
          onCheckedChange={(checked) =>
            setConfig((c) => ({
              ...c,
              branding: { ...c.branding, applyToAll: checked },
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

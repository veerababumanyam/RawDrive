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

import { useState, useRef, useCallback, useEffect, useMemo, useDeferredValue } from "react";
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
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";

// ──────────────────────────── Data ────────────────────────────

type ThemeVariant = "light" | "dark" | "auto";
type GridLayout = "masonry" | "grid" | "justified" | "carousel";
type TextAlign = "left" | "center" | "right";
type TabId = "cover" | "text" | "grid";

interface FocalPoint { x: number; y: number }
interface TextPos { x: number; y: number }

interface DesignConfig {
  theme: { id: string; variant: ThemeVariant; accentColor: string };
  cover: {
    assetId: string | null;
    styleId: string;
    focalPoint: FocalPoint;
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
    aspectRatio: string;
  };
  typography: {
    pairingId: string;
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
  version: number;
}

// Flat, deduped font catalog. Used by the per-element font selectors
// inside PanelText so title and subtitle each pick independently — the
// older "Font pairing" concept was removed 2026-05-18. Order groups
// serif headlines first, sans-serif next, mono last so the dropdown
// reads top-down by visual weight.
const FONT_OPTIONS: { name: string; classification: "serif" | "sans" | "mono" }[] = [
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

const DEFAULT_CONFIG: DesignConfig = {
  theme: { id: "liquid-glass", variant: "dark", accentColor: "" },
  cover: {
    assetId: null,
    styleId: "classic-full",
    focalPoint: { x: 50, y: 50 },
    title: "",
    subtitle: "",
    titlePosition: { x: 50, y: 70 },
    subtitlePosition: { x: 50, y: 82 },
    textAlign: "center",
    textColor: "#ffffff",
    titleColor: "#ffffff",
    subtitleColor: "#ffffff",
    textShadow: true,
    aspectRatio: "16/9",
  },
  typography: {
    pairingId: "elegant",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    titleSize: 48,
    subtitleSize: 18,
  },
  grid: { layout: "grid", columns: 3, gap: DEFAULT_GRID_GAP, showInfo: false },
  version: 2,
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
    const typo = raw.typography as Partial<DesignConfig["typography"]> | undefined;
    if (typo) Object.assign(merged.typography, typo);
    const grid = raw.grid as Partial<DesignConfig["grid"]> | undefined;
    if (grid) Object.assign(merged.grid, grid);
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
  // (DEFAULT_CONFIG defaults them to "#ffffff"), so we backfill them from
  // the legacy textColor here. The first user save will then persist all
  // three keys side-by-side.
  const savedCover = (raw && typeof raw === "object"
    ? (raw.cover as { titleColor?: string; subtitleColor?: string } | undefined)
    : undefined) ?? {};
  if (!savedCover.titleColor && merged.cover.textColor) {
    merged.cover.titleColor = merged.cover.textColor;
  }
  if (!savedCover.subtitleColor && merged.cover.textColor) {
    merged.cover.subtitleColor = merged.cover.textColor;
  }

  return merged;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
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
          listGalleryAssets(token, galleryId),
        ]);
        if (cancelled) return;
        setGallery(g);

        const hydrated = await Promise.all(
          galleryAssets.map(async (entry) => {
            try { return await getAsset(token, entry.asset_id); }
            catch { return null; }
          }),
        );
        if (cancelled) return;
        const realAssets = hydrated.filter((a): a is Asset => a !== null);
        setAssets(realAssets);

        const initial = configFromGallery(g);
        if (!initial.cover.assetId) {
          initial.cover.assetId = realAssets[0]?.id || null;
        }
        setConfig(initial);
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load Cover & Design data:", err);
      }
    })();
    return () => { cancelled = true; };
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
    ensureFontsLoaded(`https://fonts.googleapis.com/css2?${param}&display=swap`);
  }, [loaded]);

  const token = useMemo(() => getStoredAccessToken(), []);
  const selectedAsset = assets.find((a) => a.id === config.cover.assetId);
  const previewUrl = selectedAsset ? getAssetPreviewUrl(selectedAsset, token) : "";

  // ───────────── Drag handlers ─────────────

  const onStagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    // What's being dragged is decided by data-handle on the target.
    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]");
    const kind = (handle?.dataset.handle as DragKind) || "focal";
    dragKindRef.current = kind;
    setDragKind(kind);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pen drivers */ }
    e.preventDefault();
  }, []);

  const onStagePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const kind = dragKindRef.current;
    if (!kind || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const { x, y } = pctFromEvent(e, rect);
    setConfig((c) => {
      if (kind === "focal") {
        return { ...c, cover: { ...c.cover, focalPoint: { x: Math.round(x), y: Math.round(y) } } };
      }
      if (kind === "title") {
        return { ...c, cover: { ...c.cover, titlePosition: { x: Math.round(x), y: Math.round(y) } } };
      }
      if (kind === "subtitle") {
        return { ...c, cover: { ...c.cover, subtitlePosition: { x: Math.round(x), y: Math.round(y) } } };
      }
      return c;
    });
  }, []);

  const onStagePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragKindRef.current = null;
    setDragKind(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch { /* ignore */ }
  }, []);

  // ───────────── Save ─────────────

  const handleSave = async () => {
    if (!token) { setSaveError("Your session expired. Please log in again."); return; }
    if (!config.cover.assetId) { setSaveError("Pick a cover photo before saving."); return; }
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    setJustSaved(false);
    try {
      await updateGalleryDesign(token, galleryId, config as unknown as Record<string, unknown>);
      // Capture the snapshot of what we just sent so the dirty-dot logic
      // recognises this state as "clean". Use JSON.stringify of the same
      // serialisation we sent over the wire so the comparison is exact.
      setSavedSnapshot(JSON.stringify(config));
      setSaveMessage("Cover & Design saved.");
      setJustSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save design.");
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

  // Whenever the loaded config first hydrates from the gallery, capture
  // it as the initial saved snapshot. Then the dirty dot only lights up
  // when the user *actually* changes something — not on first mount when
  // the just-fetched state structurally differs from DEFAULT_CONFIG.
  useEffect(() => {
    if (!loaded) return;
    setSavedSnapshot((prev) => (prev ? prev : JSON.stringify(config)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const isDirty = savedSnapshot !== "" && savedSnapshot !== JSON.stringify(config);

  // ───────────── Derived preview state ─────────────

  const variantScrim =
    config.theme.variant === "dark" ? "rgba(0,0,0,0.35)"
    : config.theme.variant === "auto" ? "rgba(0,0,0,0.15)"
    : null;
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
    ? "0 2px 12px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.4)"
    : undefined;

  // ───────────── Render ─────────────

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8">
        <GalleryWorkspaceNav galleryId={galleryId} />
      </div>

      <header className="mt-3 flex flex-col gap-3 border-b border-white/5 px-4 py-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold font-headline sm:text-xl">Cover &amp; Design</h1>
          <p className="truncate text-xs text-on-surface-variant">
            {gallery?.title || "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            className="min-h-[40px] flex-1 cursor-pointer rounded-xl border border-white/10 bg-surface px-3 py-2 pr-8 text-sm capitalize focus:border-primary focus:outline-none sm:flex-none"
          >
            <option value="cover">Cover</option>
            <option value="text">Text</option>
            <option value="grid">Grid</option>
          </select>
          {gallery?.slug && (
            <Link
              href={`/g/${gallery.slug}`}
              target="_blank"
              className="min-h-[40px] flex-1 rounded-xl border border-white/10 px-4 py-2 text-center text-sm transition-colors hover:bg-white/5 sm:flex-none"
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
          <button
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
            className={`relative min-h-[40px] flex-1 overflow-hidden rounded-xl px-5 py-2 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed sm:flex-none sm:px-6 ${
              justSaved
                ? "bg-success/85 text-on-primary shadow-lg shadow-success/30 scale-[1.02]"
                : saving
                  ? "bg-gradient-to-r from-primary to-primary-container text-on-primary opacity-90"
                  : "bg-gradient-to-r from-primary to-primary-container text-on-primary hover:shadow-md hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              {saving && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              )}
              {justSaved && (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 8.5 6.5 12 13 4" />
                </svg>
              )}
              <span>{saving ? "Saving…" : justSaved ? "Saved" : "Save"}</span>
            </span>
            {/* Unsaved-changes dot in the button corner. Only visible in
                the idle-dirty state — not during save or right after. */}
            {isDirty && !saving && !justSaved && (
              <span
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-warning shadow-sm shadow-warning/40"
                aria-hidden
              />
            )}
          </button>
        </div>
      </header>

      {(saveMessage || saveError) && (
        <div className="px-4 pt-3 sm:px-6 lg:px-8" role="status" aria-live="polite">
          {saveMessage && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 8.5 6.5 12 13 4" />
              </svg>
              {saveMessage}
            </div>
          )}
          {saveError && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v4M8 11.5v.01" />
              </svg>
              {saveError}
            </div>
          )}
        </div>
      )}

      {/* Single-column layout — preview spans the full content width up to
          a comfortable reading max, then the editor sits directly below.
          No side panel, no sticky pane: the cover image is the page's
          subject and gets the entire content rectangle. mx-auto + max-w
          keeps the cover from stretching absurdly wide on 4K monitors
          where a 16:9 frame would become a runway. */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-8 sm:gap-7 sm:p-6 lg:gap-8 lg:p-8">
        {/* ───────── LIVE PREVIEW ───────── */}
        <section>
          <div
            ref={stageRef}
            onPointerDown={previewUrl ? onStagePointerDown : undefined}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            className={`relative w-full select-none overflow-hidden rounded-2xl border border-white/10 bg-surface-container shadow-2xl shadow-black/20 ${
              previewUrl ? (dragKind ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
            }`}
            style={{
              aspectRatio: config.cover.aspectRatio,
              maxHeight: "min(78vh, 820px)",
              touchAction: "none",
            }}
            aria-label="Cover preview — drag photo to pan, drag title/subtitle to position"
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={selectedAsset?.filename || "Cover preview"}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: `${config.cover.focalPoint.x}% ${config.cover.focalPoint.y}%` }}
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-surface-container to-surface-container-high" />
            )}

            {variantScrim && (
              <div className="pointer-events-none absolute inset-0" style={{ background: variantScrim }} />
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
                  activeText === "title" && tab === "text" ? "ring-2 ring-primary ring-offset-2 ring-offset-black/30" : ""
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
                  padding: "4px 8px",
                  borderRadius: "4px",
                  lineHeight: 1.1,
                  userSelect: "none",
                  whiteSpace: "pre",
                }}
                onClick={() => { setActiveText("title"); setTab("text"); }}
              >
                {config.cover.title}
              </h2>
            )}

            {/* Subtitle overlay — draggable. Same wrap rules as title. */}
            {config.cover.subtitle && (
              <p
                data-handle="subtitle"
                className={`absolute touch-none transition-shadow ${
                  activeText === "subtitle" && tab === "text" ? "ring-2 ring-primary ring-offset-2 ring-offset-black/30" : ""
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
                  padding: "4px 8px",
                  borderRadius: "4px",
                  lineHeight: 1.3,
                  userSelect: "none",
                  whiteSpace: "pre",
                }}
                onClick={() => { setActiveText("subtitle"); setTab("text"); }}
              >
                {config.cover.subtitle}
              </p>
            )}

            {/* Drag-hint pill */}
            {previewUrl && !dragKind && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">
                {tab === "text" ? "Drag title / subtitle to position" : "Drag photo to pan"}
              </div>
            )}
          </div>
        </section>

        {/* ───────── EDITOR PANEL ───────── */}
        <section>
          {/* Section picker moved into the page header as a dropdown
              next to Preview/Save. The panel body renders the active
              section's controls without a tab bar above it. */}
          <div className="rounded-2xl border border-white/10 bg-surface-container p-4 sm:p-6">
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
          </div>
        </section>
      </div>
    </div>
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
          listRef.current.querySelectorAll<HTMLButtonElement>("[data-font-option]"),
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
      className="relative"
      onKeyDown={handleKeyDown}
    >
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || `Select font, current: ${value}`}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm transition-colors hover:border-white/20 focus:border-primary focus:outline-none"
      >
        <span
          className="truncate text-left"
          style={{ fontFamily: fontFamilyFor(value) }}
        >
          {value}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className={`ml-2 h-2 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
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
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-surface-container py-1 shadow-2xl shadow-black/40"
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
                onClick={() => {
                  onChange(f.name);
                  setOpen(false);
                }}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none ${
                  selected ? "bg-primary/10 text-primary" : "text-on-surface"
                }`}
                style={{ fontFamily: fontFamilyFor(f.name) }}
              >
                <span className="truncate">{f.name}</span>
                <span
                  className="shrink-0 text-base text-on-surface-variant"
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
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Cover photo</h3>
          <span className="text-xs text-on-surface-variant">
            {assets.length} {assets.length === 1 ? "photo" : "photos"}
          </span>
        </div>
        <div className="grid max-h-[320px] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {assets.map((a) => {
            const url = getAssetPreviewUrl(a, token);
            const active = config.cover.assetId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setConfig((c) => ({ ...c, cover: { ...c.cover, assetId: a.id } }))}
                className={`aspect-square overflow-hidden rounded-md transition-all ${
                  active ? "ring-2 ring-primary" : "ring-1 ring-white/10 hover:ring-white/20"
                }`}
                aria-label={`Use ${a.filename} as cover`}
                aria-pressed={active}
              >
                {url ? (
                  <img src={url} alt={a.filename} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full bg-surface-container-high" />
                )}
              </button>
            );
          })}
        </div>
        {assets.length === 0 && (
          <p className="mt-2 text-xs text-on-surface-variant">
            Upload photos to the gallery to choose a cover.
          </p>
        )}
      </div>

      <div className="border-t border-white/10 pt-4">
        <button
          onClick={() => setConfig((c) => ({ ...c, cover: { ...c.cover, focalPoint: { x: 50, y: 50 } } }))}
          className="min-h-[40px] w-full rounded-lg border border-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/5"
        >
          Reset focal point ({config.cover.focalPoint.x}%, {config.cover.focalPoint.y}%)
        </button>
      </div>
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
  return (
    <div className="space-y-6">
      {/* ───────── TITLE GROUP ─────────
          Everything about the title in one block: text input, size
          slider, color. Section heading + position chip up top. Active
          ring on inputs syncs to the preview overlay's selection. */}
      <section
        className={`space-y-3 rounded-xl border p-3 transition-colors ${
          activeText === "title"
            ? "border-primary/40 bg-primary/[0.03]"
            : "border-white/10"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Title
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums transition-colors ${
              activeText === "title" ? "bg-primary/15 text-primary" : "text-on-surface-variant/70"
            }`}
            aria-label={`Title position ${config.cover.titlePosition.x}% horizontal, ${config.cover.titlePosition.y}% vertical`}
          >
            {config.cover.titlePosition.x}, {config.cover.titlePosition.y}
          </span>
        </div>

        <input
          id="cover-title-input"
          value={config.cover.title}
          onChange={(e) => setConfig((c) => ({ ...c, cover: { ...c.cover, title: e.target.value } }))}
          onFocus={() => setActiveText("title")}
          placeholder="Your gallery title"
          className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm transition-colors hover:border-white/20 focus:border-primary focus:outline-none"
        />

        {/* Per-element font picker — custom popover dropdown so each
            option renders styled in its own font (native <select>
            doesn't honor per-option font-family in Chromium/Webkit).
            See FontPicker for keyboard nav + click-outside behavior. */}
        <div className="space-y-1.5">
          <label htmlFor="cover-title-font" className="text-[11px] text-on-surface-variant">Font</label>
          <FontPicker
            id="cover-title-font"
            value={config.typography.headingFont}
            onChange={(next) =>
              setConfig((c) => ({ ...c, typography: { ...c.typography, headingFont: next } }))
            }
            onOpenChange={(opened) => {
              if (opened) setActiveText("title");
            }}
            ariaLabel="Title font"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="cover-title-size" className="text-[11px] text-on-surface-variant">Size</label>
              <span className="text-[11px] tabular-nums">{config.typography.titleSize}px</span>
            </div>
            <input
              id="cover-title-size"
              type="range"
              min={TITLE_SIZE_MIN}
              max={TITLE_SIZE_MAX}
              step={1}
              value={config.typography.titleSize}
              onChange={(e) =>
                setConfig((c) => ({ ...c, typography: { ...c.typography, titleSize: Number(e.target.value) } }))
              }
              onFocus={() => setActiveText("title")}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cover-title-color" className="text-[11px] text-on-surface-variant">Color</label>
            <input
              id="cover-title-color"
              type="color"
              value={config.cover.titleColor || "#ffffff"}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  cover: { ...c.cover, titleColor: e.target.value, textColor: e.target.value },
                }))
              }
              onFocus={() => setActiveText("title")}
              className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-surface p-0"
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
        className={`space-y-3 rounded-xl border p-3 transition-colors ${
          activeText === "subtitle"
            ? "border-primary/40 bg-primary/[0.03]"
            : "border-white/10"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Subtitle
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums transition-colors ${
              activeText === "subtitle" ? "bg-primary/15 text-primary" : "text-on-surface-variant/70"
            }`}
            aria-label={`Subtitle position ${config.cover.subtitlePosition.x}% horizontal, ${config.cover.subtitlePosition.y}% vertical`}
          >
            {config.cover.subtitlePosition.x}, {config.cover.subtitlePosition.y}
          </span>
        </div>

        <input
          id="cover-subtitle-input"
          value={config.cover.subtitle}
          onChange={(e) => setConfig((c) => ({ ...c, cover: { ...c.cover, subtitle: e.target.value } }))}
          onFocus={() => setActiveText("subtitle")}
          placeholder="Optional subtitle"
          className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm transition-colors hover:border-white/20 focus:border-primary focus:outline-none"
        />

        <div className="space-y-1.5">
          <label htmlFor="cover-subtitle-font" className="text-[11px] text-on-surface-variant">Font</label>
          <FontPicker
            id="cover-subtitle-font"
            value={config.typography.bodyFont}
            onChange={(next) =>
              setConfig((c) => ({ ...c, typography: { ...c.typography, bodyFont: next } }))
            }
            onOpenChange={(opened) => {
              if (opened) setActiveText("subtitle");
            }}
            ariaLabel="Subtitle font"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="cover-subtitle-size" className="text-[11px] text-on-surface-variant">Size</label>
              <span className="text-[11px] tabular-nums">{config.typography.subtitleSize}px</span>
            </div>
            <input
              id="cover-subtitle-size"
              type="range"
              min={SUBTITLE_SIZE_MIN}
              max={SUBTITLE_SIZE_MAX}
              step={1}
              value={config.typography.subtitleSize}
              onChange={(e) =>
                setConfig((c) => ({ ...c, typography: { ...c.typography, subtitleSize: Number(e.target.value) } }))
              }
              onFocus={() => setActiveText("subtitle")}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cover-subtitle-color" className="text-[11px] text-on-surface-variant">Color</label>
            <input
              id="cover-subtitle-color"
              type="color"
              value={config.cover.subtitleColor || "#ffffff"}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  cover: { ...c.cover, subtitleColor: e.target.value },
                }))
              }
              onFocus={() => setActiveText("subtitle")}
              className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-surface p-0"
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
      <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="text-[11px] font-medium text-on-surface-variant">Readability shadow</span>
        <input
          type="checkbox"
          checked={config.cover.textShadow}
          onChange={(e) => setConfig((c) => ({ ...c, cover: { ...c.cover, textShadow: e.target.checked } }))}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </label>

      <p className="text-[11px] text-on-surface-variant/80">
        Drag the title or subtitle on the preview to reposition.
      </p>
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
        <p className="text-xs text-on-surface-variant">How photos arrange in the public gallery.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {GRID_LAYOUTS.map((g) => (
          <button
            key={g.id}
            onClick={() => setConfig((c) => ({ ...c, grid: { ...c.grid, layout: g.id } }))}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              config.grid.layout === g.id ? "border-primary bg-primary/10 text-primary" : "border-white/10 hover:bg-white/5"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="space-y-2 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between">
          <label htmlFor="cover-grid-cols" className="text-xs font-medium text-on-surface-variant">Columns</label>
          <span className="text-xs">{config.grid.columns}</span>
        </div>
        <input
          id="cover-grid-cols"
          type="range"
          min={1}
          max={6}
          step={1}
          value={config.grid.columns}
          onChange={(e) =>
            setConfig((c) => ({ ...c, grid: { ...c.grid, columns: Number(e.target.value) } }))
          }
          className="w-full accent-primary"
        />
      </div>

      <label className="flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-on-surface-variant">
        <input
          type="checkbox"
          checked={config.grid.showInfo}
          onChange={(e) => setConfig((c) => ({ ...c, grid: { ...c.grid, showInfo: e.target.checked } }))}
        />
        Show filename caption under photos
      </label>

      {/* Live grid preview — renders the user's actual gallery assets in
          the chosen layout so they see exactly how the published page
          will arrange photos. Mirrors the rules in public-gallery-grid:
          grid uses N square cells, justified uses varied-width flex rows.
          (Masonry/carousel branches retained inside GridLivePreview for
          legacy galleries that have those saved.) */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Preview</h3>
          <span className="text-[10px] text-on-surface-variant/70">
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
      <div
        className="overflow-x-auto rounded-lg border border-white/10 bg-surface/40 p-3"
        style={{ maxHeight: 200 }}
      >
        <div className="flex" style={{ gap }}>
          {(empty ? Array.from({ length: placeholderCount }) : sample).map((a, i) => {
            const asset = empty ? null : (a as Asset);
            const url = asset ? getAssetPreviewUrl(asset, token) : "";
            return (
              <div
                key={i}
                className="shrink-0 overflow-hidden rounded-md bg-surface-container-high"
                style={{ width: 120, height: 80 }}
              >
                {url ? (
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (grid.layout === "masonry") {
    // CSS columns + break-inside-avoid is the same technique
    // public-gallery-grid uses for masonry. Heights vary so the asymmetry
    // is visible at preview scale.
    const heights = [70, 100, 80, 120, 90, 110, 75, 95, 105, 85, 115, 90];
    return (
      <div
        className="rounded-lg border border-white/10 bg-surface/40 p-3"
        style={{ columnCount: cols, columnGap: gap }}
      >
        {(empty ? Array.from({ length: placeholderCount }) : sample).map((a, i) => {
          const asset = empty ? null : (a as Asset);
          const url = asset ? getAssetPreviewUrl(asset, token) : "";
          const h = heights[i % heights.length];
          return (
            <div
              key={i}
              className="mb-[var(--gap)] overflow-hidden rounded-md bg-surface-container-high"
              style={{ ["--gap" as never]: `${gap}px`, marginBottom: gap, height: h, breakInside: "avoid" }}
            >
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (grid.layout === "justified") {
    // Justified: flex rows with varying-width tiles, all the same height.
    // public-gallery-grid uses flex-row + flex-grow tiles.
    const widthWeights = [1.5, 1, 2, 1, 1.7, 1.2, 1, 1.8, 1.3, 1.4, 1, 1.6];
    return (
      <div
        className="rounded-lg border border-white/10 bg-surface/40 p-3"
        style={{ display: "flex", flexWrap: "wrap", gap }}
      >
        {(empty ? Array.from({ length: placeholderCount }) : sample).map((a, i) => {
          const asset = empty ? null : (a as Asset);
          const url = asset ? getAssetPreviewUrl(asset, token) : "";
          const w = widthWeights[i % widthWeights.length];
          return (
            <div
              key={i}
              className="overflow-hidden rounded-md bg-surface-container-high"
              style={{ flex: `${w} 1 ${w * 60}px`, height: 80 }}
            >
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  // grid (default) — uniform square cells in N columns.
  return (
    <div
      className="rounded-lg border border-white/10 bg-surface/40 p-3"
      style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}
    >
      {(empty ? Array.from({ length: placeholderCount }) : sample).map((a, i) => {
        const asset = empty ? null : (a as Asset);
        const url = asset ? getAssetPreviewUrl(asset, token) : "";
        return (
          <div
            key={i}
            className="aspect-square overflow-hidden rounded-md bg-surface-container-high"
          >
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : null}
          </div>
        );
      })}
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

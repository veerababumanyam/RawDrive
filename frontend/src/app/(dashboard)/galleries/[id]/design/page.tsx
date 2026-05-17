"use client";

import { useState, useReducer, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { COVER_STYLES, COVER_CATEGORIES, type CoverStyle } from "@/components/gallery/cover-styles";
import { DesignTemplates } from "@/components/gallery/design-templates";
import { AIDesignSuggest } from "@/components/gallery/ai-design-suggest";
import { useDesignHistory } from "@/hooks/use-design-history";
import { useDesignLatency, LATENCY_BUDGET_MS } from "@/hooks/use-design-latency";
import { getStoredAccessToken } from "@/lib/auth";
import { listGalleryAssets, updateGalleryDesign } from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";

// ──────────────────────── Types ────────────────────────

interface DesignConfig {
  theme: { id: string; variant: "light" | "dark" | "auto"; accentColor: string };
  // `title` and `subtitle` were missing on the cover config until 2026-05-17.
  // The Typography section already let users pick heading/body fonts, but
  // there was no actual heading to apply them to — the cover preview just
  // rendered the cover style's name as tertiary placeholder text and the
  // mini-previews showed a generic "TITLE" string. Adding these here so
  // both previews can render real heading typography in the user's chosen
  // pairing, and so the title persists with the saved design.
  cover: {
    assetId: string | null;
    styleId: string;
    focalPoint: { x: number; y: number };
    title: string;
    subtitle: string;
  };
  typography: { pairingId: string; headingFont: string; bodyFont: string };
  grid: { layout: "masonry" | "grid" | "justified" | "carousel"; columns: number; gap: number; showInfo: boolean };
  version: number;
}

type DesignAction =
  | { type: "SET_THEME"; payload: Partial<DesignConfig["theme"]> }
  | { type: "SET_COVER"; payload: Partial<DesignConfig["cover"]> }
  | { type: "SET_TYPOGRAPHY"; payload: Partial<DesignConfig["typography"]> }
  | { type: "SET_GRID"; payload: Partial<DesignConfig["grid"]> }
  | { type: "LOAD"; payload: DesignConfig }
  | { type: "RESET_SECTION"; section: string }
  | { type: "RESET" };

const defaultConfig: DesignConfig = {
  theme: { id: "liquid-glass", variant: "light", accentColor: "" },
  cover: {
    assetId: null,
    styleId: "classic-full",
    focalPoint: { x: 50, y: 50 },
    title: "Your Gallery Title",
    subtitle: "A short subtitle for your gallery",
  },
  typography: { pairingId: "elegant", headingFont: "Playfair Display", bodyFont: "Inter" },
  grid: { layout: "masonry", columns: 3, gap: 8, showInfo: false },
  version: 1,
};

const sectionDefaults: Record<string, unknown> = {
  theme: defaultConfig.theme,
  cover: defaultConfig.cover,
  typography: defaultConfig.typography,
  grid: defaultConfig.grid,
};

function designReducer(state: DesignConfig, action: DesignAction): DesignConfig {
  switch (action.type) {
    case "SET_THEME": return { ...state, theme: { ...state.theme, ...action.payload } };
    case "SET_COVER": return { ...state, cover: { ...state.cover, ...action.payload } };
    case "SET_TYPOGRAPHY": return { ...state, typography: { ...state.typography, ...action.payload } };
    case "SET_GRID": return { ...state, grid: { ...state.grid, ...action.payload } };
    case "LOAD": return action.payload;
    case "RESET_SECTION": return { ...state, [action.section]: sectionDefaults[action.section] ?? (state as unknown as Record<string, unknown>)[action.section] };
    case "RESET": return defaultConfig;
    default: return state;
  }
}

// ──────────────────────── Theme Data ────────────────────────

const THEMES = [
  { id: "liquid-glass", name: "Liquid Glass", accent: "#6366f1" },
  { id: "heritage", name: "Heritage", accent: "#92400e" },
  { id: "noir", name: "Noir", accent: "#171717" },
  { id: "botanical", name: "Botanical", accent: "#166534" },
  { id: "sunset", name: "Sunset", accent: "#c2410c" },
  { id: "arctic", name: "Arctic", accent: "#0e7490" },
  { id: "lavender", name: "Lavender", accent: "#7e22ce" },
  { id: "champagne", name: "Champagne", accent: "#a16207" },
  { id: "slate", name: "Slate", accent: "#475569" },
];

const FONT_PAIRINGS = [
  { id: "elegant", heading: "Playfair Display", body: "Inter", label: "Elegant & Modern" },
  { id: "editorial", heading: "Cormorant Garamond", body: "Lato", label: "Editorial Classic" },
  { id: "minimal", heading: "Manrope", body: "Inter", label: "Clean Minimal" },
  { id: "bold", heading: "Montserrat", body: "Open Sans", label: "Bold & Confident" },
  { id: "soft", heading: "Lora", body: "Source Sans Pro", label: "Soft & Warm" },
  { id: "modern", heading: "DM Sans", body: "DM Mono", label: "Modern Technical" },
];

const GRID_LAYOUTS = [
  { id: "masonry", label: "Masonry" },
  { id: "grid", label: "Grid" },
  { id: "justified", label: "Justified" },
  { id: "carousel", label: "Carousel" },
] as const;

type GridLayoutKind = (typeof GRID_LAYOUTS)[number]["id"];

// Mini visual diagrams of each grid layout. Previously the four buttons
// showed Unicode glyphs (⊞ ⊟ ☰ ◀▶) which are ambiguous at small sizes —
// users had no idea what each mode actually does until they clicked
// every one. Each variant draws the actual tile arrangement so the
// button is self-documenting: vertical column flow for masonry, uniform
// 2×3 cells for grid, varied-width flex rows for justified, and a
// horizontal strip with a partial edge tile for carousel.
function LayoutMiniPreview({ kind }: { kind: GridLayoutKind }) {
  const fill = "currentColor";
  const opacity = "0.75";
  if (kind === "masonry") {
    return (
      <svg viewBox="0 0 24 18" className="w-6 h-[18px]" aria-hidden>
        <g fill={fill} fillOpacity={opacity}>
          <rect x="0" y="0" width="6" height="10" rx="1" />
          <rect x="0" y="11" width="6" height="7" rx="1" />
          <rect x="9" y="0" width="6" height="14" rx="1" />
          <rect x="9" y="15" width="6" height="3" rx="1" />
          <rect x="18" y="0" width="6" height="6" rx="1" />
          <rect x="18" y="7" width="6" height="11" rx="1" />
        </g>
      </svg>
    );
  }
  if (kind === "grid") {
    return (
      <svg viewBox="0 0 24 18" className="w-6 h-[18px]" aria-hidden>
        <g fill={fill} fillOpacity={opacity}>
          <rect x="0" y="0" width="6" height="6" rx="1" />
          <rect x="9" y="0" width="6" height="6" rx="1" />
          <rect x="18" y="0" width="6" height="6" rx="1" />
          <rect x="0" y="9" width="6" height="6" rx="1" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
          <rect x="18" y="9" width="6" height="6" rx="1" />
        </g>
      </svg>
    );
  }
  if (kind === "justified") {
    return (
      <svg viewBox="0 0 24 18" className="w-6 h-[18px]" aria-hidden>
        <g fill={fill} fillOpacity={opacity}>
          <rect x="0" y="0" width="9" height="7" rx="1" />
          <rect x="10" y="0" width="5" height="7" rx="1" />
          <rect x="16" y="0" width="8" height="7" rx="1" />
          <rect x="0" y="9" width="6" height="7" rx="1" />
          <rect x="7" y="9" width="10" height="7" rx="1" />
          <rect x="18" y="9" width="6" height="7" rx="1" />
        </g>
      </svg>
    );
  }
  // carousel — three full tiles plus a partial right-edge tile indicating
  // horizontal overflow, which is the defining behavior of the layout.
  return (
    <svg viewBox="0 0 24 18" className="w-6 h-[18px]" aria-hidden>
      <g fill={fill} fillOpacity={opacity}>
        <rect x="0" y="3" width="6" height="12" rx="1" />
        <rect x="7" y="3" width="6" height="12" rx="1" />
        <rect x="14" y="3" width="6" height="12" rx="1" />
        <rect x="21" y="3" width="3" height="12" rx="1" />
      </g>
    </svg>
  );
}

// Mini visual preview of a cover style. Renders a small rectangle at the
// style's actual aspect ratio with the style's overlay applied and a
// "title bar" indicator positioned per textAlign — so the user can see
// at a glance that "Editorial Left" lays text on the left, "Magazine
// Cover" is portrait 3/4, "Cinematic Wide" is ultrawide 21/9, etc.
// Previously these 30 buttons rendered only the style name as text, so
// the user had to memorize what each name implied.
function CoverStyleMiniPreview({
  style,
  sampleUrl,
  titleText,
  headingFont,
}: {
  style: CoverStyle;
  sampleUrl?: string;
  titleText?: string;
  headingFont?: string;
}) {
  // Truncate the user's actual title so it fits the tiny preview box.
  // Two-word slice mirrors how mini-cover thumbnails work in Adobe Express
  // and Squarespace — long enough to recognize, short enough not to wrap.
  const previewTitle = (titleText || "Title").trim().split(/\s+/).slice(0, 2).join(" ") || "Title";
  const isSerif = !!headingFont && /Playfair|Cormorant|Lora|Garamond|EB Garamond|Merriweather/i.test(headingFont);
  const fontStack = headingFont
    ? `'${headingFont}', ${isSerif ? "Georgia, serif" : "Inter, system-ui, sans-serif"}`
    : undefined;
  // Earlier revision rendered a tiny 32×N gradient rectangle plus a 2×8px
  // dot to represent the title — too small to read, no contrast against
  // the button surface, and the overlay layer had nothing underneath so
  // "Hero Overlay" looked identical to "Hero Blur". This rebuild:
  //   1. Uses a real asset thumbnail from the gallery as the backdrop so
  //      the preview communicates how an actual photo would crop at this
  //      style's aspectRatio + objectPosition.
  //   2. Renders a readable "TITLE" placeholder at the correct textAlign
  //      so the user can see "Editorial Left" puts copy on the left,
  //      "Editorial Right" on the right, etc.
  //   3. Drops the fixed pixel height; the preview now fills the full
  //      button width and computes height from aspectRatio — so 21/9
  //      previews are visibly ultrawide and 3/4 are visibly portrait.
  //   4. Falls back to a colored gradient when no gallery asset is
  //      loaded yet (still showing the overlay + title for shape clues).
  return (
    <div className="relative w-full h-full flex flex-col items-stretch justify-between gap-1 p-1.5">
      <div className="flex-1 w-full flex items-center justify-center min-h-0">
        <div
          className="relative bg-gradient-to-br from-accent-primary/40 via-accent-primary/15 to-surface-container-high rounded-md overflow-hidden border border-border-subtle/40 flex items-end shadow-sm"
          style={{
            aspectRatio: style.aspectRatio,
            maxHeight: "100%",
            maxWidth: "100%",
            width: style.aspectRatio.startsWith("3/4") || style.aspectRatio.startsWith("1/1") ? "auto" : "100%",
          }}
          aria-hidden
        >
          {sampleUrl && (
            <img
              src={sampleUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: style.objectPosition }}
              draggable={false}
              loading="lazy"
            />
          )}
          {style.overlay && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: style.overlay }}
            />
          )}
          <div
            className={cn(
              "relative w-full px-1.5 py-1 flex items-end",
              style.textAlign === "left" && "justify-start",
              style.textAlign === "right" && "justify-end",
              style.textAlign === "center" && "justify-center",
            )}
          >
            <span
              className="text-white text-[8px] font-bold leading-none tracking-[0.02em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] truncate max-w-full"
              style={fontStack ? { fontFamily: fontStack } : undefined}
            >
              {previewTitle}
            </span>
          </div>
        </div>
      </div>
      <span className="text-[9px] leading-tight truncate w-full text-center font-medium">{style.name}</span>
    </div>
  );
}

type PreviewDevice = "desktop" | "tablet" | "mobile";
const PREVIEW_WIDTHS: Record<PreviewDevice, string> = { desktop: "100%", tablet: "768px", mobile: "375px" };

// Section was previously defined as an arrow function INSIDE the page
// component body, which meant React saw a fresh component-type identity on
// every render and unmounted/remounted the entire collapsible subtree —
// including every <input> child. Result: typing one character in the
// title/subtitle inputs (or any other input rendered inside a Section)
// killed focus immediately, so users couldn't type more than one character
// before the field reset. Moving Section to module scope stabilizes its
// component identity; React now reconciles props across renders instead of
// destroying the DOM subtree, and focus persists through state updates.
// All state previously closed over (activeSection, setActiveSection,
// handleSectionReset, resetConfirm) is now passed in via props.
function Section({
  id,
  title,
  isOpen,
  isResetConfirming,
  onToggle,
  onReset,
  children,
}: {
  id: string;
  title: string;
  isOpen: boolean;
  isResetConfirming: boolean;
  onToggle: (id: string) => void;
  onReset: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle">
      <div className="flex items-center justify-between">
        <button
          onClick={() => onToggle(id)}
          className="flex-1 flex items-center justify-between px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-container-low transition-colors"
        >
          {title}
          <span className="text-xs text-text-tertiary">{isOpen ? "−" : "+"}</span>
        </button>
        {isOpen && (
          <button
            onClick={() => onReset(id)}
            className={`mr-2 text-xs px-2 py-1 rounded ${
              isResetConfirming
                ? "bg-feedback-error text-text-inverse"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {isResetConfirming ? "Confirm Reset" : "Reset"}
          </button>
        )}
      </div>
      {isOpen && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// Dynamic Google Fonts loader — loads premium fonts on demand (GAL-FR-065)
const loadedFonts = new Set<string>();
function loadGoogleFont(fontFamily: string) {
  if (loadedFonts.has(fontFamily) || fontFamily === "Inter" || fontFamily === "Manrope") return;
  loadedFonts.add(fontFamily);
  const encoded = fontFamily.replace(/ /g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

// ──────────────────────── Draft Persistence ────────────────────────

function useDraftPersistence(galleryId: string, config: DesignConfig) {
  const key = `rawdrive-design-draft-${galleryId}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ config, savedAt: Date.now() }));
    }, 3000);
    return () => clearTimeout(timer);
  }, [config, key]);

  const getSavedDraft = useCallback((): { config: DesignConfig; savedAt: number } | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }, [key]);

  const discard = useCallback(() => localStorage.removeItem(key), [key]);

  return { getSavedDraft, discard };
}

// ──────────────────────── Page Component ────────────────────────

export default function GalleryDesignStudioPage() {
  const params = useParams();
  const galleryId = params.id as string;
  const [config, dispatch] = useReducer(designReducer, defaultConfig);
  const [draftAge, setDraftAge] = useState<string>("No draft");
  const [activeSection, setActiveSection] = useState<string>("cover");
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DesignConfig | null>(null);
  const [publishStatus, setPublishStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  // Save-as-template state. The Templates section already had a "Save
  // Current" affordance, but it was buried inside a collapsed accordion
  // — users reasonably said "there is no option to save it for later
  // use." Surfacing these controls in the top bar makes saving a reusable
  // template a single click from anywhere on the page. The user clarified
  // that in their vocabulary "theme" == "template" (the Themes section
  // is for the platform-level visual theme — liquid-glass / midnight /
  // etc — and Templates are saved design configurations), so this UI uses
  // "Template" exclusively to match the Templates section below.
  const [showTemplateNameInput, setShowTemplateNameInput] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSaveStatus, setTemplateSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  // Drag-and-drop state for the Cover Photo zone. The right-side preview
  // grid is the drag source; the cover drop zone here is the only target.
  // Carrying the asset id through dataTransfer (rather than React-level
  // state) keeps the operation tolerant of accidental re-renders mid-drag.
  const COVER_DRAG_MIME = "application/x-rawdrive-asset-id";
  const [isCoverDragOver, setIsCoverDragOver] = useState(false);
  const { getSavedDraft, discard } = useDraftPersistence(galleryId, config);

  // Fetch gallery assets for preview
  const [previewAssets, setPreviewAssets] = useState<Asset[]>([]);
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await listGalleryAssets(token, galleryId);
        const hydrated = await Promise.all(
          entries.slice(0, 12).map(async (e) => {
            try { return await getAsset(token, e.asset_id); } catch { return null; }
          })
        );
        if (!cancelled) setPreviewAssets(hydrated.filter((a): a is Asset => a !== null));
      } catch { /* preview is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [galleryId]);

  // Ensure the current heading + body fonts are actually loaded into the
  // document. `loadGoogleFont` is otherwise only called from the Typography
  // section onClick — meaning on first mount the default pairing
  // (Playfair Display / Inter) was selected but Playfair Display was
  // never injected, so the Cover Preview rendered the heading in the
  // browser default serif fallback. This effect closes that gap and also
  // covers the "restore draft" path where typography arrives without a
  // user click.
  useEffect(() => {
    loadGoogleFont(config.typography.headingFont);
    loadGoogleFont(config.typography.bodyFont);
  }, [config.typography.headingFont, config.typography.bodyFont]);

  // Undo/redo
  const history = useDesignHistory(config);

  // GAL-FR-079 — sub-frame latency instrumentation
  const latency = useDesignLatency();

  // Sync history when config changes via dispatch (not undo/redo)
  const lastDispatchRef = useRef(false);
  const pendingLatencyCommitRef = useRef<((label: string) => unknown) | null>(null);
  const pendingLabelRef = useRef<string>("unknown");
  const wrappedDispatch = useCallback(
    (action: DesignAction) => {
      lastDispatchRef.current = true;
      // GAL-FR-079: open a latency sample; finalize on the next animation
      // frame so the measurement covers React commit + paint.
      const commit = latency.begin();
      pendingLatencyCommitRef.current = commit;
      pendingLabelRef.current = action.type.toLowerCase();
      dispatch(action);
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          const c = pendingLatencyCommitRef.current;
          if (c) {
            c(pendingLabelRef.current);
            pendingLatencyCommitRef.current = null;
          }
        });
      }
    },
    [latency]
  );
  useEffect(() => {
    if (lastDispatchRef.current) {
      history.push(config);
      lastDispatchRef.current = false;
    }
  }, [config, history]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); dispatch({ type: "LOAD", payload: history.state }); }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) { e.preventDefault(); history.redo(); dispatch({ type: "LOAD", payload: history.state }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [history]);

  // Check for recoverable draft on mount — show dialog
  useEffect(() => {
    const draft = getSavedDraft();
    if (draft) {
      const age = Date.now() - draft.savedAt;
      if (age < 7 * 24 * 60 * 60 * 1000) {
        setPendingDraft(draft.config);
        setShowRestoreDialog(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update draft age indicator
  useEffect(() => {
    const interval = setInterval(() => {
      const draft = getSavedDraft();
      if (draft) {
        const secs = Math.floor((Date.now() - draft.savedAt) / 1000);
        setDraftAge(secs < 5 ? "Draft saved just now" : secs < 60 ? `Draft saved ${secs}s ago` : `Draft saved ${Math.floor(secs / 60)}m ago`);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [config, getSavedDraft]);

  const handlePublish = async () => {
    setPublishStatus("saving");
    try {
      const token = getStoredAccessToken();
      await updateGalleryDesign(token, galleryId, { ...config, version: config.version + 1 });
      wrappedDispatch({ type: "LOAD", payload: { ...config, version: config.version + 1 } });
      discard();
      setPublishStatus("success");
      setTimeout(() => setPublishStatus("idle"), 2000);
    } catch {
      setPublishStatus("error");
      setTimeout(() => setPublishStatus("idle"), 3000);
    }
  };

  // POSTs the current design to the same template registry the
  // `DesignTemplates` component reads from. Reuses the backend endpoint
  // /api/v1/galleries/templates so saved templates appear in BOTH this
  // gallery's Templates section AND any other gallery's Templates section
  // for the same user — i.e. truly "save for later use" across galleries.
  const handleSaveAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    setTemplateSaveStatus("saving");
    try {
      const token = getStoredAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiBase}/api/v1/galleries/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTemplateSaveStatus("success");
      setTemplateName("");
      setShowTemplateNameInput(false);
      // Open the Templates section so the user immediately sees their new
      // saved template in the list (DesignTemplates refetches on mount,
      // but it's already mounted; opening the section is enough visual
      // confirmation alongside the success state).
      setActiveSection("templates");
      setTimeout(() => setTemplateSaveStatus("idle"), 2500);
    } catch {
      setTemplateSaveStatus("error");
      setTimeout(() => setTemplateSaveStatus("idle"), 3000);
    }
  };

  const handleSectionReset = (section: string) => {
    if (resetConfirm === section) {
      wrappedDispatch({ type: "RESET_SECTION", section });
      setResetConfirm(null);
    } else {
      setResetConfirm(section);
      setTimeout(() => setResetConfirm(null), 3000);
    }
  };

  // Functional-form toggle keeps the handler reference stable across
  // renders so React doesn't have to recompute Section's render path
  // even when activeSection changes. Pairs with the module-scope
  // Section component to keep input focus across keystrokes.
  const handleSectionToggle = useCallback((id: string) => {
    setActiveSection((current) => (current === id ? "" : id));
  }, []);

  return (
    <div className="h-dvh flex flex-col bg-surface-base text-text-primary">
      {/* Restore Draft Dialog */}
      {showRestoreDialog && pendingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim">
          <div className="glass-card p-6 max-w-sm mx-4 space-y-4">
            <h2 className="text-lg font-semibold">Restore Draft?</h2>
            <p className="text-sm text-text-secondary">An unsaved draft was found for this gallery. Would you like to restore it or start fresh?</p>
            <div className="flex gap-2">
              <button onClick={() => { dispatch({ type: "LOAD", payload: pendingDraft }); setShowRestoreDialog(false); }} className="flex-1 py-2 text-sm rounded-xl bg-accent-default text-text-inverse">Restore Draft</button>
              <button onClick={() => { discard(); setShowRestoreDialog(false); }} className="flex-1 py-2 text-sm rounded-xl border border-border-default text-text-secondary">Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border-subtle backdrop-blur-md bg-surface-overlay">
        <div className="flex items-center gap-3">
          <a
            href={`/galleries/${galleryId}`}
            className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back
          </a>
          <h1 className="text-lg font-semibold">Gallery Design Studio</h1>
          <span className="text-xs text-text-tertiary">{draftAge}</span>
          {history.canUndo && <span className="text-xs text-text-tertiary">· {history.historySize} changes</span>}
          {latency.stats.count > 0 && (
            <span
              className="text-xs font-mono"
              title={`p50 ${latency.stats.p50Ms.toFixed(1)}ms, max ${latency.stats.maxMs.toFixed(1)}ms, ${latency.stats.overBudgetCount}/${latency.stats.count} over ${LATENCY_BUDGET_MS}ms`}
              data-testid="design-latency-badge"
              style={{
                color:
                  latency.stats.p95Ms <= LATENCY_BUDGET_MS
                    ? "var(--feedback-success)"
                    : latency.stats.p95Ms <= LATENCY_BUDGET_MS * 2
                    ? "var(--feedback-warning)"
                    : "var(--feedback-error)",
              }}
            >
              · p95 {latency.stats.p95Ms.toFixed(1)}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => { history.undo(); dispatch({ type: "LOAD", payload: history.state }); }} disabled={!history.canUndo} className="hidden sm:inline-flex px-2 py-1.5 text-xs rounded-lg border border-border-subtle disabled:opacity-30" title="Undo (Ctrl+Z)">↩</button>
          <button onClick={() => { history.redo(); dispatch({ type: "LOAD", payload: history.state }); }} disabled={!history.canRedo} className="hidden sm:inline-flex px-2 py-1.5 text-xs rounded-lg border border-border-subtle disabled:opacity-30" title="Redo (Ctrl+Shift+Z)">↪</button>
          <button onClick={() => { wrappedDispatch({ type: "RESET" }); discard(); }} className="px-4 py-2 text-sm rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-container-low transition-colors min-h-[44px]">Discard All</button>

          {/* Save as Template — opens an inline name input. When submitted,
              POSTs to /api/v1/galleries/templates so the design becomes a
              reusable template available in the Templates section of any
              gallery the user owns. */}
          {showTemplateNameInput ? (
            // Earlier revision used a compact inline row (text-xs Save, no
            // input focus ring, transparent input bg) which read as either
            // disabled-looking or invisible against the header chrome —
            // users said "not able to save" because the Save button blended
            // into the surrounding surface. This rebuild gives the input a
            // proper bordered, focus-ringed appearance, makes the Save
            // button the same visual class as the primary "Save Design"
            // button (just slightly smaller), and bumps font sizes so
            // labels are legible.
            <div className="flex items-center gap-2 bg-surface-elevated border border-border-default rounded-xl px-2 py-1 shadow-sm min-h-[44px]">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveAsTemplate();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setShowTemplateNameInput(false);
                    setTemplateName("");
                  }
                }}
                autoFocus
                placeholder="Template name…"
                maxLength={60}
                className="px-3 py-2 text-sm rounded-lg bg-surface-container border border-border-subtle focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 focus:outline-none w-48 transition-colors"
                aria-label="Template name"
              />
              <button
                onClick={handleSaveAsTemplate}
                disabled={!templateName.trim() || templateSaveStatus === "saving"}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-accent-default text-text-inverse hover:bg-accent-hover disabled:bg-surface-container-high disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors min-h-[36px] whitespace-nowrap"
              >
                {templateSaveStatus === "saving" ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => {
                  setShowTemplateNameInput(false);
                  setTemplateName("");
                }}
                className="px-3 py-2 text-sm rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-container transition-colors min-h-[36px]"
                aria-label="Cancel save as template"
                title="Cancel (Esc)"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTemplateNameInput(true)}
              className={`px-4 py-2 text-sm rounded-xl border border-border-default transition-all min-h-[44px] ${
                templateSaveStatus === "success"
                  ? "bg-feedback-success/15 text-feedback-success border-feedback-success/40"
                  : templateSaveStatus === "error"
                  ? "bg-feedback-error/15 text-feedback-error border-feedback-error/40"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-container-low"
              }`}
              title="Save current design as a reusable template"
            >
              {templateSaveStatus === "success"
                ? "Template saved ✓"
                : templateSaveStatus === "error"
                ? "Save failed — retry"
                : "Save as Template"}
            </button>
          )}

          {/* Save — persists the design to this gallery via the
              /galleries/:id/design endpoint. Previously labelled "Publish"
              which read as "make public" rather than "save my edits"; the
              endpoint is purely a save. Renamed for clarity. */}
          <button
            onClick={handlePublish}
            disabled={publishStatus === "saving"}
            className={`shrink-0 px-6 py-2 text-sm font-medium rounded-xl transition-all min-h-[44px] ${
              publishStatus === "success"
                ? "bg-feedback-success text-text-inverse"
                : publishStatus === "error"
                ? "bg-feedback-error text-text-inverse"
                : "bg-accent-default text-text-inverse hover:bg-accent-hover"
            }`}
            title="Save the design changes to this gallery"
          >
            {publishStatus === "saving"
              ? "Saving…"
              : publishStatus === "success"
              ? "Saved!"
              : publishStatus === "error"
              ? "Failed — Retry"
              : "Save Design"}
          </button>
        </div>
      </header>

      {/* Split Screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Controls */}
        <aside className="w-[40%] border-r border-border-subtle overflow-y-auto bg-surface-elevated">
          {/* Cover Photo */}
          <Section
            id="cover"
            title="Cover Photo"
            isOpen={activeSection === "cover"}
            isResetConfirming={resetConfirm === "cover"}
            onToggle={handleSectionToggle}
            onReset={handleSectionReset}
          >
            <div
              // Drop target for asset tiles dragged from the right-side
              // preview grid. dragover MUST preventDefault, otherwise the
              // browser cancels the drop event entirely (HTML5 DnD spec).
              // Visual ring/scale signals the drop-zone is hot. Focal-point
              // dot inside uses onMouseDown (a separate event system) and
              // doesn't interfere with drop bubbling.
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(COVER_DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDragEnter={(e) => {
                if (!e.dataTransfer.types.includes(COVER_DRAG_MIME)) return;
                e.preventDefault();
                setIsCoverDragOver(true);
              }}
              onDragLeave={() => setIsCoverDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsCoverDragOver(false);
                const assetId = e.dataTransfer.getData(COVER_DRAG_MIME);
                if (assetId) {
                  wrappedDispatch({ type: "SET_COVER", payload: { assetId } });
                }
              }}
              className={cn(
                "aspect-video rounded-xl bg-surface-container border flex items-center justify-center relative overflow-hidden transition-all",
                isCoverDragOver
                  ? "border-accent-primary ring-2 ring-accent-primary/40 bg-accent-subtle/30"
                  : "border-border-subtle",
              )}
            >
              {/* If a cover asset is already selected, render a thumbnail so
                  the user gets feedback that the drop succeeded. The
                  /storage/* proxy needs the JWT for derivatives/ paths, but
                  thumbnails/* keys (our default WebP shape) are public. */}
              {config.cover.assetId ? (() => {
                const coverAsset = previewAssets.find((a) => a.id === config.cover.assetId);
                if (!coverAsset) return null;
                const url = getAssetPreviewUrl(coverAsset, getStoredAccessToken());
                return url ? (
                  <img
                    src={url}
                    alt={coverAsset.filename || "Cover preview"}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                ) : null;
              })() : (
                <div className="text-center text-text-tertiary pointer-events-none">
                  <p className="text-sm">Drag cover image here</p>
                  <p className="text-xs mt-1">or select from gallery</p>
                </div>
              )}
              <div
                className="absolute w-6 h-6 border-2 border-accent-primary rounded-full cursor-move bg-surface/30 backdrop-blur-sm"
                style={{ left: `${config.cover.focalPoint.x}%`, top: `${config.cover.focalPoint.y}%`, transform: "translate(-50%, -50%)" }}
                onMouseDown={(e) => {
                  const rect = (e.target as HTMLElement).parentElement!.getBoundingClientRect();
                  const onMove = (ev: MouseEvent) => {
                    const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
                    const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
                    wrappedDispatch({ type: "SET_COVER", payload: { focalPoint: { x: Math.round(x), y: Math.round(y) } } });
                  };
                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
            </div>
            <p className="text-xs text-text-tertiary mt-1">Focal: {config.cover.focalPoint.x}%, {config.cover.focalPoint.y}%</p>

            {/* Title / Subtitle inputs — feed both the main Cover Preview
                and every CoverStyleMiniPreview so the user sees their own
                heading rendered in their chosen typography pairing instead
                of a placeholder. Updated through the same SET_COVER reducer
                action, so undo/redo + draft persistence work for free. */}
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="text-xs text-text-secondary block mb-1">Title</span>
                <input
                  type="text"
                  value={config.cover.title}
                  onChange={(e) =>
                    wrappedDispatch({ type: "SET_COVER", payload: { title: e.target.value } })
                  }
                  placeholder="Your Gallery Title"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container border border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-sm transition-colors"
                  maxLength={80}
                  aria-label="Cover title"
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-secondary block mb-1">Subtitle</span>
                <input
                  type="text"
                  value={config.cover.subtitle}
                  onChange={(e) =>
                    wrappedDispatch({ type: "SET_COVER", payload: { subtitle: e.target.value } })
                  }
                  placeholder="A short subtitle"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container border border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-sm transition-colors"
                  maxLength={120}
                  aria-label="Cover subtitle"
                />
              </label>
            </div>

            {(() => {
              // Use the first loaded gallery asset as the sample backdrop
              // for every style preview. With a real photo behind each
              // mini-preview, the overlay layers ("Hero Overlay" gradient,
              // "Cinematic Dark" wash, "Elegant Vignette" radial fade) and
              // the objectPosition crops are visible at a glance. Falls
              // back to the gradient placeholder when previewAssets is
              // empty (gallery still loading).
              const sampleUrl = previewAssets[0]
                ? getAssetPreviewUrl(previewAssets[0], getStoredAccessToken())
                : undefined;
              return COVER_CATEGORIES.map((cat) => (
                <div key={cat} className="mt-3">
                  <p className="text-xs text-text-secondary capitalize mb-1.5">{cat}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {COVER_STYLES.filter((s) => s.category === cat).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => wrappedDispatch({ type: "SET_COVER", payload: { styleId: s.id } })}
                        className={`min-h-[88px] rounded-lg border overflow-hidden transition-all ${
                          config.cover.styleId === s.id
                            ? "border-accent-primary bg-accent-subtle ring-2 ring-accent-primary"
                            : "border-border-subtle bg-surface-container hover:border-border-default hover:bg-surface-container-high"
                        }`}
                        aria-label={`Cover style: ${s.name}`}
                        aria-pressed={config.cover.styleId === s.id}
                        title={`${s.name} — ${s.aspectRatio} aspect, ${s.textAlign}-aligned title`}
                      >
                        <CoverStyleMiniPreview
                          style={s}
                          sampleUrl={sampleUrl}
                          titleText={config.cover.title}
                          headingFont={config.typography.headingFont}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </Section>

          {/* Theme */}
          <Section
            id="theme"
            title="Theme"
            isOpen={activeSection === "theme"}
            isResetConfirming={resetConfirm === "theme"}
            onToggle={handleSectionToggle}
            onReset={handleSectionReset}
          >
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => wrappedDispatch({ type: "SET_THEME", payload: { id: t.id, accentColor: t.accent } })} className={`p-2 rounded-xl text-center text-xs transition-all ${config.theme.id === t.id ? "ring-2 ring-accent-primary bg-accent-subtle" : "bg-surface-container hover:bg-surface-container-high"}`}>
                  <div className="w-6 h-6 rounded-full mx-auto mb-1" style={{ backgroundColor: t.accent }} />
                  {t.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              {(["light", "dark", "auto"] as const).map((v) => (
                <button key={v} onClick={() => wrappedDispatch({ type: "SET_THEME", payload: { variant: v } })} className={`flex-1 py-1.5 text-xs rounded-lg capitalize transition-all ${config.theme.variant === v ? "bg-accent-subtle text-accent-primary" : "bg-surface-container text-text-tertiary hover:bg-surface-container-high"}`}>
                  {v}
                </button>
              ))}
            </div>
          </Section>

          {/* Typography */}
          <Section
            id="typography"
            title="Typography"
            isOpen={activeSection === "typography"}
            isResetConfirming={resetConfirm === "typography"}
            onToggle={handleSectionToggle}
            onReset={handleSectionReset}
          >
            <div className="space-y-2">
              {FONT_PAIRINGS.map((fp) => {
                // Eagerly load each pairing's fonts so the button labels
                // render in the actual font face the pairing represents.
                // Previously the label "Playfair Display" appeared in the
                // default system font — the user had to click the button
                // before they could see what Playfair Display looked like.
                if (typeof window !== "undefined") {
                  loadGoogleFont(fp.heading);
                  loadGoogleFont(fp.body);
                }
                const isSerif = /Playfair|Cormorant|Lora|Garamond|EB Garamond|Merriweather/i.test(fp.heading);
                const headingStack = `'${fp.heading}', ${isSerif ? "Georgia, serif" : "Inter, system-ui, sans-serif"}`;
                const bodyStack = `'${fp.body}', Inter, system-ui, sans-serif`;
                return (
                  <button
                    key={fp.id}
                    onClick={() => {
                      loadGoogleFont(fp.heading);
                      loadGoogleFont(fp.body);
                      wrappedDispatch({
                        type: "SET_TYPOGRAPHY",
                        payload: { pairingId: fp.id, headingFont: fp.heading, bodyFont: fp.body },
                      });
                    }}
                    className={`w-full p-3 rounded-xl text-left transition-all ${
                      config.typography.pairingId === fp.id
                        ? "ring-2 ring-accent-primary bg-accent-subtle"
                        : "bg-surface-container hover:bg-surface-container-high"
                    }`}
                    aria-pressed={config.typography.pairingId === fp.id}
                  >
                    <p className="text-xl font-bold leading-tight" style={{ fontFamily: headingStack }}>
                      {fp.heading}
                    </p>
                    <p className="text-xs mt-1" style={{ fontFamily: bodyStack }}>
                      <span className="text-text-secondary">{fp.body}</span>
                      <span className="text-text-tertiary"> — {fp.label}</span>
                    </p>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Grid Layout */}
          <Section
            id="grid"
            title="Grid Layout"
            isOpen={activeSection === "grid"}
            isResetConfirming={resetConfirm === "grid"}
            onToggle={handleSectionToggle}
            onReset={handleSectionReset}
          >
            <div className="grid grid-cols-4 gap-2">
              {GRID_LAYOUTS.map((gl) => (
                <button
                  key={gl.id}
                  onClick={() => wrappedDispatch({ type: "SET_GRID", payload: { layout: gl.id } })}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center gap-1 text-center text-xs transition-all ${
                    config.grid.layout === gl.id
                      ? "bg-accent-subtle text-accent-primary ring-1 ring-accent-primary"
                      : "bg-surface-container text-text-secondary hover:bg-surface-container-high"
                  }`}
                  aria-label={`Grid layout: ${gl.label}`}
                  aria-pressed={config.grid.layout === gl.id}
                  title={`${gl.label} layout`}
                >
                  <LayoutMiniPreview kind={gl.id} />
                  <p className="leading-none">{gl.label}</p>
                </button>
              ))}
            </div>
            <div className="space-y-2 mt-3">
              <label className="flex items-center justify-between text-xs">
                <span>Columns: {config.grid.columns}</span>
                <input type="range" min={1} max={6} value={config.grid.columns} onChange={(e) => wrappedDispatch({ type: "SET_GRID", payload: { columns: Number(e.target.value) } })} className="w-32 accent-[var(--accent-primary)]" aria-label="Grid columns" />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Gap: {config.grid.gap}px</span>
                <input type="range" min={0} max={24} value={config.grid.gap} onChange={(e) => wrappedDispatch({ type: "SET_GRID", payload: { gap: Number(e.target.value) } })} className="w-32 accent-[var(--accent-primary)]" aria-label="Grid gap" />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Show photo info</span>
                <input type="checkbox" checked={config.grid.showInfo} onChange={(e) => wrappedDispatch({ type: "SET_GRID", payload: { showInfo: e.target.checked } })} className="accent-[var(--accent-primary)]" />
              </label>
            </div>
          </Section>

          {/* Templates */}
          <Section
            id="templates"
            title="Templates"
            isOpen={activeSection === "templates"}
            isResetConfirming={resetConfirm === "templates"}
            onToggle={handleSectionToggle}
            onReset={handleSectionReset}
          >
            <DesignTemplates onApply={(tplConfig) => wrappedDispatch({ type: "LOAD", payload: tplConfig as unknown as DesignConfig })} currentConfig={config as unknown as Record<string, unknown>} />
          </Section>

          {/* AI Suggestions */}
          <Section
            id="ai"
            title="AI Suggestions"
            isOpen={activeSection === "ai"}
            isResetConfirming={resetConfirm === "ai"}
            onToggle={handleSectionToggle}
            onReset={handleSectionReset}
          >
            <AIDesignSuggest galleryId={galleryId} onApply={(s) => {
              wrappedDispatch({ type: "SET_THEME", payload: { id: s.theme } });
              wrappedDispatch({ type: "SET_COVER", payload: { styleId: s.coverStyle } });
              const fp = FONT_PAIRINGS.find((f) => f.id === s.fontPairing);
              if (fp) wrappedDispatch({ type: "SET_TYPOGRAPHY", payload: { pairingId: fp.id, headingFont: fp.heading, bodyFont: fp.body } });
            }} />
          </Section>
        </aside>

        {/* Right Panel — Live Preview */}
        <main className="flex-1 overflow-y-auto bg-surface-sunken p-8">
          {/* Responsive preview controls */}
          <div className="flex justify-center gap-2 mb-4">
            {(["desktop", "tablet", "mobile"] as const).map((d) => (
              <button key={d} onClick={() => setPreviewDevice(d)} className={`px-3 py-1.5 text-xs rounded-lg capitalize ${previewDevice === d ? "bg-accent-subtle text-accent-primary" : "bg-surface-container text-text-tertiary"}`}>
                {d === "desktop" ? "🖥" : d === "tablet" ? "📱" : "📲"} {d}
              </button>
            ))}
          </div>

          <div className="mx-auto transition-all duration-300" style={{ maxWidth: PREVIEW_WIDTHS[previewDevice] }}>
            {/* Cover Preview — now reflects the full CoverStyle contract
                (aspectRatio, objectPosition, overlay, textAlign). Prior to
                this, the container hardcoded aspect-[21/9] and the <img>
                used object-cover/center, so swapping the cover style only
                changed the overlay gradient — every other style attribute
                in cover-styles.ts was dead UI state. */}
            {(() => {
              const style = COVER_STYLES.find((s) => s.id === config.cover.styleId);
              const aspectRatio = style?.aspectRatio || "21/9";
              const objectPosition = style?.objectPosition || "center center";
              const textAlign = style?.textAlign || "center";
              const coverAsset =
                (config.cover.assetId && previewAssets.find((a) => a.id === config.cover.assetId)) ||
                previewAssets[0];
              const coverUrl = coverAsset ? getAssetPreviewUrl(coverAsset, getStoredAccessToken()) : "";
              // Title block uses the chosen heading font with a quoted CSS
              // fallback chain (serif/sans-serif heuristic from the font
              // name) so a font that's still mid-network-fetch falls back
              // to a sensible system face rather than Times New Roman.
              const isSerif = /Playfair|Cormorant|Lora|Garamond|EB Garamond|Merriweather/i.test(
                config.typography.headingFont,
              );
              const headingStack = `'${config.typography.headingFont}', ${isSerif ? "Georgia, serif" : "Inter, system-ui, sans-serif"}`;
              const bodyStack = `'${config.typography.bodyFont}', Inter, system-ui, sans-serif`;
              return (
                <div
                  className="rounded-2xl bg-surface-container border border-border-subtle mb-8 flex relative overflow-hidden transition-all duration-300"
                  style={{ aspectRatio }}
                >
                  {coverUrl && (
                    <img
                      src={coverUrl}
                      alt="Cover preview"
                      className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
                      style={{ objectPosition }}
                    />
                  )}
                  {style?.overlay && (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: style.overlay }} />
                  )}
                  {/* Title + subtitle overlay. Positioning uses the style's
                      textAlign so Editorial Left puts copy on the left,
                      etc. The container uses flex-end so text sits in the
                      lower band of the cover — the conventional location
                      for hero-style gallery titles. */}
                  <div
                    className={cn(
                      "relative z-10 w-full h-full flex flex-col justify-end p-6 sm:p-10",
                      textAlign === "left" && "items-start text-left",
                      textAlign === "right" && "items-end text-right",
                      textAlign === "center" && "items-center text-center",
                    )}
                  >
                    {config.cover.title && (
                      <h1
                        className="text-white text-3xl sm:text-5xl font-bold leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] max-w-[80%]"
                        style={{ fontFamily: headingStack }}
                      >
                        {config.cover.title}
                      </h1>
                    )}
                    {config.cover.subtitle && (
                      <p
                        className="text-white/90 text-sm sm:text-base mt-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] max-w-[70%]"
                        style={{ fontFamily: bodyStack }}
                      >
                        {config.cover.subtitle}
                      </p>
                    )}
                  </div>
                  {!coverUrl && (
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-surface/70 backdrop-blur-sm text-text-tertiary text-[10px] uppercase tracking-wide">
                      {style?.name || config.cover.styleId}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Gallery Grid Preview — implements four distinct layout modes
                so the Grid Layout buttons on the left actually visibly
                change the preview. Prior to this each mode rendered the
                same uniform CSS grid; only `columns` and `gap` were wired.
                The user reasonably read "click does nothing" as a bug.

                  - grid     : uniform square tiles, CSS Grid columns
                  - masonry  : CSS column-count packs tiles top-to-bottom,
                               natural aspect preserved per tile (uses the
                               i%3 aspect ratio rotation for variety)
                               since we are previewing repeated assets)
                  - justified: flex-wrap rows where each tile's flex-grow
                               equals its aspect ratio, approximating
                               Flickr-style justified rows without
                               measuring natural image dimensions (the
                               preview cycles through the same N assets, so
                               we use the rotation as a stand-in)
                  - carousel : single-row horizontal scroll, columns count
                               controls tile width (more cols = smaller)

                Tile content (image + optional info row + drag wiring) is
                identical across modes; only the wrapping container and
                per-tile style differs. */}
            {(() => {
              const tileCount = Math.max(previewAssets.length, 12);
              const responsiveColumns = previewDevice === "mobile" ? Math.min(config.grid.columns, 1)
                : previewDevice === "tablet" ? Math.min(config.grid.columns, 2)
                : config.grid.columns;
              // Synthetic aspect ratio so masonry/justified actually LOOK
              // like masonry/justified when the preview cycles the same
              // small asset list. With real galleries (varied natural
              // aspect ratios) you'd swap this for asset.width/height.
              const tileAspect = (i: number) => i % 3 === 0 ? "3/4" : i % 3 === 1 ? "4/3" : "1/1";
              const aspectAsRatio = (i: number) => {
                const r = tileAspect(i);
                const [w, h] = r.split("/").map(Number);
                return w / h;
              };
              const renderTileContent = (i: number, asset: Asset | undefined, previewUrl: string) => (
                <>
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={asset?.filename || ""}
                      className="w-full h-full object-cover pointer-events-none"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-surface-container to-surface-container-high" />
                  )}
                  {config.grid.showInfo && <div className="p-2"><p className="text-[10px] text-text-tertiary">{asset?.filename || `IMG_${1000 + i}.jpg`}</p></div>}
                </>
              );
              const dragProps = (asset: Asset | undefined) => ({
                draggable: !!asset,
                onDragStart: (e: React.DragEvent) => {
                  if (!asset) return;
                  e.dataTransfer.setData(COVER_DRAG_MIME, asset.id);
                  e.dataTransfer.effectAllowed = "copy";
                },
                title: asset ? "Drag onto the Cover Photo zone to set as cover" : undefined,
              });

              const tiles = Array.from({ length: tileCount }).map((_, i) => ({
                i,
                asset: previewAssets.length > 0 ? previewAssets[i % previewAssets.length] : undefined,
              })).map(({ i, asset }) => ({
                i,
                asset,
                previewUrl: asset ? getAssetPreviewUrl(asset, getStoredAccessToken()) : "",
              }));

              if (config.grid.layout === "carousel") {
                // Tile width derived from responsiveColumns — more columns
                // means more tiles visible at once (smaller each). 24px
                // accounts for the outer padding so the math fits the
                // visible viewport.
                const tileWidthPercent = 100 / Math.max(responsiveColumns, 1);
                return (
                  <div
                    className="flex overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-thin"
                    style={{ gap: `${config.grid.gap}px` }}
                    aria-label="Carousel layout preview"
                  >
                    {tiles.map(({ i, asset, previewUrl }) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-xl bg-surface-container border border-border-subtle overflow-hidden flex-shrink-0 snap-start",
                          asset && "cursor-grab active:cursor-grabbing transition-transform active:scale-95",
                        )}
                        style={{
                          width: `calc(${tileWidthPercent}% - ${config.grid.gap}px)`,
                          aspectRatio: tileAspect(i),
                        }}
                        {...dragProps(asset)}
                      >
                        {renderTileContent(i, asset, previewUrl)}
                      </div>
                    ))}
                  </div>
                );
              }

              if (config.grid.layout === "masonry") {
                return (
                  <div
                    style={{
                      columnCount: responsiveColumns,
                      columnGap: `${config.grid.gap}px`,
                    }}
                    aria-label="Masonry layout preview"
                  >
                    {tiles.map(({ i, asset, previewUrl }) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-xl bg-surface-container border border-border-subtle overflow-hidden break-inside-avoid",
                          asset && "cursor-grab active:cursor-grabbing transition-transform active:scale-95",
                        )}
                        style={{
                          marginBottom: `${config.grid.gap}px`,
                          aspectRatio: tileAspect(i),
                        }}
                        {...dragProps(asset)}
                      >
                        {renderTileContent(i, asset, previewUrl)}
                      </div>
                    ))}
                  </div>
                );
              }

              if (config.grid.layout === "justified") {
                // Approximation of Flickr-style justified rows. Each tile
                // gets a flex-basis proportional to its aspect ratio and a
                // fixed height target so rows fill the row width without
                // cropping. Real justified layouts require row-height
                // measurement; this is the cleanest CSS-only approximation
                // for the preview pane.
                const rowHeight = 180;
                return (
                  <div
                    className="flex flex-wrap"
                    style={{ gap: `${config.grid.gap}px` }}
                    aria-label="Justified layout preview"
                  >
                    {tiles.map(({ i, asset, previewUrl }) => {
                      const ratio = aspectAsRatio(i);
                      return (
                        <div
                          key={i}
                          className={cn(
                            "rounded-xl bg-surface-container border border-border-subtle overflow-hidden",
                            asset && "cursor-grab active:cursor-grabbing transition-transform active:scale-95",
                          )}
                          style={{
                            height: `${rowHeight}px`,
                            flexGrow: ratio,
                            flexBasis: `${rowHeight * ratio}px`,
                          }}
                          {...dragProps(asset)}
                        >
                          {renderTileContent(i, asset, previewUrl)}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // Default: uniform grid. All tiles forced to 1:1 so the mode
              // is visually distinct from masonry (which keeps natural
              // aspect). Earlier versions varied aspect even in "grid"
              // mode which made grid look the same as masonry.
              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${responsiveColumns}, 1fr)`,
                    gap: `${config.grid.gap}px`,
                  }}
                  aria-label="Grid layout preview"
                >
                  {tiles.map(({ i, asset, previewUrl }) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl bg-surface-container border border-border-subtle overflow-hidden",
                        asset && "cursor-grab active:cursor-grabbing transition-transform active:scale-95",
                      )}
                      style={{ aspectRatio: "1/1" }}
                      {...dragProps(asset)}
                    >
                      {renderTileContent(i, asset, previewUrl)}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </main>
      </div>
    </div>
  );
}

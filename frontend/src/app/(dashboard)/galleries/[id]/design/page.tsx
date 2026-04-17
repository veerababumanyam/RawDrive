"use client";

import { useState, useReducer, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { COVER_STYLES, COVER_CATEGORIES } from "@/components/gallery/cover-styles";
import { DesignTemplates } from "@/components/gallery/design-templates";
import { AIDesignSuggest } from "@/components/gallery/ai-design-suggest";
import { useDesignHistory } from "@/hooks/use-design-history";
import { useDesignLatency, LATENCY_BUDGET_MS } from "@/hooks/use-design-latency";
import { getStoredAccessToken } from "@/lib/auth";
import { listGalleryAssets, updateGalleryDesign } from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";

// ──────────────────────── Types ────────────────────────

interface DesignConfig {
  theme: { id: string; variant: "light" | "dark" | "auto"; accentColor: string };
  cover: { assetId: string | null; styleId: string; focalPoint: { x: number; y: number } };
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
  cover: { assetId: null, styleId: "classic-full", focalPoint: { x: 50, y: 50 } },
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
  { id: "masonry", label: "Masonry", icon: "⊞" },
  { id: "grid", label: "Grid", icon: "⊟" },
  { id: "justified", label: "Justified", icon: "☰" },
  { id: "carousel", label: "Carousel", icon: "◀▶" },
] as const;

type PreviewDevice = "desktop" | "tablet" | "mobile";
const PREVIEW_WIDTHS: Record<PreviewDevice, string> = { desktop: "100%", tablet: "768px", mobile: "375px" };

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

  const handleSectionReset = (section: string) => {
    if (resetConfirm === section) {
      wrappedDispatch({ type: "RESET_SECTION", section });
      setResetConfirm(null);
    } else {
      setResetConfirm(section);
      setTimeout(() => setResetConfirm(null), 3000);
    }
  };

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-b border-border-subtle">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveSection(activeSection === id ? "" : id)}
          className="flex-1 flex items-center justify-between px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-container-low transition-colors"
        >
          {title}
          <span className="text-xs text-text-tertiary">{activeSection === id ? "−" : "+"}</span>
        </button>
        {activeSection === id && (
          <button onClick={() => handleSectionReset(id)} className={`mr-2 text-xs px-2 py-1 rounded ${resetConfirm === id ? "bg-feedback-error text-text-inverse" : "text-text-tertiary hover:text-text-secondary"}`}>
            {resetConfirm === id ? "Confirm Reset" : "Reset"}
          </button>
        )}
      </div>
      {activeSection === id && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );

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
          <button onClick={handlePublish} disabled={publishStatus === "saving"} className={`shrink-0 px-6 py-2 text-sm font-medium rounded-xl transition-all min-h-[44px] ${publishStatus === "success" ? "bg-feedback-success text-text-inverse" : publishStatus === "error" ? "bg-feedback-error text-text-inverse" : "bg-accent-default text-text-inverse hover:bg-accent-hover"}`}>
            {publishStatus === "saving" ? "Publishing..." : publishStatus === "success" ? "Published!" : publishStatus === "error" ? "Failed — Retry" : "Publish"}
          </button>
        </div>
      </header>

      {/* Split Screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Controls */}
        <aside className="w-[40%] border-r border-border-subtle overflow-y-auto bg-surface-elevated">
          {/* Cover Photo */}
          <Section id="cover" title="Cover Photo">
            <div className="aspect-video rounded-xl bg-surface-container border border-border-subtle flex items-center justify-center relative overflow-hidden">
              <div className="text-center text-text-tertiary">
                <p className="text-sm">Drag cover image here</p>
                <p className="text-xs mt-1">or select from gallery</p>
              </div>
              <div
                className="absolute w-6 h-6 border-2 border-accent-primary rounded-full cursor-move"
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
            {COVER_CATEGORIES.map((cat) => (
              <div key={cat} className="mt-2">
                <p className="text-xs text-text-secondary capitalize mb-1">{cat}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {COVER_STYLES.filter((s) => s.category === cat).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => wrappedDispatch({ type: "SET_COVER", payload: { styleId: s.id } })}
                      className={`aspect-[4/3] rounded-lg border text-[9px] flex items-end p-1 transition-all ${
                        config.cover.styleId === s.id ? "border-accent-primary bg-accent-subtle" : "border-border-subtle bg-surface-container hover:border-border-default"
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Section>

          {/* Theme */}
          <Section id="theme" title="Theme">
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
          <Section id="typography" title="Typography">
            <div className="space-y-2">
              {FONT_PAIRINGS.map((fp) => (
                <button key={fp.id} onClick={() => { loadGoogleFont(fp.heading); loadGoogleFont(fp.body); wrappedDispatch({ type: "SET_TYPOGRAPHY", payload: { pairingId: fp.id, headingFont: fp.heading, bodyFont: fp.body } }); }} className={`w-full p-3 rounded-xl text-left transition-all ${config.typography.pairingId === fp.id ? "ring-1 ring-accent-primary bg-accent-subtle" : "bg-surface-container hover:bg-surface-container-high"}`}>
                  <p className="text-sm font-semibold">{fp.heading}</p>
                  <p className="text-xs text-text-tertiary">{fp.body} — {fp.label}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* Grid Layout */}
          <Section id="grid" title="Grid Layout">
            <div className="grid grid-cols-4 gap-2">
              {GRID_LAYOUTS.map((gl) => (
                <button key={gl.id} onClick={() => wrappedDispatch({ type: "SET_GRID", payload: { layout: gl.id } })} className={`py-2 rounded-lg text-center text-xs transition-all ${config.grid.layout === gl.id ? "bg-accent-subtle text-accent-primary ring-1 ring-accent-primary" : "bg-surface-container hover:bg-surface-container-high"}`}>
                  <span className="text-lg">{gl.icon}</span>
                  <p className="mt-0.5">{gl.label}</p>
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
          <Section id="templates" title="Templates">
            <DesignTemplates onApply={(tplConfig) => wrappedDispatch({ type: "LOAD", payload: tplConfig as unknown as DesignConfig })} currentConfig={config as unknown as Record<string, unknown>} />
          </Section>

          {/* AI Suggestions */}
          <Section id="ai" title="AI Suggestions">
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
            {/* Cover Preview */}
            <div className="aspect-[21/9] rounded-2xl bg-surface-container border border-border-subtle mb-8 flex items-center justify-center relative overflow-hidden">
              {previewAssets[0] && (() => {
                const coverUrl = getAssetPreviewUrl(previewAssets[0], getStoredAccessToken());
                return coverUrl ? <img src={coverUrl} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover" /> : null;
              })()}
              {COVER_STYLES.find((s) => s.id === config.cover.styleId)?.overlay && (
                <div className="absolute inset-0" style={{ background: COVER_STYLES.find((s) => s.id === config.cover.styleId)!.overlay }} />
              )}
              <p className="text-text-tertiary text-sm relative z-10">{COVER_STYLES.find((s) => s.id === config.cover.styleId)?.name || config.cover.styleId}</p>
            </div>

            {/* Gallery Grid Preview */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${previewDevice === "mobile" ? Math.min(config.grid.columns, 1) : previewDevice === "tablet" ? Math.min(config.grid.columns, 2) : config.grid.columns}, 1fr)`, gap: `${config.grid.gap}px` }}>
              {Array.from({ length: Math.max(previewAssets.length, 12) }).map((_, i) => {
                const asset = previewAssets[i % previewAssets.length];
                const previewUrl = asset ? getAssetPreviewUrl(asset, getStoredAccessToken()) : "";
                return (
                  <div key={i} className="rounded-xl bg-surface-container border border-border-subtle overflow-hidden" style={{ aspectRatio: i % 3 === 0 ? "3/4" : i % 3 === 1 ? "4/3" : "1/1" }}>
                    {previewUrl ? (
                      <img src={previewUrl} alt={asset?.filename || ""} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-surface-container to-surface-container-high" />
                    )}
                    {config.grid.showInfo && <div className="p-2"><p className="text-[10px] text-text-tertiary">{asset?.filename || `IMG_${1000 + i}.jpg`}</p></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

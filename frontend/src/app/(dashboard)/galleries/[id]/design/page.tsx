"use client";

import { useState, useReducer, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

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
  | { type: "RESET" };

const defaultConfig: DesignConfig = {
  theme: { id: "liquid-glass", variant: "light", accentColor: "" },
  cover: { assetId: null, styleId: "classic-full", focalPoint: { x: 50, y: 50 } },
  typography: { pairingId: "elegant", headingFont: "Playfair Display", bodyFont: "Inter" },
  grid: { layout: "masonry", columns: 3, gap: 8, showInfo: false },
  version: 1,
};

function designReducer(state: DesignConfig, action: DesignAction): DesignConfig {
  switch (action.type) {
    case "SET_THEME": return { ...state, theme: { ...state.theme, ...action.payload } };
    case "SET_COVER": return { ...state, cover: { ...state.cover, ...action.payload } };
    case "SET_TYPOGRAPHY": return { ...state, typography: { ...state.typography, ...action.payload } };
    case "SET_GRID": return { ...state, grid: { ...state.grid, ...action.payload } };
    case "LOAD": return action.payload;
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

// ──────────────────────── Draft Persistence ────────────────────────

function useDraftPersistence(galleryId: string, config: DesignConfig) {
  const key = `rawdrive-design-draft-${galleryId}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ config, savedAt: Date.now() }));
    }, 3000);
    return () => clearTimeout(timer);
  }, [config, key]);

  const restore = useCallback((): DesignConfig | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw).config;
    } catch {
      return null;
    }
  }, [key]);

  const discard = useCallback(() => localStorage.removeItem(key), [key]);

  return { restore, discard };
}

// ──────────────────────── Page Component ────────────────────────

export default function GalleryDesignStudioPage() {
  const params = useParams();
  const galleryId = params.id as string;
  const [config, dispatch] = useReducer(designReducer, defaultConfig);
  const [draftAge, setDraftAge] = useState<string>("Draft saved just now");
  const [activeSection, setActiveSection] = useState<string>("cover");
  const { restore, discard } = useDraftPersistence(galleryId, config);

  // Check for recoverable draft on mount
  useEffect(() => {
    const draft = restore();
    if (draft) {
      dispatch({ type: "LOAD", payload: draft });
    }
  }, [restore]);

  // Update draft age indicator
  useEffect(() => {
    const interval = setInterval(() => setDraftAge("Draft saved 3s ago"), 3000);
    return () => clearInterval(interval);
  }, [config]);

  const handlePublish = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8229";
      await fetch(`${apiUrl}/api/v1/galleries/${galleryId}/design`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      discard();
    } catch (err) {
      console.error("Publish failed:", err);
    }
  };

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-b border-white/5">
      <button
        onClick={() => setActiveSection(activeSection === id ? "" : id)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-on-surface hover:bg-white/5 transition-colors"
      >
        {title}
        <span className="text-xs text-on-surface-variant">{activeSection === id ? "−" : "+"}</span>
      </button>
      {activeSection === id && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-surface text-on-surface">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 backdrop-blur-md bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold font-headline">Gallery Design Studio</h1>
          <span className="text-xs text-on-surface-variant">{draftAge}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { dispatch({ type: "RESET" }); discard(); }}
            className="px-4 py-2 text-sm rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handlePublish}
            className="px-6 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary shadow-lg hover:shadow-primary/20 transition-all"
          >
            Publish
          </button>
        </div>
      </header>

      {/* Split Screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Controls */}
        <aside className="w-[40%] border-r border-white/5 overflow-y-auto backdrop-blur-md bg-white/[0.02]">
          {/* Cover Photo */}
          <Section id="cover" title="Cover Photo">
            <div className="aspect-video rounded-xl bg-surface-container border border-white/10 flex items-center justify-center relative overflow-hidden">
              <div className="text-center text-on-surface-variant">
                <p className="text-sm">Drag cover image here</p>
                <p className="text-xs mt-1">or select from gallery</p>
              </div>
              {/* Focal point crosshair */}
              <div
                className="absolute w-6 h-6 border-2 border-primary rounded-full cursor-move"
                style={{ left: `${config.cover.focalPoint.x}%`, top: `${config.cover.focalPoint.y}%`, transform: "translate(-50%, -50%)" }}
              />
            </div>
            <div className="grid grid-cols-6 gap-1.5 mt-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => dispatch({ type: "SET_COVER", payload: { styleId: `style-${i + 1}` } })}
                  className={`aspect-[4/3] rounded-lg border transition-all ${
                    config.cover.styleId === `style-${i + 1}` ? "border-primary bg-primary/10" : "border-white/10 bg-surface-container hover:border-white/20"
                  }`}
                />
              ))}
            </div>
          </Section>

          {/* Theme */}
          <Section id="theme" title="Theme">
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => dispatch({ type: "SET_THEME", payload: { id: t.id, accentColor: t.accent } })}
                  className={`p-2 rounded-xl text-center text-xs transition-all ${
                    config.theme.id === t.id ? "ring-2 ring-primary bg-white/10" : "bg-surface-container hover:bg-white/5"
                  }`}
                >
                  <div className="w-6 h-6 rounded-full mx-auto mb-1" style={{ backgroundColor: t.accent }} />
                  {t.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              {(["light", "dark", "auto"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => dispatch({ type: "SET_THEME", payload: { variant: v } })}
                  className={`flex-1 py-1.5 text-xs rounded-lg capitalize transition-all ${
                    config.theme.variant === v ? "bg-primary/20 text-primary" : "bg-surface-container text-on-surface-variant hover:bg-white/5"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </Section>

          {/* Typography */}
          <Section id="typography" title="Typography">
            <div className="space-y-2">
              {FONT_PAIRINGS.map((fp) => (
                <button
                  key={fp.id}
                  onClick={() => dispatch({ type: "SET_TYPOGRAPHY", payload: { pairingId: fp.id, headingFont: fp.heading, bodyFont: fp.body } })}
                  className={`w-full p-3 rounded-xl text-left transition-all ${
                    config.typography.pairingId === fp.id ? "ring-1 ring-primary bg-white/10" : "bg-surface-container hover:bg-white/5"
                  }`}
                >
                  <p className="text-sm font-semibold">{fp.heading}</p>
                  <p className="text-xs text-on-surface-variant">{fp.body} — {fp.label}</p>
                </button>
              ))}
            </div>
          </Section>

          {/* Grid Layout */}
          <Section id="grid" title="Grid Layout">
            <div className="grid grid-cols-4 gap-2">
              {GRID_LAYOUTS.map((gl) => (
                <button
                  key={gl.id}
                  onClick={() => dispatch({ type: "SET_GRID", payload: { layout: gl.id } })}
                  className={`py-2 rounded-lg text-center text-xs transition-all ${
                    config.grid.layout === gl.id ? "bg-primary/20 text-primary ring-1 ring-primary" : "bg-surface-container hover:bg-white/5"
                  }`}
                >
                  <span className="text-lg">{gl.icon}</span>
                  <p className="mt-0.5">{gl.label}</p>
                </button>
              ))}
            </div>
            <div className="space-y-2 mt-3">
              <label className="flex items-center justify-between text-xs">
                <span>Columns: {config.grid.columns}</span>
                <input
                  type="range" min={1} max={6} value={config.grid.columns}
                  onChange={(e) => dispatch({ type: "SET_GRID", payload: { columns: Number(e.target.value) } })}
                  className="w-32 accent-primary"
                />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Gap: {config.grid.gap}px</span>
                <input
                  type="range" min={0} max={24} value={config.grid.gap}
                  onChange={(e) => dispatch({ type: "SET_GRID", payload: { gap: Number(e.target.value) } })}
                  className="w-32 accent-primary"
                />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Show photo info</span>
                <input
                  type="checkbox" checked={config.grid.showInfo}
                  onChange={(e) => dispatch({ type: "SET_GRID", payload: { showInfo: e.target.checked } })}
                  className="accent-primary"
                />
              </label>
            </div>
          </Section>
        </aside>

        {/* Right Panel — Live Preview */}
        <main className="flex-1 overflow-y-auto bg-surface-container-low p-8">
          <div className="max-w-4xl mx-auto">
            {/* Cover Preview */}
            <div className="aspect-[21/9] rounded-2xl bg-surface-container border border-white/5 mb-8 flex items-center justify-center">
              <p className="text-on-surface-variant text-sm">Cover preview — {config.cover.styleId}</p>
            </div>

            {/* Gallery Grid Preview */}
            <div
              className="gap-3"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${config.grid.columns}, 1fr)`,
                gap: `${config.grid.gap}px`,
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-surface-container border border-white/5 overflow-hidden"
                  style={{ aspectRatio: i % 3 === 0 ? "3/4" : i % 3 === 1 ? "4/3" : "1/1" }}
                >
                  <div className="w-full h-full bg-gradient-to-br from-surface-container to-surface-container-high" />
                  {config.grid.showInfo && (
                    <div className="p-2">
                      <p className="text-[10px] text-on-surface-variant">IMG_{1000 + i}.jpg</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

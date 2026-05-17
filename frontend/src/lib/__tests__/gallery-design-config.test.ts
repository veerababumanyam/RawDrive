import { describe, expect, it } from "vitest";
import { readPublicCoverThumbnails, readPublicDesignConfig } from "../gallery-design-config";

describe("readPublicDesignConfig", () => {
  it("returns null when settings has no design_config", () => {
    expect(readPublicDesignConfig(null)).toBeNull();
    expect(readPublicDesignConfig(undefined)).toBeNull();
    expect(readPublicDesignConfig({})).toBeNull();
    expect(readPublicDesignConfig({ other: "value" })).toBeNull();
  });

  it("extracts camelCase keys the studio writes", () => {
    const config = readPublicDesignConfig({
      design_config: {
        theme: { id: "liquid-glass", variant: "dark", accentColor: "#6366f1" },
        cover: {
          assetId: "asset-uuid",
          styleId: "hero-overlay",
          focalPoint: { x: 25, y: 75 },
          title: "Anaya & Vihaan",
          subtitle: "Goa, Feb 2026",
        },
        typography: {
          pairingId: "elegant",
          headingFont: "Playfair Display",
          bodyFont: "Inter",
          titleSize: 64,
          subtitleSize: 20,
        },
        grid: { layout: "grid", columns: 4, gap: 12, showInfo: true },
        version: 7,
      },
    });

    expect(config).not.toBeNull();
    expect(config!.theme?.variant).toBe("dark");
    expect(config!.theme?.accentColor).toBe("#6366f1");
    expect(config!.cover?.styleId).toBe("hero-overlay");
    expect(config!.cover?.focalPoint).toEqual({ x: 25, y: 75 });
    expect(config!.cover?.title).toBe("Anaya & Vihaan");
    expect(config!.typography?.titleSize).toBe(64);
    expect(config!.typography?.subtitleSize).toBe(20);
    expect(config!.grid?.layout).toBe("grid");
    expect(config!.grid?.columns).toBe(4);
    expect(config!.grid?.showInfo).toBe(true);
  });

  it("rejects unknown layout values", () => {
    const config = readPublicDesignConfig({
      design_config: { grid: { layout: "bogus", columns: 2 } },
    });
    expect(config!.grid?.layout).toBeUndefined();
    expect(config!.grid?.columns).toBe(2);
  });

  it("rejects unknown theme variants", () => {
    const config = readPublicDesignConfig({
      design_config: { theme: { variant: "neon" } },
    });
    expect(config!.theme?.variant).toBeUndefined();
  });

  it("uses focal point default 50/50 when partial", () => {
    const config = readPublicDesignConfig({
      design_config: { cover: { focalPoint: { x: "nope" } } },
    });
    expect(config!.cover?.focalPoint).toEqual({ x: 50, y: 50 });
  });
});

describe("readPublicCoverThumbnails", () => {
  it("returns null when missing", () => {
    expect(readPublicCoverThumbnails(null)).toBeNull();
    expect(readPublicCoverThumbnails({})).toBeNull();
    expect(readPublicCoverThumbnails({ cover_thumbnails: null })).toBeNull();
  });

  it("filters non-string values out of the map", () => {
    const urls = readPublicCoverThumbnails({
      cover_thumbnails: {
        display_webp: "/storage/key1.webp",
        thumb_lg_webp: "/storage/key2.webp",
        broken: 42,
        empty: "",
      },
    });
    expect(urls).toEqual({
      display_webp: "/storage/key1.webp",
      thumb_lg_webp: "/storage/key2.webp",
    });
  });
});

import { describe, expect, it } from "vitest";
import { readGalleryCoverAssetId, readPublicCoverThumbnails, readPublicDesignConfig } from "../gallery-design-config";

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
          layoutPreset: "haldi-warm",
          mediaMode: "photo-grid",
          focalPoint: { x: 25, y: 75 },
          mobileFocalPoint: { x: 40, y: 35 },
          mobileAspectRatio: "4/5",
          title: "Anaya & Vihaan",
          subtitle: "Goa, Feb 2026",
          scrimStyle: "warm-vignette",
          textBackdrop: "glass",
        },
        typography: {
          pairingId: "elegant",
          headingFont: "Playfair Display",
          bodyFont: "Inter",
          titleSize: 64,
          subtitleSize: 20,
        },
        grid: { layout: "grid", columns: 4, gap: 12, showInfo: true },
        sceneHeaders: [
          { id: "haldi", label: "Haldi", enabled: true, assetId: "asset-haldi" },
          { id: "broken", label: "", enabled: true },
          "not-a-scene",
        ],
        branding: {
          logoPlacement: "top-right",
          monogram: "AV",
          brandColor: "#B7791F",
          watermarkStyle: "subtle-corner",
        },
        version: 7,
      },
    });

    expect(config).not.toBeNull();
    expect(config!.theme?.variant).toBe("dark");
    expect(config!.theme?.accentColor).toBe("#6366f1");
    expect(config!.cover?.styleId).toBe("hero-overlay");
    expect(config!.cover?.layoutPreset).toBe("haldi-warm");
    expect(config!.cover?.mediaMode).toBe("photo-grid");
    expect(config!.cover?.focalPoint).toEqual({ x: 25, y: 75 });
    expect(config!.cover?.mobileFocalPoint).toEqual({ x: 40, y: 35 });
    expect(config!.cover?.mobileAspectRatio).toBe("4/5");
    expect(config!.cover?.scrimStyle).toBe("warm-vignette");
    expect(config!.cover?.textBackdrop).toBe("glass");
    expect(config!.cover?.title).toBe("Anaya & Vihaan");
    expect(config!.typography?.titleSize).toBe(64);
    expect(config!.typography?.subtitleSize).toBe(20);
    expect(config!.grid?.layout).toBe("grid");
    expect(config!.grid?.columns).toBe(4);
    expect(config!.grid?.showInfo).toBe(true);
    expect(config!.sceneHeaders).toEqual([
      { id: "haldi", label: "Haldi", enabled: true, assetId: "asset-haldi" },
    ]);
    expect(config!.branding).toEqual({
      logoPlacement: "top-right",
      monogram: "AV",
      brandColor: "#B7791F",
      watermarkStyle: "subtle-corner",
    });
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

  it("rejects unknown cover experience values", () => {
    const config = readPublicDesignConfig({
      design_config: {
        cover: {
          layoutPreset: "not-real",
          mediaMode: "confetti",
          scrimStyle: "laser",
          textBackdrop: "cardboard",
        },
        branding: {
          logoPlacement: "middle",
          watermarkStyle: "giant",
          monogram: 42,
        },
      },
    });

    expect(config!.cover?.layoutPreset).toBeUndefined();
    expect(config!.cover?.mediaMode).toBeUndefined();
    expect(config!.cover?.scrimStyle).toBeUndefined();
    expect(config!.cover?.textBackdrop).toBeUndefined();
    expect(config!.branding?.logoPlacement).toBeUndefined();
    expect(config!.branding?.watermarkStyle).toBeUndefined();
    expect(config!.branding?.monogram).toBeUndefined();
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

describe("readGalleryCoverAssetId", () => {
  it("prefers the Design Studio cover asset over the legacy gallery cover column", () => {
    expect(
      readGalleryCoverAssetId(
        {
          design_config: {
            cover: { assetId: "design-cover" },
          },
        },
        "legacy-cover",
      ),
    ).toBe("design-cover");
  });

  it("falls back to cover_asset_id when no design cover is saved", () => {
    expect(readGalleryCoverAssetId({}, "legacy-cover")).toBe("legacy-cover");
    expect(readGalleryCoverAssetId(null, "legacy-cover")).toBe("legacy-cover");
  });
});

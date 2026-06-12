import { describe, expect, it } from "vitest";
import {
  buildGalleryCoverDeviceDesignConfig,
  normalizeSlideshowIntervalMs,
  readGalleryClientSideMediaEncryptionEnabled,
  readGalleryCoverAssetId,
  readGallerySlideshowIntervalMs,
  readPublicCoverProfileThumbnails,
  readPublicCoverThumbnails,
  readPublicDesignConfig,
  readPublicDesignConfigForAlbum,
  resolveCoverDeviceProfile,
} from "../gallery-design-config";

describe("readGallerySlideshowIntervalMs", () => {
  it("reads the saved gallery slideshow speed and clamps unsafe values", () => {
    expect(
      readGallerySlideshowIntervalMs({ slideshow_interval_ms: 8000 }),
    ).toBe(8000);
    expect(
      readGallerySlideshowIntervalMs({ slideshow_interval_ms: "12000" }),
    ).toBe(12000);
    expect(
      readGallerySlideshowIntervalMs({ slideshow_interval_ms: 1000 }),
    ).toBe(2000);
    expect(
      readGallerySlideshowIntervalMs({ slideshow_interval_ms: 30000 }),
    ).toBe(15000);
    expect(readGallerySlideshowIntervalMs({})).toBe(5000);
    expect(normalizeSlideshowIntervalMs("bad")).toBe(5000);
  });
});

describe("readGalleryClientSideMediaEncryptionEnabled", () => {
  it("defaults to fast/plain uploads unless the gallery opts into client-side media encryption", () => {
    expect(readGalleryClientSideMediaEncryptionEnabled(null)).toBe(false);
    expect(readGalleryClientSideMediaEncryptionEnabled({})).toBe(false);
    expect(
      readGalleryClientSideMediaEncryptionEnabled({
        client_side_media_encryption_enabled: false,
      }),
    ).toBe(false);
    expect(
      readGalleryClientSideMediaEncryptionEnabled({
        client_side_media_encryption_enabled: true,
      }),
    ).toBe(true);
  });
});

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
          assetSlots: ["asset-uuid", "asset-second", null, "asset-fourth"],
          styleId: "hero-overlay",
          layoutPreset: "haldi-warm",
          mediaMode: "photo-grid",
          focalPoint: { x: 25, y: 75 },
          mobileFocalPoint: { x: 40, y: 35 },
          zoom: 1.35,
          mobileZoom: 1.15,
          slotFocalPoints: [
            { x: 50, y: 50 },
            { x: 62, y: 31 },
          ],
          mobileSlotFocalPoints: [
            { x: 50, y: 50 },
            { x: 44, y: 48 },
          ],
          slotZooms: [1, 1.4],
          mobileSlotZooms: [1, 1.25],
          mobileAspectRatio: "4/5",
          title: "Anaya & Vihaan",
          subtitle: "Goa, Feb 2026",
          titleVisible: true,
          subtitleVisible: false,
          titlePosition: { x: 34, y: 45 },
          subtitlePosition: { x: 66, y: 58 },
          mobileTitlePosition: { x: 44, y: 48 },
          mobileSubtitlePosition: { x: 46, y: 62 },
          titleColor: "#f6d77a",
          subtitleColor: "#9be7ff",
          scrimStyle: "warm-vignette",
          textBackdrop: "glass",
        },
        typography: {
          pairingId: "elegant",
          headingFont: "Anek Telugu",
          bodyFont: "Noto Serif Tamil",
          titleLanguage: "telugu",
          subtitleLanguage: "tamil",
          titleWeight: 700,
          subtitleWeight: 500,
          titleItalic: true,
          subtitleItalic: false,
          titleSize: 64,
          subtitleSize: 20,
          mobileTitleSize: 42,
          mobileSubtitleSize: 18,
        },
        grid: { layout: "grid", columns: 4, gap: 12, showInfo: true },
        sceneHeaders: [
          {
            id: "haldi",
            label: "Haldi",
            enabled: true,
            assetId: "asset-haldi",
          },
          { id: "broken", label: "", enabled: true },
          "not-a-scene",
        ],
        branding: {
          logoPlacement: "top-right",
          monogram: "AV",
          brandColor: "#B7791F",
          watermarkStyle: "subtle-corner",
          logoSize: 56,
          logoOpacity: 82,
          watermarkText: "Asha Ravi Studio",
          watermarkOpacity: 45,
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
    expect(config!.cover?.assetSlots).toEqual([
      "asset-uuid",
      "asset-second",
      null,
      "asset-fourth",
    ]);
    expect(config!.cover?.focalPoint).toEqual({ x: 25, y: 75 });
    expect(config!.cover?.mobileFocalPoint).toEqual({ x: 40, y: 35 });
    expect(config!.cover?.zoom).toBe(1.35);
    expect(config!.cover?.mobileZoom).toBe(1.15);
    expect(config!.cover?.slotFocalPoints).toEqual([
      { x: 50, y: 50 },
      { x: 62, y: 31 },
    ]);
    expect(config!.cover?.mobileSlotFocalPoints).toEqual([
      { x: 50, y: 50 },
      { x: 44, y: 48 },
    ]);
    expect(config!.cover?.slotZooms).toEqual([1, 1.4]);
    expect(config!.cover?.mobileSlotZooms).toEqual([1, 1.25]);
    expect(config!.cover?.mobileAspectRatio).toBe("4/5");
    expect(config!.cover?.scrimStyle).toBe("warm-vignette");
    expect(config!.cover?.textBackdrop).toBe("glass");
    expect(config!.cover?.title).toBe("Anaya & Vihaan");
    expect(config!.cover?.subtitle).toBe("Goa, Feb 2026");
    expect(config!.cover?.titleVisible).toBe(true);
    expect(config!.cover?.subtitleVisible).toBe(false);
    expect(config!.cover?.titlePosition).toEqual({ x: 34, y: 45 });
    expect(config!.cover?.subtitlePosition).toEqual({ x: 66, y: 58 });
    expect(config!.cover?.mobileTitlePosition).toEqual({ x: 44, y: 48 });
    expect(config!.cover?.mobileSubtitlePosition).toEqual({ x: 46, y: 62 });
    expect(config!.cover?.titleColor).toBe("#f6d77a");
    expect(config!.cover?.subtitleColor).toBe("#9be7ff");
    expect(config!.typography?.headingFont).toBe("Anek Telugu");
    expect(config!.typography?.bodyFont).toBe("Noto Serif Tamil");
    expect(config!.typography?.titleLanguage).toBe("telugu");
    expect(config!.typography?.subtitleLanguage).toBe("tamil");
    expect(config!.typography?.titleWeight).toBe(700);
    expect(config!.typography?.subtitleWeight).toBe(500);
    expect(config!.typography?.titleItalic).toBe(true);
    expect(config!.typography?.subtitleItalic).toBe(false);
    expect(config!.typography?.titleSize).toBe(64);
    expect(config!.typography?.subtitleSize).toBe(20);
    expect(config!.typography?.mobileTitleSize).toBe(42);
    expect(config!.typography?.mobileSubtitleSize).toBe(18);
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
      logoSize: 56,
      logoOpacity: 82,
      watermarkText: "Asha Ravi Studio",
      watermarkOpacity: 45,
    });
  });

  it("ignores legacy album design config and uses the gallery config for every folder", () => {
    const settings = {
      design_config: {
        cover: {
          assetId: "gallery-cover",
          title: "Gallery cover",
          aspectRatio: "16/9",
        },
        grid: { layout: "grid", columns: 4, gap: 12, showInfo: true },
      },
      design_config_by_album: {
        "album-1": {
          cover: {
            assetId: "album-cover",
            title: "Folder cover",
            aspectRatio: "4/5",
          },
        },
        "album-2": {
          grid: { layout: "justified", columns: 2, gap: 8, showInfo: false },
        },
        "album-3": {
          grid: { layout: "grid", columns: 4, gap: 12, showInfo: true },
        },
        "album-4": {
          gridScope: "folder",
          grid: { layout: "grid", columns: 4, gap: 12, showInfo: true },
        },
      },
    };

    expect(
      resolveCoverDeviceProfile(
        readPublicDesignConfigForAlbum(settings, "album-1"),
        "desktop",
      ).cover.assetId,
    ).toBe("gallery-cover");
    expect(
      resolveCoverDeviceProfile(
        readPublicDesignConfigForAlbum(settings, "missing-album"),
        "desktop",
      ).cover.assetId,
    ).toBe("gallery-cover");
    expect(readPublicDesignConfigForAlbum(settings, null)?.grid?.columns).toBe(
      4,
    );
    expect(readPublicDesignConfigForAlbum(settings, "album-1")?.grid).toEqual({
      layout: "grid",
      columns: 4,
      gap: 12,
      showInfo: true,
    });
    expect(readPublicDesignConfigForAlbum(settings, "album-2")?.grid).toEqual({
      layout: "grid",
      columns: 4,
      gap: 12,
      showInfo: true,
    });
    expect(
      readPublicDesignConfigForAlbum(settings, "missing-album")?.grid?.columns,
    ).toBe(4);

    const gridOnlyAlbumConfig = readPublicDesignConfigForAlbum(
      settings,
      "album-2",
    );
    expect(
      resolveCoverDeviceProfile(gridOnlyAlbumConfig, "desktop").cover.assetId,
    ).toBe("gallery-cover");
    expect(gridOnlyAlbumConfig?.grid?.layout).toBe("grid");
    expect(gridOnlyAlbumConfig?.grid?.columns).toBe(4);
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

  it("parses and resolves desktop and phone cover device profiles", () => {
    const config = readPublicDesignConfig({
      design_config: {
        cover: {
          assetId: "legacy-cover",
          styleId: "classic-full",
          focalPoint: { x: 20, y: 30 },
          mobileFocalPoint: { x: 40, y: 50 },
          zoom: 1.2,
          mobileZoom: 1.1,
          titlePosition: { x: 50, y: 70 },
          mobileTitlePosition: { x: 48, y: 58 },
          aspectRatio: "16/9",
          mobileAspectRatio: "4/5",
          deviceProfiles: {
            desktop: {
              assetId: "desktop-cover",
              styleId: "modern-grid",
              title: "Desktop title",
              focalPoint: { x: 12, y: 34 },
              zoom: 1.5,
              slotZooms: [1, 1.35],
              aspectRatio: "21/9",
              typography: { titleSize: 62 },
            },
            phone: {
              assetId: "phone-cover",
              title: "Phone title",
              titlePosition: { x: 44, y: 52 },
              zoom: 1.25,
              typography: { titleSize: 38 },
            },
          },
        },
        typography: { titleSize: 56, mobileTitleSize: 36 },
      },
    });

    expect(config!.cover?.deviceProfiles?.desktop?.assetId).toBe(
      "desktop-cover",
    );
    const desktop = resolveCoverDeviceProfile(config, "desktop");
    const phone = resolveCoverDeviceProfile(config, "phone");

    expect(desktop.cover).toMatchObject({
      assetId: "desktop-cover",
      styleId: "modern-grid",
      title: "Desktop title",
      focalPoint: { x: 12, y: 34 },
      zoom: 1.5,
      slotZooms: [1, 1.35],
      aspectRatio: "21/9",
    });
    expect(desktop.typography.titleSize).toBe(62);
    expect(phone.cover).toMatchObject({
      assetId: "phone-cover",
      styleId: "modern-grid",
      title: "Phone title",
      focalPoint: { x: 40, y: 50 },
      zoom: 1.25,
      slotZooms: [1, 1.35],
      titlePosition: { x: 44, y: 52 },
      aspectRatio: "4/5",
    });
    expect(phone.typography.titleSize).toBe(38);
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

describe("readPublicCoverProfileThumbnails", () => {
  it("filters profile thumbnail maps by device", () => {
    expect(
      readPublicCoverProfileThumbnails({
        cover_profile_thumbnails: {
          desktop: { thumb_lg_webp: "/desktop.webp", broken: 2 },
          phone: { thumb_lg_webp: "/phone.webp", empty: "" },
          tablet: { thumb_lg_webp: "/tablet.webp" },
        },
      }),
    ).toEqual({
      desktop: { thumb_lg_webp: "/desktop.webp" },
      phone: { thumb_lg_webp: "/phone.webp" },
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

  it("prefers the desktop device profile over legacy flat cover fields", () => {
    expect(
      readGalleryCoverAssetId(
        {
          design_config: {
            cover: {
              assetId: "legacy-design-cover",
              deviceProfiles: {
                desktop: { assetId: "desktop-cover" },
                phone: { assetId: "phone-cover" },
              },
            },
          },
        },
        "legacy-cover",
      ),
    ).toBe("desktop-cover");
  });

  it("falls back to cover_asset_id when no design cover is saved", () => {
    expect(readGalleryCoverAssetId({}, "legacy-cover")).toBe("legacy-cover");
    expect(readGalleryCoverAssetId(null, "legacy-cover")).toBe("legacy-cover");
  });
});

describe("buildGalleryCoverDeviceDesignConfig", () => {
  it("sets the desktop cover while preserving the phone cover profile", () => {
    const payload = buildGalleryCoverDeviceDesignConfig(
      {
        design_config: {
          version: 4,
          theme: { id: "liquid-glass", variant: "dark" },
          cover: {
            assetId: "old-desktop",
            assetSlots: ["old-desktop", "second-slot"],
            title: "Wedding",
            deviceProfiles: {
              desktop: {
                assetId: "old-desktop",
                zoom: 1.25,
                assetSlots: ["old-desktop", "second-slot"],
              },
              phone: {
                assetId: "phone-cover",
                zoom: 1.5,
                assetSlots: ["phone-cover"],
              },
            },
          },
        },
      },
      "new-desktop",
      "desktop",
    );

    expect(payload.version).toBe(4);
    expect(payload.theme).toEqual({ id: "liquid-glass", variant: "dark" });
    expect(payload.cover).toMatchObject({
      assetId: "new-desktop",
      assetSlots: ["new-desktop", "second-slot"],
      title: "Wedding",
      deviceProfiles: {
        desktop: {
          assetId: "new-desktop",
          zoom: 1.25,
          assetSlots: ["new-desktop", "second-slot"],
        },
        phone: {
          assetId: "phone-cover",
          zoom: 1.5,
          assetSlots: ["phone-cover"],
        },
      },
    });
  });

  it("sets only the phone cover without changing the flat desktop cover", () => {
    const payload = buildGalleryCoverDeviceDesignConfig(
      {
        design_config: {
          cover: {
            assetId: "desktop-cover",
            assetSlots: ["desktop-cover"],
            deviceProfiles: {
              desktop: { assetId: "desktop-cover" },
            },
          },
        },
      },
      "phone-cover",
      "phone",
    );

    expect(payload.cover).toMatchObject({
      assetId: "desktop-cover",
      assetSlots: ["desktop-cover"],
      deviceProfiles: {
        desktop: { assetId: "desktop-cover" },
        phone: { assetId: "phone-cover", assetSlots: ["phone-cover"] },
      },
    });
  });
});

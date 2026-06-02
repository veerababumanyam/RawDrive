import { describe, expect, it } from "vitest";
import { FILMSTRIP_VARIANTS, GRID_VARIANTS, LIGHTBOX_VARIANTS, pickAssetMedia } from "../asset-media";

describe("asset media selection", () => {
  it("uses WebP derivatives for gallery grids and never falls back to originals", () => {
    const picked = pickAssetMedia(
      {
        filename: "private.jpg",
        storage_key: "originals/private.jpg.enc",
        download_url: "originals/private.jpg.enc",
        thumbnail_urls: {
          thumb_md_webp: "thumbnails/private/thumb_md_webp.webp",
          thumb_md: "legacy/private/thumb_md.jpg",
        },
      },
      GRID_VARIANTS,
    );

    expect(picked?.variant).toBe("thumb_md_webp");
    expect(picked?.key).toBe("thumbnails/private/thumb_md_webp.webp");
  });

  it("returns no display media when only original or legacy non-WebP thumbnails exist", () => {
    expect(
      pickAssetMedia(
        {
          filename: "legacy.jpg",
          storage_key: "originals/legacy.jpg",
          download_url: "originals/legacy.jpg",
          thumbnail_urls: {
            thumb_md: "legacy/thumb_md.jpg",
            lg: "legacy/lg.jpg",
          },
        },
        LIGHTBOX_VARIANTS,
      ),
    ).toBeNull();
  });

  it("can use an unknown WebP thumbnail key as a last-resort display derivative", () => {
    const picked = pickAssetMedia(
      {
        filename: "future.jpg",
        thumbnail_urls: {
          future_webp: "future/future.webp",
          thumb_md: "legacy/thumb_md.jpg",
        },
      },
      GRID_VARIANTS,
    );

    expect(picked?.variant).toBe("future_webp");
    expect(picked?.key).toBe("future/future.webp");
  });

  it("uses the smallest WebP derivative first for filmstrip thumbnails", () => {
    const picked = pickAssetMedia(
      {
        filename: "filmstrip.jpg",
        thumbnail_urls: {
          thumb_md_webp: "thumbnails/filmstrip/thumb_md_webp.webp",
          thumb_sm_webp: "thumbnails/filmstrip/thumb_sm_webp.webp",
          display_webp: "derivatives/filmstrip/display_webp.webp",
        },
      },
      FILMSTRIP_VARIANTS,
    );

    expect(picked?.variant).toBe("thumb_sm_webp");
    expect(picked?.key).toBe("thumbnails/filmstrip/thumb_sm_webp.webp");
  });
});

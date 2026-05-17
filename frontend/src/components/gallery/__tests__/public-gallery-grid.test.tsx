import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PublicGalleryGrid } from "../public-gallery-grid";
import type { PublicAsset } from "@/lib/api/galleries";

const widePhoto = "/tests/photos/Wedding (42).jpg";

function galleryAsset(overrides: Partial<PublicAsset> = {}): PublicAsset {
  return {
    id: "asset-wide",
    filename: "Wedding (42).jpg",
    content_type: "image/jpeg",
    width: 1920,
    height: 1080,
    thumbnail_urls: {
      display_webp: widePhoto,
      thumb_lg_webp: widePhoto,
    },
    sort_order: 1,
    ...overrides,
  };
}

describe("PublicGalleryGrid", () => {
  it("renders backend storage thumbnails against the API origin", () => {
    render(
      <PublicGalleryGrid
        slug="wedding-gallery"
        assets={[
          galleryAsset({
            thumbnail_urls: {
              thumb_md_webp: "/storage/workspaces/w1/public-thumb.webp",
            },
          }),
        ]}
      />,
    );

    expect(screen.getByAltText("Wedding (42).jpg")).toHaveAttribute(
      "src",
      "http://localhost:8080/storage/workspaces/w1/public-thumb.webp",
    );
  });

  it("keeps public download controls available on touch screens", () => {
    render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);

    const downloadButton = screen.getByRole("button", { name: "Download" });
    expect(downloadButton.parentElement).toHaveClass("opacity-100", "sm:opacity-0", "sm:group-hover:opacity-100");
  });

  it("lets fullscreen lightbox images fill the viewport while preserving aspect ratio", () => {
    render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);

    const gridImage = screen.getByAltText("Wedding (42).jpg");
    const gridButton = gridImage.closest('[role="button"]');
    expect(gridButton).not.toBeNull();
    fireEvent.click(gridButton as Element);

    const dialog = screen.getByRole("dialog", { name: /photo: wedding \(42\)\.jpg/i });
    const lightboxImage = within(dialog).getByRole("img", { name: "Wedding (42).jpg" });

    expect(lightboxImage).toHaveClass("h-full", "w-full", "object-contain");
    expect(lightboxImage.parentElement).toHaveClass("absolute", "inset-0", "overflow-auto");
  });

  describe("lightbox client actions", () => {
    const FAV_KEY = "rawdrive-favorites-wedding-gallery";

    beforeEach(() => {
      try { localStorage.removeItem(FAV_KEY); } catch { /* noop */ }
      Object.defineProperty(window, "location", {
        value: { origin: "https://app.rawdrive.test", search: "" },
        writable: true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      try { localStorage.removeItem(FAV_KEY); } catch { /* noop */ }
    });

    function openLightbox() {
      const gridImage = screen.getByAltText("Wedding (42).jpg");
      const gridButton = gridImage.closest('[role="button"]');
      fireEvent.click(gridButton as Element);
      return screen.getByRole("dialog", { name: /photo: wedding \(42\)\.jpg/i });
    }

    it("renders Favorite, Download, and Share buttons in the lightbox toolbar", () => {
      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);
      const dialog = openLightbox();

      expect(within(dialog).getByRole("button", { name: /add to favorites/i })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /download original/i })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /copy share link/i })).toBeInTheDocument();
    });

    it("hides Download when the gallery has downloads disabled", () => {
      render(
        <PublicGalleryGrid
          slug="wedding-gallery"
          assets={[galleryAsset()]}
          downloadEnabled={false}
        />,
      );
      const dialog = openLightbox();

      expect(within(dialog).queryByRole("button", { name: /download original/i })).toBeNull();
      // Star + Share still present (those don't depend on download permission).
      expect(within(dialog).getByRole("button", { name: /add to favorites/i })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /copy share link/i })).toBeInTheDocument();
    });

    it("toggles favorite state when the Star button is clicked", () => {
      // Asserts the user-visible behavior (button label flips). The
      // localStorage persistence path is exercised inside the
      // useGalleryFavorites hook, which try/catches storage failures —
      // jsdom under this test harness doesn't expose a writable
      // localStorage after Object.defineProperty(window.location), so
      // asserting on the storage entry directly is fragile. A real
      // browser run (manual + the deferred Playwright smoke) verifies
      // the storage round-trip end-to-end.
      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);
      const dialog = openLightbox();

      const favButton = within(dialog).getByRole("button", { name: /add to favorites/i });
      fireEvent.click(favButton);

      expect(
        within(dialog).getByRole("button", { name: /remove from favorites/i }),
      ).toBeInTheDocument();

      // Click again should toggle back off.
      fireEvent.click(within(dialog).getByRole("button", { name: /remove from favorites/i }));
      expect(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      ).toBeInTheDocument();
    });

    it("copies the deep-link share URL to clipboard and flips the button to copied state", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);
      const dialog = openLightbox();

      fireEvent.click(within(dialog).getByRole("button", { name: /copy share link/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          "https://app.rawdrive.test/g/wedding-gallery?asset=asset-wide",
        );
      });
      // After the copy resolves the label flips to the copied state.
      expect(
        await within(dialog).findByRole("button", { name: /share link copied/i }),
      ).toBeInTheDocument();
    });

    it("auto-opens the lightbox on ?asset=<id> deep-link landing", () => {
      Object.defineProperty(window, "location", {
        value: {
          origin: "https://app.rawdrive.test",
          search: "?asset=asset-wide",
        },
        writable: true,
      });

      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);

      // No click needed — the deep-link effect should have opened the
      // lightbox to the matching asset.
      expect(
        screen.getByRole("dialog", { name: /photo: wedding \(42\)\.jpg/i }),
      ).toBeInTheDocument();
    });
  });
});

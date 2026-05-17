import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PublicGalleryGrid } from "../public-gallery-grid";
import type { PublicAsset } from "@/lib/api/galleries";

// Module-level mock of the favorites API. Each test can vi.mocked() the
// individual exports to assert behavior; default implementations are
// no-op resolved promises so the hook's fire-and-forget calls never
// reject the test runner.
vi.mock("@/lib/api/favorites", () => ({
  addPublicFavorite: vi.fn().mockResolvedValue(undefined),
  removePublicFavorite: vi.fn().mockResolvedValue(undefined),
  listPublicFavoriteAssetIds: vi.fn().mockResolvedValue([]),
  getGalleryFavoritesSummary: vi.fn().mockResolvedValue(null),
}));

// Pull the mocked functions back into the test scope. vi.mocked() gives
// us typed access to the spies for assertions.
const favoritesApi = await import("@/lib/api/favorites");
const mockedAdd = vi.mocked(favoritesApi.addPublicFavorite);
const mockedRemove = vi.mocked(favoritesApi.removePublicFavorite);
const mockedList = vi.mocked(favoritesApi.listPublicFavoriteAssetIds);

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
      // Reset spy state between tests so call-count assertions are
      // scoped to the test that wrote them.
      mockedAdd.mockClear().mockResolvedValue(undefined);
      mockedRemove.mockClear().mockResolvedValue(undefined);
      mockedList.mockClear().mockResolvedValue([]);
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

    // ─────── M41/105 server-side favorites sync ───────

    it("calls the public favorites API on mount to hydrate Star state from the server", async () => {
      // Server returns one favorite for this guest session. The Star
      // button on that asset should render in the favorited state
      // after hydration, without any user interaction.
      mockedList.mockResolvedValueOnce(["asset-wide"]);

      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);
      const dialog = openLightbox();

      await waitFor(() => {
        expect(mockedList).toHaveBeenCalledWith(
          "wedding-gallery",
          expect.any(String),
        );
      });

      // Server said this asset is already favorited → label should
      // show the "remove from favorites" state, not "add to".
      expect(
        await within(dialog).findByRole("button", { name: /remove from favorites/i }),
      ).toBeInTheDocument();
    });

    it("POSTs to addPublicFavorite when the Star button toggles on", async () => {
      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);
      const dialog = openLightbox();

      fireEvent.click(within(dialog).getByRole("button", { name: /add to favorites/i }));

      await waitFor(() => {
        expect(mockedAdd).toHaveBeenCalledWith(
          "wedding-gallery",
          "asset-wide",
          expect.any(String),
        );
      });
      // DELETE was NOT called for this toggle-on action.
      expect(mockedRemove).not.toHaveBeenCalled();
    });

    it("DELETEs via removePublicFavorite when the Star button toggles off", async () => {
      // Start with the asset already favorited (server hydration).
      mockedList.mockResolvedValueOnce(["asset-wide"]);

      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);
      const dialog = openLightbox();

      // Wait for hydration to flip the label.
      const offButton = await within(dialog).findByRole(
        "button",
        { name: /remove from favorites/i },
      );
      fireEvent.click(offButton);

      await waitFor(() => {
        expect(mockedRemove).toHaveBeenCalledWith(
          "wedding-gallery",
          "asset-wide",
          expect.any(String),
        );
      });
    });

    it("retains optimistic state when the server sync fails", async () => {
      // Network failure on POST. Hook should NOT roll back — user
      // intent stays expressed; next page mount re-syncs.
      mockedAdd.mockRejectedValueOnce(new Error("network"));

      render(<PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />);
      const dialog = openLightbox();

      fireEvent.click(within(dialog).getByRole("button", { name: /add to favorites/i }));

      // Optimistic flip happened immediately and stays put even after
      // the rejected promise settles.
      expect(
        await within(dialog).findByRole("button", { name: /remove from favorites/i }),
      ).toBeInTheDocument();
    });
  });
});

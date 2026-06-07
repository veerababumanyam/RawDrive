import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  PublicGalleryGrid,
  getPrefetchRootMargin,
} from "../public-gallery-grid";
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

  it("renders persisted album watermark placement and scale", () => {
    const { container } = render(
      <PublicGalleryGrid
        slug="wedding-gallery"
        assets={[galleryAsset()]}
        watermarkLogoUrl="data:image/png;base64,logo"
        watermark={{
          enabled: true,
          mode: "logo",
          logo_source: "business_profile",
          text: "Kaveri Stories",
          position: "custom",
          placement: { x: 30, y: 70 },
          opacity: 55,
          scale: 140,
        }}
      />,
    );

    const logo = container.querySelector(
      'img[src="data:image/png;base64,logo"]',
    );
    expect(logo).not.toBeNull();
    expect(logo?.parentElement).toHaveStyle({
      left: "30%",
      top: "70%",
      opacity: "0.55",
    });
    expect(logo?.parentElement?.style.transform).toContain("scale(1.4)");
  });

  it("renders Logo + Text watermark layers with independent placement", () => {
    const { container } = render(
      <PublicGalleryGrid
        slug="wedding-gallery"
        assets={[galleryAsset()]}
        watermarkLogoUrl="data:image/png;base64,logo"
        watermark={{
          enabled: true,
          mode: "both",
          logo_source: "business_profile",
          text: "Kaveri Stories",
          layers: {
            logo: {
              position: "top-right",
              placement: { x: 84, y: 16 },
              opacity: 60,
              scale: 110,
            },
            text: {
              position: "custom",
              placement: { x: 24, y: 62 },
              opacity: 45,
              scale: 130,
            },
          },
        }}
      />,
    );

    const logo = container.querySelector(
      'img[src="data:image/png;base64,logo"]',
    );
    expect(logo?.parentElement).toHaveStyle({
      left: "84%",
      top: "16%",
      opacity: "0.6",
    });
    expect(screen.getByText("Kaveri Stories")).toHaveStyle({
      left: "24%",
      top: "62%",
      opacity: "0.45",
    });
  });

  it("keeps public download controls available on touch screens", () => {
    render(
      <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
    );

    // 2026-05-18 visibility revision: per-tile actions moved inside a
    // "Photo options" overflow menu. Download is no longer a hover-reveal
    // button parked on the tile — it's a menu item that is always tappable
    // once the menu is open (no hover-gated opacity classes that hide it on
    // touch screens). Open the menu, then assert the Download menuitem.
    fireEvent.click(screen.getByRole("button", { name: "Photo options" }));

    const menu = screen.getByRole("menu");
    const downloadItem = within(menu).getByRole("menuitem", {
      name: "Download WebP",
    });
    expect(downloadItem).toBeInTheDocument();
    // The menuitem itself is full-width and never carries hover-only
    // opacity gating, so it stays reachable on touch (no pointer hover).
    expect(downloadItem).toHaveClass("flex", "w-full", "items-center");
    expect(downloadItem.className).not.toMatch(/group-hover:opacity/);
  });

  it("uses a WebP-only download action when the gallery policy allows only WebP", () => {
    render(
      <PublicGalleryGrid
        slug="wedding-gallery"
        assets={[galleryAsset()]}
        downloadQuality="webp"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Photo options" }));

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Download WebP" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Download thumbnail" }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Download original" }),
    ).toBeNull();
  });

  it("uses the thumbnail download action when the gallery policy allows thumbnails", () => {
    render(
      <PublicGalleryGrid
        slug="wedding-gallery"
        assets={[galleryAsset()]}
        downloadQuality="thumbnail"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Photo options" }));

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Download thumbnail" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Download WebP" }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Download original" }),
    ).toBeNull();
  });

  it("uses the original download action when the gallery policy allows source files", () => {
    render(
      <PublicGalleryGrid
        slug="wedding-gallery"
        assets={[galleryAsset()]}
        downloadQuality="original"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Photo options" }));

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Download original" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Download WebP" }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Download thumbnail" }),
    ).toBeNull();
  });

  it("keeps old both-format policies WebP-only", () => {
    render(
      <PublicGalleryGrid
        slug="wedding-gallery"
        assets={[galleryAsset()]}
        downloadQuality="both"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Photo options" }));

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Download WebP" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Download original" }),
    ).toBeNull();
  });

  it("renders a per-tile favorite toggle alongside the download button", async () => {
    // localStorage clean so the favorites hook starts empty — otherwise a
    // prior test's leak could pre-favorite this asset and the assertions
    // about the "Add to favorites" label would flip.
    try {
      localStorage.removeItem("rawdrive-favorites-wedding-gallery");
    } catch {
      /* noop */
    }
    Object.defineProperty(window, "location", {
      value: { origin: "https://app.rawdrive.test", search: "" },
      writable: true,
    });
    mockedAdd.mockClear().mockResolvedValue(undefined);
    // Mount hydration calls listPublicFavoriteAssetIds and, when it resolves,
    // replaces local state with the server set. Resolve it to an empty list so
    // the asset starts unfavorited, and (below) wait for that mount fetch to
    // settle BEFORE toggling — otherwise the async [] resolution races the
    // optimistic add and silently wipes it.
    mockedList.mockClear().mockResolvedValue([]);

    render(
      <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
    );

    // Let the mount-time server hydration complete first so its setFavorites([])
    // can't overwrite the optimistic toggle we perform next.
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith(
        "wedding-gallery",
        expect.any(String),
      );
    });

    // 2026-05-18 visibility revision: per-tile Favorite + Download now live
    // inside a "Photo options" overflow menu rather than as bare buttons on
    // the tile. Open the menu first, then assert the menu items.
    fireEvent.click(screen.getByRole("button", { name: "Photo options" }));

    const menu = screen.getByRole("menu");
    // Tile menu includes Favorite (default state), Share, and explicit Download.
    // Note the per-tile favorite label is "Add to favorites" / "Remove
    // favorite" (NOT "Remove from favorites" — that's the lightbox label).
    // The favorite is a checkable menu item → role="menuitemcheckbox" with
    // aria-checked (valid ARIA; menuitem does not support aria-pressed).
    const favoriteItem = within(menu).getByRole("menuitemcheckbox", {
      name: /add to favorites/i,
    });
    const downloadItem = within(menu).getByRole("menuitem", {
      name: "Download WebP",
    });
    expect(favoriteItem).toBeInTheDocument();
    expect(downloadItem).toBeInTheDocument();
    // Default (unfavorited) state exposes the unchecked affordance.
    expect(favoriteItem).toHaveAttribute("aria-checked", "false");

    // Clicking the favorite menuitem flips it to the "Remove favorite"
    // affordance AND fires the public favorites API. The handler calls
    // stopPropagation so the tile-click lightbox handler must NOT have fired —
    // no dialog open. The toggle is synchronous (optimistic setFavorites) and
    // also closes the menu, so re-open it to read the flipped favorite control.
    fireEvent.click(favoriteItem);

    // The public favorites API fired with the add (POST) path.
    expect(mockedAdd).toHaveBeenCalledWith(
      "wedding-gallery",
      "asset-wide",
      expect.any(String),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    // Re-open the menu — the favorite item now reads "Remove favorite" and
    // reports aria-checked=true, proving the toggle flipped the visible state.
    fireEvent.click(screen.getByRole("button", { name: "Photo options" }));
    const reopenedMenu = screen.getByRole("menu");
    const removeItem = within(reopenedMenu).getByRole("menuitemcheckbox", {
      name: /remove favorite/i,
    });
    expect(removeItem).toBeInTheDocument();
    expect(removeItem).toHaveAttribute("aria-checked", "true");
  });

  it("lets fullscreen lightbox images fill the viewport while preserving aspect ratio", () => {
    render(
      <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
    );

    const gridImage = screen.getByAltText("Wedding (42).jpg");
    const gridButton = gridImage.closest('[role="button"]');
    expect(gridButton).not.toBeNull();
    fireEvent.click(gridButton as Element);

    const dialog = screen.getByRole("dialog", {
      name: /photo: wedding \(42\)\.jpg/i,
    });
    const lightboxImage = within(dialog).getByRole("img", {
      name: "Wedding (42).jpg",
    });

    // The <img> fills its box and preserves aspect ratio via object-contain.
    expect(lightboxImage).toHaveClass("h-full", "w-full", "object-contain");
    // Its immediate parent is the relative full-size wrapper that lets the
    // watermark overlay track the zoom transform. That wrapper sits inside
    // the centered lightbox viewport, so the image expands to fill the
    // available surface while staying centered.
    expect(lightboxImage.parentElement).toHaveClass(
      "relative",
      "h-full",
      "w-full",
    );
    expect(lightboxImage.parentElement?.parentElement).toHaveClass(
      "relative",
      "flex-1",
      "overflow-hidden",
    );
  });

  it("moves focus into the modal lightbox when a photo is opened (focus trap)", () => {
    render(
      <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
    );

    const gridButton = screen
      .getByAltText("Wedding (42).jpg")
      .closest('[role="button"]');
    fireEvent.click(gridButton as Element);

    const dialog = screen.getByRole("dialog", {
      name: /photo: wedding \(42\)\.jpg/i,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Opening the lightbox must move keyboard focus into the modal; otherwise
    // aria-modal="true" lies and Tab walks the grid behind the overlay.
    expect(document.activeElement).toBe(dialog);
  });

  describe("lightbox client actions", () => {
    const FAV_KEY = "rawdrive-favorites-wedding-gallery";

    beforeEach(() => {
      try {
        localStorage.removeItem(FAV_KEY);
      } catch {
        /* noop */
      }
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
      try {
        localStorage.removeItem(FAV_KEY);
      } catch {
        /* noop */
      }
    });

    function openLightbox() {
      const gridImage = screen.getByAltText("Wedding (42).jpg");
      const gridButton = gridImage.closest('[role="button"]');
      fireEvent.click(gridButton as Element);
      return screen.getByRole("dialog", {
        name: /photo: wedding \(42\)\.jpg/i,
      });
    }

    it("renders Favorite, Download, and Share buttons in the lightbox toolbar", () => {
      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );
      const dialog = openLightbox();

      // Lightbox GlassIconButtons expose accessible names via their `label`
      // prop: favorite = "Add to favorites", download = "Download WebP",
      // share = "Share photo" (default; flips to "Share link copied" on copy).
      expect(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: /download webp/i }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: /share photo/i }),
      ).toBeInTheDocument();
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

      expect(
        within(dialog).queryByRole("button", { name: /download webp/i }),
      ).toBeNull();
      expect(
        within(dialog).queryByRole("button", { name: /download original/i }),
      ).toBeNull();
      // Star + Share still present (those don't depend on download permission).
      expect(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: /share photo/i }),
      ).toBeInTheDocument();
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
      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );
      const dialog = openLightbox();

      const favButton = within(dialog).getByRole("button", {
        name: /add to favorites/i,
      });
      fireEvent.click(favButton);

      expect(
        within(dialog).getByRole("button", { name: /remove from favorites/i }),
      ).toBeInTheDocument();

      // Click again should toggle back off.
      fireEvent.click(
        within(dialog).getByRole("button", { name: /remove from favorites/i }),
      );
      expect(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      ).toBeInTheDocument();
    });

    it("explains when favorites are disabled in owner preview mode", async () => {
      render(
        <PublicGalleryGrid
          slug="wedding-gallery"
          assets={[galleryAsset()]}
          favoritesDisabledReason="Favorites are disabled in owner preview and will not affect client counts."
        />,
      );
      const dialog = openLightbox();

      fireEvent.click(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      );

      expect(
        await screen.findByText(
          "Favorites are disabled in owner preview and will not affect client counts.",
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      ).toBeInTheDocument();
      expect(mockedAdd).not.toHaveBeenCalled();
    });

    it("copies the deep-link share URL to clipboard and flips the button to copied state", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );
      const dialog = openLightbox();

      // The lightbox Share control's default accessible name is "Share photo";
      // it copies the canonical single-photo deep link to the clipboard.
      fireEvent.click(
        within(dialog).getByRole("button", { name: /share photo/i }),
      );

      await waitFor(() => {
        // 2026-05-18: share URLs now point at the dedicated single-photo
        // route `/g/{slug}/photo/{assetId}`, not the legacy `?asset=` deep link.
        expect(writeText).toHaveBeenCalledWith(
          "https://app.rawdrive.test/g/wedding-gallery/photo/asset-wide",
        );
      });
      // After the copy resolves the label flips to the copied state
      // ("Share link copied").
      expect(
        await within(dialog).findByRole("button", {
          name: /share link copied/i,
        }),
      ).toBeInTheDocument();
    });

    it("auto-opens the lightbox on ?asset=<id> deep-link landing", async () => {
      Object.defineProperty(window, "location", {
        value: {
          origin: "https://app.rawdrive.test",
          search: "?asset=asset-wide",
        },
        writable: true,
      });

      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );

      // No click needed — the deep-link auto-open runs in a post-mount
      // microtask (SSR-safe: the window.location read cannot happen during
      // render), so await the dialog rather than querying synchronously.
      expect(
        await screen.findByRole("dialog", {
          name: /photo: wedding \(42\)\.jpg/i,
        }),
      ).toBeInTheDocument();
    });

    // ─────── M41/105 server-side favorites sync ───────

    it("calls the public favorites API on mount to hydrate Star state from the server", async () => {
      // Server returns one favorite for this guest session. The Star
      // button on that asset should render in the favorited state
      // after hydration, without any user interaction.
      mockedList.mockResolvedValueOnce(["asset-wide"]);

      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );
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
        await within(dialog).findByRole("button", {
          name: /remove from favorites/i,
        }),
      ).toBeInTheDocument();
    });

    it("POSTs to addPublicFavorite when the Star button toggles on", async () => {
      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );
      const dialog = openLightbox();

      fireEvent.click(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      );

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

      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );
      const dialog = openLightbox();

      // Wait for hydration to flip the label.
      const offButton = await within(dialog).findByRole("button", {
        name: /remove from favorites/i,
      });
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

      render(
        <PublicGalleryGrid slug="wedding-gallery" assets={[galleryAsset()]} />,
      );
      const dialog = openLightbox();

      fireEvent.click(
        within(dialog).getByRole("button", { name: /add to favorites/i }),
      );

      // Optimistic flip happened immediately and stays put even after
      // the rejected promise settles.
      expect(
        await within(dialog).findByRole("button", {
          name: /remove from favorites/i,
        }),
      ).toBeInTheDocument();
    });
  });
});

describe("getPrefetchRootMargin", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "connection");

  function setConnection(
    value: { effectiveType?: string; saveData?: boolean } | undefined,
  ) {
    Object.defineProperty(navigator, "connection", {
      value,
      configurable: true,
    });
  }

  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, "connection", original);
    } else {
      // jsdom exposes no navigator.connection by default — clear the stub.
      setConnection(undefined);
    }
  });

  it("keeps the aggressive 800px lookahead on fast / unknown connections", () => {
    setConnection(undefined);
    expect(getPrefetchRootMargin()).toBe("800px 0px");
    setConnection({ effectiveType: "4g" });
    expect(getPrefetchRootMargin()).toBe("800px 0px");
  });

  it("shrinks the lookahead on slow mobile connections", () => {
    setConnection({ effectiveType: "3g" });
    expect(getPrefetchRootMargin()).toBe("400px 0px");
    setConnection({ effectiveType: "2g" });
    expect(getPrefetchRootMargin()).toBe("200px 0px");
    setConnection({ effectiveType: "slow-2g" });
    expect(getPrefetchRootMargin()).toBe("200px 0px");
  });

  it("respects the Save-Data preference regardless of effectiveType", () => {
    setConnection({ effectiveType: "4g", saveData: true });
    expect(getPrefetchRootMargin()).toBe("200px 0px");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicGalleryHero } from "../public-gallery-hero";
import type {
  Gallery,
  GalleryBranding,
  PublicAsset,
} from "@/lib/api/galleries";
import type { PublicDesignConfig } from "@/lib/gallery-design-config";

const mocks = vi.hoisted(() => ({
  useDecryptedAssetUrl: vi.fn(
    (asset: PublicAsset | null | undefined, variants: readonly string[]) => ({
      src:
        variants
          .map((variant) => asset?.thumbnail_urls?.[variant])
          .find(Boolean) || "",
      loading: false,
      error: null,
    }),
  ),
}));

vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: mocks.useDecryptedAssetUrl,
}));

const weddingPhoto = "/tests/photos/Wedding (42).jpg";

const gallery: Gallery = {
  id: "gallery-1",
  workspace_id: "workspace-1",
  title: "Asha & Ravi",
  slug: "asha-ravi",
  description: "Wedding highlights",
  cover_asset_id: "asset-cover",
  gallery_type: "delivery",
  is_published: true,
  max_selections: 0,
  status: "published",
  created_at: "2026-04-13T00:00:00Z",
  updated_at: "2026-04-13T00:00:00Z",
  cover_template: "full_bleed",
};

const coverAsset: PublicAsset = {
  id: "asset-cover",
  filename: "Wedding (42).jpg",
  content_type: "image/jpeg",
  thumbnail_urls: {
    display_webp: weddingPhoto,
  },
  sort_order: 1,
};

const secondaryAsset: PublicAsset = {
  id: "asset-2",
  filename: "Wedding (43).jpg",
  content_type: "image/jpeg",
  thumbnail_urls: {
    thumb_lg_webp: "/tests/photos/Wedding (43).jpg",
  },
  sort_order: 2,
};

const branding: GalleryBranding = {
  tier_slug: "pro",
  can_customize: true,
  brand_name: "Kaveri Stories",
  logo_url: "/api/v1/public/galleries/asha-ravi/branding/logo",
  accent_color: "#B7791F",
  hide_footer: false,
  public_branding_enabled: true,
};

function setMobileViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("PublicGalleryHero", () => {
  beforeEach(() => {
    mocks.useDecryptedAssetUrl.mockClear();
    setMobileViewport(false);
    // jsdom media stubs — the hosted slideshow's audio-sync effect calls
    // play()/pause() on the <audio> element when music is wired.
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("renders studio identity and cover photo on the public gallery hero", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset]}
        branding={branding}
      />,
    );

    expect(screen.getByText("Kaveri Stories")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Asha & Ravi" })).toHaveAttribute(
      "src",
      weddingPhoto,
    );
    expect(
      screen.getByRole("img", { name: "Kaveri Stories logo" }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining(
        "/api/v1/public/galleries/asha-ravi/branding/logo",
      ),
    );
    expect(screen.getByRole("link", { name: /view gallery/i })).toHaveAttribute(
      "href",
      "#gallery-grid",
    );
    expect(mocks.useDecryptedAssetUrl).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-cover" }),
      expect.arrayContaining(["thumb_lg_webp", "display_webp"]),
      // Owner "View as client" bearer token (3rd arg). null on the public
      // route — anonymous visitors have no bearer (see viewerToken prop).
      null,
      // Short-lived asset-access token (4th arg). Also null for open,
      // non-encrypted public gallery payloads.
      null,
    );
  });

  it("prefers public-prefixed thumb_lg_webp over auth-gated display_webp for the cover", () => {
    // Regression: public share-link visitors have no JWT, so the cover
    // <img src> must point at a path the storage layer serves without
    // auth. Migration 104 keeps thumb_*_webp under /storage/thumbnails/
    // (public) and display_webp under /storage/derivatives/ (auth). The
    // hero must pick the thumb variant when both are present, otherwise
    // public viewers see a broken-image cover.
    const publicThumb = "/storage/thumbnails/asset-cover/thumb_lg_webp.webp";
    const authThumb = "/storage/derivatives/asset-cover/display_webp.webp";
    const dualVariant: PublicAsset = {
      ...coverAsset,
      thumbnail_urls: {
        display_webp: authThumb,
        thumb_lg_webp: publicThumb,
        thumb_md_webp: "/storage/thumbnails/asset-cover/thumb_md_webp.webp",
      },
    };

    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[dualVariant]}
        branding={branding}
      />,
    );

    const img = screen.getByRole("img", { name: "Asha & Ravi" });
    expect(img).toHaveAttribute("src", expect.stringContaining(publicThumb));
    expect(img.getAttribute("src")).not.toContain(authThumb);
  });

  it("does not stamp a default platform brand on the cover when the studio has not customized branding", () => {
    // Regression: prior code rendered the literal string "RawDrive" as a
    // wordmark chip on every guest gallery whose studio didn't pay for
    // custom branding — the platform was auto-watermarking client photos
    // with its own brand. Now the chip is omitted entirely when the
    // studio hasn't configured a brand name or logo.
    render(
      <PublicGalleryHero
        gallery={{ ...gallery, cover_template: "none" }}
        assets={[coverAsset]}
        branding={{ ...branding, can_customize: false }}
      />,
    );

    expect(screen.queryByText("RawDrive")).not.toBeInTheDocument();
    expect(screen.queryByText("Kaveri Stories")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /logo$/i }),
    ).not.toBeInTheDocument();
  });

  it("honors the expanded cover experience settings on the public hero", () => {
    const design: PublicDesignConfig = {
      theme: { variant: "dark", accentColor: "#B7791F" },
      cover: {
        assetId: "asset-cover",
        assetSlots: ["asset-cover", "asset-2"],
        styleId: "modern-grid",
        layoutPreset: "haldi-warm",
        mediaMode: "photo-grid",
        focalPoint: { x: 50, y: 50 },
        mobileFocalPoint: { x: 40, y: 35 },
        slotFocalPoints: [
          { x: 50, y: 50 },
          { x: 63, y: 32 },
        ],
        title: "Asha & Ravi",
        subtitle: "Haldi to reception",
        titlePosition: { x: 50, y: 58 },
        subtitlePosition: { x: 50, y: 68 },
        mobileTitlePosition: { x: 44, y: 48 },
        mobileSubtitlePosition: { x: 46, y: 62 },
        titleColor: "#f6d77a",
        subtitleColor: "#9be7ff",
        scrimStyle: "warm-vignette",
        textBackdrop: "glass",
        textShadow: true,
      },
      typography: {
        headingFont: "Anek Telugu",
        bodyFont: "Noto Serif Tamil",
        titleLanguage: "telugu",
        subtitleLanguage: "tamil",
        titleWeight: 700,
        subtitleWeight: 500,
        titleItalic: true,
        subtitleItalic: false,
        titleSize: 54,
        subtitleSize: 18,
        mobileTitleSize: 42,
        mobileSubtitleSize: 15,
      },
      branding: {
        logoPlacement: "top-right",
        monogram: "AR",
        brandColor: "#B7791F",
        watermarkStyle: "subtle-corner",
        logoSize: 56,
        logoOpacity: 82,
        watermarkText: "Asha Ravi Studio",
        watermarkOpacity: 45,
      },
      sceneHeaders: [
        { id: "haldi", label: "Haldi", enabled: true, assetId: "asset-2" },
        { id: "mehendi", label: "Mehendi", enabled: false, assetId: "asset-2" },
      ],
      version: 8,
    };

    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        design={design}
      />,
    );

    expect(screen.getByTestId("gallery-cover-photo-grid")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-cover-photo-grid")).toHaveAttribute(
      "data-cover-template",
      "modern-grid",
    );
    const secondSlot = screen.getByTestId("gallery-cover-template-slot-1");
    expect(secondSlot.querySelector("img")).toHaveAttribute(
      "src",
      "/tests/photos/Wedding (43).jpg",
    );
    expect(secondSlot.querySelector("img")).toHaveStyle({
      objectPosition: "63% 32%",
    });
    expect(screen.getByTestId("gallery-cover-scrim")).toHaveStyle({
      background:
        "radial-gradient(circle at 50% 45%, var(--cover-scrim-warm), var(--cover-scrim-soft-end) 72%)",
    });
    expect(screen.getByTestId("gallery-cover-title")).toHaveStyle({
      background: "var(--cover-text-backdrop-glass-bg)",
      fontFamily: "'Anek Telugu', 'Noto Sans Telugu', sans-serif",
      fontSize: "54px",
      fontWeight: "700",
      fontStyle: "italic",
      color: "#f6d77a",
      left: "50%",
      top: "58%",
    });
    expect(screen.getByTestId("gallery-cover-subtitle")).toHaveStyle({
      fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', serif",
      fontSize: "18px",
      fontWeight: "500",
      fontStyle: "normal",
      color: "#9be7ff",
      left: "50%",
      top: "68%",
    });
    expect(screen.getAllByText("AR").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("AR")[0]).toHaveStyle({
      height: "56px",
      opacity: "0.82",
    });
    expect(screen.getByText("Asha Ravi Studio")).toHaveStyle({
      opacity: "0.45",
    });
    expect(screen.getByTestId("gallery-scene-headers")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-scene-header-haldi")).toHaveTextContent(
      "Haldi",
    );
    expect(
      screen.getByRole("img", { name: "Haldi scene cover" }),
    ).toHaveAttribute("src", "/tests/photos/Wedding (43).jpg");
    expect(screen.queryByText("Mehendi")).not.toBeInTheDocument();
  });

  it("keeps saved design_config asset slots authoritative over the legacy cover asset", () => {
    const design: PublicDesignConfig = {
      cover: {
        assetId: "asset-2",
        assetSlots: ["asset-2", "asset-cover"],
        styleId: "classic-split",
        mediaMode: "single-photo",
      },
    };

    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        design={design}
      />,
    );

    const firstSlot = screen.getByTestId("gallery-cover-template-slot-0");
    const secondSlot = screen.getByTestId("gallery-cover-template-slot-1");

    expect(firstSlot.querySelector("img")).toHaveAttribute(
      "src",
      "/tests/photos/Wedding (43).jpg",
    );
    expect(secondSlot.querySelector("img")).toHaveAttribute(
      "src",
      weddingPhoto,
    );
  });

  it("uses the desktop cover profile for desktop viewport", async () => {
    const design: PublicDesignConfig = {
      cover: {
        assetId: "legacy-cover",
        styleId: "classic-full",
        deviceProfiles: {
          desktop: {
            assetId: "asset-desktop",
            styleId: "classic-full",
            title: "Desktop cover",
            titlePosition: { x: 51, y: 61 },
            typography: { titleSize: 58 },
          },
          phone: {
            assetId: "asset-phone",
            title: "Phone cover",
            titlePosition: { x: 45, y: 54 },
            typography: { titleSize: 36 },
          },
        },
      },
    };

    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset]}
        branding={branding}
        design={design}
        designCoverProfileThumbnails={{
          desktop: { thumb_lg_webp: "/storage/thumbnails/desktop.webp" },
          phone: { thumb_lg_webp: "/storage/thumbnails/phone.webp" },
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("gallery-cover-title")).toHaveTextContent(
        "Desktop cover",
      ),
    );
    expect(screen.getByTestId("gallery-cover-title")).toHaveStyle({
      left: "51%",
      top: "61%",
      fontSize: "58px",
    });
    expect(screen.getByRole("img", { name: "Desktop cover" })).toHaveAttribute(
      "src",
      expect.stringContaining("/storage/thumbnails/desktop.webp"),
    );
  });

  it("uses the phone cover profile for phone viewport on the same URL", async () => {
    setMobileViewport(true);
    const design: PublicDesignConfig = {
      cover: {
        assetId: "legacy-cover",
        styleId: "classic-full",
        mobileTitlePosition: { x: 50, y: 70 },
        deviceProfiles: {
          desktop: {
            assetId: "asset-desktop",
            styleId: "classic-full",
            title: "Desktop cover",
            titlePosition: { x: 51, y: 61 },
            typography: { titleSize: 58 },
          },
          phone: {
            assetId: "asset-phone",
            title: "Phone cover",
            titlePosition: { x: 45, y: 54 },
            aspectRatio: "4/5",
            typography: { titleSize: 36 },
          },
        },
      },
    };

    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset]}
        branding={branding}
        design={design}
        designCoverProfileThumbnails={{
          desktop: { thumb_lg_webp: "/storage/thumbnails/desktop.webp" },
          phone: { thumb_lg_webp: "/storage/thumbnails/phone.webp" },
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("gallery-cover-title")).toHaveTextContent(
        "Phone cover",
      ),
    );
    expect(screen.getByTestId("gallery-cover-title")).toHaveStyle({
      left: "45%",
      top: "54%",
      fontSize: "36px",
    });
    expect(screen.getByTestId("gallery-cover-title")).not.toHaveTextContent(
      "Desktop cover",
    );
    expect(screen.getByRole("img", { name: "Phone cover" })).toHaveAttribute(
      "src",
      expect.stringContaining("/storage/thumbnails/phone.webp"),
    );
  });

  it("pairs the View Gallery and Find Me photo-search CTAs as central glass-button controls", () => {
    // The photo-search entry used to float as a detached FAB ("Find me with
    // my camera") in PublicGalleryEnhancements, off the central design
    // system. It now sits beside the cover "View Gallery" CTA and both are
    // built from the shared .glass-button primitive.
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset]}
        branding={branding}
      />,
    );

    const viewGallery = screen.getByRole("link", { name: /view gallery/i });
    const findMe = screen.getByRole("link", {
      name: "Find your photos with your camera",
    });

    expect(viewGallery).toHaveClass("glass-button");
    expect(findMe).toHaveClass("glass-button");
    expect(findMe).toHaveTextContent("Find me");
    expect(viewGallery).toHaveAttribute("href", "#gallery-grid");
    expect(findMe).toHaveAttribute("href", "/g/asha-ravi/photo-search");
  });

  it("omits the Find Me CTA when the studio has disabled face detection", () => {
    render(
      <PublicGalleryHero
        gallery={{ ...gallery, face_detection_enabled: false }}
        assets={[coverAsset]}
        branding={branding}
      />,
    );

    expect(
      screen.getByRole("link", { name: /view gallery/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Find your photos with your camera",
      }),
    ).toBeNull();
  });

  it("renders a visible 'Play' control ordered before 'View Gallery' when the gallery has music", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        hasMusic
      />,
    );

    const play = screen.getByRole("button", { name: "Play slideshow" });
    // The visible label is the meaningful word "Play", not an icon-only button.
    expect(play).toHaveTextContent("Play");
    const viewGallery = screen.getByRole("link", { name: /view gallery/i });
    // Play must come BEFORE View Gallery in DOM order so they read as a pair.
    expect(
      play.compareDocumentPosition(viewGallery) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens the slideshow when the 'Play' control is clicked", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        hasMusic
      />,
    );

    // Music auto-opens on mount, so close first to prove the click path opens
    // it back up rather than relying on the initial open state.
    fireEvent.click(screen.getByRole("button", { name: "Close slideshow" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play slideshow" }));
    expect(
      screen.getByRole("dialog", { name: "Gallery slideshow" }),
    ).toBeInTheDocument();
  });

  it("auto-opens the slideshow on mount and wires the gallery music URL when music is present", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        ws="studio-abc12345"
        hasMusic
      />,
    );

    // No click needed — the dialog is open immediately so the music plays as
    // soon as the share link loads.
    expect(
      screen.getByRole("dialog", { name: "Gallery slideshow" }),
    ).toBeInTheDocument();
    const audio = screen.getByTestId("slideshow-audio");
    expect(audio.getAttribute("src")).toContain(
      "/api/v1/public/galleries/asha-ravi/music",
    );
    expect(audio.getAttribute("src")).toContain("ws=studio-abc12345");
  });

  it("renders 'Play' without auto-opening or audio when the gallery has no music", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        hasMusic={false}
      />,
    );

    const play = screen.getByRole("button", { name: "Play slideshow" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(play);
    expect(
      screen.getByRole("dialog", { name: "Gallery slideshow" }),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Wedding (42).jpg")).toHaveAttribute(
      "src",
      weddingPhoto,
    );
    expect(screen.queryByTestId("slideshow-audio")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mute music/i }),
    ).not.toBeInTheDocument();
    // Existing behavior unchanged: View Gallery still anchors to the grid.
    expect(screen.getByRole("link", { name: /view gallery/i })).toHaveAttribute(
      "href",
      "#gallery-grid",
    );
  });

  it("still opens from Play when the browser fullscreen request throws", () => {
    const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenEnabled",
    );
    const originalRequestFullscreen =
      document.documentElement.requestFullscreen;

    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("fullscreen denied");
      }),
    });

    try {
      render(
        <PublicGalleryHero
          gallery={gallery}
          assets={[coverAsset, secondaryAsset]}
          branding={branding}
          slug="asha-ravi"
          hasMusic={false}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Play slideshow" }));

      expect(
        screen.getByRole("dialog", { name: "Gallery slideshow" }),
      ).toBeInTheDocument();
    } finally {
      if (fullscreenEnabledDescriptor) {
        Object.defineProperty(
          document,
          "fullscreenEnabled",
          fullscreenEnabledDescriptor,
        );
      } else {
        Reflect.deleteProperty(document, "fullscreenEnabled");
      }
      Object.defineProperty(document.documentElement, "requestFullscreen", {
        configurable: true,
        value: originalRequestFullscreen,
      });
    }
  });

  it("keeps Play visible in the no-cover public header fallback", () => {
    render(
      <PublicGalleryHero
        gallery={{ ...gallery, cover_template: "none" }}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        faceDetectionEnabled
      />,
    );

    expect(screen.getByRole("heading", { name: "Asha & Ravi" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /view gallery/i }),
    ).not.toBeInTheDocument();

    const play = screen.getByRole("button", { name: "Play slideshow" });
    const findMe = screen.getByRole("link", {
      name: "Find your photos with your camera",
    });
    expect(play).toHaveTextContent("Play");
    expect(findMe).toHaveTextContent("Find me");
    expect(
      play.compareDocumentPosition(findMe) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(play);
    expect(
      screen.getByRole("dialog", { name: "Gallery slideshow" }),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Wedding (42).jpg")).toHaveAttribute(
      "src",
      weddingPhoto,
    );
  });

  it("renders a 'Find me' control in the hero CTA row, ordered after 'View Gallery', linking to photo-search", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        faceDetectionEnabled
      />,
    );

    const findMe = screen.getByRole("link", {
      name: "Find your photos with your camera",
    });
    // It is a text CTA pill (visible label), not an icon-only button.
    expect(findMe).toHaveTextContent("Find me");
    // Links to the gallery's photo-search page.
    expect(findMe).toHaveAttribute("href", "/g/asha-ravi/photo-search");

    // Find me must come AFTER View Gallery in DOM order so the row reads
    // [View Gallery] [Find me] (and [Play] [View Gallery] [Find me] with music).
    const viewGallery = screen.getByRole("link", { name: /view gallery/i });
    expect(
      viewGallery.compareDocumentPosition(findMe) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("orders the full Play → View Gallery → Find me CTA row when music and face detection are both enabled", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        hasMusic
        faceDetectionEnabled
      />,
    );

    const play = screen.getByRole("button", { name: "Play slideshow" });
    const viewGallery = screen.getByRole("link", { name: /view gallery/i });
    const findMe = screen.getByRole("link", {
      name: "Find your photos with your camera",
    });

    // Play before View Gallery before Find me — one horizontally-aligned group.
    expect(
      play.compareDocumentPosition(viewGallery) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      viewGallery.compareDocumentPosition(findMe) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no 'Find me' control when face detection is disabled or absent", () => {
    const { rerender } = render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        faceDetectionEnabled={false}
      />,
    );

    expect(
      screen.queryByRole("link", {
        name: "Find your photos with your camera",
      }),
    ).not.toBeInTheDocument();

    // Absent prop (default off) — still no Find me control.
    rerender(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
      />,
    );
    expect(
      screen.queryByRole("link", {
        name: "Find your photos with your camera",
      }),
    ).not.toBeInTheDocument();
    // View Gallery is still present and unchanged.
    expect(screen.getByRole("link", { name: /view gallery/i })).toHaveAttribute(
      "href",
      "#gallery-grid",
    );
  });
});

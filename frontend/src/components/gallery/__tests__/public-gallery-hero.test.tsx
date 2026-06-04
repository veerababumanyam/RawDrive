import { fireEvent, render, screen } from "@testing-library/react";
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

describe("PublicGalleryHero", () => {
  beforeEach(() => {
    mocks.useDecryptedAssetUrl.mockClear();
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
        styleId: "classic-full",
        layoutPreset: "haldi-warm",
        mediaMode: "photo-grid",
        focalPoint: { x: 50, y: 50 },
        mobileFocalPoint: { x: 40, y: 35 },
        title: "Asha & Ravi",
        subtitle: "Haldi to reception",
        titlePosition: { x: 50, y: 58 },
        subtitlePosition: { x: 50, y: 68 },
        scrimStyle: "warm-vignette",
        textBackdrop: "glass",
        textShadow: true,
      },
      typography: {
        headingFont: "Lora",
        bodyFont: "Manrope",
        titleSize: 54,
        subtitleSize: 18,
      },
      branding: {
        logoPlacement: "top-right",
        monogram: "AR",
        brandColor: "#B7791F",
        watermarkStyle: "subtle-corner",
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
    expect(screen.getByTestId("gallery-cover-scrim")).toHaveStyle({
      background:
        "radial-gradient(circle at 50% 45%, var(--cover-scrim-warm), var(--cover-scrim-soft-end) 72%)",
    });
    expect(screen.getByTestId("gallery-cover-title")).toHaveStyle({
      background: "var(--cover-text-backdrop-glass-bg)",
    });
    expect(screen.getAllByText("AR").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("gallery-scene-headers")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-scene-header-haldi")).toHaveTextContent(
      "Haldi",
    );
    expect(
      screen.getByRole("img", { name: "Haldi scene cover" }),
    ).toHaveAttribute("src", "/tests/photos/Wedding (43).jpg");
    expect(screen.queryByText("Mehendi")).not.toBeInTheDocument();
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

  it("renders no 'Play' control and does not auto-open when the gallery has no music", () => {
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[coverAsset, secondaryAsset]}
        branding={branding}
        slug="asha-ravi"
        hasMusic={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Play slideshow" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Existing behavior unchanged: View Gallery still anchors to the grid.
    expect(screen.getByRole("link", { name: /view gallery/i })).toHaveAttribute(
      "href",
      "#gallery-grid",
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

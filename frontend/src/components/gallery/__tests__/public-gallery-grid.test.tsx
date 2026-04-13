import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});

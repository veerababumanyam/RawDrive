import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicAsset } from "@/lib/api/galleries";
import { PublicGallerySlideshowLauncher } from "../public-gallery-slideshow-launcher";

// Decryption pipeline is exercised by the grid's own tests; here we stub it so
// the launcher test focuses on launch + music wiring.
vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: (asset: { id: string }) => ({
    src: `/resolved/${asset.id}.webp`,
    loading: false,
    error: null,
  }),
}));

// jsdom media stubs (the slideshow's audio-sync effect).
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

const assets: PublicAsset[] = [
  {
    id: "a1",
    filename: "one.jpg",
    content_type: "image/jpeg",
    thumbnail_urls: {},
    sort_order: 0,
  },
  {
    id: "a2",
    filename: "two.jpg",
    content_type: "image/jpeg",
    thumbnail_urls: {},
    sort_order: 1,
  },
];

describe("PublicGallerySlideshowLauncher", () => {
  it("renders a Play slideshow control and opens the slideshow on click", () => {
    render(
      <PublicGallerySlideshowLauncher
        slug="my-gallery"
        assets={assets}
        hasMusic={false}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play slideshow" }));

    expect(
      screen.getByRole("dialog", { name: "Gallery slideshow" }),
    ).toBeInTheDocument();
    // First slide resolved through the (mocked) decryption hook.
    expect(screen.getByAltText("one.jpg")).toHaveAttribute(
      "src",
      "/resolved/a1.webp",
    );
  });

  it("wires the gallery music URL into the slideshow when music is present", () => {
    render(
      <PublicGallerySlideshowLauncher
        slug="my-gallery"
        ws="studio-abc12345"
        assets={assets}
        hasMusic={true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play slideshow" }));

    const audio = screen.getByTestId("slideshow-audio");
    expect(audio.getAttribute("src")).toContain(
      "/api/v1/public/galleries/my-gallery/music",
    );
    expect(audio.getAttribute("src")).toContain("ws=studio-abc12345");
  });

  it("renders nothing when the gallery has no photos", () => {
    const { container } = render(
      <PublicGallerySlideshowLauncher
        slug="empty"
        assets={[]}
        hasMusic={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

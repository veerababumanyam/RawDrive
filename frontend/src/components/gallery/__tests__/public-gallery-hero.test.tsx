import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicGalleryHero } from "../public-gallery-hero";
import type { Gallery, GalleryBranding, PublicAsset } from "@/lib/api/galleries";

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
  it("renders studio identity and cover photo on the public gallery hero", () => {
    render(<PublicGalleryHero gallery={gallery} assets={[coverAsset]} branding={branding} />);

    expect(screen.getByText("Kaveri Stories")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Asha & Ravi" })).toHaveAttribute("src", weddingPhoto);
    expect(screen.getByRole("img", { name: "Kaveri Stories logo" })).toHaveAttribute(
      "src",
      expect.stringContaining("/api/v1/public/galleries/asha-ravi/branding/logo"),
    );
    expect(screen.getByRole("link", { name: /view gallery/i })).toHaveAttribute("href", "#gallery-grid");
  });

  it("falls back to RawDrive when plan branding is not customizable", () => {
    render(
      <PublicGalleryHero
        gallery={{ ...gallery, cover_template: "none" }}
        assets={[coverAsset]}
        branding={{ ...branding, can_customize: false }}
      />,
    );

    expect(screen.getByText("RawDrive")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Kaveri Stories logo" })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GalleriesPage from "../page";

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(),
  createGallery: vi.fn(),
  getAsset: vi.fn(),
  useDecryptedAssetUrl: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "token-1"),
}));

vi.mock("@/lib/api/authFetch", () => ({
  authFetch: mocks.authFetch,
}));

vi.mock("@/lib/api/assets", () => ({
  getAsset: mocks.getAsset,
}));

vi.mock("@/lib/api/crm", () => ({
  createContactAuth: vi.fn(),
  listContacts: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api/workspace-profile", () => ({
  getWorkspaceProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/api/galleries", () => ({
  createGallery: mocks.createGallery,
  deleteGallery: vi.fn(),
  updateGallery: vi.fn(),
  galleryPublicUrl: vi.fn((gallery: { slug: string }) => `https://app.rawdrive.test/g/${gallery.slug}`),
}));

vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: mocks.useDecryptedAssetUrl,
}));

function galleryWithDesignCover() {
  return {
    id: "gallery-1",
    workspace_id: "workspace-1",
    title: "UAT Test Gallery",
    slug: "uat-test-gallery",
    description: "",
    gallery_type: "delivery",
    is_published: false,
    max_selections: 0,
    status: "active",
    settings: {
      design_config: {
        cover: { assetId: "design-cover" },
      },
    },
    cover_thumbnails: {
      thumb_md_webp: "thumbnails/design-cover/thumb_md_webp.webp.enc",
    },
    created_at: "2026-06-02T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
  };
}

describe("GalleriesPage cover previews", () => {
  beforeEach(() => {
    mocks.authFetch.mockReset();
    mocks.createGallery.mockReset();
    mocks.getAsset.mockReset();
    mocks.useDecryptedAssetUrl.mockReset();
    mocks.useDecryptedAssetUrl.mockReturnValue({ src: "", loading: false, error: null });
  });

  it("fetches the Design Studio cover asset so encrypted thumbnails render with their manifest", async () => {
    mocks.authFetch.mockResolvedValue(
      new Response(JSON.stringify({ galleries: [galleryWithDesignCover()] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mocks.getAsset.mockResolvedValue({
      id: "design-cover",
      filename: "cover.jpg",
      content_type: "image/jpeg",
      status: "ready",
      thumbnail_urls: {
        thumb_md_webp: "thumbnails/design-cover/thumb_md_webp.webp.enc",
      },
      is_encrypted: true,
      media_encryption: {
        scheme: "rawdrive-e2ee-v1",
        variants: {
          thumb_md_webp: { scheme: "rawdrive-e2ee-v1" },
        },
      },
    });
    mocks.useDecryptedAssetUrl.mockImplementation((asset) => ({
      src: asset?.id === "design-cover" && asset?.media_encryption ? "blob:design-cover" : "",
      loading: false,
      error: null,
    }));

    render(<GalleriesPage />);

    await waitFor(() => {
      expect(mocks.getAsset).toHaveBeenCalledWith("token-1", "design-cover");
    });

    expect(await screen.findByRole("img", { name: "UAT Test Gallery cover" })).toHaveAttribute(
      "src",
      "blob:design-cover",
    );
  });

  it("clears stale create-gallery errors when the create form is cancelled", async () => {
    mocks.authFetch.mockResolvedValue(
      new Response(JSON.stringify({ galleries: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mocks.createGallery.mockRejectedValue(new Error("Failed to create gallery: create failed (500)"));

    render(<GalleriesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Create new gallery" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Sharma Wedding 2026"), {
      target: { value: "Reception" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Gallery" }));

    expect(await screen.findByText("Failed to create gallery: create failed (500)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Failed to create gallery: create failed (500)")).not.toBeInTheDocument();
  });
});

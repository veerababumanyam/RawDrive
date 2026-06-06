import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GalleriesPage from "../page";

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(),
  createGallery: vi.fn(),
  createGalleryShareLink: vi.fn(),
  getAsset: vi.fn(),
  updateGallery: vi.fn(),
  useDecryptedAssetUrl: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
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
  createGalleryShareLink: mocks.createGalleryShareLink,
  deleteGallery: vi.fn(),
  updateGallery: mocks.updateGallery,
  galleryPublicUrl: vi.fn(
    (gallery: { slug: string }) =>
      `https://app.rawdrive.test/g/${gallery.slug}`,
  ),
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

function galleryWithJoinedCover() {
  return {
    id: "gallery-1",
    workspace_id: "workspace-1",
    title: "UAT Test Gallery",
    slug: "uat-test-gallery",
    description: "",
    cover_asset_id: "first-upload",
    gallery_type: "delivery",
    is_published: false,
    max_selections: 0,
    status: "active",
    settings: {},
    cover_thumbnails: {
      thumb_md_webp: "thumbnails/first-upload/thumb_md_webp.webp.enc",
    },
    cover_asset: {
      id: "first-upload",
      filename: "first-upload.jpg",
      content_type: "image/jpeg",
      status: "ready",
      thumbnail_urls: {
        thumb_md_webp: "thumbnails/first-upload/thumb_md_webp.webp.enc",
      },
      is_encrypted: true,
      media_encryption: {
        scheme: "rawdrive-e2ee-v1",
        variants: {
          thumb_md_webp: { scheme: "rawdrive-e2ee-v1" },
        },
      },
    },
    created_at: "2026-06-02T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
  };
}

describe("GalleriesPage cover previews", () => {
  beforeEach(() => {
    mocks.authFetch.mockReset();
    mocks.createGallery.mockReset();
    mocks.createGalleryShareLink.mockReset();
    mocks.getAsset.mockReset();
    mocks.updateGallery.mockReset();
    mocks.useDecryptedAssetUrl.mockReset();
    mocks.useDecryptedAssetUrl.mockReturnValue({
      src: "",
      loading: false,
      error: null,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
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
      src:
        asset?.id === "design-cover" && asset?.media_encryption
          ? "blob:design-cover"
          : "",
      loading: false,
      error: null,
    }));

    render(<GalleriesPage />);

    await waitFor(() => {
      expect(mocks.getAsset).toHaveBeenCalledWith("token-1", "design-cover");
    });

    expect(
      await screen.findByRole("img", { name: "UAT Test Gallery cover" }),
    ).toHaveAttribute("src", "blob:design-cover");
  });

  it("renders the joined effective cover asset without a per-card asset fetch", async () => {
    mocks.authFetch.mockResolvedValue(
      new Response(JSON.stringify({ galleries: [galleryWithJoinedCover()] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mocks.useDecryptedAssetUrl.mockImplementation((asset) => ({
      src:
        asset?.id === "first-upload" && asset?.media_encryption
          ? "blob:first-upload"
          : "",
      loading: false,
      error: null,
    }));

    render(<GalleriesPage />);

    expect(
      await screen.findByRole("img", { name: "UAT Test Gallery cover" }),
    ).toHaveAttribute("src", "blob:first-upload");
    expect(mocks.getAsset).not.toHaveBeenCalled();
  });

  it("shows an encrypted-cover locked state when the gallery key is unavailable", async () => {
    mocks.authFetch.mockResolvedValue(
      new Response(JSON.stringify({ galleries: [galleryWithJoinedCover()] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mocks.useDecryptedAssetUrl.mockReturnValue({
      src: "",
      loading: false,
      error:
        "Photo key unavailable. Reopen with the gallery key or reupload this photo.",
    });

    render(<GalleriesPage />);

    expect(await screen.findByText("Encrypted photo locked")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Restore key" }),
    ).toBeInTheDocument();
    expect(mocks.getAsset).not.toHaveBeenCalled();
  });

  it("clears stale create-gallery errors when the create form is cancelled", async () => {
    mocks.authFetch.mockResolvedValue(
      new Response(JSON.stringify({ galleries: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mocks.createGallery.mockRejectedValue(
      new Error("Failed to create gallery: create failed (500)"),
    );

    render(<GalleriesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Create new gallery" }),
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Sharma Wedding 2026"), {
      target: { value: "Reception" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Gallery" }));

    expect(
      await screen.findByText("Failed to create gallery: create failed (500)"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Failed to create gallery: create failed (500)"),
    ).not.toBeInTheDocument();
  });

  it("creates a share token before copying the gallery card public link", async () => {
    mocks.authFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          galleries: [{ ...galleryWithDesignCover(), is_published: true }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    mocks.createGalleryShareLink.mockResolvedValue({
      id: "share-1",
      gallery_id: "gallery-1",
      token: "share-token",
      permissions: { access_mode: "public" },
      download_allowed: true,
      access_count: 0,
      created_at: "2026-06-03T00:00:00Z",
    });

    render(<GalleriesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Share UAT Test Gallery" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy link" }));

    await waitFor(() => {
      expect(mocks.createGalleryShareLink).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        {
          access_mode: "public",
          download_allowed: true,
          channel: "copy",
        },
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://app.rawdrive.test/g/uat-test-gallery?share=share-token",
    );
    expect(mocks.updateGallery).not.toHaveBeenCalled();
  });

  it("carries the gallery access window onto copied gallery card share links", async () => {
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mocks.authFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          galleries: [
            {
              ...galleryWithDesignCover(),
              is_published: true,
              expires_at: expiresAt,
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    mocks.createGalleryShareLink.mockResolvedValue({
      id: "share-1",
      gallery_id: "gallery-1",
      token: "share-token",
      permissions: { access_mode: "public" },
      download_allowed: true,
      access_count: 0,
      created_at: "2026-06-03T00:00:00Z",
    });

    render(<GalleriesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Share UAT Test Gallery" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy link" }));

    await waitFor(() => {
      expect(mocks.createGalleryShareLink).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        {
          access_mode: "public",
          download_allowed: true,
          channel: "copy",
          expiry_days: 30,
        },
      );
    });
    expect(mocks.updateGallery).not.toHaveBeenCalled();
  });

  it("shows a friendly manual-copy fallback when the browser blocks clipboard writes", async () => {
    mocks.authFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          galleries: [{ ...galleryWithDesignCover(), is_published: true }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    mocks.createGalleryShareLink.mockResolvedValue({
      id: "share-1",
      gallery_id: "gallery-1",
      token: "share-token",
      permissions: { access_mode: "public" },
      download_allowed: true,
      access_count: 0,
      created_at: "2026-06-03T00:00:00Z",
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException("blocked", "NotAllowedError")),
      },
    });

    render(<GalleriesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Share UAT Test Gallery" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy link" }));

    expect(
      await screen.findByText("Copy blocked by this browser"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Share link" })).toHaveValue(
      "https://app.rawdrive.test/g/uat-test-gallery?share=share-token",
    );
    expect(screen.queryByText(/Copy this link:/i)).not.toBeInTheDocument();
    expect(mocks.updateGallery).not.toHaveBeenCalled();
  });
});

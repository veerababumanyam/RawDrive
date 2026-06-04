import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/api/assets";

const mocks = vi.hoisted(() => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  useDecryptedAssetUrl: vi.fn(() => ({
    src: "blob:lightbox-photo",
    loading: false,
    error: null,
  })),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: mocks.getStoredAccessToken,
}));

vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: mocks.useDecryptedAssetUrl,
}));

import { PhotoLightbox } from "../photo-lightbox";

function photo(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-delete",
    workspace_id: "workspace-delete",
    filename: "DSC_7305.JPG",
    content_type: "image/jpeg",
    size_bytes: 1024,
    storage_key: "originals/asset-delete.jpg.enc",
    exif_data: {},
    thumbnail_urls: {
      display_webp: "derivatives/asset-delete/display_webp.webp.enc",
      thumb_lg_webp: "thumbnails/asset-delete/thumb_lg_webp.webp.enc",
    },
    status: "ready",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PhotoLightbox", () => {
  beforeEach(() => {
    mocks.getStoredAccessToken.mockClear();
    mocks.useDecryptedAssetUrl.mockClear();
  });

  it("shows a clearly destructive delete control and delegates confirmation to the gallery page", () => {
    const onDeleteRequest = vi.fn();
    const props = {
      asset: photo(),
      onClose: vi.fn(),
      hasPrev: false,
      hasNext: false,
      onDeleteRequest,
    };

    render(<PhotoLightbox {...props} />);

    const deleteButton = screen.getByRole("button", { name: "Delete photo" });
    // Destructive affordance comes from the design-system danger variant
    // (token-driven), not hardcoded color classes.
    expect(deleteButton).toHaveClass("glass-icon-button--danger");

    fireEvent.click(deleteButton);

    expect(onDeleteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-delete" }),
    );
  });

  it("moves focus into the modal dialog on open so aria-modal isn't lying", () => {
    render(
      <PhotoLightbox
        asset={photo()}
        onClose={vi.fn()}
        hasPrev={false}
        hasNext={false}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The focus trap moves focus into the dialog shell on open; without it,
    // keyboard focus stays on the page behind the modal.
    expect(document.activeElement).toBe(dialog);
  });

  it("does not render the low-contrast keyboard shortcut footer", () => {
    render(
      <PhotoLightbox
        asset={photo()}
        onClose={vi.fn()}
        hasPrev={false}
        hasNext={false}
      />,
    );

    expect(screen.queryByText("F Fullscreen")).toBeNull();
    expect(screen.queryByText("Esc Close")).toBeNull();
  });

  it("downloads the original directly without asking for a format", async () => {
    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation(
        (tagName: string, options?: ElementCreationOptions) => {
          const element = originalCreateElement(tagName, options);
          if (tagName.toLowerCase() === "a") {
            anchors.push(element as HTMLAnchorElement);
            vi.spyOn(element as HTMLAnchorElement, "click").mockImplementation(
              () => {},
            );
          }
          return element;
        },
      );

    try {
      render(
        <PhotoLightbox
          asset={photo({
            is_encrypted: false,
            storage_key: "originals/asset-delete.jpg",
          })}
          onClose={vi.fn()}
          hasPrev={false}
          hasNext={false}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: /download original/i }),
      );

      await waitFor(() => expect(anchors).toHaveLength(1));
      expect(anchors[0].download).toBe("DSC_7305.JPG");
      expect(anchors[0].href).toContain("/storage/originals/asset-delete.jpg");
      expect(anchors[0].href).not.toContain("token=");
      expect(screen.queryByText(/optimized webp/i)).toBeNull();
      expect(screen.queryByText(/thumbnail/i)).toBeNull();
    } finally {
      createElementSpy.mockRestore();
    }
  });

  it("keeps a submitted comment visible after persistence succeeds", async () => {
    const onComment = vi.fn().mockResolvedValue({
      id: "comment-1",
      asset_id: "asset-delete",
      author_name: "Studio",
      body: "Please retouch the flower garland.",
      created_at: "2026-06-02T08:30:00Z",
    });

    render(
      <PhotoLightbox
        asset={photo()}
        onClose={vi.fn()}
        hasPrev={false}
        hasNext={false}
        onComment={onComment}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /comments/i }));
    fireEvent.change(screen.getByPlaceholderText("Add a comment..."), {
      target: { value: "Please retouch the flower garland." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => {
      expect(onComment).toHaveBeenCalledWith(
        "asset-delete",
        "Please retouch the flower garland.",
      );
    });
    expect(
      await screen.findByText("Please retouch the flower garland."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No comments yet")).toBeNull();
  });
});

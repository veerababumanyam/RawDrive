import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FaceClusterDetail } from "../FaceClusterDetail";
import type { EncryptedAssetLike } from "@/lib/media-encryption/asset-media";

vi.mock("@/lib/api/ai", () => ({
  searchAssets: vi.fn(),
}));

// DecryptedThumb routes a tile through the client-side decrypt path
// (useDecryptedAssetUrl). We stub it so the test can assert this surface
// renders thumbnails THROUGH the decrypt component (and never via a raw
// getAssetPreviewUrl ciphertext <img>), and capture the asset it receives.
const decryptedThumbCalls: Array<{
  asset: EncryptedAssetLike | null | undefined;
  alt?: string;
}> = [];
vi.mock("@/components/gallery/decrypted-thumb", () => ({
  DecryptedThumb: (props: {
    asset: EncryptedAssetLike | null | undefined;
    alt?: string;
    className?: string;
  }) => {
    decryptedThumbCalls.push({ asset: props.asset, alt: props.alt });
    return (
      <img
        data-testid="decrypted-thumb"
        alt={props.alt ?? ""}
        className={props.className}
      />
    );
  },
}));

// getAssetPreviewUrl is the OLD raw-ciphertext path. Importing it lets the test
// fail loudly if the component reaches for it again.
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
vi.mock("@/lib/dashboard-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard-ui")>();
  return { ...actual, getAssetPreviewUrl: vi.fn(actual.getAssetPreviewUrl) };
});

import { searchAssets } from "@/lib/api/ai";

const mockSearchAssets = vi.mocked(searchAssets);

beforeEach(() => {
  vi.clearAllMocks();
  decryptedThumbCalls.length = 0;
});

describe("FaceClusterDetail", () => {
  it("renders thumbnails through DecryptedThumb, not the raw getAssetPreviewUrl ciphertext path", async () => {
    mockSearchAssets.mockResolvedValue({
      total: 1,
      results: [
        {
          asset_id: "a1",
          filename: "wedding.jpg",
          content_type: "image/jpeg",
          // E2EE gallery derivative: a .enc ciphertext key.
          thumbnail_urls: { thumb_md_webp: "g/a1/thumb_md.webp.enc" },
          similarity: 0.9,
        },
      ],
    });

    render(
      <FaceClusterDetail token="t" clusterLabel="c1" clusterName="Bride" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("decrypted-thumb")).toBeTruthy();
    });

    // The decrypt component received the asset...
    expect(decryptedThumbCalls).toHaveLength(1);
    const passed = decryptedThumbCalls[0].asset;
    expect(passed?.thumbnail_urls?.thumb_md_webp).toBe(
      "g/a1/thumb_md.webp.enc",
    );
    // ...and the encrypted derivative is flagged so the hook decrypts /
    // degrades honestly instead of rendering ciphertext.
    expect(passed?.is_encrypted).toBe(true);

    // The old raw ciphertext path is never used for the thumbnail.
    expect(getAssetPreviewUrl).not.toHaveBeenCalled();
  });

  it("shows the real cluster name in the header when one exists", async () => {
    mockSearchAssets.mockResolvedValue({ total: 0, results: [] });

    render(
      <FaceClusterDetail token="t" clusterLabel="c1" clusterName="Aisha" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Aisha")).toBeTruthy();
    });
    expect(screen.queryByText("Unknown Person")).toBeNull();
  });

  it("falls back to 'Unknown Person' only when the cluster has no name", async () => {
    mockSearchAssets.mockResolvedValue({ total: 0, results: [] });

    render(<FaceClusterDetail token="t" clusterLabel="c1" clusterName="" />);

    await waitFor(() => {
      expect(screen.getByText("Unknown Person")).toBeTruthy();
    });
  });
});

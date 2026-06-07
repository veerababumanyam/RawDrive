import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LockedMediaFallback,
  MediaKeyRecoveryBanner,
  useLockedMediaRecoverySummary,
} from "./media-key-recovery";
import {
  exportRawMediaKey,
  generateRawMediaKey,
} from "@/lib/media-encryption/media-crypto";
import {
  importGalleryMediaKeyFromInput,
  versionedGalleryKeyId,
} from "@/lib/media-encryption/media-key-store";
import type { EncryptedAssetLike } from "@/lib/media-encryption/asset-media";

function encryptedAsset(id: string, keyId: string): EncryptedAssetLike {
  return {
    id,
    filename: `${id}.webp`,
    is_encrypted: true,
    thumbnail_urls: {
      thumb_md_webp: `gallery/${id}/thumb_md.webp.enc`,
    },
    media_encryption: {
      scheme: "rawdrive-e2ee-v1",
      variants: {
        thumb_md_webp: {
          scheme: "rawdrive-e2ee-v1",
          algorithm: "AES-GCM",
          key_id: keyId,
          object_type: "thumb_md_webp",
          iv_b64: "iv",
          ciphertext_sha256: "sha",
          ciphertext_size: 1,
        },
      },
    },
  };
}

function SummaryProbe({
  assets,
  galleryId,
}: {
  assets: EncryptedAssetLike[];
  galleryId: string;
}) {
  const summary = useLockedMediaRecoverySummary(assets, galleryId);
  return (
    <div>
      <span data-testid="summary">
        {summary
          ? `${summary.lockedAssetCount}:${summary.keyGroupCount}`
          : "none"}
      </span>
      <MediaKeyRecoveryBanner summary={summary} />
    </div>
  );
}

describe("media key recovery UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/galleries/gallery-1");
  });

  it("summarizes locked encrypted assets by key group and clears as keys are imported", async () => {
    const galleryId = "gallery-1";
    const firstKey = await generateRawMediaKey();
    const secondKey = await generateRawMediaKey();
    const firstExport = await exportRawMediaKey(firstKey);
    const secondExport = await exportRawMediaKey(secondKey);
    const firstKeyId = await versionedGalleryKeyId(galleryId, firstExport);
    const secondKeyId = await versionedGalleryKeyId(galleryId, secondExport);

    render(
      <SummaryProbe
        galleryId={galleryId}
        assets={[
          encryptedAsset("asset-1", firstKeyId),
          encryptedAsset("asset-2", secondKeyId),
        ]}
      />,
    );

    expect(screen.getByTestId("summary")).toHaveTextContent("2:2");
    expect(
      screen.getByText("2 encrypted photos need 2 gallery keys"),
    ).toBeInTheDocument();

    await act(async () => {
      await importGalleryMediaKeyFromInput({
        galleryId,
        input: firstExport,
        expectedKeyIds: [firstKeyId],
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("summary")).toHaveTextContent("1:1");
    });
    expect(
      screen.getByText("1 encrypted photo needs the gallery key"),
    ).toBeInTheDocument();

    await act(async () => {
      await importGalleryMediaKeyFromInput({
        galleryId,
        input: secondExport,
        expectedKeyIds: [secondKeyId],
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("summary")).toHaveTextContent("none");
    });
  });

  it("uses caller-provided copy for compact fallback tiles", () => {
    render(
      <LockedMediaFallback
        asset={encryptedAsset("asset-1", "gallery:gallery-1")}
        error="Encrypted media fetch failed: 404"
        message="Preview unavailable. Refresh or regenerate thumbnails."
        mode="compact"
        allowRecovery={false}
      />,
    );

    expect(
      screen.getByText("Preview unavailable. Refresh or regenerate thumbnails."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Key needed")).not.toBeInTheDocument();
  });
});

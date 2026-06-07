"use client";

import { useEffect, useState } from "react";
import { searchAssets, type SearchResult } from "@/lib/api/ai";
import { DecryptedThumb } from "@/components/gallery/decrypted-thumb";
import type { EncryptedAssetLike } from "@/lib/media-encryption/asset-media";

interface FaceClusterDetailProps {
  token: string;
  clusterLabel: string;
  clusterName: string;
}

// A thumbnail key whose path ends in ".enc" is a client-E2EE ciphertext
// derivative. The global /ai/faces search response (SearchResult) does NOT
// carry the per-asset media_encryption manifest needed to decrypt those bytes
// (it is a cross-gallery surface, so the gallery key/manifest is not in scope).
// Rendering such a key as a plain <img src> shows ciphertext as a broken image.
function thumbnailKeyLooksEncrypted(key: string): boolean {
  return key.toLowerCase().split("?", 1)[0].endsWith(".enc");
}

function resultHasEncryptedThumbnail(result: SearchResult): boolean {
  return Object.values(result.thumbnail_urls ?? {}).some(
    (key) => typeof key === "string" && thumbnailKeyLooksEncrypted(key),
  );
}

// Map a search result to the asset shape the decrypt hook understands. When the
// derivative keys are encrypted we mark the asset as client-encrypted so
// useDecryptedAssetUrl routes it through the decrypt path: if the gallery key +
// manifest are available it decrypts, otherwise it degrades honestly to a locked
// fallback (never a raw-ciphertext <img>). Plaintext (legacy) galleries keep
// their storage URL and render directly. No N+1 fetch is introduced — each tile
// resolves its own already-fetched key in memory.
function toEncryptedAssetLike(result: SearchResult): EncryptedAssetLike {
  const encrypted = resultHasEncryptedThumbnail(result);
  return {
    id: result.asset_id,
    filename: result.filename,
    thumbnail_urls: result.thumbnail_urls ?? null,
    is_encrypted: encrypted,
    media_encryption: encrypted ? { scheme: "rawdrive-e2ee-v1" } : null,
  };
}

export function FaceClusterDetail({
  token,
  clusterLabel,
  clusterName,
}: FaceClusterDetailProps) {
  const requestKey = clusterLabel;
  const [requestState, setRequestState] = useState<{
    key: string;
    assets: SearchResult[];
  }>({
    key: "",
    assets: [],
  });

  const assets = requestState.key === requestKey ? requestState.assets : [];
  const loading = requestState.key !== requestKey;

  useEffect(() => {
    let ignore = false;

    searchAssets(token, `face:${clusterLabel}`)
      .then((data) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            assets: data.results,
          });
        }
      })
      .catch((error) => {
        console.error(error);
        if (!ignore) {
          setRequestState({
            key: requestKey,
            assets: [],
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [clusterLabel, requestKey, token]);

  return (
    <div>
      <h2 className="text-2xl font-semibold text-text-primary mb-1">
        {clusterName.trim() || "Unknown Person"}
      </h2>
      <p className="text-sm text-text-secondary mb-6">{assets.length} photos</p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {assets.map((asset) => (
            <div
              key={asset.asset_id}
              className="break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken"
            >
              <DecryptedThumb
                asset={toEncryptedAssetLike(asset)}
                alt={asset.ai_caption || asset.filename}
                className="w-full"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

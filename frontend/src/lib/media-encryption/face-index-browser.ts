"use client";

import { uploadAssetFaceIndexImage } from "@/lib/api/ai";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import {
  assetUsesClientMediaEncryption,
  originalManifest,
  pickAssetMediaCandidates,
  type EncryptedAssetLike,
  type PickedAssetMedia,
} from "./asset-media";
import { decryptBlobWithAvailableMediaKeys } from "./media-key-store";

export const FACE_INDEX_BROWSER_VARIANTS = [
  "display_webp",
  "thumb_lg_webp",
  "thumb_md_webp",
  "thumb_sm_webp",
] as const;

export type BrowserFaceIndexResult = {
  stored: number;
  variant: string;
  encrypted: boolean;
};

function storageFetchNeedsBearer(
  storageUrl: string,
  token?: string | null,
  assetAccessToken?: string | null,
): boolean {
  return Boolean(
    token && !assetAccessToken && storageUrl.includes("/storage/"),
  );
}

async function fetchStorageBlob(
  storageUrl: string,
  opts: {
    token?: string | null;
    assetAccessToken?: string | null;
    signal?: AbortSignal;
  },
): Promise<Blob> {
  const init: RequestInit = {
    credentials: "include",
    signal: opts.signal,
  };
  if (storageFetchNeedsBearer(storageUrl, opts.token, opts.assetAccessToken)) {
    init.headers = { Authorization: `Bearer ${opts.token}` };
  }
  const res = await fetch(storageUrl, init);
  if (!res.ok) throw new Error(`Face index media fetch failed: ${res.status}`);
  return res.blob();
}

// A frame is worth re-sending smaller when the server (or the proxy in front of
// it) rejected the body for being too big. The documented prod symptom is NOT a
// clean 413: the backend's MaxBytesReader resets the request body mid-read, so
// nginx returns a 502 / connection reset instead of a 413. Matching only
// "too large"/413 silently aborted those uploads with no downscale, so treat
// 502 / bad gateway / connection-reset / body-reset / generic network failures
// as retryable too — re-sending a smaller frame is the correct recovery for all
// of them, and a genuinely fatal error simply fails again on the smaller frame.
function canRetryWithSmallerVariant(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("too large") ||
    message.includes("413") ||
    message.includes("request entity too large") ||
    message.includes("payload too large") ||
    message.includes("failed to index faces") ||
    message.includes("502") ||
    message.includes("bad gateway") ||
    message.includes("upstream") ||
    message.includes("connection reset") ||
    message.includes("connection closed") ||
    message.includes("econnreset") ||
    message.includes("body reset") ||
    message.includes("body stream") ||
    message.includes("request body") ||
    message.includes("network error") ||
    message.includes("failed to fetch")
  );
}

function pickFaceIndexCandidates(
  asset: EncryptedAssetLike,
): PickedAssetMedia[] {
  const candidates = pickAssetMediaCandidates(
    asset,
    FACE_INDEX_BROWSER_VARIANTS,
  );
  const originalKey = asset.storage_key || asset.download_url;
  if (!originalKey) return candidates;
  const alreadyPicked = candidates.some(
    (candidate) => candidate.key === originalKey,
  );
  if (alreadyPicked) return candidates;
  return [
    ...candidates,
    {
      variant: "original",
      key: originalKey,
      manifest: originalManifest(asset),
    },
  ];
}

export async function indexAssetFacesFromBrowser(
  asset: EncryptedAssetLike,
  opts: {
    galleryId?: string;
    token?: string | null;
    assetAccessToken?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<BrowserFaceIndexResult> {
  if (!asset.id) throw new Error("Face index asset id is required");
  const candidates = pickFaceIndexCandidates(asset);
  if (candidates.length === 0) {
    throw new Error("No media file is available for FaceID indexing");
  }

  const encrypted = assetUsesClientMediaEncryption(asset);
  let lastError: unknown;
  let emptyResult: BrowserFaceIndexResult | null = null;
  for (const picked of candidates) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      const storageUrl = getStorageBackedUrl(
        picked.key,
        opts.token,
        opts.assetAccessToken,
      );
      const blob = await fetchStorageBlob(storageUrl, opts);
      if (encrypted && !picked.manifest) {
        throw new Error("Missing encrypted media manifest for FaceID indexing");
      }
      const plaintext = encrypted
        ? await decryptBlobWithAvailableMediaKeys(blob, picked.manifest!)
        : blob;
      try {
        const result = await uploadAssetFaceIndexImage(asset.id, plaintext, {
          galleryId: opts.galleryId,
          signal: opts.signal,
        });
        const browserResult = {
          stored: result.stored,
          variant: picked.variant,
          encrypted,
        };
        if (result.stored > 0) return browserResult;
        emptyResult = browserResult;
      } catch (err) {
        lastError = err;
        if (!canRetryWithSmallerVariant(err)) throw err;
      }
    } catch (err) {
      lastError = err;
      if (opts.signal?.aborted) throw err;
    }
  }

  if (emptyResult) return emptyResult;
  throw lastError instanceof Error
    ? lastError
    : new Error("FaceID indexing failed");
}

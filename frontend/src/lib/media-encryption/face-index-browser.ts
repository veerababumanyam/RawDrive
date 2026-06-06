"use client";

import { uploadAssetFaceIndexImage } from "@/lib/api/ai";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import {
  assetUsesClientMediaEncryption,
  pickAssetMediaCandidates,
  type EncryptedAssetLike,
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
  if (
    storageFetchNeedsBearer(storageUrl, opts.token, opts.assetAccessToken)
  ) {
    init.headers = { Authorization: `Bearer ${opts.token}` };
  }
  const res = await fetch(storageUrl, init);
  if (!res.ok) throw new Error(`Face index media fetch failed: ${res.status}`);
  return res.blob();
}

function canRetryWithSmallerVariant(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return message.includes("too large") || message.includes("413");
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
  const candidates = pickAssetMediaCandidates(asset, FACE_INDEX_BROWSER_VARIANTS);
  if (candidates.length === 0) {
    throw new Error("No WebP media derivative is available for FaceID indexing");
  }

  const encrypted = assetUsesClientMediaEncryption(asset);
  let lastError: unknown;
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
        return {
          stored: result.stored,
          variant: picked.variant,
          encrypted,
        };
      } catch (err) {
        lastError = err;
        if (!canRetryWithSmallerVariant(err)) throw err;
      }
    } catch (err) {
      lastError = err;
      if (opts.signal?.aborted) throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("FaceID indexing failed");
}

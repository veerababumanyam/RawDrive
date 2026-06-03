"use client";

import { useEffect, useMemo, useState } from "react";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { decryptBlobWithAvailableMediaKeys } from "./media-key-store";
import {
  assetUsesClientMediaEncryption,
  pickAssetMediaCandidates,
  type EncryptedAssetLike,
} from "./asset-media";
import { normalizeGalleryCacheKey } from "@/lib/offline/cache-keys";

export type DecryptedAssetUrlState = {
  src: string;
  loading: boolean;
  error: string | null;
};

/**
 * Try to resolve a storage URL from Cache Storage (offline-first).
 * Returns the cached Response on a hit, or null on a miss / if the
 * Cache API is not available (SSR, very old browser).
 */
async function matchCacheStorage(storageUrl: string): Promise<Response | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cacheKey = normalizeGalleryCacheKey(storageUrl);
    const hit = await caches.match(new Request(cacheKey));
    return hit ?? null;
  } catch {
    // caches.match can throw in some environments (e.g. opaque origins).
    return null;
  }
}

export function useDecryptedAssetUrl(
  asset: EncryptedAssetLike | null | undefined,
  variants: readonly string[],
  token?: string | null,
  assetAccessToken?: string | null,
): DecryptedAssetUrlState {
  const candidates = useMemo(() => pickAssetMediaCandidates(asset, variants), [asset, variants]);
  const [state, setState] = useState<DecryptedAssetUrlState>({
    src: "",
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function resolve(): Promise<void> {
      if (candidates.length === 0) {
        setState({ src: "", loading: false, error: null });
        return;
      }

      if (!assetUsesClientMediaEncryption(asset)) {
        const storageUrl = getStorageBackedUrl(candidates[0].key, token, assetAccessToken);
        // Synchronous first paint with the network URL — no empty-string flash. The
        // online grid and RTL's synchronous getByAltText rely on src being set on the
        // first commit.
        setState({ src: storageUrl, loading: false, error: null });
        // Offline upgrade: storage byte URLs are CROSS-ORIGIN and the Service Worker
        // does NOT intercept cross-origin requests (service-worker.js: url.origin !==
        // self.location.origin -> return; locked by service-worker-cache-policy.test.ts).
        // So offline serving for non-encrypted assets is client-managed: read the
        // rawdrive-offline-<galleryId> bucket and swap in the cached blob when present.
        void (async () => {
          const hit = await matchCacheStorage(storageUrl);
          if (!hit || cancelled) return;
          try {
            const blob = await hit.blob();
            if (cancelled) return;
            objectUrl = URL.createObjectURL(blob);
            setState({ src: objectUrl, loading: false, error: null });
          } catch {
            // Corrupt / quota-exhausted cache entry — keep the network URL already painted.
          }
        })();
        return;
      }

      setState({ src: "", loading: true, error: null });
      let lastError = "Encrypted media decrypt failed";
      try {
        for (const picked of candidates) {
          if (!picked.manifest) {
            lastError = "Missing encrypted media manifest";
            continue;
          }
          try {
            const storageUrl = getStorageBackedUrl(picked.key, token, assetAccessToken);

            // Encrypted branch: try Cache Storage first (offline copy),
            // fall back to network fetch.
            const cacheHit = await matchCacheStorage(storageUrl);
            let encryptedBlob: Blob;
            if (cacheHit) {
              encryptedBlob = await cacheHit.blob();
            } else {
              const fetchInit: RequestInit = { credentials: "include" };
              if (token) {
                fetchInit.headers = { Authorization: `Bearer ${token}` };
              }
              const res = await fetch(storageUrl, fetchInit);
              if (!res.ok) {
                throw new Error(`Encrypted media fetch failed: ${res.status}`);
              }
              encryptedBlob = await res.blob();
            }

            const plaintext = await decryptBlobWithAvailableMediaKeys(encryptedBlob, picked.manifest);
            // M1: only create the object URL when still mounted so it is
            // always paired with a revokeObjectURL in the cleanup.
            if (!cancelled) {
              objectUrl = URL.createObjectURL(plaintext);
              setState({ src: objectUrl, loading: false, error: null });
            }
            return;
          } catch (err) {
            lastError = err instanceof Error ? err.message : "Encrypted media decrypt failed";
          }
        }
        if (!cancelled) {
          setState({ src: "", loading: false, error: lastError });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            src: "",
            loading: false,
            error: err instanceof Error ? err.message : "Encrypted media decrypt failed",
          });
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, candidates, token, assetAccessToken]);

  return state;
}

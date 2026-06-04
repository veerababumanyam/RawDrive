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

function mediaKeyLooksEncrypted(key: string): boolean {
  return key.toLowerCase().split("?", 1)[0].endsWith(".enc");
}

function mediaManifestLooksEncrypted(manifest: unknown): boolean {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return false;
  }
  const value = manifest as Record<string, unknown>;
  return Boolean(
    value.scheme === "rawdrive-e2ee-v1" &&
    typeof value.algorithm === "string" &&
    typeof value.key_id === "string" &&
    typeof value.object_type === "string" &&
    typeof value.iv_b64 === "string" &&
    typeof value.ciphertext_sha256 === "string" &&
    typeof value.ciphertext_size === "number",
  );
}

function shouldFetchStorageWithBearer(
  storageUrl: string,
  token?: string | null,
  assetAccessToken?: string | null,
): boolean {
  return Boolean(
    token && !assetAccessToken && storageUrl.includes("/storage/"),
  );
}

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
  const candidates = useMemo(
    () => pickAssetMediaCandidates(asset, variants),
    [asset, variants],
  );
  const [state, setState] = useState<DecryptedAssetUrlState>({
    src: "",
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function resolve(): Promise<void> {
      async function publishClearStorageUrl(storageUrl: string): Promise<void> {
        if (
          !shouldFetchStorageWithBearer(storageUrl, token, assetAccessToken)
        ) {
          setState({ src: storageUrl, loading: false, error: null });
          return;
        }

        setState({ src: "", loading: true, error: null });
        try {
          const res = await fetch(storageUrl, {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            throw new Error(`Media fetch failed: ${res.status}`);
          }
          objectUrl = URL.createObjectURL(await res.blob());
          if (!cancelled) {
            setState({ src: objectUrl, loading: false, error: null });
          }
        } catch (err) {
          if (!cancelled) {
            setState({
              src: "",
              loading: false,
              error: err instanceof Error ? err.message : "Media fetch failed",
            });
          }
        }
      }

      if (candidates.length === 0) {
        setState({ src: "", loading: false, error: null });
        return;
      }

      if (!assetUsesClientMediaEncryption(asset)) {
        const storageUrl = getStorageBackedUrl(
          candidates[0].key,
          token,
          assetAccessToken,
        );
        // Bearer-aware first paint: publishClearStorageUrl fetches with an
        // Authorization header when a /storage/ URL needs it (dashboard user,
        // no asset-access token), otherwise it paints the URL synchronously —
        // no empty-string flash, which the online grid + RTL's synchronous
        // getByAltText rely on.
        await publishClearStorageUrl(storageUrl);
        // Offline upgrade: storage byte URLs are CROSS-ORIGIN and the Service
        // Worker does NOT intercept cross-origin requests (service-worker.js:
        // url.origin !== self.location.origin -> return; locked by
        // service-worker-cache-policy.test.ts). So offline serving for
        // non-encrypted assets is client-managed: read the
        // rawdrive-offline-<galleryId> bucket and swap in the cached blob when
        // present. Skipped on the bearer path, which already produced an
        // authenticated object URL above.
        if (!shouldFetchStorageWithBearer(storageUrl, token, assetAccessToken)) {
          void (async () => {
            const hit = await matchCacheStorage(storageUrl);
            if (!hit || cancelled) return;
            try {
              const blob = await hit.blob();
              if (cancelled) return;
              objectUrl = URL.createObjectURL(blob);
              setState({ src: objectUrl, loading: false, error: null });
            } catch {
              // Corrupt / quota-exhausted cache entry — keep the painted URL.
            }
          })();
        }
        return;
      }

      setState({ src: "", loading: true, error: null });
      let lastError = "Encrypted media decrypt failed";
      try {
        for (const picked of candidates) {
          const storageUrl = getStorageBackedUrl(
            picked.key,
            token,
            assetAccessToken,
          );
          if (
            !mediaKeyLooksEncrypted(picked.key) &&
            !mediaManifestLooksEncrypted(picked.manifest)
          ) {
            await publishClearStorageUrl(storageUrl);
            return;
          }
          if (!picked.manifest) {
            lastError = "Missing encrypted media manifest";
            continue;
          }
          try {
            // Encrypted branch: try Cache Storage first (offline copy),
            // fall back to a network fetch (with Authorization when a token
            // is present for protected bytes). Reuses the outer storageUrl.
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

            const plaintext = await decryptBlobWithAvailableMediaKeys(
              encryptedBlob,
              picked.manifest,
            );
            // M1: only create the object URL when still mounted so it is
            // always paired with a revokeObjectURL in the cleanup.
            if (!cancelled) {
              objectUrl = URL.createObjectURL(plaintext);
              setState({ src: objectUrl, loading: false, error: null });
            }
            return;
          } catch (err) {
            lastError =
              err instanceof Error
                ? err.message
                : "Encrypted media decrypt failed";
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
            error:
              err instanceof Error
                ? err.message
                : "Encrypted media decrypt failed",
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { decryptBlobWithAvailableMediaKeys } from "./media-key-store";
import {
  assetUsesClientMediaEncryption,
  pickAssetMediaCandidates,
  type EncryptedAssetLike,
} from "./asset-media";

export type DecryptedAssetUrlState = {
  src: string;
  loading: boolean;
  error: string | null;
};

export function useDecryptedAssetUrl(
  asset: EncryptedAssetLike | null | undefined,
  variants: readonly string[],
  token?: string | null,
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
        setState({ src: getStorageBackedUrl(candidates[0].key, token), loading: false, error: null });
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
            const storageUrl = getStorageBackedUrl(picked.key, token);
            const res = await fetch(storageUrl, { credentials: "same-origin" });
            if (!res.ok) {
              throw new Error(`Encrypted media fetch failed: ${res.status}`);
            }
            const encryptedBlob = await res.blob();
            const plaintext = await decryptBlobWithAvailableMediaKeys(encryptedBlob, picked.manifest);
            objectUrl = URL.createObjectURL(plaintext);
            if (!cancelled) {
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
  }, [asset, candidates, token]);

  return state;
}

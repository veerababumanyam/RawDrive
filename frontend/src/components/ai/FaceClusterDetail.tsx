"use client";

import { useEffect, useState } from "react";
import { searchAssets, type SearchResult } from "@/lib/api/ai";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";

interface FaceClusterDetailProps {
  token: string;
  clusterLabel: string;
  clusterName: string;
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
        {clusterName || "Unknown Person"}
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
              <img
                src={getAssetPreviewUrl(asset, token)}
                alt={asset.ai_caption || asset.filename}
                className="w-full"
                loading="lazy"
                decoding="async"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

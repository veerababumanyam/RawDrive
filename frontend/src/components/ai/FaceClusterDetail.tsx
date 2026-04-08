"use client";

import { useEffect, useState } from "react";
import { searchAssets, type SearchResult } from "@/lib/api/ai";

interface FaceClusterDetailProps {
  token: string;
  clusterLabel: string;
  clusterName: string;
}

export function FaceClusterDetail({ token, clusterLabel, clusterName }: FaceClusterDetailProps) {
  const [assets, setAssets] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    searchAssets(token, `face:${clusterLabel}`)
      .then((data) => setAssets(data.results))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, clusterLabel]);

  return (
    <div>
      <h2 className="text-2xl font-semibold text-text-primary mb-1">{clusterName || "Unknown Person"}</h2>
      <p className="text-sm text-text-secondary mb-6">{assets.length} photos</p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {assets.map((asset) => (
            <div key={asset.asset_id} className="break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken">
              <img
                src={asset.thumbnail_urls?.md || asset.thumbnail_urls?.sm || ""}
                alt={asset.ai_caption || asset.filename}
                className="w-full"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

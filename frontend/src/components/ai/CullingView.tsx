"use client";

import { useState } from "react";
import type { SearchResult, QualityScore } from "@/lib/api/ai";

interface CullingAsset extends SearchResult {
  quality?: QualityScore;
  decision?: "keep" | "review" | "reject";
}

interface CullingViewProps {
  assets: CullingAsset[];
  topPercent?: number;
  onApply?: (keepAssetIds: string[]) => void;
}

export function CullingView({ assets, topPercent = 20, onApply }: CullingViewProps) {
  const sorted = [...assets].sort((a, b) => (b.quality?.overall || 0) - (a.quality?.overall || 0));
  const keepCount = Math.ceil(sorted.length * (topPercent / 100));

  const [decisions, setDecisions] = useState<Record<string, "keep" | "review">>(() => {
    const d: Record<string, "keep" | "review"> = {};
    sorted.forEach((a, i) => {
      d[a.asset_id] = i < keepCount ? "keep" : "review";
    });
    return d;
  });

  const toggleDecision = (assetId: string) => {
    setDecisions((prev) => ({
      ...prev,
      [assetId]: prev[assetId] === "keep" ? "review" : "keep",
    }));
  };

  const keepIds = Object.entries(decisions)
    .filter(([, d]) => d === "keep")
    .map(([id]) => id);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary">
          Smart Culling — Top {topPercent}%
        </h3>
        <span className="text-sm text-text-secondary">
          {keepIds.length} of {assets.length} selected
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((asset) => (
          <button
            key={asset.asset_id}
            onClick={() => toggleDecision(asset.asset_id)}
            className={`relative rounded-lg overflow-hidden border-2 transition-colors min-h-[44px] ${
              decisions[asset.asset_id] === "keep"
                ? "border-accent"
                : "border-border-default opacity-60"
            }`}
          >
            <div className="aspect-square bg-surface-sunken flex items-center justify-center">
              {asset.thumbnail_urls?.sm ? (
                <img src={asset.thumbnail_urls.sm} alt={asset.filename} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span className="text-text-tertiary text-xs">Photo</span>
              )}
            </div>

            {asset.quality && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex gap-2 text-[10px] text-white">
                <span>S:{Math.round(asset.quality.sharpness * 100)}</span>
                <span>E:{Math.round(asset.quality.exposure * 100)}</span>
                <span>C:{Math.round(asset.quality.composition * 100)}</span>
              </div>
            )}

            {decisions[asset.asset_id] === "keep" && (
              <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => onApply?.(keepIds)}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent/90 min-h-[44px]"
        >
          Apply Selection ({keepIds.length} photos)
        </button>
      </div>
    </div>
  );
}

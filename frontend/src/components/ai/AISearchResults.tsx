"use client";

import type { SearchResult } from "@/lib/api/ai";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";

interface AISearchResultsProps {
  results: SearchResult[];
  loading?: boolean;
}

export function AISearchResults({ results, loading }: AISearchResultsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
      {results.map((result) => (
        <div
          key={result.asset_id}
          className="break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken group relative"
        >
          <img
            src={getAssetPreviewUrl(result)}
            alt={result.ai_caption || result.filename}
            className="w-full"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-surface-scrim-strong/60 to-transparent">
            <div className="flex items-center justify-between">
              <span className="text-text-media text-xs font-medium">
                {Math.round(result.similarity * 100)}%
              </span>
              {result.ai_caption && (
                <span className="text-text-media/80 text-xs truncate ml-2">
                  {result.ai_caption}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { searchAssets, type SearchResult } from "@/lib/api/ai";

interface AISearchBarProps {
  token: string;
  galleryId?: string;
  onResults?: (results: SearchResult[]) => void;
}

export function AISearchBar({ token, galleryId, onResults }: AISearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setHasSearched(false);
        onResults?.([]);
        return;
      }
      setLoading(true);
      try {
        const data = await searchAssets(token, q, galleryId);
        setResults(data.results);
        setHasSearched(true);
        onResults?.(data.results);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    },
    [token, galleryId, onResults]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search photos with natural language..."
          className="w-full rounded-xl border border-border-default bg-surface-raised px-4 py-3 pl-10 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px]"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin rounded-full border-2 border-border-default border-t-accent" />
        )}
      </div>

      {hasSearched && results.length === 0 && !loading && (
        <p className="text-center text-text-tertiary text-sm py-8">No results found for &ldquo;{query}&rdquo;</p>
      )}

      {results.length > 0 && (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {results.map((result) => (
            <div key={result.asset_id} className="break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken group relative">
              <img
                src={result.thumbnail_urls?.md || result.thumbnail_urls?.sm || ""}
                alt={result.ai_caption || result.filename}
                className="w-full"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-medium">{Math.round(result.similarity * 100)}% match</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listGalleries, type Gallery } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { galleryStatusClasses, galleryTypeClasses } from "@/lib/dashboard-ui";

export default function GalleriesPage() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const token = getStoredAccessToken();
    listGalleries(token)
      .then(setGalleries)
      .catch((err) => { setError(err?.message || "Failed to load galleries"); setGalleries([]); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Galleries</h1>
          <p className="text-sm text-text-secondary mt-1">
            {galleries.length} {galleries.length === 1 ? "gallery" : "galleries"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "segmented-control-button h-11 w-11 p-0",
              viewMode === "grid"
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
            )}
            aria-label="Grid view"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "segmented-control-button h-11 w-11 p-0",
              viewMode === "list"
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
            )}
            aria-label="List view"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </button>
        </div>
      </div>

      {galleries.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-sunken flex items-center justify-center">
            <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
          <p className="text-text-secondary">No galleries yet. Create your first gallery to get started.</p>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          }
        >
          {galleries.map((g) => (
            <Link
              key={g.id}
              href={`/galleries/${g.id}`}
              className={`
                block rounded-xl border border-border-default bg-surface-raised
                hover:border-accent/30 hover:shadow-elevation-1 transition-all duration-200
                ${viewMode === "grid" ? "p-4 space-y-3" : "p-4 flex items-center gap-4"}
              `}
            >
              <div className={viewMode === "grid" ? "" : "flex-1 min-w-0"}>
                <h3 className="font-medium text-text-primary truncate">{g.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      galleryTypeClasses[g.gallery_type] || "status-badge status-badge--neutral",
                    )}
                  >
                    {g.gallery_type}
                  </span>
                  <span
                    className={cn(
                      galleryStatusClasses[g.status] || "status-badge status-badge--neutral",
                    )}
                  >
                    {g.status}
                  </span>
                  {g.is_published && <span className="status-badge status-badge--success">Published</span>}
                </div>
              </div>
              <span className="text-xs text-text-tertiary">
                {new Date(g.created_at).toLocaleDateString("en-IN")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

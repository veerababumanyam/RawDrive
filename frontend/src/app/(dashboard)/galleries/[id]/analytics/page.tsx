"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getGallery, type Gallery } from "@/lib/api/galleries";
import { getAnalyticsSummary, getAnalyticsDaily, type AnalyticsSummary, type AnalyticsDaily } from "@/lib/api/analytics";

export default function GalleryAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [daily, setDaily] = useState<AnalyticsDaily[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;

    setLoading(true);
    Promise.all([
      getGallery(token, id),
      getAnalyticsSummary(token, id, days),
      getAnalyticsDaily(token, id, days),
    ]).then(([g, s, d]) => {
      setGallery(g);
      setSummary(s);
      setDaily(d || []);
    }).catch(() => {
      setSummary({ views: 0, unique_visitors: 0, downloads: 0, favorites: 0, shares: 0 });
    }).finally(() => setLoading(false));
  }, [id, days]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-72 rounded bg-surface-sunken" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 rounded-2xl bg-surface-sunken" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="space-y-3">
        <Link href={`/galleries/${id}`} className="btn-tertiary px-0 py-0 text-sm">
          Back to gallery
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
            {gallery && (
              <p className="mt-1 text-sm text-text-secondary">{gallery.title}</p>
            )}
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  days === d ? "bg-accent/20 text-accent font-medium" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Views" value={summary.views} />
          <StatCard label="Visitors" value={summary.unique_visitors} />
          <StatCard label="Downloads" value={summary.downloads} />
          <StatCard label="Favorites" value={summary.favorites} />
          <StatCard label="Shares" value={summary.shares} />
        </div>
      )}

      {/* Daily Chart (simple bar visualization) */}
      {daily.length > 0 && (
        <div className="surface-panel p-6">
          <h2 className="text-lg font-medium text-text-primary mb-4">Daily Views</h2>
          <div className="flex items-end gap-1 h-40">
            {daily.map((d, i) => {
              const maxViews = Math.max(...daily.map(x => x.views), 1);
              const height = (d.views / maxViews) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 bg-accent/60 rounded-t-sm hover:bg-accent transition-colors"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${new Date(d.date).toLocaleDateString()}: ${d.views} views`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-text-tertiary">
            <span>{daily.length > 0 ? new Date(daily[0].date).toLocaleDateString() : ""}</span>
            <span>{daily.length > 0 ? new Date(daily[daily.length - 1].date).toLocaleDateString() : ""}</span>
          </div>
        </div>
      )}

      {daily.length === 0 && !loading && (
        <div className="surface-panel px-6 py-14 text-center text-sm text-text-secondary">
          No analytics data yet. Analytics will appear as clients view and interact with your gallery.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-panel p-4 text-center">
      <p className="text-2xl font-bold text-text-primary">{value.toLocaleString()}</p>
      <p className="text-sm text-text-secondary mt-1">{label}</p>
    </div>
  );
}

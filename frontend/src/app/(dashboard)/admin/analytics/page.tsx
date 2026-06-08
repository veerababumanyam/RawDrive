"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getEngagementMetrics,
  getGrowthMetrics,
  getFeatureAdoption,
  type EngagementMetrics,
  type GrowthMetrics,
  type FeatureAdoption,
} from "@/lib/api/admin";

function formatNum(n: number): string {
  return n.toLocaleString("en-IN");
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-low/40 glass-blur-medium border border-text-media/5 p-6 rounded-2xl">
      <p className="text-micro uppercase text-text-secondary font-label">
        {label}
      </p>
      <p className="text-3xl font-bold text-text-primary font-headline mt-2">
        {value}
      </p>
    </div>
  );
}

const ANALYTICS_PAGE_SIZE = 20;

export default function AdminAnalyticsPage() {
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [features, setFeatures] = useState<FeatureAdoption[]>([]);
  const [featurePage, setFeaturePage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    Promise.all([
      getEngagementMetrics(token),
      getGrowthMetrics(token),
      getFeatureAdoption(token),
    ])
      .then(([eng, gro, feat]) => {
        setEngagement(eng);
        setGrowth(gro);
        setFeatures(feat);
        setError(null);
      })
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-text-secondary">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-feedback-error">{error}</p>
      </div>
    );
  }

  const totalFeaturePages = Math.ceil(features.length / ANALYTICS_PAGE_SIZE);
  const pagedFeatures = features.slice(
    featurePage * ANALYTICS_PAGE_SIZE,
    (featurePage + 1) * ANALYTICS_PAGE_SIZE,
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="font-headline text-4xl font-extrabold text-text-primary">
          Analytics & Engagement
        </h2>
        <p className="text-text-secondary mt-2 font-body text-sm">
          Monitor platform growth, engagement, and feature adoption.
        </p>
      </div>

      {engagement && (
        <div>
          <h3 className="font-headline text-xl font-bold text-text-primary mb-4">
            Engagement
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label="DAU" value={formatNum(engagement.dau)} />
            <MetricCard label="WAU" value={formatNum(engagement.wau)} />
            <MetricCard label="MAU" value={formatNum(engagement.mau)} />
            <MetricCard
              label="Uploads Today"
              value={formatNum(engagement.uploads_today)}
            />
            <MetricCard
              label="Galleries Created"
              value={String(engagement.galleries_created)}
            />
            <MetricCard
              label="Avg Session"
              value={`${engagement.avg_session_minutes} min`}
            />
          </div>
        </div>
      )}

      {growth && (
        <div>
          <h3 className="font-headline text-xl font-bold text-text-primary mb-4">
            Growth
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label="Total Users"
              value={formatNum(growth.total_users)}
            />
            <MetricCard
              label="New Today"
              value={String(growth.new_users_today)}
            />
            <MetricCard
              label="New This Week"
              value={formatNum(growth.new_users_week)}
            />
            <MetricCard
              label="New This Month"
              value={formatNum(growth.new_users_month)}
            />
          </div>
        </div>
      )}

      {features.length > 0 && (
        <div>
          <h3 className="font-headline text-xl font-bold text-text-primary mb-4">
            Feature Adoption
          </h3>
          <div className="bg-surface-container-low/20 border border-text-media/5 rounded-2xl overflow-hidden glass-blur-subtle">
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-text-secondary font-label text-micro uppercase">
                    <th className="px-6 py-4 font-semibold">Feature</th>
                    <th className="px-6 py-4 font-semibold">Adoption</th>
                    <th className="px-6 py-4 font-semibold">Active Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-text-media/5">
                  {pagedFeatures.map((f) => (
                    <tr
                      key={f.feature}
                      className="hover:bg-surface-overlay/10 transition-colors"
                    >
                      <td className="px-6 py-5 text-sm font-semibold text-text-primary">
                        {f.feature}
                      </td>
                      <td className="px-6 py-5 text-sm text-accent font-bold">
                        {f.adoption_pct}%
                      </td>
                      <td className="px-6 py-5 text-sm text-text-tertiary">
                        {formatNum(f.active_users)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalFeaturePages > 1 && (
              <div className="flex items-center justify-between border-t border-text-media/5 bg-surface-container-low/40 px-6 py-3 text-sm text-text-secondary">
                <span>
                  Page {featurePage + 1} of {totalFeaturePages} (
                  {features.length} features)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFeaturePage((p) => p - 1)}
                    disabled={featurePage === 0}
                    className="rounded-lg border border-text-media/10 px-3 py-1.5 text-xs hover:bg-surface-overlay/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeaturePage((p) => p + 1)}
                    disabled={featurePage >= totalFeaturePages - 1}
                    className="rounded-lg border border-text-media/10 px-3 py-1.5 text-xs hover:bg-surface-overlay/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

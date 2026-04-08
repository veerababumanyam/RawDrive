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

export default function AdminAnalyticsPage() {
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [features, setFeatures] = useState<FeatureAdoption[]>([]);
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-text-secondary">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-semantic-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold text-text-primary">Analytics & Engagement</h1>

      {engagement && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Engagement</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label="DAU" value={formatNum(engagement.dau)} />
            <MetricCard label="WAU" value={formatNum(engagement.wau)} />
            <MetricCard label="MAU" value={formatNum(engagement.mau)} />
            <MetricCard label="Uploads Today" value={formatNum(engagement.uploads_today)} />
            <MetricCard label="Galleries Created" value={String(engagement.galleries_created)} />
            <MetricCard label="Avg Session" value={`${engagement.avg_session_minutes} min`} />
          </div>
        </div>
      )}

      {growth && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Growth</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Total Users" value={formatNum(growth.total_users)} />
            <MetricCard label="New Today" value={String(growth.new_users_today)} />
            <MetricCard label="New This Week" value={formatNum(growth.new_users_week)} />
            <MetricCard label="New This Month" value={formatNum(growth.new_users_month)} />
          </div>
        </div>
      )}

      {features.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Feature Adoption</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
                  <th className="pb-2 font-medium">Feature</th>
                  <th className="pb-2 font-medium">Adoption</th>
                  <th className="pb-2 font-medium">Active Users</th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.feature} className="border-b border-border-default">
                    <td className="py-3 text-text-primary">{f.feature}</td>
                    <td className="py-3 text-text-secondary">{f.adoption_pct}%</td>
                    <td className="py-3 text-text-secondary">{formatNum(f.active_users)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel p-4 rounded-xl">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
    </div>
  );
}

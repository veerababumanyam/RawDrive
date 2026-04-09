"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getEngagementMetrics, getGrowthMetrics, getFeatureAdoption, type EngagementMetrics, type GrowthMetrics, type FeatureAdoption } from "@/lib/api/admin";

function formatNum(n: number): string { return n.toLocaleString("en-IN"); }

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-text-secondary font-label">{label}</p>
      <p className="text-3xl font-bold text-on-surface font-headline mt-2">{value}</p>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [features, setFeatures] = useState<FeatureAdoption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    Promise.all([getEngagementMetrics(token), getGrowthMetrics(token), getFeatureAdoption(token)])
      .then(([eng, gro, feat]) => { setEngagement(eng); setGrowth(gro); setFeatures(feat); setError(null); })
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-text-secondary">Loading analytics...</p></div>;
  if (error) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-feedback-error">{error}</p></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Analytics & Engagement</h2>
        <p className="text-text-secondary mt-2 font-body text-sm">Monitor platform growth, engagement, and feature adoption.</p>
      </div>

      {engagement && (
        <div>
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Engagement</h3>
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
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Growth</h3>
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
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Feature Adoption</h3>
          <div className="bg-surface-container-low/20 border border-white/[0.03] rounded-2xl overflow-hidden backdrop-blur-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-text-secondary font-label text-[10px] uppercase tracking-[0.1em]">
                  <th className="px-6 py-4 font-semibold">Feature</th>
                  <th className="px-6 py-4 font-semibold">Adoption</th>
                  <th className="px-6 py-4 font-semibold">Active Users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {features.map((f) => (
                  <tr key={f.feature} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-5 text-sm font-semibold text-on-surface">{f.feature}</td>
                    <td className="px-6 py-5 text-sm text-primary font-bold">{f.adoption_pct}%</td>
                    <td className="px-6 py-5 text-sm text-text-tertiary">{formatNum(f.active_users)}</td>
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

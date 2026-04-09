"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getRevenueDashboard, getRevenueTimeSeries, type RevenueData, type RevenueTimeSeries } from "@/lib/api/admin";

function formatINR(paisa: number): string {
  return (paisa / 100).toLocaleString("en-IN");
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-text-secondary font-label">{label}</p>
      <p className={`text-3xl font-bold font-headline mt-2 ${accent ? "text-primary" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}

export default function AdminRevenuePage() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [timeSeries, setTimeSeries] = useState<RevenueTimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    Promise.all([getRevenueDashboard(token), getRevenueTimeSeries(token, { period: "monthly" })])
      .then(([rev, ts]) => { setRevenue(rev); setTimeSeries(ts); setError(null); })
      .catch(() => setError("Failed to load revenue data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-text-secondary">Loading revenue data...</p></div>;
  if (error || !revenue) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-feedback-error">{error || "No data"}</p></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Revenue Dashboard</h2>
        <p className="text-text-secondary mt-2 font-body text-sm">MRR, ARR, churn, and state-wise revenue breakdown.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="MRR" value={`₹${formatINR(revenue.mrr_paisa)}`} accent />
        <MetricCard label="ARR" value={`₹${formatINR(revenue.arr_paisa)}`} accent />
        <MetricCard label="Churn Rate" value={`${revenue.churn_rate}%`} />
        <MetricCard label="Subscribers" value={String(revenue.total_subscribers)} />
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">State Breakdown</h3>
        <div className="bg-surface-container-low/20 border border-white/[0.03] rounded-2xl overflow-hidden backdrop-blur-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-text-secondary font-label text-[10px] uppercase tracking-[0.1em]">
                <th className="px-6 py-4 font-semibold">State</th>
                <th className="px-6 py-4 font-semibold">Revenue</th>
                <th className="px-6 py-4 font-semibold">Subscribers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {revenue.state_breakdown.map((s) => (
                <tr key={s.state_name} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-5 text-sm font-semibold text-on-surface">{s.state_name}</td>
                  <td className="px-6 py-5 text-sm text-primary font-medium">₹{formatINR(s.revenue_paisa)}</td>
                  <td className="px-6 py-5 text-sm text-text-tertiary">{s.subscriber_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {timeSeries.length > 0 && (
        <div>
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Monthly Trend</h3>
          <div className="bg-surface-container-low/20 border border-white/[0.03] rounded-2xl overflow-hidden backdrop-blur-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-text-secondary font-label text-[10px] uppercase tracking-[0.1em]">
                  <th className="px-6 py-4 font-semibold">Period</th>
                  <th className="px-6 py-4 font-semibold">Revenue</th>
                  <th className="px-6 py-4 font-semibold">Subscribers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {timeSeries.map((ts) => (
                  <tr key={ts.period} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-5 text-sm text-on-surface">{ts.period}</td>
                    <td className="px-6 py-5 text-sm text-primary font-medium">₹{formatINR(ts.revenue_paisa)}</td>
                    <td className="px-6 py-5 text-sm text-text-tertiary">{ts.subscribers}</td>
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

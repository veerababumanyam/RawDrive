"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getRevenueDashboard,
  getRevenueTimeSeries,
  type RevenueData,
  type RevenueTimeSeries,
} from "@/lib/api/admin";

function formatINR(paisa: number): string {
  const rupees = paisa / 100;
  return rupees.toLocaleString("en-IN");
}

export default function AdminRevenuePage() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [timeSeries, setTimeSeries] = useState<RevenueTimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    Promise.all([
      getRevenueDashboard(token),
      getRevenueTimeSeries(token, { period: "monthly" }),
    ])
      .then(([rev, ts]) => {
        setRevenue(rev);
        setTimeSeries(ts);
        setError(null);
      })
      .catch(() => setError("Failed to load revenue data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-text-secondary">Loading revenue data...</p>
      </div>
    );
  }

  if (error || !revenue) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-semantic-destructive">{error || "No data"}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Revenue Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="MRR" value={`₹${formatINR(revenue.mrr_paisa)}`} />
        <MetricCard label="ARR" value={`₹${formatINR(revenue.arr_paisa)}`} />
        <MetricCard label="Churn Rate" value={`${revenue.churn_rate}%`} />
        <MetricCard label="Subscribers" value={String(revenue.total_subscribers)} />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">State Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="pb-2 font-medium">State</th>
                <th className="pb-2 font-medium">Revenue</th>
                <th className="pb-2 font-medium">Subscribers</th>
              </tr>
            </thead>
            <tbody>
              {revenue.state_breakdown.map((s) => (
                <tr key={s.state_name} className="border-b border-border-default">
                  <td className="py-3 text-text-primary">{s.state_name}</td>
                  <td className="py-3 text-text-secondary">₹{formatINR(s.revenue_paisa)}</td>
                  <td className="py-3 text-text-secondary">{s.subscriber_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {timeSeries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Monthly Trend</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Revenue</th>
                  <th className="pb-2 font-medium">Subscribers</th>
                </tr>
              </thead>
              <tbody>
                {timeSeries.map((ts) => (
                  <tr key={ts.period} className="border-b border-border-default">
                    <td className="py-3 text-text-primary">{ts.period}</td>
                    <td className="py-3 text-text-secondary">₹{formatINR(ts.revenue_paisa)}</td>
                    <td className="py-3 text-text-secondary">{ts.subscribers}</td>
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

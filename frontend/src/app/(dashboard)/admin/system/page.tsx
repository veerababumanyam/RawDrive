"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getSystemMetrics, type SystemMetrics } from "@/lib/api/admin";

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function AdminSystemPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    getSystemMetrics(token)
      .then((data) => {
        setMetrics(data);
        setError(null);
      })
      .catch(() => setError("Failed to load system metrics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-text-secondary">Loading system metrics...</p>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-semantic-destructive">{error || "No data"}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold text-text-primary">System Health</h1>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">API Latency</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard label="p50" value={`${metrics.api_latency_p50_ms} ms`} />
          <MetricCard label="p95" value={`${metrics.api_latency_p95_ms} ms`} />
          <MetricCard label="p99" value={`${metrics.api_latency_p99_ms} ms`} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Infrastructure</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Error Rate" value={`${metrics.error_rate_pct}%`} />
          <MetricCard label="Queue Depth" value={String(metrics.queue_depth)} />
          <MetricCard label="Storage" value={formatBytes(metrics.storage_used_bytes)} />
          <MetricCard label="CPU" value={`${metrics.cpu_usage_pct}%`} />
          <MetricCard label="Memory" value={`${metrics.memory_usage_pct}%`} />
          <MetricCard label="Disk" value={`${metrics.disk_usage_pct}%`} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Uptime</h2>
        <div className="surface-panel p-4 rounded-xl inline-block">
          <p className="text-sm text-text-secondary">System Uptime</p>
          <p className="text-2xl font-bold text-text-primary mt-1">
            {formatUptime(metrics.uptime_seconds)}
          </p>
        </div>
      </div>
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

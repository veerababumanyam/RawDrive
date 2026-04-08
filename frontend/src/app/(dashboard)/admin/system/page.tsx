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

function LatencyCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  const color = value < 50 ? "text-secondary" : value < 100 ? "text-amber-400" : "text-red-400";
  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-label">{label}</p>
      <p className={`text-3xl font-bold font-headline mt-2 ${color}`}>{value} <span className="text-sm font-normal text-gray-500">{unit}</span></p>
    </div>
  );
}

function InfraCard({ label, value, unit, pct }: { label: string; value: string; unit?: string; pct?: number }) {
  const color = pct !== undefined ? (pct < 60 ? "text-emerald-400" : pct < 80 ? "text-amber-400" : "text-red-400") : "text-on-surface";
  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-label">{label}</p>
      <p className={`text-3xl font-bold font-headline mt-2 ${color}`}>
        {value}{unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
      </p>
      {pct !== undefined && (
        <div className="mt-3 w-full h-1.5 rounded-full bg-surface-container-lowest overflow-hidden">
          <div className={`h-full rounded-full ${pct < 60 ? "bg-emerald-400" : pct < 80 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function AdminSystemPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    getSystemMetrics(token)
      .then((data) => { setMetrics(data); setError(null); })
      .catch(() => setError("Failed to load system metrics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-gray-500">Loading system metrics...</p></div>;
  if (error || !metrics) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-red-400">{error || "No data"}</p></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">System Health</h2>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          All Systems Operational
        </span>
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">API Latency</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <LatencyCard label="p50" value={metrics.api_latency_p50_ms} unit="ms" />
          <LatencyCard label="p95" value={metrics.api_latency_p95_ms} unit="ms" />
          <LatencyCard label="p99" value={metrics.api_latency_p99_ms} unit="ms" />
        </div>
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Infrastructure</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <InfraCard label="Error Rate" value={`${metrics.error_rate_pct}%`} pct={metrics.error_rate_pct * 10} />
          <InfraCard label="Queue Depth" value={String(metrics.queue_depth)} />
          <InfraCard label="Storage" value={formatBytes(metrics.storage_used_bytes)} />
          <InfraCard label="CPU" value={`${metrics.cpu_usage_pct}%`} pct={metrics.cpu_usage_pct} />
          <InfraCard label="Memory" value={`${metrics.memory_usage_pct}%`} pct={metrics.memory_usage_pct} />
          <InfraCard label="Disk" value={`${metrics.disk_usage_pct}%`} pct={metrics.disk_usage_pct} />
        </div>
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Uptime</h3>
        <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-8 rounded-2xl inline-block">
          <p className="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-label">System Uptime</p>
          <p className="text-5xl font-bold text-on-surface font-headline mt-2">{formatUptime(metrics.uptime_seconds)}</p>
        </div>
      </div>
    </div>
  );
}

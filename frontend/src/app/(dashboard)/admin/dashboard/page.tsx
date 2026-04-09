"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  Users,
  LayoutGrid,
  TrendingUp,
  Server,
} from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-card flex items-start gap-4 rounded-2xl p-6">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-text-tertiary">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{value}</p>
      </div>
    </div>
  );
}

interface DashboardData {
  totalUsers: string;
  activeWorkspaces: string;
  monthlyRevenue: string;
  systemStatus: string;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Aggregate from existing admin endpoints
    Promise.all([
      fetch("/api/v1/admin/users?limit=1", { headers }).then((r) => r.ok ? r.json() : null),
      fetch("/api/v1/admin/workspaces?limit=1", { headers }).then((r) => r.ok ? r.json() : null),
      fetch("/api/v1/admin/revenue", { headers }).then((r) => r.ok ? r.json() : null),
      fetch("/api/v1/admin/system/metrics", { headers }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([users, workspaces, revenue, system]) => {
        setData({
          totalUsers: users?.total != null ? Number(users.total).toLocaleString("en-IN") : "--",
          activeWorkspaces: workspaces?.total != null ? Number(workspaces.total).toLocaleString("en-IN") : "--",
          monthlyRevenue: revenue?.mrr != null ? `\u20B9${Number(revenue.mrr).toLocaleString("en-IN")}` : "--",
          systemStatus: system?.api_latency_ms != null ? "Healthy" : "--",
        });
      })
      .catch(() => setError(true));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Dashboard Overview
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Platform health and key metrics at a glance.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          Failed to load platform stats. The admin API may be unreachable.
        </div>
      )}

      {/* KPI Cards — aggregated from existing admin API endpoints */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total Users" value={data?.totalUsers ?? "--"} />
        <StatCard icon={LayoutGrid} label="Active Workspaces" value={data?.activeWorkspaces ?? "--"} />
        <StatCard icon={TrendingUp} label="Monthly Revenue" value={data?.monthlyRevenue ?? "--"} />
        <StatCard icon={Server} label="System Status" value={data?.systemStatus ?? "--"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card col-span-2 rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Recent Registrations
          </h2>
          <p className="text-sm text-text-tertiary">
            User registration data will load from the admin API.
          </p>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            System Alerts
          </h2>
          <p className="text-sm text-text-tertiary">
            Real-time alerts from infrastructure monitoring.
          </p>
        </div>
      </div>
    </div>
  );
}

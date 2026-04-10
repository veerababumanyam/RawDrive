"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listUsers,
  listWorkspaces,
  getRevenueDashboard,
  getSystemMetrics,
} from "@/lib/api/admin";
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
  const token = getStoredAccessToken();
  const requestKey = token ? "dashboard" : "unauthenticated";
  const [requestState, setRequestState] = useState<{
    key: string;
    data: DashboardData | null;
    error: boolean;
  }>({
    key: "",
    data: null,
    error: false,
  });

  const data = requestState.key === requestKey ? requestState.data : null;
  const error = token
    ? requestState.key === requestKey
      ? requestState.error
      : false
    : true;
  const loading = Boolean(token) && requestState.key !== requestKey;

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;

    Promise.all([
      listUsers(token, { limit: "1" }).catch(() => null),
      listWorkspaces(token, { limit: "1" }).catch(() => null),
      getRevenueDashboard(token).catch(() => null),
      getSystemMetrics(token).catch(() => null),
    ])
      .then(([users, workspaces, revenue, system]) => {
        if (ignore) {
          return;
        }

        setRequestState({
          key: requestKey,
          data: {
            totalUsers: users
              ? users.total_count.toLocaleString("en-IN")
              : "--",
            activeWorkspaces: workspaces
              ? workspaces.total_count.toLocaleString("en-IN")
              : "--",
            monthlyRevenue: revenue
              ? `\u20B9${(revenue.mrr_paisa / 100).toLocaleString("en-IN")}`
              : "--",
            systemStatus: system
              ? system.api_latency_p95_ms < 500 ? "Healthy" : "Degraded"
              : "--",
          },
          error: !users && !workspaces && !revenue && !system,
        });
      })
      .catch(() => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            data: null,
            error: true,
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [requestKey, token]);

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total Users" value={loading ? "..." : data?.totalUsers ?? "--"} />
        <StatCard icon={LayoutGrid} label="Active Workspaces" value={loading ? "..." : data?.activeWorkspaces ?? "--"} />
        <StatCard icon={TrendingUp} label="Monthly Revenue" value={loading ? "..." : data?.monthlyRevenue ?? "--"} />
        <StatCard icon={Server} label="System Status" value={loading ? "..." : data?.systemStatus ?? "--"} />
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

"use client";

import { useEffect, useState } from "react";
import { useAdminFetch } from "@/hooks/use-admin-fetch";
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
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="glass-card flex items-start gap-4 rounded-2xl p-6" title={hint}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-text-tertiary">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{value}</p>
        {/* QA #66, #67: make the metric definition discoverable. Previously
            "Active workspaces" and "System Status: Healthy" were shown without
            any basis — admins couldn't tell what the number meant. */}
        {hint && <p className="mt-1 text-[11px] text-text-tertiary/80">{hint}</p>}
      </div>
    </div>
  );
}

interface DashboardData {
  totalUsers: string;
  activeWorkspaces: string;
  monthlyRevenue: string;
  systemStatus: string;
  recentUsers: { id: string; full_name: string; email: string; created_at: string }[];
}

export default function AdminDashboardPage() {
  const { ready, getToken } = useAdminFetch();
  const token = ready ? getToken() : "";
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
      // QA #64: recent registrations — fetch last 5 newest users sorted
      // by created_at desc to render the Recent Registrations panel with
      // real data instead of a "will load" placeholder.
      listUsers(token, { limit: "5", sort: "-created_at" }).catch(() => null),
    ])
      .then(([users, workspaces, revenue, system, recent]) => {
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
            recentUsers: (recent?.items ?? []).map((u) => ({
              id: u.id,
              full_name: u.full_name || "(unnamed)",
              email: u.email,
              created_at: u.created_at,
            })),
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
        <StatCard icon={Users} label="Total Users" value={loading ? "..." : data?.totalUsers ?? "--"} hint="Unique non-deleted users in the platform" />
        <StatCard icon={LayoutGrid} label="Active Workspaces" value={loading ? "..." : data?.activeWorkspaces ?? "--"} hint="Workspaces with status=active (excludes suspended/deleted)" />
        <StatCard icon={TrendingUp} label="Monthly Revenue" value={loading ? "..." : data?.monthlyRevenue ?? "--"} hint="MRR this calendar month" />
        <StatCard icon={Server} label="System Status" value={loading ? "..." : data?.systemStatus ?? "--"} hint="Healthy when API p95 latency < 500ms" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card col-span-2 rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Recent Registrations
          </h2>
          {/* QA #64: renders the 5 newest users. Empty state only shows
              when the admin API returned zero rows, not as a static
              placeholder. */}
          {loading ? (
            <p className="text-sm text-text-tertiary">Loading…</p>
          ) : !data?.recentUsers?.length ? (
            <p className="text-sm text-text-tertiary">
              No user registrations yet in the current window.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">{u.full_name}</p>
                    <p className="text-xs text-text-tertiary truncate">{u.email}</p>
                  </div>
                  <time className="text-xs text-text-tertiary shrink-0 ml-3">
                    {new Date(u.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass-card rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            System Alerts
          </h2>
          {/* QA #65: the alerts panel was previously a single-line
              placeholder that never populated — admins reported it as
              broken because nothing ever appeared. Alert emission is a
              separate workstream (needs monitoring agent + dispatch
              wiring). Until that lands, surface the criteria that WILL
              trigger an alert so admins know the shape of the feature,
              not just a mute panel. */}
          <div className="text-sm text-text-tertiary space-y-2">
            <p>Alerts will fire for:</p>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li>API p95 latency &gt; 1s for 5 consecutive minutes</li>
              <li>Moderation queue backlog &gt; 100 items</li>
              <li>Refresh-token revocation spike (&gt; 50/minute)</li>
              <li>R2 storage utilization &gt; 80% of plan limit</li>
              <li>Failed login burst (&gt; 20 per 60s per IP)</li>
            </ul>
            <p className="pt-2 text-[11px] italic">
              Alert emission service pending — no events are surfaced yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

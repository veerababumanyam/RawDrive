"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart3,
  Cloud,
  HardDrive,
  LineChart,
  PieChart,
  Zap,
  type LucideIcon,
} from "@/components/icons";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";
import { getStoredAccessToken } from "@/lib/auth";
import {
  SettingsPageHeader,
  SettingsPageShell,
  SettingsPanel,
} from "../_components/settings-page-shell";

// ──────────────────────── Types ────────────────────────

type PlanTier =
  | "free"
  | "creator"
  | "pro_photographer"
  | "studio"
  | "elite_studio"
  | "starter"
  | "professional"
  | "business"
  | "pro"
  | "enterprise"
  | "standard";

interface StorageAnalytics {
  usage: {
    used_bytes: number;
    derivative_bytes: number;
    // 2026-05-21: total_bytes = originals + WebP derivatives. The
    // headline figure on this page now uses total_bytes so it matches
    // what B2 actually bills us for. used_bytes is retained for the
    // breakdown chart and for backwards-compatible API consumers.
    total_bytes?: number;
    quota_bytes: number;
    percent_used: number;
    warning_level: string;
  };
  top_galleries: {
    gallery_id: string;
    gallery_name: string;
    used_bytes: number;
  }[];
  type_breakdown: {
    originals_bytes: number;
    derivatives_bytes: number;
    thumbnails_bytes: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function productQuotaBytes(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.quota_bytes;
  return typeof value === "number" ? value : 0;
}

function planTierLabel(tier: PlanTier | null): string {
  if (!tier) return "Loading";
  const labels: Record<PlanTier, string> = {
    free: "Starter",
    standard: "Starter",
    starter: "Creator",
    creator: "Creator",
    professional: "Pro Photographer",
    pro: "Pro Photographer",
    pro_photographer: "Pro Photographer",
    business: "Elite Studio",
    enterprise: "Elite Studio",
    elite_studio: "Elite Studio",
    studio: "Studio",
  };
  return labels[tier];
}

function StorageMetricCard({
  icon: Icon,
  label,
  value,
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  progress?: number;
}) {
  return (
    <div className="settings-metric-card">
      <div className="settings-metric-card__header">
        <span className="settings-metric-icon" aria-hidden="true">
          <Icon />
        </span>
        <p className="settings-metric-label">{label}</p>
      </div>
      <p className="settings-metric-value">{value}</p>
      {typeof progress === "number" ? (
        <div className="settings-metric-track" aria-hidden="true">
          <div
            className="settings-metric-fill"
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ──────────────────────── Page ────────────────────────

export default function StorageSettingsPage() {
  // F-011 (audit 2026-04-10): plan tier was previously hardcoded to
  // "professional" with a TODO, which hid the BYOS wizard from enterprise-class
  // users AND showed a misleading "Upgrade" prompt to everyone else. Source
  // it from the authoritative backend endpoint that reads from the DB.
  const [planTier, setPlanTier] = useState<PlanTier | null>(null);
  const isEnterprise =
    planTier === "business" ||
    planTier === "elite_studio" ||
    planTier === "enterprise";
  const planLoaded = planTier !== null;

  const [analytics, setAnalytics] = useState<StorageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const { storageBoosters } = usePlanCatalog();

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const token = getStoredAccessToken();
    fetch(`${apiUrl}/api/v1/storage/analytics`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data) setAnalytics(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // F-011: fetch authoritative plan tier. This is a separate effect so
  // analytics and plan-tier load independently — one failing does not
  // block the other.
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const token = getStoredAccessToken();
    fetch(`${apiUrl}/api/v1/workspaces/current/plan`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const tier = data?.plan_tier as PlanTier | undefined;
        setPlanTier(tier ?? "free");
      })
      .catch(() => setPlanTier("free"));
  }, []);

  const usage = analytics?.usage;
  // 2026-05-21: use total_bytes (originals + WebP derivatives) when the
  // backend supplies it, fall back to used_bytes for older API responses.
  const headlineBytes = usage ? (usage.total_bytes ?? usage.used_bytes) : 0;
  const usedDisplay = usage ? formatBytes(headlineBytes) : "—";
  const quotaDisplay = usage ? formatBytes(usage.quota_bytes) : "—";
  const pctUsed = usage?.percent_used ?? 0;
  const safePctUsed = Math.min(Math.max(pctUsed, 0), 100);
  const warningLevel = usage?.warning_level ?? "none";
  const statusLabel =
    warningLevel === "critical"
      ? "Storage Critical"
      : warningLevel === "warning"
        ? "Storage Warning"
        : "Active";
  const statusBadgeClass =
    warningLevel === "critical"
      ? "status-badge status-badge--danger"
      : warningLevel === "warning"
        ? "status-badge status-badge--warning"
        : "status-badge status-badge--success";
  const progressClass =
    warningLevel === "critical"
      ? "settings-progress-bar settings-progress-bar--critical"
      : warningLevel === "warning"
        ? "settings-progress-bar settings-progress-bar--warning"
        : "settings-progress-bar";
  const planLabel = planTierLabel(planTier);
  const typeBreakdown = analytics?.type_breakdown;
  const breakdownTotal =
    (typeBreakdown?.originals_bytes ?? 0) +
    (typeBreakdown?.derivatives_bytes ?? 0) +
    (typeBreakdown?.thumbnails_bytes ?? 0);
  const originalsPct =
    breakdownTotal > 0
      ? Math.round(
          ((typeBreakdown?.originals_bytes ?? 0) / breakdownTotal) * 100,
        )
      : 0;
  const derivativesPct =
    breakdownTotal > 0
      ? Math.round(
          ((typeBreakdown?.derivatives_bytes ?? 0) / breakdownTotal) * 100,
        )
      : 0;
  const thumbnailsPct =
    breakdownTotal > 0 ? 100 - originalsPct - derivativesPct : 0;
  const breakdownRows = [
    {
      key: "originals",
      label: "Originals",
      value: formatBytes(typeBreakdown?.originals_bytes ?? 0),
      pct: originalsPct,
    },
    {
      key: "derivatives",
      label: "Derivatives",
      value: formatBytes(typeBreakdown?.derivatives_bytes ?? 0),
      pct: derivativesPct,
    },
    {
      key: "thumbnails",
      label: "Thumbnails",
      value: formatBytes(typeBreakdown?.thumbnails_bytes ?? 0),
      pct: thumbnailsPct,
    },
  ] as const;
  const storageMetrics = [
    {
      key: "used",
      label: "Used",
      value: loading ? "Loading" : usedDisplay,
      icon: HardDrive,
    },
    {
      key: "quota",
      label: "Quota",
      value: quotaDisplay,
      icon: Cloud,
    },
    {
      key: "usage",
      label: "Usage",
      value: `${Math.round(pctUsed)}%`,
      icon: BarChart3,
      progress: safePctUsed,
    },
    {
      key: "derivatives",
      label: "Derivatives",
      value: usage ? formatBytes(usage.derivative_bytes) : "—",
      icon: Zap,
    },
  ];

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        eyebrow="Storage"
        title="Storage Settings"
        badge={<span className={statusBadgeClass}>{statusLabel}</span>}
        description="Review workspace storage usage, distribution, and upgrade options."
        meta={
          <>
            <span className="status-badge status-badge--neutral">
              {planLabel} plan
            </span>
            <span className="status-badge status-badge--accent">
              Managed B2 storage
            </span>
          </>
        }
      />

      <div className="settings-metric-grid settings-metric-grid--storage">
        {storageMetrics.map((metric) => (
          <StorageMetricCard
            key={metric.key}
            icon={metric.icon}
            label={metric.label}
            value={metric.value}
            progress={metric.progress}
          />
        ))}
      </div>

      <SettingsPanel
        title="Current Storage Usage"
        description="Usage includes originals plus generated WebP derivatives, matching billable object storage."
        icon={<HardDrive />}
        actions={<span className={statusBadgeClass}>{statusLabel}</span>}
      >
        <div className="settings-progress-track">
          <div className={progressClass} style={{ width: `${safePctUsed}%` }} />
        </div>
        <p className="settings-panel-note">
          {loading ? "Loading..." : `${usedDisplay} / ${quotaDisplay} used`}
        </p>
      </SettingsPanel>

      {planLoaded && !isEnterprise && (
        <SettingsPanel
          title="Need more storage?"
          description="Upgrade your plan to unlock additional storage and production features."
          icon={<Zap />}
          actions={
            <Link
              href="/settings/plans"
              className="glass-button glass-button--md glass-button--surface"
            >
              Upgrade Plan
            </Link>
          }
        >
          <p className="settings-panel-copy">
            Your workspace stays on managed Backblaze B2 storage. Elite Studio
            workspaces can add bring-your-own-storage overrides.
          </p>
        </SettingsPanel>
      )}

      {storageBoosters.length > 0 && (
        <SettingsPanel
          title="Storage Boosters"
          description="Add recurring storage without changing your subscription tier."
          icon={<Cloud />}
        >
          <div className="settings-form-grid">
            {storageBoosters.map((product) => (
              <div key={product.code} className="settings-storage-row">
                <div className="settings-storage-row__meta">
                  <span className="settings-storage-row__name">
                    {product.name}
                  </span>
                  <span>
                    ₹{Math.round(product.price_paise / 100).toLocaleString("en-IN")}
                    /mo
                  </span>
                </div>
                <p className="settings-panel-copy">
                  {formatBytes(productQuotaBytes(product.metadata))} extra
                  storage · safe reduction at expiry
                </p>
                <Link
                  href={`/settings/plans/choose-payment?product_code=${encodeURIComponent(product.code)}&target_type=workspace`}
                  className="glass-button glass-button--sm glass-button--surface"
                >
                  Add Storage
                </Link>
              </div>
            ))}
          </div>
        </SettingsPanel>
      )}

      <div className="settings-analytics-grid">
        <SettingsPanel
          title="Top Galleries by Size"
          description="Largest galleries help you spot storage-heavy client work."
          icon={<LineChart />}
        >
          {analytics?.top_galleries && analytics.top_galleries.length > 0 ? (
            <div className="settings-form-grid">
              {analytics.top_galleries.map((gallery) => {
                const maxBytes = analytics.top_galleries[0]?.used_bytes || 1;
                const pct = Math.round((gallery.used_bytes / maxBytes) * 100);
                return (
                  <div
                    key={gallery.gallery_id}
                    className="settings-storage-row"
                  >
                    <div className="settings-storage-row__meta">
                      <span className="settings-storage-row__name">
                        {gallery.gallery_name}
                      </span>
                      <span>{formatBytes(gallery.used_bytes)}</span>
                    </div>
                    <div className="settings-storage-track">
                      <div
                        className="settings-storage-bar"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="settings-panel-copy">
              {loading ? "Loading..." : "No gallery data yet"}
            </p>
          )}
        </SettingsPanel>

        <SettingsPanel
          title="Storage Distribution"
          description="Original files, WebP derivatives, and thumbnails are tracked separately."
          icon={<PieChart />}
        >
          {breakdownTotal > 0 ? (
            <>
              <div className="settings-storage-stack" aria-hidden="true">
                <div
                  className="settings-storage-segment settings-storage-segment--originals"
                  style={{ width: `${originalsPct}%` }}
                />
                <div
                  className="settings-storage-segment settings-storage-segment--derivatives"
                  style={{ width: `${derivativesPct}%` }}
                />
                <div
                  className="settings-storage-segment settings-storage-segment--thumbnails"
                  style={{ width: `${thumbnailsPct}%` }}
                />
              </div>
              <div className="settings-legend-list settings-legend-list--spaced">
                {breakdownRows.map((row) => (
                  <div key={row.key} className="settings-legend-row">
                    <span
                      className={`settings-legend-dot settings-storage-segment--${row.key}`}
                    />
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                    <span>{row.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="settings-panel-copy">
              {loading ? "Loading..." : "No storage data yet"}
            </p>
          )}
        </SettingsPanel>
      </div>
    </SettingsPageShell>
  );
}

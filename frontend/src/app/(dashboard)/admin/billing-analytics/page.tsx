"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getBillingAnalyticsDashboard,
  type AdminBillingAnalyticsDashboard,
  type AdminBillingPlanAnalytics,
  type AdminBillingProductRevenue,
  type AdminBillingRecentOrder,
} from "@/lib/api/admin";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  BarChart3,
  Bell,
  Clock,
  Coins,
  CreditCard,
  HardDrive,
  LineChart,
  PieChart,
  Shield,
} from "@/components/icons";

function formatINR(paise: number | null | undefined): string {
  const n = typeof paise === "number" && Number.isFinite(paise) ? paise : 0;
  return `₹${(n / 100).toLocaleString("en-IN")}`;
}

function formatNum(n: number | null | undefined): string {
  const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return value.toLocaleString("en-IN");
}

function formatBytes(bytes: number | null | undefined): string {
  const value = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClass(status: string): string {
  switch (status) {
    case "paid":
    case "published":
    case "sent":
    case "active":
      return "bg-feedback-success/10 text-feedback-success";
    case "failed":
    case "rejected":
    case "past_due":
      return "bg-feedback-error/10 text-feedback-error";
    case "pending":
    case "pending_approval":
    case "queued":
      return "bg-feedback-warning/10 text-feedback-warning";
    default:
      return "bg-surface-container-low text-text-tertiary";
  }
}

type PlanRow = AdminBillingPlanAnalytics & Record<string, unknown>;
type ProductRevenueRow = AdminBillingProductRevenue & Record<string, unknown>;
type RecentOrderRow = AdminBillingRecentOrder & Record<string, unknown>;

const RETIRED_ORDER_TYPES = new Set([
  "event_upload",
  "gallery_extension",
  "storage_booster",
]);

function isRetiredOrderType(orderType: string): boolean {
  return RETIRED_ORDER_TYPES.has(orderType);
}

const planColumns: ColumnDef<PlanRow>[] = [
  {
    key: "plan_name",
    label: "Plan",
    sortable: true,
    render: (_value, row) => (
      <div>
        <p className="font-semibold text-text-primary">{row.plan_name}</p>
        <p className="text-xs text-text-tertiary">{row.tier_slug}</p>
      </div>
    ),
  },
  {
    key: "active_subscribers",
    label: "Active",
    sortable: true,
    render: (_value, row) => formatNum(row.active_subscribers),
  },
  {
    key: "past_due_subscribers",
    label: "Past Due",
    sortable: true,
    render: (_value, row) => (
      <span
        className={
          row.past_due_subscribers > 0
            ? "font-semibold text-feedback-warning"
            : "text-text-tertiary"
        }
      >
        {formatNum(row.past_due_subscribers)}
      </span>
    ),
  },
  {
    key: "mrr_paise",
    label: "MRR",
    sortable: true,
    render: (_value, row) => (
      <span className="font-semibold text-accent">
        {formatINR(row.mrr_paise)}
      </span>
    ),
  },
  {
    key: "arr_paise",
    label: "ARR",
    sortable: true,
    render: (_value, row) => formatINR(row.arr_paise),
  },
  {
    key: "quota_bytes",
    label: "Quota",
    sortable: true,
    render: (_value, row) => formatBytes(row.quota_bytes),
  },
];

const productColumns: ColumnDef<ProductRevenueRow>[] = [
  {
    key: "order_type",
    label: "Product",
    sortable: true,
    render: (_value, row) => labelize(row.order_type),
  },
  {
    key: "paid_orders",
    label: "Paid Orders",
    sortable: true,
    render: (_value, row) => formatNum(row.paid_orders),
  },
  {
    key: "revenue_paise",
    label: "Revenue",
    sortable: true,
    render: (_value, row) => (
      <span className="font-semibold text-accent">
        {formatINR(row.revenue_paise)}
      </span>
    ),
  },
  {
    key: "average_paise",
    label: "Avg Order",
    sortable: true,
    render: (_value, row) => formatINR(row.average_paise),
  },
];

const recentOrderColumns: ColumnDef<RecentOrderRow>[] = [
  {
    key: "order_type",
    label: "Order",
    sortable: true,
    render: (_value, row) => (
      <div>
        <p className="font-semibold text-text-primary">
          {labelize(row.order_type)}
        </p>
        <p className="text-xs text-text-tertiary">{row.provider}</p>
      </div>
    ),
  },
  {
    key: "amount_paise",
    label: "Amount",
    sortable: true,
    render: (_value, row) => formatINR(row.amount_paise),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (_value, row) => (
      <span
        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.status)}`}
      >
        {labelize(row.status)}
      </span>
    ),
  },
  {
    key: "target_type",
    label: "Target",
    sortable: true,
    render: (_value, row) => labelize(row.target_type),
  },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    render: (_value, row) => formatDate(row.created_at),
  },
];

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: typeof BarChart3;
  tone?: "accent" | "success" | "warning" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "bg-feedback-success/10 text-feedback-success"
      : tone === "warning"
        ? "bg-feedback-warning/10 text-feedback-warning"
        : tone === "error"
          ? "bg-feedback-error/10 text-feedback-error"
          : "bg-accent-subtle text-accent";
  return (
    <div className="rounded-2xl border border-text-media/5 bg-surface-container-low/40 p-5 glass-blur-medium">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-micro uppercase text-text-secondary font-label">
            {label}
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-text-primary">
            {value}
          </p>
          {detail && <p className="mt-2 text-xs text-text-tertiary">{detail}</p>}
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function RiskCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "warning" | "error" | "success";
}) {
  const color =
    tone === "success"
      ? "text-feedback-success bg-feedback-success/10"
      : tone === "warning"
        ? "text-feedback-warning bg-feedback-warning/10"
        : "text-feedback-error bg-feedback-error/10";
  return (
    <div className="rounded-2xl border border-text-media/5 bg-surface-container-low/30 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${color}`}>
          {formatNum(value)}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-text-tertiary">{detail}</p>
    </div>
  );
}

export default function AdminBillingAnalyticsPage() {
  const [windowDays, setWindowDays] = useState(30);
  const [dashboard, setDashboard] =
    useState<AdminBillingAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredAccessToken();
    getBillingAnalyticsDashboard(token, windowDays)
      .then((data) => {
        if (cancelled) return;
        setDashboard({
          ...data,
          plans: Array.isArray(data.plans) ? data.plans : [],
          revenue_by_product: Array.isArray(data.revenue_by_product)
            ? data.revenue_by_product
            : [],
          recent_orders: Array.isArray(data.recent_orders)
            ? data.recent_orders
            : [],
        });
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load billing analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  const planRows = useMemo<PlanRow[]>(
    () => (dashboard?.plans ?? []) as PlanRow[],
    [dashboard],
  );
  const productRows = useMemo<ProductRevenueRow[]>(
    () =>
      ((dashboard?.revenue_by_product ?? []) as ProductRevenueRow[]).filter(
        (row) => !isRetiredOrderType(row.order_type),
      ),
    [dashboard],
  );
  const recentOrderRows = useMemo<RecentOrderRow[]>(
    () =>
      ((dashboard?.recent_orders ?? []) as RecentOrderRow[]).filter(
        (row) => !isRetiredOrderType(row.order_type),
      ),
    [dashboard],
  );
  const maxProductRevenue = useMemo(
    () =>
      Math.max(
        1,
        ...productRows.map((row) =>
          typeof row.revenue_paise === "number" ? row.revenue_paise : 0,
        ),
      ),
    [productRows],
  );

  if (loading && !dashboard) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-text-secondary">Loading billing analytics...</p>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-feedback-error">{error}</p>
      </div>
    );
  }

  const summary = dashboard?.summary;
  const lifecycle = dashboard?.lifecycle;
  const approvals = dashboard?.approvals;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-headline text-4xl font-extrabold text-text-primary">
            Billing Analytics
          </h2>
          <p className="mt-2 text-sm text-text-secondary font-body">
            Generated {formatDate(dashboard?.generated_at)} across the last{" "}
            {dashboard?.window_days ?? windowDays} days.
          </p>
        </div>
        <div className="flex rounded-2xl border border-border-subtle bg-surface-container-low/40 p-1 glass-blur-medium">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => {
                setLoading(true);
                setWindowDays(days);
              }}
              className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors ${
                windowDays === days
                  ? "bg-surface-container-high text-accent"
                  : "text-text-tertiary hover:bg-surface-container-high/40 hover:text-text-primary"
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-warning/30 bg-feedback-warning/10 px-4 py-3 text-sm text-feedback-warning">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="MRR"
          value={formatINR(summary?.mrr_paise)}
          detail={`${formatINR(summary?.arr_paise)} ARR`}
          icon={LineChart}
        />
        <MetricCard
          label="Active Subscribers"
          value={formatNum(summary?.active_subscribers)}
          detail="Paid workspaces on active plans"
          icon={CreditCard}
          tone="success"
        />
        <MetricCard
          label="Subscription Revenue"
          value={formatINR(summary?.subscription_revenue_paise)}
          detail="Paid plan checkout and renewals"
          icon={Coins}
        />
        <MetricCard
          label="Billing Risk"
          value={formatNum(
            (summary?.churn_risk_count ?? 0) +
              (summary?.pending_renewal_failures ?? 0),
          )}
          detail={`${formatNum(summary?.safe_reduction_overage_workspaces)} safe-reduction overages`}
          icon={Shield}
          tone={
            (summary?.pending_renewal_failures ?? 0) > 0 ? "error" : "warning"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <RiskCard
          label="Churn Risk"
          value={summary?.churn_risk_count ?? 0}
          detail="Active or past-due subscriptions expiring inside 14 days."
          tone={(summary?.churn_risk_count ?? 0) > 0 ? "warning" : "success"}
        />
        <RiskCard
          label="Renewal Failures"
          value={summary?.pending_renewal_failures ?? 0}
          detail="Failed renewal orders and payment-failed lifecycle jobs."
          tone={
            (summary?.pending_renewal_failures ?? 0) > 0 ? "error" : "success"
          }
        />
        <RiskCard
          label="Pricing Approvals"
          value={summary?.pending_pricing_approvals ?? 0}
          detail="Submitted pricing changes waiting for super-admin action."
          tone={
            (summary?.pending_pricing_approvals ?? 0) > 0
              ? "warning"
              : "success"
          }
        />
        <RiskCard
          label="Safe Reduction"
          value={summary?.safe_reduction_overage_workspaces ?? 0}
          detail="Workspaces over quota remain readable after reductions."
          tone={
            (summary?.safe_reduction_overage_workspaces ?? 0) > 0
              ? "warning"
              : "success"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-2xl border border-text-media/5 bg-surface-container-low/20 p-6 glass-blur-subtle">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-headline text-xl font-bold text-text-primary">
                Product Revenue
              </h3>
              <p className="mt-1 text-xs text-text-tertiary">
                Historical paid product orders.
              </p>
            </div>
            <PieChart className="h-6 w-6 text-accent" />
          </div>
          <div className="space-y-4">
            {productRows.length === 0 ? (
              <p className="rounded-xl bg-surface-container-low/40 px-4 py-6 text-center text-sm text-text-secondary">
                No paid product orders in this window.
              </p>
            ) : (
              productRows.map((row) => {
                const pct = Math.max(4, (row.revenue_paise / maxProductRevenue) * 100);
                return (
                  <div key={row.order_type} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-text-primary">
                        {labelize(row.order_type)}
                      </span>
                      <span className="text-text-secondary">
                        {formatINR(row.revenue_paise)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {formatNum(row.paid_orders)} paid orders ·{" "}
                      {formatINR(row.average_paise)} average
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-text-media/5 bg-surface-container-low/20 p-6 glass-blur-subtle">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-headline text-xl font-bold text-text-primary">
                Lifecycle Queue
              </h3>
              <p className="mt-1 text-xs text-text-tertiary">
                Billing emails, proofs, and due lifecycle jobs.
              </p>
            </div>
            <Bell className="h-6 w-6 text-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricPill label="Renewals" value={lifecycle?.due_renewal_reminders} icon={Clock} />
            <MetricPill label="Expiry" value={lifecycle?.due_expiry_warnings} icon={Clock} />
            <MetricPill label="Delete Warnings" value={lifecycle?.due_deletion_warnings} icon={Bell} />
            <MetricPill label="Failed Jobs" value={lifecycle?.failed_lifecycle_jobs} icon={Shield} danger />
            <MetricPill label="Proofs Sent" value={lifecycle?.sent_proofs} icon={Bell} />
            <MetricPill label="Proof Failures" value={lifecycle?.failed_proofs} icon={Shield} danger />
          </div>
          <div className="mt-4 rounded-xl border border-border-subtle bg-surface-container-low/40 px-4 py-3">
            <p className="text-xs text-text-tertiary">Queued pricing email batches</p>
            <p className="mt-1 font-headline text-2xl font-bold text-text-primary">
              {formatNum(lifecycle?.queued_pricing_email_batches)}
            </p>
          </div>
        </section>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-2xl border border-text-media/5 bg-surface-container-low/20 p-6 glass-blur-subtle">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="font-headline text-xl font-bold text-text-primary">
              Subscribers by Plan
            </h3>
            <BarChart3 className="h-6 w-6 text-accent" />
          </div>
          <DataTable<PlanRow>
            columns={planColumns}
            data={planRows}
            rowKey={(row) => row.tier_slug}
            pageSize={8}
            emptyStateMessage="No active subscriptions yet."
          />
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-text-media/5 bg-surface-container-low/20 p-6 glass-blur-subtle">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="font-headline text-xl font-bold text-text-primary">
              Pricing Workflow
            </h3>
            <CreditCard className="h-6 w-6 text-accent" />
          </div>
          <div className="space-y-3">
            {[
              ["Draft", approvals?.draft ?? 0, "draft"],
              ["Pending", approvals?.pending_approval ?? 0, "pending_approval"],
              ["Approved", approvals?.approved ?? 0, "active"],
              ["Published", approvals?.published ?? 0, "published"],
              ["Rejected", approvals?.rejected ?? 0, "rejected"],
            ].map(([label, value, status]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-xl bg-surface-container-low/40 px-4 py-3"
              >
                <span className="text-sm font-medium text-text-primary">
                  {label}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(String(status))}`}
                >
                  {formatNum(Number(value))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3 rounded-2xl border border-text-media/5 bg-surface-container-low/20 p-6 glass-blur-subtle">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="font-headline text-xl font-bold text-text-primary">
              Recent Orders
            </h3>
            <CreditCard className="h-6 w-6 text-accent" />
          </div>
          <DataTable<RecentOrderRow>
            columns={recentOrderColumns}
            data={recentOrderRows}
            rowKey={(row) => row.id}
            pageSize={8}
            emptyStateMessage="No payment orders yet."
          />
        </div>

        <div className="xl:col-span-2 rounded-2xl border border-text-media/5 bg-surface-container-low/20 p-6 glass-blur-subtle">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="font-headline text-xl font-bold text-text-primary">
              Revenue Details
            </h3>
            <HardDrive className="h-6 w-6 text-accent" />
          </div>
          <DataTable<ProductRevenueRow>
            columns={productColumns}
            data={productRows}
            rowKey={(row) => row.order_type}
            pageSize={6}
            emptyStateMessage="No paid catalog products in this window."
          />
        </div>
      </section>
    </div>
  );
}

function MetricPill({
  label,
  value,
  icon: Icon,
  danger = false,
}: {
  label: string;
  value?: number;
  icon: typeof Bell;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-tertiary">{label}</p>
        <Icon
          className={`h-4 w-4 ${danger ? "text-feedback-error" : "text-accent"}`}
        />
      </div>
      <p
        className={`mt-2 font-headline text-2xl font-bold ${
          danger && (value ?? 0) > 0
            ? "text-feedback-error"
            : "text-text-primary"
        }`}
      >
        {formatNum(value)}
      </p>
    </div>
  );
}

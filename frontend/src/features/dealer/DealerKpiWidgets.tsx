// Design source: Stitch MCP Liquid Glass — KPI Cards Grid (3-col, glass-card)
"use client";

function formatPaisa(paisa: number): string {
  return `₹${(paisa / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

interface KpiData {
  total_referrals: number;
  active_subscriptions: number;
  churned_subscriptions: number;
  total_earned_paisa: number;
  pending_payout_paisa: number;
  conversion_rate: number;
}

interface Props {
  data?: KpiData;
  isLoading: boolean;
}

const cards = [
  { key: "total_referrals", label: "Total Referrals", format: (v: number) => v.toLocaleString() },
  { key: "active_subscriptions", label: "Active Subscriptions", format: (v: number) => v.toLocaleString() },
  { key: "churned_subscriptions", label: "Churned", format: (v: number) => v.toLocaleString() },
  { key: "total_earned_paisa", label: "Total Earned", format: formatPaisa },
  { key: "pending_payout_paisa", label: "Pending Payout", format: formatPaisa },
  { key: "conversion_rate", label: "Conversion Rate", format: (v: number) => `${(v * 100).toFixed(1)}%` },
] as const;

export default function DealerKpiWidgets({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.key} className="glass-card p-6 animate-pulse">
            <div className="h-4 w-24 bg-surface-sunken rounded mb-3" />
            <div className="h-8 w-16 bg-surface-sunken rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((c) => {
        const value = data ? (data as unknown as Record<string, number>)[c.key] ?? 0 : 0;
        return (
          <div key={c.key} className="glass-card p-6">
            <p className="text-sm text-text-secondary font-medium">{c.label}</p>
            <p className="text-2xl font-semibold text-text-primary mt-1 tracking-tight">
              {c.format(value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

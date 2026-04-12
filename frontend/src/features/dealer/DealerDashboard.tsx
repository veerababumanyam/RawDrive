// Design source: design-tokens.json semantic classes
"use client";

import { useState, useEffect } from "react";
import { getDealerDashboard, type Dealer } from "@/lib/api/dealer";
import { getStoredAccessToken } from "@/lib/auth";

// Same pattern as DealerAdminReview: dealer responses only carry state_id,
// so we look up id → name from GET /api/v1/states once on mount to render
// a human-readable state label instead of the cosmetic "#24".
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function DealerDashboard() {
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateNames, setStateNames] = useState<Record<number, string>>({});

  useEffect(() => {
    const storedToken = getStoredAccessToken();
    getDealerDashboard(storedToken)
      .then(setDealer)
      .catch(() => setDealer(null))
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/v1/states`)
      .then((res) => (res.ok ? res.json() : { states: [] }))
      .then((body: { states?: { id: number; name: string }[] }) => {
        const map: Record<number, string> = {};
        for (const s of body.states ?? []) map[s.id] = s.name;
        setStateNames(map);
      })
      .catch(() => {
        /* non-fatal — card falls back to the raw id */
      });
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-32 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!dealer) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold text-text-primary">Not a Registered Dealer</h2>
          <p className="text-text-secondary mt-2">Register as a dealer to access the dashboard.</p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "bg-feedback-warning/10 text-feedback-warning",
    approved: "bg-feedback-success/10 text-feedback-success",
    suspended: "bg-feedback-error/10 text-feedback-error",
    terminated: "bg-surface-container/10 text-text-secondary",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Dealer Dashboard</h1>
          <p className="text-sm text-text-secondary mt-1">{dealer.business_name}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[dealer.status] || ""}`}>
          {dealer.status}
        </span>
      </div>

      {dealer.referral_code && (
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">Your Referral Code</p>
            <p className="text-xl font-mono font-bold text-accent-primary">{dealer.referral_code}</p>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(dealer.referral_code)}
            className="btn-secondary min-h-[44px] px-4"
          >
            Copy
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-6">
          <p className="text-sm text-text-secondary">Commission Rate</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {dealer.commission_rate_pct ? `${dealer.commission_rate_pct}%` : "—"}
          </p>
        </div>
        <div className="glass-card p-6">
          <p className="text-sm text-text-secondary">State</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {stateNames[dealer.state_id] ?? `#${dealer.state_id}`}
          </p>
        </div>
        <div className="glass-card p-6">
          <p className="text-sm text-text-secondary">Territory</p>
          <p className="text-2xl font-semibold text-text-primary mt-1 capitalize">
            {dealer.territory_type}
          </p>
        </div>
      </div>
    </div>
  );
}

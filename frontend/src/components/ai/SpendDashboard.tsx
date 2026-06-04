"use client";

import { useEffect, useState } from "react";
import {
  getSpend,
  getCredits,
  type SpendSummary,
  type CreditSummary,
} from "@/lib/api/ai";

interface SpendDashboardProps {
  token: string;
}

export function SpendDashboard({ token }: SpendDashboardProps) {
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSpend(token), getCredits(token)])
      .then(([s, c]) => {
        if (cancelled) return;
        setSpend(s);
        setCredits(c);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  const formatPaisa = (paisa: number) => {
    const inr = paisa / 100;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(inr);
  };

  const operations = spend?.by_operation
    ? Object.entries(spend.by_operation)
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <p className="text-xs text-text-tertiary mb-1">This Month</p>
          <p className="text-2xl font-semibold text-text-primary">
            {formatPaisa(spend?.total_paisa || 0)}
          </p>
        </div>

        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <p className="text-xs text-text-tertiary mb-1">Monthly Cap</p>
          <p className="text-2xl font-semibold text-text-primary">
            {credits?.monthly_cap_paisa
              ? formatPaisa(credits.monthly_cap_paisa)
              : "No cap"}
          </p>
        </div>

        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <p className="text-xs text-text-tertiary mb-1">Remaining</p>
          <p className="text-2xl font-semibold text-text-primary">
            {credits && credits.remaining_paisa >= 0
              ? formatPaisa(credits.remaining_paisa)
              : "Unlimited"}
          </p>
        </div>
      </div>

      {credits?.monthly_cap_paisa && credits.monthly_cap_paisa > 0 && (
        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">Usage</span>
            <span className="text-sm font-medium text-text-primary">
              {Math.round(credits.cap_used_percent)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-sunken overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                credits.cap_used_percent >= 100
                  ? "bg-feedback-error"
                  : credits.cap_used_percent >= 80
                    ? "bg-feedback-warning"
                    : "bg-accent"
              }`}
              style={{ width: `${Math.min(credits.cap_used_percent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {operations.length > 0 && (
        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">
            Cost by Feature
          </h4>
          <div className="space-y-2">
            {operations
              .sort((a, b) => b[1] - a[1])
              .map(([op, cost]) => (
                <div key={op} className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary capitalize">
                    {op.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {formatPaisa(cost)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

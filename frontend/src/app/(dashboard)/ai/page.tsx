"use client";

import { useEffect, useState } from "react";
import { getCredits, getFaceClusters, type CreditSummary, type ClusterSummary } from "@/lib/api/ai";
import { getStoredAccessToken } from "@/lib/auth";

export default function AIOverviewPage() {
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const token = getStoredAccessToken();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([getCredits(token), getFaceClusters(token)])
      .then(([c, cl]) => { setCredits(c); setClusters(cl); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  const formatPaisa = (p: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(p / 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="rounded-xl border border-border-default bg-surface-raised p-6">
        <h3 className="text-sm font-medium text-text-secondary mb-2">People Detected</h3>
        <p className="text-3xl font-bold text-text-primary">{clusters.length}</p>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-6">
        <h3 className="text-sm font-medium text-text-secondary mb-2">AI Spend This Month</h3>
        <p className="text-3xl font-bold text-text-primary">
          {credits ? formatPaisa(credits.spent_this_month_paisa) : "—"}
        </p>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-6">
        <h3 className="text-sm font-medium text-text-secondary mb-2">API Key Status</h3>
        <p className="text-3xl font-bold text-text-primary">
          {credits?.monthly_cap_paisa ? "Active" : "Not Set"}
        </p>
      </div>
    </div>
  );
}

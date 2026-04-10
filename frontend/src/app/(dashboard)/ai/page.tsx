"use client";

import { useEffect, useState } from "react";
import { getCredits, getFaceClusters, type CreditSummary, type ClusterSummary } from "@/lib/api/ai";
import { getStoredAccessToken } from "@/lib/auth";

export default function AIOverviewPage() {
  const token = getStoredAccessToken();
  const requestKey = token ? "overview" : "unauthenticated";
  const [requestState, setRequestState] = useState<{
    key: string;
    credits: CreditSummary | null;
    clusters: ClusterSummary[];
  }>({
    key: "",
    credits: null,
    clusters: [],
  });

  const credits = requestState.key === requestKey ? requestState.credits : null;
  const clusters = requestState.key === requestKey ? requestState.clusters : [];
  const loading = Boolean(token) && requestState.key !== requestKey;

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;

    Promise.all([getCredits(token), getFaceClusters(token)])
      .then(([nextCredits, nextClusters]) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            credits: nextCredits,
            clusters: nextClusters,
          });
        }
      })
      .catch((error) => {
        console.error(error);
        if (!ignore) {
          setRequestState({
            key: requestKey,
            credits: null,
            clusters: [],
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [requestKey, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  const formatPaisa = (p: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(p / 100);

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

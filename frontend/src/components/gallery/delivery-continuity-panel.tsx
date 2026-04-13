"use client";

import { useEffect, useState } from "react";
import { getAnalyticsSummary, type AnalyticsSummary } from "@/lib/api/analytics";

interface DeliveryContinuityPanelProps {
  galleryId: string;
  token: string;
  selectedCount: number;
  totalCount: number;
}

export function DeliveryContinuityPanel({ galleryId, token, selectedCount, totalCount }: DeliveryContinuityPanelProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getAnalyticsSummary(token, galleryId, 30)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load delivery stats");
      });
    return () => {
      cancelled = true;
    };
  }, [galleryId, token]);

  const proofingComplete = totalCount > 0 && selectedCount >= totalCount;
  const proofingLabel = totalCount === 0
    ? "Proofing not started"
    : `${selectedCount} of ${totalCount} selected`;

  return (
    <div id="delivery" className="surface-panel space-y-3 p-5" data-testid="delivery-continuity-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Delivery continuity</h2>
        <span className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Last 30 days</span>
      </div>
      {loadError ? (
        <p className="text-xs text-danger-primary">{loadError}</p>
      ) : (
        <dl className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <dt className="text-text-tertiary">Downloads</dt>
            <dd className="mt-1 text-lg font-semibold text-text-primary">{summary?.downloads ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Views</dt>
            <dd className="mt-1 text-lg font-semibold text-text-primary">{summary?.views ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Proofing</dt>
            <dd className="mt-1 text-sm font-medium text-text-primary">
              <span className={proofingComplete ? "text-success-primary" : undefined}>{proofingLabel}</span>
            </dd>
          </div>
        </dl>
      )}
      <p className="text-[11px] leading-relaxed text-text-tertiary">
        Downloads, proofing exports, and hand-off status stay attached to this gallery workspace. Deliverables live
        here — no separate module.
      </p>
    </div>
  );
}

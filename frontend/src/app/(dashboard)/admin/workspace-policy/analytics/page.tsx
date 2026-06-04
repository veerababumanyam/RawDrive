"use client";

import { useCallback, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getUploadModerationAnalytics,
  type UploadModerationAnalytics,
} from "@/lib/api/admin";
import { BackButton } from "@/components/ui/back-button";

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S3 — Upload moderation analytics dashboard (admin).
//
// Four metric cards + a Tier D cause table. Kept deliberately simple for
// the initial M16 scope — richer charts (sparklines, heatmap) can land in
// a follow-up. All data comes from /api/v1/admin/upload-moderation/analytics.
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-raised bg-surface-raised/40 p-5">
      <div className="text-xs font-label uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div className="mt-2 font-headline text-3xl font-bold text-on-surface">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-text-secondary">{sub}</div>}
    </div>
  );
}

export default function UploadModerationAnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [data, setData] = useState<UploadModerationAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      const resp = await getUploadModerationAnalytics(token, workspaceId);
      setData(resp);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-8">
      <BackButton href="/admin/workspace-policy" label="Back" />
      <div>
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
          Upload Screening Analytics
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Block rate, desktop escalation, and Tier D causes over the configured
          analytics window.
        </p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label
            htmlFor="workspace-id-analytics"
            className="block text-xs font-label uppercase tracking-wide text-text-secondary mb-2"
          >
            Workspace ID
          </label>
          <input
            id="workspace-id-analytics"
            type="text"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="workspace UUID"
            className="w-full rounded-lg border border-surface-raised bg-surface-sunken px-4 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          disabled={!workspaceId || loading}
          className="rounded-lg bg-surface-raised px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-raised/80 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total scanned"
              value={data.total_scanned.toLocaleString()}
            />
            <MetricCard
              label="Block rate"
              value={`${(data.block_rate * 100).toFixed(1)}%`}
              sub={`${data.total_blocked.toLocaleString()} blocked`}
            />
            <MetricCard
              label="Desktop escalations"
              value={data.total_needs_desktop.toLocaleString()}
              sub="Require RawDrive Desktop (M17)"
            />
            <MetricCard
              label="Admin overrides"
              value={data.total_override.toLocaleString()}
              sub="False-positive allowlist tokens"
            />
          </div>

          <div>
            <h2 className="font-headline text-2xl font-bold text-on-surface mb-4">
              Tier D block causes
            </h2>
            {Object.keys(data.tier_d_causes).length === 0 ? (
              <p className="text-sm text-text-secondary">
                No Tier D blocks recorded in this window.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-raised">
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunken text-xs font-label uppercase tracking-wide text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 text-left">Cause</th>
                      <th className="px-4 py-3 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-raised">
                    {Object.entries(data.tier_d_causes)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cause, count]) => (
                        <tr key={cause} className="bg-surface-raised/20">
                          <td className="px-4 py-3 font-mono text-text-secondary">
                            {cause}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-on-surface">
                            {count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-text-secondary">
            Window: {new Date(data.window_start).toLocaleString()} —{" "}
            {new Date(data.window_end).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}

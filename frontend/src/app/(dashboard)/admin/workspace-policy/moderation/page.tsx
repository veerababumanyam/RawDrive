"use client";

import { useCallback, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listUploadModerationQueue,
  overrideUploadBlock,
  type BlockedAssetRow,
} from "@/lib/api/admin";

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S1 — Upload moderation dashboard (admin).
//
// Lists blocked / needs_desktop uploads for a given workspace and lets the
// admin issue a one-time allowlist token to override a false positive.
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadModerationPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [rows, setRows] = useState<BlockedAssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideMsg, setOverrideMsg] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      const resp = await listUploadModerationQueue(token, workspaceId);
      setRows(resp.queue);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const handleOverride = async (row: BlockedAssetRow) => {
    const justification = window.prompt(
      `Override block for ${row.filename}?\nEnter justification (required):`
    );
    if (!justification) return;

    setOverrideMsg(null);
    try {
      const token = getStoredAccessToken();
      const resp = await overrideUploadBlock(token, row.asset_id, justification);
      setOverrideMsg(
        `Allowlist token issued for ${row.filename}. Expires ${resp.expires_at}. Token: ${resp.token.slice(0, 16)}…`
      );
      // Refresh the list so the overridden row drops out.
      await loadQueue();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-8">
      <div>
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
          Upload Moderation
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Review files that the Tier D screener blocked. Override false positives
          by issuing a one-time allowlist token.
        </p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label
            htmlFor="workspace-id-moderation"
            className="block text-xs font-label uppercase tracking-wide text-text-secondary mb-2"
          >
            Workspace ID
          </label>
          <input
            id="workspace-id-moderation"
            type="text"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="workspace UUID"
            className="w-full rounded-lg border border-surface-raised bg-surface-sunken px-4 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          type="button"
          onClick={loadQueue}
          disabled={!workspaceId || loading}
          className="rounded-lg bg-surface-raised px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-raised/80 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load queue"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}
      {overrideMsg && (
        <div className="rounded-lg border border-feedback-success/30 bg-feedback-success/10 px-4 py-3 text-sm text-feedback-success break-all">
          {overrideMsg}
        </div>
      )}

      {rows.length === 0 && !loading && workspaceId && (
        <p className="text-sm text-text-secondary">
          No blocked uploads for this workspace.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-surface-raised">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-xs font-label uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3 text-left">Filename</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Engine</th>
                <th className="px-4 py-3 text-right">Risk</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-raised">
              {rows.map((row) => (
                <tr key={row.asset_id} className="bg-surface-raised/20">
                  <td className="px-4 py-3 text-on-surface">{row.filename}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        row.scan_status === "blocked"
                          ? "bg-feedback-error/10 text-feedback-error"
                          : "bg-feedback-warning/10 text-feedback-warning"
                      }`}
                    >
                      {row.scan_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {row.scan_engine}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">
                    {row.risk_score.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleOverride(row)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Override
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

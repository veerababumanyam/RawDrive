"use client";

import { useCallback, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listUploadModerationQueue,
  overrideUploadBlock,
  type BlockedAssetRow,
} from "@/lib/api/admin";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { BackButton } from "@/components/ui/back-button";

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S1 — Upload moderation dashboard (admin).
//
// Lists blocked / needs_desktop uploads for a given workspace and lets the
// admin issue a one-time allowlist token to override a false positive.
// ─────────────────────────────────────────────────────────────────────────────

type ModerationRow = BlockedAssetRow & Record<string, unknown>;

export default function UploadModerationPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [rows, setRows] = useState<ModerationRow[]>([]);
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
      setRows(resp.queue as ModerationRow[]);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const handleOverride = async (row: ModerationRow) => {
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

  const columns: ColumnDef<ModerationRow>[] = [
    {
      key: "filename",
      label: "Filename",
      sortable: true,
    },
    {
      key: "scan_status",
      label: "Status",
      sortable: true,
      filterable: true,
      filterOptions: ["blocked", "needs_desktop"],
      render: (value) => {
        const status = value as string;
        const colorClass =
          status === "blocked"
            ? "bg-feedback-error/10 text-feedback-error"
            : "bg-feedback-warning/10 text-feedback-warning";
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colorClass}`}
          >
            {status}
          </span>
        );
      },
    },
    {
      key: "scan_engine",
      label: "Engine",
      sortable: true,
    },
    {
      key: "risk_score",
      label: "Risk",
      sortable: true,
      align: "right",
      headerAlign: "right",
      render: (value) => (
        <span className="font-mono">{(value as number).toFixed(2)}</span>
      ),
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      render: (value) => new Date(value as string).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      headerAlign: "right",
      render: (_value, row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOverride(row);
          }}
          className="text-xs font-medium text-accent hover:underline"
        >
          Override
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-8">
      <BackButton href="/admin/workspace-policy" label="Back" />
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
          {loading ? "Loading\u2026" : "Load queue"}
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

      <DataTable<ModerationRow>
        columns={columns}
        data={rows}
        rowKey={(row) => row.asset_id}
        searchable
        searchKeys={["filename", "scan_engine"]}
        searchPlaceholder="Search uploads..."
        pageSize={20}
        loading={loading}
        emptyStateMessage="No blocked uploads for this workspace."
        compareFns={{
          created_at: (a, b) =>
            new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime(),
        }}
      />
    </div>
  );
}

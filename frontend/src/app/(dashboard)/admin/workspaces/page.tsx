"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { listWorkspaces, type WorkspaceOverview } from "@/lib/api/admin";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

type WorkspaceRow = WorkspaceOverview & Record<string, unknown>;

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

const columns: ColumnDef<WorkspaceRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    className: "font-semibold text-on-surface",
  },
  {
    key: "owner_name",
    label: "Owner",
    sortable: true,
    className: "text-text-tertiary",
  },
  {
    key: "state_name",
    label: "State",
    sortable: true,
    className: "text-text-tertiary",
    render: (value) => (value as string) || "—",
  },
  {
    key: "storage_used_bytes",
    label: "Storage",
    sortable: true,
    className: "text-secondary font-medium",
    render: (_value, row) => formatBytes(row.storage_used_bytes),
  },
  {
    key: "asset_count",
    label: "Assets",
    sortable: true,
    className: "text-text-tertiary",
  },
  {
    key: "subscription_tier",
    label: "Tier",
    sortable: true,
    filterable: true,
    filterOptions: ["Free", "Standard", "Professional", "Enterprise"],
    className: "font-medium text-primary",
    render: (value) => (value as string) || "Free",
  },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    className: "text-xs text-text-secondary font-label",
    render: (value) => new Date(value as string).toLocaleDateString(),
  },
];

const compareFns = {
  storage_used_bytes: (a: WorkspaceRow, b: WorkspaceRow) =>
    a.storage_used_bytes - b.storage_used_bytes,
  created_at: (a: WorkspaceRow, b: WorkspaceRow) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
};

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    listWorkspaces(token)
      .then((res) => { setWorkspaces(res.items as WorkspaceRow[]); setTotal(res.total_count); setError(null); })
      .catch(() => setError("Failed to load workspaces"))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-feedback-error">{error}</p></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
          Workspace Oversight
          <span className="text-xs font-label uppercase tracking-[0.15em] bg-surface-container-high px-3 py-1 rounded-full text-primary border border-white/5">
            {total} workspaces
          </span>
        </h2>
        <p className="text-text-secondary mt-2 font-body text-sm">Storage, subscriptions, and state metrics per workspace.</p>
      </div>

      <DataTable<WorkspaceRow>
        columns={columns}
        data={workspaces}
        rowKey={(row) => row.id}
        searchable
        searchKeys={["name", "owner_name", "state_name"]}
        searchPlaceholder="Search workspaces..."
        pageSize={20}
        loading={loading}
        compareFns={compareFns}
        emptyStateMessage="No workspaces found."
      />
    </div>
  );
}

// Design source: Stitch MCP Liquid Glass — data table with status badges
"use client";
import { getApiBaseUrl } from "@/lib/api/base-url";

import { useState, useEffect } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

interface DealerUser {
  workspace_id: string;
  workspace_name: string;
  owner_name: string;
  state_name: string;
  attributed_at: string;
  subscription_status: string;
  plan_name: string;
  mrr_paisa: number;
  [key: string]: unknown;
}

const statusColors: Record<string, string> = {
  active: "bg-accent-secondary/10 text-accent-secondary",
  trialing: "bg-accent-primary/10 text-accent-primary",
  cancelled: "bg-feedback-warning/10 text-feedback-warning",
  churned: "bg-feedback-error/10 text-feedback-error",
  none: "bg-surface-sunken text-text-tertiary",
};

function formatPaisa(p: number) {
  return `\u20B9${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const columns: ColumnDef<DealerUser>[] = [
  {
    key: "workspace_name",
    label: "Workspace",
    sortable: true,
  },
  {
    key: "owner_name",
    label: "Owner",
    sortable: true,
  },
  {
    key: "state_name",
    label: "State",
    sortable: true,
  },
  {
    key: "attributed_at",
    label: "Attributed",
    sortable: true,
    render: (value) => new Date(value as string).toLocaleDateString("en-IN"),
  },
  {
    key: "subscription_status",
    label: "Status",
    sortable: true,
    filterable: true,
    filterOptions: ["active", "trialing", "cancelled", "churned", "none"],
    render: (value) => {
      const status = value as string;
      return (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusColors[status] || statusColors.none}`}
        >
          {status}
        </span>
      );
    },
  },
  {
    key: "plan_name",
    label: "Plan",
    sortable: true,
  },
  {
    key: "mrr_paisa",
    label: "MRR",
    sortable: true,
    align: "right",
    headerAlign: "right",
    render: (value) => formatPaisa(value as number),
  },
];

export default function DealerUserList({ dealerId }: { dealerId: string }) {
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredAccessToken();
    fetch(`${getApiBaseUrl()}/api/v1/dealers/users?limit=20`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [dealerId]);

  return (
    <DataTable<DealerUser>
      columns={columns}
      data={users}
      rowKey={(row) => row.workspace_id}
      searchable
      searchKeys={["workspace_name", "owner_name"]}
      searchPlaceholder="Search users..."
      pageSize={20}
      loading={loading}
      emptyStateMessage="No referred users yet."
      compareFns={{
        attributed_at: (a, b) =>
          new Date(a.attributed_at).getTime() - new Date(b.attributed_at).getTime(),
        mrr_paisa: (a, b) => a.mrr_paisa - b.mrr_paisa,
      }}
    />
  );
}

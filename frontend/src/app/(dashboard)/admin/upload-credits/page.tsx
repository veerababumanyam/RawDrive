"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken, refreshAuthSession } from "@/lib/auth";
import { listWorkspaces, type WorkspaceOverview } from "@/lib/api/admin";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { GrantUploadCreditsDialog } from "@/components/admin/GrantUploadCreditsDialog";

// Dedicated admin surface for M41 FR-UCRT-03 upload-credit grants.
// Previously the Grant button only lived on `/admin/workspaces`, which
// admins couldn't find — the RechargeModal notice + the earlier bug
// report ("admin settings not showing option to set credits for upload")
// both make it clear this needs to be a top-level, discoverable page.
//
// This page is deliberately narrower than `/admin/workspaces`: it only
// shows the columns that matter for granting credits (name + owner) so
// the action is the visual focus. It reuses the same
// `GrantUploadCreditsDialog` component and the same listWorkspaces API,
// so there is no backend work required to ship it.

type WorkspaceRow = WorkspaceOverview & Record<string, unknown>;

function buildColumns(
  onGrant: (row: WorkspaceRow) => void,
): ColumnDef<WorkspaceRow>[] {
  return [
    {
      key: "name",
      label: "Workspace",
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
      key: "subscription_tier",
      label: "Tier",
      sortable: true,
      filterable: false,
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
    {
      key: "_actions",
      label: "Actions",
      align: "right",
      render: (_value, row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onGrant(row);
          }}
          data-testid={`upload-credits-grant-action-${row.id}`}
          className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Grant credits
        </button>
      ),
    },
  ];
}

const compareFns = {
  created_at: (a: WorkspaceRow, b: WorkspaceRow) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
};

export default function AdminUploadCreditsPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantTarget, setGrantTarget] = useState<WorkspaceRow | null>(null);
  const columns = buildColumns((row) => setGrantTarget(row));

  useEffect(() => {
    async function load() {
      let token = getStoredAccessToken();
      if (!token) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
        token = await refreshAuthSession(API_BASE);
      }
      if (!token) {
        setError("Session expired");
        setLoading(false);
        return;
      }
      try {
        const res = await listWorkspaces(token);
        setWorkspaces(res.items as WorkspaceRow[]);
        setTotal(res.total_count);
        setError(null);
      } catch {
        setError("Failed to load workspaces");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-feedback-error" data-testid="admin-upload-credits-error">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-upload-credits-page">
      <div>
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
          Upload Credits
          <span className="text-xs font-label uppercase tracking-[0.15em] bg-surface-container-high px-3 py-1 rounded-full text-primary border border-white/5">
            {total} workspaces
          </span>
        </h2>
        <p className="text-text-secondary mt-2 font-body text-sm max-w-3xl">
          Grant upload credits to any workspace. Grants are idempotent, audit-logged, and
          capped at 100,000 credits per grant. Customers see the balance update on their
          upload pill within a minute.
        </p>
      </div>

      <DataTable<WorkspaceRow>
        columns={columns}
        data={workspaces}
        rowKey={(row) => row.id}
        searchable
        searchKeys={["name", "owner_name"]}
        searchPlaceholder="Search workspaces by name or owner..."
        pageSize={20}
        loading={loading}
        compareFns={compareFns}
        emptyStateMessage="No workspaces found."
      />

      <GrantUploadCreditsDialog
        open={grantTarget !== null}
        onClose={() => setGrantTarget(null)}
        workspaceId={grantTarget?.id ?? ""}
        workspaceName={grantTarget?.name ?? ""}
      />
    </div>
  );
}

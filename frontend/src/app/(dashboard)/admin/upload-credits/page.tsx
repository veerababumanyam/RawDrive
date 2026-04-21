"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredAccessToken, refreshAuthSession } from "@/lib/auth";
import {
  listWorkspaces,
  getAdminWorkspaceUploadBalance,
  type WorkspaceOverview,
  type AdminWorkspaceUploadBalance,
} from "@/lib/api/admin";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { GrantUploadCreditsDialog } from "@/components/admin/GrantUploadCreditsDialog";

// Dedicated admin surface for M41 FR-UCRT-03 upload-credit grants.
// Now also shows the CURRENT credit balance per workspace so admins
// don't have to guess or dig into a ledger before granting more.
// Balances are fetched in parallel after the workspace list resolves
// and refreshed in-place when an admin successfully grants credits.

type WorkspaceRow = WorkspaceOverview & Record<string, unknown>;

interface BalanceState {
  loading: boolean;
  data?: AdminWorkspaceUploadBalance;
  error?: string;
}

type BalanceMap = Record<string, BalanceState>;

function formatCredits(n: number | undefined): string {
  if (typeof n !== "number") return "—";
  return n.toLocaleString("en-IN");
}

function buildColumns(
  onGrant: (row: WorkspaceRow) => void,
  balances: BalanceMap,
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
      // Primary answer to "how many total credits granted to a workspace".
      // plan_granted = recurring plan grants + admin grants; purchased = paid
      // top-ups; available = net balance after consumption/reservation.
      key: "_available_credits",
      label: "Available",
      align: "right",
      render: (_value, row) => {
        const state = balances[row.id];
        if (state?.loading) {
          return <span className="text-xs text-text-tertiary" data-testid={`balance-loading-${row.id}`}>…</span>;
        }
        if (state?.error) {
          return (
            <span
              className="text-xs text-feedback-error"
              title={state.error}
              data-testid={`balance-error-${row.id}`}
            >
              error
            </span>
          );
        }
        const available = state?.data?.available_credits;
        const low = state?.data?.low_balance === true;
        return (
          <span
            data-testid={`balance-available-${row.id}`}
            className={`font-mono text-sm ${low ? "text-feedback-error" : "text-text-primary"}`}
          >
            {formatCredits(available)}
          </span>
        );
      },
    },
    {
      // Breaks the available number down so admins can see whether most
      // of the balance came from plan grants (recurring) vs purchased
      // (gateway top-ups) — useful for deciding whether another grant
      // is warranted.
      key: "_granted_breakdown",
      label: "Granted / Purchased",
      align: "right",
      render: (_value, row) => {
        const data = balances[row.id]?.data;
        return (
          <span
            data-testid={`balance-breakdown-${row.id}`}
            className="font-mono text-xs text-text-secondary"
          >
            {formatCredits(data?.plan_granted)} / {formatCredits(data?.purchased)}
          </span>
        );
      },
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
  const [balances, setBalances] = useState<BalanceMap>({});

  // Fetch a single workspace's balance and merge the result into the
  // map. Extracted so the grant success handler can refresh just the
  // affected row without reloading the whole table.
  const fetchBalance = useCallback(async (workspaceId: string) => {
    setBalances((prev) => ({
      ...prev,
      [workspaceId]: { ...(prev[workspaceId] ?? {}), loading: true, error: undefined },
    }));
    try {
      const token = getStoredAccessToken() || "";
      const data = await getAdminWorkspaceUploadBalance(token, workspaceId);
      setBalances((prev) => ({
        ...prev,
        [workspaceId]: { loading: false, data },
      }));
    } catch (err) {
      setBalances((prev) => ({
        ...prev,
        [workspaceId]: {
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, []);

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
        const rows = res.items as WorkspaceRow[];
        setWorkspaces(rows);
        setTotal(res.total_count);
        setError(null);
        // Kick off parallel balance fetches. Each row's loading / error
        // state lands in the map independently so one slow/failing
        // workspace doesn't hold up the others.
        for (const row of rows) {
          void fetchBalance(row.id);
        }
      } catch {
        setError("Failed to load workspaces");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchBalance]);

  const columns = buildColumns((row) => setGrantTarget(row), balances);

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
          Grant upload credits to any workspace. The Available column shows the current net
          balance; Granted / Purchased breaks that down so you can see recurring plan grants
          vs paid top-ups before adding more. Grants are idempotent, audit-logged, and
          capped at 100,000 credits per grant.
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
        onGranted={() => {
          // Refresh the specific workspace's balance so the admin sees
          // the number tick up without a full page reload.
          if (grantTarget) void fetchBalance(grantTarget.id);
        }}
      />
    </div>
  );
}

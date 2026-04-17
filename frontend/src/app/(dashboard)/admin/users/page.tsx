"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listUsers,
  suspendUser,
  reactivateUser,
  deleteUser,
  changeUserRole,
  exportUsers,
  type AdminUser,
} from "@/lib/api/admin";
import { requestPasswordReset } from "@/lib/api/auth";
import { Download } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: "bg-feedback-success/10", text: "text-feedback-success", dot: "bg-feedback-success" },
    suspended: { bg: "bg-feedback-error/10", text: "text-feedback-error", dot: "bg-feedback-error" },
    deleted: { bg: "bg-surface-container/10", text: "text-text-tertiary", dot: "bg-surface-container-high" },
  };
  const c = colors[status] || colors.deleted;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${c.bg} ${c.text} text-[10px] font-bold uppercase`}>
      <span className={`w-1 h-1 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

type UserRow = AdminUser & Record<string, unknown>;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    const token = getStoredAccessToken();
    try {
      const res = await listUsers(token, {});
      setUsers(res.items as UserRow[]);
      setTotal(res.total_count);
      setError(null);
    } catch {
      setError("Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSuspend = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await suspendUser(token, id, "Admin action");
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suspend user. Check that the user exists and you have admin permissions.");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await reactivateUser(token, id);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reactivate user");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Permanently delete user "${name}"? This action cannot be undone.`)) return;
    try {
      const token = getStoredAccessToken();
      await deleteUser(token, id);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleRoleChange = async (id: string, newRole: string) => {
    try {
      const token = getStoredAccessToken();
      await changeUserRole(token, id, newRole);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change user role");
    }
  };

  // QA #40: admin-initiated password reset.
  // Triggers the same public /auth/request-password-reset flow that a user
  // would self-initiate from /forgot-password. The backend sends the reset
  // OTP to the email on file (via Mailpit in dev, real SMTP in prod). No
  // admin-specific endpoint is required — the public endpoint is safe to
  // call with any email and returns 202 regardless (enumeration defense,
  // SEC-F02). The admin sees a confirmation toast so they know it was sent.
  const handleSendPasswordReset = async (email: string, name: string) => {
    if (!confirm(`Send password reset email to ${name} (${email})?`)) return;
    try {
      await requestPasswordReset(email);
      setError(null);
      alert(`Password reset email sent to ${email}. They can use the link to set a new password.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send password reset");
    }
  };

  const handleExport = async () => {
    const token = getStoredAccessToken();
    const blob = await exportUsers(token);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<UserRow>[] = [
    {
      key: "full_name",
      label: "Name",
      sortable: true,
      render: (value) => (
        <span className="text-sm font-semibold text-on-surface">{String(value ?? "")}</span>
      ),
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      className: "text-text-tertiary",
    },
    {
      key: "platform_role",
      label: "Role",
      sortable: true,
      filterable: true,
      // QA #44: role filter must mirror the DB CHECK constraint exactly
      // (backend/internal/database/migrations/035_add_platform_roles.up.sql).
      // Previously "user" was listed — no rows carry that value, so the
      // filter returned zero results and looked broken.
      filterOptions: ["super_admin", "admin", "photographer", "dealer", "client", "team_member"],
      render: (value) => (
        <span className="text-sm text-secondary font-medium">{String(value ?? "")}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      filterOptions: ["active", "suspended", "inactive", "deleted"],
      render: (value) => <StatusBadge status={String(value ?? "")} />,
    },
    {
      key: "state_name",
      label: "State",
      sortable: true,
      className: "text-text-tertiary",
      render: (value) => <span>{value ? String(value) : "\u2014"}</span>,
    },
    {
      key: "tier_name",
      label: "Tier",
      sortable: true,
      render: (value) => (
        <span className="text-sm font-medium text-primary">{value ? String(value) : "\u2014"}</span>
      ),
    },
    {
      key: "workspace_count",
      label: "Workspaces",
      sortable: true,
      render: (value) => <span className="text-sm font-medium">{String(value ?? 0)}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      headerAlign: "right",
      align: "right",
      render: (_value, row) => {
        return (
          <div className="flex items-center gap-1.5 justify-end">
            {row.status === "active" && (
              <button
                onClick={(e) => { e.stopPropagation(); handleSuspend(row.id); }}
                className="px-2.5 py-1 text-xs rounded-lg bg-feedback-error/10 text-feedback-error hover:bg-feedback-error/20 transition-all font-medium"
                aria-label={`Suspend ${row.full_name}`}
              >
                Suspend
              </button>
            )}
            {row.status === "suspended" && (
              <button
                onClick={(e) => { e.stopPropagation(); handleReactivate(row.id); }}
                className="px-2.5 py-1 text-xs rounded-lg bg-feedback-success/10 text-feedback-success hover:bg-feedback-success/20 transition-all font-medium"
                aria-label={`Reactivate ${row.full_name}`}
              >
                Reactivate
              </button>
            )}
            <select
              onClick={(e) => e.stopPropagation()}
              value={row.platform_role}
              onChange={(e) => handleRoleChange(row.id, e.target.value)}
              className="appearance-none bg-surface-container-lowest border border-white/[0.06] rounded-lg px-2 py-1 text-xs text-on-surface cursor-pointer [&_option]:bg-[var(--surface-container-lowest)] [&_option]:text-[var(--on-surface)]"
              aria-label={`Change role for ${row.full_name}`}
            >
              <option value="photographer">Photographer</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
              <option value="dealer">Dealer</option>
              <option value="client">Client</option>
              <option value="team_member">Team Member</option>
            </select>
            {/* QA #40: admin can send a password-reset link to the user's
                email. Uses the shared /auth/request-password-reset flow so
                the backend (PasswordService) handles OTP mint + rate limit
                + Mailpit delivery uniformly with the user-initiated flow. */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSendPasswordReset(row.email, row.full_name);
              }}
              className="px-2.5 py-1 text-xs rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all font-medium"
              aria-label={`Send password reset to ${row.full_name}`}
              title="Send password reset email"
            >
              Reset pw
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(row.id, row.full_name); }}
              className="px-2.5 py-1 text-xs rounded-lg text-text-tertiary hover:bg-feedback-error/10 hover:text-feedback-error transition-all"
              aria-label={`Delete ${row.full_name}`}
              title="Delete user"
            >
              ✕
            </button>
          </div>
        );
      },
    },
  ];

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-feedback-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
            User Management
            <span className="text-xs font-label uppercase tracking-[0.15em] bg-surface-container-high px-3 py-1 rounded-full text-primary border border-white/5">
              {total} users
            </span>
          </h2>
          <p className="text-text-secondary mt-2 font-body text-sm">Manage photographers, studio accounts, and subscription tiers.</p>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-text-tertiary" aria-live="polite">
          Loading users...
        </p>
      )}

      <DataTable<UserRow>
        columns={columns}
        data={users}
        rowKey={(row) => row.id}
        searchable
        searchPlaceholder="Search users by name or email..."
        searchKeys={["full_name", "email"]}
        pageSize={20}
        loading={loading}
        emptyMessage="No users found."
        emptyStateMessage="No users found."
        toolbarActions={
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface hover:bg-white/5 transition-all text-sm font-medium"
            aria-label="Export CSV"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      />
    </div>
  );
}

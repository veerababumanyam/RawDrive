"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listUsers,
  getUserDetail,
  suspendUser,
  reactivateUser,
  deleteUser,
  changeUserRole,
  changeUserTier,
  exportUsers,
  listAdminPlans,
  type AdminPlan,
  type AdminUser,
  type AdminUserDetail,
  type AdminUserPaymentEvent,
} from "@/lib/api/admin";
import { requestPasswordReset } from "@/lib/api/auth";
import { Download, UserPlus, X } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
// Issue #4: the M39 E5-S2 NewUserDialog ships the create flow but was
// never wired to the admin users page — QA #4 in RawDrive_NewUniqueIssues
// flagged the missing button. Reuse the existing tested component.
import NewUserDialog from "@/components/admin/NewUserDialog";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-strong/40 glass-blur-subtle"
    >
      <div className="w-full max-w-sm rounded-xl bg-surface-container p-6 shadow-lg border border-border-subtle">
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-on-surface mb-2"
        >
          {title}
        </h2>
        <p className="text-sm text-text-secondary mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm border border-border-subtle hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? "rounded-lg px-4 py-2 text-sm font-medium bg-feedback-error text-text-media hover:bg-feedback-error/90 transition-colors"
                : "btn-primary px-4 py-2 text-sm"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    active: {
      bg: "bg-feedback-success/10",
      text: "text-feedback-success",
      dot: "bg-feedback-success",
    },
    suspended: {
      bg: "bg-feedback-error/10",
      text: "text-feedback-error",
      dot: "bg-feedback-error",
    },
    deleted: {
      bg: "bg-surface-container/10",
      text: "text-text-tertiary",
      dot: "bg-surface-container-high",
    },
  };
  const c = colors[status] || colors.deleted;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${c.bg} ${c.text} text-[10px] font-bold uppercase`}
    >
      <span className={`w-1 h-1 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

function formatPaisa(value?: number | null) {
  if (!value) return "Rs. 0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { timeZoneName: "short" });
}

function formatBytes(value?: number | null) {
  if (!value) return "0 GB";
  const gb = value / 2 ** 30;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

function userInitials(user: Pick<AdminUser, "full_name" | "email">) {
  const label = (user.full_name || user.email || "U").trim();
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function buildUserSearchText(user: AdminUser) {
  return [
    user.search_text,
    user.full_name,
    user.email,
    user.phone,
    user.platform_role,
    user.status,
    user.state_name,
    user.tier_slug,
    user.tier_name,
    user.subscription_status,
    user.subscription_billing_interval,
    user.latest_payment_provider,
    user.latest_payment_status,
    user.latest_payment_reference,
    user.latest_payment_order_id,
    user.latest_payment_id,
    user.total_paid_paise,
  ]
    .filter(Boolean)
    .join(" ");
}

type UserRow = AdminUser & Record<string, unknown>;

function normalizeUserRow(user: AdminUser): UserRow {
  return {
    ...user,
    search_text: buildUserSearchText(user),
  } as UserRow;
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-label uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm text-on-surface ${
          mono ? "font-mono text-xs" : "font-medium"
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function PaymentEventList({ events }: { events?: AdminUserPaymentEvent[] }) {
  if (!events?.length) {
    return <p className="text-sm text-text-tertiary">No payment records.</p>;
  }
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="rounded-lg border border-border-subtle bg-surface-container-low p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-on-surface">
              {formatPaisa(event.amount_paise)}
            </span>
            <span className="micro-badge border border-border-subtle bg-surface-container-high text-text-secondary">
              {event.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {event.provider} · {event.source} ·{" "}
            {formatDateTime(event.paid_at || event.created_at)}
          </p>
          {(event.provider_order_id || event.provider_payment_id) && (
            <p className="mt-1 break-all font-mono text-[11px] text-text-tertiary">
              {event.provider_order_id || event.provider_payment_id}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function UserProfileDrawer({
  user,
  loading,
  error,
  onClose,
}: {
  user: AdminUserDetail | UserRow | null;
  loading: boolean;
  error?: string | null;
  onClose: () => void;
}) {
  if (!user) return null;
  const detail = user as Partial<AdminUserDetail>;
  const workspaces = Array.isArray(detail.workspaces) ? detail.workspaces : [];
  const paymentEvents = Array.isArray(detail.payment_events)
    ? detail.payment_events
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-user-profile-title"
      className="fixed inset-0 z-50 flex justify-end bg-surface-scrim-strong/40 glass-blur-subtle"
    >
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border-subtle bg-surface-container p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="h-14 w-14 rounded-full border border-border-subtle object-cover"
              />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-container-high text-base font-bold text-accent">
                {userInitials(user)}
              </span>
            )}
            <div className="min-w-0">
              <h3
                id="admin-user-profile-title"
                className="truncate text-2xl font-bold text-on-surface"
              >
                {user.full_name || user.email}
              </h3>
              <p className="truncate text-sm text-text-tertiary">
                {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-border-subtle text-text-secondary hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close user profile"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <p className="mb-4 text-sm text-text-tertiary" aria-live="polite">
            Loading complete profile...
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-3 py-2 text-sm text-feedback-error">
            {error}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <DetailField label="Role" value={user.platform_role} />
          <DetailField label="Status" value={user.status} />
          <DetailField label="Phone" value={user.phone} />
          <DetailField label="State" value={user.state_name} />
          <DetailField label="Tier" value={user.tier_name || user.tier_slug} />
          <DetailField
            label="Subscription"
            value={[
              user.subscription_status,
              user.subscription_billing_interval,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <DetailField
            label="Subscription Amount"
            value={formatPaisa(user.subscription_amount_paisa)}
          />
          <DetailField
            label="Subscription Expires"
            value={formatDateTime(user.subscription_expires_at)}
          />
          <DetailField
            label="Total Paid"
            value={formatPaisa(user.total_paid_paise)}
          />
          <DetailField
            label="Latest Payment"
            value={[
              user.latest_payment_provider,
              user.latest_payment_status,
              formatPaisa(user.latest_payment_amount_paise),
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <DetailField
            label="Latest Order"
            value={user.latest_payment_order_id}
            mono
          />
          <DetailField
            label="Latest Payment ID"
            value={user.latest_payment_id || user.latest_payment_reference}
            mono
          />
          <DetailField
            label="Storage Used"
            value={formatBytes(user.storage_used)}
          />
          <DetailField label="Workspaces" value={user.workspace_count} />
          <DetailField
            label="Last Login"
            value={formatDateTime(user.last_login_at)}
          />
          <DetailField
            label="Created"
            value={formatDateTime(user.created_at)}
          />
        </div>

        <div className="mt-8 space-y-6">
          <section>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Recent payments
            </h4>
            <PaymentEventList events={paymentEvents} />
          </section>

          <section>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Workspaces
            </h4>
            {workspaces.length > 0 ? (
              <div className="space-y-2">
                {workspaces.map((workspace) => (
                  <div
                    key={workspace.id}
                    className="rounded-lg border border-border-subtle bg-surface-container-low p-3"
                  >
                    <p className="text-sm font-semibold text-on-surface">
                      {workspace.name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {workspace.role}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">No workspaces.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [planOptions, setPlanOptions] = useState<AdminPlan[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<
    AdminUserDetail | UserRow | null
  >(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Issue #4: modal state for admin-initiated user creation.
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    id: string;
    currentRole: string;
    newRole: string;
    userName: string;
  } | null>(null);
  const [pendingTierChange, setPendingTierChange] = useState<{
    id: string;
    currentTier: string;
    newTier: string;
    userName: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pendingPasswordReset, setPendingPasswordReset] = useState<{
    email: string;
    name: string;
  } | null>(null);

  const fetchUsers = useCallback(async (search = "") => {
    const token = getStoredAccessToken();
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      const res = await listUsers(token, params);
      setUsers(res.items.map(normalizeUserRow));
      setTotal(res.total_count);
      setError(null);
    } catch {
      setError("Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUsers = useCallback(() => {
    void fetchUsers(searchQuery);
  }, [fetchUsers, searchQuery]);

  useEffect(() => {
    async function initialFetch() {
      await fetchUsers();
    }
    void initialFetch();
  }, [fetchUsers]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        setLoading(true);
        void fetchUsers(query);
      }, 350);
    },
    [fetchUsers],
  );

  const handleSelectUser = useCallback(async (row: UserRow) => {
    const token = getStoredAccessToken();
    setSelectedUser(row);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await getUserDetail(token, row.id);
      setSelectedUser(detail);
    } catch {
      setDetailError("Could not load the complete user profile.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken() || "";
    listAdminPlans(token)
      .then((plans) =>
        setPlanOptions(
          plans.filter(
            (plan) =>
              plan.tier !== "pay_per_event" &&
              plan.active &&
              (plan.self_serve || plan.tier === "elite_studio"),
          ),
        ),
      )
      .catch(() => setPlanOptions([]));
  }, []);

  const handleSuspend = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await suspendUser(token, id, "Admin action");
      refreshUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to suspend user. Check that the user exists and you have admin permissions.",
      );
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await reactivateUser(token, id);
      refreshUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reactivate user",
      );
    }
  };

  const handleDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      const token = getStoredAccessToken();
      await deleteUser(token, id);
      refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleRoleChange = (
    id: string,
    newRole: string,
    currentRole: string,
    userName: string,
  ) => {
    if (newRole === currentRole) return;
    setPendingRoleChange({ id, currentRole, newRole, userName });
  };

  const confirmRoleChange = async () => {
    if (!pendingRoleChange) return;
    const { id, newRole } = pendingRoleChange;
    setPendingRoleChange(null);
    try {
      const token = getStoredAccessToken();
      await changeUserRole(token, id, newRole);
      refreshUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change user role",
      );
    }
  };

  const handleTierChange = (
    id: string,
    newTier: string,
    currentTier: string,
    userName: string,
  ) => {
    if (newTier === currentTier) return;
    setPendingTierChange({ id, currentTier, newTier, userName });
  };

  const confirmTierChange = async () => {
    if (!pendingTierChange) return;
    const { id, newTier } = pendingTierChange;
    setPendingTierChange(null);
    try {
      const token = getStoredAccessToken();
      await changeUserTier(token, id, newTier);
      refreshUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change user tier",
      );
    }
  };

  // QA #40: admin-initiated password reset.
  // Triggers the same public /auth/request-password-reset flow that a user
  // would self-initiate from /forgot-password. The backend sends the reset
  // OTP to the email on file (via Mailpit in dev, real SMTP in prod). No
  // admin-specific endpoint is required — the public endpoint is safe to
  // call with any email and returns 202 regardless (enumeration defense,
  // SEC-F02). The admin sees a confirmation toast so they know it was sent.
  const handleSendPasswordReset = (email: string, name: string) => {
    setPendingPasswordReset({ email, name });
  };

  const confirmPasswordReset = async () => {
    if (!pendingPasswordReset) return;
    const { email } = pendingPasswordReset;
    setPendingPasswordReset(null);
    try {
      await requestPasswordReset(email);
      setError(null);
      setSuccessMsg(`Password reset email sent to ${email}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send password reset",
      );
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

  const stateOptions = [
    ...new Set(users.map((u) => u.state_name).filter(Boolean)),
  ].sort() as string[];

  const columns: ColumnDef<UserRow>[] = [
    {
      key: "full_name",
      label: "Name",
      sortable: true,
      render: (_value, row) => (
        <div className="flex min-w-56 items-center gap-3">
          {row.avatar_url ? (
            <img
              src={row.avatar_url as string}
              alt=""
              className="h-10 w-10 rounded-full border border-border-subtle object-cover"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-container-high text-xs font-bold text-accent">
              {userInitials(row)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-on-surface">
              {String(row.full_name || row.email || "")}
            </span>
            <span className="block truncate text-xs text-text-tertiary">
              {row.phone || row.state_name || "Profile"}
            </span>
          </span>
        </div>
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
      filterOptions: [
        "super_admin",
        "admin",
        "photographer",
        "dealer",
        "client",
        "team_member",
      ],
      render: (value) => (
        <span className="text-sm text-secondary font-medium">
          {String(value ?? "")}
        </span>
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
      filterable: true,
      filterOptions: stateOptions,
      className: "text-text-tertiary",
      render: (value) => <span>{value ? String(value) : "\u2014"}</span>,
    },
    {
      key: "tier_name",
      label: "Tier",
      sortable: true,
      filterable: true,
      filterOptions:
        planOptions.length > 0
          ? planOptions.map((plan) => plan.name)
          : [
              "Starter",
              "Creator",
              "Pro Photographer",
              "Studio",
              "Elite Studio",
            ],
      render: (value) => (
        <span className="text-sm font-medium text-primary">
          {value ? String(value) : "\u2014"}
        </span>
      ),
    },
    {
      key: "latest_payment_provider",
      label: "Payment",
      sortable: true,
      accessor: (row) =>
        row.latest_payment_at ||
        row.latest_payment_provider ||
        row.total_paid_paise,
      render: (_value, row) => {
        const hasPayment =
          row.latest_payment_provider ||
          row.latest_payment_status ||
          row.latest_payment_amount_paise ||
          row.total_paid_paise;
        if (!hasPayment) {
          return (
            <span className="text-sm text-text-tertiary">No payments</span>
          );
        }
        const amount =
          (row.latest_payment_amount_paise as number | undefined) ??
          (row.total_paid_paise as number | undefined);
        return (
          <div className="min-w-44">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-on-surface">
                {formatPaisa(amount)}
              </span>
              {row.latest_payment_status && (
                <span className="micro-badge border border-border-subtle bg-surface-container-high text-text-secondary">
                  {String(row.latest_payment_status)}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-text-tertiary">
              {[
                row.latest_payment_provider,
                row.latest_payment_order_id,
                row.latest_payment_id,
              ]
                .filter(Boolean)
                .join(" · ") ||
                `Total ${formatPaisa(row.total_paid_paise as number)}`}
            </p>
          </div>
        );
      },
    },
    {
      key: "workspace_count",
      label: "Workspaces",
      sortable: true,
      render: (value) => (
        <span className="text-sm font-medium">{String(value ?? 0)}</span>
      ),
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleSuspend(row.id);
                }}
                className="px-2.5 py-1 text-xs rounded-lg bg-feedback-error/10 text-feedback-error hover:bg-feedback-error/20 transition-all font-medium"
                aria-label={`Suspend ${row.full_name}`}
              >
                Suspend
              </button>
            )}
            {row.status === "suspended" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReactivate(row.id);
                }}
                className="px-2.5 py-1 text-xs rounded-lg bg-feedback-success/10 text-feedback-success hover:bg-feedback-success/20 transition-all font-medium"
                aria-label={`Reactivate ${row.full_name}`}
              >
                Reactivate
              </button>
            )}
            <select
              onClick={(e) => e.stopPropagation()}
              value={row.platform_role}
              onChange={(e) =>
                handleRoleChange(
                  row.id,
                  e.target.value,
                  row.platform_role as string,
                  row.full_name,
                )
              }
              className="appearance-none bg-surface-container-lowest border border-text-media/10 rounded-lg px-2 py-1 text-xs text-on-surface cursor-pointer [&_option]:bg-[var(--surface-container-lowest)] [&_option]:text-[var(--on-surface)]"
              aria-label={`Change role for ${row.full_name}`}
            >
              <option value="photographer">Photographer</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
              <option value="dealer">Dealer</option>
              <option value="client">Client</option>
              <option value="team_member">Team Member</option>
            </select>
            {row.tier_slug && (
              <select
                onClick={(e) => e.stopPropagation()}
                value={row.tier_slug}
                onChange={(e) =>
                  handleTierChange(
                    row.id,
                    e.target.value,
                    row.tier_slug as string,
                    row.full_name,
                  )
                }
                className="appearance-none bg-surface-container-lowest border border-text-media/10 rounded-lg px-2 py-1 text-xs text-primary cursor-pointer [&_option]:bg-[var(--surface-container-lowest)] [&_option]:text-[var(--on-surface)]"
                aria-label={`Change tier for ${row.full_name}`}
                title="Change subscription tier"
              >
                {(planOptions.length > 0
                  ? planOptions
                  : [
                      { tier: "free", name: "Starter" },
                      { tier: "creator", name: "Creator" },
                      { tier: "pro_photographer", name: "Pro Photographer" },
                      { tier: "studio", name: "Studio" },
                      { tier: "elite_studio", name: "Elite Studio" },
                    ]
                ).map((plan) => (
                  <option key={plan.tier} value={plan.tier}>
                    {plan.name}
                  </option>
                ))}
              </select>
            )}
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
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(row.id, row.full_name);
              }}
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
      <div
        className="max-w-7xl mx-auto space-y-8 p-8"
        data-route-cache-revision="2026-06-09-admin-users"
      >
        <p className="text-feedback-error">{error}</p>
      </div>
    );
  }

  return (
    <div
      className="max-w-7xl mx-auto space-y-8"
      data-route-cache-revision="2026-06-09-admin-users"
    >
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
            User Management
            <span className="text-xs font-label uppercase tracking-[0.15em] bg-surface-container-high px-3 py-1 rounded-full text-primary border border-text-media/5">
              {total} users
            </span>
          </h2>
          <p className="text-text-secondary mt-2 font-body text-sm">
            Manage photographers, studio accounts, and subscription tiers.
          </p>
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
        searchPlaceholder="Search profiles, phones, plans, payments..."
        searchKeys={[
          "search_text",
          "full_name",
          "email",
          "phone",
          "state_name",
          "tier_name",
          "latest_payment_provider",
          "latest_payment_order_id",
          "latest_payment_id",
        ]}
        onSearchChange={handleSearchChange}
        onRowClick={handleSelectUser}
        pageSize={20}
        loading={loading}
        emptyMessage="No users found."
        emptyStateMessage="No users found."
        toolbarActions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateOpen(true)}
              className="btn-primary flex items-center gap-2 px-6 py-2.5 text-sm font-semibold"
              aria-label="Create user"
            >
              <UserPlus className="h-4 w-4" />
              Create user
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface hover:bg-surface-overlay/5 transition-all text-sm font-medium"
              aria-label="Export CSV"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        }
      />
      <NewUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          refreshUsers();
        }}
      />

      <UserProfileDrawer
        user={selectedUser}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setSelectedUser(null);
          setDetailError(null);
        }}
      />

      {successMsg && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-40 rounded-xl border border-feedback-success/30 bg-feedback-success/10 px-4 py-3 text-sm text-feedback-success shadow-lg"
        >
          {successMsg}
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="ml-3 text-feedback-success/70 hover:text-feedback-success"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {pendingRoleChange && (
        <ConfirmDialog
          title="Change user role?"
          message={`Change "${pendingRoleChange.userName}" from ${pendingRoleChange.currentRole} to ${pendingRoleChange.newRole}?`}
          confirmLabel="Change role"
          onConfirm={confirmRoleChange}
          onCancel={() => setPendingRoleChange(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete user?"
          message={`Permanently delete "${pendingDelete.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingPasswordReset && (
        <ConfirmDialog
          title="Send password reset?"
          message={`Send a password reset email to ${pendingPasswordReset.name} (${pendingPasswordReset.email})?`}
          confirmLabel="Send email"
          onConfirm={confirmPasswordReset}
          onCancel={() => setPendingPasswordReset(null)}
        />
      )}

      {pendingTierChange && (
        <ConfirmDialog
          title="Change subscription tier?"
          message={`Change "${pendingTierChange.userName}" from ${pendingTierChange.currentTier} to ${pendingTierChange.newTier}?`}
          confirmLabel="Change tier"
          onConfirm={confirmTierChange}
          onCancel={() => setPendingTierChange(null)}
        />
      )}
    </div>
  );
}

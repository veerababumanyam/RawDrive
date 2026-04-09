"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listUsers,
  suspendUser,
  reactivateUser,
  exportUsers,
  type AdminUser,
} from "@/lib/api/admin";

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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchUsers = async (searchQuery?: string) => {
    const token = getStoredAccessToken();
    try {
      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      const res = await listUsers(token, params);
      setUsers(res.data);
      setTotal(res.total);
      setError(null);
    } catch {
      setError("Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSearch = () => { setLoading(true); fetchUsers(search); };

  const handleSuspend = async (id: string) => {
    const token = getStoredAccessToken();
    await suspendUser(token, id, "Admin action");
    fetchUsers(search);
  };

  const handleReactivate = async (id: string) => {
    const token = getStoredAccessToken();
    await reactivateUser(token, id);
    fetchUsers(search);
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

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-text-secondary">Loading users...</p>
      </div>
    );
  }

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
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface hover:bg-white/5 transition-all text-sm font-medium"
          aria-label="Export CSV"
        >
          Export CSV
        </button>
      </div>

      {/* Filter Bar */}
      <section className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-5 rounded-2xl shadow-xl">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search users by name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-surface-container-lowest border-none rounded-xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-secondary/50 transition-all outline-none placeholder:text-gray-600"
            />
          </div>
          <button
            onClick={handleSearch}
            className="bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3 px-6 rounded-xl shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all active:scale-[0.98]"
          >
            Search
          </button>
        </div>
      </section>

      {/* Data Table */}
      {users.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">No users found.</div>
      ) : (
        <div className="bg-surface-container-low/20 border border-white/[0.03] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-text-secondary font-label text-[10px] uppercase tracking-[0.1em]">
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">State</th>
                  <th className="px-6 py-4 font-semibold">Tier</th>
                  <th className="px-6 py-4 font-semibold">Workspaces</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-5">
                      <span className="text-sm font-semibold text-on-surface">{user.full_name}</span>
                    </td>
                    <td className="px-6 py-5 text-sm text-text-tertiary">{user.email}</td>
                    <td className="px-6 py-5">
                      <span className="text-sm text-secondary font-medium">{user.platform_role}</span>
                    </td>
                    <td className="px-6 py-5">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-6 py-5 text-sm text-text-tertiary">{user.state_name || "—"}</td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-medium text-primary">{user.tier_name || "—"}</span>
                    </td>
                    <td className="px-6 py-5 text-sm font-medium">{user.workspace_count}</td>
                    <td className="px-6 py-5 text-right">
                      {user.status === "active" ? (
                        <button
                          onClick={() => handleSuspend(user.id)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-feedback-error/10 text-feedback-error hover:bg-red-500/20 transition-all font-medium"
                          aria-label={`Suspend ${user.full_name}`}
                        >
                          Suspend
                        </button>
                      ) : user.status === "suspended" ? (
                        <button
                          onClick={() => handleReactivate(user.id)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-feedback-success/10 text-feedback-success hover:bg-emerald-500/20 transition-all font-medium"
                          aria-label={`Reactivate ${user.full_name}`}
                        >
                          Reactivate
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

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
import { cn } from "@/lib/utils";

const statusClasses: Record<string, string> = {
  active: "status-badge status-badge--success",
  suspended: "status-badge status-badge--danger",
  deleted: "status-badge status-badge--neutral",
};

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

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSearch = () => {
    setLoading(true);
    fetchUsers(search);
  };

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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-text-secondary">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-semantic-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">User Management</h1>
          <p className="text-sm text-text-secondary mt-1">{total} users</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-accent-default text-text-inverse rounded-lg text-sm font-medium hover:bg-accent-hover"
          aria-label="Export CSV"
        >
          Export CSV
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search users by name, email, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 px-3 py-2 border border-border-default rounded-lg bg-surface-elevated text-text-primary placeholder:text-text-tertiary text-sm"
        />
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">No users found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">State</th>
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 font-medium">Workspaces</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border-default">
                  <td className="py-3 text-text-primary font-medium">{user.full_name}</td>
                  <td className="py-3 text-text-secondary">{user.email}</td>
                  <td className="py-3 text-text-secondary">{user.platform_role}</td>
                  <td className="py-3">
                    <span className={cn(statusClasses[user.status] || "status-badge status-badge--neutral")}>
                      {user.status}
                    </span>
                  </td>
                  <td className="py-3 text-text-secondary">{user.state_name || "—"}</td>
                  <td className="py-3 text-text-secondary">{user.tier_name || "—"}</td>
                  <td className="py-3 text-text-secondary">{user.workspace_count}</td>
                  <td className="py-3 space-x-2">
                    {user.status === "active" ? (
                      <button
                        onClick={() => handleSuspend(user.id)}
                        className="px-2 py-1 text-xs rounded bg-semantic-destructive/10 text-semantic-destructive hover:bg-semantic-destructive/20"
                        aria-label={`Suspend ${user.full_name}`}
                      >
                        Suspend
                      </button>
                    ) : user.status === "suspended" ? (
                      <button
                        onClick={() => handleReactivate(user.id)}
                        className="px-2 py-1 text-xs rounded bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20"
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
      )}
    </div>
  );
}

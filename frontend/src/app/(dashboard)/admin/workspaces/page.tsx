"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { listWorkspaces, type WorkspaceOverview } from "@/lib/api/admin";

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOverview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    listWorkspaces(token)
      .then((res) => {
        setWorkspaces(res.data);
        setTotal(res.total);
        setError(null);
      })
      .catch(() => setError("Failed to load workspaces"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-text-secondary">Loading workspaces...</p>
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
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Workspace Oversight</h1>
        <p className="text-sm text-text-secondary mt-1">{total} workspaces</p>
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">No workspaces found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Owner</th>
                <th className="pb-2 font-medium">State</th>
                <th className="pb-2 font-medium">Storage</th>
                <th className="pb-2 font-medium">Assets</th>
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id} className="border-b border-border-default">
                  <td className="py-3 text-text-primary font-medium">{ws.name}</td>
                  <td className="py-3 text-text-secondary">{ws.owner_name}</td>
                  <td className="py-3 text-text-secondary">{ws.state_name || "—"}</td>
                  <td className="py-3 text-text-secondary">{formatBytes(ws.storage_used_bytes)}</td>
                  <td className="py-3 text-text-secondary">{ws.asset_count}</td>
                  <td className="py-3 text-text-secondary">{ws.subscription_tier || "Free"}</td>
                  <td className="py-3 text-text-tertiary text-xs">
                    {new Date(ws.created_at).toLocaleDateString()}
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

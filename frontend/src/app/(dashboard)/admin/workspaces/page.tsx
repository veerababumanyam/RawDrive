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
      .then((res) => { setWorkspaces(res.data); setTotal(res.total); setError(null); })
      .catch(() => setError("Failed to load workspaces"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-text-secondary">Loading workspaces...</p></div>;
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

      {workspaces.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">No workspaces found.</div>
      ) : (
        <div className="bg-surface-container-low/20 border border-white/[0.03] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-text-secondary font-label text-[10px] uppercase tracking-[0.1em]">
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Owner</th>
                  <th className="px-6 py-4 font-semibold">State</th>
                  <th className="px-6 py-4 font-semibold">Storage</th>
                  <th className="px-6 py-4 font-semibold">Assets</th>
                  <th className="px-6 py-4 font-semibold">Tier</th>
                  <th className="px-6 py-4 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-5 text-sm font-semibold text-on-surface">{ws.name}</td>
                    <td className="px-6 py-5 text-sm text-text-tertiary">{ws.owner_name}</td>
                    <td className="px-6 py-5 text-sm text-text-tertiary">{ws.state_name || "—"}</td>
                    <td className="px-6 py-5 text-sm text-secondary font-medium">{formatBytes(ws.storage_used_bytes)}</td>
                    <td className="px-6 py-5 text-sm text-text-tertiary">{ws.asset_count}</td>
                    <td className="px-6 py-5 text-sm font-medium text-primary">{ws.subscription_tier || "Free"}</td>
                    <td className="px-6 py-5 text-xs text-text-secondary font-label">{new Date(ws.created_at).toLocaleDateString()}</td>
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

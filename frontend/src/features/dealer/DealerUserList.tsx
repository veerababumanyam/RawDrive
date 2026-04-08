// Design source: Stitch MCP Liquid Glass — data table with status badges
"use client";

import { useState, useEffect } from "react";

interface DealerUser {
  workspace_id: string;
  workspace_name: string;
  owner_name: string;
  state_name: string;
  attributed_at: string;
  subscription_status: string;
  plan_name: string;
  mrr_paisa: number;
}

const statusColors: Record<string, string> = {
  active: "bg-accent-secondary/10 text-accent-secondary",
  trialing: "bg-accent-primary/10 text-accent-primary",
  cancelled: "bg-yellow-500/10 text-yellow-500",
  churned: "bg-feedback-error/10 text-feedback-error",
  none: "bg-surface-sunken text-text-tertiary",
};

function formatPaisa(p: number) { return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; }

export default function DealerUserList({ dealerId }: { dealerId: string }) {
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/dealers/users?limit=20`)
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [dealerId]);

  if (loading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-surface-sunken rounded-xl" />)}</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-4 px-4 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">
        <span>Workspace</span><span>Owner</span><span>State</span><span>Attributed</span><span>Status</span><span>Plan</span><span className="text-right">MRR</span>
      </div>
      {users.length === 0 ? <p className="text-text-secondary text-center py-8">No referred users yet.</p> : users.map(u => (
        <div key={u.workspace_id} className="grid grid-cols-7 gap-4 px-4 py-3 glass-card rounded-xl items-center">
          <span className="text-sm text-text-primary truncate">{u.workspace_name}</span>
          <span className="text-sm text-text-secondary truncate">{u.owner_name}</span>
          <span className="text-sm text-text-secondary">{u.state_name}</span>
          <span className="text-sm text-text-secondary">{new Date(u.attributed_at).toLocaleDateString("en-IN")}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusColors[u.subscription_status] || statusColors.none}`}>{u.subscription_status}</span>
          <span className="text-sm text-text-secondary">{u.plan_name}</span>
          <span className="text-sm text-text-primary text-right">{formatPaisa(u.mrr_paisa)}</span>
        </div>
      ))}
    </div>
  );
}

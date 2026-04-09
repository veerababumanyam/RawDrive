// Design source: Stitch MCP Liquid Glass — summary bar + filtered table
"use client";

import { useState, useEffect } from "react";

interface Commission { id: string; workspace_name: string; amount_paisa: number; margin_rate_pct: number; status: string; earned_at: string; paid_at: string | null; }

const statusColors: Record<string, string> = {
  earned: "bg-accent-primary/10 text-accent-primary",
  pending: "bg-feedback-warning/10 text-feedback-warning",
  paid: "bg-feedback-success/10 text-feedback-success",
};

function formatPaisa(p: number) { return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; }

export default function CommissionTracker({ dealerId }: { dealerId: string }) {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/dealers/commissions?limit=20${filter ? `&status=${filter}` : ""}`;
    fetch(url).then(r => r.ok ? r.json() : { commissions: [] }).then(d => setCommissions(d.commissions || [])).catch(() => setCommissions([])).finally(() => setLoading(false));
  }, [dealerId, filter]);

  const totals = { earned: 0, pending: 0, paid: 0 };
  commissions.forEach(c => { if (c.status in totals) totals[c.status as keyof typeof totals] += c.amount_paisa; });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {(["earned", "pending", "paid"] as const).map(s => (
          <div key={s} className="glass-card p-4 text-center">
            <p className="text-xs text-text-tertiary uppercase">{s}</p>
            <p className="text-lg font-semibold text-text-primary">{formatPaisa(totals[s])}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {["", "earned", "pending", "paid"].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-sm min-h-[44px] ${filter === s ? "bg-accent-primary/20 text-accent-primary" : "text-text-secondary"}`}>
            {s || "All"}
          </button>
        ))}
      </div>
      {loading ? <div className="animate-pulse h-40 bg-surface-sunken rounded-xl" /> : commissions.length === 0 ? <p className="text-text-secondary text-center py-8">No commissions yet.</p> : (
        <div className="space-y-2">
          {commissions.map(c => (
            <div key={c.id} className="glass-card p-4 flex items-center justify-between rounded-xl">
              <div><p className="text-sm text-text-primary">{c.workspace_name}</p><p className="text-xs text-text-tertiary">{new Date(c.earned_at).toLocaleDateString("en-IN")}</p></div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[c.status] || ""}`}>{c.status}</span>
                <span className="text-sm font-medium text-text-primary">{formatPaisa(c.amount_paisa)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

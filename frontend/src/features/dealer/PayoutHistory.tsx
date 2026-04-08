// Design source: Stitch MCP Liquid Glass — glass-card list with status badges
"use client";

import { useState, useEffect } from "react";

interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  gross_attributed_revenue: number;
  commission_earned: number;
  tds_withheld: number;
  net_payable: number;
  status: string;
  paid_at: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatPaisa(paisa: number): string {
  return `₹${(paisa / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const statusColors: Record<string, string> = {
  draft: "bg-text-tertiary/10 text-text-tertiary",
  pending: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-accent-primary/10 text-accent-primary",
  processing: "bg-accent-secondary/10 text-accent-secondary",
  paid: "bg-green-500/10 text-green-500",
  failed: "bg-feedback-error/10 text-feedback-error",
};

export default function PayoutHistory() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/dealers/payouts`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPayouts)
      .catch(() => setPayouts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-6 h-28 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Payout History</h1>

      {payouts.length === 0 ? (
        <div className="glass-card p-8 text-center text-text-secondary">No payouts yet.</div>
      ) : (
        <div className="space-y-4">
          {payouts.map((p) => (
            <div key={p.id} className="glass-card p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-text-secondary">
                  {new Date(p.period_start).toLocaleDateString("en-IN")} –{" "}
                  {new Date(p.period_end).toLocaleDateString("en-IN")}
                </p>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || ""}`}>
                  {p.status}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-text-tertiary">Gross Revenue</p>
                  <p className="text-sm font-medium text-text-primary">{formatPaisa(p.gross_attributed_revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Commission</p>
                  <p className="text-sm font-medium text-accent-primary">{formatPaisa(p.commission_earned)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">TDS</p>
                  <p className="text-sm font-medium text-feedback-error">{formatPaisa(p.tds_withheld)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Net Payable</p>
                  <p className="text-sm font-bold text-text-primary">{formatPaisa(p.net_payable)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Design source: Stitch MCP — Change History Timeline (vertical timeline, glass cards)
"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface HistoryEntry {
  id: string;
  state_id: number | null;
  dealer_pct: number;
  platform_pct: number;
  effective_from: string;
  created_at: string;
}

export default function MarginHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/admin/margins/history`)
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((data) => setHistory(data.data || data || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 bg-surface-sunken rounded-xl" />;
  if (history.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-text-primary">Change History</h2>
      <div className="relative pl-6">
        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-accent-primary/20" />
        {history.map((entry) => (
          <div key={entry.id} className="relative mb-4">
            <div className="absolute -left-4 top-3 w-3 h-3 rounded-full bg-accent-primary" />
            <div className="glass-card p-4 rounded-xl ml-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-text-primary font-medium">{entry.state_id ? `State #${entry.state_id}` : "Global"}</span>
                <span className="text-xs text-text-tertiary">{new Date(entry.created_at).toLocaleDateString("en-IN")}</span>
              </div>
              <p className="text-sm text-text-secondary">Dealer: <span className="text-accent-primary font-medium">{entry.dealer_pct}%</span> / Platform: {entry.platform_pct}%</p>
              <p className="text-xs text-text-tertiary mt-1">Effective from {new Date(entry.effective_from).toLocaleDateString("en-IN")}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

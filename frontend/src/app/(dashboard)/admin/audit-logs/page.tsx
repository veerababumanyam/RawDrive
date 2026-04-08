"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { listAuditLogs, type AuditLogEntry } from "@/lib/api/admin";
import { cn } from "@/lib/utils";

const severityClasses: Record<string, string> = {
  low: "status-badge status-badge--neutral",
  medium: "status-badge status-badge--warning",
  high: "status-badge status-badge--danger",
  critical: "status-badge status-badge--danger",
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const fetchLogs = async (actionFilter?: string) => {
    const token = getStoredAccessToken();
    try {
      const params: Record<string, string> = {};
      if (actionFilter) params.action = actionFilter;
      const res = await listAuditLogs(token, params);
      setLogs(res.data);
      setTotal(res.total);
      setError(null);
    } catch {
      setError("Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-text-secondary">Loading audit logs...</p>
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
        <h1 className="text-2xl font-semibold text-text-primary">Audit Logs</h1>
        <p className="text-sm text-text-secondary mt-1">{total} entries</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Filter by action..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setLoading(true);
              fetchLogs(filter);
            }
          }}
          className="flex-1 px-3 py-2 border border-border-default rounded-lg bg-surface-elevated text-text-primary placeholder:text-text-tertiary text-sm"
        />
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No audit logs found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="pb-2 font-medium">Timestamp</th>
                <th className="pb-2 font-medium">Actor</th>
                <th className="pb-2 font-medium">Action</th>
                <th className="pb-2 font-medium">Resource</th>
                <th className="pb-2 font-medium">Severity</th>
                <th className="pb-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border-default">
                  <td className="py-3 text-text-tertiary text-xs">
                    {new Date(log.inserted_at).toLocaleString()}
                  </td>
                  <td className="py-3 text-text-secondary">{log.actor_email || log.actor_id}</td>
                  <td className="py-3 text-text-primary font-mono text-xs">{log.action}</td>
                  <td className="py-3 text-text-secondary">{log.resource_type}</td>
                  <td className="py-3">
                    <span className={cn(severityClasses[log.severity] || "status-badge status-badge--neutral")}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="py-3 text-text-tertiary text-xs">{log.ip_address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

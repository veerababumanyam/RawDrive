"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { listAuditLogs, type AuditLogEntry } from "@/lib/api/admin";

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    low: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
    medium: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
    high: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
    critical: { bg: "bg-red-600/20", text: "text-red-300", dot: "bg-red-300" },
  };
  const c = colors[severity] || colors.low;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${c.bg} ${c.text} text-[10px] font-bold uppercase`}>
      <span className={`w-1 h-1 rounded-full ${c.dot}`} />
      {severity}
    </span>
  );
}

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

  useEffect(() => { fetchLogs(); }, []);

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-gray-500">Loading audit logs...</p></div>;
  if (error) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-red-400">{error}</p></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
            Audit Logs
            <span className="text-xs font-label uppercase tracking-[0.15em] bg-surface-container-high px-3 py-1 rounded-full text-primary border border-white/5">
              {total} entries
            </span>
          </h2>
          <p className="text-gray-500 mt-2 font-body text-sm">Immutable record of every administrative action.</p>
        </div>
      </div>

      <section className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-5 rounded-2xl shadow-xl">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Filter by action..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setLoading(true); fetchLogs(filter); } }}
            className="flex-1 bg-surface-container-lowest border-none rounded-xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-secondary/50 transition-all outline-none placeholder:text-gray-600"
          />
        </div>
      </section>

      {logs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No audit logs found.</div>
      ) : (
        <div className="bg-surface-container-low/20 border border-white/[0.03] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-gray-500 font-label text-[10px] uppercase tracking-[0.1em]">
                  <th className="px-6 py-4 font-semibold">Timestamp</th>
                  <th className="px-6 py-4 font-semibold">Actor</th>
                  <th className="px-6 py-4 font-semibold">Action</th>
                  <th className="px-6 py-4 font-semibold">Resource</th>
                  <th className="px-6 py-4 font-semibold">Severity</th>
                  <th className="px-6 py-4 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-5 text-xs text-gray-500 font-label">{new Date(log.inserted_at).toLocaleString()}</td>
                    <td className="px-6 py-5 text-sm text-gray-400">{log.actor_email || log.actor_id}</td>
                    <td className="px-6 py-5 text-sm font-mono text-secondary">{log.action}</td>
                    <td className="px-6 py-5 text-sm text-gray-400">{log.resource_type}</td>
                    <td className="px-6 py-5"><SeverityBadge severity={log.severity} /></td>
                    <td className="px-6 py-5 text-xs text-gray-600 font-mono">{log.ip_address || "—"}</td>
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

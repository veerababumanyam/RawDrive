// Design source: Stitch MCP — Monthly Statement grid (glass-card, revenue summary, PDF download)
"use client";
import { getApiBaseUrl } from "@/lib/api/base-url";

import { useState, useEffect } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API = getApiBaseUrl();

interface Statement { month: string; gross_revenue_paisa: number; dealer_share_paisa: number; platform_share_paisa: number; payout_status: string; statement_pdf_url: string; }

function formatPaisa(p: number) { return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; }

const statusColors: Record<string, string> = { draft: "text-text-tertiary", pending: "text-feedback-warning", approved: "text-accent-primary", processing: "text-accent-secondary", paid: "text-feedback-success", failed: "text-feedback-error" };

export default function PayoutStatements() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredAccessToken();
    fetch(`${API}/api/v1/dealers/statements?year=${year}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).then(r => r.ok ? r.json() : []).then(setStatements).catch(() => setStatements([])).finally(() => setLoading(false));
  }, [year]);

  const downloadPDF = (url: string) => { window.open(`${API}${url}`, "_blank"); };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-medium text-text-primary">Monthly Statements</h2>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-base min-h-[44px] rounded-xl px-3">
          {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {loading ? <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="glass-card h-36 animate-pulse rounded-xl" />)}</div> : statements.length === 0 ? <p className="text-text-secondary text-center py-8 glass-card rounded-xl">No statements for {year}.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statements.map(s => (
            <div key={s.month} className="glass-card p-5 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">{new Date(s.month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
                <span className={`text-xs font-medium capitalize ${statusColors[s.payout_status] || "text-text-tertiary"}`}>{s.payout_status}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm"><span className="text-text-tertiary">Revenue</span><span className="text-text-primary">{formatPaisa(s.gross_revenue_paisa)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-tertiary">Your Share</span><span className="text-accent-primary font-medium">{formatPaisa(s.dealer_share_paisa)}</span></div>
              </div>
              <button onClick={() => downloadPDF(s.statement_pdf_url)} className="w-full text-sm text-accent-secondary hover:underline min-h-[44px] flex items-center justify-center gap-1">Download PDF</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

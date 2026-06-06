// Design source: Stitch MCP — Payout Approval table (status badges, action buttons, inline inputs)
"use client";
import { getApiBaseUrl } from "@/lib/api/base-url";

import { useState, useEffect } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API = getApiBaseUrl();

function getAuthHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface Payout { id: string; dealer_id: string; period_start: string; period_end: string; net_payable: number; status: string; }

function formatPaisa(p: number) { return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; }

const statusColors: Record<string, string> = { draft: "bg-surface-sunken text-text-tertiary", pending: "bg-feedback-warning/10 text-feedback-warning", approved: "bg-accent-primary/10 text-accent-primary", processing: "bg-accent-secondary/10 text-accent-secondary", paid: "bg-feedback-success/10 text-feedback-success", failed: "bg-feedback-error/10 text-feedback-error" };

export default function PayoutApproval() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPayout, setActionPayout] = useState<string | null>(null);
  const [paymentRef, setPaymentRef] = useState("");

  useEffect(() => {
    fetch(`${API}/api/v1/dealers/payouts`, { headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then(setPayouts)
      .catch(() => setPayouts([]))
      .finally(() => setLoading(false));
  }, []);

  const doAction = async (id: string, action: string, body?: Record<string, string>) => {
    try {
      const res = await fetch(`${API}/api/v1/admin/payouts/${id}/${action}`, { method: "POST", headers: getAuthHeaders(), body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) throw new Error("Action failed");
      setPayouts(prev => prev.map(p => p.id === id ? { ...p, status: action === "approve" ? "approved" : action === "confirm-payment" ? "paid" : p.status } : p));
      setActionPayout(null);
      setPaymentRef("");
    } catch (err) {
      console.error("Payout action failed:", err);
    }
  };

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="glass-card h-16 animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-text-primary">Payout Approvals</h2>
      {payouts.length === 0 ? <p className="text-text-secondary text-center py-8 glass-card rounded-xl">No payouts to review.</p> : (
        <div className="space-y-3">
          {payouts.map(p => (
            <div key={p.id} className="glass-card p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">Dealer: {p.dealer_id.slice(0, 8)}...</p>
                  <p className="text-xs text-text-tertiary">{new Date(p.period_start).toLocaleDateString("en-IN")} – {new Date(p.period_end).toLocaleDateString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-primary">{formatPaisa(p.net_payable)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || ""}`}>{p.status}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {p.status === "pending" && <button onClick={() => doAction(p.id, "approve")} className="bg-accent-secondary/20 text-accent-secondary px-4 py-2 rounded-full text-sm min-h-[44px]">Approve</button>}
                {p.status === "approved" && <button onClick={() => doAction(p.id, "process")} className="bg-accent-primary/20 text-accent-primary px-4 py-2 rounded-full text-sm min-h-[44px]">Process</button>}
                {p.status === "processing" && (
                  actionPayout === p.id ? (
                    <div className="flex gap-2 items-center">
                      <input type="text" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="UTR/Reference" className="input-base min-h-[44px] w-48" />
                      <button onClick={() => doAction(p.id, "confirm-payment", { payment_reference: paymentRef })} disabled={!paymentRef} className="bg-feedback-success/20 text-feedback-success px-4 py-2 rounded-full text-sm min-h-[44px] disabled:opacity-50">Confirm</button>
                    </div>
                  ) : <button onClick={() => setActionPayout(p.id)} className="bg-feedback-success/20 text-feedback-success px-4 py-2 rounded-full text-sm min-h-[44px]">Confirm Payment</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

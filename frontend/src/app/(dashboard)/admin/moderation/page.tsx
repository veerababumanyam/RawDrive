"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredAccessToken, refreshAuthSession } from "@/lib/auth";
import {
  listModerationQueue,
  approveModeration,
  rejectModeration,
  escalateModeration,
  type ModerationItem,
} from "@/lib/api/admin";

function ReasonBadge({ reason }: { reason: string }) {
  const isAutoFlagged = reason === "auto_flagged";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${isAutoFlagged ? "bg-feedback-warning/10 text-feedback-warning" : "bg-feedback-error/10 text-feedback-error"}`}>
      <span className={`w-1 h-1 rounded-full ${isAutoFlagged ? "bg-feedback-warning" : "bg-feedback-error"}`} />
      {isAutoFlagged ? "Auto-flagged" : "Reported"}
    </span>
  );
}

export default function AdminModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    let token = getStoredAccessToken();
    if (!token) {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
      token = await refreshAuthSession(API_BASE);
    }
    if (!token) {
      setError("Session expired. Please log in again.");
      setLoading(false);
      return;
    }
    try {
      const res = await listModerationQueue(token, { status: "pending" });
      setItems(res.items);
      setTotal(res.total_count);
      setError(null);
    } catch {
      setError("Failed to load moderation queue. The API may be unreachable.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleApprove = async (id: string) => { const token = getStoredAccessToken(); await approveModeration(token, id); fetchQueue(); };
  const handleReject = async (id: string) => { const token = getStoredAccessToken(); await rejectModeration(token, id, "Admin rejected"); fetchQueue(); };
  const handleEscalate = async (id: string) => { const token = getStoredAccessToken(); await escalateModeration(token, id, "Needs further review"); fetchQueue(); };

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-text-secondary">Loading moderation queue...</p></div>;
  if (error) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-feedback-error">{error}</p></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
          Content Moderation
          <span className="text-xs font-label uppercase tracking-[0.15em] bg-surface-container-high px-3 py-1 rounded-full text-primary border border-white/5">
            {total} pending {total === 1 ? "item" : "items"}
          </span>
        </h2>
        <p className="text-text-secondary mt-2 font-body text-sm">Review and action flagged content across the platform.</p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">No items pending moderation.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-5 rounded-2xl hover:bg-white/[0.02] transition-all flex items-center justify-between gap-6"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-[10px] font-bold uppercase">
                    {item.content_type}
                  </span>
                  <ReasonBadge reason={item.reason} />
                </div>
                <p className="text-xs text-text-secondary font-body">
                  Content: {item.content_id} &middot; Workspace: {item.workspace_id}
                </p>
                <p className="text-[10px] text-text-secondary font-label uppercase tracking-wider">
                  {new Date(item.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleApprove(item.id)} className="px-4 py-2 text-xs rounded-xl bg-feedback-success/10 text-feedback-success hover:bg-emerald-500/20 transition-all font-bold" aria-label={`Approve ${item.id}`}>
                  Approve
                </button>
                <button onClick={() => handleReject(item.id)} className="px-4 py-2 text-xs rounded-xl bg-feedback-error/10 text-feedback-error hover:bg-red-500/20 transition-all font-bold" aria-label={`Reject ${item.id}`}>
                  Reject
                </button>
                <button onClick={() => handleEscalate(item.id)} className="px-4 py-2 text-xs rounded-xl bg-feedback-warning/10 text-feedback-warning hover:bg-amber-500/20 transition-all font-bold" aria-label={`Escalate ${item.id}`}>
                  Escalate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

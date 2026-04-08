"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listModerationQueue,
  approveModeration,
  rejectModeration,
  escalateModeration,
  type ModerationItem,
} from "@/lib/api/admin";
import { cn } from "@/lib/utils";

const reasonClasses: Record<string, string> = {
  auto_flagged: "status-badge status-badge--warning",
  reported: "status-badge status-badge--danger",
};

export default function AdminModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = async () => {
    const token = getStoredAccessToken();
    try {
      const res = await listModerationQueue(token, { status: "pending" });
      setItems(res.data);
      setTotal(res.total);
      setError(null);
    } catch {
      setError("Failed to load moderation queue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleApprove = async (id: string) => {
    const token = getStoredAccessToken();
    await approveModeration(token, id);
    fetchQueue();
  };

  const handleReject = async (id: string) => {
    const token = getStoredAccessToken();
    await rejectModeration(token, id, "Admin rejected");
    fetchQueue();
  };

  const handleEscalate = async (id: string) => {
    const token = getStoredAccessToken();
    await escalateModeration(token, id, "Needs further review");
    fetchQueue();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-text-secondary">Loading moderation queue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-semantic-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Content Moderation</h1>
        <p className="text-sm text-text-secondary mt-1">
          {total} pending {total === 1 ? "item" : "items"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No items pending moderation.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="surface-panel p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="status-badge status-badge--accent">{item.content_type}</span>
                  <span className={cn(reasonClasses[item.reason] || "status-badge status-badge--neutral")}>
                    {item.reason === "auto_flagged" ? "Auto-flagged" : "Reported"}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  Content: {item.content_id} &middot; Workspace: {item.workspace_id}
                </p>
                <p className="text-xs text-text-tertiary">
                  {new Date(item.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(item.id)}
                  className="px-3 py-1.5 text-xs rounded bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20 font-medium"
                  aria-label={`Approve ${item.id}`}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(item.id)}
                  className="px-3 py-1.5 text-xs rounded bg-semantic-destructive/10 text-semantic-destructive hover:bg-semantic-destructive/20 font-medium"
                  aria-label={`Reject ${item.id}`}
                >
                  Reject
                </button>
                <button
                  onClick={() => handleEscalate(item.id)}
                  className="px-3 py-1.5 text-xs rounded bg-semantic-warning/10 text-semantic-warning hover:bg-semantic-warning/20 font-medium"
                  aria-label={`Escalate ${item.id}`}
                >
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

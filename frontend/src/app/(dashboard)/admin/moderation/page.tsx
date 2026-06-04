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
import { GlassButton } from "@/components/ui/glass-button";

function ReasonBadge({ reason }: { reason: string }) {
  const isAutoFlagged = reason === "auto_flagged";
  return (
    <span
      className={`micro-badge ${isAutoFlagged ? "bg-feedback-warning/10 text-feedback-warning" : "bg-feedback-error/10 text-feedback-error"}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${isAutoFlagged ? "bg-feedback-warning" : "bg-feedback-error"}`}
      />
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

  useEffect(() => {
    async function initialFetch() {
      await fetchQueue();
    }
    void initialFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (loading)
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-text-secondary">Loading moderation queue...</p>
      </div>
    );
  if (error)
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-feedback-error">{error}</p>
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="font-headline text-4xl font-extrabold text-text-primary flex items-center gap-4">
          Content Moderation
          <span className="micro-badge border border-border-subtle bg-surface-container-high text-accent">
            {total} pending {total === 1 ? "item" : "items"}
          </span>
        </h2>
        <p className="text-text-secondary mt-2 font-body text-sm">
          Review and action flagged content across the platform.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          No items pending moderation.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="surface-panel flex items-center justify-between gap-6 p-5 transition-all hover:bg-surface-container-low"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="micro-badge bg-accent-subtle text-accent">
                    {item.content_type}
                  </span>
                  <ReasonBadge reason={item.reason} />
                </div>
                <p className="text-xs text-text-secondary font-body">
                  Content: {item.content_id} &middot; Workspace:{" "}
                  {item.workspace_id}
                </p>
                <p className="text-caption font-label uppercase">
                  {new Date(item.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <GlassButton
                  size="sm"
                  variant="success"
                  onClick={() => handleApprove(item.id)}
                  aria-label={`Approve ${item.id}`}
                >
                  Approve
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="danger"
                  onClick={() => handleReject(item.id)}
                  aria-label={`Reject ${item.id}`}
                >
                  Reject
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="surface"
                  onClick={() => handleEscalate(item.id)}
                  aria-label={`Escalate ${item.id}`}
                >
                  Escalate
                </GlassButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

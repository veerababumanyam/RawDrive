"use client";

import { useState, useEffect } from "react";

interface ModerationItem {
  id: string;
  content_type: string;
  content_id: string;
  workspace_id: string;
  reason: string;
  reporter_id?: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  notes?: string;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== "undefined" ? localStorage.getItem("rawdrive_token") || "" : "";

  const fetchQueue = () => {
    fetch(`${API_BASE}/api/v1/moderation/queue`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const resolve = async (id: string, action: string) => {
    await fetch(`${API_BASE}/api/v1/moderation/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    fetchQueue();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="h-64 bg-surface-sunken rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Content Moderation</h1>
        <p className="text-sm text-text-secondary mt-1">
          {items.length} pending {items.length === 1 ? "item" : "items"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No items pending moderation. All clear!
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent">
                    {item.content_type}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    item.reason === "auto_flagged"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    {item.reason === "auto_flagged" ? "Auto-flagged" : "Reported"}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1 truncate">
                  Content ID: {item.content_id}
                </p>
                <p className="text-xs text-text-secondary">
                  {new Date(item.created_at).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => resolve(item.id, "approved")}
                  className="px-3 py-2 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors min-h-[44px]"
                >
                  Approve
                </button>
                <button
                  onClick={() => resolve(item.id, "rejected")}
                  className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors min-h-[44px]"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

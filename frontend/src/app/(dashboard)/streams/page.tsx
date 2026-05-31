"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { type Stream } from "@/lib/api/streams";
import { authFetch } from "@/lib/api/authFetch";
import { cn } from "@/lib/utils";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Trash } from "@/components/icons";

const statusStyles: Record<string, string> = {
  created: "bg-surface-sunken text-text-secondary",
  scheduled: "bg-info/10 text-info border border-info/20",
  live: "bg-error/10 text-error border border-error/20 animate-pulse",
  ended: "bg-surface-sunken text-text-secondary",
  processing_vod: "bg-warning/10 text-warning border border-warning/20",
  vod_ready: "bg-success/10 text-success border border-success/20",
  failed: "bg-error/10 text-error",
};

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStreams = () => {
    authFetch("/api/v1/streams")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to list streams: ${res.status}`);
        const body = await res.json();
        return Array.isArray(body) ? body : body.streams || [];
      })
      .then(setStreams)
      .catch((err) => {
        setError(err?.message || "Failed to load streams");
        setStreams([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStreams();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this stream? This action cannot be undone.")) return;
    try {
      await authFetch(`/api/v1/streams/${id}`, { method: "DELETE" });
      loadStreams();
    } catch {
      setError("Failed to delete stream");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Live Streams</h1>
          <p className="text-sm text-text-secondary mt-1">
            {streams.length} {streams.length === 1 ? "stream" : "streams"}
          </p>
        </div>
        <Link
          href="/streams/new"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors min-h-[44px]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Stream
        </Link>
      </div>

      {streams.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-sunken flex items-center justify-center">
            <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No streams yet</h3>
          <p className="text-sm text-text-secondary mb-6">
            Create your first live stream to broadcast events to remote guests.
          </p>
          <Link
            href="/streams/new"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 min-h-[44px]"
          >
            Create Stream
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {streams.map((stream) => (
            <div
              key={stream.id}
              className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:bg-surface-raised/50 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
                {stream.status === "live" ? (
                  <div className="w-3 h-3 rounded-full bg-error animate-pulse" />
                ) : (
                  <svg className="w-6 h-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <Link href={`/streams/${stream.id}`} className="font-medium text-text-primary hover:text-accent truncate block">
                  {stream.title}
                </Link>
                <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                  {stream.scheduled_at && (
                    <span>Scheduled: {new Date(stream.scheduled_at).toLocaleDateString()}</span>
                  )}
                  {stream.peak_viewers > 0 && (
                    <span>Peak: {stream.peak_viewers} viewers</span>
                  )}
                  {stream.duration_seconds > 0 && (
                    <span>{Math.round(stream.duration_seconds / 60)}m</span>
                  )}
                </div>
              </div>

              <span className={cn("px-2.5 py-1 rounded-lg text-xs font-medium", statusStyles[stream.status] || statusStyles.created)}>
                {stream.status === "live" ? "● LIVE" : stream.status.replace(/_/g, " ")}
              </span>

              <GlassIconButton
                variant="danger"
                size="md"
                label="Delete stream"
                onClick={() => handleDelete(stream.id)}
              >
                <Trash />
              </GlassIconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

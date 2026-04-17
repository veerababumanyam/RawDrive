"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";

// M39 E9-S2: photo-trail feed page. Consumes GET /api/v1/photo-trail
// (see backend/internal/handler/photo_trail_handler.go) and renders
// recent events grouped by time bucket.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface PhotoTrailEvent {
  id: string;
  action: string;
  resource_id: string;
  created_at: string;
}

interface PhotoTrailResponse {
  events: PhotoTrailEvent[];
  next_cursor: string | null;
}

function groupLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "Today";
  if (diffMs < 2 * day) return "Yesterday";
  if (diffMs < 7 * day) return "This Week";
  return "This Month";
}

function actionLabel(action: string): string {
  switch (action) {
    case "upload_batch":
      return "Uploaded a batch";
    case "gallery_create":
      return "Created a gallery";
    case "gallery_share":
      return "Shared a gallery";
    case "proof_select":
      return "Selected a proof";
    case "proof_approve":
      return "Approved a proof";
    case "proof_reject":
      return "Rejected a proof";
    default:
      return action;
  }
}

export default function PhotoTrailPage() {
  const [events, setEvents] = useState<PhotoTrailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const token = getStoredAccessToken() || "";
        const res = await fetch(`${API_BASE}/api/v1/photo-trail?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const body = (await res.json()) as PhotoTrailResponse;
        setEvents(Array.isArray(body.events) ? body.events : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Failed to load trail");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const grouped = events.reduce<Record<string, PhotoTrailEvent[]>>((acc, ev) => {
    const key = groupLabel(ev.created_at);
    (acc[key] ||= []).push(ev);
    return acc;
  }, {});

  return (
    <main className="max-w-3xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Activity trail</h1>
        <p className="text-sm text-text-secondary mt-1">
          Your last 30 days of uploads, galleries, and proof decisions.
        </p>
      </header>

      {loading && <p role="status">Loading…</p>}
      {error && (
        <p role="alert" className="text-feedback-error">
          {error}
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-lg border border-border-subtle p-8 text-center">
          <p className="text-text-secondary">No activity yet in the last 30 days.</p>
        </div>
      )}

      {["Today", "Yesterday", "This Week", "This Month"].map((bucket) => {
        const items = grouped[bucket];
        if (!items || items.length === 0) return null;
        return (
          <section key={bucket} className="mb-6">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-2">
              {bucket}
            </h2>
            <ul className="divide-y divide-border-subtle border border-border-subtle rounded-md overflow-hidden">
              {items.map((ev) => (
                <li key={ev.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{actionLabel(ev.action)}</p>
                    <p className="text-xs text-text-tertiary font-mono">{ev.resource_id}</p>
                  </div>
                  <time className="text-xs text-text-tertiary">
                    {new Date(ev.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

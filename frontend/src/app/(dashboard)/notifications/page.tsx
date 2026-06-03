"use client";

// Notifications inbox. Consumes the M4 notifications API
// (GET /api/v1/notifications, PUT /:id/read, PUT /read-all) via the
// pre-existing client at @/lib/api/notifications. Lives at /notifications
// to match the Bell-icon href in the dashboard header
// (frontend/src/app/(dashboard)/layout.tsx ~line 425); prior to 2026-05-18
// that link 404'd because the page was never built. Backend + types
// existed since M4 — this is the missing consumer.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listNotifications,
  markAllRead,
  markRead,
  type Notification,
} from "@/lib/api/notifications";

// Short relative-time formatter. Bigger thresholds than typical
// chat surfaces because notifications skew toward "few minutes" to
// "few days" — anything beyond a week we fall back to a localized
// date so the user can pinpoint when a stale notification fired.
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(() => !!getStoredAccessToken());
  const [error, setError] = useState<string | null>(() =>
    getStoredAccessToken() ? null : "Your session expired. Please log in again.",
  );
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    listNotifications(token)
      .then((items) => {
        if (cancelled) return;
        // Server may or may not return sorted; enforce newest-first
        // on the client so the inbox is deterministic regardless of
        // backend pagination/order choices.
        items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setNotifications(items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load notifications");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Optimistic mark-as-read. The backend endpoint returns 200 with no
  // useful body, so we flip the local row immediately and only revert
  // on failure. Reverting keeps the unread-count and the dot indicator
  // honest if the network drops.
  const handleMark = useCallback(async (id: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() }
          : n,
      ),
    );
    try {
      await markRead(token, id);
    } catch {
      // Network/server hiccup — back the row out so the unread dot
      // reappears and the user can retry.
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_read: false, read_at: undefined } : n,
        ),
      );
    }
  }, []);

  const handleMarkAll = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setMarkingAll(true);
    const snapshot = notifications;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at ?? now })),
    );
    try {
      await markAllRead(token);
    } catch {
      // Roll back the whole batch on failure — keeping a half-marked
      // state would be more confusing than no change at all.
      setNotifications(snapshot);
    } finally {
      setMarkingAll(false);
    }
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {unreadCount > 0
              ? `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`
              : "You're all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkAll()}
            disabled={markingAll}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container disabled:opacity-50 min-h-[40px]"
          >
            <Check className="h-4 w-4" />
            Mark all as read
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card flex items-center justify-center rounded-2xl p-12">
          <p className="text-sm text-text-tertiary">Loading…</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
          <Bell className="h-12 w-12 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const interactive = Boolean(n.action_url) || !n.is_read;
            const tile = (
              <div
                className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                  n.is_read
                    ? "border-border-default bg-surface-raised"
                    : "border-accent-primary/30 bg-surface-container"
                } ${interactive ? "hover:bg-surface-container-high" : ""}`}
              >
                {/* Unread dot. Hidden via transparent background (not
                    display:none) when read so the row's left edge
                    doesn't shift horizontally as items flip state. */}
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.is_read ? "bg-transparent" : "bg-accent-primary"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm ${
                      n.is_read ? "text-text-secondary" : "font-medium text-text-primary"
                    }`}
                  >
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-1 text-sm text-text-tertiary line-clamp-2">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-text-tertiary">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </div>
            );

            // Click semantics — three cases:
            //   1. action_url set → Link navigates; mark-read fires
            //      as a side-effect so the dot disappears when the
            //      user returns. Works for read items too (re-nav).
            //   2. No action_url, unread → button just marks read.
            //   3. No action_url, read → static <li>, no affordance.
            if (n.action_url) {
              return (
                <li key={n.id}>
                  <Link
                    href={n.action_url}
                    onClick={() => {
                      if (!n.is_read) void handleMark(n.id);
                    }}
                    className="block focus:outline-none focus:ring-2 focus:ring-accent-primary/40 rounded-xl"
                  >
                    {tile}
                  </Link>
                </li>
              );
            }
            if (!n.is_read) {
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void handleMark(n.id)}
                    className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-accent-primary/40 rounded-xl"
                    aria-label={`Mark "${n.title}" as read`}
                  >
                    {tile}
                  </button>
                </li>
              );
            }
            return <li key={n.id}>{tile}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

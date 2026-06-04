"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listInquiries,
  replyToInquiry,
  type MarketplaceInquiry,
} from "@/lib/api/marketplace";
import { getStoredAccessToken, getStoredAccessTokenClaims } from "@/lib/auth";

const STATUS_CLASSES: Record<string, string> = {
  sent: "status-badge status-badge--neutral",
  read: "status-badge status-badge--neutral",
  replied: "status-badge status-badge--success",
  declined: "status-badge status-badge--danger",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function senderLabel(inq: MarketplaceInquiry): string {
  if (inq.from_user_name) return inq.from_user_name;
  if (inq.from_user_email) return inq.from_user_email;
  return "Client";
}

export function MarketplaceInquiriesPanel() {
  const token = getStoredAccessToken();
  // Decode the JWT once on mount instead of on every render. getStoredAccessTokenClaims
  // runs window.atob internally, so memoizing avoids a per-render decode.
  const currentUserID = useMemo(() => {
    if (typeof window === "undefined") return "";
    return getStoredAccessTokenClaims()?.sub ?? "";
  }, []);

  const [inquiries, setInquiries] = useState<MarketplaceInquiry[]>([]);
  const [loading, setLoading] = useState(() => Boolean(token));
  const [error, setError] = useState<string | null>(() =>
    token ? null : "Not authenticated",
  );
  const [selected, setSelected] = useState<MarketplaceInquiry | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySent, setReplySent] = useState(false);

  const load = useCallback(() => {
    if (!token) {
      return undefined;
    }
    // Guard against a stale closure: if token/currentUserID change (e.g. a token
    // refresh) before this request resolves, the cleanup flips `ignore` so the
    // superseded response never calls setState — preventing the concurrent
    // listInquiries race.
    let ignore = false;
    listInquiries(token)
      .then((data) => {
        if (ignore) return;
        setInquiries(
          (data ?? []).filter((inq) => inq.to_user_id === currentUserID),
        );
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setError(
          err instanceof Error ? err.message : "Failed to load inquiries",
        );
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [token, currentUserID]);

  useEffect(() => load(), [load]);

  const openDetail = (inq: MarketplaceInquiry) => {
    setSelected(inq);
    setReplyText("");
    setReplyError(null);
    setReplySent(false);
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim() || replying) return;
    setReplying(true);
    setReplyError(null);
    try {
      await replyToInquiry(token!, selected.id, replyText.trim());
      setReplySent(true);
      setReplyText("");
      // Update local state so the status badge refreshes immediately
      setInquiries((prev) =>
        prev.map((inq) =>
          inq.id === selected.id
            ? { ...inq, status: "replied", reply_message: replyText.trim() }
            : inq,
        ),
      );
      setSelected((prev) =>
        prev
          ? { ...prev, status: "replied", reply_message: replyText.trim() }
          : prev,
      );
    } catch (err) {
      setReplyError(
        err instanceof Error
          ? err.message
          : "Failed to send reply. Please try again.",
      );
    } finally {
      setReplying(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-surface-sunken" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
        {error}
      </div>
    );
  }

  if (inquiries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-default p-10 text-center">
        <p className="font-medium text-text-primary">
          No marketplace inquiries yet
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          When a potential client sends you an inquiry from your marketplace
          profile, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {inquiries.length} {inquiries.length === 1 ? "inquiry" : "inquiries"}{" "}
        received
      </p>

      <div className="rounded-2xl border border-border-default bg-surface-raised overflow-hidden">
        {inquiries.map((inq) => (
          <div
            key={inq.id}
            onClick={() => openDetail(inq)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openDetail(inq);
              }
            }}
            className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-b border-border-default last:border-b-0 hover:bg-surface-sunken/40 transition-colors cursor-pointer"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">
                {senderLabel(inq)}
              </p>
              <p className="mt-0.5 text-xs text-text-secondary line-clamp-1">
                {inq.message}
              </p>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {formatDate(inq.created_at)}
              </p>
            </div>
            <span
              className={`self-center capitalize ${STATUS_CLASSES[inq.status] ?? "status-badge status-badge--neutral"}`}
            >
              {inq.status}
            </span>
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Inquiry detail"
        >
          <div
            className="flex-1 bg-surface-scrim-strong/40 glass-blur-subtle"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <aside className="w-full max-w-md bg-surface-raised border-l border-border-default overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-on-surface">Inquiry</h3>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="rounded-full p-1 hover:bg-surface-sunken/40 text-text-secondary"
              >
                ✕
              </button>
            </div>

            <span
              className={`capitalize ${STATUS_CLASSES[selected.status] ?? "status-badge status-badge--neutral"}`}
            >
              {selected.status}
            </span>

            {/* Sender info */}
            <div className="rounded-xl border border-border-default bg-surface-container-low p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
                From
              </p>
              <p className="font-medium text-on-surface">
                {selected.from_user_name ?? "Client"}
              </p>
              {selected.from_user_email && (
                <a
                  href={`mailto:${selected.from_user_email}`}
                  className="text-sm text-accent hover:underline break-all"
                >
                  {selected.from_user_email}
                </a>
              )}
            </div>

            <dl className="text-sm space-y-3">
              <div>
                <dt className="text-xs text-text-tertiary mb-1">Message</dt>
                <dd className="text-text-primary whitespace-pre-wrap">
                  {selected.message}
                </dd>
              </div>
              {selected.event_date && (
                <div>
                  <dt className="text-xs text-text-tertiary mb-1">
                    Event Date
                  </dt>
                  <dd className="text-text-primary">
                    {formatDate(selected.event_date)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-text-tertiary mb-1">Received</dt>
                <dd className="text-text-primary text-xs">
                  {formatDate(selected.created_at)}
                </dd>
              </div>
            </dl>

            {/* Existing reply (if already replied) */}
            {selected.reply_message && (
              <div className="rounded-xl border border-feedback-success/30 bg-feedback-success/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-feedback-success mb-1">
                  Your reply
                </p>
                <p className="text-sm text-text-primary whitespace-pre-wrap">
                  {selected.reply_message}
                </p>
              </div>
            )}

            {/* Reply form — shown when not yet replied, or after reply was just sent */}
            {replySent ? (
              <div className="flex items-start gap-3 rounded-xl bg-feedback-success/10 border border-feedback-success/30 p-4">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-feedback-success/20 text-feedback-success text-xs">
                  ✓
                </span>
                <p className="text-sm text-text-primary">
                  Reply sent! The client will see your response.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
                  {selected.status === "replied"
                    ? "Send another reply"
                    : "Reply"}
                </label>
                {replyError && (
                  <p className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-3 py-2 text-sm text-feedback-error">
                    {replyError}
                  </p>
                )}
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write your reply to the client..."
                  rows={4}
                  className="input-base w-full resize-none"
                />
                <button
                  onClick={handleReply}
                  disabled={replying || !replyText.trim()}
                  className="btn-primary w-full py-2.5 text-sm disabled:opacity-50"
                >
                  {replying ? "Sending..." : "Send Reply"}
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

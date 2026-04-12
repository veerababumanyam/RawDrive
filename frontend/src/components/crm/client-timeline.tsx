"use client";

import type { TimelineEntry } from "@/lib/api/crm";
import { cn } from "@/lib/utils";

/**
 * Vertical timeline showing chronological interactions for a client.
 * Each entry gets a colored dot + icon based on event type, a date header
 * when the day changes, and metadata below the title.
 */

const typeConfig: Record<string, { dot: string; label: string }> = {
  deal_created:    { dot: "bg-accent-primary",  label: "Deal" },
  invoice_sent:    { dot: "bg-info",            label: "Invoice Sent" },
  invoice_paid:    { dot: "bg-success",         label: "Invoice Paid" },
  booking_created: { dot: "bg-warning",         label: "Booking" },
  gallery_shared:  { dot: "bg-accent-primary",  label: "Gallery" },
  gallery_selection: { dot: "bg-success",       label: "Selection" },
  gallery_review:  { dot: "bg-info",            label: "Review" },
  gallery_accessed: { dot: "bg-accent-primary", label: "Gallery" },
  gallery_order:   { dot: "bg-success",         label: "Order" },
  gallery_download: { dot: "bg-warning",        label: "Download" },
  album_approved:  { dot: "bg-success",         label: "Approval" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPaisa(paisa: number): string {
  return "\u20B9" + (paisa / 100).toLocaleString("en-IN");
}

interface ClientTimelineProps {
  entries: TimelineEntry[];
  loading?: boolean;
}

export function ClientTimeline({ entries, loading }: ClientTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex gap-3">
            <div className="h-3 w-3 rounded-full bg-surface-sunken mt-1.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-surface-sunken rounded" />
              <div className="h-3 w-32 bg-surface-sunken rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm">No timeline activity yet.</p>
      </div>
    );
  }

  const timelineRows = entries.map((entry, idx) => {
    const dateStr = formatDate(entry.timestamp);
    const previousDate = idx > 0 ? formatDate(entries[idx - 1].timestamp) : "";
    return {
      entry,
      idx,
      dateStr,
      showDateHeader: dateStr !== previousDate,
    };
  });

  return (
    <div className="relative pl-6 py-2">
      {/* Vertical line */}
      <div className="absolute left-[5px] top-0 bottom-0 w-px bg-border-default" />

      {timelineRows.map(({ entry, idx, dateStr, showDateHeader }) => {
        const cfg = typeConfig[entry.type] || { dot: "bg-text-tertiary", label: entry.type };
        const meta = entry.metadata || {};

        return (
          <div key={`${entry.type}-${entry.timestamp}-${idx}`}>
            {showDateHeader && (
              <div className="relative -ml-6 mb-3 mt-4 first:mt-0">
                <p className="text-xs font-medium text-text-tertiary pl-6">{dateStr}</p>
              </div>
            )}
            <div className="relative mb-4 last:mb-0">
              {/* Dot */}
              <div
                className={cn(
                  "absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-raised",
                  cfg.dot,
                )}
              />

              <div>
                <p className="text-sm font-medium text-text-primary">{entry.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-text-tertiary">{formatTime(entry.timestamp)}</span>
                  <span className="text-xs text-text-tertiary px-1.5 py-0.5 bg-surface-sunken rounded">
                    {cfg.label}
                  </span>
                  {meta.amount_paisa != null && typeof meta.amount_paisa === "number" && (
                    <span className="text-xs text-text-secondary">
                      {formatPaisa(meta.amount_paisa)}
                    </span>
                  )}
                  {meta.total_paisa != null && typeof meta.total_paisa === "number" && (
                    <span className="text-xs text-text-secondary">
                      {formatPaisa(meta.total_paisa)}
                    </span>
                  )}
                  {meta.amount_paid_paisa != null && typeof meta.amount_paid_paisa === "number" && (
                    <span className="text-xs text-text-secondary">
                      {formatPaisa(meta.amount_paid_paisa)}
                    </span>
                  )}
                  {typeof meta.stage === "string" && (
                    <span className="text-xs text-text-secondary capitalize">{meta.stage as string}</span>
                  )}
                  {typeof meta.event_type === "string" && (
                    <span className="text-xs text-text-secondary capitalize">{meta.event_type as string}</span>
                  )}
                  {typeof meta.location === "string" && (
                    <span className="text-xs text-text-secondary">{meta.location as string}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

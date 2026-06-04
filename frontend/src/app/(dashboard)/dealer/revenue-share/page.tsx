"use client";

import { useEffect, useState } from "react";
import {
  getDealerRevenueCalendar,
  type RevenueCalendarResponse,
  type DailyRevenueShare,
} from "@/lib/api/dealer";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ChevronLeft, ChevronRight, XMark } from "@/components/icons";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatPaisa(paisa: number) {
  return (
    "₹" + (paisa / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })
  );
}

interface DayModalProps {
  entry: DailyRevenueShare;
  onClose: () => void;
}

function DayModal({ entry, onClose }: DayModalProps) {
  const date = new Date(entry.date + "T00:00:00");
  const label = date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-strong/50 glass-blur-subtle p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md rounded-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Revenue Breakdown
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">{label}</p>
          </div>
          <GlassIconButton
            onClick={onClose}
            label="Close"
            size="sm"
            variant="ghost"
          >
            <XMark />
          </GlassIconButton>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-secondary">
              Photographers subscribed
            </span>
            <span className="font-medium text-text-primary">
              {entry.subscriber_count}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-secondary">
              Total subscription revenue
            </span>
            <span className="font-medium text-text-primary">
              {formatPaisa(entry.total_subscription_paisa)}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-border-subtle">
            <span className="text-text-secondary">Your commission rate</span>
            <span className="font-medium text-text-primary">
              {entry.commission_rate_pct}%
            </span>
          </div>
          <div className="flex justify-between py-3 rounded-xl bg-accent/10 px-3">
            <span className="font-semibold text-accent">
              Your revenue share
            </span>
            <span className="font-bold text-accent text-base">
              {formatPaisa(entry.revenue_share_paisa)}
            </span>
          </div>
        </div>

        <p className="text-xs text-text-tertiary">
          Calculation: {formatPaisa(entry.total_subscription_paisa)} ×{" "}
          {entry.commission_rate_pct}% ={" "}
          {formatPaisa(entry.revenue_share_paisa)}
        </p>
      </div>
    </div>
  );
}

export default function DealerRevenueSharePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [data, setData] = useState<RevenueCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DailyRevenueShare | null>(
    null,
  );

  // Reset loading + error at render time when the viewed month changes.
  // Doing this during render (not in an effect) avoids synchronous setState
  // inside the effect body — the React-recommended pattern for state that
  // derives from props/other-state transitions.
  const [prevPeriod, setPrevPeriod] = useState(`${year}:${month}`);
  const currentPeriod = `${year}:${month}`;
  if (prevPeriod !== currentPeriod) {
    setPrevPeriod(currentPeriod);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    getDealerRevenueCalendar(year, month)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load revenue data",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Build calendar grid
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun

  // Map date string → DailyRevenueShare for O(1) lookup
  const dayMap = new Map<string, DailyRevenueShare>();
  if (data) {
    for (const d of data.days) dayMap.set(d.date, d);
  }

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Revenue Share
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your daily commission earnings based on subscription revenue generated
          in your state.
        </p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <GlassIconButton
          onClick={prevMonth}
          label="Previous month"
          size="sm"
          variant="ghost"
        >
          <ChevronLeft />
        </GlassIconButton>
        <h2 className="text-lg font-semibold text-text-primary">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <GlassIconButton
          onClick={nextMonth}
          disabled={year === now.getFullYear() && month === now.getMonth() + 1}
          label="Next month"
          size="sm"
          variant="ghost"
        >
          <ChevronRight />
        </GlassIconButton>
      </div>

      {/* Summary cards */}
      {data && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-xl p-4 space-y-1">
            <p className="text-xs text-text-tertiary uppercase tracking-wide">
              Total Subscriptions
            </p>
            <p className="text-xl font-bold text-text-primary">
              {formatPaisa(data.total_revenue_paisa)}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 space-y-1">
            <p className="text-xs text-text-tertiary uppercase tracking-wide">
              Commission Rate
            </p>
            <p className="text-xl font-bold text-text-primary">
              {data.commission_rate_pct}%
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 space-y-1 col-span-2 md:col-span-1">
            <p className="text-xs text-text-tertiary uppercase tracking-wide">
              Your Share
            </p>
            <p className="text-xl font-bold text-accent">
              {formatPaisa(data.total_share_paisa)}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {/* Calendar grid */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-border-subtle">
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-xs font-medium text-text-tertiary"
            >
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-text-tertiary animate-pulse">
            Loading…
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (day === null) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="h-16 border-b border-r border-border-subtle/40 last:border-r-0"
                  />
                );
              }
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const entry = dayMap.get(dateStr);
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => entry && setSelectedDay(entry)}
                  disabled={!entry}
                  className={[
                    "h-16 p-1.5 border-b border-r border-border-subtle/40 last:border-r-0 text-left transition-colors",
                    entry
                      ? "hover:bg-feedback-success/20 cursor-pointer bg-feedback-success/10"
                      : "cursor-default",
                    isToday && !entry ? "bg-accent/5" : "",
                    isToday && entry ? "ring-1 ring-inset ring-accent/30" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "text-xs font-medium",
                      isToday ? "text-accent" : "text-text-secondary",
                    ].join(" ")}
                  >
                    {day}
                  </span>
                  {entry && (
                    <div className="mt-0.5">
                      <p className="text-[10px] leading-none text-text-tertiary">
                        Share
                      </p>
                      <p className="text-xs font-semibold text-accent truncate">
                        {formatPaisa(entry.revenue_share_paisa)}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-text-tertiary text-center">
        Click on a day with earnings to see the revenue breakdown.
      </p>

      {selectedDay && (
        <DayModal entry={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}

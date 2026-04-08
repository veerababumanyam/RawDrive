"use client";

import { useState, useEffect, useMemo } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { calendarEventClasses } from "@/lib/dashboard-ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string;
  status: string;
  location?: string;
  color?: string;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStart = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), [currentDate]);
  const monthEnd = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), [currentDate]);

  useEffect(() => {
    const from = monthStart.toISOString();
    const to = monthEnd.toISOString();
    const token = getStoredAccessToken();
    setLoading(true);
    fetch(`${API_BASE}/api/v1/calendar/events?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(setEvents)
      .catch((err) => { setError(err?.message || "Failed to load events"); setEvents([]); })
      .finally(() => setLoading(false));
  }, [monthStart, monthEnd]);

  const daysInMonth = monthEnd.getDate();
  const firstDayOfWeek = monthStart.getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const eventsOnDay = (day: number) => {
    const dayStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.start_at.startsWith(dayStr));
  };

  const monthName = currentDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Calendar</h1>
          <p className="text-sm text-text-secondary mt-1">{monthName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
            className="surface-button h-11 w-11 px-0"
          >
            &larr;
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="surface-button text-sm"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
            className="surface-button h-11 w-11 px-0"
          >
            &rarr;
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse h-96 bg-surface-sunken rounded-xl" />
      ) : (
        <div className="bg-surface-raised rounded-xl border border-border-default overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 text-center text-xs font-medium text-text-tertiary py-2 border-b border-border-default">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells for offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-24 border-b border-r border-border-default bg-surface-sunken/30" />
            ))}
            {days.map((day) => {
              const dayEvents = eventsOnDay(day);
              const isToday =
                day === new Date().getDate() &&
                currentDate.getMonth() === new Date().getMonth() &&
                currentDate.getFullYear() === new Date().getFullYear();
              return (
                <div
                  key={day}
                  className={`h-24 border-b border-r border-border-default p-1 ${isToday ? "bg-accent/5" : ""}`}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium",
                      isToday ? "bg-accent text-text-inverse" : "text-text-secondary",
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className={cn(
                          "w-full justify-start rounded-md px-1 py-0.5 text-[10px] font-medium truncate",
                          calendarEventClasses[e.event_type] || "status-badge status-badge--neutral",
                        )}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] text-text-tertiary px-1">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

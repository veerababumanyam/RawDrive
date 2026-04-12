"use client";

import { useState, useEffect, useMemo } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { calendarEventClasses } from "@/lib/dashboard-ui";
import { listContacts, type Contact } from "@/lib/api/crm";

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
  contact_id?: string;
  deal_id?: string;
  notes?: string;
  all_day?: boolean;
}

const EVENT_TYPES = [
  { value: "shoot", label: "Photography shoot" },
  { value: "consultation", label: "Consultation" },
  { value: "edit_session", label: "Editing session" },
  { value: "delivery", label: "Delivery / handover" },
  { value: "personal", label: "Personal / blocked" },
  { value: "other", label: "Other" },
];

function toLocalInput(d: Date): string {
  // Convert a Date to the "YYYY-MM-DDTHH:MM" format expected by
  // <input type="datetime-local">. Uses the local timezone so the
  // value round-trips without surprising the user.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const token = getStoredAccessToken();

  const monthStart = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), [currentDate]);
  const monthEnd = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), [currentDate]);
  const requestKey = `${monthStart.toISOString()}:${monthEnd.toISOString()}`;
  const [requestState, setRequestState] = useState<{
    key: string;
    events: CalendarEvent[];
    error: string | null;
  }>({
    key: "",
    events: [],
    error: null,
  });
  const [refreshTick, setRefreshTick] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Create-event modal state. Opens when the user clicks "+ New event"
  // in the header OR when they click a day cell in the month grid
  // (click-to-create defaults the start_at to 10:00 on that day).
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyForm = {
    title: "",
    event_type: "shoot",
    start_at: toLocalInput(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 10, 0)),
    end_at: toLocalInput(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12, 0)),
    all_day: false,
    location: "",
    contact_id: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  const events = requestState.key === requestKey ? requestState.events : [];
  const error = token
    ? requestState.key === requestKey
      ? requestState.error
      : null
    : "Missing access token";
  const loading = Boolean(token) && requestState.key !== requestKey;

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;
    const from = monthStart.toISOString();
    const to = monthEnd.toISOString();

    fetch(`${API_BASE}/api/v1/calendar/events?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          // Backend returns `null` when the range is empty, which
          // previously crashed the month-grid with
          // "Cannot read properties of null (reading 'filter')".
          // Coerce to an array and accept either a bare array or
          // the wrapped {events:[...]} shape for forward-compat.
          const list: CalendarEvent[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.events)
              ? data.events
              : [];
          setRequestState({
            key: requestKey,
            events: list,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            events: [],
            error: err?.message || "Failed to load events",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [monthEnd, monthStart, requestKey, token, refreshTick]);

  // Prefetch contacts once so the create-event <select> has real
  // options — the contact_id foreign key on calendar_events is how
  // a shoot on the calendar gets linked back to a client in CRM.
  useEffect(() => {
    if (!token) return;
    listContacts(token).then(setContacts).catch(() => setContacts([]));
  }, [token]);

  const openCreate = (defaultDay?: number) => {
    const base = defaultDay
      ? new Date(currentDate.getFullYear(), currentDate.getMonth(), defaultDay, 10, 0)
      : new Date();
    const endBase = new Date(base.getTime() + 2 * 60 * 60 * 1000);
    setForm({
      ...emptyForm,
      start_at: toLocalInput(base),
      end_at: toLocalInput(endBase),
    });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/calendar/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title.trim(),
          event_type: form.event_type,
          start_at: new Date(form.start_at).toISOString(),
          end_at: new Date(form.end_at).toISOString(),
          all_day: form.all_day,
          location: form.location.trim() || undefined,
          contact_id: form.contact_id || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setRequestState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to create event",
      }));
    } finally {
      setCreating(false);
    }
  };

  const daysInMonth = monthEnd.getDate();
  const firstDayOfWeek = monthStart.getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const eventsOnDay = (day: number) => {
    const dayStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return (events ?? []).filter((event) => event?.start_at?.startsWith(dayStr));
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
            onClick={() => openCreate()}
            className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
          >
            + New Event
          </button>
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

      {showCreate && (
        <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">New Calendar Event</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text" placeholder="Title (e.g. Sharma Wedding Shoot) *"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="sm:col-span-2 rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
              autoFocus
            />
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              {EVENT_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
            <select
              value={form.contact_id}
              onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="">— No linked client —</option>
              {contacts.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Start
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              End
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </label>
            <input
              type="text" placeholder="Location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="sm:col-span-2 rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
            />
            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="sm:col-span-2 rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary resize-y min-h-[80px]"
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
              />
              All-day event
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.title.trim()}
              className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {creating ? "Creating…" : "Save Event"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-96 bg-surface-sunken rounded-xl" />
      ) : (
        <div className="bg-surface-raised rounded-xl border border-border-default overflow-hidden">
          <div className="grid grid-cols-7 text-center text-xs font-medium text-text-tertiary py-2 border-b border-border-default">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, index) => (
              <div key={`empty-${index}`} className="h-24 border-b border-r border-border-default bg-surface-sunken/30" />
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
                  onClick={() => openCreate(day)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") openCreate(day); }}
                  className={`h-24 border-b border-r border-border-default p-1 cursor-pointer hover:bg-accent/5 transition-colors ${isToday ? "bg-accent/5" : ""}`}
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
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "w-full justify-start rounded-md px-1 py-0.5 text-[10px] font-medium truncate",
                          calendarEventClasses[event.event_type] || "status-badge status-badge--neutral",
                        )}
                      >
                        {event.title}
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

"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";
import { authFetch } from "@/lib/api/authFetch";
import { cn } from "@/lib/utils";
import { calendarEventClasses } from "@/lib/dashboard-ui";
import { listContacts, type Contact } from "@/lib/api/crm";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { CALENDAR_EVENT_TYPE_OPTIONS } from "@/lib/crm-taxonomy";
import { ChevronLeft, ChevronRight, XMark } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassIconButton } from "@/components/ui/glass-icon-button";

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
  project_id?: string;
  notes?: string;
  all_day?: boolean;
}

function toLocalInput(d: Date): string {
  // Convert a Date to the "YYYY-MM-DDTHH:MM" format expected by
  // <input type="datetime-local">. Uses the local timezone so the
  // value round-trips without surprising the user.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const createRequested = searchParams?.get("create") === "true";
  const clientParam = searchParams?.get("client") ?? "";
  const projectParam = searchParams?.get("project") ?? "";
  const [currentDate, setCurrentDate] = useState(new Date());
  const token = getStoredAccessToken();

  const monthStart = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
    [currentDate],
  );
  const monthEnd = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0),
    [currentDate],
  );
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
    start_at: toLocalInput(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 10, 0),
    ),
    end_at: toLocalInput(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12, 0),
    ),
    all_day: false,
    location: "",
    contact_id: "",
    project_id: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  // QA Issue #2B (RawDrive_NewUniqueIssues.xlsx): the prior calendar
  // grid only rendered the event title. The fields the create form
  // collected (location, notes, contact, type, end_at) were never
  // visible after save because the page had no detail view at all.
  // selectedEvent drives a small read-only modal that shows every
  // persisted field for the clicked event chip.
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) map.set(c.id, c.name);
    return map;
  }, [contacts]);
  const formatEventInstant = (iso?: string, allDay?: boolean) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const opts: Intl.DateTimeFormatOptions = allDay
      ? { weekday: "short", month: "short", day: "numeric", year: "numeric" }
      : {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        };
    return d.toLocaleString("en-IN", opts);
  };

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

    authFetch(`/api/v1/calendar/events?from=${from}&to=${to}`)
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
    listContacts(token)
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [token]);

  useEffect(() => {
    if (!createRequested) return;
    const clientId = clientParam;
    const projectId = projectParam;
    const base = new Date();
    const endBase = new Date(base.getTime() + 2 * 60 * 60 * 1000);
    setForm((current) => ({
      ...current,
      contact_id: clientId || current.contact_id,
      project_id: projectId || current.project_id,
      start_at: toLocalInput(base),
      end_at: toLocalInput(endBase),
    }));
    setShowCreate(true);
  }, [clientParam, createRequested, projectParam]);

  const openCreate = (defaultDay?: number) => {
    const base = defaultDay
      ? new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          defaultDay,
          10,
          0,
        )
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
      const res = await authFetch(`/api/v1/calendar/events`, {
        method: "POST",
        headers: {
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
          project_id: form.project_id || undefined,
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

  // QA Issue #2A (RawDrive_NewUniqueIssues.xlsx): the previous version
  // matched only events whose start_at YYYY-MM-DD prefix equalled the
  // cell day, which made multi-day events disappear from every day
  // except the start. We now treat each event as a half-open
  // [start, end) date range and include the day if it intersects
  // [00:00 of cell day, 00:00 of next day). Events with no end_at fall
  // back to a 1-day span so single-day events render unchanged.
  const eventsOnDay = (day: number) => {
    const cellStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day,
      0,
      0,
      0,
      0,
    );
    const cellEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day + 1,
      0,
      0,
      0,
      0,
    );
    return (events ?? []).filter((event) => {
      if (!event?.start_at) return false;
      const startMs = Date.parse(event.start_at);
      if (Number.isNaN(startMs)) return false;
      const rawEnd = event.end_at && Date.parse(event.end_at);
      const endMs =
        typeof rawEnd === "number" && !Number.isNaN(rawEnd) ? rawEnd : startMs;
      // Half-open intersection: event overlaps the cell day if it
      // starts before the cell's next-day boundary AND ends after the
      // cell's start. Equal-instant boundaries are excluded so an
      // event that ends at 00:00 of the next day does not bleed into
      // that day's chip list.
      return startMs < cellEnd.getTime() && endMs > cellStart.getTime();
    });
  };

  const monthName = currentDate.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <CRMSecondaryNav />

      {error && (
        <div className="mb-4 rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Calendar</h1>
          <p className="text-sm text-text-secondary mt-1">{monthName}</p>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton
            type="button"
            onClick={() => openCreate()}
            variant="primary"
            size="md"
          >
            + New Event
          </GlassButton>
          <GlassIconButton
            label="Previous month"
            variant="ghost"
            onClick={() =>
              setCurrentDate(
                new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth() - 1,
                  1,
                ),
              )
            }
          >
            <ChevronLeft />
          </GlassIconButton>
          <GlassButton
            type="button"
            onClick={() => setCurrentDate(new Date())}
            variant="surface"
            size="md"
          >
            Today
          </GlassButton>
          <GlassIconButton
            label="Next month"
            variant="ghost"
            onClick={() =>
              setCurrentDate(
                new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth() + 1,
                  1,
                ),
              )
            }
          >
            <ChevronRight />
          </GlassIconButton>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">
            New Calendar Event
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className="sm:col-span-2 flex flex-col gap-1 text-xs text-text-secondary"
              htmlFor="calendar-event-title"
            >
              Title *
              <input
                id="calendar-event-title"
                type="text"
                placeholder="Title (e.g. Sharma Wedding Shoot)"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="input-base w-full"
                autoFocus
              />
            </label>
            <label
              className="flex flex-col gap-1 text-xs text-text-secondary"
              htmlFor="calendar-event-type"
            >
              Event Type
              <select
                id="calendar-event-type"
                value={form.event_type}
                onChange={(e) =>
                  setForm({ ...form, event_type: e.target.value })
                }
                className="input-base w-full"
              >
                {CALENDAR_EVENT_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex flex-col gap-1 text-xs text-text-secondary"
              htmlFor="calendar-event-contact"
            >
              Linked Client
              <select
                id="calendar-event-contact"
                value={form.contact_id}
                onChange={(e) =>
                  setForm({ ...form, contact_id: e.target.value })
                }
                className="input-base w-full"
              >
                <option value="">No linked client</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Start
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                className="input-base w-full"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              End
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                className="input-base w-full"
              />
            </label>
            <label
              className="sm:col-span-2 flex flex-col gap-1 text-xs text-text-secondary"
              htmlFor="calendar-event-location"
            >
              Location
              <input
                id="calendar-event-location"
                type="text"
                placeholder="Location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="input-base w-full"
              />
            </label>
            <label
              className="sm:col-span-2 flex flex-col gap-1 text-xs text-text-secondary"
              htmlFor="calendar-event-notes"
            >
              Notes
              <textarea
                id="calendar-event-notes"
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input-base textarea-min-block w-full resize-y"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={(e) =>
                  setForm({ ...form, all_day: e.target.checked })
                }
              />
              All-day event
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <GlassButton
              type="button"
              onClick={() => setShowCreate(false)}
              variant="surface"
              size="md"
              disabled={creating}
            >
              Cancel
            </GlassButton>
            <GlassButton
              type="button"
              onClick={handleCreate}
              disabled={creating || !form.title.trim()}
              variant="primary"
              size="md"
            >
              {creating ? "Creating…" : "Save Event"}
            </GlassButton>
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
              <div
                key={`empty-${index}`}
                className="h-24 border-b border-r border-border-default bg-surface-sunken/30"
              />
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openCreate(day);
                    }
                  }}
                  className={`h-24 border-b border-r border-border-default p-1 cursor-pointer hover:bg-accent/5 transition-colors ${isToday ? "bg-accent/5" : ""}`}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium",
                      isToday
                        ? "bg-accent text-text-inverse"
                        : "text-text-secondary",
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => (
                      <button
                        type="button"
                        key={event.id}
                        onClick={(e) => {
                          // Stop propagation so the day cell's
                          // openCreate handler does not also fire when
                          // the user is trying to view an event chip.
                          e.stopPropagation();
                          setSelectedEvent(event);
                        }}
                        className={cn(
                          "w-full justify-start rounded-md px-1 py-0.5 text-micro font-medium truncate text-left hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-border-focus",
                          calendarEventClasses[event.event_type] ||
                            "status-badge status-badge--neutral",
                        )}
                        aria-label={`View event: ${event.title}`}
                      >
                        {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-micro px-1 text-text-tertiary">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-title"
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface-raised p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2
                id="event-detail-title"
                className="font-headline text-xl font-bold text-text-primary"
              >
                {selectedEvent.title}
              </h2>
              <GlassIconButton
                label="Close event details"
                variant="ghost"
                onClick={() => setSelectedEvent(null)}
              >
                <XMark />
              </GlassIconButton>
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-caption mb-1 uppercase">Type</dt>
                <dd className="text-text-primary">
                  {CALENDAR_EVENT_TYPE_OPTIONS.find(
                    (t) => t.value === selectedEvent.event_type,
                  )?.label ?? selectedEvent.event_type}
                </dd>
              </div>

              <div>
                <dt className="text-caption mb-1 uppercase">When</dt>
                <dd className="text-text-primary">
                  {formatEventInstant(
                    selectedEvent.start_at,
                    selectedEvent.all_day,
                  )}
                  {selectedEvent.end_at && (
                    <>
                      {" — "}
                      {formatEventInstant(
                        selectedEvent.end_at,
                        selectedEvent.all_day,
                      )}
                    </>
                  )}
                  {selectedEvent.all_day ? (
                    <span className="ml-2 text-xs text-text-secondary">
                      (all day)
                    </span>
                  ) : null}
                </dd>
              </div>

              {selectedEvent.contact_id ? (
                <div>
                  <dt className="text-caption mb-1 uppercase">Client</dt>
                  <dd className="text-text-primary">
                    {contactNameById.get(selectedEvent.contact_id) ??
                      selectedEvent.contact_id}
                  </dd>
                </div>
              ) : null}

              {selectedEvent.location ? (
                <div>
                  <dt className="text-caption mb-1 uppercase">Location</dt>
                  <dd className="text-text-primary whitespace-pre-wrap">
                    {selectedEvent.location}
                  </dd>
                </div>
              ) : null}

              {selectedEvent.notes ? (
                <div>
                  <dt className="text-caption mb-1 uppercase">Notes</dt>
                  <dd className="text-text-primary whitespace-pre-wrap">
                    {selectedEvent.notes}
                  </dd>
                </div>
              ) : null}

              {selectedEvent.status ? (
                <div>
                  <dt className="text-caption mb-1 uppercase">Status</dt>
                  <dd className="text-text-primary capitalize">
                    {selectedEvent.status}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-6 flex justify-end">
              <GlassButton
                type="button"
                onClick={() => setSelectedEvent(null)}
                variant="primary"
                size="md"
              >
                Close
              </GlassButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

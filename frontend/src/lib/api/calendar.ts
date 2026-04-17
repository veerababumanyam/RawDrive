const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string;
  contact_id?: string;
  deal_id?: string;
  project_id?: string;
  status: string;
  color?: string;
  notes?: string;
  created_at: string;
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function listEvents(token: string, from: string, to: string): Promise<CalendarEvent[]> {
  const res = await fetch(`${API_BASE}/api/v1/calendar/events?from=${from}&to=${to}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Failed to fetch events");
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.events)) return body.events;
  if (body && Array.isArray(body.calendarevents)) return body.calendarevents;
  return [];
}

export async function createEvent(token: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
  const res = await fetch(`${API_BASE}/api/v1/calendar/events`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error("Time slot conflict");
    throw new Error("Failed to create event");
  }
  return res.json();
}

// ── Auto-authenticated version ──────────────────────────────────────
import { authFetch } from "./authFetch";

/** Create an event with automatic token refresh and better error messages. */
export async function createEventAuth(event: Partial<CalendarEvent>): Promise<CalendarEvent> {
  const res = await authFetch("/api/v1/calendar/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) throw new Error(body.error || "Time slot conflict with existing event");
    throw new Error(body.error || "Failed to create event");
  }
  return res.json();
}

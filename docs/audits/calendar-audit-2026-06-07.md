# Calendar & Scheduling Service — End-to-End Audit & Recommendations

- **Date:** 2026-06-07
- **Scope:** Full vertical slice of the RawDrive calendar/scheduling service —
  **database & data model**, **backend services/handlers**, **API contract**, and
  **frontend UI** — plus its (missing) links to reminders, notifications, CRM,
  bookings, streams, and external calendars.
- **Type:** Read-only documentation audit (no live boot). Every finding is cited to `file:line`.
- **Trigger:** "Calendar has no reminders, no integration with customers/CRM/bookings/notifications." Confirmed — and a data-model integrity bug, an RLS inconsistency, an undocumented API, and a half-wired UI were found alongside.

---

## 1. Executive Summary

End to end, the calendar is a **create-and-list month view on top of a single
`events` table with workspace-wide conflict detection and an unreachable ICS
export**. It is a private appointment book whose UI cannot even edit or delete
the events it creates.

Three structural facts dominate every layer:

1. **The platform already owns the infrastructure** the missing features need —
   a multi-channel notification service (`bookings` category, quiet hours), a cron
   scheduler, a webhook subsystem, CRM contacts/deals/projects — and the calendar
   is **wired to none of it**. The work is integration, not greenfield.
2. **A newer sibling table, `live_events` (F-014), already does what the calendar
   should** — it has a `timezone`, a `created_by` owner, `FORCE` RLS, and clean
   `ON DELETE SET NULL` links. The original `events` table is the stale one and is
   now the odd one out in the schema.
3. **Every layer is partially wired:** the DB has columns the API ignores
   (`recurrence_rule`, buffers), the API has endpoints the frontend never calls
   (PUT/DELETE/GET-by-id/export.ics), and the marketing site promises features
   (`/solutions/scheduling`: "Automated reminders", "Booking management") that no
   layer implements.

### Severity snapshot

| # | Layer | Finding | Severity |
|---|-------|---------|----------|
| D1 | DB | `events.contact_id`/`deal_id` have **no `ON DELETE`** → deleting a CRM contact/deal with events **errors out** (inconsistent with all sibling tables) | **High (integrity bug)** |
| B1 | Backend | `event_type:"booking"` accepted by handler but **rejected by DB CHECK** → 500 on any booking create | **High (bug)** |
| X1 | All | **No reminders** anywhere (no column, no job, no delivery) despite marketed promise | **High** |
| X2 | Backend | Calendar emits **zero notifications** on create/reschedule/cancel (dispatcher exists, unused) | **High** |
| X3 | All | **No customer-facing** booking, confirmation, or calendar invite | **High** |
| B2 | Backend | `recurrence_rule` stored but **never expanded** — recurring events silently don't recur | **High** |
| FE1 | Frontend | UI is **create + list only** — no edit/delete/detail, even though the API supports them | **High** |
| D2 | DB | RLS uses a **different session variable** than newer tables (`app.workspace_id` vs `app.current_workspace_id`); only works because middleware sets both redundantly | **Medium** |
| D3 | DB | `events` lacks **`FORCE ROW LEVEL SECURITY`** (sibling `live_events` has it) — owner connection bypasses tenant isolation | **Medium** |
| B3 | Backend | Conflict check **ignores `buffer_before/after_min`** and is **race-prone** (no `EXCLUDE` constraint though `btree_gist` is installed) | **Medium** |
| A1 | API | Calendar endpoints are **absent from `docs/api/openapi.yaml`** (0 of 34 operations) — undocumented, unguarded by the `openapi` CI gate | **Medium** |
| D4 | DB | **Overlapping bounded contexts**: `events` vs `live_events` duplicate fields + soft-link each other with no source of truth | **Medium** |
| X4 | Backend | No external sync (Google/Outlook/CalDAV); ICS export-only, non-subscribable, non-conformant | **Medium** |
| B4 | Backend | No team-member assignment; conflict is **workspace-wide** (two photographers can't overlap) | **Medium** |
| FE2 | Frontend | `export.ics` and the API helpers for update/delete are **unreachable / absent** | **Medium** |
| A2/B5 | API/Backend | Weak input validation → `500` instead of `400`; no per-workspace timezone | **Medium** |
| D5 | DB | Inbound refs (`galleries.event_id`, `streams.calendar_event_id`, `live_events.calendar_event_id`) SET NULL, but `events.stream_id` soft back-link **dangles** on delete | **Low** |
| X5 | Backend | No webhooks emitted; hard-delete erases `cancelled` history/audit | **Low** |
| FE3 | Frontend | Month-only view; no week/day/agenda, no drag-reschedule; `crm/calendar` is a bare redirect | **Low/Medium** |

---

## 2. Database & Data Model

### Schema lineage
`events` is touched across migrations: created in `024_create_m4_calendar_tables.up.sql`,
gains `project_id` in `078_studio_projects.up.sql:123`, and gains
`stream_id` + the `live_stream` type in `083_f014_streams_extensions.up.sql:69`.
Inbound references come from `galleries.event_id` (`079:7`),
`streams.calendar_event_id` (`083:16`), and `live_events.calendar_event_id` (`087:19`).

### D1 — Contact/Deal FKs block CRM deletion *(High — integrity bug)*
In `024_create_m4_calendar_tables.up.sql:14-15`:
```sql
contact_id UUID REFERENCES contacts(id),   -- no ON DELETE → NO ACTION
deal_id    UUID REFERENCES deals(id),      -- no ON DELETE → NO ACTION
```
Postgres defaults a missing `ON DELETE` to `NO ACTION`, so **deleting a contact or
deal that has any calendar event fails with an FK violation**. Every sibling table
that references the same parents uses `ON DELETE SET NULL` — `studio_projects`
(`078:8,129`), `streams` (`083:13-15`), `live_events` (`087:13-14`),
`galleries` (`078:129`). The calendar's `events` table is the lone exception and
will silently block (or 500) CRM contact/deal deletion.
**Fix:** new migration → `ALTER TABLE events … ON DELETE SET NULL` for both FKs.

### D2 — RLS session-variable drift *(Medium)*
`events` RLS keys on `current_setting('app.workspace_id', …)`
(`024:39`), but the F-014 tables (`live_events`, etc.) key on
`current_setting('app.current_workspace_id', …)` (`087:43`). This only works
because the middleware redundantly sets **both** names to the same value
(`backend/internal/middleware/db_context.go:32-33`). It is a latent footgun: any
code path that sets only one variable silently breaks the other module's
isolation. Standardize on one variable name.

### D3 — `events` is not `FORCE`-RLS *(Medium)*
`live_events` declares `ALTER TABLE live_events FORCE ROW LEVEL SECURITY`
(`087:41`); `events` does not (`024` only `ENABLE`s it). Without `FORCE`, the table
**owner role bypasses RLS**, so a connection running as the table owner reads
across tenants. The newer table sets the bar; the calendar should match.

### D4 — Overlapping bounded contexts: `events` vs `live_events` *(Medium)*
`live_events` (`087:14`) duplicates the calendar's core shape — `title`,
`scheduled_start/end_at`, `status`, `client_id`, `deal_id` — and soft-links back via
`calendar_event_id`, while `events` soft-links forward via `stream_id` (no FK,
"validated in handler", `083:76`). There is **no single source of truth** for "when
is this thing happening": a reschedule on one side does not propagate to the other.
This is a logical-separation smell that will grow as live streaming and calendar
both evolve. Decide ownership: either `events` is the canonical time record and
`live_events` references it (drop the duplicated time columns), or document the
split explicitly and add sync.

### D5 — Dangling soft back-link on delete *(Low)*
Deleting an event `SET NULL`s `galleries.event_id`, `streams.calendar_event_id`,
and `live_events.calendar_event_id` (all proper FKs). But `events.stream_id` is a
**no-FK soft column**, so deleting the referenced stream leaves a dangling
`stream_id` on the event. Either promote it to a real FK or null it in application
logic.

### Indexing & constraints
- Range index `idx_events_workspace_range (workspace_id, start_at, end_at)` exists
  (`024:30`) and matches the `List` predicate (`event_repo.go:90`) — good.
- `CREATE EXTENSION btree_gist` is installed (`024:3`) but **no `EXCLUDE`
  constraint uses it** — the non-overlap guarantee is left to a race-prone
  application check (see B3).
- No index supports a future reminder sweep (`status`, due-time) or an
  `assigned_user_id` filter (neither column exists yet).

---

## 3. Backend (services, handlers, repository)

Files: `calendar_handler.go`, `calendar_ics_handler.go`,
`service/calendar_ics.go`, `repository/event_repo.go`, routes at `routes_m4.go:170`.

### B1 — `event_type:"booking"` is a dead, 500-producing path *(High — bug)*
`calendar_handler.go:75` branches on `e.EventType == "shoot" || e.EventType ==
"booking"`, but the CHECK constraint (`083:69-71`) allows only
`shoot, meeting, editing, personal, travel, blocked, other, live_stream` — **not
`booking`**. Creating a booking-typed event fails the CHECK and returns a generic
`500`. The handler is coded for a value the schema forbids.

### B2 — Recurrence stored but never expanded *(High)*
No code parses or expands `recurrence_rule` (no RRULE logic in backend or
frontend). `List`, `CheckConflict`, and ICS all treat a recurring event as one
occurrence. A "weekly editing block" appears once. Ship RRULE expansion or remove
the field.

### B3 — Conflict detection: buffers ignored + race-prone *(Medium)*
`CheckConflict` (`event_repo.go:156`) tests overlap against `status='confirmed'`
only and **never reads `buffer_before_min`/`buffer_after_min`** — stored
turnaround/travel buffers do not prevent back-to-back bookings. It is also
check-then-insert with no lock/transaction, so two concurrent confirms can both
pass (double-book). Subtract buffers from the window **and** add a `tstzrange` GiST
`EXCLUDE` constraint so the DB enforces non-overlap atomically.

### B4 — No team assignment; conflict is workspace-wide *(Medium)*
`events` has no assignee (unlike `live_events.created_by`). Conflict is computed per
workspace, so two different photographers cannot hold overlapping shoots. Add
`assigned_user_id` and scope conflict to the assignee.

### X1/X2/X3 — Reminders, notifications, customer integration *(High)*
- **Reminders:** none. The cron `scheduler` exists but registers only
  `monthly-payout-calculation` (`backend/cmd/api/main.go:2799`). No reminder model,
  job, or `VALARM`.
- **Notifications:** create/update/delete never call `NotificationDispatcher`,
  though it offers a one-line `Notify(ctx, workspaceID, "bookings", …)`
  (`handler/notification_dispatcher.go`) over a full multi-channel delivery service
  (`service/notification_delivery.go`, migration `025`).
- **Customer:** `contact_id`/`deal_id` are stored but the client is never emailed,
  invited, or notified; there is no public self-service booking surface.

### X4 — External sync & ICS quality *(Medium)*
`GenerateICS` (`service/calendar_ics.go`) omits `DTSTAMP` (required by RFC 5545 —
strict parsers reject the feed), `SEQUENCE`, `VALARM`, and `ATTENDEE`/`ORGANIZER`;
emits all-day events as timed `DTSTART`/`DTEND` instead of `VALUE=DATE`. Export is
one-shot `attachment` (`calendar_ics_handler.go:36`), not a subscribable
`webcal://…?token=…` feed. No Google/Outlook/CalDAV sync in either direction.

### X5 — Webhooks & soft-cancel *(Low)*
The webhook subsystem (migration `042`) receives no `event.created/updated/
cancelled` events. `DeleteEvent` hard-deletes (`event_repo.go:150`), bypassing the
`cancelled` status enum value and leaving no reason/audit trail.

### B5 — Timezone *(Medium)*
`events` has no timezone; everything is UTC and formatted in the browser. The newer
`live_events` carries `timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'` (`087:24`).
Server-side reminders/emails/ICS need a workspace timezone to be correct.

---

## 4. API Contract

### A1 — Calendar is undocumented in OpenAPI *(Medium)*
`docs/api/openapi.yaml` documents 34 operations but **none for `/api/v1/calendar/*`**
(`grep /calendar` → empty). The endpoints exist only in code (`routes_m4.go:170`).
The repo runs an `openapi` CI gate (per `AGENTS.md`), so this surface is both
undocumented for integrators and unguarded by contract tests. Add the paths/schemas.

### A2 — No request validation / error contract *(Medium)*
`CreateEvent`/`UpdateEvent` don't validate `title` non-empty, `start_at < end_at`,
or `event_type` membership — they rely on DB CHECK failures surfaced as opaque
`500 internal error` (`calendar_handler.go:62`, `:204`), instead of `400` with
field-level messages. This is also how B1 manifests to a client.

### API surface (current)
`POST /events`, `GET /events`, `GET /events/{id}`, `PUT /events/{id}`,
`DELETE /events/{id}`, `GET /export.ics` (`routes_m4.go:171-179`). Missing:
batch/range pagination limit, recurrence expansion params, per-event `.ics`,
subscribable feed, availability/free-busy query, booking-request endpoint.

---

## 5. Frontend

Files: `frontend/src/app/(dashboard)/calendar/page.tsx` (730 lines),
`crm/calendar/page.tsx`, `lib/api/calendar.ts`.

### FE1 — UI is create + list only *(High)*
The calendar page calls the API exactly twice: `GET …/events` (`page.tsx:145`) and
`POST …/events` (`page.tsx:230`). There is **no edit, delete, or detail** path —
`grep` for PUT/DELETE/edit/deleteEvent/updateEvent returns nothing. The backend
exposes PUT/DELETE/GET-by-id, but a user **cannot change or remove an event from
the UI**. This is the most visible end-to-end gap: the product can create
appointments it can never correct.

### FE2 — Export and update/delete client helpers missing *(Medium)*
`lib/api/calendar.ts` defines only `listEvents`, `createEvent`, `createEventAuth` —
no `updateEvent`/`deleteEvent`/`getEvent`. And `export.ics` is never referenced in
the UI, so the one interop feature that exists is **unreachable by users**.

### FE3 — View & navigation limitations *(Low/Medium)*
Month grid only — no week/day/agenda views, no drag-to-reschedule, and no controls
for reminders, recurrence, buffers, assignee, or timezone (so schema fields that
exist are unreachable). `crm/calendar/page.tsx` is a bare `redirect("/calendar")` —
confirm it is an intended alias and not orphaned navigation.

---

## 6. Cross-Cutting: Promise vs. Reality

`frontend/src/app/solutions/scheduling/page.tsx` markets: **"Reminders:
Automated"**, **"Booking management"**, calendar "connected to galleries, invoices,
and client follow-up". Reality: no reminders, no bookings type (it 500s), no client
contact, no notifications, and an export users can't reach. This is a
marketing/feature-integrity gap worth closing for trust as much as function.

---

## 7. Prioritized End-to-End Roadmap

Decompose into dependency-ordered, independently-shippable, flag-gated slices (one
unit per PR, schema→service→API→frontend→flag-on), per repo law.

**P0 — Correctness (small, ship first):**
1. **D1** Migration: `events` contact/deal FKs → `ON DELETE SET NULL`.
2. **B1 + A2** Add `booking` to CHECK + taxonomy (or drop the branch); handler validation → `400`.
3. **B3a** Apply buffers in `CheckConflict`; add the GiST `EXCLUDE` constraint.
4. **D2/D3** Standardize RLS variable; add `FORCE ROW LEVEL SECURITY` to `events`.
5. **FE1** Wire edit + delete in the UI (+ `updateEvent`/`deleteEvent`/`getEvent` API helpers).

**P1 — The headline gap (reminders + notifications + customer):**
6. **X2** Emit `bookings` notifications on create/reschedule/cancel via the existing dispatcher.
7. **X1** `event_reminders` model + indexed scheduler sweep (`FOR UPDATE SKIP LOCKED`) → notification service. *(needs 6)*
8. **X3a** Client confirmation/reschedule/cancel emails tied to `contact_id`. *(needs 6)*
9. **B5** Add a workspace timezone; format reminders/emails/ICS in it.

**P2 — Interop, teams, recurrence:**
10. **X4 + A1** Conformant ICS (`DTSTAMP`/`VALARM`/all-day/`ATTENDEE`) + token-scoped subscribable feed; document calendar in `openapi.yaml`.
11. **X3b** Per-event `.ics` invite for clients. *(needs 10)*
12. **B4** `assigned_user_id` + per-assignee conflict scope.
13. **B2** RRULE expansion (read-time within range) + `RRULE` in ICS — or formally defer & hide the field.

**P3 — Growth & polish:**
14. **X4** Google Calendar two-way sync (OAuth + watch).
15. **X3c** Public self-service booking-request page (token model mirrors gallery share).
16. **D4/D5** Resolve `events`↔`live_events` ownership + the dangling `stream_id` link.
17. **X5** Calendar webhooks; soft-cancel + audit. **FE3** week/agenda + drag-reschedule.

### Quick wins (high value / low effort, infra already exists)
D1 (one migration), B1 (one CHECK + taxonomy line), X2 (a few `Notify` calls), A2
(validation), FE1 (edit/delete wiring), and the subscribable ICS feed — together
these close the most visible end-to-end gaps with little code.

---

## 8. Evidence Index

| Layer | Path |
|------|------|
| Schema (events) | `migrations/024_create_m4_calendar_tables.up.sql`; `078:123` (project_id); `083:69,76` (type/stream_id) |
| Sibling table | `migrations/087_f014_events_sessions_audit.up.sql` (`live_events`, FORCE RLS, timezone, created_by) |
| Inbound FKs | `079:7` (galleries.event_id), `083:16` (streams.calendar_event_id), `087:19` (live_events.calendar_event_id) |
| RLS variable | `migrations/024:39` vs `087:43`; setter `middleware/db_context.go:32-33` |
| Repo / conflict | `repository/event_repo.go` (`List :90`, `CheckConflict :156`, `Delete :150`) |
| Handler / routes | `handler/calendar_handler.go` (`:62,:75,:204`); `routes_m4.go:170-179` |
| ICS | `service/calendar_ics.go`; `calendar_ics_handler.go:36` |
| Unused infra | `service/notification_delivery.go`; `handler/notification_dispatcher.go`; migration `025`; scheduler `cmd/api/main.go:2799`; webhooks migration `042` |
| API contract | `docs/api/openapi.yaml` (no `/calendar` paths) |
| Frontend | `app/(dashboard)/calendar/page.tsx` (`:145` list, `:230` create); `lib/api/calendar.ts`; `crm/calendar/page.tsx` |
| Marketing | `app/solutions/scheduling/page.tsx` |

---

*Audit is documentation-only; no code was changed and no services were booted. To
action, create the relevant GitHub Project #2 items and ship each slice via
`npm run ship` behind a feature flag.*

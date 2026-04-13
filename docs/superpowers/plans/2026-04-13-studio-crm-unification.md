# Studio CRM Unification Plan (F-013)

Date: 2026-04-13
Planning mode: cobolt-plan feature
Project: RawDrive
Current project state: brownfield, v0.0.51, M24 validated
Target feature: F-013 Studio CRM Unification and Client Lifecycle
Target milestones: M25-M28
Status: Planning artifact, not build authorization

## Executive Summary

RawDrive already has the right ingredients for photographer business operations: CRM leads, contacts, deals, calendar events, invoices, service packages, GSTR-1, contracts, gallery delivery, and client timelines. The problem is information architecture and workflow fragmentation. Photographers should not need to think in isolated modules such as Leads, Deals, Bookings, Invoices, Packages, and GSTR-1. They think in client lifecycle terms: enquiry, project, shoot date, proposal, contract, advance, gallery delivery, final payment, tax, referrals, and repeat business.

F-013 turns those existing modules into one seamless Studio CRM workspace. The goal is not to rebuild everything. The goal is to unify navigation, stabilize the lifecycle data model, close known workflow gaps, and make every business action start from either a client or a project.

## Product Decision

Use the umbrella name Studio CRM in the application. Internally, model the core business object as a Studio Project. A project represents a monetizable photography job such as a wedding, pre-wedding shoot, corporate shoot, product shoot, newborn session, or family event.

Recommended user-facing naming:

| Current label | Proposed label | Reason |
|---|---|---|
| Leads | Inquiries | Photographer-friendly and source-channel oriented |
| Deals | Projects | Photographers sell jobs/events, not generic deals |
| Bookings | Calendar | Calendar is the operating surface for shoots and meetings |
| Invoices | Billing | Includes invoices, payments, credit notes, aging |
| Packages | Price Book | Selling asset, not settings |
| GSTR-1 | Tax Reports | Extensible to GSTR-3B, CA exports, revenue reports |
| Clients | Clients | Already correct |

## Scope

### In Scope

- Create a Studio CRM workspace/hub under `/crm`.
- Add second-level CRM navigation for Overview, Inquiries, Clients, Projects, Calendar, Documents, Billing, Reports, and Price Book.
- Promote deals into photographer-specific projects/jobs while preserving existing deal records.
- Connect projects to contacts, leads, calendar events, packages, contracts, invoices, payments, galleries, and tax reports.
- Fix lifecycle enum mismatches across frontend and backend.
- Move Packages and GSTR-1 into the Studio CRM business workflow.
- Add contracts UI to the dashboard experience.
- Add follow-up/reminder UI and lifecycle tasks.
- Make quick actions prefill and open target workflows.
- Move GST/tax calculation to server-owned logic.
- Add direct gallery-to-client/project association.
- Add calendar operational views and conflict-safe updates.
- Add payment-link and collection workflow using existing payment foundations.
- Expose GSTR-3B and finance dashboard where backend support already exists or can be extended.

### Out of Scope

- Replacing the Go API, Next.js app, or database stack.
- Replacing Cloudflare R2 storage.
- Adding local file storage.
- Adding OTP to login flows.
- Adding a standalone `/upload` route.
- Replacing gallery/proofing workflows.
- Full accounting system parity with Zoho Books/Tally.
- Full public booking marketplace redesign.
- Native mobile app work.

## Source Evidence

- Current sidebar flattens business modules: `frontend/src/components/layout/navigation/StudioSidebar.tsx`.
- Current sidebar shell has no nested navigation model: `frontend/src/components/layout/navigation/SidebarShell.tsx`.
- Backend groups CRM, billing, contracts, calendar, and reports in the M4 route set: `backend/internal/handler/routes_m4.go`.
- Client profile already aggregates linked galleries, invoices, deals, events, and timeline: `backend/internal/handler/client_profile_handler.go` and `frontend/src/app/(dashboard)/crm/contacts/[id]/page.tsx`.
- Service packages and GSTR-1 exist but are surfaced as separate modules rather than lifecycle tools.
- Follow-up tables/routes exist but dashboard workflow coverage is incomplete.
- Contracts backend exists, but no dashboard contracts route was found during review.
- Billing and deals pages currently contain frontend-side tax assumptions that should be server-owned.

## Business Goals

| Goal | Target outcome |
|---|---|
| Reduce workflow fragmentation | Business operations are reachable from one Studio CRM hub |
| Improve photographer mental model | Replace generic sales terms with inquiry/project/booking/billing language |
| Increase conversion discipline | Every inquiry has source, next follow-up, value, and lifecycle state |
| Improve collections | Every project exposes advance, balance, payment link, and aging status |
| Improve compliance | Tax reports derive from server-owned invoice/tax data |
| Improve delivery continuity | Gallery delivery links back to client and project |
| Improve repeat business | Anniversary, referral, and review tasks become first-class CRM actions |

## Personas

| Persona | Needs |
|---|---|
| Solo photographer | One place to track inquiries, shoot dates, invoices, payments, and delivery |
| Studio manager | Visibility across teams, projects, pending contracts, overdue payments, and shoot calendar |
| Sales/admin assistant | Follow-up queue, WhatsApp/email actions, quote creation, booking status |
| Client | Clear communication around proposal, contract, payment, shoot, gallery, and delivery |
| Accountant/CA | Reliable GSTR-1/GSTR-3B exports, invoice numbers, credit notes, place-of-supply data |

## Functional Requirements

### Studio CRM Workspace

FR-SCRM-001: The system MUST expose a Studio CRM workspace that groups Inquiries, Clients, Projects, Calendar, Documents, Billing, Reports, and Price Book.

FR-SCRM-002: The sidebar MUST not show Leads, Deals, Bookings, Invoices, Packages, and GSTR-1 as unrelated flat siblings after the CRM workspace is available.

FR-SCRM-003: The Studio CRM overview MUST show upcoming shoots, hot inquiries, overdue follow-ups, pending contracts, unpaid invoices, recent gallery deliveries, and revenue/tax summary.

FR-SCRM-004: CRM sub-navigation MUST preserve deep links to current routes where possible to avoid breaking existing bookmarks.

### Inquiries

FR-SCRM-010: The system MUST rename the user-facing lead workflow to Inquiries while preserving backend compatibility with existing lead storage.

FR-SCRM-011: Every inquiry MUST support source, event type, event date, city, venue, budget range, expected deliverables, follow-up date, lead value, and lost reason.

FR-SCRM-012: Inquiry cards MUST show age, source, next follow-up, event date, value, and conversion readiness.

FR-SCRM-013: Moving an inquiry to qualified/won MUST allow creating or linking a Studio Project.

FR-SCRM-014: Lost inquiries MUST require a lost reason before entering final lost state.

### Clients

FR-SCRM-020: Client profile MUST remain the main 360-degree record for a person/family/company.

FR-SCRM-021: Client profile quick actions MUST prefill target workflows for creating projects, booking shoots, creating invoices, sending WhatsApp/email, and opening galleries.

FR-SCRM-022: Contact type taxonomy MUST be aligned across frontend, backend, and database constraints.

FR-SCRM-023: Contact merge MUST reassign every linked entity, including calendar events and project associations.

### Projects

FR-SCRM-030: The system MUST introduce a Studio Project concept as the central commercial job aggregate.

FR-SCRM-031: Existing deals MUST be migrated or adapted into Studio Projects without data loss.

FR-SCRM-032: A project MUST link to contact, source inquiry, package, calendar event(s), contract(s), invoice(s), payment(s), gallery/galleries, and delivery status.

FR-SCRM-033: Project statuses MUST use photographer lifecycle terms: inquiry, quoted, reserved, booked, shooting, editing, proofing, delivered, archived, cancelled, lost.

FR-SCRM-034: Project stage changes MUST trigger optional next actions: create booking, create quote, send contract, request advance, create gallery, send delivery notice, request final payment.

FR-SCRM-035: Project cards MUST show event date, client, value, balance due, contract status, gallery status, and next action.

### Calendar

FR-SCRM-040: Calendar event types MUST be canonical and identical across frontend, backend, and database.

FR-SCRM-041: Calendar MUST support month, week, day, and agenda views.

FR-SCRM-042: Calendar create and update MUST both enforce conflict checks for confirmed events.

FR-SCRM-043: Calendar events MUST support project_id, contact_id, deal_id compatibility, venue, travel buffer, prep buffer, crew notes, and reminders.

FR-SCRM-044: Booking from a project MUST create a linked calendar event with client and project context prefilled.

### Documents and Contracts

FR-SCRM-050: The dashboard MUST expose Contracts/Documents under Studio CRM.

FR-SCRM-051: Contracts MUST support templates, project/contact linking, status tracking, and signed document history.

FR-SCRM-052: Quotes/proposals MUST be able to convert into contracts and invoices without re-entering package data.

### Billing, Payments, and Tax

FR-SCRM-060: Billing MUST be reachable from Studio CRM and remain deep-linkable from invoices.

FR-SCRM-061: Invoice creation from project/package MUST be server-calculated for subtotal, discounts, CGST, SGST, IGST, round-off, amount in words, and balance due.

FR-SCRM-062: The frontend MUST not be the source of truth for GST split or totals.

FR-SCRM-063: The system MUST define one canonical SAC/HSN taxonomy for photography services and packages.

FR-SCRM-064: Payment links MUST be generated through the configured payment provider. Stub UPI links MUST not be presented as production-ready payment links.

FR-SCRM-065: Billing MUST show advance paid, balance due, overdue status, credit notes, and payment aging.

FR-SCRM-066: Tax Reports MUST include GSTR-1 and GSTR-3B views where backend data is available.

### Galleries and Delivery

FR-SCRM-070: Galleries MUST support direct contact_id and project_id association instead of relying only on email activity matching.

FR-SCRM-071: Project detail MUST show linked galleries, proofing status, album approval, downloads, and delivery status.

FR-SCRM-072: Gallery delivery MUST be able to trigger client timeline events and follow-up tasks.

### Communications and Follow-ups

FR-SCRM-080: Studio CRM MUST include a follow-up queue for overdue and upcoming tasks.

FR-SCRM-081: Follow-ups MUST link to inquiry, client, project, invoice, contract, or gallery.

FR-SCRM-082: The system MUST include photographer-ready templates for inquiry follow-up, quote sent, booking confirmation, advance reminder, shoot reminder, gallery ready, album pending, balance due, review request, and anniversary greeting.

FR-SCRM-083: WhatsApp actions MUST use explicit user-initiated links unless a configured provider integration exists.

### Analytics

FR-SCRM-090: CRM overview MUST show inquiry source performance, conversion rate, average lead-to-booking time, revenue by project type, outstanding balance, and tax liability summary.

FR-SCRM-091: Analytics MUST default to Indian financial year where financial/tax data is involved.

## Non-Functional Requirements

NFR-SCRM-001: All new routes MUST use existing JWT middleware and claims retrieval via `middleware.JWTClaimsFromContext(ctx)`.

NFR-SCRM-002: All new file/storage behavior MUST use R2 only and must not introduce local storage.

NFR-SCRM-003: Frontend work MUST read `frontend/AGENTS.md` and `design-tokens.json` before editing UI.

NFR-SCRM-004: All icon buttons MUST use `GlassIconButton` and SF Symbol icons from the registry.

NFR-SCRM-005: All UI must use semantic design-token classes and avoid hardcoded colors, spacing, shadows, radii, z-index, and Tailwind primitive scales.

NFR-SCRM-006: Dashboard E2E tests MUST use auth-token injection and must not test login through UI.

NFR-SCRM-007: E2E upload/gallery tests MUST use files from `tests/photos/`.

NFR-SCRM-008: CRM overview must render within 1.5 seconds on warm API cache for workspaces with 10,000 contacts, 5,000 projects, and 50,000 invoices/events combined.

NFR-SCRM-009: Project detail load must use bounded queries and pagination for linked galleries, invoices, events, and timeline entries.

NFR-SCRM-010: Financial data changes must be auditable and append-only where legally relevant, especially payments and credit notes.

## Architecture Summary

F-013 is an additive architecture delta. It should not introduce new infrastructure. It should reuse Go handlers/services/repositories, Postgres/pgvector, Valkey, NATS, and the existing Next.js dashboard.

The preferred implementation is a compatibility-first model:

1. Add `studio_projects` as the canonical aggregate.
2. Preserve existing `deals` for compatibility during migration.
3. Add nullable `project_id` references to calendar events, invoices, contracts, galleries, follow-ups, and payments where needed.
4. Backfill projects from deals.
5. Keep old routes alive temporarily and introduce project-facing routes.
6. Move UI language from Deal to Project.
7. Retire old labels after telemetry confirms migration.

## Data Model Delta

New table: `studio_projects`

Required fields:

- id
- workspace_id
- contact_id
- lead_id nullable
- source_deal_id nullable during migration
- package_id nullable
- name
- project_type
- status
- event_date nullable
- event_end_date nullable
- venue_name nullable
- venue_address nullable
- city nullable
- state_code nullable
- expected_value_paisa
- booked_value_paisa
- balance_due_paisa cached from billing projection
- contract_status
- gallery_status
- next_action
- next_action_due_at
- notes
- created_at
- updated_at
- archived_at nullable

Reference additions:

- `events.project_id`
- `invoices.project_id`
- `contracts.project_id`
- `galleries.project_id`
- `galleries.contact_id`
- `follow_ups.project_id`
- `payments.project_id` if payment table is separate from invoice payments

Indexes:

- `(workspace_id, status, event_date)` for project boards and calendar linkage
- `(workspace_id, contact_id, updated_at desc)` for client profile
- `(workspace_id, next_action_due_at)` for follow-up queue
- `(workspace_id, project_type, event_date)` for analytics

Migration rules:

- Every existing deal becomes one studio project.
- Deal `proposal` maps to project `quoted`.
- Deal `negotiation` maps to project `reserved`.
- Deal `confirmed` maps to project `booked`.
- Deal `in_progress` maps to project `editing` unless a linked event date is in future, then `shooting`.
- Deal `completed` maps to project `delivered`.
- Deal `cancelled` maps to project `cancelled`.

## API Delta

New/changed endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/crm/overview` | CRM hub summary |
| GET | `/api/v1/crm/inquiries` | Lead/inquiry list with source/follow-up filters |
| POST | `/api/v1/crm/inquiries/{id}/convert` | Convert inquiry to project |
| GET | `/api/v1/crm/projects` | Project board/list |
| POST | `/api/v1/crm/projects` | Create project |
| GET | `/api/v1/crm/projects/{id}` | Project detail aggregate |
| PATCH | `/api/v1/crm/projects/{id}` | Update project details/status |
| POST | `/api/v1/crm/projects/{id}/bookings` | Create linked event |
| POST | `/api/v1/crm/projects/{id}/quotes` | Create linked quote/proforma |
| POST | `/api/v1/crm/projects/{id}/contracts` | Create linked contract |
| POST | `/api/v1/crm/projects/{id}/invoices` | Create linked invoice |
| POST | `/api/v1/crm/projects/{id}/galleries` | Link/create gallery |
| GET | `/api/v1/crm/follow-ups` | Follow-up queue |
| POST | `/api/v1/crm/follow-ups` | Create follow-up |
| PATCH | `/api/v1/crm/follow-ups/{id}` | Complete/reschedule follow-up |
| GET | `/api/v1/billing/tax-reports/gstr3b` | GSTR-3B UI endpoint if not already routed |

Compatibility endpoints should remain until all frontend references move from deals to projects.

## UX Plan

### Sidebar

Recommended first release:

- Keep `Clients` if product wants direct access.
- Replace separate Leads, Deals, Bookings, Invoices, Packages, GSTR-1 entries with `Studio CRM`.
- Inside Studio CRM, show tabs: Overview, Inquiries, Clients, Projects, Calendar, Documents, Billing, Reports, Price Book.

Alternative lower-risk release:

- Keep direct sidebar links for one milestone.
- Add a CRM hub and secondary tabs.
- Mark old labels as redirects or aliases.
- Remove sidebar fragmentation after telemetry and QA.

### CRM Overview

Cards:

- Hot inquiries needing follow-up
- Upcoming shoots this week
- Pending contracts
- Advance pending
- Overdue invoices
- Galleries awaiting client action
- Revenue this financial year
- GST liability this period

Primary action buttons:

- New Inquiry
- New Project
- Book Shoot
- Create Invoice
- Send Follow-up

### Project Detail

Sections:

- Header: client, project type, status, event date, value, balance due, next action
- Timeline: inquiry, quote, contract, booking, payments, shoot, gallery, delivery
- Booking: event date, location, crew, reminders, conflict status
- Documents: quote, contract, invoice, credit note
- Gallery Delivery: gallery, proofing, album, downloads
- Finance: package, invoices, payments, balance, tax split
- Communication: WhatsApp/email templates and history

## Milestone Plan

### M25: Studio CRM Foundation and Navigation

Objective: Establish the CRM workspace and fix lifecycle inconsistencies without deep data migration risk.

Key deliverables:

- Studio CRM hub at `/crm`.
- Secondary CRM tabs.
- User-facing terminology changes: Leads to Inquiries, Deals to Projects where safe.
- Existing routes preserved via redirects/aliases.
- Contact type mismatch fixed.
- Calendar event type mismatch fixed.
- Deal value/status metric mismatch fixed.
- Quick action query params/prefill supported.
- Packages and Tax Reports moved into CRM navigation.

Exit criteria:

- Sidebar no longer presents the six business modules as unrelated flat siblings.
- `/crm` gives a useful daily operating overview.
- Existing direct URLs still work.
- Unit and frontend tests cover route redirects, nav active states, and enum consistency.

### M26: Project Aggregate and Workflow Linking

Objective: Add the canonical Studio Project aggregate and link bookings, invoices, contracts, galleries, and follow-ups around it.

Key deliverables:

- `studio_projects` migration and repository/service.
- Backfill from deals.
- Project routes and frontend project board/detail.
- Link project_id into events, invoices, contracts, galleries, follow-ups.
- Client profile uses project terminology and links.
- Contact merge reassigns events and projects.
- Calendar create/update both enforce conflict checks.

Exit criteria:

- Every deal has a corresponding project.
- New project can create booking, invoice, contract, and gallery links.
- Client profile shows projects, bookings, billing, galleries, and timeline from direct links.
- No email-matching-only dependency for new gallery-client linkage.

### M27: Documents, Billing, Payments, and Tax Hardening

Objective: Make project-to-money flow reliable and India-compliant.

Key deliverables:

- Contracts/Documents dashboard UI.
- Quote/proforma to invoice flow.
- Server-owned invoice totals and GST split.
- Canonical photography SAC taxonomy.
- Payment link integration behind configured provider.
- Payment aging and collection dashboard.
- Tax Reports section with GSTR-1 and GSTR-3B UI.
- Credit note handling exposed in billing workflow.

Exit criteria:

- Invoice totals do not depend on frontend tax math.
- Payment links are not hardcoded/stubbed in production paths.
- Tax reports reconcile with invoice data.
- Contract and invoice can be generated from a project without re-entering client/package data.

### M28: Operations, Communications, and Retention

Objective: Turn Studio CRM into the daily operations system for photographers.

Key deliverables:

- Follow-up queue and lifecycle tasks.
- Calendar day/week/agenda views.
- Event reminders.
- WhatsApp/email template library.
- Gallery delivery status integrated into projects.
- Anniversary/referral/review follow-up triggers.
- CRM analytics: source conversion, revenue by project type, lead-to-booking time, outstanding balance.

Exit criteria:

- Studio manager can run the day from CRM Overview.
- Follow-ups are visible, actionable, and linked to the right entity.
- Calendar supports operational planning beyond month view.
- Delivery and retention tasks appear in the CRM timeline.

## Epics and Stories

### Epic E51: Studio CRM Workspace

Stories:

- E51-S1: Build CRM hub shell and secondary navigation.
- E51-S2: Refactor sidebar labels and grouping.
- E51-S3: Add CRM overview summary API.
- E51-S4: Preserve legacy routes with redirects/aliases.
- E51-S5: Add navigation tests and active-state coverage.

### Epic E52: Lifecycle Taxonomy and Consistency

Stories:

- E52-S1: Align contact type taxonomy.
- E52-S2: Align calendar event types across UI, API, and DB.
- E52-S3: Align deal/project status labels and metrics.
- E52-S4: Add canonical SAC taxonomy.
- E52-S5: Add enum regression tests.

### Epic E53: Studio Projects

Stories:

- E53-S1: Create `studio_projects` migration.
- E53-S2: Backfill projects from existing deals.
- E53-S3: Add project repository/service/handler.
- E53-S4: Add project board and project detail UI.
- E53-S5: Link projects to contacts, events, invoices, contracts, follow-ups, and galleries.
- E53-S6: Update client profile to prioritize projects.

### Epic E54: Booking and Calendar Operations

Stories:

- E54-S1: Book shoot from project with prefilled calendar event.
- E54-S2: Add conflict checks to calendar update.
- E54-S3: Add day/week/agenda views.
- E54-S4: Add event reminders.
- E54-S5: Add calendar/project integration tests.

### Epic E55: Documents, Billing, Payments, and Tax

Stories:

- E55-S1: Add contracts/documents dashboard UI.
- E55-S2: Add quote/proforma to contract/invoice flow.
- E55-S3: Move invoice calculation server-side.
- E55-S4: Add payment-link provider integration path.
- E55-S5: Add payment aging and collections dashboard.
- E55-S6: Add GSTR-3B UI and tax report consolidation.

### Epic E56: Gallery Delivery Linkage

Stories:

- E56-S1: Add direct gallery contact/project association.
- E56-S2: Show gallery delivery status on project detail.
- E56-S3: Add gallery delivery timeline events.
- E56-S4: Add proofing/album pending follow-up tasks.

### Epic E57: Follow-ups, Communications, and Retention

Stories:

- E57-S1: Build follow-up queue.
- E57-S2: Link follow-ups to inquiry/client/project/invoice/contract/gallery.
- E57-S3: Add communication template library.
- E57-S4: Add WhatsApp/email quick actions.
- E57-S5: Add anniversary/referral/review triggers.
- E57-S6: Add source conversion and retention analytics.

## Dependency Graph

M25 must complete before M26 because project UI should land after terminology and enum cleanup.

M26 must complete before M27 because billing/contracts need project_id linking.

M26 must complete before M28 because follow-ups and gallery delivery tasks need project associations.

M27 and M28 can partially overlap after M26 if write scopes are separated:

- M27 owns billing/contracts/tax/payment files.
- M28 owns calendar/follow-up/communication/gallery linkage UI.

## Test Strategy

Required tests:

- Go unit tests for status mapping, tax calculation, SAC taxonomy, contact merge reassignment, calendar conflict update.
- Go integration tests for project creation, inquiry conversion, project-linked event/invoice/contract/gallery flows.
- Frontend Vitest tests for CRM navigation, quick action prefill, project board status rendering, billing form server-calculated totals.
- Playwright Docker E2E tests for CRM overview, inquiry-to-project, project-to-booking, project-to-invoice, contract flow, and gallery linkage.
- Accessibility checks for CRM tabs, project board, calendar views, follow-up queue, and billing forms.
- Regression tests confirming no standalone `/upload` sidebar route is introduced and no OTP login flow is added.

## Acceptance Gates

- `npm run test:backend` passes.
- `npm run test:frontend` passes.
- `npm run lint` passes.
- Docker Playwright smoke passes for CRM workflows.
- All new frontend code uses design tokens.
- All icon buttons use `GlassIconButton`.
- All authenticated handlers use `middleware.JWTClaimsFromContext(ctx)`.
- No local storage driver or local file persistence is introduced.
- No hardcoded credentials or production payment stubs are introduced.

## Rollout Plan

1. Ship CRM hub and aliases while keeping old routes working.
2. Add projects behind a compatibility layer over deals.
3. Backfill project records and dual-write where needed.
4. Move UI read paths to projects.
5. Move write paths to projects.
6. Add billing/contracts/gallery direct links.
7. Remove obsolete Deal terminology from user-facing UI after QA.
8. Keep API compatibility endpoints for at least one release.

## Risks

| Risk | Mitigation |
|---|---|
| Breaking existing CRM routes | Preserve redirects and aliases |
| Data migration from deals to projects loses relationships | Backfill idempotently and verify counts before/after |
| Tax calculations diverge | Server-owned invoice calculation and regression fixtures |
| Calendar conflicts missed on update | Add update-time conflict check before UI changes |
| Navigation becomes too deep | Use CRM hub plus secondary tabs, not a deeply nested sidebar at first |
| Scope grows into full accounting suite | Explicitly limit accounting to project billing, tax reports, payments, and CA exports |

## Implementation Order

1. M25: Navigation, hub, terminology, enum fixes, quick action prefill.
2. M26: Project aggregate, migrations, API, project board/detail, direct links.
3. M27: Contracts/billing/tax/payment hardening.
4. M28: Follow-ups, calendar operations, communications, retention, analytics.

## Build Authorization Note

This document is a planning artifact only. It does not start implementation. A later `cobolt-build M25` run should use this feature plan after review.

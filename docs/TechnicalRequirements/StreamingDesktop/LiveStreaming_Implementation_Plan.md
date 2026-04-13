# F-014 Live Streaming Commercialization Implementation Plan

Date: 2026-04-13
Planning mode: `cobolt-plan feature`
Scope: Brownfield recovery and completion of RawDrive livestreaming, prepaid credits, Cloudflare Stream operations, CRM/calendar integration, and payment recharge flows.
Status: Planning ready. Build should not begin until the security/config stabilization milestone is accepted.

## 1. Objective

Convert the current M8 livestream skeleton into the production livestreaming product described in the RawDrive PRD/TRD:

- Photographers can buy prepaid streaming credits, schedule live events, reserve entitlement before Cloudflare provisioning, reveal ingest credentials only during an audited setup window, monitor stream health, moderate chat, and publish replay.
- Clients and guests can join a secure waiting room, watch adaptive live playback, chat/react if enabled, and access replay based on event policy.
- Super admins can manage streaming rate cards, Cloudflare Stream configuration, payment providers, refunds, and operational reporting.
- CRM, calendar, billing, notification, and client profile surfaces treat a livestream as a first-class business event, not an isolated video widget.

RawDrive remains the livestream control plane. RawDrive must not relay, transcode, or store live video locally. Cloudflare Stream handles ingest, live playback, recording, and adaptive delivery.

## 2. Source Inputs

Primary product and technical sources:

- `docs/TechnicalRequirements/StreamingDesktop/LiveStreaming.md`
- `docs/TechnicalRequirements/PRD.md`
- `docs/TechnicalRequirements/Photographer-Requirements.md`
- `docs/TechnicalRequirements/Client-Requirements.md`
- `docs/TechnicalRequirements/TeamMember-Requirements.md`
- `docs/TechnicalRequirements/SuperAdmin-Requirements.md`
- `docs/TechnicalRequirements/Contracts_Billing_GST.md`
- `docs/TechnicalRequirements/Razorpay_Payment_Gateway_Integration.md`
- `docs/TechnicalRequirements/Techstack.md`
- `docs/uat/01-photographer-uat.md`
- `docs/uat/03-super-admin-uat.md`
- `docs/uat/05-client-uat.md`

Implementation baseline reviewed:

- Backend stream service, repository, handlers, routes, and M8 migration.
- Backend payment, invoice, calendar, client profile, platform settings, and RLS migrations.
- Frontend stream list, stream creation, public stream viewer, pricing tokens, CRM API client, and navigation.
- Existing CoBolt planning artifacts through M29.

Current Cloudflare Stream behavior was checked against official Cloudflare documentation for live input creation, RTMPS credentials, live input updates, recordings, playback manifests, and Stream Live playback.

## 3. Current State Summary

RawDrive currently has a basic livestream implementation:

- `streams` table with Cloudflare UID, RTMPS URL/key, status, PIN, chat flags, and simple counters.
- `stream_chats` table with messages but no workspace RLS.
- Authenticated `/api/v1/streams` CRUD/start/end/chat endpoints.
- Public `/api/v1/public/streams/{id}` viewer and chat endpoints.
- Optional Cloudflare live input creation from environment variables.
- Minimal dashboard list, new stream form, and public stream page.

The implementation is not aligned with the business model:

- No prepaid credit ledger, rate cards, recharge, reservations, consumption, refunds, or overage handling.
- No PhonePe/Razorpay checkout integration for streaming credits.
- No calendar/client/deal/invoice linkage.
- No Cloudflare webhook receiver, signed playback, allowed origin policy, replay reconciliation, or live health loop.
- No dashboard stream detail console.
- PIN-protected streams still expose playback URL before verification.
- Public chat is not access-controlled.
- Team member restrictions are not enforced.
- Existing stream tests are only smoke-level and do not protect security, billing, or Cloudflare behavior.

## 4. Product Decisions

These decisions are binding for implementation unless superseded by a signed ADR:

1. Cloudflare Stream is the only live video backend for standard/pro livestreaming.
2. RawDrive is a control plane only. No local video storage, live relay, or server-side live transcoding.
3. A live event cannot be confirmed or provisioned until prepaid entitlement is reserved.
4. Protected livestream playback must be tokenized. Public API responses must not leak playback URLs before access verification.
5. Ingest credentials are secrets. They are stored encrypted, masked by default, revealed only through a dedicated audited action, and rotated when necessary.
6. Email OTP remains registration-only. Do not use email OTP for livestream viewing or login.
7. PhonePe is the default payment provider for streaming recharge. Razorpay is supported where billing docs require provider choice.
8. Rate-card changes affect future purchases only. Existing ledger entries preserve package and price snapshots.
9. Team members cannot create streams, purchase credits, reveal ingest credentials, or stop streams unless an explicit workspace permission allows it.
10. Every livestream business event must be linkable to client, deal, gallery/sub-gallery, invoice/payment, and calendar records.

## 5. Functional Requirements

### 5.1 Super Admin and Platform Settings

- F014-FR-001: Super admin can create, edit, activate, deactivate, and version streaming rate cards.
- F014-FR-002: A rate card defines package name, duration minutes, grace minutes, viewer cap, price, GST treatment, currency, effective date, expiry date, and workspace plan eligibility.
- F014-FR-003: Rate-card changes apply only to future purchases.
- F014-FR-004: Super admin can configure Cloudflare Stream credentials through encrypted `platform_settings`, not hardcoded environment-only config.
- F014-FR-005: Super admin can configure payment provider priority, PhonePe settings, Razorpay settings, webhook secrets, refund policy, and replay retention policy.
- F014-FR-006: Super admin can view global streaming sales, usage, refund, failure, and Cloudflare cost reports.

### 5.2 Recharge and Ledger

- F014-FR-010: Photographer can view credit balance, reserved credits, expired credits, consumed credits, and transaction history.
- F014-FR-011: Photographer can buy streaming packages through PhonePe by default and Razorpay if enabled.
- F014-FR-012: Recharge creates a pending purchase, redirects to provider checkout, verifies server-side, and posts an immutable ledger credit only after trusted payment confirmation.
- F014-FR-013: Webhooks are idempotent and store provider references, signature verification status, raw event hash, and processing result.
- F014-FR-014: Refunds and cancellations post compensating ledger entries; existing ledger rows are never mutated.
- F014-FR-015: Ledger balance calculation subtracts active reservations from available credits.

### 5.3 Live Event Scheduling and Reservation

- F014-FR-020: Photographer can create a live event with title, description, client, deal, gallery/sub-gallery, calendar date/time, timezone, expected duration, expected viewer cap, access mode, chat/reaction settings, replay policy, and notification plan.
- F014-FR-021: Event confirmation validates available entitlement and reserves the required package units before Cloudflare live input creation.
- F014-FR-022: If payment succeeds but reservation fails due to race conditions, the system keeps the credit balance and shows a retryable reservation error.
- F014-FR-023: Draft events can exist without reservation, but scheduled/confirmed events require a reservation.
- F014-FR-024: Cancelling at least 24 hours before scheduled start releases reserved entitlement automatically.
- F014-FR-025: Cancelling less than 24 hours before start follows admin-configured policy and records the decision in audit.
- F014-FR-026: Calendar records are created/updated from live event schedule and retain a foreign key back to the live event.

### 5.4 Cloudflare Stream Control Plane

- F014-FR-030: Confirmed events provision a Cloudflare Stream live input with automatic recording and metadata linking workspace/event IDs.
- F014-FR-031: Cloudflare live input UID, RTMPS URL/key, optional SRT fields, playback IDs/manifests, recording UID, and status metadata are persisted.
- F014-FR-032: Stream status is reconciled through Cloudflare webhooks and fallback polling.
- F014-FR-033: Start/end operations update RawDrive state and Cloudflare input state where supported.
- F014-FR-034: Ending an event disables or blocks ingest according to policy and finalizes consumption.
- F014-FR-035: Replay processing and replay-ready status are derived from Cloudflare recording state, not local guesses.
- F014-FR-036: Cloudflare settings support signed playback, allowed origins, recording retention, low latency, and viewer count visibility policy.

### 5.5 Ingest Credential Governance

- F014-FR-040: RTMPS/SRT credentials are masked by default.
- F014-FR-041: Credential reveal is blocked until the configured setup window, default T-30 minutes.
- F014-FR-042: Credential reveal requires owner/admin permission and writes an audit entry.
- F014-FR-043: A reveal action returns credentials once per request and never logs secret values.
- F014-FR-044: Ingest keys can be rotated and old keys revoked when Cloudflare supports it or by re-provisioning input.

### 5.6 Viewer Access, Waiting Room, Chat, and Replay

- F014-FR-050: Public stream routes use slug/token identifiers and do not expose raw internal control data.
- F014-FR-051: Protected access requires PIN/password/magic link/invite token according to event policy and creates a viewer session.
- F014-FR-052: Public API returns playback only after verified access and only as signed or short-lived tokenized playback.
- F014-FR-053: Waiting room shows countdown and transitions to live without manual refresh.
- F014-FR-054: Viewer page shows live, interrupted, completed, replay processing, replay ready, and access expired states.
- F014-FR-055: Chat and reactions are optional per event, scoped to verified viewer sessions, rate-limited, and moderation-aware.
- F014-FR-056: Moderator can delete/mute messages, disable chat, set slow mode, and export moderation logs.
- F014-FR-057: Replay access obeys the event access policy and configured retention.

### 5.7 Analytics and Reporting

- F014-FR-060: Photographer dashboard shows current viewers, peak viewers, unique viewers, viewer minutes, chat count, reactions, ingest health, and entitlement remaining.
- F014-FR-061: Post-event analytics include unique viewers, peak concurrency, total watch time, average watch time, replay views, invite/QR conversion, geography where available, and delivery quality indicators available from Cloudflare.
- F014-FR-062: Workspace reports include streaming credits purchased, credits consumed, refunds, overages, and event-level revenue/cost.
- F014-FR-063: Platform reports show rate-card sales, provider success/failure, revenue by state/dealer, Cloudflare usage, and margin.

### 5.8 CRM, Calendar, Client, Billing, and Notifications

- F014-FR-070: Live events can be attached to contacts, clients, deals, galleries, invoices, and calendar entries.
- F014-FR-071: Client profile includes live streams in summary and timeline.
- F014-FR-072: Deal detail shows linked live event status, reservation status, and streaming revenue.
- F014-FR-073: Invoice/receipt generation supports streaming credit purchases with GST, provider reference, package snapshot, and amount-in-words.
- F014-FR-074: Notification templates support stream scheduled, credential reveal reminder, live started, live ended, replay ready, payment success, payment failure, and low credit warning.
- F014-FR-075: Google Calendar sync includes live event metadata without exposing ingest secrets.

## 6. Non-Functional Requirements

- F014-NFR-001: All viewer and chat endpoints must enforce tenant-safe access without relying on public knowledge of UUIDs.
- F014-NFR-002: Payment webhook processing must be idempotent under retry, duplicate, and out-of-order delivery.
- F014-NFR-003: Ledger calculations must be deterministic, auditable, and reproducible from immutable entries.
- F014-NFR-004: No secret values are logged, returned in list APIs, or stored unencrypted.
- F014-NFR-005: Live viewer page must tolerate Cloudflare status delays and client reconnects.
- F014-NFR-006: Dashboard actions must be role-gated and covered by backend tests.
- F014-NFR-007: Public stream first usable playback target is under 2 seconds after Cloudflare live playback is available, matching UAT intent.
- F014-NFR-008: All frontend work must follow `frontend/AGENTS.md`, design tokens, semantic token classes, and `GlassIconButton` for icon buttons.
- F014-NFR-009: E2E tests run through the Docker Playwright service and use auth state injection for dashboard flows.
- F014-NFR-010: All externally callable APIs must have OpenAPI contracts and structured error responses.

## 7. Target Architecture

### 7.1 Services and Ownership

- `StreamingCatalogService`: rate cards, package eligibility, active package snapshots.
- `StreamingLedgerService`: immutable ledger, balance, reservations, consumption, refunds, overage, audit.
- `StreamingPaymentService`: provider checkout, PhonePe/Razorpay order creation, webhook verification, payment-to-ledger posting.
- `LiveEventService`: event lifecycle, schedule, access policy, calendar/CRM links, Cloudflare provisioning orchestration.
- `CloudflareStreamClient`: Cloudflare Stream API wrapper for live input create/update/delete, status, recordings, playback metadata.
- `ViewerAccessService`: PIN/password/magic link/invite verification, signed playback token creation, viewer session lifecycle.
- `StreamRealtimeService`: viewer presence, chat, reactions, moderation, event state broadcasts over SSE or WebSocket.
- `StreamAnalyticsService`: viewer sessions, watch minutes, invite/QR attribution, event analytics, platform reports.
- `StreamNotificationService`: reminders, low-credit warnings, go-live/replay notifications.
- `StreamAuditService`: immutable audit events for secrets, payment, policy, access, moderation, lifecycle transitions.

### 7.2 Event Flow

1. Photographer opens Streams and sees available balance, active reservations, and planned events.
2. Photographer creates draft event and links client/deal/gallery/calendar.
3. Photographer selects package or expected duration/viewer cap; system calculates required reservation.
4. If balance is insufficient, photographer recharges through PhonePe/Razorpay.
5. Payment webhook posts ledger credit; event confirmation reserves entitlement.
6. System provisions Cloudflare live input and stores delivery metadata.
7. Event waits in scheduled/waiting-room state; invite links and QR are generated.
8. T-30 credential reveal becomes available to owner/admin and is audited.
9. Cloudflare webhook or poll marks ingest connected/live; viewer waiting room transitions.
10. During live, viewer sessions, chat, reactions, and health are tracked.
11. End/manual stop/timeout finalizes Cloudflare state, consumes reservation, posts ledger debit, and starts replay processing.
12. Replay-ready webhook updates event and triggers notifications.
13. Analytics and financial reports become available.

## 8. Data Model Plan

The existing `streams` and `stream_chats` tables should be migrated into a new workspace-scoped model. Keep compatibility shims only during migration.

### 8.1 New or Reworked Tables

`streaming_rate_cards`
- `id`, `name`, `currency`, `status`, `effective_from`, `expires_at`, `created_by`, `created_at`, `updated_at`.

`streaming_packages`
- `id`, `rate_card_id`, `name`, `duration_minutes`, `grace_minutes`, `viewer_cap`, `price_minor`, `gst_rate_bps`, `workspace_plan_scope`, `is_stackable`, `metadata`.

`streaming_credit_purchases`
- `id`, `workspace_id`, `package_id`, `rate_card_snapshot`, `provider`, `provider_order_id`, `provider_payment_id`, `status`, `amount_minor`, `tax_minor`, `currency`, `invoice_id`, `created_at`, `paid_at`.

`streaming_ledger_entries`
- `id`, `workspace_id`, `entry_type`, `package_snapshot`, `entitled_minutes_delta`, `viewer_cap_delta`, `amount_minor`, `source_type`, `source_id`, `idempotency_key`, `audit_hash`, `created_at`.
- Entry types: `purchase_credit`, `reserve`, `release_reservation`, `consume`, `refund`, `overage_debit`, `manual_adjustment`.

`streaming_reservations`
- `id`, `workspace_id`, `live_event_id`, `ledger_entry_id`, `package_snapshot`, `reserved_minutes`, `grace_minutes`, `viewer_cap`, `status`, `expires_at`, `consumed_at`, `released_at`.

`live_events`
- `id`, `workspace_id`, `gallery_id`, `album_id`, `client_id`, `contact_id`, `deal_id`, `invoice_id`, `calendar_event_id`, `created_by`, `title`, `description`, `slug`, `status`, `scheduled_start_at`, `scheduled_end_at`, `timezone`, `expected_duration_minutes`, `expected_viewer_cap`, `access_mode`, `pin_hash`, `chat_enabled`, `reactions_enabled`, `replay_enabled`, `replay_retention_days`, `created_at`, `updated_at`.
- Statuses: `draft`, `scheduled`, `credit_reserved`, `waiting_room`, `ingest_ready`, `live`, `interrupted`, `completed`, `replay_processing`, `replay_ready`, `cancelled`, `failed`.

`live_event_delivery`
- `id`, `live_event_id`, `cloudflare_live_input_uid`, `cloudflare_recording_uid`, `rtmps_url_encrypted`, `rtmps_key_encrypted`, `srt_url_encrypted`, `playback_uid`, `hls_url`, `dash_url`, `iframe_url`, `signed_playback_required`, `allowed_origins`, `low_latency_enabled`, `last_cloudflare_status`, `last_seen_live_at`, `created_at`, `updated_at`.

`live_event_access_grants`
- `id`, `live_event_id`, `grant_type`, `recipient_contact_id`, `token_hash`, `expires_at`, `max_uses`, `used_count`, `created_at`.

`viewer_sessions`
- `id`, `live_event_id`, `workspace_id`, `access_grant_id`, `viewer_name`, `viewer_fingerprint_hash`, `ip_hash`, `user_agent_hash`, `joined_at`, `last_seen_at`, `left_at`, `watch_seconds`, `source`, `country_code`.

`stream_chat_messages`
- `id`, `workspace_id`, `live_event_id`, `viewer_session_id`, `user_id`, `user_name`, `message`, `message_type`, `status`, `moderated_by`, `moderated_at`, `created_at`.

`stream_reaction_events`
- `id`, `workspace_id`, `live_event_id`, `viewer_session_id`, `reaction_type`, `created_at`.

`stream_moderation_actions`
- `id`, `workspace_id`, `live_event_id`, `target_type`, `target_id`, `action`, `reason`, `actor_user_id`, `created_at`.

`cloudflare_stream_webhook_events`
- `id`, `cloudflare_event_id`, `event_type`, `live_input_uid`, `recording_uid`, `payload_hash`, `payload_json`, `signature_valid`, `processed_at`, `processing_result`, `created_at`.

`live_event_audit_entries`
- `id`, `workspace_id`, `live_event_id`, `actor_user_id`, `action`, `target_type`, `target_id`, `metadata_json`, `created_at`.

### 8.2 Migration Rules

- Backfill existing `streams` into `live_events` and `live_event_delivery`.
- Backfill `stream_chats` into `stream_chat_messages` with `workspace_id` derived from the parent stream.
- Enable RLS on every new streaming table.
- Preserve old route compatibility for one release behind feature flag `streaming_legacy_routes`.
- Remove or freeze plaintext `cf_rtmps_key` and `pin_code` after encrypted migration.

## 9. API Plan

### 9.1 Super Admin APIs

- `GET /api/v1/superadmin/streaming/rate-cards`
- `POST /api/v1/superadmin/streaming/rate-cards`
- `PUT /api/v1/superadmin/streaming/rate-cards/{id}`
- `POST /api/v1/superadmin/streaming/rate-cards/{id}/activate`
- `POST /api/v1/superadmin/streaming/rate-cards/{id}/deactivate`
- `GET /api/v1/superadmin/streaming/reports`
- `GET /api/v1/admin/settings/streaming/{key}`
- `PUT /api/v1/admin/settings/streaming/{key}`

### 9.2 Workspace Credit and Recharge APIs

- `GET /api/v1/streaming/credits/balance`
- `GET /api/v1/streaming/credits/ledger`
- `GET /api/v1/streaming/packages`
- `POST /api/v1/streaming/recharge/checkout`
- `GET /api/v1/streaming/recharge/{id}/status`
- `POST /api/v1/payments/webhooks/phonepe`
- `POST /api/v1/payments/webhooks/razorpay`

### 9.3 Workspace Live Event APIs

- `GET /api/v1/live-events`
- `POST /api/v1/live-events`
- `GET /api/v1/live-events/{id}`
- `PUT /api/v1/live-events/{id}`
- `POST /api/v1/live-events/{id}/reserve`
- `POST /api/v1/live-events/{id}/confirm`
- `POST /api/v1/live-events/{id}/cancel`
- `POST /api/v1/live-events/{id}/start`
- `POST /api/v1/live-events/{id}/end`
- `POST /api/v1/live-events/{id}/reveal-ingest`
- `POST /api/v1/live-events/{id}/rotate-ingest`
- `GET /api/v1/live-events/{id}/health`
- `GET /api/v1/live-events/{id}/analytics`
- `GET /api/v1/live-events/{id}/moderation`
- `POST /api/v1/live-events/{id}/moderation/actions`

### 9.4 Public Viewer APIs

- `GET /api/v1/public/live-events/{slug}`
- `POST /api/v1/public/live-events/{slug}/access`
- `GET /api/v1/public/live-events/{slug}/playback`
- `POST /api/v1/public/live-events/{slug}/viewer-sessions/heartbeat`
- `GET /api/v1/public/live-events/{slug}/events`
- `GET /api/v1/public/live-events/{slug}/chat`
- `POST /api/v1/public/live-events/{slug}/chat`
- `POST /api/v1/public/live-events/{slug}/reactions`

Public playback and chat endpoints require an access session token except for explicitly public events. Public metadata never returns ingest data, internal IDs, or unsigned protected playback URLs.

## 10. Automatic Calculation Rules

### 10.1 Credit Balance

Available balance is calculated from immutable ledger entries:

`available_minutes = purchased_minutes + adjustment_minutes - reserved_active_minutes - consumed_minutes - refunded_minutes - expired_minutes`

Do not store available balance as the source of truth. A cached balance table is allowed only if rebuilt from ledger entries and validated by tests.

### 10.2 Reservation

Inputs:

- Expected duration minutes.
- Package duration and grace minutes.
- Expected viewer cap.
- Workspace plan eligibility.
- Active rate-card package snapshot.

Rules:

- Select one or more stackable packages that cover expected duration and viewer cap.
- A one-hour package reserves 60 minutes plus configured grace, default 10 minutes.
- Multi-hour streams stack packages in package-duration increments.
- Reservation writes `reserve` ledger entry and `streaming_reservations` row.
- Race protection uses a database transaction and idempotency key.

### 10.3 Consumption

Rules:

- Actual billable duration starts when Cloudflare reports live ingest or when manual start is confirmed, whichever policy marks as valid start.
- Billable duration ends at manual stop, forced stop, Cloudflare ended status, or timeout.
- Grace minutes are consumed only for entitlement enforcement, not separately charged unless policy says otherwise.
- If runtime exceeds reservation plus grace, system attempts auto-reserve from available balance if enabled. Otherwise it warns and then enforces stop at policy threshold.
- Consumption posts `consume` ledger entry and marks reservation `consumed`.

### 10.4 Refund and Cancellation

Rules:

- Draft deletion has no ledger effect.
- Scheduled event cancellation at least 24 hours before start releases reservation automatically.
- Cancellation inside 24 hours follows platform policy: release, partial release, or manual-review hold.
- Cloudflare provisioning failure after reservation releases the reservation unless a retry succeeds within policy window.
- Payment refunds post compensating ledger entries and keep original purchase rows immutable.

### 10.5 Invoice and GST

Rules:

- Streaming credit purchase creates invoice/receipt with package snapshot, GST rate, place of supply, provider reference, and paid status.
- Refunds create credit note entries where required.
- Dealer margin and platform revenue allocation are calculated from the paid purchase amount, not from later consumption.

## 11. Frontend Plan

All frontend implementation must read `frontend/AGENTS.md` and `design-tokens.json` before code changes.

### 11.1 Workspace Routes

- `/streams`: list events, credit balance, recharge CTA, upcoming/live/replay tabs, warning states.
- `/streams/new`: event creation wizard with client/deal/gallery/calendar link, package estimate, credit reservation, access policy, chat/replay settings.
- `/streams/credits`: balance, recharge packages, ledger, purchase status, invoices/receipts.
- `/streams/[id]`: operations console with event status, entitlement remaining, viewer count, Cloudflare health, moderation alerts, replay state.
- `/streams/[id]/setup`: masked ingest, reveal action, copy buttons, OBS/SRT instructions, QR/invite preview.
- `/streams/[id]/moderation`: chat/reaction controls, muted viewers, deleted messages, export.
- `/streams/[id]/analytics`: real-time and post-event analytics.

### 11.2 Super Admin Routes

- `/superadmin/streaming/rates`: rate-card CRUD, package editor, effective-date activation.
- `/superadmin/streaming/settings`: Cloudflare Stream and payment provider settings.
- `/superadmin/streaming/reports`: sales, usage, provider failures, refunds, Cloudflare usage.

### 11.3 CRM, Calendar, and Client Surfaces

- Client profile: add Live Streams card and timeline entries.
- Deal detail: add linked livestream events and reservation/payment status.
- Calendar: live stream event type, color, reminders, and sync metadata.
- Invoice/payment pages: show streaming credit purchases and receipts.
- Gallery workspace: link relevant livestreams for the same client/gallery/event.

### 11.4 Public Viewer Route

- `/stream/[slug]`: waiting room, access gate, live player, chat/reactions, replay, expired state.
- No playback iframe is rendered until access is verified.
- Viewer state updates through SSE/WebSocket/polling fallback.

## 12. Implementation Milestones

The current CoBolt plan reserves M27-M28 for Studio CRM work and leaves M29 unassigned as a hold slot. This feature is planned as F-014 starting at M30. M30 can be pulled forward as a security hotfix if public stream exposure must be closed before later planned milestones complete.

### M30 - Livestream Security, Config, and Legacy Stabilization

Objective: Make existing livestream endpoints safe before adding business expansion.

Stories:

- F014-M30-S1: Replace public stream access response with access-gated metadata; do not return playback before verified access.
- F014-M30-S2: Hash PINs, add viewer access sessions, and require access session for public chat/playback.
- F014-M30-S3: Add workspace-scoped chat table or migrate `stream_chats` to include `workspace_id`; enable RLS.
- F014-M30-S4: Move Cloudflare Stream credentials to encrypted `platform_settings` with env fallback only as documented fallback.
- F014-M30-S5: Add role gates for create/start/end/delete/reveal/purchase operations.
- F014-M30-S6: Fix dashboard route mismatch for `/streams/[id]` with a minimal safe detail page.
- F014-M30-S7: Add backend security tests for public playback leakage, chat access, RLS, and role gates.

Exit criteria:

- PIN-protected public endpoint never returns playback before verification.
- Public chat cannot be read or written without valid event access.
- Stream secrets are not returned in list APIs and are encrypted at rest.
- Team member denial tests pass.
- Targeted Go tests for stream handlers pass.

### M31 - Streaming Rate Cards, Ledger, and Recharge

Objective: Implement prepaid commercial foundation.

Stories:

- F014-M31-S1: Create rate-card, package, purchase, ledger, and reservation migrations with RLS.
- F014-M31-S2: Implement `StreamingCatalogService` and active package snapshot logic.
- F014-M31-S3: Implement immutable `StreamingLedgerService`, balance calculation, idempotency keys, and reservation transactions.
- F014-M31-S4: Implement PhonePe checkout creation, webhook verification, status lookup, and payment-to-ledger posting.
- F014-M31-S5: Implement Razorpay checkout/webhook support behind provider configuration.
- F014-M31-S6: Add super-admin rate-card UI and workspace credits/recharge UI.
- F014-M31-S7: Generate invoice/receipt records for paid streaming credit purchases with GST.
- F014-M31-S8: Add ledger, payment, refund, race, and idempotency tests.

Exit criteria:

- Photographer can buy a streaming package in sandbox and see balance update.
- Duplicate webhooks do not double-credit.
- Rate-card activation affects future purchases only.
- Ledger replay reproduces balance exactly.

### M32 - Live Event Domain, Reservation, Calendar, and CRM Links

Objective: Promote livestreaming from isolated stream row to first-class business event.

Stories:

- F014-M32-S1: Add `live_events`, `live_event_delivery`, access grants, audit, and calendar link migrations.
- F014-M32-S2: Backfill existing `streams` into `live_events` and compatibility responses.
- F014-M32-S3: Implement draft/create/update/confirm/cancel event lifecycle with reservation enforcement.
- F014-M32-S4: Add client/contact/deal/gallery/calendar linking APIs.
- F014-M32-S5: Add event type `live_stream` to calendar and Google Calendar sync metadata.
- F014-M32-S6: Extend client profile and deal detail APIs with livestream summaries and timeline events.
- F014-M32-S7: Build new stream creation wizard with package estimate and reservation confirmation.
- F014-M32-S8: Add cancellation/refund release policy tests.

Exit criteria:

- Scheduled livestream has client/deal/gallery/calendar links.
- Event cannot be confirmed without reserved entitlement.
- Cancellation at least 24 hours before start releases reservation.
- Client profile timeline shows live stream lifecycle events.

### M33 - Cloudflare Stream Operations, Webhooks, and Realtime

Objective: Make Cloudflare Stream the authoritative delivery state while RawDrive controls access and commerce.

Stories:

- F014-M33-S1: Implement `CloudflareStreamClient` with create/update/delete/live input status and recording status.
- F014-M33-S2: Provision live inputs from confirmed events with metadata, signed playback settings, recording settings, and allowed origins.
- F014-M33-S3: Add Cloudflare webhook receiver with signature validation or configured verification mechanism, idempotent processing, and replay-safe storage.
- F014-M33-S4: Add status reconciler fallback polling for live, interrupted, completed, replay processing, and replay ready.
- F014-M33-S5: Implement reveal-ingest and rotate-ingest flows with audit and T-30 policy.
- F014-M33-S6: Implement viewer sessions, heartbeat, current viewers, peak viewers, and watch-minute accumulation.
- F014-M33-S7: Implement SSE/WebSocket realtime for stream state, chat, reactions, and viewer count.
- F014-M33-S8: Add Cloudflare mock tests, webhook tests, and realtime integration tests.

Exit criteria:

- Cloudflare status changes update RawDrive event state.
- Replay-ready notification is driven by Cloudflare recording state.
- Viewer count is current sessions, not a reused total-views field.
- Ingest reveal is audited and blocked outside the allowed window.

### M34 - Dashboard Console, Public Viewer, Desktop Preflight, and Notifications

Objective: Deliver the end-to-end user workflows.

Stories:

- F014-M34-S1: Build `/streams/[id]` operations console with status, entitlement, health, viewer count, QR/invites, and replay.
- F014-M34-S2: Build `/streams/[id]/setup` with masked RTMPS/SRT details, reveal/copy actions, OBS setup guide, and desktop companion handoff.
- F014-M34-S3: Build public `/stream/[slug]` waiting room, access gate, live player, chat/reactions, interrupted, ended, replay, and expired states.
- F014-M34-S4: Build moderation console and chat/reaction controls.
- F014-M34-S5: Add stream notification templates and triggers.
- F014-M34-S6: Add desktop preflight endpoint/UI for encoder/network checks and OBS profile export if feasible.
- F014-M34-S7: Add Docker Playwright E2E for dashboard create/reserve/setup and public viewer flows.

Exit criteria:

- Photographer can execute create -> recharge/reserve -> setup -> go live -> moderate -> end -> replay.
- Viewer waiting room transitions to live without manual refresh.
- Public viewer UAT passes with chat and viewer count.
- Dashboard E2E uses auth injection, not UI login.

### M35 - Analytics, Governance, Migration Cleanup, and Release Readiness

Objective: Complete reporting, compliance, and hardening for production release.

Stories:

- F014-M35-S1: Implement post-event analytics and invite/QR attribution.
- F014-M35-S2: Implement workspace streaming financial reports and super-admin platform reports.
- F014-M35-S3: Add dealer/platform margin reporting for streaming credit purchases.
- F014-M35-S4: Add operational alerts for webhook failures, ingest drops, low credit, forced stop, and replay failures.
- F014-M35-S5: Remove legacy plaintext fields and freeze/deprecate old `streams` routes after compatibility window.
- F014-M35-S6: Complete OpenAPI contracts and docs for streaming APIs.
- F014-M35-S7: Run full regression: backend, frontend, lint, Docker Playwright, RLS/security, payment sandbox, Cloudflare mock/live sandbox.
- F014-M35-S8: Produce release readiness checklist and rollback plan.

Exit criteria:

- Streaming reports reconcile ledger, payment, and event consumption.
- No legacy public playback leak remains.
- All F014 acceptance tests pass.
- Release can be rolled back by disabling feature flags without corrupting ledger.

## 13. Traceability Matrix

| Gap from review | Requirement IDs | Milestones |
| --- | --- | --- |
| No prepaid credits, ledger, reservation, recharge | F014-FR-010 to F014-FR-015, F014-FR-020 to F014-FR-024 | M31, M32 |
| Public playback URL leaked before PIN verification | F014-FR-050 to F014-FR-052, F014-NFR-001 | M30 |
| Public chat unauthenticated and no RLS | F014-FR-055, F014-FR-056, F014-NFR-001 | M30, M33 |
| Cloudflare create-only integration | F014-FR-030 to F014-FR-036 | M33 |
| Env-only Cloudflare config | F014-FR-004, F014-NFR-004 | M30 |
| No stream detail dashboard | F014-FR-040 to F014-FR-044, F014-FR-060 | M30, M34 |
| No calendar/client/deal link | F014-FR-070 to F014-FR-075 | M32, M34 |
| Payment link stub/no PhonePe/Razorpay recharge | F014-FR-011 to F014-FR-014 | M31 |
| Static frontend streaming packs | F014-FR-001 to F014-FR-003 | M31 |
| Team member restrictions missing | F014-NFR-006, product decision 9 | M30 |
| No analytics/reports | F014-FR-060 to F014-FR-063 | M33, M35 |
| No E2E/security/payment tests | F014-NFR-009, F014-NFR-010 | M30-M35 |

## 14. Test Strategy

Backend tests:

- Stream access: public metadata, PIN verification, signed playback, expired token, invalid token.
- RLS: chat/messages/viewer sessions cannot cross workspace.
- Role gates: team member denied, photographer allowed, platform staff scoped.
- Ledger: purchase, reserve, release, consume, refund, overage, duplicate webhook, concurrent reservation.
- Payment: PhonePe and Razorpay signature verification, failure, retry, idempotency, status lookup.
- Cloudflare: mock live input create/update/delete, webhook ingestion, replay state, status polling fallback.
- Calendar/CRM: live event link creation, timeline, client/deal aggregation, Google Calendar sync metadata.

Frontend tests:

- Vitest for calculation utilities, package selection, role-based UI, public viewer state machine.
- Component tests for credit balance, recharge package selection, stream setup, moderation controls.
- No raw icon buttons for icon actions; use `GlassIconButton`.

E2E tests:

- Run in Docker Playwright service.
- Dashboard auth via storage state or `addInitScript`.
- Photographer flow: recharge sandbox -> create event -> reserve -> reveal setup -> start/end -> replay ready mock.
- Public viewer flow: waiting room -> access -> playback -> chat -> replay.
- Super-admin flow: create rate card -> activate -> verify future package list.
- UAT-aligned checks for viewer start timing, chat, viewer count, and credit decrement.

Security tests:

- No playback URL before access verification.
- No ingest credential in list/detail responses unless reveal endpoint is used.
- No secret values in logs.
- Webhook replay does not duplicate ledger entries.
- Public endpoints tolerate random UUID/slug probing.

## 15. Rollout and Feature Flags

Recommended flags:

- `streaming_v2`: enables new live event domain and dashboard.
- `streaming_public_v2`: enables tokenized public viewer route.
- `streaming_payments`: enables recharge checkout and ledger posting.
- `streaming_cloudflare_webhooks`: enables Cloudflare webhook state reconciliation.
- `streaming_legacy_routes`: keeps old `/api/v1/streams` compatibility during migration.

Rollout sequence:

1. Deploy M30 security changes with legacy compatibility.
2. Deploy M31 ledger/rate cards to internal users and seed initial active rate card.
3. Enable recharge in sandbox/staging with PhonePe and Razorpay test credentials.
4. Deploy M32 event model and backfill old streams.
5. Enable Cloudflare sandbox events for internal testing.
6. Enable public viewer v2 for selected workspaces.
7. Run UAT and financial reconciliation before standard/pro availability.

Rollback:

- Disable `streaming_public_v2` to stop new public viewer.
- Disable `streaming_payments` to stop new credit purchases while preserving ledger.
- Keep ledger append-only; rollback code must not delete or mutate financial entries.
- Disable Cloudflare webhook processing by flag while retaining raw webhook storage for replay.

## 16. Open Decisions

- OD-001: Confirm final package taxonomy and prices: one-hour, multi-hour, viewer-cap slabs, enterprise custom packs.
- OD-002: Confirm whether overage auto-reserve is enabled by default or requires workspace opt-in.
- OD-003: Confirm hard-stop policy after grace period versus warning-only for paid workspaces.
- OD-004: Confirm replay retention defaults and whether retention can vary by plan.
- OD-005: Confirm signed playback implementation choice for Cloudflare Stream in this account: signed URLs, signed tokens, or Cloudflare-supported viewer restrictions.
- OD-006: Confirm PhonePe production credential model and whether Razorpay is optional or mandatory provider choice at launch.
- OD-007: Confirm whether SRT is launch scope or phase-2 after RTMPS.
- OD-008: Confirm viewer caps are enforced only commercially or also used to block new viewer sessions.
- OD-009: Confirm dealer margin treatment for streaming credit purchases and refunds.
- OD-010: Confirm whether stream events can be sold standalone or only attached to a photography package/deal.

## 17. Build Readiness Checklist

Before implementation starts:

- Security decision on public playback tokenization is finalized.
- Initial streaming rate card and package definitions are approved.
- PhonePe and Razorpay sandbox credentials are available in platform settings or environment for local dev.
- Cloudflare Stream sandbox account/token/subdomain are available.
- Calendar live event enum and CRM link requirements are accepted.
- RLS migration approach for existing `stream_chats` data is approved.
- M30 is allowed to modify existing stream routes before feature expansion.
- Docker Playwright runner is healthy.

## 18. Definition of Done for F-014

F-014 is complete when:

- A standard/pro photographer can buy prepaid streaming credits, schedule a livestream, reserve entitlement, provision Cloudflare Stream, reveal ingest credentials, run the event, moderate chat, end the event, and publish replay.
- Credits, reservations, consumption, refunds, invoices, and reports reconcile from immutable ledger entries.
- Protected streams never leak playback URL before verified access.
- Chat/reactions/viewer sessions are tenant-safe and access-controlled.
- Cloudflare webhooks and polling keep live/replay state accurate.
- Calendar, client profile, deal, gallery, invoice, notification, and reporting surfaces all include livestream context.
- Super admin can manage rate cards, provider settings, Cloudflare settings, and global streaming reports.
- Backend, frontend, security, payment, Cloudflare, and Docker Playwright E2E tests pass.

# Technical Requirements: Live Event Streaming

**Document Status:** Setera Standard v2.0 (2026-04 aligned)  
**Ownership:** Media Engineering / Product / Billing Operations  
**Technology:** Cloudflare Stream, Golang control plane, PhonePe, PostgreSQL, WebSockets, QR Code Generation, PWA, source-side encoder workflows, Windows/macOS desktop companion

---

## 1. Product Mission
Provide photographers and studios with a prepaid, event-based live streaming product that feels operationally simple for broadcasters and safe for billing, while keeping Cloudflare Stream as the managed ingest, playback, and replay engine.

---

## 2. Scope and Boundaries

### 2.1 In Scope
- Event scheduling, provisioning, and event-status management for live broadcasts.
- Prepaid streaming credits, recharge flows, reservation, consumption, refund, and overage handling.
- Waiting room, live playback surface, replay handoff, invite link generation, and QR code generation.
- Broadcaster ingest setup, key reveal workflow, basic live moderation, and live viewer telemetry.
- Source-side live encoding guidance and validation for supported broadcaster machines.

### 2.2 Out of Scope
- Building RawDrive-owned transcoding or CDN infrastructure.
- RawDrive-managed encoder hardware, production switching, or studio tooling.
- General on-demand video upload, proofing, and post-event cinematic delivery requirements. Those live in [Video_Transcoding_Delivery.md](Video_Transcoding_Delivery.md).
- Browser-only live encoding as the professional broadcast path.

---

## 3. Business Rules & Logic

### 3.1 Prepaid Credit Model
Every workspace must have a **Streaming Credit Ledger**.

- Credits are purchased from an admin-managed package catalog keyed by viewer slab and duration slab.
- A default 1-hour live package reserves **60 minutes plus a 10-minute grace buffer**.
- For multi-hour reservations, duration stacks linearly and a single 10-minute grace buffer is added to the reserved block. Example: 4 hours reserves 250 minutes of total live capacity.
- When the reserved duration is exceeded, the system must warn the broadcaster and either reserve the next eligible prepaid unit from available balance or enforce stream-end behavior when no eligible balance remains.
- Pricing must come from the active package catalog and ledger snapshot at purchase time; this document must not be treated as the pricing source of truth.

### 3.2 Booking and Scheduling Workflow
1. Broadcaster recharges streaming credits through the PhonePe-backed billing flow defined by [Revenue_Dealership_Engine.md](../Revenue_Dealership_Engine.md).
2. Broadcaster creates a live event with title, schedule, timezone, access mode, and expected duration.
3. On successful validation of prepaid balance, RawDrive reserves the required streaming units and provisions a Cloudflare Stream `live_input`.
4. RTMPS and SRT ingest credentials are masked by default and revealed only through explicit broadcaster actions that are audit-logged.
5. RawDrive generates the public event slug, waiting-room page, invite link, and QR code.

### 3.3 Automatic Session Management
- **Reveal Window:** Ingest credentials should remain hidden by default and become revealable no earlier than T-30 minutes unless an admin policy overrides the window.
- **Idle Start Failure:** If no successful live connection is established within 20 minutes after the scheduled start, the event must move to `failed` and the reservation must be released or refunded according to finance policy.
- **Scheduled End Handling:** Near the end of the reserved block, the broadcaster must be warned about remaining time and overage behavior.
- **Forced End:** If no further balance can be reserved, RawDrive must end the session by disabling the live input or otherwise blocking additional ingest attempts.
- **Manual Stop:** A broadcaster or authorized admin must be able to end the event explicitly; the system must then finalize ledger state and transition the event toward replay processing if enabled.

### 3.4 Multi-Hour Stacking
Photographers may combine multiple same-tier units into a single event reservation.

- Example: an 8-hour event at the 500-viewer tier reserves 8 eligible units.
- The customer-facing event identity remains one event record even when multiple units are reserved beneath it.
- Reservation, consumption, and refund behavior must be traceable per event and per ledger entry.

---

## 4. Functional Requirements

### 4.1 Broadcaster Experience
- Broadcasters must have a dedicated streaming workspace with event list, setup flow, credit balance, recharge entry points, ingest details, health summary, moderation controls, and replay readiness.
- The event detail page must show scheduled status, countdown, live signal state, remaining reserved entitlement, and current viewer count when available.
- The setup UI must include encoder guidance for RTMPS/SRT endpoint, stream key, bitrate guidance, resolution guidance, and audio expectations.
- Broadcasters must be able to manually copy invite links, download QR code assets, and preview the waiting-room page before the event goes live.
- Windows/macOS operators should be able to use the desktop companion for local preflight checks, encoder validation, and source-machine diagnostics without changing the underlying event model.

### 4.2 Viewer Experience
- Before the event goes live, viewers must see a waiting-room state with title, cover image, countdown timer, and event messaging.
- When the event becomes live, the page must transition to playback without requiring a manual refresh.
- After the event ends, the same slug may resolve to a replay view when replay is enabled; otherwise it must resolve to a branded post-event state.
- Playback for protected events must support signed or tokenized access rather than public unrestricted playback.

### 4.3 Interactivity and Moderation
- Live chat and lightweight reactions may be enabled per event.
- If chat is enabled, delivery must be real-time and isolated per event room.
- Moderation controls must support chat disable, message hide or delete, guest mute or ban, and rate limiting.
- Abuse controls must apply to repeated messages, burst reactions, and suspicious sessions.

### 4.4 Analytics and Reporting
- The broadcaster dashboard must show near-real-time live viewer count, event status, and ingest health indicators.
- Post-event reporting should include peak concurrent viewers, unique viewers, minutes watched, chat volume, reaction volume, and geography where supported by the analytics pipeline and privacy policy.
- QR scans, invite-link visits, and waiting-room-to-live conversions should be attributable in RawDrive analytics.

---

## 5. Technical Integration Requirements

### 5.1 Cloudflare Stream Provisioning
- The backend must provision live inputs through Cloudflare Stream `POST /accounts/{account_id}/stream/live_inputs`.
- Live inputs must persist the Cloudflare identifiers required for ingest, playback, recording, and status reconciliation.
- Replay-enabled events must use Cloudflare recording mode so completed broadcasts can be handed off as replay assets.
- RawDrive should use the official Cloudflare Stream player or a supported wrapper around Cloudflare playback rather than a custom media pipeline.
- Professional live broadcasting must rely on a source-side encoder workflow on the broadcaster machine; RawDrive's browser UI is a control surface, not the primary live encoder.
- Supported live source workflows must produce a Cloudflare-compatible ingest profile before transmission reaches Cloudflare Stream.
- The launch support path should prioritize **OBS Studio** on Windows and macOS, with additional encoder workflows introduced only through an explicit support policy.
- RawDrive application servers must not perform customer live encoding, live restream relay, or custom server-side media transformation as part of the standard live path.

### 5.2 Live Event State and Telemetry
- The event state model must support at least: `draft`, `scheduled`, `credit_reserved`, `waiting_room`, `live`, `interrupted`, `completed`, `replay_processing`, `replay_ready`, `cancelled`, and `failed`.
- Frontend clients must receive real-time event-state updates through WebSockets or an equivalent pub/sub layer.
- RawDrive must verify and process Cloudflare live webhook events for connection, disconnection, error, and replay-readiness reconciliation.
- Near-real-time live viewer count may use Cloudflare's live viewer count endpoint when viewer counts are not intentionally hidden.
- Ingest health should be derived from Cloudflare live input status, webhook state, and RawDrive connection history. Do not assume a single Cloudflare live polling field exists for average watch time or ingest bitrate.

### 5.3 Billing and Ledger Integration
- Scheduling a live event must reserve prepaid units before the event is confirmed.
- Starting and completing a valid event must transition reserved units into consumed units.
- Cancellation, idle-start failure, manual refund, and finance adjustments must mutate the ledger idempotently and audibly.
- Recharge flows must return updated balance and reservation outcome in a single user-facing flow so the broadcaster understands whether the event can proceed.

### 5.4 Security and Governance
- Ingest keys must be masked by default, rotated when regenerated, and never returned through public APIs.
- Access-protected events must use signed URLs or equivalent short-lived playback tokens.
- Allowed origins, geofencing, or IP/network restrictions may be applied where commercial policy requires them.
- Content-policy enforcement must be modeled as a RawDrive governance workflow; this specification must not assume automatic Cloudflare copyright or harmful-content termination.

---

## 6. Data Model Requirements

### 6.1 Core Live Entities
- `live_events`: `id`, `workspace_id`, `title`, `slug`, `description`, `cover_asset_id`, `scheduled_start_at`, `scheduled_end_at`, `timezone`, `status`, `access_mode`, `replay_enabled`
- `live_event_delivery`: `event_id`, `cf_live_input_id`, `cf_playback_id`, `cf_recording_id`, `ingest_protocols`, `last_health_status`, `last_webhook_at`
- `viewer_sessions`: `id`, `event_id`, `guest_name`, `session_token`, `ip_hash`, `user_agent`, `joined_at`, `left_at`, `watch_duration_seconds`
- `chat_messages`: `id`, `event_id`, `viewer_session_id`, `guest_name`, `message`, `moderation_status`, `created_at`
- `reaction_events`: `id`, `event_id`, `viewer_session_id`, `reaction_type`, `created_at`

### 6.2 Billing and Reservation Entities
- `streaming_packages`: `id`, `name`, `viewer_limit`, `duration_minutes`, `price_base`, `gst_rate`, `price_total`, `effective_from`, `effective_to`, `coupon_scope`
- `streaming_ledger_entries`: `id`, `workspace_id`, `event_id`, `entry_type`, `units`, `minutes`, `amount_base`, `tax_amount`, `amount_total`, `payment_reference`, `coupon_reference`, `dealer_reference`, `created_at`
- `streaming_reservations`: `id`, `workspace_id`, `event_id`, `package_id`, `reserved_units`, `status`, `expires_at`, `released_at`

### 6.3 Audit Requirements
- Recharge, reservation, refund, ingest-key reveal, moderation, manual adjustment, and admin override actions must write immutable audit entries.

---

## 7. Cross-Document Alignment
- Billing, GST, invoice, and refund logic must align with [Contracts_Billing_GST.md](../Contracts_Billing_GST.md).
- Coupon scope, dealer attribution, and revenue-sharing rules must align with [Revenue_Dealership_Engine.md](../Revenue_Dealership_Engine.md).
- Photographer-facing navigation and permissions must align with [Photographer-Requirements.md](../Photographer-Requirements.md).
- Gallery invite, waiting-room theming, and QR-linked client surfaces must align with [Client_Galleries_PWA.md](../Client_Galleries_PWA.md).
- Shared on-demand video upload, proofing, watermarking, and replay delivery requirements must align with [Video_Transcoding_Delivery.md](Video_Transcoding_Delivery.md).
- Source-machine workflows and Windows/macOS operator requirements must align with [Studio_Desktop_Companion.md](Studio_Desktop_Companion.md).

# Streaming DPDP Compliance (India DPDP Act, 2023)

Feature: F-014 Streaming Commercial v1 (M33–M35).
Jurisdiction: Republic of India — Digital Personal Data Protection Act, 2023.
Document owner: Data Protection Officer (DPO) and Platform Eng Lead.
Status: Draft pending legal sign-off.

## Scope

This document describes how the streaming commercial v1 feature collects,
processes, retains, and protects personal data of client-viewers, workspace
owners (photographers), and workspace staff. It covers every surface that
participates in streaming:

- Preflight join page and viewer JWT minting
  (`backend/internal/streaming/preflight/`).
- Public short-link resolver (`backend/internal/streaming/shortlink/`,
  migration 089).
- Live playback, chat, and reactions (`backend/internal/streaming/handlers/`).
- Playback analytics and retention audit (`streaming_retention_audit`,
  migration 091).
- Recharge checkouts and GST invoices (M32 artifacts — referenced here for
  completeness because viewer PII touches invoices only indirectly, through
  workspace-owner billing).

Out of scope: workspace-owner account management, gallery/photo storage,
and non-streaming features, which are covered by the platform-wide DPDP
policy.

## Personal Data Inventory

| Data element | Surface | Source | Purpose | Storage |
| --- | --- | --- | --- | --- |
| Viewer display name | Preflight form | Data principal input | Show in chat, reactions | `streaming_preflight_sessions` |
| Viewer email (optional) | Preflight form | Data principal input | Post-stream replay access | `streaming_preflight_sessions` |
| Viewer IP address | Edge (Cloudflare) | TCP connection | Abuse prevention, geo analytics | `streaming_shortlink_hits` |
| User-Agent string | Edge (Cloudflare) | HTTP header | Device analytics, debugging | `streaming_shortlink_hits` |
| Viewer JWT | Preflight API | Server-issued | Playback authorization | In-memory + client cookie (not persisted server-side after issue) |
| Chat message content | Chat WebSocket | Data principal input | Display in live chat | `stream_chats` (until archived per migration 092) |
| Reaction events | Playback UI | Data principal input | Aggregate reaction counters | Aggregated counters only; no per-user row retained |
| Watch-time telemetry | Player heartbeat | Player SDK | QoE metrics, billing sanity | Aggregated in `streaming_playback_analytics` |
| Workspace owner name, email, phone | Onboarding | Workspace owner | Account ops, billing, support | `users`, `workspaces` (platform-wide) |
| Workspace owner GSTIN, PAN, billing address | Billing settings | Workspace owner | GST invoice generation | `workspace_billing_profiles` |
| Payer metadata (name, masked instrument) | Razorpay / PhonePe webhook | Payment provider | Reconciliation, fraud review | `recharge_invoices` (M32, migration 088) |

All identifiers above are treated as **personal data** under Section 2(t)
of the DPDP Act. GSTIN and PAN are additionally treated as **financial
identifiers** and attract the stricter retention + access controls
described below.

## Legal Basis per data type

| Data element | Lawful basis (DPDP s.4–7) | Notes |
| --- | --- | --- |
| Viewer display name, email | Consent (s.6) | Captured at preflight with a clear notice; withdrawal resets the viewer session. |
| Viewer IP, User-Agent | Legitimate use — fraud and abuse prevention (s.7(i)) | Retained only in aggregate/short-lived form per retention schedule. |
| Chat content | Consent (s.6) | Consent notice at preflight; moderation + safety exception under s.7(d). |
| Reaction events | Consent (s.6) | Stored only in aggregate; no per-principal row. |
| Watch-time telemetry | Contract performance (s.7(a)) | Required to meter billing and deliver the service. |
| Workspace owner account data | Contract performance (s.7(a)) | Necessary to operate the subscription. |
| GSTIN, PAN, billing address | Legal obligation (s.7(b)) | Required by CGST Rule 46 and IT Act. |
| Payer metadata | Contract performance + legal obligation | Reconciliation and anti-money-laundering. |

## Retention Schedule

Retention is enforced by scheduled jobs that write to
`streaming_retention_audit` (migration 091) on every purge so the audit
trail outlives the purged data.

| Data set | Retention | Enforcement | Audit record |
| --- | --- | --- | --- |
| `streaming_preflight_sessions` | 7 days from creation | Cron purge job, hourly | `streaming_retention_audit` row with `source='preflight_sessions'` |
| `streaming_shortlink_hits` | 180 days from hit | Daily purge | `source='shortlink_hits'` |
| `stream_chats` (live) | 90 days post stream end | Daily purge + archive to `stream_chats_archive` per migration 092 | `source='stream_chats'` |
| `streaming_playback_analytics` (raw) | 13 months; aggregated monthly after 90d | Monthly aggregation job | `source='playback_analytics_aggregation'` |
| `streaming_retention_audit` | Indefinite (append-only) | Never purged — required for DPDP evidence | n/a |
| Viewer JWT | Lifetime of token (max 4h) | Stateless, not persisted server-side after issue | n/a |
| Viewer session analytics (identified) | 30 days | Daily purge | `source='viewer_sessions'` |
| Recharge invoices | 8 years | Statutory (CGST s.36) — see `streaming-gst.md` | n/a |

All timestamps are stored in UTC; retention jobs compute cut-offs in UTC
and log the cut-off with each audit row.

## Data Principal Rights

Rights under DPDP ss.11–15 are exposed through the workspace Settings
page and a public grievance form. SLAs:

| Right | Endpoint / channel | Acknowledge | Fulfil |
| --- | --- | --- | --- |
| Access (s.11) | `GET /api/v1/me/export` (workspace owner); grievance form for viewers | 72 hours | 30 days |
| Correction / completion (s.12) | Workspace Settings -> Profile | 72 hours | 15 days |
| Erasure (s.12) | `POST /api/v1/me/erase`; grievance form for viewers | 72 hours | 30 days |
| Nomination (s.14) | Workspace Settings -> Nominee | 72 hours | 15 days |
| Grievance (s.13) | grievance@rawdrive.live; in-app form | 72 hours | 30 days |

Erasure interacts with retention: invoices and retention audit records are
preserved per legal obligation (DPDP s.17(1)(c)) even when the principal
requests erasure. The principal is informed of this carve-out in the
erasure confirmation email.

### Grievance Officer

Contact details to be filled by Legal before public rollout.

- Name: _TBD_
- Designation: Grievance Officer, RawDrive
- Email: grievance@rawdrive.live
- Address: _TBD_
- Response SLA: 72h acknowledgement, 30-day resolution.

## Consent Management

Viewers see a consent notice on the preflight join page before any
personal data leaves the browser:

- Notice lists the data fields collected, purpose, retention, and the
  grievance officer contact.
- Consent is granular: chat participation and email-for-replay are
  separate opt-ins from the base "join the stream" action.
- Consent artefacts (timestamp, IP, consent version) are stored on the
  `streaming_preflight_sessions` row and travel with the viewer JWT
  claim `consent_version`.
- Withdrawal is one click on the in-player menu; it invalidates the JWT,
  stops chat posting, and enqueues a purge of the preflight session.

Workspace owners provide consent at onboarding and again when enabling
streaming, with a clear reference to this document.

## Cross-Border Data Transfer

Streaming relies on two sub-processors that process data outside India:

| Sub-processor | Service | Regions | Safeguard |
| --- | --- | --- | --- |
| Cloudflare, Inc. | Stream (video), R2 (storage), WAF | Global edge; R2 bucket configured to prefer APAC (Mumbai, Singapore) | DPA executed; Standard Contractual Clauses; Cloudflare is on the Indian government's approved jurisdictions list once published. |
| Cloudflare Stream | Live + VOD | Global edge | Signed URLs; `requireSignedURLs` enforced on every VOD. |

Payment sub-processors (Razorpay, PhonePe) operate within India and do
not constitute cross-border transfers.

Under DPDP s.16, the government may restrict transfers to specific
countries. RawDrive will monitor the notified-countries list and
reconfigure R2 region preferences if any current region is restricted.

## Breach Notification

Applicable to any incident that compromises confidentiality, integrity,
or availability of personal data processed by the streaming feature.

- **Internal notice:** incident commander pages DPO within 1 hour of
  detection via PagerDuty `dpo-primary`.
- **Data Protection Board (DPB) notification:** within 72 hours of
  detection, using the template at `docs/runbooks/incident-response.md`.
- **Affected principal notification:** within 72 hours unless law
  enforcement instructs otherwise; sent to the email on file for
  workspace owners and to viewer emails when available. Template in
  `docs/runbooks/incident-response.md`.
- **Regulator artifacts:** breach timeline, scope, containment,
  remediation, root-cause analysis (RCA) attached to the filing.

Rollback during a breach follows `docs/runbooks/streaming-commercial-v1-
rollback.md` Step 1 (flag-off only) by default; data rollback steps are
avoided so forensic evidence is preserved.

## Data Protection Officer Contact

- Name: _TBD_
- Email: dpo@rawdrive.live
- Postal: _TBD_
- Escalation: DPO -> Legal Counsel -> CEO.

## Audit Trail

Three tables form the audit backbone:

1. `streaming_retention_audit` (migration 091) — append-only record of
   every automated purge: source table, rows affected, cut-off
   timestamp, job run id.
2. `admin_audit` — super-admin actions on streaming settings, flag
   flips, rate-card edits.
3. `auth_events` — login, MFA, consent acceptance events tied to
   workspace owners.

Audit rows are retained indefinitely and replicated to the offsite
backup per `docs/runbooks/disaster-recovery-from-r2.md`.

## Sub-processors List

| Sub-processor | Role | Data categories | Location |
| --- | --- | --- | --- |
| Cloudflare, Inc. | CDN, Stream (live + VOD), R2 storage, WAF | All streaming data in transit; replays and thumbnails at rest | Global edge; storage APAC-preferred |
| Razorpay Software Pvt. Ltd. | Payments (cards, UPI, netbanking) | Payer name, masked instrument, payment metadata | India |
| PhonePe Pvt. Ltd. | Payments (UPI) | Payer VPA, transaction metadata | India |
| Mailpit (dev) / Amazon SES (prod) | Transactional email | Recipient email, message body | India (SES ap-south-1) |
| Hostinger | VPS hosting for app + DB | All platform data at rest | India |

Each sub-processor has an executed DPA covering DPDP Act obligations.
Adding a sub-processor requires DPO approval and a notice to workspace
owners 30 days before routing data to the new vendor.

## Review Cadence

- **Annual review** — DPO and Legal review this document and validate:
  inventory completeness, retention values match production cron jobs,
  sub-processor list is current, grievance contact is reachable.
- **Material-change review** — any change to (a) data collected at
  preflight, (b) retention values, (c) sub-processor list, or (d) flag
  defaults triggers an out-of-cycle review and version bump.
- **Every review** — DPO signs the Revision History block; change
  summary posted to workspace owners via in-app notification at least
  15 days before effect.

## Revision History

| Version | Date | Author | Change | Legal sign-off | DPO sign-off |
| --- | --- | --- | --- | --- | --- |
| 0.1 | 2026-04-14 | Platform Eng | Initial draft aligned to M35 R5 | _pending_ | _pending_ |

# Phase 0 Research — Invitation RSVP System Hardening

**Feature**: 020-invitation-rsvp-hardening  
**Date**: 2026-01-03  
**Status**: Complete (all NEEDS CLARIFICATION resolved)

## Duplicate Prevention & Concurrency
- **Decision**: Enforce a unique index on `(invitation_id, normalized_email)` (lowercased/trimmed) inside a transactional create; add a Redis-backed idempotency key per `invitation_id + email` to short-circuit retries; return structured 409 errors on conflicts.
- **Rationale**: Database uniqueness plus idempotency guarantees race-safe deduplication and deterministic UX even under concurrent submissions.
- **Alternatives considered**: In-memory locks (not distributed), pre-check without constraint (racy), SELECT ... FOR UPDATE around lookups (higher deadlock risk).

## Workspace Isolation & Authorization
- **Decision**: Require `workspace_id` from authenticated context for every RSVP/Invitation query and apply `WHERE invitation.workspace_id = :workspace_id`; reuse guard for dashboard exports/audit fetches; public links resolve only invitations already validated to belong to the workspace.
- **Rationale**: Enforces Constitution Principle IV and FR-001–FR-003; prevents cross-tenant leakage.
- **Alternatives considered**: Client-provided workspace hints (untrusted); post-filtering after broad queries (inefficient, leak-prone).

## Audit Logging
- **Decision**: Use structlog-based audit pipeline to emit immutable events (`action`, `actor_type`, `actor_id`, `workspace_id`, `invitation_id`, `rsvp_id`, `timestamp`, `metadata` sans PII) into `audit_events`; include failed access attempts and export events.
- **Rationale**: Satisfies Constitution VII and FR-007–FR-010 with structured, PII-free auditability.
- **Alternatives considered**: Free-form logs (non-compliant), mutable audit rows (breaks immutability).

## Email Notifications (Confirmation, Edit, Deletion Warnings)
- **Decision**: Reuse SendGrid worker (`services/invitations-service/src/workers/email_worker.py`) with dynamic templates; generate edit links as signed JWTs containing `workspace_id`, `invitation_id`, `rsvp_id`, `nonce`, expiring in 14 days; queue sends with retries/backoff when SendGrid is unavailable.
- **Rationale**: Builds on existing SendGrid integration and queueing so RSVP submission stays fast while notifications remain reliable.
- **Alternatives considered**: SES migration (new infra), DB-backed edit tokens (cleanup burden), synchronous email sending (hurts latency).

## PDF Export Approach
- **Decision**: Generate PDFs server-side with WeasyPrint using a hardened HTML template (no external fetches), streamed via async task; cache artifacts in object storage for 15 minutes; enforce `workspace_id` filters on source queries.
- **Rationale**: Deployment-friendly, keeps styling consistent with web UI, avoids client-side variability.
- **Alternatives considered**: wkhtmltopdf (system dependency), client-side jsPDF/print (inconsistent, untrusted data), ReportLab (heavier layout effort).

## Responsive UI & Theme Support
- **Decision**: Make public invitation portal and dashboard mobile-first with fluid grids and clamp-based typography; use design tokens (`text-text-primary`, `bg-surface`) and Tailwind breakpoints; add theme toggle bound to `prefers-color-scheme` with persisted choice; ensure WCAG AA contrast for both themes.
- **Rationale**: Addresses current responsiveness/theming gaps and aligns with Constitution II & III.
- **Alternatives considered**: Desktop-first layouts (break on small screens), hardcoded colors (break dark mode and tokens).

## Export & Analytics Integrity
- **Decision**: CSV export via streaming query batches; PDF/CSV endpoints paginate/stream to keep memory low; view deduplication keyed by visitor fingerprint + 24h TTL in Redis to satisfy FR-019 without double counting.
- **Rationale**: Streaming keeps latency/memory in check; TTL dedup keeps analytics accurate.
- **Alternatives considered**: Full in-memory materialization (RAM spike), no dedup (inflated metrics).

# Live Streaming Gap Review

## Executive Verdict

RawDrive's livestreaming implementation is currently an M8 skeleton, not the prepaid Cloudflare Stream product described in the PRDs and TRDs. The current code can create a basic stream row, optionally call Cloudflare Stream live input creation, list streams, embed a public iframe, and store simple chat messages. The commercial and operational system around prepaid credits, reservations, recharge, rate cards, calendar/client/CRM linkage, viewer sessions, Cloudflare webhooks, signed playback, ingest governance, replay lifecycle, and analytics is mostly absent.

This document records verified product and architecture gaps for future implementation planning. It is not a code-change report.

## Critical Findings

1. Prepaid livestreaming does not exist yet.

The livestream TRD requires streaming packages, ledger entries, reservations, recharge, reserve-before-provision, consumption, refund, overage handling, and auditable idempotent mutations. The current `StreamService.CreateStream` creates the stream first and only then optionally provisions Cloudflare, with no credit check or ledger dependency. Required tables such as `streaming_packages`, `streaming_ledger_entries`, and `streaming_reservations` are documented but not implemented.

2. Public stream access is insecure for protected events.

The public stream endpoint returns playback data before a protected viewer session exists. PIN verification returns only a boolean and does not issue a signed viewer token or session. Existing stream PIN storage is not aligned with the password/PIN hashing pattern used elsewhere in the app. Protected livestream playback needs tokenized access, signed playback, and session-bound chat/viewer APIs.

3. Cloudflare Stream integration is partial.

The service creates a Cloudflare live input, but does not complete lifecycle operations: update, disable, delete, signed URLs, allowed origins, low-latency settings, retention, webhook reconciliation, replay readiness, status polling, or analytics import. Cloudflare config should also follow the `platform_settings` first, environment fallback second rule.

4. Public chat is under-protected.

Public chat endpoints allow read/post behavior by stream UUID without a verified viewer session, rate limit, slow mode, moderation state, or clear RLS-safe workspace ownership model. Chat messages should carry workspace/event ownership and be protected by the same viewer session used for playback.

5. Dashboard livestream UX is incomplete.

The dashboard needs a full event console: credit balance, recharge, package/duration selection, reservation status, ingest reveal window, RTMPS/SRT setup, QR/invite links, waiting-room preview, health, moderation, replay controls, and analytics.

6. Scheduling, CRM, and client linkage are missing.

The stream model is not first-class in CRM. It lacks contact, deal, client, invoice, booking, calendar event, timezone, expected duration, access policy, and ownership fields. Client profiles and calendar views should surface linked livestream events.

7. Payments and streaming credit recharge are missing.

Streaming credit purchase needs provider checkout, webhook verification, idempotent payment-to-ledger posting, refund handling, GST/invoice linkage, dealer/platform margin treatment, and provider selection according to billing requirements.

8. Rate cards are documented but absent.

Super-admin rate-card management is required for package duration, viewer cap, price, effective dates, and future-purchase-only semantics. Current pricing surfaces do not appear to be backed by admin-managed streaming rate cards.

9. Role enforcement is incomplete.

Team member requirements deny creating live streams and purchasing credits. Stream management routes need finer permission gates beyond generic JWT/tenant middleware.

10. Test coverage is below production readiness.

Needed tests include Cloudflare provisioning, signed playback, PIN/session security, role gates, prepaid ledger idempotency, public chat protection, webhook processing, viewer count, replay lifecycle, calendar/CRM linkage, and Docker Playwright E2E with authenticated dashboard state.

## Recommended Build Order

1. Stabilize security and config: signed viewer sessions, hashed PINs, protected chat, RLS-safe schema, platform settings for Cloudflare, and role gates.

2. Add commercial domain model: live events, event delivery, viewer sessions, chat messages, reaction events, streaming packages, ledger entries, reservations, rate-card versions, and immutable audit records.

3. Build recharge and ledger: PhonePe/Razorpay abstraction, webhook verification, idempotent ledger posting, GST/invoice linkage, margin allocation, reservation/consume/refund/overage calculations, and future-rate-card semantics.

4. Complete Cloudflare control plane: create/update/delete live inputs, recording config, signed URLs, ingest key rotation/reveal audit, webhook receiver, status reconciliation, replay readiness, and analytics import.

5. Build operational UX: `/streams/[id]` dashboard console with setup, ingest reveal, QR/invites, calendar/client/deal links, waiting-room preview, health, viewer count, moderation, replay controls, and credit depletion warnings.

6. Build client/viewer experience: tokenized protected viewing, countdown/waiting-room transition, real-time chat/reactions, viewer count, replay state, and access expiry.

7. Verify with layered tests: backend unit/integration, ledger idempotency, RLS/security, Cloudflare mocked API, payment webhook, and Docker Playwright E2E.

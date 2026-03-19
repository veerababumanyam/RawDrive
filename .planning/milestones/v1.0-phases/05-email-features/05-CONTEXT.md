# Phase 5: Email Features - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire transactional email flows (verification, password reset, invitations, gallery delivery) using the EmailService built in Phase 2. Create HTML templates, integrate with auth and invitation services, and track delivery status via Postal webhooks.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion. Specific targets:

- MAIL-05: Email verification after signup with secure token link
- MAIL-06: Password reset via email with time-limited token
- MAIL-07: Bulk wedding invitation emails through invitations-service
- MAIL-08: HTML email templates for verification, password reset, invitation, gallery delivery
- MAIL-09: Email delivery status tracked in database via Postal webhook callbacks

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/app/services/email_service.py` — EmailService with PostalProvider (Phase 2)
- `backend/src/app/services/postal_client.py` — Postal HTTP API client with retry (Phase 2)
- `backend/src/app/api/v1/webhooks/postal_webhook.py` — Webhook endpoint for delivery tracking (Phase 2)
- `services/invitations-service/` — Invitation management service
- `backend/src/app/services/` — Auth-related services (signup, password reset)

### Established Patterns
- 3-layer architecture: API -> Service -> Repository
- JWT tokens for auth, secure token generation for email links
- EmailService.send() is the single interface for sending
- Postal webhooks already wired for delivery status

### Integration Points
- Auth signup flow needs to trigger verification email
- Password reset endpoint needs to trigger reset email
- Invitations-service needs to call EmailService for bulk sends
- Gallery delivery (Phase 7) will reuse the template pattern established here

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond REQUIREMENTS.md (MAIL-05 through MAIL-09). Templates should be clean HTML with inline CSS for email client compatibility.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

# Phase 2: Email Infrastructure - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy Postal as the email sending infrastructure and create a unified EmailService abstraction that replaces all scattered TODO stubs across the codebase. Configure DNS records for deliverability.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure phase. Specific targets:

- MAIL-01: Deploy Postal container with MariaDB and RabbitMQ in docker-compose
- MAIL-02: Configure SPF, DKIM, DMARC DNS records for sending domain
- MAIL-03: Create EmailService abstraction as single interface replacing 6+ scattered TODO stubs
- MAIL-04: Integrate Postal HTTP API client with retry logic and delivery tracking webhooks

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/app/services/sendgrid_service.py` — existing email service (may be reference for patterns)
- `infrastructure/docker/docker-compose.yml` — existing Docker Compose configuration
- `services/notifications-service/` — notification patterns that email will integrate with

### Established Patterns
- 3-layer architecture: API -> Service -> Repository
- Docker Compose for infrastructure services
- Health check endpoints required: `/health/live`, `/health/ready`
- Prometheus `/metrics` endpoints on all services

### Integration Points
- Email service will be consumed by: verification, password reset, invitations, gallery delivery (Phase 5)
- Postal webhooks will feed delivery status back to the application
- Docker Compose infrastructure stack in `infrastructure/docker/`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase with clear technical targets from REQUIREMENTS.md (MAIL-01 through MAIL-04).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
